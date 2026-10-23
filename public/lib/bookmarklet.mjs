// The bookmarklet, from steps 4 and 5 of "Add a listing by link" in SPEC.md. No DOM here, so tests can run it in Node.
// It runs on the listing page the person has open, reads the page data and copies the step 2 prompt.
// The bookmark holds only its own code. It loads nothing, because the listing site's CSP would block that.
// So readListingPage, copyPrompt and showOnPage must each use nothing from outside the function.
import { PROMPT_TAIL, STEP_TWO_START } from "./add-listing.mjs";

export const RELOAD = "Reload this page and click again.";

// Reads the listing from the open page. Returns { data } with the text for the prompt, or { reload: true }.
// On 99acres, data is a trimmed pick from window.__initialData__, about 3,000 characters.
// On housing.com, data is a pick from the page's ld+json block and its Overview table.
// Elsewhere, or with neither, data is the text on the page.
export function readListingPage(win) {
  const href = String(win.location.href);
  if (/^https?:\/\/([^/]+\.)?housing\.com\//i.test(href)) {
    const doc = win.document;
    const clean = (value) => String(value).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const textOf = (el) => (el ? clean(el.innerText) : "");
    let listing = null;
    for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const item = JSON.parse(script.textContent);
        if (item && item.offers && /\/rent\/\d+/.test(item.url)) listing = item;
      } catch (err) {
        // Another ld+json block that does not parse is not the listing.
      }
    }
    if (!listing) return { data: doc.body.innerText };
    // The ld+json block comes with the page load. A listing opened from a search page may not have its own.
    const id = href.split(/[?#]/)[0].match(/\/rent\/(\d+)(?:[-/]|$)/);
    if (!id || String(listing.url).match(/\/rent\/(\d+)/)[1] !== id[1]) return { reload: true };

    const pick = { Property_Id: id[1] };
    const title = textOf(doc.querySelector("h1"));
    if (title) pick.title = title;
    const address = textOf(doc.querySelector(".T_addressStyle"));
    if (address) pick.address = address;
    // Like "by Doctor Deepak Kumar (Owner)". The part in brackets says Owner or Agent.
    const seller = textOf(doc.querySelector(".T_sellerStyle"));
    if (seller) pick.seller = seller;
    const places = [];
    for (let place = listing.containedInPlace; place && place.name; place = place.containedInPlace) places.push(place.name);
    if (places.length) pick.places = places.join(", ");
    if (listing.offers.price !== undefined) pick.rent = listing.offers.price;
    // The Overview table: Security, Brokerage, Furnishing, Floor number, Parking, Carpet area and more.
    const details = {};
    for (const row of doc.querySelectorAll("tr.data-point")) {
      const label = textOf(row.querySelector("th"));
      const value = textOf(row.querySelector("td"));
      if (label && value) details[label] = value;
    }
    if (Object.keys(details).length) pick.details = details;
    const features = [];
    for (const el of doc.querySelectorAll(".T_amenityLabelStyle")) {
      const label = textOf(el);
      if (label && !/^More\b/.test(label) && features.indexOf(label) < 0) features.push(label);
    }
    if (features.length) pick.features = features;
    if (listing.geo) {
      pick.Latitude = listing.geo.latitude;
      pick.Longitude = listing.geo.longitude;
    }
    if (listing.description) pick.Description = clean(listing.description).slice(0, 1000);
    // The ld+json photo links hold the word "version" in place of a size, and that link does not load.
    // "fs" is the full-screen size.
    const images = Array.isArray(listing.image) ? listing.image : listing.image ? [listing.image] : [];
    const photos = images.map((link) => String(link).replace("/v0/version/", "/v0/fs/"));
    if (photos.length) pick.photos = photos;
    return { data: JSON.stringify(pick) };
  }

  const pageData = win.__initialData__ && win.__initialData__.pd && win.__initialData__.pd.pageData;
  const prop = pageData && pageData.propertyDetails && pageData.propertyDetails.prop_data;
  if (!prop) return { data: win.document.body.innerText };
  // 99acres opens a listing from a search page without a reload, so __initialData__ can hold an earlier listing.
  const spid = href.match(/spid-([A-Za-z0-9]+)/);
  if (!spid || spid[1] !== prop.Prop_Id) return { reload: true };

  const keys = [
    "Prop_Id", "Building_Name", "Prop_Name", "Locality_Name", "localityToBeDisplayed", "City_Text",
    "bedroomPropertyTypeLabel", "Bedroom_Num", "Bathroom_Num", "Balcony_Num",
    "Price", "Deposit_Value", "securityBrokerageLabel", "Brokerage", "Brokerage_Type",
    "Superbuiltup_Area", "Superbuiltuparea_Unit", "Carpet_Area", "Carpetarea_Unit", "Builtup_Area", "Builtuparea_Unit",
    "Floor_Num", "Total_Floor", "propertyFloorsLabel", "Furnish_Label", "Facing_Label", "Reserved_Parking_Label",
    "Availability_Text", "class_name_label", "name_label", "Modify_Date", "Latitude", "Longitude",
  ];
  const pick = {};
  for (const key of keys) {
    const value = prop[key];
    if (value !== undefined && value !== null && value !== "") pick[key] = value;
  }
  // A key with maintenance in its name is kept too, since the sample listing has none to name.
  for (const key of Object.keys(prop)) {
    if (/mainten/i.test(key) && prop[key] !== "" && typeof prop[key] !== "object") pick[key] = prop[key];
  }
  if (prop.Availability_Info && prop.Availability_Info.Availability_Date) pick.Availability_Date = prop.Availability_Info.Availability_Date;
  const labels = [];
  for (const list of [prop.uspV2, prop.InternalFeatures, prop.ExternalFeatures]) {
    for (const item of Array.isArray(list) ? list : []) {
      if (item && item.label && labels.indexOf(item.label) < 0) labels.push(item.label);
    }
  }
  if (labels.length) pick.features = labels;
  // The description is free text. On the sample it holds an older rent, so the fields above go first.
  if (prop.Description) pick.Description = String(prop.Description).slice(0, 1000);
  const gallery = pageData.galleryDetails && pageData.galleryDetails.pdGalleryData;
  const images = (gallery && gallery.property && gallery.property.images) || [];
  // variants.O is the full-size photo. gallery.society holds photos of the whole project, so it is left out.
  const photos = images.map((image) => image && image.variants && image.variants.O).filter(Boolean);
  if (photos.length) pick.photos = photos;
  return { data: JSON.stringify(pick) };
}

// The bookmark click: read the page, then copy the step 2 prompt.
// show(win, message, text) puts a notice on the page. With text, the notice has the text selected and a Copy button.
export function copyPrompt(win, read, show, start, tail) {
  const result = read(win);
  if (result.reload) {
    show(win, "Reload this page and click again.");
    return Promise.resolve();
  }
  const prompt = start + result.data + "\n" + tail;
  const done = () => show(win, "Copied the prompt for Claude. Paste it into a new chat on Claude web, or into the app.");
  const failed = () => show(win, "Could not copy. Click Copy, or press Cmd+C.", prompt);
  try {
    return win.navigator.clipboard.writeText(prompt).then(done, failed);
  } catch (err) {
    failed();
    return Promise.resolve();
  }
}

// The notice on the listing page. It sits on top of the page until the person clicks Close.
export function showOnPage(win, message, text) {
  const doc = win.document;
  const old = doc.getElementById("rental-map-bookmarklet");
  if (old) old.remove();
  const box = doc.createElement("div");
  box.id = "rental-map-bookmarklet";
  box.setAttribute("role", "alert");
  box.style.cssText =
    "position:fixed;top:12px;right:12px;z-index:2147483647;width:420px;max-width:90vw;box-sizing:border-box;" +
    "padding:12px;background:#fff;color:#1b1b1b;border:2px solid #1b1b1b;border-radius:8px;" +
    "font:14px/1.4 system-ui,sans-serif;box-shadow:0 4px 20px rgba(0,0,0,.3)";
  const line = doc.createElement("p");
  line.style.cssText = "margin:0 0 8px";
  line.textContent = "Rental map: " + message;
  box.appendChild(line);
  const buttons = doc.createElement("div");
  const button = (label, onClick) => {
    const b = doc.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.style.cssText = "margin:8px 8px 0 0;padding:6px 12px;font:inherit;cursor:pointer";
    b.onclick = onClick;
    buttons.appendChild(b);
    return b;
  };
  let area = null;
  if (text !== undefined) {
    area = doc.createElement("textarea");
    area.readOnly = true;
    area.value = text;
    area.style.cssText = "display:block;width:100%;height:200px;box-sizing:border-box;font:12px monospace";
    box.appendChild(area);
    const copy = button("Copy", () => {
      area.select();
      win.navigator.clipboard.writeText(text).then(
        () => {
          copy.textContent = "Copied";
        },
        () => {
          area.select();
          copy.textContent = "Press Cmd+C";
        },
      );
    });
  }
  button("Close", () => box.remove());
  box.appendChild(buttons);
  doc.body.appendChild(box);
  if (area) {
    area.focus();
    area.select();
  }
}

// The javascript: link to drag to the bookmarks bar. Each function goes in as its source text.
export function bookmarkletHref() {
  const code =
    `(${copyPrompt.toString()})(window, ${readListingPage.toString()}, ${showOnPage.toString()}, ` +
    `${JSON.stringify(STEP_TWO_START)}, ${JSON.stringify(PROMPT_TAIL)});void 0`;
  return `javascript:${encodeURIComponent(code)}`;
}
