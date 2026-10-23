// The Edit form and Move pin on the "All 40 fields" tab, from "Edit a listing" and "Two people edit one listing"
// in SPEC.md. No DOM here. Save sends only the changed cells, each with the value the person saw.
// A refused save keeps what the person typed and marks each clashing cell with the sheet value now.
import { TRACKER_COLUMNS } from "./columns.mjs";
import { toText } from "./listings.mjs";
import { REPLY_COLUMNS, fieldProblems, fixValue } from "./add-listing.mjs";
import { cellChange } from "./our-take.mjs";

// These never change in the Edit form. The app or the Apps Script fills them, and Move pin changes Lat and Long.
export const LOCKED_COLUMNS = [
  "Listing id",
  "Listing link",
  "Total monthly cost",
  "Overall rating",
  "Date added",
  "Added by",
  "Lat",
  "Long",
  "Pin precision",
];

// The Our take tab changes these. The list cells change one item at a time, so a whole-cell save cannot touch them.
export const OUR_TAKE_COLUMNS = [
  "Status",
  "Safety",
  "Water supply",
  "Location",
  "Condition",
  "Natural light",
  "Pros",
  "Cons",
  "Notes",
  "Photos",
];

// The cells the Edit form makes editable, in sheet order: the Claude-filled cells and the 3 contact cells
// a person fills by hand, because no other part of the app can change those.
export const EDIT_COLUMNS = TRACKER_COLUMNS.filter((c) => !LOCKED_COLUMNS.includes(c) && !OUR_TAKE_COLUMNS.includes(c));

// The reply key of each Claude-filled column, so the form fixes "2 BHK" and "38,999" as the add form does.
const KEY_OF = Object.fromEntries(Object.entries(REPLY_COLUMNS).map(([key, column]) => [column, key]));

// The form as it opens. base holds each cell as the person saw it, and goes to the Apps Script as the old value.
// values holds the text in each box. clashes holds the sheet value of each cell a refused save named.
export function editForm(row) {
  const base = {};
  const values = {};
  for (const column of EDIT_COLUMNS) {
    base[column] = row[column] ?? "";
    values[column] = toText(row[column]);
  }
  return { base, values, clashes: {} };
}

function changed(form, column) {
  return form.values[column] !== toText(form.base[column]);
}

// The cells to send, as { column, old, new }, and one message for each value Save must refuse.
// A box the person did not touch is not sent, even when the sheet holds it in another format, like "3,000".
export function editCells(form) {
  const cells = [];
  const problems = [];
  for (const column of EDIT_COLUMNS) {
    if (!changed(form, column)) continue;
    const key = KEY_OF[column];
    const typed = form.values[column];
    if (key) problems.push(...fieldProblems({ [key]: typed }));
    const value = key ? fixValue(key, typed).value : typed.trim();
    cells.push({ column, old: form.base[column], new: value });
  }
  return { cells, problems };
}

// After a clash: each clashing cell gets the sheet value as its old value, so the next Save sends that.
// The box keeps what the person typed. A box the person did not touch shows the sheet value now.
export function applyClash(form, reply) {
  const now = reply.listing ?? {};
  for (const column of EDIT_COLUMNS) {
    const sheet = now[column] ?? "";
    if (reply.clashes?.includes(column)) {
      form.clashes[column] = sheet;
      form.base[column] = sheet;
    } else if (!changed(form, column)) {
      form.base[column] = sheet;
      form.values[column] = toText(sheet);
    }
  }
  return form;
}

// "Use sheet value": the box takes the sheet value, so Save does not send this cell.
export function useSheetValue(form, column) {
  form.values[column] = toText(form.clashes[column]);
  delete form.clashes[column];
}

// "Keep mine": the box keeps what the person typed. Its old value is already the sheet value.
export function keepMine(form, column) {
  delete form.clashes[column];
}

// 6 decimals is about 10 cm, much finer than a person can drop a pin.
function roundSpot(n) {
  return Math.round(n * 1e6) / 1e6;
}

// A dropped pin sends Lat and Long with the values the person saw. The person put the pin on the home,
// so its Pin precision is building and the dashed circle goes away.
export function pinCells(listing, latLng) {
  return [
    cellChange(listing, "Lat", roundSpot(latLng.lat)),
    cellChange(listing, "Long", roundSpot(latLng.lng)),
    cellChange(listing, "Pin precision", "building"),
  ];
}

// The message for an Edit save that a clash refused.
export function editClashMessage(reply) {
  const n = reply.clashes?.length ?? 0;
  const cells = n === 1 ? "1 cell" : `${n} cells`;
  return `Someone changed ${cells} since you opened the form, so nothing was saved. Pick "Use sheet value" or "Keep mine" for each marked cell, then click Save.`;
}

export const PIN_CLASH_MESSAGE = "Someone moved this pin first. It is back on the spot in the sheet. Your change was not saved.";
