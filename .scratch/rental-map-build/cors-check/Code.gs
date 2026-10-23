// Test script for ticket 01. It is not the real backend.
// It reads a JSON body from a text/plain POST and sends it back as JSON.

function doPost(e) {
  var reply;
  try {
    var body = JSON.parse(e.postData.contents);
    reply = {
      ok: true,
      got: body,
      contentType: e.postData.type,
      at: new Date().toISOString(),
    };
  } catch (err) {
    reply = { ok: false, error: String(err) };
  }
  return ContentService.createTextOutput(JSON.stringify(reply)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

// Open the /exec URL in a browser tab to see that the deploy is live.
function doGet() {
  return ContentService.createTextOutput(
    JSON.stringify({ ok: true, method: "GET" }),
  ).setMimeType(ContentService.MimeType.JSON);
}
