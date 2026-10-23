// Turns sheet rows into listings for the list and the map. No DOM here, so tests can run it in Node.

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

function toText(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

export function formatRupees(amount) {
  return amount === null ? NOT_GIVEN : "₹" + rupeeDigits.format(amount);
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
      rent,
      totalCost: totalCostOf(row, rent),
      overallRating: toNumber(row["Overall rating"]),
      photo: toText(row.Photos).split(";").map((s) => s.trim()).find(Boolean) ?? "",
      spot: lat !== null && long !== null ? [lat, long] : null,
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
