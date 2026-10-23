# Pick a Node library to read and write Excel

Type: research
Status: closed, out of scope
Blocked by: none

## Question

Which Node library reads and writes `.xlsx` and keeps the user's formatting (column widths, colors, header styles) on save? Compare SheetJS (`xlsx`) and `exceljs`. Find out: license, does write keep styles, how it handles a file that the Excel app has open on macOS (lock file, write failure), and a safe way to save (write to a temp file, then rename).

Research findings: research/node-excel-library.md

## Resolution

Use ExcelJS (MIT, 4.4.0). It keeps fonts, fills, borders and column widths on save. SheetJS free drops styles. Save safely: `writeBuffer()`, write a temp file in the same folder, fsync, then rename over the target. Before a save, check for the `~$<name>.xlsx` owner file and warn the user, because a save while Excel has the file open succeeds and Excel can later overwrite it. This applies only if a local `.xlsx` file stays the store; the cloud sheet question is open. Details: research/node-excel-library.md.
