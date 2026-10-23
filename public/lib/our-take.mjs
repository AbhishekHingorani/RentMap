// The Our take tab rules, from "Edit a listing" and "Two people edit one listing" in SPEC.md. No DOM here.
// A click sends one changed cell with the value the person saw. The Apps Script refuses it if the cell
// in the sheet differs now. Pros and Cons send "add one item" or "remove one item", which never clash.
import { splitItems, toText } from "./listings.mjs";

// The Apps Script replies with these errors when it refuses a save.
export const CLASH = "clash";
export const ROW_GONE = "row_gone";
export const BUSY = "busy";

// The list cells the Our take tab changes one item at a time. Notes wait for the owner to decide
// how notes are split inside the Notes cell. See "Known gaps" in SPEC.md. Code.gs has the same list.
export const ITEM_COLUMNS = ["Pros", "Cons"];

const ITEM_NAMES = { Pros: "pro", Cons: "con" };

// "pro" for Pros and "con" for Cons, for the words on the screen.
export function itemName(column) {
  return ITEM_NAMES[column] ?? "item";
}

// One cell for a saveCells call. old is the value as the page got it from the sheet.
export function cellChange(listing, column, value) {
  const seen = listing.row[column];
  return { column, old: seen === undefined || seen === null ? "" : seen, new: value };
}

// A click on the rating the listing has now clears it. Any other click sets it.
export function ratingAfterClick(current, picked) {
  return current === picked ? "" : picked;
}

// What the screen shows for the person's own rating cell, as a whole number 1 to 5, or null.
export function ratingValue(value) {
  const n = Number(toText(value));
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
}

// Apps Script cannot import, so Code.gs copies addItem and removeItem. tests/apps-script.test.mjs checks they agree.
export function addItem(cell, item) {
  return [...splitItems(cell), item.trim()].join("; ");
}

// Removes the first item that matches. An item that is already gone leaves the cell as it is.
export function removeItem(cell, item) {
  const items = splitItems(cell);
  const at = items.indexOf(item.trim());
  if (at !== -1) items.splice(at, 1);
  return items.join("; ");
}

// Why a typed pro or con cannot be added, or "" when it can.
export function itemProblem(column, item) {
  const name = itemName(column);
  if (!item.trim()) return `Type a ${name} first.`;
  if (item.includes(";")) return `A ${name} cannot hold a ";". The sheet uses ";" to split the items.`;
  return "";
}

// The message for a refused save. reply is the Apps Script reply with ok false.
export function refusalMessage(reply) {
  if (reply.error === CLASH) {
    const column = reply.clashes?.[0] ?? "";
    const now = toText(reply.listing?.[column]);
    const change = now ? `changed ${column} to ${now}` : `cleared ${column}`;
    return `Someone ${change}. Your change was not saved.`;
  }
  if (reply.error === ROW_GONE) return "This listing is no longer in the sheet.";
  if (reply.error === BUSY) return "The sheet is busy. Your change was not saved. Click again in a moment.";
  return `The Apps Script said: ${reply.error}. Your change was not saved.`;
}
