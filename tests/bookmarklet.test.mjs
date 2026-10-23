import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { RELOAD, bookmarkletHref, copyPrompt, readListingPage, showOnPage } from "../public/lib/bookmarklet.mjs";
import { STEP_TWO_START, stepTwoPrompt, stepTwoTail } from "../public/lib/add-listing.mjs";

// The saved 99acres page in samples/. Its window.__initialData__ is one inline JSON object.
const SAMPLES = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "samples");
const SAMPLE_HTML = fs.readFileSync(path.join(SAMPLES, fs.readdirSync(SAMPLES).find((name) => name.endsWith(".html"))), "utf8");
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
  assert.deepEqual(readListingPage(fakeWindow({ href: "https://housing.com/rent/123", text: "2 BHK in HSR" })), { data: "2 BHK in HSR" });
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
  await copyPrompt(win, readListingPage, show, STEP_TWO_START, stepTwoTail());
  assert.equal(copied.length, 1);
  assert.equal(copied[0], stepTwoPrompt(readListingPage(win).data));
  assert.ok(copied[0].startsWith(`Here is the listing page data: {"Prop_Id":"M93900012"`));
  assert.equal(shown.length, 1);
  assert.match(shown[0][0], /^Copied/);
});

test("a failed copy shows the prompt in a box with a Copy button", async () => {
  const win = fakeWindow({ text: "Some page", clipboard: { writeText: async () => Promise.reject(new Error("NotAllowedError")) } });
  const { shown, show } = recorder();
  await copyPrompt(win, readListingPage, show, STEP_TWO_START, stepTwoTail());
  assert.deepEqual(shown, [["Could not copy. Click Copy, or press Cmd+C.", stepTwoPrompt("Some page")]]);
});

test("a browser with no clipboard also gets the box", async () => {
  const { shown, show } = recorder();
  await copyPrompt(fakeWindow({ text: "Some page" }), readListingPage, show, STEP_TWO_START, stepTwoTail());
  assert.equal(shown[0][1], stepTwoPrompt("Some page"));
});

test("a mismatched page says to reload and copies nothing", async () => {
  const copied = [];
  const win = fakeWindow({ initialData: INITIAL_DATA, href: "https://www.99acres.com/x-spid-R1", clipboard: { writeText: async (t) => copied.push(t) } });
  const { shown, show } = recorder();
  await copyPrompt(win, readListingPage, show, STEP_TWO_START, stepTwoTail());
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
