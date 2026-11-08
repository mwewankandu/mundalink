// The page script. It loads listings and prices, and sends chat to our server.
// The server talks to Grok. This file never sees the API key.

const history = [];
const messagesEl = document.querySelector("#messages");
const form = document.querySelector("#chat-form");
const input = document.querySelector("#chat-input");
const pendingEl = document.querySelector("#chat-pending");
const statusEl = document.querySelector("#chat-status");
const listingCards = document.querySelector("#listing-cards");
const priceCards = document.querySelector("#price-cards");
const chips = document.querySelectorAll("[data-prompt]");

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

chips.forEach((button) => {
  button.addEventListener("click", () => sendMessage(button.dataset.prompt));
});

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
  input.value = "";
  history.push({ role: "user", content });
  renderMessages();
  setBusy(true);
  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: history }),
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
  form.querySelector("button").disabled = busy;
  chips.forEach((button) => { button.disabled = busy; });
  pendingEl.hidden = !busy;
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
