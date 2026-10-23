# Can local claude read a listing link

Ticket: issues/01-claude-reads-listing.md
Date: 2026-10-23
Claude Code version tested: 2.1.309

## Short answer

No, not with the default tools. `claude -p` runs fine with the user's login and returns clean JSON. But both 99acres.com and housing.com block plain HTTP fetches. WebFetch got HTTP 403 from 99acres in the live test. So no listing fields came back.

## Live test

Command, run from the scratchpad, capped at 180 seconds:

```
claude -p "Fetch this rental listing with WebFetch and extract its fields: <URL> ..." \
  --output-format json \
  --json-schema "$(cat schema.json)" \
  --tools "WebFetch" \
  --allowedTools "WebFetch(domain:www.99acres.com)" \
  --permission-prompts none \
  --no-session-persistence
```

URL: https://www.99acres.com/2-bhk-bedroom-apartment-flat-for-rent-in-ahad-excellencia-chikkanayakanahalli-bangalore-south-1160-sqft-spid-M93900012

Result:

- Exit code 0, `subtype: "success"`, `is_error: false`.
- Wall time 13 seconds. `duration_ms` 11000. Time to first token 4.3 seconds.
- WebFetch got HTTP 403 Forbidden. No page body.
- `structured_output` held `{"fetch_ok": false, "fetch_notes": "WebFetch got HTTP 403 Forbidden ...", "photo_urls": [], "reviews": []}`. The model did not invent any fields.
- `total_cost_usd` 0.44 (a client-side estimate, billed against the subscription). Almost all of it was 53,446 tokens of cache creation. That is the default system prompt plus the user's CLAUDE.md, skills and plugins. Model was the default, Opus 5.5.
- Auth worked through the user's claude.ai login. No API key was set.

Other checks on the same site:

- My own WebFetch on a second 99acres listing (spid N77437349) also got 403.
- `curl` with a Chrome User-Agent got 403 "Access Denied" from Akamai (errors.edgesuite.net reference in the body). `curl` with `Claude-User` as User-Agent got the same 403.
- `curl` to https://housing.com/ and a housing.com rent search page got HTTP 406 with a "Security Alert" page, with both a browser User-Agent and `Claude-User`.

So both sites block non-browser clients at the edge. This is not about JavaScript rendering. The request never gets a page.

## What the docs say

### Headless mode, `-p`

Source: https://code.claude.com/docs/en/headless

- `-p` runs one prompt and exits. Exit code 0 on success, non-zero on failure.
- `--output-format json` returns one object. The text answer is in `result`. It also has `session_id`, `total_cost_usd`, `usage` and `duration_ms`.
- `--json-schema '<schema>'` with `--output-format json` puts schema-valid output in `structured_output`. "If a run ends without valid structured output ... the response has no `structured_output` field." The server must check the field is present.
- `--allowedTools` uses permission rule syntax. "Calls to tools you didn't list run if they need no approval." Since v2.1.302 a `-p` run starts in Manual mode. A call that needs approval is denied unless something approves it.
- `--permission-prompts none` denies anything that would prompt, and tells Claude not to retry.
- `--bare` skips CLAUDE.md, hooks, plugins and MCP. But "bare mode doesn't use your subscription login". It needs `ANTHROPIC_API_KEY`. So this project cannot use `--bare`.
- The local CLI help (`claude --help`, 2.1.309) lists `--json-schema`, `--tools`, `--max-budget-usd`, `--model`, `--system-prompt`, `--setting-sources`, `--strict-mcp-config`, `--disable-slash-commands` and `--no-session-persistence`, all usable with `-p`.

### WebFetch

Source: https://code.claude.com/docs/en/tools-reference (section "WebFetch tool behavior")

- WebFetch "fetches the page and converts the response to Markdown". Then it "runs the prompt against the content in a separate model call, and Claude receives the result of that call rather than the raw page."
- The docs call it "lossy by design". Photo URLs, map coordinates and JSON blobs in script tags will likely not survive the Markdown step and the summary call, even when a fetch works.
- The docs describe an HTTP fetch only. They say nothing about running JavaScript.
- It reads up to 100,000 characters per call. It caches each URL for 15 minutes. It has a 5 minute deadline.
- It sends a `User-Agent` that starts with `Claude-User`. Sites can block that string.
- In Manual mode WebFetch needs approval. A `WebFetch(domain:www.99acres.com)` allow rule removes the prompt.

### WebSearch

Same page. WebSearch returns titles and URLs from Anthropic's search backend. It does not fetch pages. In my searches, result snippets for 99acres listings included rent, deposit, area, floor and furnishing. That text comes from the search index, not from the live page. It has no photos and no lat/long.

### Claude in Chrome

Source: https://code.claude.com/docs/en/chrome

- `--chrome` connects Claude Code to the user's real Chrome through the Claude in Chrome extension. A real browser would pass the Akamai and housing.com checks, and it runs JavaScript.
- It needs the extension (1.0.36 or later), a direct Anthropic plan, and a `/login` session.
- Browser actions open a visible Chrome tab. The page pauses on a CAPTCHA or login and asks the user to handle it.
- The page does not say whether `--chrome` works with `-p`. I did not test it, because it needs the extension installed.

## Answers to the ticket's questions

| Question | Answer |
| - | - |
| Which tool fetches? | WebFetch. WebSearch only returns links and snippets. |
| Do the sites block it? | Yes. 99acres returns 403 (Akamai). housing.com returns 406. Same for curl with a browser User-Agent. |
| Do they need JavaScript? | Not the blocker. The request is refused before any HTML comes back. WebFetch does not run JavaScript in any case. |
| How long does one call take? | 13 seconds for the blocked case. A successful fetch plus extraction would take longer. |
| How to force JSON? | `--output-format json --json-schema '<schema>'`. Read `structured_output`. Check it exists. |
| Photo URLs and lat/long? | Not with WebFetch, even if the fetch worked, because the Markdown step and the summary call drop them. A real browser (Chrome integration) is the only built-in path that could read them. |

## Options for the next ticket

1. Test `claude -p --chrome` with the extension installed. This is the only built-in path that can load these pages. It opens a visible tab and needs Chrome running.
2. Have the user's own browser send the page. For example, a bookmarklet or a small extension posts the page HTML to the local Node server. Then `claude -p` reads the HTML from stdin, with no fetch at all. Stdin is capped at 10MB.
3. Fall back to WebSearch snippets for the basic fields (rent, area, floor, furnishing). No photos, no coordinates, and the data may be stale.

## Cost notes for the server

The test run cost about $0.44 (estimate) for one failed fetch. Most of that was loading the user's global context. These flags cut it without needing an API key: `--model sonnet`, `--system-prompt "<short prompt>"`, `--setting-sources ""` or a narrow list, `--strict-mcp-config`, `--disable-slash-commands`, `--tools` with only what is needed, and `--max-budget-usd` as a hard cap. I did not measure these.
