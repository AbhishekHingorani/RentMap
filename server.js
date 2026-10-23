// The local web server. Start it with `node server.js`.
// It serves the page from public/ on http://localhost and opens it in Chrome.
// Pass --no-open to skip opening Chrome.
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { execFile } = require("node:child_process");

const PUBLIC_DIR = path.join(__dirname, "public");
const CONFIG_FILE = path.join(__dirname, "config.json");
const DEFAULT_PORT = 8790;

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

function createServer(config) {
  return http.createServer((req, res) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405).end();
      return;
    }
    const urlPath = new URL(req.url, "http://localhost").pathname;
    if (urlPath === "/api/config") {
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(JSON.stringify({ appsScriptUrl: config.appsScriptUrl || null }));
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
