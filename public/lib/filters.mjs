// The filter bar rules, from "Screen > Filters" in SPEC.md. No DOM here, so tests can run it in Node.
// Filters belong to one person. They live in memory only and reset each time the app opens.
import { toNumber } from "./listings.mjs";

export const CONFIGURATIONS = ["1RK", "1BHK", "2BHK", "3BHK", "4BHK+"];
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

// "2bhk" typed by hand still matches the 2BHK box.
function configurationKey(configuration) {
  return configuration.toUpperCase().replace(/\s+/g, "");
}

function passes(listing, filters, search) {
  const cost = costToCheck(listing);
  if (filters.maxCost !== null && cost !== null && cost > filters.maxCost) return false;

  // A listing with no Configuration, or one outside the 5 boxes, has nothing to check.
  const key = configurationKey(listing.configuration);
  if (CONFIGURATIONS.includes(key) && !filters.configurations.has(key)) return false;

  if (filters.shortlistedOnly && listing.status !== "Shortlisted") return false;
  if (!filters.showRejected && listing.status === "Rejected") return false;

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
