// Spot a listing added twice, from "Same listing added twice" in SPEC.md. No DOM here, so tests can run it in Node.
// A sure match has the same link key and blocks the add. A maybe-match has the same society and Configuration
// and only warns. Both checks look at every saved listing, Rejected ones too.
import { NOT_GIVEN, formatRupees, toText } from "./listings.mjs";
import { dateText, fixValue } from "./add-listing.mjs";
import { isRejected } from "./filters.mjs";

// The error the Apps Script sends when a new listing's link key is already in the sheet.
export const ALREADY_ON_MAP = "already_on_map";

// The key of a Listing link. For 99acres it is the spid- part, like M93900012, because one flat can have
// many 99acres links. For other sites it is the link without its ?... and #... tail. No link has no key.
// apps-script/Code.gs copies this, because Apps Script cannot import. Keep the two the same.
export function linkKey(link) {
  const text = toText(link);
  if (!text) return null;
  const bare = text.split(/[?#]/)[0];
  const spid = /^https?:\/\/([^/]+\.)?99acres\.com\//i.test(bare) ? bare.match(/spid-([A-Za-z0-9]+)/) : null;
  return spid ? spid[1] : bare;
}

// The saved listing with the same link key, or null.
export function sureMatch(listings, link) {
  const key = linkKey(link);
  if (key === null) return null;
  return listings.find((listing) => linkKey(listing.link) === key) ?? null;
}

// Saved listings with the same society (case does not matter) and the same Configuration. Rent is not
// compared, because two sites can show different rents for one flat. A listing with no society matches none.
// A hand-typed "2 BHK" in the sheet is the same Configuration as 2BHK.
// values holds the review form, keyed by reply key. ownId is the new listing's id, which a past Save may have written.
export function maybeMatches(listings, values, ownId) {
  const society = toText(values.society).toLowerCase();
  if (!society) return [];
  const configuration = fixValue("configuration", values.configuration).value;
  return listings.filter(
    (listing) =>
      listing.id !== ownId &&
      listing.society.toLowerCase() === society &&
      fixValue("configuration", listing.configuration).value === configuration,
  );
}

// A listing the map hides by default gets its Status named, so the person knows why they did not see it.
function statusPart(listing) {
  return isRejected(listing) ? " (Rejected)" : "";
}

// The sheet turns a written "2026-10-23" into a date cell, and the Apps Script sends it back as a UTC
// timestamp, like 2026-10-22T18:30:00.000Z for midnight in India. Show it as the local day.
export function dayText(value) {
  const text = toText(value);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(text)) return text;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? text : dateText(date);
}

export function sureMatchMessage(listing) {
  const row = listing.row;
  const name = toText(row["Added by"]) || NOT_GIVEN;
  const date = dayText(row["Date added"]) || NOT_GIVEN;
  return `Already on the map${statusPart(listing)}: ${listing.society || NOT_GIVEN}, added by ${name} on ${date}.`;
}

export function maybeMatchMessage(listing) {
  const floor = toText(listing.row["Floor / total floors"]) || NOT_GIVEN;
  const parts = [listing.society || NOT_GIVEN, listing.configuration || NOT_GIVEN, formatRupees(listing.rent), floor];
  return `This might be the same as${statusPart(listing)}: ${parts.join(", ")}.`;
}
