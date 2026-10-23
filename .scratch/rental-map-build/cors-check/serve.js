// Serves index.html on http://localhost:8780 for the Apps Script call check.
// Run: node serve.js
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const PORT = Number(process.env.PORT) || 8780;
const page = path.join(__dirname, "index.html");

http
  .createServer((req, res) => {
    if (req.method !== "GET" || new URL(req.url, "http://localhost").pathname !== "/") {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    fs.createReadStream(page).pipe(res);
  })
  .listen(PORT, "127.0.0.1", () => {
    console.log(`Open http://localhost:${PORT}`);
  });
