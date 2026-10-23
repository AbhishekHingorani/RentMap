// Add a listing by link, from "Add a listing by link" in SPEC.md. No DOM here, so tests can run it in Node.
// The person pastes a link, copies the step 1 prompt into Claude web, and pastes Claude's reply back.
// This module makes the prompt, reads the reply, fixes values in the wrong format and builds the new row.
import { CONFIGURATIONS } from "./columns.mjs";
import { toNumber, toText } from "./listings.mjs";

// Each fixed key in Claude's reply and its Tracker column, in reply order.
export const REPLY_COLUMNS = {
  society: "Society / building name",
  locality: "Locality",
  configuration: "Configuration",
  listedBy: "Listed by",
  brokerName: "Broker name",
  rent: "Rent (₹/month)",
  maintenance: "Maintenance (₹/month)",
  deposit: "Deposit",
  brokerage: "Brokerage fee",
  carpetArea: "Carpet area (sq ft)",
  superArea: "Super built-up area (sq ft)",
  bathrooms: "Bathrooms",
  floor: "Floor / total floors",
  furnishing: "Furnishing",
  parking: "Parking",
  lift: "Lift",
  availableFrom: "Available from",
  otherDetails: "Other details",
  photos: "Photos",
  lat: "Lat",
  long: "Long",
};

const NUMBER_KEYS = ["rent", "maintenance", "deposit", "brokerage", "carpetArea", "superArea", "bathrooms", "lat", "long"];
const LISTED_BY = ["Owner", "Dealer"];
const FURNISHINGS = ["Unfurnished", "Semi-furnished", "Fully furnished"];
const YES_NO = ["Yes", "No"];

// The words may change. The keys must stay as REPLY_COLUMNS has them.
export function stepOnePrompt(link) {
  return [
    `Open this rental listing: ${link}`,
    "Reply with one JSON object in a ```json block and nothing else.",
    "Keys: society, locality, configuration (1RK|1BHK|2BHK|3BHK|4BHK+),",
    "listedBy (Owner|Dealer), brokerName, rent, maintenance, deposit,",
    "brokerage (numbers in rupees), carpetArea, superArea (sq ft),",
    'bathrooms, floor (like "4 of 4"),',
    "furnishing (Unfurnished|Semi-furnished|Fully furnished),",
    "parking (Yes|No), lift (Yes|No), availableFrom, otherDetails,",
    "photos (full-size image links of this flat only), lat, long.",
    "Write null for anything the page does not show. Do not guess.",
    'If you cannot open the page, reply {"error": "could_not_read"}.',
  ].join("\n");
}

// Only an http or https link can be a listing page.
export function listingLink(text) {
  try {
    const url = new URL(toText(text));
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

const NO_JSON = "The reply has no JSON. Copy all of Claude's reply, with the ```json block, and paste it here.";
const COULD_NOT_READ = "Claude could not read the listing page.";
const NO_RENT_OR_LOCALITY = "Claude's reply has no rent and no locality, so it most likely did not read the page.";

// Reads the ```json block of Claude's reply. A reply with no block is read whole, for a bare JSON object.
// Returns { ok: true, reply } or { ok: false, error }.
export function readReply(text) {
  const raw = toText(text);
  const block = raw.match(/```json\s*([\s\S]*?)```/i);
  let reply;
  try {
    reply = JSON.parse(block ? block[1] : raw);
  } catch {
    return { ok: false, error: NO_JSON };
  }
  if (!reply || typeof reply !== "object" || Array.isArray(reply)) return { ok: false, error: NO_JSON };
  if (reply.error === "could_not_read") return { ok: false, error: COULD_NOT_READ };
  if (isEmpty(reply.rent) && isEmpty(reply.locality)) return { ok: false, error: NO_RENT_OR_LOCALITY };
  return { ok: true, reply };
}

function isEmpty(value) {
  return value === null || value === undefined || toText(value) === "";
}

// Letters and digits only, so "Semi furnished" and "semi-furnished" compare the same.
function squash(text) {
  return toText(text).toLowerCase().replace(/[^a-z0-9+]/g, "");
}

function pickFrom(choices, value) {
  return choices.find((choice) => squash(choice) === squash(value)) ?? null;
}

function configurationOf(value) {
  const found = pickFrom(CONFIGURATIONS, value);
  if (found) return found;
  const bhk = squash(value).match(/^(\d+)bhk\+?$/);
  if (bhk && Number(bhk[1]) >= 4) return "4BHK+";
  return null;
}

function furnishingOf(value) {
  const found = pickFrom(FURNISHINGS, value);
  if (found) return found;
  if (squash(value) === "furnished") return "Fully furnished";
  if (squash(value) === "semifurnish") return "Semi-furnished";
  return null;
}

function listedByOf(value) {
  const found = pickFrom(LISTED_BY, value);
  if (found) return found;
  return ["broker", "agent"].includes(squash(value)) ? "Dealer" : null;
}

function yesNoOf(value) {
  if (value === true) return "Yes";
  if (value === false) return "No";
  return pickFrom(YES_NO, value);
}

// One value as the Tracker column wants it, and whether it had to change.
// A value that cannot be fixed stays as it came, so the person sees it and can fix it.
export function fixValue(key, value) {
  if (value === null || value === undefined) return { value: "", fixed: false };
  if (key === "photos") {
    // Site photo links stay as they are. Nothing is copied into Drive.
    const links = Array.isArray(value) ? value : toText(value).split(";");
    return { value: links.map(toText).filter(Boolean).join("; "), fixed: false };
  }
  if (NUMBER_KEYS.includes(key)) {
    if (typeof value === "number") return { value: Number.isFinite(value) ? value : "", fixed: false };
    const n = toNumber(value);
    return n === null ? { value: toText(value), fixed: false } : { value: n, fixed: true };
  }
  const text = toText(value);
  const fix = { configuration: configurationOf, furnishing: furnishingOf, listedBy: listedByOf, parking: yesNoOf, lift: yesNoOf }[key];
  const fixedText = fix ? fix(value) : null;
  if (fixedText === null) return { value: text, fixed: typeof value !== "string" };
  return { value: fixedText, fixed: fixedText !== value };
}

// The review form: one field per reply key, with the fixed value and a yellow mark when it changed.
export function reviewFields(reply) {
  return Object.entries(REPLY_COLUMNS).map(([key, column]) => ({ key, column, ...fixValue(key, reply[key]) }));
}

// Pin precision for a spot the listing page gives. The page puts the pin on this home, so it is the building.
export const PAGE_PIN_PRECISION = "building";

// The new Tracker row, keyed by column. values holds the review form, keyed by reply key.
// The page fills Status, Listing link, Date added and Added by. The Apps Script fills the two worked-out columns.
export function newListingRow({ id, values, link, addedBy, today, spot }) {
  const row = { "Listing id": id };
  for (const [key, column] of Object.entries(REPLY_COLUMNS)) {
    if (key === "lat" || key === "long") continue;
    row[column] = fixValue(key, values[key]).value;
  }
  row.Status = "To call";
  row["Listing link"] = link;
  row.Lat = spot ? spot.lat : "";
  row.Long = spot ? spot.long : "";
  row["Pin precision"] = spot ? spot.precision : "";
  row["Date added"] = today;
  row["Added by"] = addedBy;
  return row;
}

// The spot the listing page gives, or null when Lat or Long is missing and the app must geocode.
export function pageSpot(values) {
  const lat = toNumber(values.lat);
  const long = toNumber(values.long);
  return lat === null || long === null ? null : { lat, long, precision: PAGE_PIN_PRECISION };
}

// Date added as YYYY-MM-DD, in the person's own time zone.
export function dateText(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
