// The page: asks the person's name, loads the sheet in one Apps Script call, and shows cards and pins.
// A click on a card or a pin opens the listing details. The filter bar narrows the list and the map.
// The Places tab lists the places, like an office, and adds one. Each place shows on the map as a black star.
// "+ Add listing" opens the add steps in the left column: paste a link, ask Claude web, check the values and save.
import {
  NOT_GIVEN,
  formatRating,
  formatRupees,
  listingsFromRows,
  pinLabel,
  settingsFromRows,
  sortByCost,
} from "/lib/listings.mjs";
import { CONFIGURATIONS, STATUSES } from "/lib/columns.mjs";
import { budgetFrom, filterListings, isOverBudget, startFilters } from "/lib/filters.mjs";
import {
  CONTACT_COLUMNS,
  FLAT_COLUMNS,
  MONEY_COLUMNS,
  RATING_COLUMNS,
  ROUGH_PIN_RADIUS_M,
  allFields,
  fieldText,
  isRoughPin,
  itemsOf,
  photoLinks,
} from "/lib/details.mjs";
import { cityFrom, distancesFor, placesFromRows } from "/lib/places.mjs";
import {
  dateText,
  listingLink,
  newListingRow,
  pageSpot,
  readReply,
  reviewFields,
  stepOnePrompt,
} from "/lib/add-listing.mjs";

const NAME_KEY = "rentalMap.personName";

const listEl = document.getElementById("list");
const metaEl = document.getElementById("list-meta");
const whoEl = document.getElementById("who");
const listViewEl = document.getElementById("list-view");
const detailsEl = document.getElementById("details");
const filtersEl = document.getElementById("filters");
const sideTabEls = [...document.querySelectorAll("#side-tabs .tab")];
const placesViewEl = document.getElementById("places-view");
const placeListEl = document.getElementById("place-list");
const placeFormEl = document.getElementById("place-form");
const placeNoteEl = document.getElementById("place-note");
const sideTabsEl = document.getElementById("side-tabs");
const addOpenEl = document.getElementById("add-open");
const addViewEl = document.getElementById("add-view");
const addStepsEl = document.getElementById("add-steps");

const map = L.map("map", { zoomControl: true }).setView([22.5, 79], 5);
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}).addTo(map);
const pinLayer = L.layerGroup().addTo(map);
// Places sit in their own layer, so the filters never touch them.
const placeLayer = L.layerGroup().addTo(map);

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

let configPromise = null;
function appConfig() {
  configPromise ??= fetch("/api/config").then((res) => res.json());
  return configPromise;
}

// Sends one call to the Apps Script and returns its JSON reply, which may say { ok: false }.
async function callScript(body) {
  const config = await appConfig();
  if (!config.appsScriptUrl) {
    throw new Error("No Apps Script address. Put appsScriptUrl in config.json, then start the app again.");
  }
  // text/plain is a CORS simple type, so Chrome sends no preflight. Apps Script answers a preflight with 405.
  const res = await fetch(config.appsScriptUrl, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`The Apps Script answered HTTP ${res.status}.`);
  let reply;
  try {
    reply = await res.json();
  } catch {
    // A deploy with "Anyone with Google account" access sends a sign-in page, not JSON.
    throw new Error('The Apps Script did not send JSON. Check that "Who has access" is set to Anyone.');
  }
  return reply;
}

async function loadSheet() {
  const reply = await callScript({ action: "load" });
  if (!reply.ok) throw new Error(`The Apps Script said: ${reply.error}`);
  return reply;
}

// The local web server geocodes, so the browser never calls Nominatim itself.
async function geocode(query) {
  const res = await fetch("/api/geocode", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(query),
  });
  let reply;
  try {
    reply = await res.json();
  } catch {
    throw new Error(`The local web server answered HTTP ${res.status}.`);
  }
  if (!reply.ok) throw new Error(reply.error);
  return reply.spot;
}

// --- Drawing ---

// Everything the screen shows comes from here. Filters live only in memory, so they reset each time the app opens.
const state = {
  name: "",
  listings: [],
  places: [],
  city: "",
  budget: null,
  filters: startFilters(null),
  pickedId: null,
  markers: new Map(),
  roughCircle: null,
  listScroll: 0,
  // The add steps, while they are open. null when they are closed.
  add: null,
};

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
  else if (state.places.length) body.append(distanceList(listing, "card-distances"));

  item.append(photo, body);
  return item;
}

// The straight-line distance to each place, worked out each time it is drawn.
function distanceList(listing, className) {
  const list = el("ul", className);
  for (const distance of distancesFor(listing, state.places)) {
    const item = el("li");
    item.append(el("span", "distance-place", distance.name), el("span", distance.text === NOT_GIVEN ? "not-given" : "", distance.text));
    list.append(item);
  }
  return list;
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

function itemList(listing, column) {
  const items = itemsOf(listing, column);
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
  let distances;
  if (!state.places.length) distances = el("p", "not-given", "No places yet. Add one on the Places tab.");
  else if (!listing.spot) distances = el("p", "not-given", "No map spot yet, so no distances.");
  else distances = distanceList(listing, "distances");
  return [
    section("Photos", photos),
    section("Money", fieldList(listing, MONEY_COLUMNS)),
    section("Flat", fieldList(listing, FLAT_COLUMNS)),
    section("Distance to each place", distances),
  ];
}

function ourTakePanel(listing) {
  const status = el("p", "details-status");
  status.append(statusTag(listing.status));
  const notes = el("p", "notes", fieldText(listing, "Notes"));
  if (notes.textContent === NOT_GIVEN) notes.classList.add("not-given");
  return [
    section("Status", status),
    section("Ratings", fieldList(listing, RATING_COLUMNS)),
    section("Pros and cons", itemList(listing, "Pros"), itemList(listing, "Cons")),
    section("Notes", notes),
  ];
}

function contactsPanel(listing) {
  return [
    section("Contacts", fieldList(listing, CONTACT_COLUMNS)),
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

function listingById(id) {
  return state.listings.find((l) => l.id === id);
}

function markPin(id, picked) {
  const marker = state.markers.get(id);
  const listing = listingById(id);
  if (!marker || !listing) return;
  marker.setIcon(pinIcon(listing, picked));
  marker.setZIndexOffset(picked ? 1000 : 0);
}

function openDetails(id) {
  const listing = listingById(id);
  if (!listing) return;
  // A pin click can come while the add steps are open. What the person typed stays until they open the steps again.
  if (!addViewEl.hidden) hideAddSteps();
  // A pin click can come while the Places tab is open. The details belong to the Listings tab.
  if (!placesViewEl.hidden) pickSideTab("listings", false);
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
  listEl.querySelector(`.card[data-id="${CSS.escape(id)}"] .card-open`)?.focus();
}

// --- Places ---

// A black star and the place name, on the map and in the place list.
function placeLabel(tag, className, place) {
  const label = el(tag, className);
  label.append(el("span", "place-star", "★"), el("span", "", place.name || NOT_GIVEN));
  return label;
}

function placeIcon(place) {
  const label = placeLabel("span", "place-pin", place);
  label.title = place.address;
  return L.divIcon({ className: "pin-anchor", html: label.outerHTML, iconSize: null });
}

// Places always show on the map, whatever the filters are.
function renderPlaces() {
  placeLayer.clearLayers();
  for (const place of state.places) {
    if (place.spot) L.marker(place.spot, { icon: placeIcon(place), keyboard: false, zIndexOffset: 500 }).addTo(placeLayer);
  }

  if (!state.places.length) {
    placeListEl.replaceChildren(el("li", "place-empty", "No places yet. Add the office or another place you go to often."));
    return;
  }
  placeListEl.replaceChildren(
    ...state.places.map((place) => {
      const item = el("li", "place");
      // A place with a map spot is a button that shows its star on the map.
      const label = placeLabel(place.spot ? "button" : "span", "place-open", place);
      if (place.spot) {
        label.type = "button";
        label.addEventListener("click", () => map.setView(place.spot, Math.max(map.getZoom(), 14)));
      }
      const name = el("h3", "place-name");
      name.append(label);
      const facts = [place.precision ? `Pin: ${place.precision}` : "", place.addedBy ? `Added by ${place.addedBy}` : ""];
      item.append(name, el("p", "place-address", place.address || NOT_GIVEN), el("p", "place-facts", facts.filter(Boolean).join(" · ")));
      if (!place.spot) item.append(el("p", "card-note", "No map spot"));
      return item;
    }),
  );
}

function setNote(text, isError) {
  placeNoteEl.textContent = text;
  placeNoteEl.classList.toggle("place-note--error", Boolean(isError));
}

function samePlace(a, b) {
  return a.name.toLowerCase() === b.name.toLowerCase() && a.address.toLowerCase() === b.address.toLowerCase();
}

// Find the map spot on the local web server, then write the place to the Places tab.
async function addPlace(event) {
  event.preventDefault();
  const name = placeFormEl.elements.name.value.trim();
  const address = placeFormEl.elements.address.value.trim();
  if (!name || !address) {
    setNote("Give the place a name and an address.", true);
    return;
  }
  if (!state.city) {
    setNote("The Settings tab has no City. Add a City row with the city name, then reload.", true);
    return;
  }
  const button = placeFormEl.querySelector("button");
  button.disabled = true;
  try {
    setNote("Finding the map spot…");
    // A place has no society or locality. Its address is the most exact text, so it goes first.
    const spot = await geocode({ society: address, city: state.city });
    if (!spot) throw new Error(`Could not find this address in ${state.city}. Try a shorter address, like the area name.`);

    setNote("Saving to the sheet…");
    const place = { name, address, lat: spot.lat, long: spot.long, precision: spot.precision };
    const reply = await callScript({ action: "addPlace", place, addedBy: state.name });
    if (!reply.ok) {
      throw new Error(reply.error === "busy" ? "The sheet is busy. Try again in a moment." : `The Apps Script said: ${reply.error}`);
    }
    const [saved] = placesFromRows([reply.place]);
    // A retried add gets the saved row back, so it may already be in the list.
    state.places = [...state.places.filter((p) => !samePlace(p, saved)), saved];
    renderPlaces();
    renderList();
    placeFormEl.reset();
    setNote(`Added ${saved.name}. Pin: ${saved.precision}.`);
    if (saved.spot) map.setView(saved.spot, Math.max(map.getZoom(), 13));
  } catch (err) {
    setNote(err.message, true);
  } finally {
    button.disabled = false;
  }
}

// --- Add a listing by link ---

const ADD_STEPS = [
  { title: "Paste the listing link", body: linkStep, summary: (add) => add.link },
  { title: "Ask Claude web", body: claudeStep, summary: (add) => add.fields.find((f) => f.key === "society")?.value || "Reply read" },
  { title: "Check and save", body: reviewStep },
];

function freshAdd() {
  return { step: 0, link: "", replyText: "", fields: [], id: null, spot: undefined, error: "", busy: false };
}

function openAddSteps() {
  if (state.pickedId !== null) closeDetails();
  pickSideTab("listings", false);
  state.add ??= freshAdd();
  listViewEl.hidden = true;
  sideTabsEl.hidden = true;
  addOpenEl.hidden = true;
  addViewEl.hidden = false;
  renderAddSteps();
}

// Hides the steps but keeps what the person typed, so "+ Add listing" picks up where they left.
function hideAddSteps() {
  addViewEl.hidden = true;
  sideTabsEl.hidden = false;
  addOpenEl.hidden = false;
  listViewEl.hidden = state.pickedId !== null;
}

function closeAddSteps() {
  state.add = null;
  hideAddSteps();
  addOpenEl.focus();
}

function goToStep(index) {
  state.add.step = index;
  state.add.error = "";
  renderAddSteps();
}

// The steps are stacked. The current step is open, a done step folds to one line, and later steps are greyed out.
function renderAddSteps() {
  const add = state.add;
  addStepsEl.replaceChildren(
    ...ADD_STEPS.map((step, index) => {
      const item = el("li", "add-step");
      const title = el("h3", "add-step-title");
      title.append(el("span", "add-step-number", String(index + 1)), el("span", "", step.title));
      item.append(title);
      if (index < add.step) {
        item.classList.add("add-step--done");
        const line = el("div", "add-step-line");
        const change = el("button", "back-link", "Change");
        change.type = "button";
        change.setAttribute("aria-label", `Change: ${step.title}`);
        change.addEventListener("click", () => goToStep(index));
        line.append(el("span", "add-step-summary", step.summary(add)), change);
        item.append(line);
      } else if (index === add.step) {
        item.classList.add("add-step--open");
        item.setAttribute("aria-current", "step");
        item.append(...step.body(add));
        if (add.error) {
          const error = el("p", "add-error", add.error);
          error.setAttribute("role", "alert");
          item.append(error);
        }
      } else {
        item.classList.add("add-step--later");
      }
      return item;
    }),
  );
  addStepsEl.querySelector(".add-step--open [data-focus]")?.focus();
}

function linkStep(add) {
  const form = el("form", "add-form");
  // The app checks the link itself, so its message shows in place of the browser's.
  form.noValidate = true;
  const label = el("label");
  const input = el("input");
  input.name = "link";
  input.type = "url";
  input.required = true;
  input.placeholder = "https://www.99acres.com/...";
  input.autocomplete = "off";
  input.value = add.link;
  input.dataset.focus = "";
  label.append(el("span", "", "Listing link"), input);
  const next = el("button", "add-primary", "Next");
  next.type = "submit";
  form.append(label, next);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const link = listingLink(input.value);
    if (!link) {
      add.error = "Paste a link that starts with https://, like the address of a 99acres page.";
      renderAddSteps();
      return;
    }
    // A new link is a new listing, so the reply, the values and the Listing id start again.
    if (link !== add.link) Object.assign(add, { link, replyText: "", fields: [], id: null, spot: undefined });
    goToStep(1);
  });
  return [form];
}

function claudeStep(add) {
  const promptBox = el("textarea", "add-prompt");
  promptBox.readOnly = true;
  promptBox.rows = 8;
  promptBox.value = stepOnePrompt(add.link);
  promptBox.setAttribute("aria-label", "Prompt for Claude web");

  const copy = el("button", "add-secondary", "Copy the prompt");
  copy.type = "button";
  copy.dataset.focus = "";
  const copied = el("span", "add-hint");
  copied.setAttribute("aria-live", "polite");
  copy.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(promptBox.value);
      copied.textContent = "Copied.";
    } catch {
      promptBox.select();
      copied.textContent = "Press Cmd+C to copy.";
    }
  });
  const claude = el("a", "add-link", "Open Claude web");
  claude.href = "https://claude.ai/new";
  claude.target = "_blank";
  claude.rel = "noopener noreferrer";
  const copyRow = el("div", "add-row");
  copyRow.append(copy, claude, copied);

  const form = el("form", "add-form");
  const label = el("label");
  const reply = el("textarea");
  reply.name = "reply";
  reply.rows = 6;
  reply.required = true;
  reply.placeholder = "Paste all of Claude's reply here";
  reply.value = add.replyText;
  label.append(el("span", "", "Claude's reply"), reply);
  const read = el("button", "add-primary", "Read the reply");
  read.type = "submit";
  form.append(label, read);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    add.replyText = reply.value;
    const result = readReply(reply.value);
    if (!result.ok) {
      add.error = `${result.error} Check that Claude opened the right page, or ask again in a new chat.`;
      renderAddSteps();
      return;
    }
    Object.assign(add, { fields: reviewFields(result.reply), id: null, spot: undefined });
    goToStep(2);
  });

  return [el("p", "add-hint", "Copy this prompt into a new chat on Claude web. Then paste Claude's reply below."), promptBox, copyRow, form];
}

// Long text fields get a box with more room.
const LONG_FIELDS = new Set(["otherDetails", "photos"]);

function reviewStep(add) {
  const form = el("form", "add-form add-review");
  const fixedCount = add.fields.filter((f) => f.fixed).length;
  form.append(
    el(
      "p",
      "add-hint",
      fixedCount
        ? `The app fixed ${fixedCount} ${fixedCount === 1 ? "value" : "values"} in the wrong format. They are marked yellow. Check them and any other field. Nothing is saved until you click Save.`
        : "Check each field. Nothing is saved until you click Save.",
    ),
  );
  add.fields.forEach((field, index) => {
    const label = el("label", field.fixed ? "add-field add-field--fixed" : "add-field");
    const input = el(LONG_FIELDS.has(field.key) ? "textarea" : "input");
    input.name = field.key;
    input.value = String(field.value);
    input.autocomplete = "off";
    if (index === 0) input.dataset.focus = "";
    // Keep what the person types, so a "Change" and back does not lose it.
    input.addEventListener("input", () => {
      field.value = input.value;
    });
    label.append(el("span", "", field.column), input);
    if (field.fixed) label.append(el("span", "add-fixed-note", "Fixed by the app"));
    form.append(label);
  });
  form.append(el("p", "add-hint", "Lat and Long empty: the app finds the map spot from the society and the locality."));
  const save = el("button", "add-primary", add.busy ? "Saving…" : "Save");
  save.type = "submit";
  save.disabled = add.busy;
  const note = el("p", "add-hint add-save-note");
  note.setAttribute("aria-live", "polite");
  form.append(save, note);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    saveListing(add);
  });
  return [form];
}

// The map spot for a new listing: the page's own lat and long, or the geocoder from society plus locality.
// Returns { spot, problem }. A listing with no spot still saves, and its card says "No map spot yet".
async function spotFor(values) {
  const given = pageSpot(values);
  if (given) return { spot: given, problem: "" };
  if ((await appConfig()).geocoding === false) return { spot: null, problem: "The geocoder is off in config.json." };
  if (!state.city) return { spot: null, problem: "The Settings tab has no City." };
  const society = values.society.trim();
  const locality = values.locality.trim();
  if (!society && !locality) return { spot: null, problem: "The listing has no society and no locality." };
  try {
    const spot = await geocode({ society, locality, city: state.city });
    return spot ? { spot, problem: "" } : { spot: null, problem: `The geocoder could not find it in ${state.city}.` };
  } catch (err) {
    return { spot: null, problem: err.message };
  }
}

// Nothing is written before this runs. The Listing id is made once, so a retried Save cannot add a second row.
async function saveListing(add) {
  const values = Object.fromEntries(add.fields.map((f) => [f.key, String(f.value)]));
  add.busy = true;
  add.error = "";
  renderAddSteps();
  const say = (text) => {
    addStepsEl.querySelector(".add-save-note").textContent = text;
  };
  try {
    add.id ??= `L-${crypto.randomUUID()}`;
    // The spot is found once per society and locality, so a retried Save does not ask the geocoder again.
    const spotKey = [values.lat, values.long, values.society, values.locality].join("|");
    if (add.spot?.key !== spotKey) {
      say("Finding the map spot…");
      add.spot = { key: spotKey, ...(await spotFor(values)) };
    }
    say("Saving to the sheet…");
    const row = newListingRow({ id: add.id, values, link: add.link, addedBy: state.name, today: dateText(new Date()), spot: add.spot.spot });
    let reply;
    try {
      reply = await callScript({ action: "addListing", listing: row });
    } catch (err) {
      throw new Error(`${err.message} The listing may or may not be saved. Click Save again. It will not add a second row.`);
    }
    if (!reply.ok) {
      throw new Error(reply.error === "busy" ? "The sheet is busy. Click Save again in a moment." : `The Apps Script said: ${reply.error}`);
    }
    const [saved] = listingsFromRows([reply.listing]);
    state.listings = sortByCost([...state.listings.filter((l) => l.id !== saved.id), saved]);
    const problem = add.spot.problem;
    closeAddSteps();
    renderList();
    openDetails(saved.id);
    if (!saved.spot) {
      const warn = el("p", "add-error", `Saved, with no map spot. ${problem}`);
      warn.setAttribute("role", "status");
      detailsEl.querySelector(".details-head").after(warn);
    }
  } catch (err) {
    add.busy = false;
    add.error = err.message;
    renderAddSteps();
  }
}

function setUpAddSteps() {
  addOpenEl.addEventListener("click", openAddSteps);
  document.getElementById("add-close").addEventListener("click", closeAddSteps);
  addOpenEl.hidden = false;
}

// --- Left column tabs: Listings and Places ---

function pickSideTab(key, focus) {
  if (key === "places" && state.pickedId !== null) closeDetails();
  for (const tab of sideTabEls) {
    const on = tab.dataset.tab === key;
    tab.setAttribute("aria-selected", String(on));
    tab.tabIndex = on ? 0 : -1;
    if (on && focus) tab.focus();
  }
  listViewEl.hidden = key !== "listings" || state.pickedId !== null;
  placesViewEl.hidden = key !== "places";
}

function setUpSideTabs() {
  // Closing the details moves focus to a card, so a click puts focus back on the tab.
  for (const tab of sideTabEls) tab.addEventListener("click", () => pickSideTab(tab.dataset.tab, true));
  document.getElementById("side-tabs").addEventListener("keydown", (event) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    const other = sideTabEls.find((tab) => tab.getAttribute("aria-selected") !== "true");
    pickSideTab(other.dataset.tab, true);
    event.preventDefault();
  });
}

// With the geocoder off in config.json, the app cannot find a spot, so the form says so up front.
async function setUpPlaceForm() {
  placeFormEl.addEventListener("submit", addPlace);
  if ((await appConfig()).geocoding === false) {
    placeFormEl.querySelector("button").disabled = true;
    setNote("The geocoder is off in config.json, so a new place cannot get a map spot.", true);
  }
}

async function start() {
  // Start the slow sheet load while the person types their name.
  const sheetLoad = loadSheet();
  sheetLoad.catch(() => {});
  const name = await personName();
  state.name = name;
  whoEl.textContent = `Your name: ${name}`;
  whoEl.hidden = false;
  try {
    const sheet = await sheetLoad;
    state.listings = sortByCost(listingsFromRows(sheet.tracker));
    state.places = placesFromRows(sheet.places);
    const settings = settingsFromRows(sheet.settings);
    state.budget = budgetFrom(settings);
    state.city = cityFrom(settings);
    state.filters = startFilters(state.budget);
    setUpFilters();
    setUpSideTabs();
    setUpPlaceForm();
    setUpAddSteps();
    renderPlaces();
    renderList();
    const spots = [...state.listings, ...state.places].filter((l) => l.spot).map((l) => l.spot);
    if (spots.length) map.fitBounds(spots, { padding: [60, 60], maxZoom: 15 });
  } catch (err) {
    metaEl.textContent = `Could not load the sheet. ${err.message}`;
    metaEl.classList.add("list-meta--error");
  }
}

start();
