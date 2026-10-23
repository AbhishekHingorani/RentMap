---
name: rental-map-pin-colors
category: design
description: Use when changing rental map pin colors.
---

# Rental map pin colors

Shortlisted pins are green. Every other pin is blue. The app does not show Status, so there are no rejected pins and no Show rejected switch. Do not add a new pin color without asking the user first. Offer the existing green and blue and one new option.

- Stacking is set by `pinLayerOrder(listing, picked)` in `public/app.mjs`. The open listing gets 1000. Shortlisted pins get 500. Others get 0. Keep shortlisted pins above the blue ones.
