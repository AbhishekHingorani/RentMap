// What the listing details view shows, from "Screen > Listing details" in SPEC.md. No DOM here.
import { TRACKER_COLUMNS } from "./columns.mjs";
import { NOT_GIVEN, formatRating, formatRupees, splitItems, toNumber, toText } from "./listings.mjs";

// The Tracker columns each details tab shows, in sheet order.
export const MONEY_COLUMNS = ["Rent (₹/month)", "Maintenance (₹/month)", "Total monthly cost", "Deposit", "Brokerage fee"];
export const FLAT_COLUMNS = [
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
];
export const RATING_COLUMNS = ["Safety", "Water supply", "Location", "Condition", "Natural light"];
export const CONTACT_COLUMNS = ["Listed by", "Broker name", "Broker phone", "Owner name", "Owner phone"];

// How far a rough pin may be from the home, in metres. The spec gives no size, so these are a fair guess.
// A building pin is exact, so it has no circle.
export const ROUGH_PIN_RADIUS_M = { society: 250, locality: 1500 };

// The value of one Tracker column as the screen shows it.
export function fieldText(listing, column) {
  // These two can be worked out before the Apps Script writes them, so show the same value as the card.
  if (column === "Total monthly cost") return formatRupees(listing.totalCost);
  if (column === "Overall rating") return formatRating(listing.overallRating);

  const raw = listing.row[column];
  if (MONEY_COLUMNS.includes(column)) {
    const amount = toNumber(raw);
    if (amount !== null) return formatRupees(amount);
  }
  return toText(raw) || NOT_GIVEN;
}

export function allFields(listing) {
  return TRACKER_COLUMNS.map((column, index) => ({
    number: index + 1,
    column,
    value: fieldText(listing, column),
  }));
}

// A society or locality pin is only near the home, so the map draws a dashed circle round it.
export function isRoughPin(listing) {
  return Object.hasOwn(ROUGH_PIN_RADIUS_M, listing.precision);
}

export function photoLinks(listing) {
  return splitItems(listing.row.Photos);
}

// Pros and Cons, one item each.
export function itemsOf(listing, column) {
  return splitItems(listing.row[column]);
}

// The number of balconies, read from Other details, since the sheet has no Balcony column. Claude writes it
// as "Balcony: 1", "Balconies: 2", "2 balconies" or "0 balcony". Returns null when the text does not say.
export function balconiesOf(listing) {
  const text = toText(listing.row["Other details"]);
  const match = text.match(/balcon(?:y|ies)\s*:\s*(\d+)/i) ?? text.match(/(\d+)\s*balcon/i);
  if (match) return Number(match[1]);
  return /\bno balcon/i.test(text) ? 0 : null;
}

export function balconyText(count) {
  if (count === null) return `Balcony ${NOT_GIVEN}`;
  if (count === 0) return "No balcony";
  return count === 1 ? "1 balcony" : `${count} balconies`;
}

// "2 of 10" reads as "Floor 2 of 10".
export function floorText(listing) {
  const floor = toText(listing.row["Floor / total floors"]);
  return floor ? `Floor ${floor}` : `Floor ${NOT_GIVEN}`;
}
