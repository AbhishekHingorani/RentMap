// The filter bar rules, from "Screen > Filters" in SPEC.md. No DOM here, so tests can run it in Node.
// Filters belong to one person. They live in memory only and reset each time the app opens.
import { CONFIGURATIONS } from "./columns.mjs";
import { costRange, formatRupees, toNumber } from "./listings.mjs";

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
    unreviewedOnly: false,
    minScore: null,
    search: "",
  };
}

// Filter by has 3 dropdowns that work together: Price, Distance score and Shortlist.
// Each choice has a value for the <option> and the filter field it sets.

// The price steps are this far apart.
const PRICE_STEP = 5000;

// The Price dropdown: any price, the Budget from the Settings tab when there is one, then a step every ₹5k
// between the cheapest and the dearest listing, so each step hides some listings and keeps others.
export function priceChoices(budget, listings) {
  const choices = [{ value: "any", label: "Any price", maxCost: null }];
  if (budget !== null) choices.push({ value: "budget", label: `Within budget (${formatRupees(budget)})`, maxCost: budget });
  const range = costRange(listings);
  if (range) {
    for (let cap = Math.ceil(range.min / PRICE_STEP) * PRICE_STEP; cap < range.max; cap += PRICE_STEP) {
      if (cap > range.min) choices.push({ value: `up-to-${cap}`, label: `Up to ₹${cap / 1000}k`, maxCost: cap });
    }
  }
  return choices;
}

// The Price choice the app opens with. It matches startFilters.
export function startPriceChoice(budget) {
  return budget === null ? "any" : "budget";
}

// The Distance score dropdown. The page hides it when no place has a map spot.
export const SCORE_CHOICES = [
  { value: "any", label: "Any score", minScore: null },
  ...[5, 6, 7, 8].map((min) => ({ value: `score-${min}`, label: `${min} or more`, minScore: min })),
];

export const SHORTLIST_CHOICES = [
  { value: "all", label: "All", shortlistedOnly: false, unreviewedOnly: false },
  { value: "shortlisted", label: "Shortlisted only", shortlistedOnly: true, unreviewedOnly: false },
  { value: "unreviewed", label: "Not yet reviewed", shortlistedOnly: false, unreviewedOnly: true },
];

// Total monthly cost, or Rent alone when Maintenance is empty. No Rent means nothing to check.
function costToCheck(listing) {
  if (listing.rent === null) return null;
  return listing.maintenance === null ? listing.rent : listing.totalCost;
}

// "2bhk" or "rejected " typed by hand still matches.
function sameWord(text) {
  return text.toUpperCase().replace(/\s+/g, "");
}
const REJECTED = sameWord("Rejected");

// A hand-typed "rejected " is Rejected too. The app no longer shows Status, but the add steps still name it.
export function isRejected(listing) {
  return sameWord(listing.status) === REJECTED;
}

function passes(listing, filters, search, scoreOf) {
  const cost = costToCheck(listing);
  if (filters.maxCost !== null && cost !== null && cost > filters.maxCost) return false;

  // A listing with no Configuration, or one outside the 5 boxes, has nothing to check.
  const key = sameWord(listing.configuration);
  if (CONFIGURATIONS.includes(key) && !filters.configurations.has(key)) return false;

  if (filters.shortlistedOnly && !listing.shortlisted) return false;
  if (filters.unreviewedOnly && listing.reviewed) return false;

  // A listing with no score, like one with no map spot, has nothing to check.
  if (filters.minScore !== null && filters.minScore !== undefined) {
    const score = scoreOf(listing);
    if (score !== null && score < filters.minScore) return false;
  }

  if (search) {
    const text = `${listing.society}\n${listing.locality}`.toLowerCase();
    if (!text.includes(search)) return false;
  }
  return true;
}

// scoreOf gives a listing's distance score, from distanceScorer in places.mjs.
export function filterListings(listings, filters, scoreOf = () => null) {
  const search = filters.search.trim().toLowerCase();
  return listings.filter((listing) => passes(listing, filters, search, scoreOf));
}

export function isOverBudget(listing, budget) {
  return budget !== null && listing.totalCost !== null && listing.totalCost > budget;
}
