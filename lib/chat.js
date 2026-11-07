"use strict";

// Talks to Grok and runs the database tools the model asks for.
// The key stays on the server. The browser never sees it.

const { SYSTEM_PROMPT } = require("./prompt");

const CHAT_URL = "https://api.x.ai/v1/chat/completions";
const MAX_TOOL_STEPS = 5;

const NO_KEY_MESSAGE = "The chat assistant is not connected yet. Add your xAI API key as XAI_API_KEY in a .env file (see .env.example), then restart the server. Listings and market prices on this page still work without a key.";

const TOOLS = [
  {
    type: "function",
    function: {
      name: "register_farmer_listing",
      description: "Save a new farmer and an Available produce listing in the MundaLink database. Call this only after the farmer has confirmed the summary. If confirmed is not true, nothing is saved. Never tell the farmer the listing was saved unless this tool returns saved true and a listing_id.",
      parameters: {
        type: "object",
        properties: {
          farmer_name: { type: "string", description: "The farmer's name." },
          province: { type: "string", description: "Province or district, if the farmer gave one." },
          location: { type: "string", description: "Town or village, for example Chongwe." },
          crop: { type: "string", description: "Crop type, for example tomatoes." },
          quantity: { type: "number", description: "How much is available." },
          unit: { type: "string", description: "Unit such as bags, kg, tonnes, or crates." },
          asking_price: { type: "number", description: "Asking price in Zambian kwacha, without the K." },
          price_unit: { type: "string", description: "What the price is for, for example per bag." },
          phone: { type: "string", description: "Contact number. Use a demo number if this is a practice run." },
          consent: { type: "string", enum: ["Yes", "No"], description: "Yes if the farmer agrees the number may be shared with buyers. No otherwise." },
          confirmed: { type: "boolean", description: "True only after the farmer has agreed the summary is correct." },
        },
        required: ["farmer_name", "location", "crop", "quantity", "unit", "asking_price", "consent", "confirmed"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_listings",
      description: "Search real Available listings by crop, quantity, location, and budget. Phone numbers are never included. Match priority is crop, then enough quantity, then location, then price within budget. If there is no exact match, use closest_alternatives and say they are not exact. Never invent a farmer or a price.",
      parameters: {
        type: "object",
        properties: {
          crop: { type: "string", description: "Crop the buyer wants." },
          quantity: { type: "number", description: "How much the buyer wants. Omit if they did not say." },
          unit: { type: "string", description: "Unit the buyer used, such as bags. Omit if they did not say." },
          location: { type: "string", description: "Preferred town or district only, for example Chongwe." },
          max_budget: { type: "number", description: "Maximum kwacha the buyer will pay per unit. Omit if they did not give a budget." },
          budget_is_total: { type: "boolean", description: "Set true only when max_budget is the total for the whole quantity, not the price per unit." },
        },
        required: ["crop"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_market_prices",
      description: "Read stored market price reports. Reports may be demo placeholders with a null price. Never invent a kwacha amount that is not in the result. Never overwrite or delete a report. Include the source, market, location, unit, date, and whether it is an official or open-market price.",
      parameters: {
        type: "object",
        properties: {
          crop: { type: "string", description: "Crop to look up. Omit to return every stored report." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_listing_contact",
      description: "Get one farmer's phone number. Returns the number only when that farmer's consent is Yes. If consent is No, do not guess a number. Public listings must still hide the number.",
      parameters: {
        type: "object",
        properties: {
          listing_id: { type: "string", description: "Listing id such as L001." },
        },
        required: ["listing_id"],
      },
    },
  },
];

async function runChat({ store, messages, apiKey, model, fetchImpl }) {
  const history = cleanHistory(messages);
  if (!history.some((message) => message.role === "user")) {
    return { ok: false, reply: "Type a message to start. You can say you want to sell produce, buy produce, or ask for a price.", listingsChanged: false };
  }

  const key = String(apiKey || "").trim();
  if (!key) {
    return { ok: false, chatReady: false, reply: NO_KEY_MESSAGE, listingsChanged: false };
  }

  const conversation = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history,
  ];
  let listingsChanged = false;
  let listingId = null;

  try {
    for (let step = 0; step < MAX_TOOL_STEPS; step += 1) {
      const response = await fetchImpl(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: model || "grok-4.7",
          messages: conversation,
          tools: TOOLS,
          tool_choice: "auto",
        }),
        signal: AbortSignal.timeout(90000),
      });

      if (!response.ok) {
        const detail = safeSnippet(await response.text(), key);
        return {
          ok: false,
          reply: `The assistant could not reach the Grok API (HTTP ${response.status}). Nothing was changed. ${detail}`.trim(),
          listingsChanged: false,
        };
      }

      const data = await response.json();
      const message = data && data.choices && data.choices[0] && data.choices[0].message;
      if (!message) {
        return { ok: false, reply: "The assistant got an empty response from the API. Nothing was changed. Please try again.", listingsChanged: false };
      }

      const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
      if (toolCalls.length === 0) {
        const reply = messageText(message).trim();
        return {
          ok: true,
          reply: reply || "I could not produce a reply. Please try again.",
          listingsChanged,
          listingId,
        };
      }

      conversation.push(message);
      for (const call of toolCalls) {
        const name = call && call.function && call.function.name;
        const parsed = parseArgs(call && call.function && call.function.arguments);
        const result = parsed.ok
          ? executeTool(store, name, parsed.value)
          : { ok: false, saved: false, error: "Could not read the tool arguments. Nothing was changed." };
        if (result && result.saved) {
          listingsChanged = true;
          listingId = result.listing_id || listingId;
        }
        conversation.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(result),
        });
      }
    }
  } catch (err) {
    return {
      ok: false,
      reply: "The assistant could not reach the Grok API. Check the internet connection and the API key. Nothing was saved.",
      listingsChanged: false,
    };
  }

  return {
    ok: false,
    reply: "The assistant took too many steps and stopped. Nothing else was changed. Please try a shorter question.",
    listingsChanged,
    listingId,
  };
}

function executeTool(store, name, args) {
  try {
    if (name === "register_farmer_listing") return store.registerListing(args);
    if (name === "search_listings") return store.searchListings(args);
    if (name === "get_market_prices") return store.getMarketPrices(args && args.crop);
    if (name === "get_listing_contact") return store.getListingContact(args && (args.listing_id || args.listingId));
    return { ok: false, saved: false, error: `Unknown tool: ${name || "missing name"}. Nothing was changed.` };
  } catch (err) {
    return { ok: false, saved: false, error: "The database operation failed. Do not tell the user it succeeded." };
  }
}

function cleanHistory(messages) {
  const cleaned = [];
  for (const message of Array.isArray(messages) ? messages : []) {
    if (!message || (message.role !== "user" && message.role !== "assistant")) continue;
    if (typeof message.content !== "string") continue;
    const content = message.content.trim().slice(0, 2000);
    if (!content) continue;
    cleaned.push({ role: message.role, content });
  }
  return cleaned.slice(-30);
}

function parseArgs(raw) {
  if (raw && typeof raw === "object") return { ok: true, value: raw };
  if (raw == null || raw === "") return { ok: true, value: {} };
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, value: {} };
    return { ok: true, value };
  } catch (err) {
    return { ok: false, value: {} };
  }
}

function messageText(message) {
  if (!message) return "";
  if (typeof message.content === "string") return message.content;
  if (Array.isArray(message.content)) {
    return message.content.map((part) => (part && (part.text || part.content)) || "").join("");
  }
  return "";
}

function safeSnippet(text, apiKey) {
  let out = String(text || "").replace(/\s+/g, " ").trim().slice(0, 180);
  if (apiKey) out = out.split(apiKey).join("[key hidden]");
  return out;
}

module.exports = {
  runChat,
  executeTool,
  TOOLS,
  CHAT_URL,
  NO_KEY_MESSAGE,
};
