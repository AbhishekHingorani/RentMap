import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { RELOAD, bookmarkletHref, copyPrompt, readListingPage, showOnPage } from "../public/lib/bookmarklet.mjs";
import { PROMPT_TAIL, STEP_TWO_START, stepTwoPrompt } from "../public/lib/add-listing.mjs";

// The saved 99acres page in samples/. Its window.__initialData__ is one inline JSON object.
const SAMPLES = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "samples");
const sampleHtml = (test) => fs.readFileSync(path.join(SAMPLES, fs.readdirSync(SAMPLES).find((name) => name.endsWith(".html") && test(name))), "utf8");
const SAMPLE_HTML = sampleHtml((name) => !name.includes("Housing.com"));
const SAMPLE_URL = "https://www.99acres.com/2-bhk-bedroom-apartment-flat-for-rent-in-ahad-excellencia-chikkanayakanahalli-bangalore-south-1160-sqft-spid-M93900012";

function sampleInitialData() {
  const start = SAMPLE_HTML.indexOf("window.__initialData__=") + "window.__initialData__=".length;
  const end = SAMPLE_HTML.indexOf("</script>", start);
  const sandbox = { window: {} };
  vm.runInNewContext(`window.__initialData__=${SAMPLE_HTML.slice(start, end)}`, sandbox);
  // A JSON round trip makes plain objects of this realm, so deepEqual can compare them.
  return JSON.parse(JSON.stringify(sandbox.window.__initialData__));
}

function fakeWindow({ initialData, href = SAMPLE_URL, text = "Page text", clipboard } = {}) {
  return {
    __initialData__: initialData,
    location: { href },
    document: { body: { innerText: text } },
    navigator: { clipboard },
  };
}

const INITIAL_DATA = sampleInitialData();

test("on 99acres the bookmarklet sends a trimmed pick of about 3,000 characters", () => {
  const { data, reload } = readListingPage(fakeWindow({ initialData: INITIAL_DATA }));
  assert.equal(reload, undefined);
  assert.ok(data.length > 1500 && data.length < 4500, `data is ${data.length} characters`);
  const pick = JSON.parse(data);
  assert.equal(pick.Prop_Id, "M93900012");
  assert.equal(pick.Price, "38999");
  assert.equal(pick.Building_Name, "Ahad Excellencia");
  assert.equal(pick.Latitude, "12.882808333333333");
  assert.equal(pick.Longitude, "77.69001111111112");
});

test("the pick holds the full-size photo links of the flat, not of the society", () => {
  const pick = JSON.parse(readListingPage(fakeWindow({ initialData: INITIAL_DATA })).data);
  const images = INITIAL_DATA.pd.pageData.galleryDetails.pdGalleryData.property.images;
  assert.equal(pick.photos.length, 13);
  assert.deepEqual(pick.photos, images.map((image) => image.variants.O));
  assert.equal(pick.photos[0], "https://imagecdn.99acres.com/media1/41417/2/828342725O-1787988609938.jpg");
});

test("with no __initialData__ the bookmarklet sends the page text", () => {
  assert.deepEqual(readListingPage(fakeWindow({ href: "https://example.com/rent/123", text: "2 BHK in HSR" })), { data: "2 BHK in HSR" });
});

// The saved housing.com page in samples/, as a stand-in DOM with only what the bookmarklet asks for.
const HOUSING_HTML = sampleHtml((name) => name.includes("Housing.com"));
const HOUSING_URL = "https://housing.com/rent/21267780-750-sqft-1-bhk-apartment-on-rent-in-gota-ahmedabad";

function housingDocument(html = HOUSING_HTML) {
  const text = (part) => part.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&");
  const el = (part) => ({ innerText: text(part) });
  const all = (pattern) => [...html.matchAll(pattern)].map((m) => m[1]);
  const one = (pattern) => (html.match(pattern) ? el(html.match(pattern)[1]) : null);
  const found = {
    h1: one(/<h1>(.*?)<\/h1>/s),
    ".T_addressStyle": one(/class="[^"]*T_addressStyle[^"]*">(.*?)<\/div>/s),
    ".T_sellerStyle": one(/class="[^"]*T_sellerStyle[^"]*">((?:<div[^>]*>[^<]*<\/div>)+)<\/div>/s),
  };
  const lists = {
    'script[type="application/ld+json"]': all(/<script type="application\/ld\+json">(.*?)<\/script>/gs).map((t) => ({ textContent: t })),
    "tr.data-point": all(/<tr class="[^"]*data-point[^"]*">(.*?)<\/tr>/gs).map((row) => ({
      querySelector: (tag) => el(row.match(new RegExp(`<${tag}[^>]*>(.*?)</${tag}>`, "s"))[1]),
    })),
    ".T_amenityLabelStyle": all(/class="[^"]*T_amenityLabelStyle[^"]*">([^<]*)/g).map(el),
  };
  return {
    body: { innerText: "Page text" },
    querySelector: (selector) => found[selector] ?? null,
    querySelectorAll: (selector) => lists[selector] ?? [],
  };
}

function housingWindow(href = HOUSING_URL, doc = housingDocument()) {
  return { location: { href }, document: doc, navigator: {} };
}

test("on housing.com the bookmarklet sends a pick from the ld+json block and the Overview table", () => {
  const { data, reload } = readListingPage(housingWindow());
  assert.equal(reload, undefined);
  assert.ok(data.length > 1000 && data.length < 4500, `data is ${data.length} characters`);
  const pick = JSON.parse(data);
  assert.equal(pick.Property_Id, "21267780");
  assert.equal(pick.rent, 15000);
  assert.equal(pick.Latitude, "23.097458");
  assert.equal(pick.Longitude, "72.531448");
  assert.equal(pick.places, "Gopal Nagar, Gota, Ahmedabad, Ahmedabad District, North West");
  assert.equal(pick.seller, "by Doctor Deepak Kumar (Owner)");
  assert.equal(pick.details.Security, "15,000");
  assert.equal(pick.details["Floor number"], "3 of 15 floors");
  assert.equal(pick.details.Parking, "1 Covered and 1 Open Parking");
  assert.equal(pick.details["Carpet area"], "650 sq.ft");
  assert.ok(pick.features.includes("Lift"));
  assert.ok(!pick.features.some((label) => label.startsWith("More")));
  assert.doesNotMatch(pick.Description, /<br>/);
});

test("the housing.com photo links name the full-screen size, since the version links do not load", () => {
  const pick = JSON.parse(readListingPage(housingWindow()).data);
  assert.equal(pick.photos.length, 3);
  assert.equal(pick.photos[0], "https://is1-3.housingcdn.com/01c16c28/ab1fe8014879b302ac2f4fc1842a644a/v0/fs/1_bhk_apartment-for-rent-gota-Ahmedabad-hall.jpg");
  assert.ok(pick.photos.every((link) => !link.includes("/version/")));
});

test("a housing.com page whose ld+json is of another listing asks for a reload", () => {
  const other = "https://housing.com/rent/20955842-1729-sqft-3-bhk-apartment-on-rent-in-gota-ahmedabad";
  assert.deepEqual(readListingPage(housingWindow(other)), { reload: true });
  assert.deepEqual(readListingPage(housingWindow("https://housing.com/in/rent/flats-for-rent-in-ahmedabad")), { reload: true });
});

test("a housing.com page with no listing ld+json sends the page text", () => {
  const doc = housingDocument("<html><body></body></html>");
  assert.deepEqual(readListingPage(housingWindow(HOUSING_URL, doc)), { data: "Page text" });
});

test("a Prop_Id that does not match the spid- part of the URL asks for a reload", () => {
  const other = SAMPLE_URL.replace("spid-M93900012", "spid-R11111111");
  assert.deepEqual(readListingPage(fakeWindow({ initialData: INITIAL_DATA, href: other })), { reload: true });
  // A 99acres page with no spid- in its URL is a search page, so its data is not one listing either.
  assert.deepEqual(readListingPage(fakeWindow({ initialData: INITIAL_DATA, href: "https://www.99acres.com/search" })), { reload: true });
});

function recorder() {
  const shown = [];
  return { shown, show: (win, message, text) => shown.push(text === undefined ? [message] : [message, text]) };
}

test("the bookmarklet copies the step 2 prompt, with the page data on its first line", async () => {
  const copied = [];
  const win = fakeWindow({ initialData: INITIAL_DATA, clipboard: { writeText: async (text) => copied.push(text) } });
  const { shown, show } = recorder();
  await copyPrompt(win, readListingPage, show, STEP_TWO_START, PROMPT_TAIL);
  assert.equal(copied.length, 1);
  assert.equal(copied[0], stepTwoPrompt(readListingPage(win).data));
  assert.ok(copied[0].startsWith(`Here is the listing page data: {"Prop_Id":"M93900012"`));
  assert.equal(shown.length, 1);
  assert.match(shown[0][0], /^Copied/);
});

test("a failed copy shows the prompt in a box with a Copy button", async () => {
  const win = fakeWindow({ text: "Some page", clipboard: { writeText: async () => Promise.reject(new Error("NotAllowedError")) } });
  const { shown, show } = recorder();
  await copyPrompt(win, readListingPage, show, STEP_TWO_START, PROMPT_TAIL);
  assert.deepEqual(shown, [["Could not copy. Click Copy, or press Cmd+C.", stepTwoPrompt("Some page")]]);
});

test("a browser with no clipboard also gets the box", async () => {
  const { shown, show } = recorder();
  await copyPrompt(fakeWindow({ text: "Some page" }), readListingPage, show, STEP_TWO_START, PROMPT_TAIL);
  assert.equal(shown[0][1], stepTwoPrompt("Some page"));
});

test("a mismatched page says to reload and copies nothing", async () => {
  const copied = [];
  const win = fakeWindow({ initialData: INITIAL_DATA, href: "https://www.99acres.com/x-spid-R1", clipboard: { writeText: async (t) => copied.push(t) } });
  const { shown, show } = recorder();
  await copyPrompt(win, readListingPage, show, STEP_TWO_START, PROMPT_TAIL);
  assert.deepEqual(shown, [[RELOAD]]);
  assert.deepEqual(copied, []);
});

// A tiny stand-in for the DOM, enough for showOnPage.
function fakeDocument() {
  const made = [];
  const node = (tag) => {
    const n = {
      tag,
      style: {},
      children: [],
      attrs: {},
      setAttribute(k, v) {
        n.attrs[k] = v;
      },
      appendChild(child) {
        n.children.push(child);
      },
      remove() {
        n.removed = true;
      },
      focus() {},
      select() {
        n.selected = true;
      },
    };
    made.push(n);
    return n;
  };
  return { made, body: node("body"), createElement: node, getElementById: (id) => made.find((n) => n.id === id && !n.removed) ?? null };
}

test("the box on the page holds the text, selected, with a Copy button", () => {
  const doc = fakeDocument();
  showOnPage({ document: doc, navigator: {} }, "Could not copy.", "the prompt");
  const area = doc.made.find((n) => n.tag === "textarea");
  assert.equal(area.value, "the prompt");
  assert.equal(area.selected, true);
  assert.deepEqual(
    doc.made.filter((n) => n.tag === "button").map((n) => n.textContent),
    ["Copy", "Close"],
  );
});

// The bookmark runs as a javascript: URL with no imports, so run its code in a clean context.
test("the javascript: link runs on its own and copies the same prompt", async () => {
  const href = bookmarkletHref();
  assert.ok(href.startsWith("javascript:"));
  const copied = [];
  const win = fakeWindow({ initialData: INITIAL_DATA, clipboard: { writeText: async (text) => copied.push(text) } });
  win.document = { ...fakeDocument(), body: { innerText: "", appendChild() {} } };
  vm.runInNewContext(decodeURIComponent(href.slice("javascript:".length)), { window: win });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(copied[0], stepTwoPrompt(readListingPage(win).data));
});
