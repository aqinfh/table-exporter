if (!window.__tableExporterLoaded) {
  window.__tableExporterLoaded = true;

  // ── Table detection ──────────────────────────────────────────────────────────

  function tableLabel(el, fallback) {
    return (
      el.getAttribute('aria-label')?.trim() ||
      el.querySelector('caption')?.textContent.trim() ||
      nearbyHeading(el) ||
      fallback
    );
  }

  function nearbyHeading(el) {
    let node = el.previousElementSibling;
    let steps = 0;
    while (node && steps < 4) {
      if (/^H[1-6]$/.test(node.tagName)) return node.textContent.trim().slice(0, 50);
      node = node.previousElementSibling;
      steps++;
    }
    // also check parent's preceding sibling
    node = el.parentElement?.previousElementSibling;
    if (node && /^H[1-6]$/.test(node?.tagName)) return node.textContent.trim().slice(0, 50);
    return '';
  }

  function detectTables() {
    const tables = [];

    document.querySelectorAll('table').forEach((el, i) => {
      tables.push({ el, type: 'html', label: tableLabel(el, `Table ${i + 1}`) });
    });

    document.querySelectorAll('[role="grid"]').forEach((el, i) => {
      tables.push({ el, type: 'grid', label: tableLabel(el, `Grid ${i + 1}`) });
    });

    return tables;
  }

  // ── Headers ──────────────────────────────────────────────────────────────────

  function getHeadersFor(t) {
    if (t.type === 'html') {
      // prefer <thead> cells, fall back to first <tr>
      let cells = Array.from(t.el.querySelectorAll('thead th, thead td'));
      if (!cells.length) {
        const firstRow = t.el.querySelector('tr');
        cells = firstRow ? Array.from(firstRow.querySelectorAll('th, td')) : [];
      }
      return cells.map(c => c.textContent.trim());
    }

    if (t.type === 'grid') {
      return Array.from(t.el.querySelectorAll('[role="columnheader"]')).map(el => {
        // Play Console wraps text in .particle-header-title; generic grids may not
        const inner = el.querySelector('.particle-header-title');
        return (inner ?? el).textContent.trim();
      });
    }

    return [];
  }

  // ── Sample values (for popup hints) ─────────────────────────────────────────

  function getSampleFor(t) {
    if (t.type === 'html') return { hasSecondary: false };

    // Walk data rows, skip col 0 (often a date/label), find first cell with both values
    const rows = Array.from(t.el.querySelectorAll('[role="row"]')).filter(row =>
      !row.querySelector('[role="columnheader"]') &&
      !row.classList.contains('particle-table-header')
    );

    for (const row of rows) {
      const frozen     = row.querySelector(':scope > ess-cell[role="gridcell"], :scope > [role="gridcell"]');
      const scrolled   = Array.from(row.querySelectorAll(':scope > [role="presentation"] [role="gridcell"]'));
      const allCells   = frozen ? [frozen, ...scrolled] : scrolled;
      const dataCells  = allCells.slice(1); // skip col 0

      for (const cell of dataCells) {
        const main      = cell.querySelector('span.main-text')?.textContent.trim();
        const secondary = cell.querySelector('span[debug-id="secondary-line-single-text"]')?.textContent.trim();
        if (main && secondary) return { hasSecondary: true, mainExample: main, secondaryExample: secondary };
      }
      break; // only need first row
    }

    return { hasSecondary: false };
  }

  // ── Cell value ───────────────────────────────────────────────────────────────

  function getCellValue(cell, tableType, mode) {
    if (tableType === 'grid') {
      const main      = cell.querySelector('span.main-text')?.textContent.trim() ?? '';
      const secondary = cell.querySelector('span[debug-id="secondary-line-single-text"]')?.textContent.trim() ?? '';
      if (mode === 'main')      return main;
      if (mode === 'secondary') return secondary;
      return secondary ? `${main} (${secondary})` : main;
    }
    // HTML table — no main/secondary split, just text
    return cell.textContent.trim();
  }

  // ── Data extraction ──────────────────────────────────────────────────────────

  function extractDataFor(t, settings) {
    const { selectedIndices, mode, reversed } = settings;
    const allHeaders = getHeadersFor(t);
    const dataRows = [];

    if (t.type === 'html') {
      // collect data rows (tr with at least one td)
      t.el.querySelectorAll('tr').forEach(row => {
        const cells = Array.from(row.querySelectorAll('td'));
        if (!cells.length) return;
        const values = cells.map(c => getCellValue(c, 'html', mode));
        dataRows.push(selectedIndices.map(i => values[i] ?? ''));
      });
    }

    if (t.type === 'grid') {
      t.el.querySelectorAll('div.particle-table-row[role="row"], [role="row"]:not(.particle-table-header)').forEach(row => {
        // skip header rows (they contain columnheader cells, not gridcells with data)
        if (row.querySelector('[role="columnheader"]')) return;

        const frozenCell  = row.querySelector(':scope > ess-cell[role="gridcell"], :scope > [role="gridcell"]');
        const scrollCells = Array.from(
          row.querySelectorAll(':scope > [role="presentation"] [role="gridcell"]')
        );
        const allCells = frozenCell ? [frozenCell, ...scrollCells] : scrollCells;
        if (!allCells.length) return;

        const values = allCells.map(c => getCellValue(c, 'grid', mode));
        dataRows.push(selectedIndices.map(i => values[i] ?? ''));
      });
    }

    if (reversed) dataRows.reverse();

    return {
      headers: selectedIndices.map(i => allHeaders[i] ?? `Col ${i + 1}`),
      rows: dataRows,
    };
  }

  // ── Message handler ──────────────────────────────────────────────────────────

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    try {
      const tables = detectTables();

      if (message.action === 'getTables') {
        sendResponse({
          ok: true,
          data: tables.map(({ label, type }, index) => ({ index, label, type })),
        });

      } else if (message.action === 'getHeaders') {
        const t = tables[message.tableIndex ?? 0];
        if (!t) return sendResponse({ ok: false, error: 'Table not found.' });
        sendResponse({ ok: true, data: getHeadersFor(t), sample: getSampleFor(t) });

      } else if (message.action === 'extractData') {
        const t = tables[message.settings?.tableIndex ?? 0];
        if (!t) return sendResponse({ ok: false, error: 'Table not found.' });
        const result = extractDataFor(t, message.settings);
        sendResponse({ ok: true, data: result });

      } else {
        sendResponse({ ok: false, error: 'Unknown action.' });
      }
    } catch (err) {
      sendResponse({ ok: false, error: err.message });
    }
    return true;
  });
}
