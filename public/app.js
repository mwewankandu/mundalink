// The page script. It loads listings and prices, and sends chat to our server.
// The server talks to Grok. This file never sees the API key.

const history = [];
let language = "en";
const messagesEl = document.querySelector("#messages");
const form = document.querySelector("#chat-form");
const input = document.querySelector("#chat-input");
const pendingEl = document.querySelector("#chat-pending");
const statusEl = document.querySelector("#chat-status");
const listingCards = document.querySelector("#listing-cards");
const priceCards = document.querySelector("#price-cards");
const chipBox = document.querySelector(".chips");
const sendButton = document.querySelector("#send-button");
let voice = null;

const UI = {
  en: {
    greeting: "Hello. I am MundaLink. Are you a farmer with produce to sell, a buyer looking for crops, or do you want a market price or storage advice?",
    placeholder: "Type a message. Example: I want to sell tomatoes",
    send: "Send",
    chips: [
      ["I want to sell tomatoes", "I want to sell tomatoes"],
      ["Find tomatoes in Chongwe", "I need 10 bags of tomatoes in Chongwe"],
      ["Look for onions", "I need onions in Chongwe"],
      ["Maize price", "What is the market price of maize?"],
    ],
  },
  bem: {
    greeting: "Muli shani. Nine MundaLink. Bushe muli balimi, mulefwaya ukushita, nangu mulefwaya umutengo?",
    placeholder: "Lembeni umulandu. Mwachitsanzo: Ndefwaya ukushitisha amataba ku Chongwe",
    send: "Tumani",
    chips: [
      ["Ndefwaya ukushitisha amataba", "Ndefwaya ukushitisha amataba"],
      ["Amataba ku Lusaka", "Ndefwaya ukushita amataba 10 ku Lusaka"],
      ["Tamati ku Chongwe", "Ndefwaya tamati imitumba 20 ku Chongwe"],
      ["Umutengo wa mataba", "Umutengo wa amataba ni shinga?"],
    ],
  },
  nya: {
    greeting: "Moni. Ndine MundaLink. Kodi ndinu mlimi wogulitsa, wogula, kapena mukufuna mtengo wa msika?",
    placeholder: "Lembani uthenga. Mwachitsanzo: Ndine na matumba 20 ya tomato ku Chongwe",
    send: "Tumizani",
    chips: [
      ["Ndine na matumba 20 ya tomato", "Ndine na matumba 20 ya tomato ku Chongwe"],
      ["Ndifuna tomato ku Chongwe", "Ndifuna matumba 10 ya tomato ku Chongwe"],
      ["Ndifuna anyezi", "Ndifuna anyezi ku Chongwe"],
      ["Mtengo wa chimanga", "Mtengo wa chimanga ndi wotani?"],
    ],
  },
};

document.querySelector("#refresh-listings").addEventListener("click", () => loadListings());
document.querySelector("#refresh-prices").addEventListener("click", () => loadPrices());

form.addEventListener("submit", (event) => {
  event.preventDefault();
  sendMessage(input.value);
});

input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});

chipBox.addEventListener("click", (event) => {
  const button = event.target.closest("[data-prompt]");
  if (!button) return;
  sendMessage(button.dataset.prompt);
});

document.querySelectorAll(".lang-picker button").forEach((button) => {
  button.addEventListener("click", () => applyLanguage(button.dataset.lang));
});

applyLanguage(savedLanguage());
setupVoice();
loadHealth();
loadListings();
loadPrices();

async function loadHealth() {
  try {
    const data = await getJson("/api/health");
    statusEl.textContent = data.message;
  } catch (err) {
    statusEl.textContent = "The server did not answer. Is it still running?";
  }
}

async function loadListings(highlightId) {
  listingCards.innerHTML = "<p class=\"empty\">Loading produce…</p>";
  try {
    const data = await getJson("/api/listings");
    const listings = data.listings || [];
    if (!listings.length) {
      listingCards.innerHTML = "<p class=\"empty\">No produce is listed yet.</p>";
      return;
    }
    listingCards.innerHTML = listings.map((item) => listingCard(item, highlightId)).join("");
  } catch (err) {
    listingCards.innerHTML = "<p class=\"empty\">The produce list could not be loaded.</p>";
  }
}

async function loadPrices() {
  priceCards.innerHTML = "<p class=\"empty\">Loading prices…</p>";
  try {
    const data = await getJson("/api/prices");
    const reports = data.reports || [];
    if (!reports.length) {
      priceCards.innerHTML = "<p class=\"empty\">No price reports are stored yet.</p>";
      return;
    }
    priceCards.innerHTML = reports.map(priceCard).join("");
  } catch (err) {
    priceCards.innerHTML = "<p class=\"empty\">The price list could not be loaded.</p>";
  }
}

function listingCard(item, highlightId) {
  const highlighted = item.listing_id === highlightId ? " just-added" : "";
  const amount = item.price == null ? "Price not set" : `${kwacha(item.price)} ${escapeHtml(item.price_unit || "")}`;
  return `
    <article class="card${highlighted}" id="listing-${escapeHtml(item.listing_id)}">
      <div class="badges">
        ${statusBadge(item.status)}
        ${item.demo ? "<span class=\"badge badge-demo\">Demo data</span>" : "<span class=\"badge badge-live\">Added from chat</span>"}
      </div>
      <h3>${escapeHtml(item.crop)}</h3>
      <p>${escapeHtml(item.quantity)} ${escapeHtml(item.unit)} · ${escapeHtml(item.location)}</p>
      <p class="price">${amount}</p>
      <p>${escapeHtml(item.farmer_name)}</p>
      <p class="muted">${escapeHtml(item.contact_note)}</p>
      <p class="muted">Listed ${escapeHtml(formatDate(item.date_listed))}</p>
    </article>`;
}

function priceCard(report) {
  const amount = report.price == null
    ? escapeHtml(report.price_label || "Demo only")
    : kwacha(report.price);
  const kind = report.price_type === "official" ? "Official purchase price" : "Open market";
  return `
    <article class="card">
      <div class="badges">
        ${report.demo ? "<span class=\"badge badge-demo\">Demo data</span>" : ""}
        <span class="badge badge-wait">${escapeHtml(kind)}</span>
      </div>
      <h3>${escapeHtml(report.crop)}</h3>
      <p>${escapeHtml(report.market)}</p>
      <p class="muted">${escapeHtml(report.location)} · ${escapeHtml(report.unit || "")}</p>
      <p class="price">${amount}</p>
      <p class="muted">Date: ${escapeHtml(formatDate(report.date))}</p>
      <p class="muted">Source: ${escapeHtml(report.source)}</p>
    </article>`;
}

function statusBadge(status) {
  const text = String(status || "Unknown");
  const key = text.toLowerCase();
  const cls = key === "available" ? "badge-ok" : key === "sold" ? "badge-sold" : "badge-wait";
  return `<span class="badge ${cls}">${escapeHtml(text)}</span>`;
}

async function sendMessage(text) {
  const content = String(text || "").trim();
  if (!content || form.dataset.busy === "1") return;
  if (voice) voice.prepareSend();
  const voiceStatus = document.querySelector("#voice-status");
  if (voiceStatus && voiceStatus.textContent === "Listening…") voiceStatus.textContent = "";
  input.value = "";
  history.push({ role: "user", content });
  renderMessages();
  setBusy(true);
  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: history, language }),
    });
    const data = await response.json();
    history.push({ role: "assistant", content: data.reply || "Sorry, I could not get a reply." });
    renderMessages();
    if (data.listingsChanged) await loadListings(data.listingId);
  } catch (err) {
    history.push({ role: "assistant", content: "The server could not be reached. Check that it is still running." });
    renderMessages();
  } finally {
    setBusy(false);
    input.focus();
    const last = history[history.length - 1];
    if (voice && last && last.role === "assistant") voice.speak(last.content);
  }
}

function renderMessages() {
  const welcome = messagesEl.querySelector(".assistant");
  const welcomeHtml = welcome ? welcome.outerHTML : "";
  const rest = history.map((message) => {
    const who = message.role === "user" ? "user" : "assistant";
    return `<article class="bubble ${who}"><p>${formatMessage(message.content)}</p></article>`;
  }).join("");
  messagesEl.innerHTML = welcomeHtml + rest;
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function setBusy(busy) {
  form.dataset.busy = busy ? "1" : "0";
  input.disabled = busy;
  sendButton.disabled = busy;
  chipBox.querySelectorAll("button").forEach((button) => { button.disabled = busy; });
  const mic = document.querySelector("#mic-button");
  if (mic) mic.disabled = busy;
  pendingEl.hidden = !busy;
}

function setupVoice() {
  const api = window.MundaVoice;
  const mic = document.querySelector("#mic-button");
  const speaker = document.querySelector("#speaker-toggle");
  const conversation = document.querySelector("#conversation-toggle");
  const status = document.querySelector("#voice-status");
  const note = document.querySelector("#voice-note");
  if (!api || !mic) return;

  const storage = {
    getItem: function (key) {
      try { return localStorage.getItem(key); } catch (err) { return null; }
    },
    setItem: function (key, value) {
      try { localStorage.setItem(key, value); } catch (err) { /* the choice still works this visit */ }
    },
  };

  voice = api.createVoiceController({
    SpeechRecognition: window.SpeechRecognition || window.webkitSpeechRecognition,
    speechSynthesis: window.speechSynthesis,
    Utterance: window.SpeechSynthesisUtterance,
    storage: storage,
    getLanguage: function () { return language; },
    getVoiceLangs: function () {
      if (!window.speechSynthesis || !window.speechSynthesis.getVoices) return [];
      return window.speechSynthesis.getVoices().map(function (item) { return item.lang; });
    },
    getVoices: function () {
      if (!window.speechSynthesis || !window.speechSynthesis.getVoices) return [];
      return window.speechSynthesis.getVoices();
    },
    getTranscript: function () { return input.value; },
    isBusy: function () { return form.dataset.busy === "1"; },
    onTranscript: function (text) { input.value = text; },
    onFinal: function (text) { sendMessage(text); },
    onStatus: function (text) { status.textContent = text || ""; },
    onNote: function (text) {
      note.hidden = !text;
      if (text) note.textContent = text;
    },
    onConversationListen: function () {
      if (voice && !voice.state().listening) voice.startListening();
    },
    onState: renderVoiceControls,
  });

  const support = voice.supported();
  if (support.recognition) mic.hidden = false;
  else {
    note.hidden = false;
    note.textContent = "This browser cannot use the microphone. Use Chrome or Edge to talk. You can still type.";
  }
  if (support.synthesis) {
    speaker.hidden = false;
    if (support.recognition) conversation.hidden = false;
  }
  renderVoiceControls(voice.state());

  mic.addEventListener("click", function () {
    if (voice.state().listening) voice.stopListening(false);
    else voice.startListening();
  });
  speaker.addEventListener("click", function () { voice.toggleSpeaker(); });
  conversation.addEventListener("click", function () { voice.toggleConversation(); });
}

function renderVoiceControls(state) {
  const mic = document.querySelector("#mic-button");
  const micLabel = document.querySelector("#mic-label");
  const speaker = document.querySelector("#speaker-toggle");
  const conversation = document.querySelector("#conversation-toggle");
  const status = document.querySelector("#voice-status");
  if (mic) {
    mic.classList.toggle("is-listening", state.listening);
    mic.setAttribute("aria-pressed", state.listening ? "true" : "false");
    mic.setAttribute("aria-label", state.listening ? "Stop listening" : "Speak your message");
    if (micLabel) micLabel.textContent = state.listening ? "Stop" : "Speak";
  }
  if (speaker) {
    speaker.setAttribute("aria-pressed", state.speakerOn ? "true" : "false");
    speaker.textContent = state.speakerOn ? "Speaker on" : "Speaker off";
    speaker.setAttribute("aria-label", state.speakerOn ? "Stop reading replies aloud" : "Read replies aloud");
  }
  if (conversation) {
    conversation.setAttribute("aria-pressed", state.conversationOn ? "true" : "false");
    conversation.textContent = state.conversationOn ? "Conversation on" : "Conversation off";
  }
  if (state.listening && status) status.textContent = "Listening…";
}

function savedLanguage() {
  try {
    return sessionStorage.getItem("mundalink-lang") || "en";
  } catch (err) {
    return "en";
  }
}

function applyLanguage(code) {
  language = UI[code] ? code : "en";
  try { sessionStorage.setItem("mundalink-lang", language); } catch (err) { /* the button still works this visit */ }
  const copy = UI[language];
  const greetingEl = document.querySelector("#messages .assistant p");
  if (greetingEl) greetingEl.textContent = copy.greeting;
  input.placeholder = copy.placeholder;
  sendButton.textContent = copy.send;
  chipBox.innerHTML = copy.chips.map(([label, prompt]) => {
    return `<button type="button" data-prompt="${escapeHtml(prompt)}">${escapeHtml(label)}</button>`;
  }).join("");
  document.querySelectorAll(".lang-picker button").forEach((button) => {
    button.setAttribute("aria-pressed", button.dataset.lang === language ? "true" : "false");
  });
  if (voice && window.MundaVoice && voice.supported().recognition) {
    const langs = window.speechSynthesis ? window.speechSynthesis.getVoices().map(function (item) { return item.lang; }) : [];
    const selected = window.MundaVoice.speechChoice(language, langs);
    const note = document.querySelector("#voice-note");
    if (note) {
      note.hidden = !selected.note;
      if (selected.note) note.textContent = selected.note;
    }
  }
}

function formatMessage(text) {
  return escapeHtml(text)
    .split("\n")
    .map((line) => (line.includes(" · ") ? `<span class="summary-card">${line}</span>` : line))
    .join("<br>");
}

function kwacha(amount) {
  const number = Number(amount);
  const fixed = Number.isInteger(number) ? String(number) : number.toFixed(2);
  const [whole, fraction] = fixed.split(".");
  const withCommas = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `K${withCommas}${fraction ? `.${fraction}` : ""}`;
}

function formatDate(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  if (!match) return iso || "No date recorded";
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${Number(match[3])} ${months[Number(match[2]) - 1]} ${match[1]}`;
}

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}
