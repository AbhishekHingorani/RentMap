// Photos uploaded by hand, from "Photos uploaded by hand" in SPEC.md. No DOM here.
// The page shrinks a photo, sends it to the Apps Script, and adds its Drive link to the Photos cell.

// The long side of a shrunk photo, in pixels, and its JPEG quality.
export const PHOTO_LONG_SIDE = 1600;
export const PHOTO_QUALITY = 0.8;
export const PHOTO_TYPE = "image/jpeg";
export const PHOTO_COLUMN = "Photos";

// A Drive file id is letters, digits, "-" and "_". Code.gs copies this pattern, and a test checks they match.
export const FILE_ID = /^[A-Za-z0-9_-]{10,}$/;

// The Photos cell holds the full Drive link of an upload, from "Assumptions" in SPEC.md.
export function driveLink(fileId) {
  return `https://drive.google.com/file/d/${fileId}/view`;
}

// The file id in a Drive link, or null for a site link like imagecdn.99acres.com/....
// It reads the /file/d/<ID>/ form the app writes, and the ?id=<ID> form a person may paste.
export function driveFileId(link) {
  let url;
  try {
    url = new URL(String(link ?? "").trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.hostname !== "drive.google.com") return null;
  const id = url.pathname.match(/^\/file\/d\/([^/]+)/)?.[1] ?? url.searchParams.get("id");
  return id && FILE_ID.test(id) ? id : null;
}

// Google does not document this URL. If it fails, the page asks the Apps Script for the photo.
export function thumbnailUrl(fileId) {
  return `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w${PHOTO_LONG_SIDE}`;
}

// What the page puts in img.src: the thumbnail URL for a Drive link, and the link itself for a site link.
export function photoSrc(link) {
  const id = driveFileId(link);
  return id ? thumbnailUrl(id) : link;
}

// The canvas size for a photo: about 1600 px on the long side, with the same shape. A small photo keeps its size.
export function shrunkSize(width, height) {
  const scale = Math.min(1, PHOTO_LONG_SIDE / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

// The base64 part of a data: URL from canvas.toDataURL, or "" when it is not a JPEG.
export function base64Of(dataUrl) {
  const prefix = `data:${PHOTO_TYPE};base64,`;
  return dataUrl.startsWith(prefix) ? dataUrl.slice(prefix.length) : "";
}

// The data: URL for a getPhoto reply from the Apps Script.
export function dataUrlOf(reply) {
  return `data:${reply.mimeType};base64,${reply.data}`;
}

// The line on the screen while an upload is out.
export function uploadLine(index, count) {
  return count === 1 ? "Uploading the photo…" : `Uploading photo ${index + 1} of ${count}…`;
}
