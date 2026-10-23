// The filter bar rules, from "Screen > Filters" in SPEC.md. No DOM here, so tests can run it in Node.
// Filters belong to one person. They live in memory only and reset each time the app opens.
import { CONFIGURATIONS } from "./columns.mjs";
import { toNumber } from "./listings.mjs";

export { CONFIGURATIONS };
const BUDGET_SETTING = "Budget (₹/month)";

// An empty Budget cell means no cap.
export function budgetFrom(settings) {
  return toNumber(settings[BUDGET_SETTING]);
}

export function startFilters(budget) {
  return {
    maxCost: budget,
    configurations: new Set(CONFIGURATIONS),
    shortlistedOnly: false,
    showRejected: false,
    search: "",
  };
}

// Total monthly cost, or Rent alone when Maintenance is empty. No Rent means nothing to check.
function costToCheck(listing) {
  if (listing.rent === null) return null;
  return listing.maintenance === null ? listing.rent : listing.totalCost;
}

// "2bhk" or "rejected " typed by hand still matches.
function sameWord(text) {
  return text.toUpperCase().replace(/\s+/g, "");
}
const SHORTLISTED = sameWord("Shortlisted");
const REJECTED = sameWord("Rejected");

function passes(listing, filters, search) {
  const cost = costToCheck(listing);
  if (filters.maxCost !== null && cost !== null && cost > filters.maxCost) return false;

  // A listing with no Configuration, or one outside the 5 boxes, has nothing to check.
  const key = sameWord(listing.configuration);
  if (CONFIGURATIONS.includes(key) && !filters.configurations.has(key)) return false;

  const status = sameWord(listing.status);
  if (filters.shortlistedOnly && status !== SHORTLISTED) return false;
  if (!filters.showRejected && status === REJECTED) return false;

  if (search) {
    const text = `${listing.society}\n${listing.locality}`.toLowerCase();
    if (!text.includes(search)) return false;
  }
  return true;
}

export function filterListings(listings, filters) {
  const search = filters.search.trim().toLowerCase();
  return listings.filter((listing) => passes(listing, filters, search));
}

export function isOverBudget(listing, budget) {
  return budget !== null && listing.totalCost !== null && listing.totalCost > budget;
}
