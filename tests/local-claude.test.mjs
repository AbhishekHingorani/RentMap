import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { REPLY_COLUMNS, localClaudePrompt, replySchema, stepTwoPrompt } from "../public/lib/add-listing.mjs";

const require = createRequire(import.meta.url);
const { BUDGET_STOPPED, askLocalClaude, claudeArgs } = require("../local-claude.js");
const { createServer } = require("../server.js");

const REPLY = Object.fromEntries(Object.keys(REPLY_COLUMNS).map((key) => [key, null]));
REPLY.society = "Ahad Excellencia";
REPLY.rent = 38999;

// What claude -p --output-format json prints. The budget one is copied from a real run on 2026-10-23.
const GOOD = JSON.stringify({ type: "result", subtype: "success", is_error: false, result: "", structured_output: REPLY });
const BUDGET = JSON.stringify({
  type: "result",
  subtype: "error_max_budget_usd",
  is_error: true,
  terminal_reason: "budget_exhausted",
  errors: ["Reached maximum budget ($0.10)"],
});
const NO_STRUCTURED = JSON.stringify({ type: "result", subtype: "success", is_error: false, result: "```json\n{}\n```" });

function fakeRun(stdout, error = null) {
  const calls = [];
  const run = async (args, input) => {
    calls.push({ args, input });
    return { stdout, error };
  };
  return { calls, run };
}

test("claude runs with exactly the flags in the spec, and never --bare", () => {
  const schema = replySchema();
  assert.deepEqual(claudeArgs(schema), [
    "-p",
    "--model", "haiku",
    "--setting-sources", "",
    "--tools", "",
    "--strict-mcp-config",
    "--disable-slash-commands",
    "--max-budget-usd", "0.10",
    "--no-session-persistence",
    "--output-format", "json",
    "--json-schema", JSON.stringify(schema),
  ]);
  assert.ok(!claudeArgs(schema).includes("--bare"));
});

test("the schema asks for every reply key", () => {
  const schema = replySchema();
  assert.deepEqual(schema.required, Object.keys(REPLY_COLUMNS));
  assert.deepEqual(Object.keys(schema.properties).sort(), Object.keys(REPLY_COLUMNS).sort());
  assert.deepEqual(schema.properties.rent.type, ["number", "null"]);
  assert.deepEqual(schema.properties.society.type, ["string", "null"]);
  assert.equal(schema.properties.photos.items.type, "string");
});

test("the prompt goes to claude on stdin, and structured_output comes back", async () => {
  const { calls, run } = fakeRun(GOOD);
  const result = await askLocalClaude("the prompt", { schema: {}, run });
  assert.deepEqual(result, { status: 200, body: { ok: true, reply: REPLY } });
  assert.equal(calls[0].input, "the prompt");
});

test("a missing structured_output is a failure, even when the result text has JSON", async () => {
  const result = await askLocalClaude("p", { schema: {}, run: fakeRun(NO_STRUCTURED).run });
  assert.equal(result.body.ok, false);
  assert.match(result.body.error, /no structured_output/);
});

test("the $0.10 cap gives the spec's message", async () => {
  // claude exits with 1 when the cap stops it, and still prints its JSON.
  const result = await askLocalClaude("p", { schema: {}, run: fakeRun(BUDGET, Object.assign(new Error("exit 1"), { code: 1 })).run });
  assert.deepEqual(result.body, { ok: false, error: "Local Claude stopped. Use the Claude web prompt." });
  assert.equal(BUDGET_STOPPED, "Local Claude stopped. Use the Claude web prompt.");
});

test("no claude command, or no JSON, says to use the Claude web prompt", async () => {
  const missing = await askLocalClaude("p", { schema: {}, run: fakeRun("", Object.assign(new Error("spawn claude ENOENT"), { code: "ENOENT" })).run });
  assert.equal(missing.status, 503);
  assert.match(missing.body.error, /claude command was not found/);
  const junk = await askLocalClaude("p", { schema: {}, run: fakeRun("Error: not logged in").run });
  assert.equal(junk.status, 502);
  assert.match(junk.body.error, /Use the Claude web prompt/);
});

test("pasted page data alone gets the step 2 prompt around it", () => {
  assert.equal(localClaudePrompt("  2 BHK in HSR  "), stepTwoPrompt("2 BHK in HSR"));
  const full = stepTwoPrompt('{"Prop_Id":"M1"}');
  assert.equal(localClaudePrompt(full), full);
});

// The server route, with a fake claude so no test spends money.
async function start(run) {
  const server = createServer({}, { geocoder: {}, runClaude: run });
  await new Promise((resolve) => server.listen(0, "localhost", resolve));
  server.unref();
  return `http://localhost:${server.address().port}/api/local-claude`;
}

function post(url, body, type = "application/json") {
  return fetch(url, { method: "POST", headers: { "Content-Type": type }, body: JSON.stringify(body) });
}

test("POST /api/local-claude runs claude with the reply schema and returns its reply", async () => {
  const { calls, run } = fakeRun(GOOD);
  const url = await start(run);
  const res = await post(url, { prompt: "x".repeat(15000) });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, reply: REPLY });
  assert.equal(calls[0].input, "x".repeat(15000));
  assert.equal(calls[0].args.at(-1), JSON.stringify(replySchema()));
});

test("POST /api/local-claude refuses an empty prompt, a form post and a second run at once", async () => {
  let release;
  const calls = [];
  const url = await start((args, input) => {
    calls.push(input);
    return new Promise((resolve) => {
      release = () => resolve({ stdout: GOOD, error: null });
    });
  });
  assert.equal((await post(url, { prompt: "  " })).status, 400);
  assert.equal((await post(url, { prompt: "p" }, "text/plain")).status, 415);
  const first = post(url, { prompt: "one" });
  while (!release) await new Promise((resolve) => setTimeout(resolve, 5));
  const second = await post(url, { prompt: "two" });
  assert.equal(second.status, 409);
  release();
  assert.equal((await first).status, 200);
  assert.deepEqual(calls, ["one"]);
});
