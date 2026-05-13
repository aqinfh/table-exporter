# Table Exporter

Chrome extension for extracting and exporting table data from any webpage — built with Google Play Console in mind, works anywhere.

## Features

- Detects both `<table>` elements and ARIA grids (`role="grid"`)
- Column picker — select/deselect individual columns
- Cell value mode — export main text, secondary text, or both (for Play Console dual-line cells)
- Row order — original or reversed
- Export as: **TSV** (paste into Sheets/Excel), **CSV** (copy or download), **XLS** (SpreadsheetML)
- UTF-8 BOM on CSV downloads for Excel compatibility

## Installation

1. Download or clone this repository
2. Open `chrome://extensions` in Chrome
3. Enable **Developer mode** (top-right toggle)
4. Click **Load unpacked** → select this folder

No build step required.

## Usage

1. Navigate to a page with a table or data grid
2. Click the extension icon
3. Select the table (if multiple detected)
4. Choose columns, cell value mode, row order, and delimiter
5. Click **Copy for Sheets**, **Copy as CSV**, **Download CSV**, or **Download XLS**

## How it works

| File | Role |
|------|------|
| `manifest.json` | MV3 manifest — permissions: `activeTab`, `scripting`, `clipboardWrite` |
| `content.js` | Injected into the active tab on demand; detects tables, extracts data |
| `popup.html` / `popup.js` | Extension popup UI and export logic |

Content script is injected dynamically (not declared as a `content_scripts` entry), so it only runs when the popup is open.

## Play Console specifics

Play Console uses ARIA grids with a frozen first column and cells containing two text spans:

- `span.main-text` — primary metric value
- `span[debug-id="secondary-line-single-text"]` — delta or secondary value

The **Cell Value** mode selector appears automatically when these dual-line cells are detected.

## Author

Zainal Muttaqin — [zainal1994@gmail.com](mailto:zainal1994@gmail.com)
