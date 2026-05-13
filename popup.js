(() => {
  const $ = id => document.getElementById(id);

  const loadingMsg   = $('loading-msg');
  const mainContent  = $('main-content');
  const tableSelect  = $('table-select');
  const tableMeta    = $('table-meta');
  const columnsList  = $('columns-list');
  const toggleAllBtn = $('toggle-all');
  const btnCopyTsv   = $('btn-copy-tsv');
  const btnCopyCsv   = $('btn-copy-csv');
  const btnDownCsv   = $('btn-download-csv');
  const btnDownXls   = $('btn-download-xls');
  const statusEl     = $('status');

  let allSelected = true;

  // ── Status ──────────────────────────────────────────────────────────────────

  function showStatus(msg, type = '') {
    statusEl.textContent = msg;
    statusEl.className = type;
    if (msg) setTimeout(() => { statusEl.textContent = ''; statusEl.className = ''; }, 3000);
  }

  // ── Settings ─────────────────────────────────────────────────────────────────

  function getSelectedIndices() {
    return Array.from(columnsList.querySelectorAll('input[type="checkbox"]'))
      .map((cb, i) => cb.checked ? i : -1)
      .filter(i => i !== -1);
  }

  function getDelimiter() {
    const val = document.querySelector('input[name="delimiter"]:checked')?.value ?? ',';
    return val === 'tab' ? '\t' : val;
  }

  function isBodyOnly() {
    return document.querySelector('input[name="extract"]:checked')?.value === 'body';
  }

  function getSettings() {
    return {
      tableIndex:      Number(tableSelect.value ?? 0),
      selectedIndices: getSelectedIndices(),
      mode:            document.querySelector('input[name="mode"]:checked')?.value ?? 'main',
      reversed:        document.querySelector('input[name="order"]:checked')?.value === 'reversed',
    };
  }

  // ── Column list ──────────────────────────────────────────────────────────────

  function buildColumnsList(hdrs) {
    columnsList.innerHTML = '';
    hdrs.forEach((name, i) => {
      const label = document.createElement('label');
      label.className = 'col-item';

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = true;
      cb.dataset.index = i;

      const span = document.createElement('span');
      span.textContent = name || `Column ${i + 1}`;

      label.appendChild(cb);
      label.appendChild(span);
      columnsList.appendChild(label);
    });

    updateToggleBtn();
  }

  function updateToggleBtn() {
    const boxes = columnsList.querySelectorAll('input[type="checkbox"]');
    const n = Array.from(boxes).filter(cb => cb.checked).length;
    allSelected = n === boxes.length;
    toggleAllBtn.textContent = allSelected ? 'Deselect All' : 'Select All';
  }

  columnsList.addEventListener('change', updateToggleBtn);

  toggleAllBtn.addEventListener('click', () => {
    const newState = !allSelected;
    columnsList.querySelectorAll('input[type="checkbox"]').forEach(cb => { cb.checked = newState; });
    updateToggleBtn();
  });

  // ── Chrome helpers ───────────────────────────────────────────────────────────

  async function getActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
  }

  async function injectAndSend(tab, message) {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    return new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tab.id, message, response => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve(response);
      });
    });
  }

  // ── Init ─────────────────────────────────────────────────────────────────────

  let activeTab = null;

  async function loadHeadersForTable(tableIndex) {
    columnsList.innerHTML = '<span style="font-size:12px;color:#5f6368">Loading columns…</span>';
    const res = await injectAndSend(activeTab, { action: 'getHeaders', tableIndex });
    if (!res?.ok || !res.data?.length) {
      columnsList.innerHTML = '<span style="font-size:12px;color:#d93025">No headers found.</span>';
      return;
    }
    buildColumnsList(res.data);
    updateCellValueSection(res.sample);
  }

  function updateCellValueSection(sample) {
    const section = document.getElementById('cell-value-section');
    const exMain  = document.getElementById('ex-main');
    const exSec   = document.getElementById('ex-secondary');
    const exBoth  = document.getElementById('ex-both');

    if (sample?.hasSecondary) {
      const m = sample.mainExample;
      const s = sample.secondaryExample;
      exMain.textContent  = `(e.g. ${m})`;
      exSec.textContent   = `(e.g. ${s})`;
      exBoth.textContent  = `(e.g. ${m} (${s}))`;
      section.classList.remove('hidden');
    } else {
      section.classList.add('hidden');
      // reset to main so hidden mode doesn't bleed into export
      document.querySelector('input[name="mode"][value="main"]').checked = true;
    }
  }

  async function init() {
    try {
      activeTab = await getActiveTab();

      const res = await injectAndSend(activeTab, { action: 'getTables' });

      if (!res?.ok || !res.data?.length) {
        loadingMsg.textContent = 'No tables found on this page.';
        return;
      }

      const tables = res.data;

      // populate table selector
      tableSelect.innerHTML = '';
      tables.forEach(({ index, label, type }) => {
        const opt = document.createElement('option');
        opt.value = index;
        opt.textContent = `${label}`;
        opt.dataset.type = type;
        tableSelect.appendChild(opt);
      });

      updateTableMeta(tables[0]);

      loadingMsg.classList.add('hidden');
      mainContent.classList.remove('hidden');

      await loadHeadersForTable(0);

    } catch (err) {
      loadingMsg.textContent = `Error: ${err.message}`;
    }
  }

  function updateTableMeta(tableInfo) {
    if (!tableInfo) { tableMeta.textContent = ''; return; }
    const typeLabel = tableInfo.type === 'grid' ? 'ARIA grid' : 'HTML table';
    tableMeta.textContent = `Type: ${typeLabel}`;
  }

  tableSelect.addEventListener('change', async () => {
    const idx = Number(tableSelect.value);
    const opt = tableSelect.options[tableSelect.selectedIndex];
    updateTableMeta({ type: opt?.dataset.type });
    await loadHeadersForTable(idx);
  });

  // ── Extract ──────────────────────────────────────────────────────────────────

  async function fetchRows() {
    const settings = getSettings();
    if (!settings.selectedIndices.length) {
      showStatus('Select at least one column.', 'err');
      return null;
    }
    try {
      const res = await injectAndSend(activeTab, { action: 'extractData', settings });
      if (!res?.ok) throw new Error(res?.error ?? 'Unknown error');
      return res.data;
    } catch (err) {
      showStatus(`Error: ${err.message}`, 'err');
      return null;
    }
  }

  // ── Formatters ───────────────────────────────────────────────────────────────

  function escapeDelimited(v, delim) {
    const s = String(v ?? '');
    // quote if value contains the delimiter, a double-quote, or a newline
    return (s.includes(delim) || s.includes('"') || s.includes('\n'))
      ? '"' + s.replace(/"/g, '""') + '"'
      : s;
  }

  function getLines(data) {
    return isBodyOnly() ? data.rows : [data.headers, ...data.rows];
  }

  function toCSV(data, delim = ',') {
    return getLines(data)
      .map(row => row.map(v => escapeDelimited(v, delim)).join(delim))
      .join('\n');
  }

  function toTSV(data) {
    return getLines(data)
      .map(row => row.map(v => String(v ?? '').replace(/\t/g, ' ')).join('\t'))
      .join('\n');
  }

  function escapeXml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function toXLS(data) {
    const xmlRows = getLines(data).map(row => {
      const cells = row.map(v => {
        const s = String(v ?? '');
        const isNum = s !== '' && !isNaN(Number(s.replace(/,/g, '.')));
        return isNum
          ? `<Cell><Data ss:Type="Number">${escapeXml(s)}</Data></Cell>`
          : `<Cell><Data ss:Type="String">${escapeXml(s)}</Data></Cell>`;
      }).join('');
      return `<Row>${cells}</Row>`;
    }).join('');

    return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Worksheet ss:Name="Export">
    <Table>${xmlRows}</Table>
  </Worksheet>
</Workbook>`;
  }

  // ── Clipboard / Download ─────────────────────────────────────────────────────

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = Object.assign(document.createElement('textarea'), {
        value: text, style: 'position:fixed;opacity:0;'
      });
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
  }

  function downloadBlob(content, filename, mime) {
    const url = URL.createObjectURL(new Blob([content], { type: mime }));
    Object.assign(document.createElement('a'), { href: url, download: filename }).click();
    URL.revokeObjectURL(url);
  }

  // ── Button handlers ──────────────────────────────────────────────────────────

  async function withDisabled(btns, fn) {
    btns.forEach(b => { b.disabled = true; });
    try { await fn(); } finally { btns.forEach(b => { b.disabled = false; }); }
  }

  btnCopyTsv.addEventListener('click', () => withDisabled([btnCopyTsv], async () => {
    const data = await fetchRows();
    if (!data) return;
    await copyText(toTSV(data));
    showStatus('Copied — paste directly into Sheets / Excel.', 'ok');
  }));

  btnCopyCsv.addEventListener('click', () => withDisabled([btnCopyCsv], async () => {
    const data = await fetchRows();
    if (!data) return;
    await copyText(toCSV(data, getDelimiter()));
    showStatus('Copied as CSV.', 'ok');
  }));

  btnDownCsv.addEventListener('click', () => withDisabled([btnDownCsv], async () => {
    const data = await fetchRows();
    if (!data) return;
    downloadBlob('﻿' + toCSV(data, getDelimiter()), `export-${Date.now()}.csv`, 'text/csv;charset=utf-8;');
    showStatus('CSV download started.', 'ok');
  }));

  btnDownXls.addEventListener('click', () => withDisabled([btnDownXls], async () => {
    const data = await fetchRows();
    if (!data) return;
    downloadBlob(toXLS(data), `export-${Date.now()}.xls`, 'application/vnd.ms-excel');
    showStatus('XLS download started.', 'ok');
  }));

  init();
})();
