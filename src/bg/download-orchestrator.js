// @ts-check
import { peekTabState } from './tab-state.js';
import { broadcast, broadcastState } from './messages.js';
import { isDownloadableUrl } from './url-validate.js';
import {
  sanitizeSubfolder,
  sanitizeFilename,
  escapeRegex,
  resolveFilename,
} from './filename.js';
import { DEFAULTS } from '../shared/defaults.js';

const downloadToTab = new Map();
const downloadToItemId = new Map();

function getOptions() {
  return chrome.storage.sync.get(DEFAULTS);
}

function alreadySaved(subfolder, filename) {
  const target = `${subfolder}/${filename}`;
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(false);
    }, 5000);
    chrome.downloads.search(
      { filenameRegex: escapeRegex(target) + '$' },
      (results) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(Array.isArray(results) && results.length > 0);
      }
    );
  });
}

function errorMessage(e) {
  if (e instanceof Error) return e.message;
  if (e && typeof e.message === 'string') return e.message;
  return String(e);
}

export async function startDownloads(tabId, itemIds) {
  const state = peekTabState(tabId);
  if (!state) return;
  if (state.inProgress) return;

  const items = itemIds
    .map((id) => state.items.get(id))
    .filter(Boolean)
    .filter((it) => isDownloadableUrl(it.url) && !it.blocked);
  if (items.length === 0) return;

  state.inProgress = true;
  state.errors = [];
  state.completed = 0;
  state.summary = null;
  state.downloadingIds = new Set(items.map((it) => it.id));
  broadcastState(tabId);

  try {
    const opts = await getOptions();
    const subfolder = sanitizeSubfolder(opts.subfolder);
    const concurrency = Math.max(
      1,
      Math.min(16, opts.concurrencyLimit || DEFAULTS.concurrencyLimit)
    );

    let newCount = 0;
    let skipCount = 0;
    /** @type {Array<{ item: any, filename: string }>} */
    const plan = [];
    let index = 0;
    for (const item of items) {
      const filename = sanitizeFilename(
        resolveFilename(item, { pageTitle: state.pageTitle, index: index++ })
      );
      if (await alreadySaved(subfolder, filename)) {
        skipCount++;
      } else {
        newCount++;
        plan.push({ item, filename });
      }
    }

    state.summary = { found: items.length, new: newCount, alreadySaved: skipCount };
    broadcast({ type: 'DOWNLOAD_SUMMARY', tabId, summary: state.summary });
    broadcastState(tabId);

    let cursor = 0;
    const workers = Array.from(
      { length: Math.min(concurrency, plan.length) },
      async () => {
        while (cursor < plan.length) {
          const i = cursor++;
          const { item, filename } = plan[i];
          await runOne(tabId, subfolder, item, filename);
        }
      }
    );
    await Promise.all(workers);
  } finally {
    state.inProgress = false;
    broadcastState(tabId);
  }
}

async function runOne(tabId, subfolder, item, filename) {
  const state = peekTabState(tabId);
  if (!state) return;
  try {
    const id = await new Promise((resolve, reject) => {
      chrome.downloads.download(
        {
          url: item.url,
          filename: `${subfolder}/${filename}`,
          conflictAction: 'uniquify',
        },
        (dlId) => {
          if (chrome.runtime.lastError || dlId === undefined) {
            reject(
              chrome.runtime.lastError || new Error('download() returned no id')
            );
          } else {
            resolve(dlId);
          }
        }
      );
    });
    downloadToTab.set(id, tabId);
    downloadToItemId.set(id, item.id);
  } catch (e) {
    state.errors.push({
      itemId: item.id,
      url: item.url,
      reason: `Could not start: ${errorMessage(e)}`,
    });
    broadcast({
      type: 'DOWNLOAD_ERROR',
      tabId,
      itemId: item.id,
      errors: state.errors,
    });
  }
}

chrome.downloads.onChanged.addListener((delta) => {
  const id = delta.id;
  const tabId = downloadToTab.get(id);
  if (tabId == null) return;
  const itemId = downloadToItemId.get(id);
  const state = peekTabState(tabId);
  if (!state) return;

  const current = delta.state?.current;
  if (current === 'complete') {
    state.completed = (state.completed || 0) + 1;
    state.downloadingIds.delete(itemId);
    broadcast({
      type: 'DOWNLOAD_PROGRESS',
      tabId,
      itemId,
      completed: state.completed,
      total: state.summary?.new || 0,
    });
    downloadToTab.delete(id);
    downloadToItemId.delete(id);
  } else if (current === 'interrupted') {
    const err = (delta.error && delta.error.current) || 'UNKNOWN';
    const isExpired = /FORBIDDEN|BAD_CONTENT|SERVER_FAILED|SERVER_UNAUTHORIZED/.test(err);
    const reason = isExpired
      ? `Server rejected (${err}) — URL likely expired, refresh and retry`
      : `Download interrupted: ${err}`;
    state.errors.push({ itemId, url: 'unknown', reason });
    state.downloadingIds.delete(itemId);
    broadcast({ type: 'DOWNLOAD_ERROR', tabId, itemId, errors: state.errors });
    downloadToTab.delete(id);
    downloadToItemId.delete(id);
  }
});
