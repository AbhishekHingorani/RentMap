// The page: asks the person's name, loads the sheet in one Apps Script call, and shows cards and pins.
// A click on a card or a pin opens the listing details. The filter bar narrows the list and the map.
import {
  NOT_GIVEN,
  formatRating,
  formatRupees,
  listingsFromRows,
  pinLabel,
  settingsFromRows,
  sortByCost,
} from "/lib/listings.mjs";
import { STATUSES } from "/lib/columns.mjs";
import { CONFIGURATIONS, budgetFrom, filterListings, isOverBudget, startFilters } from "/lib/filters.mjs";
import { allFields, fieldText, isRoughPin, photoLinks } from "/lib/details.mjs";

const NAME_KEY = "rentalMap.personName";

const listEl = document.getElementById("list");
const metaEl = document.getElementById("list-meta");
const whoEl = document.getElementById("who");
const listViewEl = document.getElementById("list-view");
const detailsEl = document.getElementById("details");
const filtersEl = document.getElementById("filters");

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

// Everything the screen shows comes from here. Filters live only in memory, so they reset each time the app opens.
const state = {
  listings: [],
  budget: null,
  filters: startFilters(null),
  pickedId: null,
  markers: new Map(),
  roughCircle: null,
  listScroll: 0,
};

// How far a rough pin may be from the home. The spec does not give a size, so these are a fair guess.
const ROUGH_PIN_RADIUS_M = { society: 250, locality: 1500 };

function statusKey(status) {
  return STATUSES.includes(status) ? status.toLowerCase().replace(/\s+/g, "-") : "unknown";
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function statusTag(status) {
  return el("span", `status status--${statusKey(status)}`, status || NOT_GIVEN);
}

function photoImg(src, holder) {
  const img = el("img");
  img.src = src;
  img.alt = "";
  img.loading = "lazy";
  img.referrerPolicy = "no-referrer";
  img.addEventListener("error", () => {
    img.remove();
    holder.append(el("span", "photo-none", "Photo did not load"));
  });
  return img;
}

function card(listing) {
  const item = el("li", "card");
  item.dataset.id = listing.id;

  const photo = el("div", "card-photo");
  if (listing.photo) photo.append(photoImg(listing.photo, photo));
  else photo.append(el("span", "photo-none", "No photo"));

  // The button covers the whole card, so a click anywhere on it opens the details.
  const open = el("button", "card-open", listing.society || NOT_GIVEN);
  open.type = "button";
  open.addEventListener("click", () => openDetails(listing.id));
  const society = el("h2", "card-society");
  society.append(open);

  const body = el("div", "card-body");
  const top = el("div", "card-top");
  top.append(society, statusTag(listing.status));
  const facts = el("p", "card-facts");
  facts.append(
    el("span", "card-config", listing.configuration || NOT_GIVEN),
    el("span", "card-rating", `Rating ${formatRating(listing.overallRating)}`),
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

function pinIcon(listing, picked) {
  const label = el("span", `pin status--${statusKey(listing.status)}${picked ? " pin--picked" : ""}`, pinLabel(listing));
  label.title = [listing.society, listing.status].filter(Boolean).join(" · ");
  return L.divIcon({ className: "pin-anchor", html: label.outerHTML, iconSize: null });
}

function pin(listing) {
  const marker = L.marker(listing.spot, { icon: pinIcon(listing, false), keyboard: false });
  marker.on("click", () => openDetails(listing.id));
  return marker;
}

// Shows the cards and pins that the filters let through.
function renderList() {
  const shown = filterListings(state.listings, state.filters);
  listEl.replaceChildren(...shown.map(card));
  pinLayer.clearLayers();
  state.markers.clear();
  for (const listing of shown) {
    if (!listing.spot) continue;
    const marker = pin(listing).addTo(pinLayer);
    state.markers.set(listing.id, marker);
  }

  const total = state.listings.length;
  metaEl.textContent =
    total === 0
      ? "No listings yet. Add rows to the Tracker tab of the sheet, then reload."
      : `${shown.length} of ${total} ${total === 1 ? "listing" : "listings"} shown`;
}

// --- Filters ---

function setUpFilters() {
  const max = document.getElementById("filter-max");
  const search = document.getElementById("filter-search");
  const shortlisted = document.getElementById("filter-shortlisted");
  const rejected = document.getElementById("filter-rejected");
  const configs = document.getElementById("filter-configs");

  max.value = state.filters.maxCost === null ? "" : String(state.filters.maxCost);
  configs.replaceChildren(
    ...CONFIGURATIONS.map((configuration) => {
      const label = el("label", "filter-config");
      const box = el("input");
      box.type = "checkbox";
      box.value = configuration;
      box.checked = state.filters.configurations.has(configuration);
      label.append(box, el("span", "", configuration));
      return label;
    }),
  );

  filtersEl.addEventListener("submit", (event) => event.preventDefault());
  filtersEl.addEventListener("input", () => {
    // An empty box means no cap. A half-typed number reads as empty until it is a number.
    const cap = max.value.trim() === "" ? null : Number(max.value);
    state.filters = {
      maxCost: Number.isFinite(cap) ? cap : null,
      configurations: new Set([...configs.querySelectorAll("input:checked")].map((box) => box.value)),
      shortlistedOnly: shortlisted.checked,
      showRejected: rejected.checked,
      search: search.value,
    };
    renderList();
  });
  filtersEl.hidden = false;
}

// --- Listing details ---

function fieldList(listing, columns) {
  const list = el("dl", "fields");
  for (const column of columns) {
    const value = fieldText(listing, column);
    list.append(el("dt", "", column), el("dd", value === NOT_GIVEN ? "not-given" : "", value));
  }
  return list;
}

// Pros and Cons hold items split by ";".
function itemList(listing, column) {
  const items = String(listing.row[column] ?? "")
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean);
  const wrap = el("div", "items");
  wrap.append(el("h4", "", column));
  if (!items.length) {
    wrap.append(el("p", "not-given", NOT_GIVEN));
    return wrap;
  }
  const list = el("ul");
  list.append(...items.map((item) => el("li", "", item)));
  wrap.append(list);
  return wrap;
}

function section(title, ...children) {
  const part = el("section", "details-part");
  part.append(el("h3", "", title), ...children);
  return part;
}

function overviewPanel(listing) {
  const links = photoLinks(listing);
  const photos = el("div", "photos");
  if (links.length) {
    for (const link of links) {
      const frame = el("div", "photo");
      frame.append(photoImg(link, frame));
      photos.append(frame);
    }
  } else {
    photos.append(el("p", "not-given", "No photos"));
  }
  return [
    section("Photos", photos),
    section(
      "Money",
      fieldList(listing, ["Rent (₹/month)", "Maintenance (₹/month)", "Total monthly cost", "Deposit", "Brokerage fee"]),
    ),
    section(
      "Flat",
      fieldList(listing, [
        "Configuration",
        "Carpet area (sq ft)",
        "Super built-up area (sq ft)",
        "Bathrooms",
        "Floor / total floors",
        "Furnishing",
        "Parking",
        "Lift",
        "Available from",
        "Other details",
      ]),
    ),
  ];
}

function ourTakePanel(listing) {
  const status = el("p", "details-status");
  status.append(statusTag(listing.status));
  const notes = el("p", "notes", fieldText(listing, "Notes"));
  if (notes.textContent === NOT_GIVEN) notes.classList.add("not-given");
  return [
    section("Status", status),
    section(
      "Ratings",
      fieldList(listing, ["Safety", "Water supply", "Location", "Condition", "Natural light", "Overall rating"]),
    ),
    section("Pros and cons", itemList(listing, "Pros"), itemList(listing, "Cons")),
    section("Notes", notes),
  ];
}

function contactsPanel(listing) {
  return [
    section("Contacts", fieldList(listing, ["Listed by", "Broker name", "Broker phone", "Owner name", "Owner phone"])),
  ];
}

function allFieldsPanel(listing) {
  const table = el("table", "all-fields");
  const head = el("thead");
  const headRow = el("tr");
  headRow.append(el("th", "", "#"), el("th", "", "Column"), el("th", "", "Value"));
  head.append(headRow);
  const body = el("tbody");
  for (const field of allFields(listing)) {
    const row = el("tr");
    const column = el("th", "", field.column);
    column.scope = "row";
    const value = el("td", field.value === NOT_GIVEN ? "not-given" : "", field.value);
    row.append(el("td", "all-fields-number", String(field.number)), column, value);
    body.append(row);
  }
  table.append(head, body);
  return [table];
}

const TABS = [
  { key: "overview", name: "Overview", panel: overviewPanel },
  { key: "our-take", name: "Our take", panel: ourTakePanel },
  { key: "contacts", name: "Contacts", panel: contactsPanel },
  { key: "all-fields", name: "All 40 fields", panel: allFieldsPanel },
];

function tabs(listing) {
  const wrap = el("div", "details-tabs");
  const bar = el("div", "tab-bar");
  bar.setAttribute("role", "tablist");
  bar.setAttribute("aria-label", "Listing details");
  const buttons = [];
  const panels = [];

  function pick(index, focus) {
    buttons.forEach((button, i) => {
      const on = i === index;
      button.setAttribute("aria-selected", String(on));
      button.tabIndex = on ? 0 : -1;
      panels[i].hidden = !on;
    });
    if (focus) buttons[index].focus();
  }

  TABS.forEach((tab, index) => {
    const button = el("button", "tab", tab.name);
    button.type = "button";
    button.id = `tab-${tab.key}`;
    button.setAttribute("role", "tab");
    button.setAttribute("aria-controls", `panel-${tab.key}`);
    button.addEventListener("click", () => pick(index, false));
    const panel = el("div", "tab-panel");
    panel.id = `panel-${tab.key}`;
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", button.id);
    panel.tabIndex = 0;
    panel.append(...tab.panel(listing));
    buttons.push(button);
    panels.push(panel);
  });

  // Arrow keys move between tabs, as in any tab bar.
  bar.addEventListener("keydown", (event) => {
    const now = buttons.indexOf(document.activeElement);
    if (now === -1) return;
    const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
    if (event.key === "Home") pick(0, true);
    else if (event.key === "End") pick(buttons.length - 1, true);
    else if (step) pick((now + step + buttons.length) % buttons.length, true);
    else return;
    event.preventDefault();
  });

  bar.append(...buttons);
  wrap.append(bar, ...panels);
  pick(0, false);
  return wrap;
}

// Only http and https links open, so a typed "javascript:" cell cannot run.
function safeLink(link) {
  try {
    const url = new URL(link);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

function detailsHeader(listing) {
  const header = el("header", "details-head");
  const top = el("div", "details-top");
  top.append(el("h2", "details-society", listing.society || NOT_GIVEN), statusTag(listing.status));

  const cost = el("p", "details-cost", listing.totalCost === null ? `Total ${NOT_GIVEN}` : `${formatRupees(listing.totalCost)} a month`);
  if (isOverBudget(listing, state.budget)) cost.append(el("span", "over-budget", "Over budget"));

  const facts = el("p", "details-facts");
  facts.append(
    el("span", "card-config", listing.configuration || NOT_GIVEN),
    el("span", "", `Rating ${formatRating(listing.overallRating)}`),
  );

  const href = safeLink(listing.link);
  let link;
  if (href) {
    link = el("a", "details-link", "Open the listing page");
    link.href = href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
  } else {
    link = el("p", "details-link not-given", `Listing page ${NOT_GIVEN}`);
  }

  header.append(top, el("p", "details-locality", listing.locality || NOT_GIVEN), cost, facts, link);
  return header;
}

function markPin(id, picked) {
  const marker = state.markers.get(id);
  const listing = state.listings.find((l) => l.id === id);
  if (!marker || !listing) return;
  marker.setIcon(pinIcon(listing, picked));
  marker.setZIndexOffset(picked ? 1000 : 0);
}

function openDetails(id) {
  const listing = state.listings.find((l) => l.id === id);
  if (!listing) return;
  if (state.pickedId === null) state.listScroll = listEl.scrollTop;
  closePick();
  state.pickedId = id;

  const back = el("button", "back-link", "← Back to the list");
  back.type = "button";
  back.addEventListener("click", closeDetails);
  detailsEl.replaceChildren(back, detailsHeader(listing), tabs(listing));
  listViewEl.hidden = true;
  detailsEl.hidden = false;
  detailsEl.scrollTop = 0;
  back.focus();

  if (listing.spot) {
    markPin(id, true);
    if (isRoughPin(listing)) {
      state.roughCircle = L.circle(listing.spot, {
        radius: ROUGH_PIN_RADIUS_M[listing.precision],
        className: "rough-pin",
        dashArray: "6 6",
        weight: 2,
        fillOpacity: 0.08,
        interactive: false,
      }).addTo(map);
      map.fitBounds(state.roughCircle.getBounds(), { padding: [60, 60], maxZoom: 16 });
    } else {
      map.panTo(listing.spot);
    }
  }
}

// Takes the picked look off the pin and removes the dashed circle.
function closePick() {
  if (state.pickedId !== null) markPin(state.pickedId, false);
  if (state.roughCircle) state.roughCircle.remove();
  state.roughCircle = null;
}

function closeDetails() {
  const id = state.pickedId;
  closePick();
  state.pickedId = null;
  detailsEl.hidden = true;
  detailsEl.replaceChildren();
  listViewEl.hidden = false;
  listEl.scrollTop = state.listScroll;
  const button = [...listEl.querySelectorAll(".card")].find((c) => c.dataset.id === id)?.querySelector(".card-open");
  button?.focus();
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
    state.listings = sortByCost(listingsFromRows(sheet.tracker));
    state.budget = budgetFrom(settingsFromRows(sheet.settings));
    state.filters = startFilters(state.budget);
    setUpFilters();
    renderList();
    const spots = state.listings.filter((l) => l.spot).map((l) => l.spot);
    if (spots.length) map.fitBounds(spots, { padding: [60, 60], maxZoom: 15 });
  } catch (err) {
    metaEl.textContent = `Could not load the sheet. ${err.message}`;
    metaEl.classList.add("list-meta--error");
  }
}

start();
