// @ts-check
import { getState, setState, subscribe } from './store.js';
import { render, updateSelectionSummary } from './render.js';

let currentTabId = /** @type {number|null} */ (null);
let lastSelectedIndex = -1;

const statusEl = /** @type {HTMLElement} */ (document.getElementById('status'));
const grid = /** @type {HTMLElement} */ (document.getElementById('grid'));
const selectAll = /** @type {HTMLInputElement} */ (document.getElementById('select-all'));

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || tab.id == null) {
    statusEl.textContent = 'No active tab.';
    return;
  }
  currentTabId = tab.id;
  setState({ tabId: tab.id, pageTitle: tab.title || '', pageHref: tab.url || '' });
  document.getElementById('page-title').textContent = tab.title || tab.url || '';
  document.getElementById('page-title').title = tab.url || '';

  const cached = await chrome.runtime.sendMessage({ type: 'GET_STATE', tabId: tab.id });
  if (cached && cached.state) hydrate(cached.state);

  requestScan();
}

function hydrate(snapshot) {
  setState({
    items: snapshot.items || [],
    summary: snapshot.summary,
    errors: snapshot.errors || [],
    completed: snapshot.completed || 0,
    inProgress: snapshot.inProgress || false,
  });
}

async function requestScan() {
  if (currentTabId == null) return;
  statusEl.textContent = 'Scanning…';
  const r = await chrome.runtime
    .sendMessage({ type: 'REQUEST_SCAN', tabId: currentTabId })
    .catch((e) => ({ ok: false, error: String(e) }));
  if (!r || !r.ok) {
    statusEl.textContent =
      "Can't scan this page. Chrome blocks extensions on chrome://, the Web Store, and similar internal pages. Other pages may need a reload first.";
  } else {
    // Status will be cleared by render() once items arrive.
  }
}

chrome.runtime.onMessage.addListener((msg) => {
  if (!msg || msg.tabId !== currentTabId) return;

  if (msg.type === 'STATE_UPDATE' && msg.snapshot) {
    hydrate(msg.snapshot);
    return;
  }

  if (msg.type === 'DOWNLOAD_SUMMARY') {
    setState({ summary: msg.summary });
    return;
  }

  if (msg.type === 'DOWNLOAD_PROGRESS') {
    const s = getState();
    const done = new Set(s.doneIds);
    if (msg.itemId) done.add(msg.itemId);
    const downloading = new Set(s.downloadingIds);
    if (msg.itemId) downloading.delete(msg.itemId);
    setState({ completed: msg.completed, doneIds: done, downloadingIds: downloading });
    return;
  }

  if (msg.type === 'DOWNLOAD_ERROR') {
    setState({ errors: msg.errors });
    return;
  }
});

subscribe(render);

document.getElementById('rescan-btn').addEventListener('click', requestScan);

document.getElementById('options-btn').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

document.getElementById('download-btn').addEventListener('click', () => {
  if (currentTabId == null) return;
  const selected = collectSelectedIds();
  if (selected.length === 0) return;
  setState({ downloadingIds: new Set(selected), doneIds: new Set() });
  chrome.runtime
    .sendMessage({ type: 'START_DOWNLOADS', tabId: currentTabId, itemIds: selected })
    .catch((e) => console.warn('START_DOWNLOADS', e));
});

selectAll.addEventListener('change', () => {
  const cks = grid.querySelectorAll('input[type="checkbox"]');
  for (const ck of cks) /** @type {HTMLInputElement} */ (ck).checked = selectAll.checked;
  updateSelectionSummary();
});

grid.addEventListener('change', (e) => {
  if (e.target instanceof HTMLInputElement && e.target.type === 'checkbox') {
    updateSelectionSummary();
  }
});

// Shift-click range select
grid.addEventListener('click', (e) => {
  const target = e.target;
  if (!(target instanceof HTMLInputElement) || target.type !== 'checkbox') return;
  const cks = Array.from(grid.querySelectorAll('input[type="checkbox"]'));
  const idx = cks.indexOf(target);
  if (e.shiftKey && lastSelectedIndex >= 0 && idx >= 0) {
    const [from, to] = idx < lastSelectedIndex ? [idx, lastSelectedIndex] : [lastSelectedIndex, idx];
    for (let i = from; i <= to; i++) {
      /** @type {HTMLInputElement} */ (cks[i]).checked = target.checked;
    }
    updateSelectionSummary();
  }
  lastSelectedIndex = idx;
});

document.querySelectorAll('#tabs button').forEach((btn) => {
  btn.addEventListener('click', () => {
    document
      .querySelectorAll('#tabs button')
      .forEach((b) => b.setAttribute('aria-selected', 'false'));
    btn.setAttribute('aria-selected', 'true');
    setState({ activeTab: /** @type {any} */ (btn.dataset.tab) });
  });
});

function collectSelectedIds() {
  const cks = grid.querySelectorAll('input[type="checkbox"]:checked');
  return Array.from(cks).map((ck) => /** @type {HTMLInputElement} */ (ck).value);
}

init();
