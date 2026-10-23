# Can local claude read a listing link

Type: research
Status: resolved
Blocked by: none

## Question

Can `claude -p` on the user's Mac (Claude Code 2.1.309) take a 99acres or housing.com listing URL and return the listing fields as JSON? Find out: which tool it uses to fetch (WebFetch or other), whether these sites block it or need JavaScript to render, how long one call takes, how to force JSON output (`--output-format json`, a schema in the prompt), and whether it can return photo URLs and a map location (lat/long or full address).

Research findings: research/claude-reads-listing.md

## Resolution

No, not directly. 99acres returns HTTP 403 and housing.com returns HTTP 406 to both `claude -p` WebFetch and curl. JSON output works with the user's login: `--output-format json --json-schema '<schema>'` puts the result in `structured_output` (check it exists; a failed run leaves it out). `--bare` needs an API key, so it is out. One call took 13 s and an estimated $0.44 on default settings. WebFetch summarizes the page, so photo URLs and lat/long would be lost even when the fetch works. The page content must reach Claude another way: see [Decide how the listing page reaches Claude](08-page-to-claude.md). Details: research/claude-reads-listing.md.
