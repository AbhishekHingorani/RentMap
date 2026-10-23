# Node library to read and write Excel

Ticket: `issues/04-node-excel-library.md`. Researched 2026-10-23.

## Question

Which Node library reads and writes `.xlsx` and keeps the user's formatting (column widths, colors, header styles) on save? Compare SheetJS (`xlsx`) and `exceljs`. Cover license, style keeping on write, behavior when Excel for Mac has the file open, and a safe save pattern.

## Summary table

| | SheetJS Community Edition (`xlsx`) | ExcelJS (`exceljs`) |
|---|---|---|
| License | Apache-2.0 | MIT |
| Latest version | 0.20.3, from cdn.sheetjs.com only. npm has a stale 0.18.5 from 2022-03-24. | 4.4.0 on npm, published 2023-10-19 |
| Keeps fills, fonts, borders on write | No. The writer emits one fixed font, two fixed fills and one empty border. | Yes. Reads and writes fonts, fills, borders, alignment, number formats. |
| Keeps column widths | Yes, with `cellStyles: true` on read and write | Yes |
| Install | Tarball URL from the CDN | Plain `npm i exceljs` |

## SheetJS Community Edition

- **License.** `package.json` in the 0.20.3 tarball says `"license": "Apache-2.0"`, and the bundled `LICENSE` is the Apache 2.0 text. Source: https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz
- **Install.** The docs say the npm registry "is out of date" and that its latest version there is 0.18.5. They tell you to install from the CDN: `npm i --save https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`. Source: https://docs.sheetjs.com/docs/getting-started/installation/nodejs. The npm registry confirms `latest` is 0.18.5, published 2022-03-24. Source: https://registry.npmjs.org/xlsx
- **Styles are a paid feature.** The package README says SheetJS Pro offers "let out your inner Picasso with styling". Source: README in the 0.20.3 tarball, and https://sheetjs.com/pro
- **The free writer drops cell styles.** In `xlsx.mjs` (0.20.3), `write_sty_xml` hardcodes `<fonts count="1">` (Calibri 12), `<fills count="2">` (none and gray125) and `<borders count="1">` (empty). `get_cell_style` builds each cell style from the number format only, with `fontId:0, fillId:0, borderId:0`. So a read then write keeps values and number formats. It loses header colors, bold fonts and borders. Source: `package/xlsx.mjs` in the tarball above, lines 11570 and 15784.
- **Column widths survive.** The column properties page marks width as supported for XLSX. It says "The `cellStyles` option must be set to `true`" both to read and to export column properties. Source: https://docs.sheetjs.com/docs/csf/features/colprops
- **Save to file.** `XLSX.writeFile` writes straight to the target path. It has the same partial-write risk as ExcelJS (see below).

## ExcelJS

- **License.** MIT, "Copyright (c) 2014-2019 Guyon Roche". Source: https://github.com/exceljs/exceljs/blob/master/LICENSE
- **Version and upkeep.** npm `latest` is 4.4.0, published 2023-10-19. A `4.4.1-prerelease.0` tag exists. The last commit on `master` is 2024-01-12. Releases are slow, so expect to live with open bugs. Sources: https://registry.npmjs.org/exceljs and https://api.github.com/repos/exceljs/exceljs/commits
- **Styles.** The README opens with "Read, manipulate and write spreadsheet data and styles to XLSX and JSON." Cells, rows and columns take `font`, `fill`, `border`, `alignment`, `numFmt` and `protection`. Columns take `width`. Source: https://github.com/exceljs/exceljs#styles
- **Style sharing gotcha.** The README says "when a document is read from file (or stream) if spreadsheet entities share similar styles, then they will reference the same style object too." Editing `cell.style.font` in place can change other cells. Clone the style object before you change it. Source: same README, Styles section.
- **What the README says it does not handle.** Custom table themes are "not supported by exceljs yet". If a row splice moves merged cells, "the results may be unpredictable". Source: README, Tables and Known Issues sections. The README does not claim to round-trip charts or pivot tables from an existing file. Treat those as at risk until tested.
- **Dependencies.** `jszip`, `archiver`, `unzipper`, `saxes`, `fast-csv`, `dayjs`, `tmp`, `uuid`, `readable-stream`. Engines: Node >= 8.3.0. Source: https://registry.npmjs.org/exceljs/latest
- **How `writeFile` saves.** `lib/xlsx/xlsx.js` calls `fs.createWriteStream(filename)` on the target path and streams the zip into it. Opening the stream truncates the old file first. If the process dies or the zip step throws partway, the user's file is left broken. Source: https://github.com/exceljs/exceljs/blob/master/lib/xlsx/xlsx.js line 744.

## When Excel for Mac has the file open

- **Owner file.** Office makes a hidden `~$<name>.xlsx` owner file next to a workbook while it is open. It is deleted on a clean close. A crash can leave it behind. Source: Microsoft Q&A answers, https://learn.microsoft.com/en-us/answers/a/12490656 and https://learn.microsoft.com/en-us/answers/questions/4975917/excel-file-locking-issues-on-mac-server. These are moderator and community answers, not an official spec.
- **macOS does not block the write.** macOS file locks are advisory. I tested this on this machine (Node 18.12.1). A Python process opened a file and took `flock(LOCK_EX)`. Node then ran `renameSync` over it. The rename returned 0. The disk now held the new content. The holding process still read the old content from its open handle.
- **What that means for us.** Our save will not fail with an error while Excel has the file open. Excel keeps showing its stale copy. If the user then saves in Excel, Excel writes over our changes. Excel is not installed on this machine, so I could not test Excel's own prompt. This part is unverified.
- **Practical check.** Before saving, look for `~$<name>.xlsx` in the same folder. If it exists, warn the user to close the file in Excel, or refuse to save. A stale owner file left by a crash gives a false alarm, so offer an override.

## Safe save: write temp, then rename

1. Build the workbook in memory. With ExcelJS, call `workbook.xlsx.writeBuffer()` instead of `writeFile`.
2. Write the buffer to a temp file in the **same folder** as the target, for example `.<name>.xlsx.tmp-<pid>`. Same folder matters: `rename(2)` fails with `EXDEV` when the two paths are on different filesystems. Source: https://man7.org/linux/man-pages/man2/rename.2.html
3. Call `fsync` on the temp file so the bytes reach disk before the swap.
4. `fs.rename(temp, target)`. POSIX `rename` replaces `newpath` atomically: another process sees the old file or the new file, never a half-written one. Source: same man page.
5. On any error, delete the temp file and leave the original as it was.
6. Optional: keep one backup copy (`<name>.xlsx.bak`) before the rename.

The `write-file-atomic` package from the npm org does steps 2 to 5. It is ISC licensed, version 8.0.0. Source: https://registry.npmjs.org/write-file-atomic/latest. A hand-written version is about 15 lines, so the dependency is optional.

Note: a rename gives the target a new inode. Finder aliases and extended attributes on the old file do not carry over. This is normal for editors and is fine here.

## Recommendation

Use **ExcelJS**. The free SheetJS writer throws away fonts, fills and borders on every save, which fails the ticket's main need. Getting styles from SheetJS means paying for Pro. ExcelJS is MIT, installs from npm, and reads and writes the header colors, bold fonts and column widths the user cares about. Its weak points are slow upkeep and an unsafe `writeFile`. Work around both: save with `writeBuffer()` plus temp file and rename, and check for the `~$` owner file before saving. Test a round trip on a copy of the user's real workbook before relying on it, since charts and pivot tables are not covered by the docs.
