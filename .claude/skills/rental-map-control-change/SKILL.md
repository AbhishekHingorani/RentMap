---
name: rental-map-control-change
category: refactoring
description: Use when adding or removing a rental map field or control.
---

# Rental map control change

Change every layer of a field or control in one pass. Then grep the old name until no hit is left.

- Sheet columns and choices: `public/lib/columns.mjs`.
- Values and parsing: `public/lib/listings.mjs`. Person ratings: `public/lib/our-take.mjs`.
- Filters and sort: `public/lib/filters.mjs` and `public/lib/sort.mjs`. Filter by is several dropdowns that must all pass, not one list. See the product-ui-design-rules skill.
- Rating fields: use `<input type="number">` with `min`, `max`, and `step`. Ours is 0 to 10 with step 0.5.
- Page: `public/index.html`, `public/app.mjs`, `public/app.css`.
- Sheet write check: the refusal rule in the Apps Script must match the new range. Change it in the same run.
- New sheet column: the user must paste the updated Apps Script and redeploy it before a save can write the new cell. Put this as the first step in the reply, with the exact step to take.
- Docs: `SPEC.md` (column table, row numbers, UI lines, refusal rules) and `GLOSSARY.md`.
- Tests: `tests/*.test.mjs`. Remove tests that assert a removed control. Do not leave them failing or rewritten to pass.
- A new `public/lib/*.mjs` file must join the `check` script in `package.json`. Otherwise `npm run check` skips it.

Verify with `npm test` and `npm run check`. Then shoot the page with the fake backend, as in the headless-chrome-screenshot-html skill.
