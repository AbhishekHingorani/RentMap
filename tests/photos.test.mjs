import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PHOTO_LONG_SIDE,
  PHOTO_QUALITY,
  base64Of,
  dataUrlOf,
  driveFileId,
  driveLink,
  photoSrc,
  shrunkSize,
  thumbnailUrl,
  uploadLine,
} from "../public/lib/photos.mjs";

const ID = "1AbC_dEf-GhIjKlMnOpQrStUv";

test("an upload goes into the Photos cell as the full Drive link, and the page reads the id back", () => {
  const link = driveLink(ID);
  assert.equal(link, `https://drive.google.com/file/d/${ID}/view`);
  assert.equal(driveFileId(link), ID);
});

test("the page shows a Drive photo with the thumbnail URL at 1600 px", () => {
  assert.equal(thumbnailUrl(ID), `https://drive.google.com/thumbnail?id=${ID}&sz=w1600`);
  assert.equal(photoSrc(driveLink(ID)), thumbnailUrl(ID));
  assert.equal(photoSrc(` ${driveLink(ID)} `), thumbnailUrl(ID));
});

test("a site photo link is shown as it is", () => {
  const site = "https://imagecdn.99acres.com/media1/123/photo.jpg";
  assert.equal(driveFileId(site), null);
  assert.equal(photoSrc(site), site);
});

test("driveFileId reads the ?id= form and refuses links that are not a Drive file", () => {
  assert.equal(driveFileId(`https://drive.google.com/open?id=${ID}`), ID);
  assert.equal(driveFileId(`https://drive.google.com/file/d/${ID}/view?usp=sharing`), ID);
  assert.equal(driveFileId(`https://evil.example/file/d/${ID}/view`), null);
  assert.equal(driveFileId(`http://drive.google.com/file/d/${ID}/view`), null);
  assert.equal(driveFileId("https://drive.google.com/file/d/short/view"), null);
  assert.equal(driveFileId("https://drive.google.com/file/d/a%22b%3Cc0123456/view"), null);
  assert.equal(driveFileId(""), null);
  assert.equal(driveFileId(undefined), null);
});

test("a big photo shrinks to 1600 px on the long side and keeps its shape", () => {
  assert.equal(PHOTO_LONG_SIDE, 1600);
  assert.equal(PHOTO_QUALITY, 0.8);
  assert.deepEqual(shrunkSize(4032, 3024), { width: 1600, height: 1200 });
  assert.deepEqual(shrunkSize(3024, 4032), { width: 1200, height: 1600 });
  assert.deepEqual(shrunkSize(1600, 900), { width: 1600, height: 900 });
});

test("a small photo keeps its size", () => {
  assert.deepEqual(shrunkSize(800, 600), { width: 800, height: 600 });
});

test("base64Of takes the data part of a JPEG data: URL, and nothing else", () => {
  assert.equal(base64Of("data:image/jpeg;base64,/9j/4AAQ"), "/9j/4AAQ");
  // A browser that cannot make a JPEG gives a PNG instead.
  assert.equal(base64Of("data:image/png;base64,iVBOR"), "");
  assert.equal(base64Of("data:,"), "");
});

test("the fallback photo shows as a data: URL", () => {
  assert.equal(dataUrlOf({ mimeType: "image/jpeg", data: "/9j/4AAQ" }), "data:image/jpeg;base64,/9j/4AAQ");
});

test("the upload line counts the photos when there is more than one", () => {
  assert.equal(uploadLine(0, 1), "Uploading the photo…");
  assert.equal(uploadLine(1, 3), "Uploading photo 2 of 3…");
});
