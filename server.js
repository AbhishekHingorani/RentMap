// The local web server. Start it with `node server.js`.
// It serves the page from public/ on http://localhost and opens it in Chrome.
// Pass --no-open to skip opening Chrome.
// POST /api/geocode finds a map spot. See geocoder.js.
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { createGeocoder } = require("./geocoder.js");

const PUBLIC_DIR = path.join(__dirname, "public");
const CONFIG_FILE = path.join(__dirname, "config.json");
const DEFAULT_PORT = 8790;
const MAX_BODY_BYTES = 10_000;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

// config.json is not in git, because the Apps Script /exec URL is a secret.
// A missing file is fine: the page then says what to set. A broken file stops the start.
function readConfig() {
  let text;
  try {
    text = fs.readFileSync(CONFIG_FILE, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return {};
    throw err;
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`config.json is not valid JSON: ${err.message}`);
  }
}

function fileFor(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  const relative = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
  const file = path.resolve(PUBLIC_DIR, relative);
  if (!file.startsWith(PUBLIC_DIR + path.sep)) return null;
  if (path.basename(file).startsWith(".")) return null;
  return file;
}

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}

// The server listens on localhost only, but any page open in Chrome can still call it.
// A DNS-rebinding page sends its own host name, so only localhost names pass.
function isLocalHost(hostHeader) {
  const name = String(hostHeader || "").replace(/:\d+$/, "").toLowerCase();
  return name === "localhost" || name === "127.0.0.1" || name === "[::1]";
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    // A body that is too big is read to the end and dropped, so the reply still reaches the page.
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size <= MAX_BODY_BYTES) chunks.push(chunk);
    });
    req.on("end", () => {
      if (size > MAX_BODY_BYTES) {
        reject(new Error("The request is too big."));
        return;
      }
      let body;
      try {
        body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch {
        body = null;
      }
      if (body && typeof body === "object" && !Array.isArray(body)) resolve(body);
      else reject(new Error("The request is not a JSON object."));
    });
    req.on("error", reject);
  });
}

// The geocoder switch is "geocoding" in config.json. Set it to false to turn the geocoder off.
async function geocodeRoute(req, res, config, geocoder) {
  if (config.geocoding === false) {
    sendJson(res, 503, { ok: false, error: "The geocoder is off. Set geocoding to true in config.json to turn it on." });
    return;
  }
  let body;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    sendJson(res, 400, { ok: false, error: err.message });
    return;
  }
  try {
    const spot = await geocoder.geocode({ society: body.society, locality: body.locality, city: body.city });
    sendJson(res, 200, { ok: true, spot });
  } catch (err) {
    sendJson(res, 502, { ok: false, error: err.message });
  }
}

function createServer(config, { geocoder = createGeocoder() } = {}) {
  return http.createServer((req, res) => {
    if (!isLocalHost(req.headers.host)) {
      res.writeHead(403).end();
      return;
    }
    const urlPath = new URL(req.url, "http://localhost").pathname;
    if (req.method === "POST" && urlPath === "/api/geocode") {
      // A cross-site HTML form cannot send application/json, so it cannot use the geocoder.
      if (!/^application\/json\b/i.test(req.headers["content-type"] || "")) {
        res.writeHead(415).end();
        return;
      }
      geocodeRoute(req, res, config, geocoder);
      return;
    }
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405).end();
      return;
    }
    if (urlPath === "/api/config") {
      sendJson(res, 200, { appsScriptUrl: config.appsScriptUrl || null, geocoding: config.geocoding !== false });
      return;
    }
    const file = fileFor(urlPath);
    if (!file) {
      res.writeHead(404).end();
      return;
    }
    fs.stat(file, (err, stat) => {
      if (err || !stat.isFile()) {
        res.writeHead(404).end();
        return;
      }
      const type = TYPES[path.extname(file)] || "application/octet-stream";
      res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-cache" });
      if (req.method === "HEAD") res.end();
      else fs.createReadStream(file).pipe(res);
    });
  });
}

function openInChrome(url) {
  const tries = {
    darwin: [
      ["open", ["-a", "Google Chrome", url]],
      ["open", [url]],
    ],
    win32: [["cmd", ["/c", "start", "chrome", url]]],
  }[process.platform] || [
    ["google-chrome", [url]],
    ["xdg-open", [url]],
  ];
  const next = (i) => {
    if (i >= tries.length) {
      console.log(`Could not open Chrome. Open ${url} in Chrome by hand.`);
      return;
    }
    execFile(tries[i][0], tries[i][1], (err) => {
      if (err) next(i + 1);
    });
  };
  next(0);
}

function main() {
  const config = readConfig();
  const port = Number(process.env.PORT || config.port || DEFAULT_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error(`The port must be a number from 1 to 65535. Got: ${process.env.PORT || config.port}`);
    process.exit(1);
  }
  const url = `http://localhost:${port}`;
  if (!config.appsScriptUrl) {
    console.log("No appsScriptUrl in config.json. Copy config.example.json to config.json and set it.");
  }
  const server = createServer(config);
  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.error(`Port ${port} is in use. Stop the other app, or start with PORT=<number> node server.js.`);
    } else {
      console.error(err.message);
    }
    process.exit(1);
  });
  server.listen(port, "localhost", () => {
    console.log(`Rental map is on ${url}`);
    if (!process.argv.includes("--no-open")) openInChrome(url);
  });
}

if (require.main === module) main();

module.exports = { createServer };
