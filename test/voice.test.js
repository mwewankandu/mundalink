"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { stripForSpeech, speechChoice, createVoiceController } = require("../public/voice");

function memory(seed) {
  const data = Object.assign({}, seed);
  return {
    getItem: function (key) { return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null; },
    setItem: function (key, value) { data[key] = String(value); },
  };
}

class FakeRecognition {
  constructor() { FakeRecognition.last = this; }
  start() { this.started = true; }
  stop() { if (this.onend) this.onend(); }
}

class FakeUtterance {
  constructor(text) { this.text = text; this.lang = ""; }
}

describe("spoken text", () => {
  it("removes markdown, emoji, and keeps the numbers", () => {
    const spoken = stripForSpeech("**Tomatoes** · 20 bags · K250 per bag 🎤");
    assert.equal(spoken, "Tomatoes, 20 bags, K250 per bag");
    assert.equal(stripForSpeech("[Ministry](https://www.agriculture.gov.zm/) price"), "Ministry price");
  });
});

describe("speech language", () => {
  it("uses Zambian English when that voice exists, otherwise British English", () => {
    assert.equal(speechChoice("en", ["en-ZM", "en-GB"]).recognitionLang, "en-ZM");
    assert.equal(speechChoice("en", ["en-US", "en-GB"]).recognitionLang, "en-GB");
    assert.equal(speechChoice("en", []).recognitionLang, "en-ZM");
  });

  it("uses Bemba or Nyanja only when the browser has that voice", () => {
    const bemba = speechChoice("bem", ["bem-ZM"]);
    assert.equal(bemba.recognitionLang, "bem-ZM");
    assert.equal(bemba.recognitionFallback, false);

    const missing = speechChoice("bem", ["en-GB"]);
    assert.equal(missing.recognitionLang, "en-GB");
    assert.equal(missing.recognitionFallback, true);
    assert.match(missing.note, /best in English/);

    const nyanja = speechChoice("nya", ["ny-MW"]);
    assert.equal(nyanja.recognitionLang, "ny-MW");
    const nyanjaMissing = speechChoice("nya", []);
    assert.equal(nyanjaMissing.recognitionLang, "en-GB");
    assert.match(nyanjaMissing.note, /Nyanja/);
  });
});

describe("voice controls", () => {
  it("fills the text when listening stops and remembers the speaker", () => {
    const storage = memory();
    const finals = [];
    const statuses = [];
    const voice = createVoiceController({
      SpeechRecognition: FakeRecognition,
      speechSynthesis: { speak: function () {}, cancel: function () {} },
      Utterance: FakeUtterance,
      storage: storage,
      getTranscript: function () { return "I want to sell tomatoes"; },
      onTranscript: function () {},
      onFinal: function (text) { finals.push(text); },
      onStatus: function (text) { statuses.push(text); },
    });

    assert.equal(voice.supported().recognition, true);
    voice.startListening();
    assert.equal(statuses.includes("Listening…"), true);
    FakeRecognition.last.onresult({ results: [[{ transcript: "I want to sell tomatoes" }]] });
    voice.stopListening(false);
    assert.deepEqual(finals, ["I want to sell tomatoes"]);

    voice.toggleSpeaker();
    assert.equal(voice.state().speakerOn, true);
    assert.equal(storage.getItem("mundalink-speaker"), "on");
    const again = createVoiceController({
      SpeechRecognition: FakeRecognition,
      speechSynthesis: { speak: function () {}, cancel: function () {} },
      Utterance: FakeUtterance,
      storage: storage,
      getTranscript: function () { return ""; },
      onFinal: function () {},
    });
    assert.equal(again.state().speakerOn, true);
  });

  it("does not send when the microphone permission is denied", () => {
    const finals = [];
    let status = "";
    const voice = createVoiceController({
      SpeechRecognition: FakeRecognition,
      speechSynthesis: { speak: function () {}, cancel: function () {} },
      Utterance: FakeUtterance,
      storage: memory(),
      getTranscript: function () { return "tomatoes"; },
      onFinal: function (text) { finals.push(text); },
      onStatus: function (text) { status = text; },
    });
    voice.startListening();
    FakeRecognition.last.onerror({ error: "not-allowed" });
    FakeRecognition.last.onend();
    assert.deepEqual(finals, []);
    assert.match(status, /permission was blocked/);
  });

  it("reads a reply without emoji and listens again in conversation mode", () => {
    const synth = {
      last: null,
      speak: function (utterance) { this.last = utterance; },
      cancel: function () {},
    };
    let listened = 0;
    const voice = createVoiceController({
      SpeechRecognition: FakeRecognition,
      speechSynthesis: synth,
      Utterance: FakeUtterance,
      storage: memory({ "mundalink-speaker": "on", "mundalink-conversation": "on" }),
      getLanguage: function () { return "en"; },
      getVoiceLangs: function () { return ["en-ZM"]; },
      getVoices: function () { return [{ lang: "en-ZM" }]; },
      getTranscript: function () { return ""; },
      onFinal: function () {},
      onConversationListen: function () { listened += 1; },
    });
    assert.equal(voice.state().conversationOn, true);
    voice.speak("**Tomatoes** · 20 bags 🎤");
    assert.equal(synth.last.text, "Tomatoes, 20 bags");
    assert.equal(synth.last.lang, "en-ZM");
    synth.last.onend();
    assert.equal(listened, 1);

    voice.prepareSend();
    if (synth.last.onend) synth.last.onend();
    assert.equal(listened, 1);
  });

  it("turns the speaker on with conversation mode, and off again", () => {
    const voice = createVoiceController({
      SpeechRecognition: FakeRecognition,
      speechSynthesis: { speak: function () {}, cancel: function () {} },
      Utterance: FakeUtterance,
      storage: memory(),
      getTranscript: function () { return ""; },
      onFinal: function () {},
    });
    voice.toggleConversation();
    assert.equal(voice.state().conversationOn, true);
    assert.equal(voice.state().speakerOn, true);
    voice.toggleSpeaker();
    assert.equal(voice.state().speakerOn, false);
    assert.equal(voice.state().conversationOn, false);
  });
});
