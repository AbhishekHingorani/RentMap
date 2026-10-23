// The page: asks the person's name, loads the sheet in one Apps Script call, and shows cards and pins.
import { NOT_GIVEN, formatRupees, listingsFromRows, pinLabel, sortByCost } from "/lib/listings.mjs";
import { STATUSES } from "/lib/columns.mjs";

const NAME_KEY = "rentalMap.personName";

const listEl = document.getElementById("list");
const metaEl = document.getElementById("list-meta");
const whoEl = document.getElementById("who");

const map = L.map("map", { zoomControl: true }).setView([22.5, 79], 5);
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}).addTo(map);
const pinLayer = L.layerGroup().addTo(map);

// --- Who is using this computer ---

function askName() {
  const box = document.getElementById("name-box");
  const input = document.getElementById("name-input");
  return new Promise((resolve) => {
    // Escape would close the box with no name, so keep it open until the person saves.
    box.addEventListener("cancel", (event) => event.preventDefault());
    document.getElementById("name-form").addEventListener("submit", (event) => {
      const name = input.value.trim();
      if (!name) {
        event.preventDefault();
        return;
      }
      localStorage.setItem(NAME_KEY, name);
      resolve(name);
    });
    box.showModal();
  });
}

async function personName() {
  return localStorage.getItem(NAME_KEY) || askName();
}

// --- Talking to the Apps Script ---

async function loadSheet() {
  const config = await (await fetch("/api/config")).json();
  if (!config.appsScriptUrl) {
    throw new Error("No Apps Script address. Put appsScriptUrl in config.json, then start the app again.");
  }
  // text/plain is a CORS simple type, so Chrome sends no preflight. Apps Script answers a preflight with 405.
  const res = await fetch(config.appsScriptUrl, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action: "load" }),
  });
  if (!res.ok) throw new Error(`The Apps Script answered HTTP ${res.status}.`);
  let reply;
  try {
    reply = await res.json();
  } catch {
    // A deploy with "Anyone with Google account" access sends a sign-in page, not JSON.
    throw new Error('The Apps Script did not send JSON. Check that "Who has access" is set to Anyone.');
  }
  if (!reply.ok) throw new Error(`The Apps Script said: ${reply.error}`);
  return reply;
}

// --- Drawing ---

function statusKey(status) {
  return STATUSES.includes(status) ? status.toLowerCase().replace(/\s+/g, "-") : "unknown";
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function ratingText(rating) {
  return rating === null ? NOT_GIVEN : `${Math.round(rating * 10) / 10} / 5`;
}

function card(listing) {
  const item = el("li", "card");
  item.dataset.id = listing.id;

  const photo = el("div", "card-photo");
  if (listing.photo) {
    const img = el("img");
    img.src = listing.photo;
    img.alt = "";
    img.loading = "lazy";
    img.referrerPolicy = "no-referrer";
    img.addEventListener("error", () => {
      img.remove();
      photo.append(el("span", "card-photo-none", "Photo did not load"));
    });
    photo.append(img);
  } else {
    photo.append(el("span", "card-photo-none", "No photo"));
  }

  const body = el("div", "card-body");
  const top = el("div", "card-top");
  top.append(
    el("h2", "card-society", listing.society || NOT_GIVEN),
    el("span", `status status--${statusKey(listing.status)}`, listing.status || NOT_GIVEN),
  );
  const facts = el("p", "card-facts");
  facts.append(
    el("span", "card-config", listing.configuration || NOT_GIVEN),
    el("span", "card-rating", `Rating ${ratingText(listing.overallRating)}`),
  );
  body.append(
    top,
    el("p", "card-locality", listing.locality || NOT_GIVEN),
    el("p", "card-cost", listing.totalCost === null ? `Total ${NOT_GIVEN}` : `${formatRupees(listing.totalCost)} a month`),
    facts,
  );
  if (!listing.spot) body.append(el("p", "card-note", "No map spot yet"));

  item.append(photo, body);
  return item;
}

function pin(listing) {
  const label = el("span", `pin status--${statusKey(listing.status)}`, pinLabel(listing));
  label.title = [listing.society, listing.status].filter(Boolean).join(" · ");
  return L.marker(listing.spot, {
    icon: L.divIcon({ className: "pin-anchor", html: label.outerHTML, iconSize: null }),
    keyboard: false,
  });
}

function render(listings) {
  const sorted = sortByCost(listings);
  listEl.replaceChildren(...sorted.map(card));
  pinLayer.clearLayers();
  const spots = [];
  for (const listing of sorted) {
    if (!listing.spot) continue;
    pin(listing).addTo(pinLayer);
    spots.push(listing.spot);
  }
  if (spots.length) map.fitBounds(spots, { padding: [60, 60], maxZoom: 15 });

  const count = sorted.length;
  metaEl.textContent =
    count === 0
      ? "No listings yet. Add rows to the Tracker tab of the sheet, then reload."
      : `${count} ${count === 1 ? "listing" : "listings"}, lowest monthly cost first`;
}

async function start() {
  // Start the slow sheet load while the person types their name.
  const sheetLoad = loadSheet();
  sheetLoad.catch(() => {});
  const name = await personName();
  whoEl.textContent = `Your name: ${name}`;
  whoEl.hidden = false;
  try {
    const sheet = await sheetLoad;
    render(listingsFromRows(sheet.tracker));
  } catch (err) {
    metaEl.textContent = `Could not load the sheet. ${err.message}`;
    metaEl.classList.add("list-meta--error");
  }
}

start();
