"use strict";

// Reads and writes the three JSON files in the data folder.
// The website calls these functions. The chat tools call them too.
// Files are read on every call, so a saved listing shows up on refresh.

const fs = require("fs");
const path = require("path");

function createStore(dataDir) {
  const farmersFile = path.join(dataDir, "farmers.json");
  const listingsFile = path.join(dataDir, "listings.json");
  const pricesFile = path.join(dataDir, "market_prices.json");

  function readFarmers() {
    return readJson(farmersFile);
  }

  function readListings() {
    return readJson(listingsFile);
  }

  function readPrices() {
    return readJson(pricesFile);
  }

  function listPublicListings() {
    const farmers = readFarmers();
    const listings = readListings();
    return listings
      .map((listing) => toPublicListing(listing, farmerFor(farmers, listing)))
      .sort(compareListings);
  }

  function listMarketPrices(crop) {
    const wanted = crop ? stem(crop) : "";
    return readPrices()
      .filter((row) => !wanted || stem(row.crop) === wanted)
      .map(toPublicPrice);
  }

  function searchListings(raw) {
    const src = raw || {};
    const crop = cleanText(src.crop || src.crop_type, 60);
    if (!crop) {
      return {
        ok: false,
        exact_matches: [],
        closest_alternatives: [],
        message: "Ask which crop the buyer needs, then search again. Do not invent a listing.",
      };
    }

    const budgetRaw = src.max_budget != null ? src.max_budget : src.budget;
    let maxBudget = null;
    if (budgetRaw != null && budgetRaw !== "") {
      maxBudget = optionalNumber(budgetRaw);
      if (maxBudget == null) {
        return {
          ok: false,
          exact_matches: [],
          closest_alternatives: [],
          message: "The budget was not a number. Ask the buyer again. Do not invent a price.",
        };
      }
    }

    const query = {
      crop,
      quantity: positiveOrNull(src.quantity),
      unit: cleanText(src.unit, 40),
      location: cleanText(src.location || src.town || src.preferred_location, 80),
      maxBudget,
      budgetIsTotal: src.budget_is_total === true || String(src.budget_is_total || "").toLowerCase() === "true",
    };

    const farmers = readFarmers();
    const exact = [];
    const alternatives = [];

    for (const listing of readListings()) {
      if (String(listing.status || "").toLowerCase() !== "available") continue;
      if (stem(listing.crop) !== stem(crop)) continue;

      const reasons = [];
      if (query.quantity != null && Number(listing.quantity) < query.quantity) reasons.push("not enough quantity");
      if (query.location && !samePlace(listing.location, query.location)) reasons.push("different location");
      if (query.unit && stem(listing.unit) !== stem(query.unit)) reasons.push("different unit");
      if (query.maxBudget != null && !withinBudget(listing, query)) reasons.push("above budget");

      const view = toSearchResult(listing, farmerFor(farmers, listing), query, reasons);
      if (reasons.length === 0) exact.push(view);
      else alternatives.push(view);
    }

    const found = exact.length > 0;
    return {
      ok: true,
      query: {
        crop: query.crop,
        quantity: query.quantity,
        unit: query.unit || null,
        location: query.location || null,
        max_budget: query.maxBudget,
        budget_is_total: query.budgetIsTotal,
      },
      exact_matches: exact,
      closest_alternatives: found ? [] : alternatives,
      message: found
        ? "These are the only exact matches in the database. Do not add anyone else."
        : alternatives.length
          ? "No exact match. closest_alternatives are real listings of the same crop that miss the quantity, place, unit, or budget. Say they are not an exact match. Do not invent anyone else."
          : "No available listing for that crop. Say so honestly. Do not invent a farmer, a price, or a phone number.",
    };
  }

  function registerListing(raw) {
    const src = raw || {};
    if (!isConfirmed(src.confirmed)) {
      return {
        ok: false,
        saved: false,
        message: "Not saved. Show the farmer the summary and ask them to confirm. Call this tool again with confirmed set to true only after they say yes.",
      };
    }

    const name = cleanText(src.farmer_name || src.name, 80);
    const town = cleanText(src.location || src.town || src.village, 80);
    const province = cleanText(src.province || src.district, 80);
    const location = combineLocation(town, province);
    const crop = cleanText(src.crop || src.crop_type, 60);
    const unit = cleanText(src.unit, 40);
    const priceUnitInput = cleanText(src.price_unit, 40);
    const phone = cleanText(src.phone || src.contact_number, 40);
    const consent = normalizeConsent(src.consent != null ? src.consent : src.contact_consent);
    const quantity = optionalNumber(src.quantity);
    const price = optionalNumber(src.asking_price != null ? src.asking_price : src.price);

    const missing = [];
    if (!name) missing.push("farmer's name");
    if (!location) missing.push("town or village");
    if (!crop) missing.push("crop");
    if (quantity == null || quantity <= 0) missing.push("quantity");
    if (!unit) missing.push("unit");
    if (price == null || price < 0) missing.push("asking price");
    if (!consent) missing.push("consent (Yes or No)");
    if (consent === "Yes" && !phone) missing.push("contact number");
    if (missing.length) {
      return {
        ok: false,
        saved: false,
        missing,
        message: "Not saved. Ask for the missing details, confirm again, then call this tool with confirmed set to true.",
      };
    }

    const farmers = readFarmers();
    const listings = readListings();
    const farmerId = nextId("F", farmers, "farmer_id");
    const listingId = nextId("L", listings, "listing_id");
    const priceUnit = priceUnitInput || `per ${singular(unit)}`;
    const farmer = {
      farmer_id: farmerId,
      name,
      location,
      phone: phone || "",
      consent,
      demo: false,
    };
    const listing = {
      listing_id: listingId,
      farmer_id: farmerId,
      crop,
      quantity,
      unit,
      price,
      price_unit: priceUnit,
      location,
      date_listed: todayISO(),
      status: "Available",
      contact_consent: consent,
      demo: false,
    };

    farmers.push(farmer);
    listings.push(listing);
    try {
      saveBoth(farmersFile, listingsFile, farmers, listings);
    } catch (err) {
      return {
        ok: false,
        saved: false,
        message: "The listing was not saved because the file could not be written. Tell the farmer it failed.",
      };
    }

    const summary = `${name} · ${crop} · ${quantity} ${unit} · ${location} · ${formatKwacha(price)} ${priceUnit}`;
    return {
      ok: true,
      saved: true,
      listing_id: listingId,
      farmer_id: farmerId,
      status: "Available",
      summary,
      demo: false,
      message: `Saved listing ${listingId} as Available. Tell the farmer it is saved and repeat this summary: ${summary}`,
    };
  }

  function getMarketPrices(crop) {
    const reports = listMarketPrices(crop);
    return {
      ok: true,
      count: reports.length,
      reports,
      message: reports.length
        ? "These are the only stored reports. If price is null, say there is no verified price. Quote the source and the date. Do not invent a number. Do not change or delete these reports."
        : "No stored price report for that crop. Say you do not have a verified price. Do not invent one.",
    };
  }

  function getListingContact(listingId) {
    const wanted = cleanText(listingId, 20).toLowerCase();
    const listing = readListings().find((row) => String(row.listing_id || "").toLowerCase() === wanted);
    if (!listing) {
      return {
        ok: false,
        shared: false,
        message: "No listing with that id. Do not invent a phone number.",
      };
    }

    const farmer = farmerFor(readFarmers(), listing);
    const consent = combinedConsent(listing, farmer);
    const demo = Boolean(listing.demo || (farmer && farmer.demo));
    const base = {
      listing_id: listing.listing_id,
      farmer_name: farmer ? farmer.name : "Unknown farmer",
      contact_consent: consent,
      demo,
    };
    if (consent !== "Yes" || !farmer) {
      return {
        ...base,
        ok: false,
        shared: false,
        message: "This farmer has not consented. Do not share a phone number.",
      };
    }
    return {
      ...base,
      ok: true,
      shared: true,
      phone: farmer.phone,
      message: demo
        ? "Consent is Yes. This phone number is fictional demo data. Say that clearly if you share it."
        : "Consent is Yes. You may share this phone number.",
    };
  }

  return {
    listPublicListings,
    listMarketPrices,
    searchListings,
    registerListing,
    getMarketPrices,
    getListingContact,
    paths: { farmersFile, listingsFile, pricesFile },
  };
}

function toPublicListing(listing, farmer) {
  const consent = combinedConsent(listing, farmer);
  return {
    listing_id: listing.listing_id,
    farmer_name: farmer ? farmer.name : "Unknown farmer",
    crop: listing.crop,
    quantity: listing.quantity,
    unit: listing.unit,
    price: listing.price,
    price_unit: listing.price_unit,
    location: listing.location,
    date_listed: listing.date_listed,
    status: listing.status,
    demo: Boolean(listing.demo),
    contact_consent: consent,
    contact_note: consent === "Yes"
      ? "Available upon farmer consent"
      : "Farmer has not consented to share a phone number",
  };
}

function toSearchResult(listing, farmer, query, reasons) {
  const view = toPublicListing(listing, farmer);
  const consent = view.contact_consent;
  if (query.quantity != null) {
    view.requested_quantity = query.quantity;
    view.estimated_total_kwacha = Number(listing.price) * Number(query.quantity);
  }
  view.summary = buildSummary(listing, query, consent);
  view.currency = "ZMW";
  if (listing.demo) view.demo_note = "Fictional demo listing. Say that it is demo data.";
  if (reasons.length) view.why_not_exact = reasons;
  return view;
}

function toPublicPrice(row) {
  const missing = row.price == null || row.price === "";
  return {
    crop: row.crop,
    market: row.market,
    location: row.location,
    price: missing ? null : row.price,
    price_label: missing ? (row.price_label || "Demo only") : null,
    unit: row.unit,
    date: row.date,
    source: row.source,
    price_type: row.price_type,
    demo: Boolean(row.demo),
  };
}

function buildSummary(listing, query, consent) {
  let text = `${listing.crop} – ${listing.location}, ${listing.status} ${listing.quantity} ${listing.unit}, ${formatKwacha(listing.price)} ${listing.price_unit}`;
  if (query.quantity != null) {
    const total = Number(listing.price) * Number(query.quantity);
    const qtyUnit = query.unit || listing.unit;
    text += `, Total for ${query.quantity} ${qtyUnit} ${formatKwacha(total)}`;
  }
  text += consent === "Yes"
    ? ". Contact: available upon farmer consent."
    : ". Contact: farmer has not consented to share a phone number.";
  return text;
}

function withinBudget(listing, query) {
  const price = Number(listing.price);
  if (!Number.isFinite(price)) return false;
  if (query.budgetIsTotal) {
    const qty = query.quantity != null ? query.quantity : 1;
    return price * qty <= query.maxBudget;
  }
  return price <= query.maxBudget;
}

function combinedConsent(listing, farmer) {
  const listingConsent = normalizeConsent(listing && listing.contact_consent);
  const farmerConsent = normalizeConsent(farmer && farmer.consent);
  if (listingConsent === "Yes" && farmerConsent === "Yes") return "Yes";
  return "No";
}

function farmerFor(farmers, listing) {
  return farmers.find((farmer) => farmer.farmer_id === listing.farmer_id) || null;
}

function compareListings(a, b) {
  const rank = { available: 0, reserved: 1, sold: 2 };
  const ar = rank[String(a.status || "").toLowerCase()];
  const br = rank[String(b.status || "").toLowerCase()];
  const aRank = ar == null ? 3 : ar;
  const bRank = br == null ? 3 : br;
  if (aRank !== bRank) return aRank - bRank;
  if (a.date_listed !== b.date_listed) return String(b.date_listed).localeCompare(String(a.date_listed));
  return String(a.listing_id).localeCompare(String(b.listing_id));
}

function normalizeConsent(value) {
  const text = String(value == null ? "" : value).trim().toLowerCase();
  if (text === "yes" || text === "y" || text === "true") return "Yes";
  if (text === "no" || text === "n" || text === "false") return "No";
  return null;
}

function isConfirmed(value) {
  return value === true || String(value == null ? "" : value).trim().toLowerCase() === "true";
}

function combineLocation(town, province) {
  if (town && province && !town.toLowerCase().includes(province.toLowerCase())) {
    return `${town}, ${province}`;
  }
  return town || province || "";
}

function samePlace(a, b) {
  return cleanText(a, 80).toLowerCase() === cleanText(b, 80).toLowerCase();
}

function stem(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return "";
  if (text.endsWith("oes") && text.length > 4) return text.slice(0, -2);
  if (/(ses|xes|ches|shes)$/.test(text) && text.length > 4) return text.slice(0, -2);
  if (text.endsWith("s") && !text.endsWith("ss") && text.length > 3) return text.slice(0, -1);
  return text;
}

function singular(unit) {
  const text = String(unit || "").trim();
  if (text.toLowerCase() === "kg") return text;
  if (/s$/i.test(text) && text.length > 2 && !/ss$/i.test(text)) return text.slice(0, -1);
  return text;
}

function cleanText(value, max) {
  if (value == null) return "";
  return String(value).replace(/\s+/g, " ").trim().slice(0, max);
}

function optionalNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value == null || value === "") return null;
  const match = String(value).replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  if (!match) return null;
  const number = Number(match[0]);
  return Number.isFinite(number) ? number : null;
}

function positiveOrNull(value) {
  const number = optionalNumber(value);
  if (number == null || number <= 0) return null;
  return number;
}

function formatKwacha(amount) {
  const number = Number(amount);
  const fixed = Number.isInteger(number) ? String(number) : number.toFixed(2);
  const [whole, fraction] = fixed.split(".");
  const withCommas = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `K${withCommas}${fraction ? `.${fraction}` : ""}`;
}

function nextId(prefix, rows, key) {
  let max = 0;
  const pattern = new RegExp(`^${prefix}(\\d+)$`, "i");
  for (const row of rows) {
    const match = pattern.exec(String(row[key] || ""));
    if (match) max = Math.max(max, Number(match[1]));
  }
  return prefix + String(max + 1).padStart(3, "0");
}

function todayISO() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, data) {
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.tmp`);
  fs.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  fs.renameSync(tmp, file);
}

function saveBoth(farmersFile, listingsFile, farmers, listings) {
  const previousFarmers = fs.readFileSync(farmersFile, "utf8");
  const previousListings = fs.readFileSync(listingsFile, "utf8");
  try {
    writeJson(farmersFile, farmers);
    writeJson(listingsFile, listings);
  } catch (err) {
    try { fs.writeFileSync(farmersFile, previousFarmers); } catch (_) { /* keep the original if we can */ }
    try { fs.writeFileSync(listingsFile, previousListings); } catch (_) { /* same */ }
    throw err;
  }
}

module.exports = {
  createStore,
  formatKwacha,
  stem,
};
