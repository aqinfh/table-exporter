# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Chrome extension (Manifest V3) that extracts table data from any webpage and exports as CSV, XLS, or clipboard-ready TSV. Originally built for Google Play Console, but works on any site with `<table>` or `role="grid"` elements.

## Loading the extension (no build step)

Load unpacked in Chrome: `chrome://extensions` → Enable Developer Mode → Load unpacked → select this directory. Reload the extension after any JS or HTML change.

## Architecture

Two scripts, zero dependencies:

**`content.js`** — injected into the active tab on demand (not declared in manifest; injected dynamically via `chrome.scripting.executeScript`). Guards against double-injection with `window.__tableExporterLoaded`. Handles three message actions:
- `getTables` — detects `<table>` (type `html`) and `[role="grid"]` (type `grid`) elements
- `getHeaders` — extracts column headers; for grids, looks for `.particle-header-title` (Play Console-specific)
- `extractData` — extracts rows with column filtering, cell value mode (`main`/`secondary`/`both`), and optional reversal

**`popup.js`** — runs in `popup.html`. Calls `injectAndSend()` which injects content.js then sends a message. All UI state is ephemeral (no `chrome.storage`).

## Grid vs HTML table handling

Play Console uses ARIA grids (`role="grid"`) with a frozen first column (`ess-cell[role="gridcell"]`) and scrollable columns inside `[role="presentation"]`. Cells can have two text spans:
- `span.main-text` — primary value (e.g. installs count)
- `span[debug-id="secondary-line-single-text"]` — secondary value (e.g. delta %)

The "Cell Value" mode radio only appears in the popup when `getSampleFor()` detects a cell with both spans.

## Export formats

| Button | Format | Notes |
|--------|--------|-------|
| Copy for Sheets | TSV | Tabs stripped from values |
| Copy as CSV | CSV | RFC 4180 quoting |
| Download CSV | CSV | UTF-8 BOM prepended for Excel compat |
| Download XLS | SpreadsheetML XML | Numeric detection via `!isNaN()` |

## manifest.json

Permissions: `activeTab`, `scripting`, `clipboardWrite`. No background service worker. Version bump required in `manifest.json` for Chrome Web Store updates.
