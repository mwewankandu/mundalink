"use strict";

// MundaLink web server.
// Run: node server.js
// Then open http://localhost:3000

const http = require("http");
const fs = require("fs");
const path = require("path");
const { createStore } = require("./lib/store");
const { runChat } = require("./lib/chat");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  const lines = fs.readFileSync(file, "utf8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function createApp(options = {}) {
  const root = __dirname;
  const dataDir = options.dataDir || path.join(root, "data");
  const publicDir = path.resolve(options.publicDir || path.join(root, "public"));
  const store = options.store || createStore(dataDir);
  const apiKey = String(options.apiKey !== undefined ? options.apiKey : (process.env.XAI_API_KEY || "")).trim();
  const model = options.model || process.env.XAI_MODEL || "grok-4.7";
  const fetchImpl = options.fetchImpl || globalThis.fetch.bind(globalThis);

  async function handle(req, res) {
    const url = new URL(req.url || "/", "http://127.0.0.1");

    if (req.method === "GET" && url.pathname === "/api/health") {
      return sendJson(res, 200, {
        ok: true,
        name: "MundaLink",
        chatReady: Boolean(apiKey),
        model,
        message: apiKey
          ? "Chat is ready."
          : "Chat is off until you add XAI_API_KEY. Listings and prices still work.",
      });
    }

    if (req.method === "GET" && url.pathname === "/api/listings") {
      return sendJson(res, 200, { ok: true, listings: store.listPublicListings() });
    }

    if (req.method === "GET" && url.pathname === "/api/prices") {
      return sendJson(res, 200, { ok: true, reports: store.listMarketPrices() });
    }

    if (req.method === "POST" && url.pathname === "/api/chat") {
      const raw = await readBody(req);
      let body;
      try {
        body = JSON.parse(raw || "{}");
      } catch (err) {
        return sendJson(res, 400, { ok: false, reply: "That chat message could not be read. Please try again." });
      }
      const result = await runChat({
        store,
        messages: body.messages,
        apiKey,
        model,
        fetchImpl,
      });
      return sendJson(res, 200, result);
    }

    if (req.method === "GET") {
      const filePath = safePublicPath(publicDir, url.pathname);
      if (!filePath) return sendText(res, 400, "Bad path");
      if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        return sendHtml(res, 404, "<!doctype html><title>Not found</title><p>That page is not on MundaLink. <a href=\"/\">Go home</a>.</p>");
      }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, {
        "Content-Type": MIME[ext] || "application/octet-stream",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      fs.createReadStream(filePath).pipe(res);
      return;
    }

    sendJson(res, 404, { ok: false, error: "Not found" });
  }

  function listen(port = 0) {
    const server = http.createServer((req, res) => {
      handle(req, res).catch((err) => {
        console.error(err);
        if (!res.headersSent) sendJson(res, 500, { ok: false, error: "Something went wrong on the server." });
      });
    });
    return new Promise((resolve) => {
      server.listen(port, "127.0.0.1", () => resolve(server));
    });
  }

  return { handle, listen, store };
}

function safePublicPath(publicDir, pathname) {
  let rel;
  try {
    rel = decodeURIComponent(pathname || "/");
  } catch (err) {
    return null;
  }
  if (rel.includes("\0")) return null;
  if (rel === "/") rel = "/index.html";
  const full = path.resolve(publicDir, `.${rel}`);
  if (full !== publicDir && !full.startsWith(`${publicDir}${path.sep}`)) return null;
  return full;
}

function readBody(req, limit = 1_000_000) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error("Body too large"), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(payload);
}

function sendText(res, status, text) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}

function sendHtml(res, status, html) {
  res.writeHead(status, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}

if (require.main === module) {
  loadEnv(path.join(__dirname, ".env"));
  const port = Number(process.env.PORT) || 3000;
  const app = createApp();
  app.listen(port).then(() => {
    console.log(`MundaLink is running at http://localhost:${port}`);
    if (String(process.env.XAI_API_KEY || "").trim()) {
      console.log(`Chat model: ${process.env.XAI_MODEL || "grok-4.7"}`);
    } else {
      console.log("Chat is off until you set XAI_API_KEY in .env. Listings and prices still work.");
    }
  });
}

module.exports = { createApp, loadEnv, safePublicPath };
