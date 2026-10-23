"last-prompt": "change rating to number input type and it can be from 0 to 10 with a 0.5 step size. And actually lets get rid of the status field. Don't want it."
-    "check": "node --check server.js && ... && node --check public/lib/photos.mjs"
+    "check": "node --check server.js && ... && node --check public/lib/photos.mjs && node --check public/lib/sort.mjs"
-  assert.equal(filters.showRejected, false);
SPEC.md: "saveCells refuses ... a rating that is not a whole number from 1 to 5 or empty."