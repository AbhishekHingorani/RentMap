// Row 1 headers of each sheet tab, from "The sheet" in SPEC.md.
// apps-script/Code.gs writes the same headers. tests/apps-script.test.mjs checks that they match.

export const TRACKER_COLUMNS = [
  "Listing id",
  "Society / building name",
  "Locality",
  "Configuration",
  "Status",
  "Listed by",
  "Broker name",
  "Broker phone",
  "Owner name",
  "Owner phone",
  "Rent (₹/month)",
  "Maintenance (₹/month)",
  "Total monthly cost",
  "Deposit",
  "Brokerage fee",
  "Carpet area (sq ft)",
  "Super built-up area (sq ft)",
  "Bathrooms",
  "Floor / total floors",
  "Furnishing",
  "Parking",
  "Lift",
  "Available from",
  "Other details",
  "Safety",
  "Water supply",
  "Location",
  "Condition",
  "Natural light",
  "Overall rating",
  "Pros",
  "Cons",
  "Notes",
  "Photos",
  "Listing link",
  "Lat",
  "Long",
  "Pin precision",
  "Date added",
  "Added by",
  "Shortlisted",
  "Dimple's rating",
  "Abhishek's rating",
  "Reviewed",
];

export const PLACES_COLUMNS = ["Name", "Address", "Lat", "Long", "Pin precision", "Added by"];

export const SETTINGS_COLUMNS = ["Setting", "Value"];

export const CONFIGURATIONS = ["1RK", "1BHK", "2BHK", "3BHK", "4BHK+"];

// Shortlisted is its own column, a tick box, so a listing can be Visited and shortlisted at once.
export const STATUSES = ["To call", "Visit scheduled", "Visited", "Rejected"];

// Each person's own rating, 1 to 5. They do not count toward Overall rating.
export const PERSON_RATING_COLUMNS = ["Dimple's rating", "Abhishek's rating"];
