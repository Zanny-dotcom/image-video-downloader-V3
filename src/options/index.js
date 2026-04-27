// @ts-check
import { DEFAULTS } from '../shared/defaults.js';

const subfolderEl = /** @type {HTMLInputElement} */ (document.getElementById('subfolder'));
const concurrencyEl = /** @type {HTMLInputElement} */ (document.getElementById('concurrencyLimit'));
const toast = /** @type {HTMLElement} */ (document.getElementById('toast'));

const SAFE_CHAR = /[^A-Za-z0-9._-]/g;

function sanitize(s) {
  const cleaned = String(s ?? '')
    .replace(SAFE_CHAR, '_')
    .replace(/^\.+/, '')
    .slice(0, 100);
  return cleaned || DEFAULTS.subfolder;
}

function clampConcurrency(n) {
  const x = Math.round(Number(n));
  if (!Number.isFinite(x)) return DEFAULTS.concurrencyLimit;
  return Math.max(1, Math.min(16, x));
}

async function load() {
  const opts = await chrome.storage.sync.get(DEFAULTS);
  subfolderEl.value = opts.subfolder;
  concurrencyEl.value = String(opts.concurrencyLimit);
}

let toastTimer = /** @type {any} */ (null);
function showToast(text) {
  toast.textContent = text;
  toast.classList.remove('hidden');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add('hidden'), 1500);
}

async function save() {
  const subfolder = sanitize(subfolderEl.value);
  const concurrencyLimit = clampConcurrency(concurrencyEl.value);
  subfolderEl.value = subfolder;
  concurrencyEl.value = String(concurrencyLimit);
  try {
    await chrome.storage.sync.set({ subfolder, concurrencyLimit });
    showToast('Saved');
  } catch (err) {
    console.error('Save failed:', err);
    showToast('Save failed');
  }
}

subfolderEl.addEventListener('change', save);
concurrencyEl.addEventListener('change', save);

load();
