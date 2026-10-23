// Turns sheet rows into listings for the list and the map. No DOM here, so tests can run it in Node.
import { PERSON_RATING_COLUMNS } from "./columns.mjs";

export const NOT_GIVEN = "not given";
const rupeeDigits = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

// A hand-typed cell can hold "38,999" or "₹38,999" as text. An empty cell is null.
export function toNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[₹,\s]/g, "");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

// The Shortlisted tick box. The sheet holds true or false. A hand-typed "yes" or "TRUE" counts too.
export function isTicked(value) {
  if (typeof value === "boolean") return value;
  return ["true", "yes", "y", "1"].includes(toText(value).toLowerCase());
}

export function toText(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

// Photos, Pros and Cons hold items split by ";".
export function splitItems(value) {
  return toText(value)
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function formatRupees(amount) {
  return amount === null ? NOT_GIVEN : "₹" + rupeeDigits.format(amount);
}

export function formatRating(rating) {
  return rating === null ? NOT_GIVEN : `${Math.round(rating * 10) / 10} / 5`;
}

export function formatOurRating(rating) {
  return rating === null ? NOT_GIVEN : `${Math.round(rating * 100) / 100} / 10`;
}

// The average of Dimple's and Abhishek's ratings, each 0 to 10. Only filled cells count. None filled is null.
export function ourRatingOf(row) {
  const ratings = PERSON_RATING_COLUMNS.map((column) => toNumber(row[column])).filter((n) => n !== null);
  return ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null;
}

// The two ratings as one line for a card or the details: ours out of 10, then the other 5 averaged out of 5.
export function ratingsText(listing) {
  return `Ours ${formatOurRating(listing.ourRating)} · Others ${formatRating(listing.overallRating)}`;
}

// The cheapest and the dearest total cost of all listings, or null when none has a cost.
export function costRange(listings) {
  const all = listings.map((l) => l.totalCost).filter((cost) => cost !== null);
  return all.length ? { min: Math.min(...all), max: Math.max(...all) } : null;
}

// The sheet holds Total monthly cost once the Apps Script writes the listing.
// A row typed in by hand may not have it yet, so fall back to rent plus maintenance.
function totalCostOf(row, rent) {
  const total = toNumber(row["Total monthly cost"]);
  if (total !== null) return total;
  if (rent === null) return null;
  return rent + (toNumber(row["Maintenance (₹/month)"]) ?? 0);
}

export function listingsFromRows(rows) {
  return rows.map((row, index) => {
    const rent = toNumber(row["Rent (₹/month)"]);
    const lat = toNumber(row.Lat);
    const long = toNumber(row.Long);
    return {
      id: toText(row["Listing id"]) || `row-${index + 2}`,
      society: toText(row["Society / building name"]),
      locality: toText(row.Locality),
      configuration: toText(row.Configuration),
      status: toText(row.Status),
      shortlisted: isTicked(row.Shortlisted),
      rent,
      maintenance: toNumber(row["Maintenance (₹/month)"]),
      totalCost: totalCostOf(row, rent),
      overallRating: toNumber(row["Overall rating"]),
      ourRating: ourRatingOf(row),
      photo: splitItems(row.Photos)[0] ?? "",
      spot: lat !== null && long !== null ? [lat, long] : null,
      precision: toText(row["Pin precision"]).toLowerCase(),
      link: toText(row["Listing link"]),
      // The details view shows every column, so keep the sheet row as it came.
      row,
    };
  });
}

// Lowest total cost first. A listing with no rent goes last. Ties keep sheet order.
export function sortByCost(listings) {
  const key = (l) => (l.rent === null || l.totalCost === null ? Infinity : l.totalCost);
  return [...listings].sort((a, b) => (key(a) === key(b) ? 0 : key(a) - key(b)));
}

function shortRupees(amount) {
  const thousands = Math.round(amount / 100) / 10;
  return `₹${thousands}k`;
}

export function pinLabel(listing) {
  const parts = [];
  if (listing.totalCost !== null) parts.push(shortRupees(listing.totalCost));
  if (listing.configuration) parts.push(listing.configuration);
  return parts.length ? parts.join(" · ") : NOT_GIVEN;
}

export function settingsFromRows(rows) {
  const settings = {};
  for (const row of rows) {
    const name = toText(row.Setting);
    if (name) settings[name] = row.Value;
  }
  return settings;
}

// The site a Listing link points at, for the small tag on the card and the details.
// key is 99acres, housing or other. No link, or one that is not a web link, has no source.
export function listingSource(link) {
  let host;
  try {
    const url = new URL(toText(link));
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    host = url.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
  if (host === "99acres.com" || host.endsWith(".99acres.com")) return { key: "99acres", label: "99acres" };
  if (host === "housing.com" || host.endsWith(".housing.com")) return { key: "housing", label: "Housing.com" };
  return { key: "other", label: host };
}

// The Furnishing cell as full, semi or none, so each gets its own colour. A hand-typed
// "semi furnished" or "furnished" still counts. Anything else, or an empty cell, is null.
export function furnishingKind(value) {
  const text = toText(value).toLowerCase().replace(/[^a-z]/g, "");
  if (!text) return null;
  if (text.startsWith("semi")) return "semi";
  if (text.startsWith("un") || text === "notfurnished") return "none";
  if (text === "furnished" || text.startsWith("full")) return "full";
  return null;
}
