// "Ask my local Claude", from "Add a listing by link" in SPEC.md.
// The server runs claude -p on this computer with the step 2 prompt and reads structured_output from its JSON.
// Do not add --bare. It needs an API key, and the person signs in to Claude Code without one.
const { execFile } = require("node:child_process");
const os = require("node:os");

const TIMEOUT_MS = 180_000;
const USE_WEB = "Use the Claude web prompt.";
const BUDGET_STOPPED = `Local Claude stopped. ${USE_WEB}`;

// The exact flags from the spec. Each value is its own argument, so "" reaches claude as an empty value.
function claudeArgs(schema) {
  return [
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
  ];
}

// Runs claude with the prompt on stdin. Resolves { stdout, error }. claude exits with 1 when the cap stops it,
// and still prints its JSON, so a non-zero exit is not a failure by itself.
function runClaude(args, input) {
  return new Promise((resolve) => {
    // A temp folder as the working folder, so claude reads no CLAUDE.md from this repo.
    const child = execFile("claude", args, { cwd: os.tmpdir(), timeout: TIMEOUT_MS, maxBuffer: 5_000_000 }, (error, stdout) => {
      resolve({ stdout: String(stdout || ""), error });
    });
    child.stdin.on("error", () => {});
    child.stdin.end(input);
  });
}

// Returns { status, body } for the page. body is { ok: true, reply } or { ok: false, error }.
async function askLocalClaude(prompt, { schema, run = runClaude }) {
  const { stdout, error } = await run(claudeArgs(schema), prompt);
  if (error && error.code === "ENOENT") {
    return { status: 503, body: { ok: false, error: `Claude Code is not on this computer: the claude command was not found. ${USE_WEB}` } };
  }
  let result;
  try {
    result = JSON.parse(stdout);
  } catch {
    const why = error && error.killed ? "It took longer than 3 minutes." : "It gave no JSON.";
    return { status: 502, body: { ok: false, error: `Local Claude failed. ${why} ${USE_WEB}` } };
  }
  if (result.subtype === "error_max_budget_usd") return { status: 200, body: { ok: false, error: BUDGET_STOPPED } };
  const reply = result.structured_output;
  if (!reply || typeof reply !== "object" || Array.isArray(reply)) {
    const errors = Array.isArray(result.errors) && result.errors.length ? ` It said: ${result.errors.join(" ")}` : "";
    return { status: 502, body: { ok: false, error: `Local Claude gave no structured_output.${errors} ${USE_WEB}` } };
  }
  return { status: 200, body: { ok: true, reply } };
}

module.exports = { BUDGET_STOPPED, askLocalClaude, claudeArgs, runClaude };
