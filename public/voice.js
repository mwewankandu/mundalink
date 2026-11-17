// Browser speech helpers. No network calls of our own.
// Chrome and Edge provide SpeechRecognition. speechSynthesis reads replies aloud.

(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.MundaVoice = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function stripForSpeech(text) {
    return String(text || "")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/https?:\/\/\S+/g, "")
      .replace(/[*_~`#]/g, "")
      .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, "")
      .replace(/\s*[·•]\s*/g, ", ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function hasLang(langs, prefix) {
    const wanted = String(prefix || "").toLowerCase();
    return (langs || []).some((lang) => {
      const value = String(lang || "").toLowerCase();
      return value === wanted || value.startsWith(wanted + "-");
    });
  }

  // English prefers a Zambian accent, then British English.
  // Bemba and Nyanja are used only when the browser lists a matching voice.
  function speechChoice(language, voiceLangs) {
    const langs = voiceLangs || [];
    if (language === "bem") {
      if (hasLang(langs, "bem")) {
        return { recognitionLang: "bem-ZM", synthesisLang: "bem-ZM", recognitionFallback: false, note: "" };
      }
      return {
        recognitionLang: "en-GB",
        synthesisLang: "en-GB",
        recognitionFallback: true,
        note: "Voice works best in English. This browser has no Bemba speech recognition, so the mic listens in English.",
      };
    }
    if (language === "nya") {
      if (hasLang(langs, "ny")) {
        return { recognitionLang: "ny-MW", synthesisLang: "ny-MW", recognitionFallback: false, note: "" };
      }
      return {
        recognitionLang: "en-GB",
        synthesisLang: "en-GB",
        recognitionFallback: true,
        note: "Voice works best in English. This browser has no Nyanja speech recognition, so the mic listens in English.",
      };
    }
    if (hasLang(langs, "en-ZM")) {
      return { recognitionLang: "en-ZM", synthesisLang: "en-ZM", recognitionFallback: false, note: "" };
    }
    if (langs.length === 0) {
      return { recognitionLang: "en-ZM", synthesisLang: "en-ZM", recognitionFallback: false, note: "" };
    }
    return { recognitionLang: "en-GB", synthesisLang: "en-GB", recognitionFallback: false, note: "" };
  }

  function pickVoice(voices, lang) {
    const wanted = String(lang || "").toLowerCase();
    const list = voices || [];
    return list.find((voice) => String(voice.lang || "").toLowerCase() === wanted)
      || list.find((voice) => String(voice.lang || "").toLowerCase().startsWith(wanted.slice(0, 2) + "-"))
      || null;
  }

  function createVoiceController(options) {
    const storage = options.storage || { getItem: function () { return null; }, setItem: function () {} };
    const Recognition = options.SpeechRecognition;
    const synth = options.speechSynthesis;
    let speakerOn = storage.getItem("mundalink-speaker") === "on";
    let conversationOn = storage.getItem("mundalink-conversation") === "on";
    if (conversationOn) speakerOn = true;

    let recognition = null;
    let listening = false;
    let discard = false;
    let speakToken = 0;

    function supported() {
      return {
        recognition: typeof Recognition === "function",
        synthesis: Boolean(synth && typeof synth.speak === "function"),
      };
    }

    function state() {
      return { speakerOn: speakerOn, conversationOn: conversationOn, listening: listening, supported: supported() };
    }

    function persist() {
      storage.setItem("mundalink-speaker", speakerOn ? "on" : "off");
      storage.setItem("mundalink-conversation", conversationOn ? "on" : "off");
    }

    function emit() {
      if (options.onState) options.onState(state());
    }

    function choice() {
      return speechChoice(options.getLanguage ? options.getLanguage() : "en", options.getVoiceLangs ? options.getVoiceLangs() : []);
    }

    function cancelSpeech() {
      speakToken += 1;
      if (synth && typeof synth.cancel === "function") synth.cancel();
    }

    function stopListening(shouldDiscard) {
      discard = Boolean(shouldDiscard);
      if (recognition && listening) {
        try { recognition.stop(); } catch (err) { listening = false; }
      }
    }

    function startListening() {
      if (!supported().recognition || listening) return;
      cancelSpeech();
      discard = false;
      const selected = choice();
      if (options.onNote) options.onNote(selected.note);
      recognition = new Recognition();
      recognition.lang = selected.recognitionLang;
      recognition.interimResults = true;
      recognition.continuous = false;
      recognition.onresult = function (event) {
        let text = "";
        const results = event.results || [];
        for (let i = 0; i < results.length; i += 1) {
          text += results[i][0].transcript;
        }
        if (options.onTranscript) options.onTranscript(text);
      };
      recognition.onerror = function (event) {
        const code = event && event.error;
        if (code === "not-allowed" || code === "service-not-allowed") {
          discard = true;
          if (options.onStatus) options.onStatus("Microphone permission was blocked. Allow the mic for this site, or type your message.");
        } else if (code === "language-not-supported") {
          discard = true;
          if (options.onNote) options.onNote("Voice works best in English. Listening in English instead.");
        } else if (code === "no-speech" || code === "aborted") {
          discard = true;
          if (options.onStatus) options.onStatus("");
        } else if (options.onStatus) {
          options.onStatus("The microphone stopped. You can type instead.");
          discard = true;
        }
      };
      recognition.onend = function () {
        listening = false;
        emit();
        const text = options.getTranscript ? options.getTranscript() : "";
        const keep = !discard;
        discard = false;
        if (keep && String(text || "").trim() && !(options.isBusy && options.isBusy())) {
          options.onFinal(String(text).trim());
        } else if (options.onStatus && !listening) {
          /* leave a permission message in place when one was set */
        }
      };
      try {
        recognition.start();
        listening = true;
        if (options.onStatus) options.onStatus("Listening…");
        emit();
      } catch (err) {
        listening = false;
        if (options.onStatus) options.onStatus("The microphone could not start. You can type instead.");
        emit();
      }
    }

    function speak(text) {
      if (!speakerOn || !supported().synthesis || !options.Utterance) return;
      const spoken = stripForSpeech(text);
      if (!spoken) return;
      cancelSpeech();
      const token = speakToken;
      const Utterance = options.Utterance;
      const utter = new Utterance(spoken);
      const selected = choice();
      utter.lang = selected.synthesisLang;
      const match = pickVoice(options.getVoices ? options.getVoices() : [], selected.synthesisLang);
      if (match) utter.voice = match;
      utter.onend = function () {
        if (token !== speakToken) return;
        if (conversationOn && options.onConversationListen) options.onConversationListen();
      };
      synth.speak(utter);
    }

    function toggleSpeaker() {
      speakerOn = !speakerOn;
      if (!speakerOn) {
        conversationOn = false;
        cancelSpeech();
      }
      persist();
      emit();
    }

    function toggleConversation() {
      conversationOn = !conversationOn;
      if (conversationOn) speakerOn = true;
      else cancelSpeech();
      persist();
      emit();
    }

    function prepareSend() {
      stopListening(true);
      cancelSpeech();
    }

    return {
      startListening: startListening,
      stopListening: stopListening,
      speak: speak,
      toggleSpeaker: toggleSpeaker,
      toggleConversation: toggleConversation,
      prepareSend: prepareSend,
      state: state,
      supported: supported,
    };
  }

  return {
    stripForSpeech: stripForSpeech,
    speechChoice: speechChoice,
    pickVoice: pickVoice,
    createVoiceController: createVoiceController,
  };
});
