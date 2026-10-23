# Decide how the listing page reaches Claude

Type: grilling
Status: resolved
Blocked by: none

## Question

99acres and housing.com block server fetches ([Can local claude read a listing link](01-claude-reads-listing.md)). How does the listing page get to `claude -p`? Candidates from the research: the user's own browser sends the page HTML to the server (for example a bookmarklet), `claude -p --chrome` drives the user's real Chrome (untested with `-p`), or WebSearch snippets for basic fields only (no photos, no lat/long). Also decide the flags that cut cost per call (`--model`, `--setting-sources`, `--max-budget-usd`).

## Resolution

Decided with the user on 2026-10-23. Step 1: the app gives a prompt with only the link, for Claude web. Step 2, if Claude cannot read the page: a bookmarklet runs on the open listing page in the person's browser, reads the page text and photo links, and copies a second prompt. A script on the local helper server is ruled out, because the sites block non-browser requests (HTTP 403). People with Claude Code also get an "Ask my local Claude" button that sends the same content to `claude -p`. Cost flags for that call move to [Decide the add-by-link flow](07-add-by-link-flow.md).
