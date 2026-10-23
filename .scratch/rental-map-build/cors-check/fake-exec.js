// A fake /exec for a dry run of index.html with no Google deploy.
// It acts like Apps Script: OPTIONS gets 405, and POST gets a 302 to a GET
// on another port, which returns the JSON echo.
// Run: node fake-exec.js, then open http://localhost:8780/?url=http://127.0.0.1:8766/exec
const http = require("node:http");

const PORT = 8766;
let lastBody = "{}";

http
  .createServer((req, res) => {
    const cors = { "Access-Control-Allow-Origin": "*" };
    console.log(req.method, req.url, req.headers["content-type"] || "");
    if (req.method === "OPTIONS") {
      res.writeHead(405).end();
      return;
    }
    if (req.method === "POST" && req.url === "/exec") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        lastBody = body;
        res.writeHead(302, { ...cors, Location: `http://localhost:${PORT + 1}/echo` }).end();
      });
      return;
    }
    res.writeHead(404).end();
  })
  .listen(PORT, "127.0.0.1");

// The redirect target is a second origin, as script.googleusercontent.com is.
http
  .createServer((req, res) => {
    console.log(req.method, req.url);
    res.writeHead(200, { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, got: JSON.parse(lastBody) }));
  })
  .listen(PORT + 1, "localhost");
