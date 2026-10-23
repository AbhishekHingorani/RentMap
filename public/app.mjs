// The page: asks the person's name, loads the sheet in one Apps Script call, and shows cards and pins.
// A click on a card or a pin opens the listing details. The filter bar narrows the list and the map.
// The Places tab lists the places, like an office, and adds one. Each place shows on the map as a black star.
// "+ Add listing" opens the add steps in the left column: paste a link, ask Claude web, check the values and save.
// When Claude web cannot read the page, the bookmarklet step reads it in the person's own browser.
// A listing with no link, or one no Claude can read, goes in through the hand form.
// A link already on the map blocks the add. The same society and Configuration only warns.
// The row above the tabs saves Shortlisted and each person's 0 to 10 rating. The app does not show Status.
// The Our take tab saves ratings, pros and cons the same way. The Apps Script refuses a click on a stale cell.
// The "All fields" tab has the Edit form and Move pin. Both send the value the person saw, for the same clash check.
// The Overview tab uploads photos to the shared Drive folder and adds each Drive link to the Photos cell.
import {
  NOT_GIVEN,
  costRange,
  formatOurRating,
  formatRating,
  formatRupees,
  furnishingKind,
  listingSource,
  listingsFromRows,
  pinLabel,
  ratingsText,
  settingsFromRows,
  toNumber,
  sortByCost,
  toText,
} from "/lib/listings.mjs";
import { CONFIGURATIONS, PERSON_RATING_COLUMNS, TRACKER_COLUMNS } from "/lib/columns.mjs";
import { budgetFrom, filterListings, isOverBudget, startFilters } from "/lib/filters.mjs";
import { DEFAULT_SORT, sortChoices, sortListings } from "/lib/sort.mjs";
import {
  CLASH,
  ITEM_COLUMNS,
  ROW_GONE,
  cellChange,
  itemName,
  itemProblem,
  PERSON_RATING_MAX,
  PERSON_RATING_STEP,
  personRatingFrom,
  ratingAfterClick,
  ratingValue,
  refusalMessage,
} from "/lib/our-take.mjs";
import {
  CONTACT_COLUMNS,
  FLAT_COLUMNS,
  MONEY_COLUMNS,
  RATING_COLUMNS,
  ROUGH_PIN_RADIUS_M,
  allFields,
  balconiesOf,
  balconyText,
  fieldText,
  floorText,
  isRoughPin,
  itemsOf,
  photoLinks,
} from "/lib/details.mjs";
import {
  cityFrom,
  coloredDistances,
  coordinatesText,
  distanceHue,
  distanceRanges,
  distanceShare,
  editPlaceBody,
  editedPlaceIn,
  parseCoordinates,
  placesFromRows,
  spotPlan,
} from "/lib/places.mjs";
import {
  PHOTO_COLUMN,
  PHOTO_QUALITY,
  PHOTO_TYPE,
  base64Of,
  dataUrlOf,
  driveFileId,
  driveLink,
  photoSrc,
  shrunkSize,
  uploadLine,
} from "/lib/photos.mjs";
import {
  EDIT_COLUMNS,
  LOCKED_COLUMNS,
  TOP_TAKE_COLUMNS,
  UNUSED_COLUMNS,
  PIN_CLASH_MESSAGE,
  applyClash,
  editCells,
  editClashMessage,
  editForm,
  keepMine,
  pinCells,
  useSheetValue,
} from "/lib/edit-listing.mjs";
import {
  PICK_LISTS,
  blankFields,
  checkReply,
  dateText,
  fieldProblems,
  handProblems,
  listingLink,
  localClaudePrompt,
  newListingRow,
  pageSpot,
  readReply,
  reviewFields,
  stepOnePrompt,
} from "/lib/add-listing.mjs";
import { bookmarkletHref } from "/lib/bookmarklet.mjs";
import { ALREADY_ON_MAP, maybeMatchMessage, maybeMatches, sureMatch, sureMatchMessage } from "/lib/same-listing.mjs";

const NAME_KEY = "rentalMap.personName";

const listEl = document.getElementById("list");
const metaEl = document.getElementById("list-meta");
const whoEl = document.getElementById("who");
const listViewEl = document.getElementById("list-view");
const detailsEl = document.getElementById("details");
const detailSideEl = document.getElementById("detail-side");
const filtersEl = document.getElementById("filters");
const sideTabEls = [...document.querySelectorAll("#side-tabs .tab")];
const placesViewEl = document.getElementById("places-view");
const placeListEl = document.getElementById("place-list");
const placeFormEl = document.getElementById("place-form");
const placeNoteEl = document.getElementById("place-note");
const sideTabsEl = document.getElementById("side-tabs");
const addOpenEl = document.getElementById("add-open");
// "Back to the list" sits next to "+ Add listing", so it stays in reach while the details scroll.
const detailsBackEl = document.getElementById("details-back");
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
  // The Sort by choice. It lives in memory only, like the filters.
  sort: DEFAULT_SORT,
  pickedId: null,
  // The open listing details. null when they are closed. See freshDetail.
  detail: null,
  // Goes up with each save, so a read of the row that began before a save cannot undo it.
  saves: 0,
  markers: new Map(),
  roughCircle: null,
  // The add steps, while they are open. null when they are closed.
  add: null,
};

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// The total cost, coloured from green for the cheapest of all listings to red for the dearest.
function costText(className, listing, ...after) {
  const cost = el("p", className);
  if (listing.totalCost === null) {
    cost.textContent = `Total ${NOT_GIVEN}`;
    return cost;
  }
  cost.classList.add("cost-hued");
  cost.style.setProperty("--hue", distanceHue(distanceShare(listing.totalCost, costRange(state.listings))));
  cost.append(formatRupees(listing.totalCost), ...after);
  return cost;
}

// The site the listing came from, as a small outlined tag. A listing with no link gets none.
function sourceTag(listing) {
  const source = listingSource(listing.link);
  if (!source) return null;
  const tag = el("span", `source source--${source.key}`, source.label);
  tag.title = `Listing from ${source.label}`;
  return tag;
}

// The furnishing class for its colour: full is dark, semi is amber, none is plain.
function furnishingClass(listing) {
  const kind = furnishingKind(listing.row.Furnishing);
  return kind ? `furnish--${kind}` : "";
}

// A Drive photo shows through the thumbnail URL. If that fails, the Apps Script sends the photo.
// A site photo shows from its own link.
function photoImg(link, holder) {
  const img = el("img");
  const fileId = driveFileId(link);
  let triedScript = false;
  img.src = (fileId && fallbackSrcs.get(fileId)) || photoSrc(link);
  img.alt = "";
  img.loading = "lazy";
  img.referrerPolicy = "no-referrer";
  img.addEventListener("error", async () => {
    if (fileId && !triedScript) {
      triedScript = true;
      const src = await fallbackPhoto(fileId);
      if (src) {
        img.src = src;
        return;
      }
    }
    img.remove();
    holder.append(el("span", "photo-none", "Photo did not load"));
  });
  return img;
}

// --- Photo viewer ---

// One dialog for the whole page. It shows one photo large, with the previous and next arrows and a strip
// of all the listing's photos. The arrow keys move, Home and End jump, and Esc closes.
const viewer = { dialog: null, links: [], index: 0, back: null };

// Line icons on a 24 px grid, drawn with the text colour. The shapes follow the Lucide set.
const ICONS = {
  prev: '<path d="M15 5l-7 7 7 7"/>',
  next: '<path d="M9 5l7 7-7 7"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  sofa: '<path d="M20 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v3"/><path d="M2 16a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5a2 2 0 0 0-4 0v1.5a.5.5 0 0 1-.5.5h-11a.5.5 0 0 1-.5-.5V11a2 2 0 0 0-4 0z"/><path d="M4 18v2M20 18v2"/>',
  floor: '<path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"/><path d="M2 12.65l9.17 4.16a2 2 0 0 0 1.66 0L22 12.65"/><path d="M2 17.65l9.17 4.16a2 2 0 0 0 1.66 0L22 17.65"/>',
  balcony: '<path d="M3 10h18"/><path d="M3 21h18"/><path d="M5 10v11M9.5 10v11M14.5 10v11M19 10v11"/><path d="M7 10V5a5 5 0 0 1 10 0v5"/>',
  external: '<path d="M15 3h6v6"/><path d="M10 14L21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  pin: '<path d="M20 10c0 4.99-5.54 10.19-7.4 11.8a1 1 0 0 1-1.2 0C9.54 20.19 4 14.99 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
};

function icon(name, size = 22) {
  const span = el("span", "icon");
  span.innerHTML = `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
  return span;
}

function viewerButton(className, name, label, onClick) {
  const button = el("button", `viewer-button ${className}`);
  button.type = "button";
  button.setAttribute("aria-label", label);
  button.title = label;
  button.append(icon(name));
  button.addEventListener("click", onClick);
  return button;
}

function makeViewer() {
  const dialog = el("dialog", "viewer");
  dialog.setAttribute("aria-label", "Photos");
  dialog.innerHTML = `<div class="viewer-top"><p class="viewer-title"></p><p class="viewer-count" aria-live="polite"></p></div>
    <div class="viewer-stage"><div class="viewer-frame"></div></div>
    <ol class="viewer-strip"></ol>`;
  dialog.querySelector(".viewer-top").append(viewerButton("viewer-close", "close", "Close (Esc)", () => dialog.close()));
  const stage = dialog.querySelector(".viewer-stage");
  stage.prepend(viewerButton("viewer-prev", "prev", "Previous photo (←)", () => showPhoto(viewer.index - 1)));
  stage.append(viewerButton("viewer-next", "next", "Next photo (→)", () => showPhoto(viewer.index + 1)));
  // A click on the dark space around the photo closes the viewer, as in most photo viewers.
  stage.addEventListener("click", (event) => {
    if (event.target === stage) dialog.close();
  });
  dialog.addEventListener("keydown", (event) => {
    const step = { ArrowLeft: -1, ArrowRight: 1 }[event.key];
    if (step) showPhoto(viewer.index + step);
    else if (event.key === "Home") showPhoto(0);
    else if (event.key === "End") showPhoto(viewer.links.length - 1);
    else return;
    event.preventDefault();
  });
  dialog.addEventListener("close", () => {
    dialog.querySelector(".viewer-frame").replaceChildren();
    dialog.querySelector(".viewer-strip").replaceChildren();
    if (viewer.back?.isConnected) viewer.back.focus();
  });
  document.body.append(dialog);
  return dialog;
}

function openViewer(links, index, title, back) {
  viewer.dialog ??= makeViewer();
  Object.assign(viewer, { links, back });
  const dialog = viewer.dialog;
  dialog.querySelector(".viewer-title").textContent = title || "";
  dialog.querySelector(".viewer-strip").replaceChildren(
    ...links.map((link, i) => {
      const item = el("li");
      const thumb = el("button", "viewer-thumb");
      thumb.type = "button";
      thumb.setAttribute("aria-label", `Photo ${i + 1}`);
      thumb.append(photoImg(link, thumb));
      thumb.addEventListener("click", () => showPhoto(i));
      item.append(thumb);
      return item;
    }),
  );
  dialog.showModal();
  showPhoto(index);
}

function showPhoto(index) {
  const { dialog, links } = viewer;
  if (index < 0 || index >= links.length) return;
  viewer.index = index;
  const frame = dialog.querySelector(".viewer-frame");
  const img = photoImg(links[index], frame);
  img.loading = "eager";
  img.alt = `Photo ${index + 1} of ${links.length}`;
  frame.replaceChildren(img);
  dialog.querySelector(".viewer-count").textContent = `${index + 1} of ${links.length}`;
  dialog.querySelector(".viewer-prev").disabled = index === 0;
  dialog.querySelector(".viewer-next").disabled = index === links.length - 1;
  dialog.querySelectorAll(".viewer-thumb").forEach((thumb, i) => {
    if (i === index) {
      thumb.setAttribute("aria-current", "true");
      thumb.scrollIntoView({ block: "nearest", inline: "center" });
    } else thumb.removeAttribute("aria-current");
  });
  // The next and previous photos start loading now, so an arrow press shows them at once.
  for (const near of [links[index + 1], links[index - 1]]) {
    if (near && !driveFileId(near)) new Image().src = photoSrc(near);
  }
}

// --- Photo fallback ---

// The photos the Apps Script sent, as data: URLs. The browser keeps them in this cache, so the next visit
// does not ask the Apps Script again. Each call takes a second or more.
const PHOTO_CACHE = "rental-map-photos";
const fallbackSrcs = new Map();
const fallbackCalls = new Map();

function fallbackPhoto(fileId) {
  if (!fallbackCalls.has(fileId)) fallbackCalls.set(fileId, fetchFallbackPhoto(fileId));
  return fallbackCalls.get(fileId);
}

// Returns the data: URL, or null. A failed call is forgotten, so the next draw tries again.
async function fetchFallbackPhoto(fileId) {
  const key = `/photo-cache/${fileId}`;
  // Cache Storage needs a secure page. http://localhost counts as one.
  const cache = "caches" in window ? await caches.open(PHOTO_CACHE).catch(() => null) : null;
  const kept = await cache?.match(key);
  let src = kept ? await kept.text() : null;
  if (!src) {
    let reply = null;
    try {
      reply = await callScript({ action: "getPhoto", fileId });
    } catch {
      // The photo shows "Photo did not load", and the next draw tries again.
    }
    if (reply?.ok) {
      src = dataUrlOf(reply);
      // A full cache only means the next visit asks again.
      await cache?.put(key, new Response(src)).catch(() => {});
    }
  }
  if (src) fallbackSrcs.set(fileId, src);
  else fallbackCalls.delete(fileId);
  return src;
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
  if (listing.id === state.pickedId) open.setAttribute("aria-current", "true");
  open.addEventListener("click", () => openDetails(listing.id));
  const society = el("h2", "card-society");
  society.append(open);

  const body = el("div", "card-body");
  const top = el("div", "card-top");
  top.append(society);
  const facts = el("p", "card-facts");
  facts.append(
    el("span", "card-config", listing.configuration || NOT_GIVEN),
    el("span", "card-rating", ratingsText(listing)),
  );
  body.append(
    top,
    el("p", "card-locality", listing.locality || NOT_GIVEN),
    costText("card-cost", listing, " a month"),
    facts,
  );
  // Furnishing and the site the listing came from, as small tags.
  const tags = el("p", "card-tags");
  if (listing.shortlisted) tags.append(el("span", "status status--shortlisted", "Shortlisted"));
  const furnishing = toText(listing.row.Furnishing);
  if (furnishing) tags.append(el("span", `furnish ${furnishingClass(listing)}`, furnishing));
  const source = sourceTag(listing);
  if (source) tags.append(source);
  if (tags.childElementCount) body.append(tags);

  if (!listing.spot) body.append(el("p", "card-note", "No map spot yet"));
  else if (state.places.length) body.append(distanceList(listing, "card-distances"));

  item.append(photo, body);
  hoverLinks(item, () => state.markers.get(listing.id), ".pin", () => (listing.id === state.pickedId ? 1000 : 0));
  return item;
}

// Pointing at a list item, or tabbing to it, lifts its pin on the map above the others and marks it.
// The class goes straight on the pin element, so the picked look from setIcon stays as it is. The map does not move.
function hoverLinks(item, markerOf, pinSelector, restZ) {
  const show = (on) => {
    const marker = markerOf();
    if (!marker) return;
    marker.setZIndexOffset(on ? 2000 : restZ());
    marker.getElement()?.querySelector(pinSelector)?.classList.toggle("pin--hover", on);
  };
  item.addEventListener("mouseenter", () => show(true));
  item.addEventListener("mouseleave", () => show(false));
  item.addEventListener("focusin", () => show(true));
  item.addEventListener("focusout", (event) => {
    if (!item.contains(event.relatedTarget)) show(false);
  });
}

// The straight-line distance to each place, worked out each time it is drawn. Its colour runs from green for
// the nearest of all listings to red for the farthest.
function distanceList(listing, className) {
  const list = el("ul", className);
  for (const distance of coloredDistances(listing, state.places, distanceRanges(state.listings, state.places))) {
    const item = el("li");
    const value = el("span", distance.hue === null ? "not-given" : "distance-value", distance.text);
    if (distance.hue !== null) value.style.setProperty("--hue", distance.hue);
    item.append(el("span", "distance-place", distance.name), value);
    list.append(item);
  }
  return list;
}

// The facts that settle most choices, at the top of the details. One row holds furnishing, floor and
// balconies. The next holds the distance to each place, or is null when there are none.
function highlights(listing) {
  const chipList = (label) => {
    const list = el("ul", "highlights");
    list.setAttribute("aria-label", label);
    return list;
  };
  const chip = (list, iconName, text, kind, title) => {
    const item = el("li", `highlight${kind ? ` highlight--${kind}` : ""}`);
    if (title) item.title = title;
    item.append(icon(iconName, 16), el("span", "", text));
    list.append(item);
    return item;
  };
  const facts = chipList("Key facts");
  const furnishing = toText(listing.row.Furnishing);
  const furnish = chip(facts, "sofa", furnishing || `Furnishing ${NOT_GIVEN}`, furnishing ? "" : "missing");
  if (furnishingClass(listing)) furnish.classList.add(furnishingClass(listing));
  chip(facts, "floor", floorText(listing), toText(listing.row["Floor / total floors"]) ? "" : "missing");
  const balconies = balconiesOf(listing);
  chip(facts, "balcony", balconyText(balconies), balconies === null ? "missing" : balconies > 0 ? "yes" : "no");

  const ranges = distanceRanges(state.listings, state.places);
  const found = coloredDistances(listing, state.places, ranges);
  if (!found.length) return { facts, distances: null };
  const distances = chipList("Distance to each place");
  for (const distance of found) {
    const item = chip(distances, "pin", `${distance.name} ${distance.text}`, distance.hue === null ? "missing" : "distance", "Straight line. Green is the nearest of all listings, red the farthest.");
    if (distance.hue !== null) item.style.setProperty("--hue", distance.hue);
  }
  return { facts, distances };
}

// A ticked Shortlisted box makes the pin green. Every other pin is blue.
function pinIcon(listing, picked) {
  const key = listing.shortlisted ? "shortlisted" : "to-call";
  const label = el("span", `pin status--${key}${picked ? " pin--picked" : ""}`, pinLabel(listing));
  label.title = [listing.society, listing.shortlisted ? "Shortlisted" : ""].filter(Boolean).join(" · ");
  return L.divIcon({ className: "pin-anchor", html: label.outerHTML, iconSize: null });
}

// The open listing's pin goes on top. Shortlisted pins come next, so blue pins do not hide them.
function pinLayerOrder(listing, picked) {
  if (picked) return 1000;
  return listing.shortlisted ? 500 : 0;
}

function pin(listing) {
  // The list draws again after a save, so the open listing keeps its picked pin.
  const picked = listing.id === state.pickedId;
  // The list can draw again while the person moves the pin, so the new marker stays draggable.
  const draggable = picked && Boolean(state.detail?.moving);
  const marker = L.marker(listing.spot, { icon: pinIcon(listing, picked), keyboard: false, zIndexOffset: pinLayerOrder(listing, picked), draggable });
  // A drop ends with a click on the pin. Its details are open already, so the click must not open them again.
  marker.on("click", () => {
    if (state.detail?.id !== listing.id) openDetails(listing.id);
  });
  marker.on("dragend", () => dropPin(listing.id, marker.getLatLng()));
  return marker;
}

// Shows the cards and pins that the filters let through.
// The Sort by choices change when a place is added or renamed. A choice that is gone falls back to price.
function fillSortChoices() {
  const select = document.getElementById("sort-by");
  const choices = sortChoices(state.places);
  if (!choices.some((c) => c.value === state.sort)) state.sort = DEFAULT_SORT;
  select.replaceChildren(
    ...choices.map((choice) => {
      const option = el("option", "", choice.label);
      option.value = choice.value;
      option.selected = choice.value === state.sort;
      return option;
    }),
  );
}

function renderList() {
  fillSortChoices();
  const shown = sortListings(filterListings(state.listings, state.filters), state.sort, state.places);
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
  const sort = document.getElementById("sort-by");
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
      search: search.value,
    };
    state.sort = sort.value;
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

function section(title, ...children) {
  const part = el("section", "details-part");
  part.append(el("h3", "", title), ...children);
  return part;
}

function overviewPanel(listing, detail) {
  let distances;
  if (!state.places.length) distances = el("p", "not-given", "No places yet. Add one on the Places tab.");
  else if (!listing.spot) distances = el("p", "not-given", "No map spot yet, so no distances.");
  else distances = distanceList(listing, "distances");
  return [
    photoSection(listing, detail),
    section("Money", fieldList(listing, MONEY_COLUMNS)),
    section("Flat", fieldList(listing, FLAT_COLUMNS)),
    section("Distance to each place", distances),
  ];
}

// Each photo has a "×" that removes its link from the Photos cell. A file in Drive stays in Drive.
function photoSection(listing, detail) {
  const take = takeState(listing, detail);
  const links = photoLinks(listing);
  const photos = el("div", "photos");
  links.forEach((link, index) => {
    const frame = el("div", "photo");
    const open = el("button", "photo-open");
    open.type = "button";
    open.setAttribute("aria-label", `Open photo ${index + 1} of ${links.length}`);
    open.append(photoImg(link, open));
    open.addEventListener("click", () => openViewer(links, index, listing.society, open));
    frame.append(open);
    if (take.canSave) {
      const remove = takeButton("×", `photo-remove-${index}`, take, () =>
        sendEdit({ action: "editList", id: listing.row["Listing id"], column: PHOTO_COLUMN, remove: link }),
      );
      remove.className = "take-remove photo-remove";
      remove.setAttribute("aria-label", `Remove photo ${index + 1}. A file in Drive stays in Drive.`);
      remove.title = "Remove this photo. A file in Drive stays in Drive.";
      frame.append(remove);
    }
    photos.append(frame);
  });
  if (!links.length) photos.append(el("p", "not-given", "No photos"));
  if (!take.canSave) return section("Photos", photos);
  return section("Photos", photos, photoUpload(take), messageLine(detail));
}

function photoUpload(take) {
  const wrap = el("div", "photo-upload");
  const input = el("input");
  input.type = "file";
  input.accept = "image/*";
  input.multiple = true;
  input.hidden = true;
  input.addEventListener("change", () => {
    const files = [...input.files];
    input.value = "";
    if (files.length) uploadPhotos(files);
  });
  const pick = takeButton("Upload photos", "photo-upload", take, () => input.click());
  pick.className = "add-secondary";
  wrap.append(pick, input, el("span", "photo-hint", "They go into the shared Drive folder."));
  return wrap;
}

// A button that saves on one click. canSave is false for a row with no Listing id.
// While a save is in flight, a click does nothing. The button stays focusable, so focus does not jump.
function takeButton(text, key, take, onClick) {
  const button = el("button", "take-choice", text);
  button.type = "button";
  button.dataset.key = key;
  button.disabled = !take.canSave;
  if (take.busy) button.setAttribute("aria-disabled", "true");
  button.addEventListener("click", () => {
    if (!state.detail?.busy) onClick();
  });
  return button;
}

function shortlistBox(listing, take) {
  const label = el("label", "take-shortlist");
  const box = el("input");
  box.type = "checkbox";
  box.dataset.key = "shortlisted";
  box.checked = listing.shortlisted;
  box.disabled = !take.canSave;
  box.addEventListener("change", () => {
    if (state.detail?.busy) renderDetails();
    else saveCell("Shortlisted", box.checked, "top");
  });
  label.append(box, el("span", "", "Shortlisted"));
  return label;
}

// One person's rating: a number box from 0 to 10 in steps of 0.5. It saves when the box loses focus or on Enter.
// An empty box clears the cell. A number that breaks the rule stays in the box with a message.
function personRatingRow(listing, column, take, detail) {
  const row = el("label", "take-rating");
  const input = el("input", "take-number");
  input.type = "number";
  input.min = "0";
  input.max = String(PERSON_RATING_MAX);
  input.step = String(PERSON_RATING_STEP);
  input.inputMode = "decimal";
  input.placeholder = `0 to ${PERSON_RATING_MAX}`;
  input.dataset.key = column;
  input.disabled = !take.canSave;
  input.readOnly = Boolean(take.busy);
  const saved = toNumber(listing.row[column]);
  input.value = detail.drafts[column] ?? (saved === null ? "" : String(saved));
  input.addEventListener("change", () => {
    if (state.detail?.busy) return;
    const value = personRatingFrom(input.value);
    if (value === null) {
      detail.drafts[column] = input.value;
      detail.message = { text: `${column} must be a number from 0 to ${PERSON_RATING_MAX} in steps of ${PERSON_RATING_STEP}.`, kind: "error", at: "top" };
      renderDetails();
      return;
    }
    delete detail.drafts[column];
    if (value === (saved ?? "")) return renderDetails();
    saveCell(column, value, "top");
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") input.blur();
  });
  row.append(el("span", "take-rating-name", column), input, el("span", "take-number-max", `/ ${PERSON_RATING_MAX}`));
  return row;
}

// One rating row: the column name and 5 buttons. A click on the rating it has now clears it.
function ratingRow(listing, column, take, at) {
  const now = ratingValue(listing.row[column]);
  const row = el("div", "take-rating");
  const name = el("span", "take-rating-name", column);
  name.id = `rating-${column.replace(/[^A-Za-z]+/g, "-").toLowerCase()}`;
  const group = el("div", "take-choices");
  group.setAttribute("role", "group");
  group.setAttribute("aria-labelledby", name.id);
  for (let n = 1; n <= 5; n++) {
    const button = takeButton(String(n), `${column}-${n}`, take, () => saveCell(column, ratingAfterClick(now, n), at));
    button.setAttribute("aria-pressed", String(n === now));
    button.setAttribute("aria-label", `${n} of 5`);
    if (n === now) button.title = "Click again to clear";
    group.append(button);
  }
  row.append(name, group);
  return row;
}

// The row between the distances and the tabs: Shortlisted and each person's own rating.
function topTake(listing, detail) {
  const take = takeState(listing, detail);
  const wrap = el("section", "top-take");
  wrap.setAttribute("aria-label", "Shortlist and our ratings");
  const line = el("div", "top-take-line");
  line.append(shortlistBox(listing, take));
  const ratings = el("div", "take-ratings");
  for (const column of PERSON_RATING_COLUMNS) ratings.append(personRatingRow(listing, column, take, detail));
  wrap.append(line, ratings, messageLine(detail, "top"));
  return wrap;
}

function ratingChoices(listing, take) {
  const list = el("div", "take-ratings");
  for (const column of RATING_COLUMNS) list.append(ratingRow(listing, column, take, "tab"));
  list.append(el("p", "take-overall", `Average of these 5: ${formatRating(listing.overallRating)}`));
  return list;
}

// One pro or con list: each item has a "×", and a box adds one more.
function itemEditor(listing, column, detail, take) {
  const name = itemName(column);
  const wrap = el("div", "items");
  wrap.append(el("h4", "", column));
  const items = itemsOf(listing, column);
  if (items.length) {
    const list = el("ul", "take-items");
    items.forEach((item, index) => {
      const line = el("li");
      const remove = takeButton("×", `${column}-remove-${index}`, take, () =>
        sendEdit({ action: "editList", id: listing.row["Listing id"], column, remove: item }),
      );
      remove.className = "take-remove";
      remove.setAttribute("aria-label", `Remove this ${name}: ${item}`);
      line.append(el("span", "", item), remove);
      list.append(line);
    });
    wrap.append(list);
  } else {
    wrap.append(el("p", "not-given", `No ${column.toLowerCase()} yet`));
  }
  if (!take.canSave) return wrap;

  const form = el("form", "take-add");
  const input = el("input");
  input.dataset.key = `${column}-new`;
  input.autocomplete = "off";
  input.maxLength = 200;
  input.placeholder = `Add a ${name}`;
  input.setAttribute("aria-label", `New ${name}`);
  input.value = detail.drafts[column];
  // The tab draws again after each save, so keep what the person types.
  input.addEventListener("input", () => {
    detail.drafts[column] = input.value;
  });
  const add = takeButton("Add", `${column}-add`, take, () => form.requestSubmit());
  add.className = "add-secondary";
  form.append(input, add);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (detail.busy) return;
    const problem = itemProblem(column, input.value);
    if (problem) {
      detail.message = { text: problem, kind: "error" };
      renderDetails();
      return;
    }
    sendEdit({ action: "editList", id: listing.row["Listing id"], column, add: input.value.trim() }, () => {
      detail.drafts[column] = "";
    });
  });
  wrap.append(form);
  return wrap;
}

const NO_ID = "This row has no Listing id in the sheet, so the app cannot change it. Give the row a Listing id in the sheet, then reload.";

function takeState(listing, detail) {
  return { canSave: Boolean(toText(listing.row["Listing id"])), busy: detail.busy };
}

// The line that says "Saving…", "Saved." or why a save was refused. detail.busy holds the text while a call is out.
// at is "top" for the row above the tabs, or "tab". A save shows its line only where it was clicked.
function messageLine(detail, at = "tab") {
  const message = el("p", "take-message");
  message.setAttribute("aria-live", "polite");
  if (detail.busy) {
    if ((detail.busyAt ?? "tab") === at) message.textContent = detail.busy;
  } else if (detail.message && (detail.message.at ?? "tab") === at) {
    message.textContent = detail.message.text;
    message.classList.add(`take-message--${detail.message.kind}`);
    if (detail.message.kind === "error") message.setAttribute("role", "alert");
  }
  return message;
}

function ourTakePanel(listing, detail) {
  const take = takeState(listing, detail);
  const parts = [];
  if (!take.canSave) parts.push(el("p", "take-message", NO_ID));
  const message = messageLine(detail);
  const notes = el("p", "notes", fieldText(listing, "Notes"));
  if (notes.textContent === NOT_GIVEN) notes.classList.add("not-given");
  parts.push(
    message,
    section("Ratings", ratingChoices(listing, take)),
    section("Pros and cons", ...ITEM_COLUMNS.map((column) => itemEditor(listing, column, detail, take))),
    section("Notes", notes),
  );
  return parts;
}

function contactsPanel(listing) {
  return [
    section("Contacts", fieldList(listing, CONTACT_COLUMNS)),
  ];
}

// The table of all Tracker columns. cell(field) gives the value cell. The Edit form puts boxes in some of them.
function fieldsTable(listing, cell) {
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
    column.id = `field-${field.number}`;
    row.append(el("td", "all-fields-number", String(field.number)), column, cell(field));
    body.append(row);
  }
  table.append(head, body);
  return table;
}

function plainCell(field) {
  return el("td", field.value === NOT_GIVEN ? "not-given" : "", field.value);
}

function fieldButton(text, key, take, onClick) {
  const button = takeButton(text, key, take, onClick);
  button.className = "add-secondary";
  return button;
}

// Why Move pin cannot start, or "" when it can.
function movePinProblem(listing) {
  if (!listing.spot) return "This listing has no map spot yet, so it has no pin to move.";
  if (!state.markers.has(listing.id)) return "Your filters hide this pin. Change the filters to move it.";
  return "";
}

function allFieldsPanel(listing, detail) {
  const take = takeState(listing, detail);
  const parts = [];
  if (!take.canSave) parts.push(el("p", "take-message", NO_ID));
  parts.push(messageLine(detail));
  if (detail.edit) return [...parts, editFormPanel(listing, detail, take)];

  const actions = el("div", "fields-actions");
  const edit = fieldButton("Edit", "edit", take, startEdit);
  edit.disabled ||= detail.moving;
  const problem = movePinProblem(listing);
  const move = detail.moving
    ? fieldButton("Stop moving", "move-stop", take, stopMoving)
    : fieldButton("Move pin", "move", take, startMoving);
  // Stop moving must work even when a filter change hid the pin during the move.
  if (!detail.moving) move.disabled ||= Boolean(problem);
  actions.append(edit, move);
  parts.push(actions);
  if (detail.moving) parts.push(el("p", "add-hint", "Drag the pin on the map to the right spot. The app saves it when you drop it. Or type the coordinates."), pinCoordinatesForm(listing, detail));
  else if (take.canSave && problem) parts.push(el("p", "add-hint", problem));
  parts.push(fieldsTable(listing, plainCell));
  return parts;
}

// The Edit form. Boxes keep what the person types in detail.edit, so the tab can draw again after a refused save.
function editFormPanel(listing, detail, take) {
  const edit = detail.edit;
  const form = el("form", "edit-form");
  const table = fieldsTable(listing, (field) => {
    if (!EDIT_COLUMNS.includes(field.column)) {
      const cell = plainCell(field);
      let why = "Change it on the Our take tab";
      if (LOCKED_COLUMNS.includes(field.column)) why = "Locked";
      else if (TOP_TAKE_COLUMNS.includes(field.column)) why = "Change it above the tabs";
      else if (UNUSED_COLUMNS.includes(field.column)) why = "The app does not use this";
      else if (field.column === PHOTO_COLUMN) why = "Change it on the Overview tab";
      cell.append(el("span", "edit-locked", why));
      return cell;
    }
    const cell = el("td", "edit-cell");
    const input = el(field.column === "Other details" ? "textarea" : "input");
    input.value = edit.values[field.column];
    input.autocomplete = "off";
    input.dataset.key = `edit-${field.number}`;
    input.setAttribute("aria-labelledby", `field-${field.number}`);
    input.addEventListener("input", () => {
      edit.values[field.column] = input.value;
    });
    cell.append(input);
    if (Object.hasOwn(edit.clashes, field.column)) cell.append(clashNote(detail, field));
    return cell;
  });
  const save = el("button", "add-primary", "Save");
  save.type = "submit";
  save.dataset.key = "edit-save";
  if (detail.busy) save.setAttribute("aria-disabled", "true");
  save.disabled = !take.canSave;
  const cancel = fieldButton("Cancel", "edit-cancel", take, cancelEdit);
  const actions = el("div", "fields-actions");
  actions.append(save, cancel);
  form.append(table, actions);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!detail.busy) saveEdit();
  });
  return form;
}

// "In the sheet now: <value>" under a box that a refused save named.
function clashNote(detail, field) {
  const edit = detail.edit;
  const now = toText(edit.clashes[field.column]);
  const note = el("div", "edit-clash");
  note.append(el("p", "", `In the sheet now: ${now || "empty"}`));
  const take = { canSave: true, busy: detail.busy };
  // Each way out takes the mark off, then puts focus back in the box.
  const pick = (text, key, choose) =>
    fieldButton(text, `edit-${key}-${field.number}`, take, () => {
      choose(edit, field.column);
      renderDetails();
      detailsEl.querySelector(`[data-key="edit-${field.number}"]`)?.focus();
    });
  const use = pick("Use sheet value", "use", useSheetValue);
  const keep = pick("Keep mine", "keep", keepMine);
  const buttons = el("div", "add-row");
  buttons.append(use, keep);
  note.append(buttons);
  return note;
}

const TABS = [
  { key: "overview", name: "Overview", panel: overviewPanel },
  { key: "our-take", name: "Our take", panel: ourTakePanel },
  { key: "contacts", name: "Contacts", panel: contactsPanel },
  { key: "all-fields", name: `All ${TRACKER_COLUMNS.length} fields`, panel: allFieldsPanel },
];

// The tab bar keeps the picked tab in detail.tab, so the details can draw again after a save.
function tabs(listing, detail) {
  const wrap = el("div", "details-tabs");
  const bar = el("div", "tab-bar");
  bar.setAttribute("role", "tablist");
  bar.setAttribute("aria-label", "Listing details");
  const buttons = [];
  const panels = [];

  function pick(index, focus) {
    detail.tab = index;
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
    button.dataset.key = button.id;
    button.setAttribute("role", "tab");
    button.setAttribute("aria-controls", `panel-${tab.key}`);
    button.addEventListener("click", () => pick(index, false));
    const panel = el("div", "tab-panel");
    panel.id = `panel-${tab.key}`;
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", button.id);
    panel.tabIndex = 0;
    panel.append(...tab.panel(listing, detail));
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
  pick(detail.tab, false);
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

// The top of the details, from the user's sketch. Left: the society name, which links to the listing page,
// the locality and the Configuration. Right: the money and the two ratings. Below: the key facts,
// then the distances, each row under a rule.
function detailsHeader(listing) {
  const header = el("header", "details-head");

  const name = el("h2", "details-society");
  const href = safeLink(listing.link);
  if (href) {
    const link = el("a", "details-name-link", listing.society || NOT_GIVEN);
    link.href = href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.title = "Open the listing page in a new tab";
    link.append(icon("external", 15));
    name.append(link);
  } else {
    name.textContent = listing.society || NOT_GIVEN;
  }
  const kind = el("p", "details-kind");
  kind.append(el("span", "details-config", listing.configuration || NOT_GIVEN));
  const source = sourceTag(listing);
  if (source) kind.append(source);
  else kind.append(el("span", "not-given", `Listing page ${NOT_GIVEN}`));
  const who = el("div", "details-who");
  who.append(name, el("p", "details-locality", listing.locality || NOT_GIVEN), kind);

  const money = el("div", "details-money");
  money.append(costText("details-cost", listing, el("span", "details-per", "a month")));
  if (isOverBudget(listing, state.budget)) money.append(el("span", "over-budget", "Over budget"));
  // Each rating is as big as the price, with a small name before it.
  for (const [name, text] of [["Ours", formatOurRating(listing.ourRating)], ["Others", formatRating(listing.overallRating)]]) {
    const rating = el("p", "details-rating");
    rating.append(el("span", "details-rating-name", name), el("span", text === NOT_GIVEN ? "not-given" : "", text));
    money.append(rating);
  }

  const top = el("div", "details-top");
  top.append(who, money);
  const { facts, distances } = highlights(listing);
  header.append(top, facts);
  if (distances) header.append(distances);
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
  marker.setZIndexOffset(pinLayerOrder(listing, picked));
}

// Marks the card of the open listing, so the list shows which one the details column holds.
function markCard(id, picked) {
  const open = listEl.querySelector(`.card[data-id="${CSS.escape(id)}"] .card-open`);
  if (picked) open?.setAttribute("aria-current", "true");
  else open?.removeAttribute("aria-current");
}

// What the open details hold besides the listing. notice is a line under the header, like a save with no map spot.
// drafts keeps a half-typed pro or con. edit is the open Edit form, or null. moving is true while the pin is draggable.
// busy is false, or the text to show while a call is out, like "Saving…".
function freshDetail(id, notice) {
  return { id, tab: 0, busy: false, message: null, notice, drafts: { Pros: "", Cons: "" }, gone: false, edit: null, moving: false, pinDraft: "" };
}

function openDetails(id, { notice = "" } = {}) {
  const listing = listingById(id);
  if (!listing) return;
  // A pin click can come while the add steps are open. What the person typed stays until they open the steps again.
  if (!addViewEl.hidden) hideAddSteps();
  // A pin click can come while the Places tab is open. The details belong to the Listings tab.
  if (!placesViewEl.hidden) pickSideTab("listings", false);
  closePick();
  state.pickedId = id;
  state.detail = freshDetail(id, notice);

  renderDetails();
  detailSideEl.hidden = false;
  detailsEl.scrollTop = 0;
  // The details column takes room from the map, so Leaflet must measure the map again before it moves.
  map.invalidateSize();
  detailsBackEl.focus();

  markCard(id, true);
  if (listing.spot) {
    markPin(id, true);
    const circle = drawRoughCircle(listing);
    if (circle) map.fitBounds(circle.getBounds(), { padding: [60, 60], maxZoom: 16 });
    else map.setView(listing.spot, Math.max(map.getZoom(), 15));
  }
  // Someone may have changed the row since the app loaded the sheet, so read it again.
  if (toText(listing.row["Listing id"])) readListingAgain(state.detail);
}

// The dashed circle round a society or locality pin of the open listing. Returns it, or null for no circle.
function drawRoughCircle(listing) {
  if (state.roughCircle) state.roughCircle.remove();
  state.roughCircle = null;
  if (!listing.spot || !isRoughPin(listing)) return null;
  state.roughCircle = L.circle(listing.spot, {
    radius: ROUGH_PIN_RADIUS_M[listing.precision],
    className: "rough-pin",
    dashArray: "6 6",
    weight: 2,
    fillOpacity: 0.08,
    interactive: false,
  }).addTo(map);
  return state.roughCircle;
}

// Draws the open details from state. It keeps the picked tab, the scroll and the focused control.
function renderDetails() {
  const detail = state.detail;
  const focused = detailsEl.contains(document.activeElement) ? document.activeElement.dataset.key : undefined;
  const scroll = detailsEl.scrollTop;

  const listing = listingById(detail.id);
  if (detail.gone || !listing) {
    const gone = el("p", "add-error", "This listing is no longer in the sheet. The app took its pin off the map.");
    gone.setAttribute("role", "alert");
    detailsEl.replaceChildren(gone);
  } else {
    const parts = [detailsHeader(listing), topTake(listing, detail)];
    if (detail.notice) {
      const notice = el("p", "add-error", detail.notice);
      notice.setAttribute("role", "status");
      parts.push(notice);
    }
    // The filters stay as the person set them. The note says why the pin is not on the map.
    if (!filterListings([listing], state.filters).length) parts.push(el("p", "details-hidden", "Your filters hide this listing on the map."));
    parts.push(tabs(listing, detail));
    detailsEl.replaceChildren(...parts);
  }
  detailsEl.scrollTop = scroll;
  if (focused) detailsEl.querySelector(`[data-key="${CSS.escape(focused)}"]`)?.focus();
}

// Puts a row from the Apps Script into the list, the map and the open details.
function putListing(row) {
  const [fresh] = listingsFromRows([row]);
  const old = listingById(fresh.id);
  if (old && JSON.stringify(old.row) === JSON.stringify(fresh.row)) return;
  state.listings = sortByCost([...state.listings.filter((l) => l.id !== fresh.id), fresh]);
  renderList();
  // A moved pin may have a new spot and Pin precision, so its circle draws again.
  if (state.pickedId === fresh.id) drawRoughCircle(fresh);
  if (state.detail?.id === fresh.id) renderDetails();
}

// The sheet owner deleted the row by hand. The listing leaves the list and the map.
function rowGone(id) {
  state.listings = state.listings.filter((l) => l.id !== id);
  renderList();
  if (state.detail?.id !== id) return;
  closePick();
  state.detail.gone = true;
  renderDetails();
}

async function readListingAgain(detail) {
  const saves = state.saves;
  let reply;
  try {
    reply = await callScript({ action: "getListing", id: detail.id });
  } catch (err) {
    reply = { ok: false, error: err.message };
  }
  // A save since this read began has a newer row, and a save in flight will bring one.
  // This counts saves from any details view, so a read from a closed view cannot undo a later save.
  if (state.saves !== saves || detail.busy) return;
  if (reply.ok) putListing(reply.listing);
  else if (reply.error === ROW_GONE) rowGone(detail.id);
  else if (state.detail === detail) {
    detail.message = { text: `Could not read this listing again, so the values may be old. ${reply.error}`, kind: "error" };
    renderDetails();
  }
}

// One click above the tabs or on the Our take tab. It sends the value the person saw as the old value.
// at says which message line shows the result: "top" or "tab".
function saveCell(column, value, at = "tab") {
  const listing = listingById(state.detail.id);
  sendEdit({ action: "saveCells", id: listing.row["Listing id"], cells: [cellChange(listing, column, value)] }, () => {}, state.detail, at);
}

// Sends one save. A refused save shows the sheet values and a message. The app does not try again.
// done runs after a save that worked. Returns the reply, or null when the call failed or the row is gone.
// detail is the details view that started the save. It may be closed by the time the save goes out.
// at says which message line shows the result: "top" for the row above the tabs, or "tab".
async function sendEdit(body, done = () => {}, detail = state.detail, at = "tab") {
  state.saves++;
  Object.assign(detail, { busy: "Saving…", busyAt: at, message: null });
  if (state.detail === detail) renderDetails();
  let reply;
  let failed = "";
  try {
    reply = await callScript(body);
  } catch (err) {
    failed = err.message;
  }
  detail.busy = false;
  detail.busyAt = undefined;
  if (failed) {
    // The write may have worked before the call failed. The row read again shows what the sheet holds.
    detail.message = { text: `${failed} Your change may not be saved. The app reads the listing again.`, kind: "error", at };
    if (state.detail === detail) renderDetails();
    readListingAgain(detail);
    return null;
  }
  if (reply.ok) {
    done();
    detail.message = { text: "Saved.", kind: "ok", at };
  } else if (reply.error === ROW_GONE) {
    rowGone(detail.id);
    return null;
  } else {
    detail.message = { text: refusalMessage(reply), kind: "error", at };
  }
  // A refused save sends the sheet values back, so the control shows what the sheet holds now.
  if (reply.listing) putListing(reply.listing);
  if (state.detail === detail) renderDetails();
  return reply;
}

// --- Photo upload ---

// Shrinks one photo on a canvas to about 1600 px on the long side, as a JPEG at quality 0.8.
// Returns the base64 part of the JPEG.
async function shrinkPhoto(file) {
  let bitmap;
  try {
    // Chrome turns a phone photo upright from its EXIF data here.
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("Chrome cannot read this file as a photo. Save it as a JPEG and try again.");
  }
  const { width, height } = shrunkSize(bitmap.width, bitmap.height);
  const canvas = el("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  // A JPEG has no see-through parts, so a PNG gets a white ground, not a black one.
  context.fillStyle = "#fff";
  context.fillRect(0, 0, width, height);
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const data = base64Of(canvas.toDataURL(PHOTO_TYPE, PHOTO_QUALITY));
  if (!data) throw new Error("Chrome could not make a JPEG of this photo.");
  return data;
}

// One photo per call. Each photo goes to Drive first, then its Drive link goes into the Photos cell
// with "add one item". The first photo that fails stops the rest.
async function uploadPhotos(files) {
  const detail = state.detail;
  const id = listingById(detail.id).row["Listing id"];
  for (const [index, file] of files.entries()) {
    Object.assign(detail, { busy: uploadLine(index, files.length), message: null });
    if (state.detail === detail) renderDetails();
    let problem = "";
    let reply = null;
    try {
      const data = await shrinkPhoto(file);
      try {
        reply = await callScript({ action: "uploadPhoto", id, data });
      } catch (err) {
        problem = `${err.message} The photo may be in the Drive folder, but it is not on this listing.`;
      }
    } catch (err) {
      problem = err.message;
    }
    detail.busy = false;
    if (reply?.error === ROW_GONE) {
      rowGone(detail.id);
      return;
    }
    if (reply && !reply.ok) problem = `The Apps Script said: ${reply.error}`;
    if (problem) {
      const left = files.length - index - 1;
      const rest = left ? ` The other ${left} were not uploaded.` : "";
      detail.message = { text: `${file.name} was not uploaded. ${problem}${rest}`, kind: "error" };
      if (state.detail === detail) renderDetails();
      return;
    }
    const added = await sendEdit({ action: "editList", id, column: PHOTO_COLUMN, add: driveLink(reply.fileId) }, () => {}, detail);
    if (!added?.ok) return;
  }
  if (files.length > 1) {
    detail.message = { text: `Saved ${files.length} photos.`, kind: "ok" };
    if (state.detail === detail) renderDetails();
  }
}

// --- Edit form and Move pin ---

// "Edit" reads the row again, so the form opens with what the sheet holds now.
async function startEdit() {
  const detail = state.detail;
  Object.assign(detail, { busy: "Reading the listing again…", message: null });
  renderDetails();
  // A read that began before this one has an older row, so it must not land after it.
  state.saves++;
  let reply;
  try {
    reply = await callScript({ action: "getListing", id: detail.id });
  } catch (err) {
    reply = { ok: false, error: err.message };
  }
  detail.busy = false;
  if (reply.error === ROW_GONE) {
    rowGone(detail.id);
    return;
  }
  if (reply.ok) {
    putListing(reply.listing);
    detail.edit = editForm(reply.listing);
  } else {
    detail.message = { text: `Could not read this listing again, so the form did not open. Click Edit again. ${reply.error}`, kind: "error" };
  }
  if (state.detail !== detail) return;
  renderDetails();
  if (detail.edit) detailsEl.querySelector(".edit-form [data-key^='edit-']")?.focus();
}

function cancelEdit() {
  const detail = state.detail;
  Object.assign(detail, { edit: null, message: null });
  renderDetails();
  detailsEl.querySelector('[data-key="edit"]')?.focus();
}

// Save sends only the changed cells. A refused save keeps the form open with what the person typed.
async function saveEdit() {
  const detail = state.detail;
  const edit = detail.edit;
  const { cells, problems } = editCells(edit);
  if (problems.length) {
    detail.message = { text: problems.join(" "), kind: "error" };
    renderDetails();
    return;
  }
  if (!cells.length) {
    Object.assign(detail, { edit: null, message: { text: "Nothing changed, so nothing was saved.", kind: "ok" } });
    renderDetails();
    return;
  }
  const listing = listingById(detail.id);
  const reply = await sendEdit({ action: "saveCells", id: listing.row["Listing id"], cells });
  if (!reply || detail.edit !== edit) return;
  if (reply.ok) detail.edit = null;
  else if (reply.error === CLASH) {
    applyClash(edit, reply);
    detail.message = { text: editClashMessage(reply), kind: "error" };
  }
  if (state.detail === detail) renderDetails();
}

// While the pin moves, the person may type the spot in place of dragging. pinDraft keeps the box text across redraws.
function pinCoordinatesForm(listing, detail) {
  const form = el("form", "pin-coordinates");
  const label = el("label", "", "Coordinates");
  const input = el("input");
  Object.assign(input, { name: "coordinates", value: detail.pinDraft, maxLength: 60, autocomplete: "off", placeholder: "23.0300, 72.5100" });
  input.inputMode = "decimal";
  input.addEventListener("input", () => {
    detail.pinDraft = input.value;
  });
  label.append(input);
  const save = el("button", "add-secondary", "Save coordinates");
  save.type = "submit";
  save.disabled = detail.busy;
  form.append(label, save, el("span", "place-hint", "Right-click the spot in Google Maps to copy them."));
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const parsed = parseCoordinates(detail.pinDraft);
    if (parsed.error) {
      detail.message = { text: parsed.error, kind: "error" };
      renderDetails();
      return;
    }
    const latLng = L.latLng(parsed.spot.lat, parsed.spot.long);
    state.markers.get(listing.id)?.setLatLng(latLng);
    dropPin(listing.id, latLng);
  });
  return form;
}

function startMoving() {
  const detail = state.detail;
  const marker = state.markers.get(detail.id);
  if (!marker) return;
  const listing = listingById(detail.id);
  Object.assign(detail, { moving: true, message: null, pinDraft: coordinatesText(listing?.spot) });
  marker.dragging.enable();
  renderDetails();
}

// The pin goes back to the spot the sheet holds.
function putPinBack(id) {
  const marker = state.markers.get(id);
  const listing = listingById(id);
  marker?.dragging?.disable();
  if (marker && listing?.spot) marker.setLatLng(listing.spot);
}

function stopMoving() {
  const detail = state.detail;
  detail.moving = false;
  putPinBack(detail.id);
  renderDetails();
}

// A drop, or typed coordinates, saves the new Lat and Long at once. A refused or failed drop puts the pin back on the sheet spot.
// The app does not try again.
async function dropPin(id, latLng) {
  const detail = state.detail;
  if (detail?.id !== id || !detail.moving) return;
  // Another save is still out, so this drop cannot be sent now. The pin goes back and stays draggable.
  if (detail.busy) {
    putPinBack(id);
    state.markers.get(id)?.dragging?.enable();
    detail.message = { text: "Wait for the save to finish, then move the pin again.", kind: "error" };
    renderDetails();
    return;
  }
  detail.moving = false;
  state.markers.get(id)?.dragging?.disable();
  const listing = listingById(id);
  const reply = await sendEdit({ action: "saveCells", id: listing.row["Listing id"], cells: pinCells(listing, latLng) });
  if (reply?.ok) return;
  putPinBack(id);
  if (reply?.error === CLASH && reply.clashes?.some((c) => c === "Lat" || c === "Long") && state.detail === detail) {
    detail.message = { text: PIN_CLASH_MESSAGE, kind: "error" };
    renderDetails();
  }
}

// Takes the picked look off the pin and removes the dashed circle. A pin left mid-move goes back to its spot.
function closePick() {
  if (state.detail?.moving) putPinBack(state.detail.id);
  if (state.pickedId !== null) {
    markPin(state.pickedId, false);
    markCard(state.pickedId, false);
  }
  if (state.roughCircle) state.roughCircle.remove();
  state.roughCircle = null;
}

function closeDetails() {
  const id = state.pickedId;
  closePick();
  state.pickedId = null;
  state.detail = null;
  detailSideEl.hidden = true;
  detailsEl.replaceChildren();
  map.invalidateSize();
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
const placeMarkers = new Map();

function renderPlaces() {
  placeLayer.clearLayers();
  placeMarkers.clear();
  for (const place of state.places) {
    if (placeEdit.place === place && placeEdit.dragging) {
      const marker = L.marker(dragStart(place), { icon: placeIcon(place), keyboard: false, zIndexOffset: 1000, draggable: true });
      marker.on("dragend", () => {
        const { lat, lng } = marker.getLatLng();
        placeEdit.draft.coordinates = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
        renderPlaces();
      });
      marker.addTo(placeLayer);
    } else if (place.spot) {
      placeMarkers.set(place, L.marker(place.spot, { icon: placeIcon(place), keyboard: false, zIndexOffset: 500 }).addTo(placeLayer));
    }
  }

  if (!state.places.length) {
    placeListEl.replaceChildren(el("li", "place-empty", "No places yet. Add the office or another place you go to often."));
    return;
  }
  placeListEl.replaceChildren(
    ...state.places.map((place) => {
      const item = el("li", "place");
      hoverLinks(item, () => placeMarkers.get(place), ".place-pin", () => 500);
      // A place with a map spot is a button that shows its star on the map.
      const label = placeLabel(place.spot ? "button" : "span", "place-open", place);
      if (place.spot) {
        label.type = "button";
        label.addEventListener("click", () => map.setView(place.spot, Math.max(map.getZoom(), 14)));
      }
      const name = el("h3", "place-name");
      name.append(label);
      if (placeEdit.place === place) {
        item.append(name, placeEditForm(place));
        return item;
      }
      const facts = [place.precision ? `Pin: ${place.precision}` : "", place.addedBy ? `Added by ${place.addedBy}` : ""];
      item.append(name, el("p", "place-address", place.address || NOT_GIVEN), el("p", "place-facts", facts.filter(Boolean).join(" · ")));
      if (!place.spot) item.append(el("p", "card-note", "No map spot"));
      const edit = el("button", "place-edit-open", "Edit");
      edit.type = "button";
      edit.setAttribute("aria-label", `Edit ${place.name || "this place"}`);
      edit.addEventListener("click", () => {
        openPlaceEdit(place);
        renderPlaces();
        placeListEl.querySelector(".place-edit input")?.focus();
      });
      item.append(edit);
      return item;
    }),
  );
}

// The place whose edit form is open, or null. Only one form is open at a time.
const placeEdit = { place: null, draft: null, note: "", isError: false, busy: false, dragging: false };

// The draft keeps what the person typed, so a redraw of the list does not lose it.
function openPlaceEdit(place) {
  const draft = { name: place.name, address: place.address, coordinates: coordinatesText(place.spot) };
  Object.assign(placeEdit, { place, draft, note: "", isError: false, busy: false, dragging: false });
}

function closePlaceEdit() {
  Object.assign(placeEdit, { place: null, draft: null, busy: false, dragging: false });
}

// Where the star sits while the person drags it: the spot in the Coordinates box, the saved spot, or the map centre.
function dragStart(place) {
  const typed = parseCoordinates(placeEdit.draft.coordinates).spot;
  if (typed) return [typed.lat, typed.long];
  if (place.spot) return place.spot;
  const centre = map.getCenter();
  return [centre.lat, centre.lng];
}

function placeEditForm(place) {
  const form = el("form", "place-edit");
  const field = (label, key, max) => {
    const wrap = el("label", "", label);
    const input = el("input");
    Object.assign(input, { name: key, value: placeEdit.draft[key], required: true, maxLength: max, autocomplete: "off" });
    input.addEventListener("input", () => {
      placeEdit.draft[key] = input.value;
    });
    wrap.append(input);
    return wrap;
  };
  const save = el("button", "", placeEdit.busy ? "Saving…" : "Save");
  save.type = "submit";
  save.disabled = placeEdit.busy;
  const cancel = el("button", "place-edit-cancel", "Cancel");
  cancel.type = "button";
  cancel.disabled = placeEdit.busy;
  cancel.addEventListener("click", () => {
    closePlaceEdit();
    renderPlaces();
  });
  const actions = el("div", "place-edit-actions");
  actions.append(save, cancel);
  const note = el("p", `place-note${placeEdit.isError ? " place-note--error" : ""}`, placeEdit.note);
  note.setAttribute("aria-live", "polite");
  const coordinates = field("Coordinates", "coordinates", 60);
  const coordinatesInput = coordinates.querySelector("input");
  coordinatesInput.required = false;
  coordinatesInput.inputMode = "decimal";
  coordinatesInput.placeholder = "23.0300, 72.5100";
  coordinates.append(el("span", "place-hint", "Paste new ones from Google Maps, or clear the box to find the spot from the address."));
  const drag = el("button", "place-edit-cancel", placeEdit.dragging ? "Stop dragging" : "Drag the pin");
  drag.type = "button";
  drag.disabled = placeEdit.busy;
  drag.addEventListener("click", () => {
    placeEdit.dragging = !placeEdit.dragging;
    renderPlaces();
    if (placeEdit.dragging) map.setView(dragStart(place), Math.max(map.getZoom(), 15));
  });
  const parts = [field("Name", "name", 60), field("Address", "address", 200), coordinates, drag];
  if (placeEdit.dragging) parts.push(el("p", "place-hint", "Drag the ★ on the map to the right spot. The Coordinates box follows it. Then click Save."));
  form.append(...parts, actions, note);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const { name, address, coordinates: typed } = placeEdit.draft;
    savePlaceEdit(place, name, address, typed);
  });
  return form;
}

function setEditNote(note, isError) {
  Object.assign(placeEdit, { note, isError: Boolean(isError) });
  renderPlaces();
}

// A changed address gets a new map spot from the geocoder. Then the Apps Script writes the row,
// but only if the row still holds what this page showed.
async function savePlaceEdit(place, name, address, coordinates) {
  if (!name.trim() || !address.trim()) {
    setEditNote("Give the place a name and an address.", true);
    return;
  }
  const plan = spotPlan(coordinates, place, address);
  if (plan.error) {
    setEditNote(plan.error, true);
    return;
  }
  placeEdit.busy = true;
  let body;
  try {
    const spot = plan.spot ?? (await spotFromAddress(address, setEditNote));
    setEditNote("Saving to the sheet…");
    body = editPlaceBody(place, name, address, spot);
    let reply;
    try {
      reply = await callScript(body);
    } catch (err) {
      // The call may have written. Read the sheet again and show what it holds.
      const sheet = await loadSheet();
      state.places = placesFromRows(sheet.places);
      const saved = editedPlaceIn(state.places, body.place);
      if (saved) return placeSaved(saved);
      throw new Error(`${err.message} The change was not saved. The list shows the sheet now.`);
    }
    if (!reply.ok && reply.error === "place_gone") {
      state.places = placesFromRows(reply.places);
      // A retry of an edit that went in finds the new values, not the old ones.
      const saved = editedPlaceIn(state.places, body.place);
      if (saved) return placeSaved(saved);
      closePlaceEdit();
      renderPlaces();
      renderList();
      setNote("Someone changed or removed this place first. Your change was not saved. The list shows the sheet now.", true);
      return;
    }
    if (!reply.ok) {
      throw new Error(reply.error === "busy" ? "The sheet is busy. Click Save again in a moment." : `The Apps Script said: ${reply.error}`);
    }
    const [saved] = placesFromRows([reply.place]);
    state.places = state.places.map((p) => (p === place ? saved : p));
    placeSaved(saved);
  } catch (err) {
    placeEdit.busy = false;
    if (state.places.includes(placeEdit.place)) setEditNote(err.message, true);
    else {
      closePlaceEdit();
      renderPlaces();
      setNote(err.message, true);
    }
  }
}

function placeSaved(saved) {
  closePlaceEdit();
  renderPlaces();
  renderList();
  setNote(`Saved ${saved.name}. Pin: ${saved.precision}.`);
  if (saved.spot) map.setView(saved.spot, Math.max(map.getZoom(), 13));
}

function setNote(text, isError) {
  placeNoteEl.textContent = text;
  placeNoteEl.classList.toggle("place-note--error", Boolean(isError));
}

function samePlace(a, b) {
  return a.name.toLowerCase() === b.name.toLowerCase() && a.address.toLowerCase() === b.address.toLowerCase();
}

// The geocoder's spot for a place address. say shows progress in the form the person is using.
async function spotFromAddress(address, say) {
  if ((await appConfig()).geocoding === false) {
    throw new Error("The geocoder is off in config.json. Paste the coordinates from Google Maps instead.");
  }
  if (!state.city) throw new Error("The Settings tab has no City. Add a City row with the city name, or paste the coordinates.");
  say("Finding the map spot…");
  // A place has no society or locality. Its address is the most exact text, so it goes first.
  const spot = await geocode({ society: address.trim(), city: state.city });
  if (!spot) throw new Error(`Could not find this address in ${state.city}. Try a shorter address, or paste the coordinates from Google Maps.`);
  return spot;
}

// Use the typed coordinates, or find the map spot on the local web server. Then write the place to the Places tab.
async function addPlace(event) {
  event.preventDefault();
  const name = placeFormEl.elements.name.value.trim();
  const address = placeFormEl.elements.address.value.trim();
  if (!name || !address) {
    setNote("Give the place a name and an address.", true);
    return;
  }
  const plan = spotPlan(placeFormEl.elements.coordinates.value);
  if (plan.error) {
    setNote(plan.error, true);
    return;
  }
  const button = placeFormEl.querySelector("button");
  button.disabled = true;
  try {
    const spot = plan.spot ?? (await spotFromAddress(address, setNote));
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

const societySummary = (add) => add.fields.find((f) => f.key === "society")?.value || "Reply read";

const ADD_STEPS = {
  link: { title: "Paste the listing link", body: linkStep, summary: (add) => add.link },
  claude: { title: "Ask Claude web", body: claudeStep, summary: (add) => (add.bookmarklet ? "Moved to the bookmarklet" : societySummary(add)) },
  bookmarklet: { title: "Read the page with the bookmarklet", body: bookmarkletStep, summary: societySummary },
  review: { title: "Check and save", body: reviewStep },
  hand: { title: "Fill in the listing", body: handStep },
};

// The bookmarklet step shows only once a reply fails or the person clicks "Reply looks wrong?".
// The hand form is one step on its own.
function stepKeys(add) {
  if (add.hand) return ["hand"];
  return add.bookmarklet ? ["link", "claude", "bookmarklet", "review"] : ["link", "claude", "review"];
}

// sure is the saved listing with the same link key. maybe holds saved listings with the same society and
// Configuration, and maybeOk is true once the person clicks "Save anyway".
// bookmarklet is true once the bookmarklet step is open. failure says why Claude web's reply failed.
// pageReplyText is Claude's reply in the bookmarklet step, and localText is the text for "Ask my local Claude".
// hand is true while the hand form is open. handFields and handLink keep what the person typed there,
// apart from the link steps, so a switch to the link steps and back loses nothing.
function freshAdd() {
  return {
    step: 0,
    link: "",
    replyText: "",
    fields: [],
    id: null,
    spot: undefined,
    error: "",
    busy: false,
    sure: null,
    maybe: [],
    maybeOk: false,
    hand: false,
    handFields: blankFields(),
    handLink: "",
    ...freshReading(),
  };
}

// Resets what the Claude web and bookmarklet steps hold, for a new link.
function freshReading() {
  return { bookmarklet: false, failure: "", pageReplyText: "", localText: "" };
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
  listViewEl.hidden = false;
}

function closeAddSteps() {
  state.add = null;
  hideAddSteps();
  addOpenEl.focus();
}

function goToStep(index) {
  Object.assign(state.add, { step: index, error: "", sure: null, maybe: [] });
  renderAddSteps();
}

function goToStepNamed(key) {
  goToStep(stepKeys(state.add).indexOf(key));
}

// Opens the bookmarklet step. failure is why the reply failed, or "" when the person asked for it.
function openBookmarkletStep(add, failure) {
  Object.assign(add, { bookmarklet: true, failure });
  goToStepNamed("bookmarklet");
}

// The steps are stacked. The current step is open, a done step folds to one line, and later steps are greyed out.
function renderAddSteps() {
  const add = state.add;
  addStepsEl.replaceChildren(
    ...stepKeys(add).map((key, index) => {
      const step = ADD_STEPS[key];
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
        // A save in flight keeps the steps as they are, so its result has somewhere to show.
        change.disabled = add.busy;
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
        item.append(...matchNotice(add));
      } else {
        item.classList.add("add-step--later");
      }
      return item;
    }),
  );
  document.getElementById("add-close").disabled = add.busy;
  // A match notice can sit below a long form, so focus goes to it and the whole notice comes into view.
  const notice = addStepsEl.querySelector(".add-match");
  (notice?.querySelector("button") ?? addStepsEl.querySelector(".add-step--open [data-focus]"))?.focus();
  notice?.scrollIntoView({ block: "nearest" });
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
  const byHand = el("button", "back-link add-switch", "No link? Fill in the listing by hand");
  byHand.type = "button";
  byHand.addEventListener("click", () => {
    // A link typed here goes with the person, so the hand form can keep it.
    if (input.value.trim() && !add.handLink.trim()) add.handLink = input.value.trim();
    add.hand = true;
    goToStep(0);
  });
  form.append(label, next, byHand);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const link = listingLink(input.value);
    if (!link) {
      add.error = "Paste a link that starts with https://, like the address of a 99acres page.";
      renderAddSteps();
      return;
    }
    // A new link is a new listing, so the reply, the values and the Listing id start again.
    if (link !== add.link) Object.assign(add, { link, replyText: "", fields: [], id: null, spot: undefined, maybeOk: false, ...freshReading() });
    // This runs before any Claude step, so nobody asks Claude about a listing that is already on the map.
    const sure = sureMatch(state.listings, link);
    if (sure) {
      Object.assign(add, { sure, error: "" });
      renderAddSteps();
      return;
    }
    goToStepNamed("claude");
  });
  return [form];
}

const CLAUDE_WEB = "https://claude.ai/new";

function newTabLink(text, href) {
  const link = el("a", "add-link", text);
  link.href = href;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  return link;
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
  const copyRow = el("div", "add-row");
  copyRow.append(copy, newTabLink("Open Claude web", CLAUDE_WEB), copied);

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
    if (result.unread) {
      openBookmarkletStep(add, result.error);
      return;
    }
    if (!result.ok) {
      add.error = result.error;
      renderAddSteps();
      return;
    }
    showReview(add, result.reply);
  });

  return [
    el("p", "add-hint", "Copy this prompt into a new chat on Claude web. Then paste Claude's reply below."),
    promptBox,
    copyRow,
    form,
    wrongReplyLink(add, () => {
      add.replyText = reply.value;
    }),
  ];
}

// The Listing id stays. A Save that failed may still have written the row, and the next Save must find it.
function showReview(add, reply) {
  Object.assign(add, { fields: reviewFields(reply), spot: undefined });
  goToStepNamed("review");
}

// The small "Reply looks wrong?" link. keep saves what the person typed in the open step first.
function wrongReplyLink(add, keep = () => {}) {
  const wrong = el("button", "back-link add-wrong", "Reply looks wrong? Read the page with the bookmarklet");
  wrong.type = "button";
  wrong.disabled = add.busy;
  wrong.addEventListener("click", () => {
    keep();
    openBookmarkletStep(add, "");
  });
  return wrong;
}

const BOOKMARKLET_HREF = bookmarkletHref();

// Steps 4 to 6 of the spec: the bookmarklet copies the step 2 prompt on the open listing page.
// The person pastes it into Claude web, or into the box for "Ask my local Claude".
function bookmarkletStep(add) {
  const parts = [];
  if (add.failure) parts.push(el("p", "add-error", `${add.failure} Read the page with the bookmarklet instead.`));

  const bookmark = el("a", "add-bookmarklet", "Rental map: read page");
  bookmark.href = BOOKMARKLET_HREF;
  bookmark.dataset.focus = "";
  const dragNote = el("span", "add-hint");
  dragNote.setAttribute("aria-live", "polite");
  // A click here would run the bookmarklet on this app, not on the listing page.
  bookmark.addEventListener("click", (event) => {
    event.preventDefault();
    dragNote.textContent = "Drag the button to the bookmarks bar. A click here does nothing.";
  });
  const bookmarkRow = el("div", "add-row");
  bookmarkRow.append(bookmark, dragNote);
  const openRow = el("div", "add-row");
  openRow.append(newTabLink("Open the listing page", add.link), newTabLink("Open Claude web", CLAUDE_WEB));
  parts.push(
    el("p", "add-hint", "Once: drag this button to the bookmarks bar in Chrome. If you do not see the bar, press Cmd+Shift+B."),
    bookmarkRow,
    el(
      "p",
      "add-hint",
      "Then open the listing page and click the bookmark. It copies a prompt with the page data. If it says to reload, reload the page and click it again.",
    ),
    openRow,
  );

  const webForm = el("form", "add-form");
  const webLabel = el("label");
  const webReply = el("textarea");
  webReply.rows = 5;
  webReply.placeholder = "Paste all of Claude's reply here";
  webReply.value = add.pageReplyText;
  webLabel.append(el("span", "", "Paste the prompt into a new chat on Claude web. Then paste Claude's reply here."), webReply);
  const read = el("button", "add-primary", "Read the reply");
  read.type = "submit";
  read.disabled = add.busy;
  webForm.append(webLabel, read);
  webForm.addEventListener("submit", (event) => {
    event.preventDefault();
    add.pageReplyText = webReply.value;
    const result = readReply(webReply.value);
    if (!result.ok) {
      add.error = result.unread ? `${result.error} Check that the bookmarklet ran on the listing page, then paste the new prompt.` : result.error;
      renderAddSteps();
      return;
    }
    showReview(add, result.reply);
  });

  const localForm = el("form", "add-form add-local");
  const localLabel = el("label");
  const localBox = el("textarea");
  localBox.rows = 4;
  localBox.placeholder = "Paste the prompt the bookmarklet copied";
  localBox.value = add.localText;
  localBox.addEventListener("input", () => {
    add.localText = localBox.value;
  });
  localLabel.append(el("span", "", "Have Claude Code on this computer? Paste the prompt here instead."), localBox);
  const ask = el("button", "add-secondary", add.busy ? "Asking local Claude…" : "Ask my local Claude");
  ask.type = "submit";
  ask.disabled = add.busy;
  const askNote = el("p", "add-hint");
  askNote.setAttribute("aria-live", "polite");
  if (add.busy) askNote.textContent = "This can take a minute. One run costs at most $0.10.";
  localForm.append(localLabel, ask, askNote);
  localForm.addEventListener("submit", (event) => {
    event.preventDefault();
    add.pageReplyText = webReply.value;
    requestLocalClaude(add);
  });

  parts.push(webForm, localForm);
  return parts;
}

// Sends the pasted text to the local web server, which runs claude -p. On any failure the pasted text stays in the box.
async function requestLocalClaude(add) {
  if (!add.localText.trim()) {
    add.error = "Paste the prompt the bookmarklet copied, then click Ask my local Claude.";
    renderAddSteps();
    return;
  }
  Object.assign(add, { busy: true, error: "" });
  renderAddSteps();
  let error = "";
  let reply = null;
  try {
    const res = await fetch("/api/local-claude", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: localClaudePrompt(add.localText) }),
    });
    const body = await res.json().catch(() => ({ ok: false, error: `The local web server answered HTTP ${res.status}.` }));
    if (body.ok) {
      const result = checkReply(body.reply);
      if (result.ok) reply = result.reply;
      else error = `${result.error} Check that the bookmarklet ran on the listing page.`;
    } else {
      error = body.error;
    }
  } catch {
    error = "Could not reach the local web server. Check that node server.js is still running.";
  }
  add.busy = false;
  if (state.add !== add) return;
  if (reply) {
    showReview(add, reply);
    return;
  }
  add.error = error;
  renderAddSteps();
}

// Long text fields get a box with more room.
const LONG_FIELDS = new Set(["otherDetails", "photos"]);

// One field of the review form or the hand form. A field with a pick list gets a drop-down in the hand form.
// The review form keeps a text box there, so a value Claude gave off the list stays in view to fix.
function formField(add, field, { focus, pick }) {
  const label = el("label", field.fixed ? "add-field add-field--fixed" : "add-field");
  const list = pick ? PICK_LISTS[field.key] : null;
  let input;
  if (list) {
    input = el("select");
    input.append(new Option("Not given", ""), ...list.map((choice) => new Option(choice, choice)));
  } else {
    input = el(LONG_FIELDS.has(field.key) ? "textarea" : "input");
    input.autocomplete = "off";
  }
  input.name = field.key;
  input.value = String(field.value);
  if (focus) input.dataset.focus = "";
  // Keep what the person types, so a "Change" and back does not lose it.
  input.addEventListener("input", () => {
    field.value = input.value;
    // "Save anyway" was for the old society and Configuration. A new one gets checked again.
    if (field.key === "society" || field.key === "configuration") add.maybeOk = false;
  });
  label.append(el("span", "", field.column), input);
  if (field.fixed) label.append(el("span", "add-fixed-note", "Fixed by the app"));
  return label;
}

function saveButton(add, form) {
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
}

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
  add.fields.forEach((field, index) => form.append(formField(add, field, { focus: index === 0, pick: false })));
  form.append(el("p", "add-hint", "If Lat or Long is empty, the app finds the map spot from the society and the locality."));
  saveButton(add, form);
  return [form, wrongReplyLink(add)];
}

// The hand form: every field a person can know, empty at start, and an optional link. No Claude step.
function handStep(add) {
  const back = el("button", "back-link add-switch", "Have a link? Let Claude read it");
  back.type = "button";
  back.disabled = add.busy;
  back.addEventListener("click", () => {
    add.hand = false;
    goToStep(0);
  });
  const form = el("form", "add-form add-review");
  form.append(el("p", "add-hint", "Fill in what you know. The society or the locality is needed. Nothing is saved until you click Save."));
  const linkLabel = el("label", "add-field");
  const link = el("input");
  link.name = "link";
  link.type = "url";
  link.autocomplete = "off";
  link.placeholder = "https://...";
  link.value = add.handLink;
  link.addEventListener("input", () => {
    add.handLink = link.value;
  });
  linkLabel.append(el("span", "", "Listing link (optional)"), link);
  // The app checks the link itself, so its message shows in place of the browser's.
  form.noValidate = true;
  form.append(linkLabel);
  add.handFields.forEach((field, index) => form.append(formField(add, field, { focus: index === 0, pick: true })));
  form.append(
    el("p", "add-hint", "Lat and Long: right-click the spot in Google Maps to copy them. Leave them empty to find the spot from the society and the locality."),
  );
  saveButton(add, form);
  return [back, form];
}

// A sure match blocks the add and has only "Open it". A maybe-match has "Open it" for each listing and "Save anyway".
// "Open it" opens the details even when the filters hide the listing, like a Rejected one.
function matchNotice(add) {
  if (!add.sure && !add.maybe.length) return [];
  const box = el("div", "add-match");
  box.setAttribute("role", "alert");
  const lines = add.sure ? [[sureMatchMessage(add.sure), add.sure]] : add.maybe.map((l) => [maybeMatchMessage(l), l]);
  for (const [text, listing] of lines) {
    const open = el("button", "add-secondary", "Open it");
    open.type = "button";
    open.setAttribute("aria-label", `Open it: ${listing.society || NOT_GIVEN}`);
    open.addEventListener("click", () => openDetails(listing.id));
    const line = el("div", "add-match-line");
    line.append(el("p", "add-match-text", text), open);
    box.append(line);
  }
  if (!add.sure) {
    const anyway = el("button", "add-primary", "Save anyway");
    anyway.type = "button";
    anyway.disabled = add.busy;
    anyway.addEventListener("click", () => {
      add.maybeOk = true;
      saveListing(add);
    });
    box.append(anyway);
  }
  return [box];
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
  const values = Object.fromEntries((add.hand ? add.handFields : add.fields).map((f) => [f.key, String(f.value)]));
  const problems = fieldProblems(values);
  if (add.hand) {
    // An empty link is fine. A listing with no link has no link key, so only the maybe-match runs for it.
    const link = add.handLink.trim() ? listingLink(add.handLink) : "";
    if (link === null) problems.unshift("Paste a link that starts with https://, or leave the link empty.");
    else add.link = link;
    problems.unshift(...handProblems(values));
  }
  if (problems.length) {
    Object.assign(add, { error: problems.join(" "), sure: null, maybe: [] });
    renderAddSteps();
    return;
  }
  // A past Save may have met the Apps Script check, which put the saved row in state.listings.
  const sure = sureMatch(
    state.listings.filter((l) => l.id !== add.id),
    add.link,
  );
  const maybe = sure || add.maybeOk ? [] : maybeMatches(state.listings, values, add.id);
  if (sure || maybe.length) {
    Object.assign(add, { error: "", sure, maybe });
    renderAddSteps();
    return;
  }
  Object.assign(add, { busy: true, error: "", sure: null, maybe: [] });
  renderAddSteps();
  const say = (text) => {
    const note = addStepsEl.querySelector(".add-save-note");
    if (note) note.textContent = text;
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
    // Someone saved the same link since this page loaded. Nothing was written, and the form keeps its values.
    if (!reply.ok && reply.error === ALREADY_ON_MAP && reply.listing) {
      const [found] = listingsFromRows([reply.listing]);
      // A row typed in with no Listing id gets a stand-in id from its place in the list it came in, which is wrong here.
      if (!found.row["Listing id"]) found.id = `no-id-${crypto.randomUUID()}`;
      state.listings = sortByCost([...state.listings.filter((l) => l.id !== found.id), found]);
      renderList();
      Object.assign(add, { busy: false, sure: found });
      if (state.add === add) renderAddSteps();
      return;
    }
    if (!reply.ok) {
      throw new Error(reply.error === "busy" ? "The sheet is busy. Click Save again in a moment." : `The Apps Script said: ${reply.error}`);
    }
    const [saved] = listingsFromRows([reply.listing]);
    state.listings = sortByCost([...state.listings.filter((l) => l.id !== saved.id), saved]);
    const problem = add.spot.problem;
    closeAddSteps();
    renderList();
    openDetails(saved.id, { notice: saved.spot ? "" : `Saved, with no map spot. ${problem}` });
  } catch (err) {
    add.busy = false;
    add.error = err.message;
    if (state.add === add) renderAddSteps();
  }
}

function setUpAddSteps() {
  addOpenEl.addEventListener("click", openAddSteps);
  detailsBackEl.addEventListener("click", closeDetails);
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
  listViewEl.hidden = key !== "listings";
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

// With the geocoder off in config.json, only typed coordinates give a spot, so the form says so up front.
async function setUpPlaceForm() {
  placeFormEl.addEventListener("submit", addPlace);
  if ((await appConfig()).geocoding === false) {
    setNote("The geocoder is off in config.json. Paste the coordinates from Google Maps to add a place.", true);
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
