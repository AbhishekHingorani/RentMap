import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createServer } = require("../server.js");

// Node 18.12 does not wait for an async before() hook and has no top-level after(),
// so start the server with top-level await and unref it, so it does not hold the run open.
const server = createServer({ appsScriptUrl: "https://script.google.com/macros/s/TEST/exec" });
await new Promise((resolve) => server.listen(0, "localhost", resolve));
server.unref();
const base = `http://localhost:${server.address().port}`;

test("the server serves the page at /", async () => {
  const res = await fetch(`${base}/`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /^text\/html/);
  assert.match(await res.text(), /id="map"/);
});

test("page modules are served as JavaScript", async () => {
  const res = await fetch(`${base}/lib/listings.mjs`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /^text\/javascript/);
});

test("the page reads the Apps Script URL from /api/config", async () => {
  const res = await fetch(`${base}/api/config`);
  assert.deepEqual(await res.json(), {
    appsScriptUrl: "https://script.google.com/macros/s/TEST/exec",
  });
});

test("files outside public/ are not served", async () => {
  for (const path of ["/../server.js", "/%2e%2e/server.js", "/missing.html"]) {
    const res = await fetch(`${base}${path}`);
    assert.equal(res.status, 404, path);
  }
});

test("fonts are served as woff2", async () => {
  const res = await fetch(`${base}/fonts/plex-sans-latin.woff2`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "font/woff2");
});
