// The bookmarklet, from steps 4 and 5 of "Add a listing by link" in SPEC.md. No DOM here, so tests can run it in Node.
// It runs on the listing page the person has open, reads the page data and copies the step 2 prompt.
// The bookmark holds only its own code. It loads nothing, because the listing site's CSP would block that.
// So readListingPage, copyPrompt and showOnPage must each use nothing from outside the function.
import { STEP_TWO_START, stepTwoTail } from "./add-listing.mjs";

export const RELOAD = "Reload this page and click again.";

// Reads the listing from the open page. Returns { data } with the text for the prompt, or { reload: true }.
// On 99acres, data is a trimmed pick from window.__initialData__, about 3,000 characters.
// Elsewhere, or with no __initialData__, data is the text on the page.
export function readListingPage(win) {
  const pageData = win.__initialData__ && win.__initialData__.pd && win.__initialData__.pd.pageData;
  const prop = pageData && pageData.propertyDetails && pageData.propertyDetails.prop_data;
  if (!prop) return { data: win.document.body.innerText };
  // 99acres opens a listing from a search page without a reload, so __initialData__ can hold an earlier listing.
  const spid = String(win.location.href).match(/spid-([A-Za-z0-9]+)/);
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
    `${JSON.stringify(STEP_TWO_START)}, ${JSON.stringify(stepTwoTail())});void 0`;
  return `javascript:${encodeURIComponent(code)}`;
}
