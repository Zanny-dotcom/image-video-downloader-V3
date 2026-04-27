// @ts-check
import {
  peekTabState,
  snapshotForPanel,
  mergeItems,
  clearItems,
} from './tab-state.js';
import { isPanelOrigin } from './url-validate.js';
import { startDownloads } from './download-orchestrator.js';

function errorMessage(e) {
  if (e instanceof Error) return e.message;
  if (e && typeof e.message === 'string') return e.message;
  return String(e);
}

export function installMessageRouter() {
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || typeof msg.type !== 'string') return;

    // Content-originated.
    if (msg.type === 'SCAN_RESULT') {
      const tabId = sender.tab?.id;
      if (tabId == null) return;
      if (!Array.isArray(msg.items)) return;
      console.log(
        '[mediadl/bg] SCAN_RESULT from tab',
        tabId,
        '— items:',
        msg.items.length
      );
      mergeItems(tabId, msg.items, msg.pageMeta || null);
      updateBadge(tabId);
      broadcastState(tabId);
      return;
    }

    // Panel/options/SW UI-originated.
    const fromPanel = isPanelOrigin(sender.id) && !sender.tab;
    if (!fromPanel) return;

    if (msg.type === 'GET_STATE') {
      sendResponse({ state: snapshotForPanel(msg.tabId) });
      return;
    }

    if (msg.type === 'CLEAR_ITEMS') {
      clearItems(msg.tabId);
      updateBadge(msg.tabId);
      broadcastState(msg.tabId);
      sendResponse({ ok: true });
      return;
    }

    if (msg.type === 'REQUEST_SCAN') {
      const { tabId } = msg;
      if (typeof tabId !== 'number') {
        sendResponse({ ok: false, error: 'no tabId' });
        return false;
      }
      console.log('[mediadl/bg] REQUEST_SCAN: injecting into tab', tabId);
      chrome.scripting
        .executeScript({ target: { tabId }, files: ['src/content/main.js'] })
        .then(() => {
          console.log('[mediadl/bg] executeScript ok for tab', tabId);
          sendResponse({ ok: true });
        })
        .catch((e) => {
          console.warn('[mediadl/bg] executeScript failed for tab', tabId, e);
          sendResponse({ ok: false, error: errorMessage(e) });
        });
      return true;
    }

    if (msg.type === 'START_DOWNLOADS') {
      const { tabId, itemIds } = msg;
      if (typeof tabId !== 'number' || !Array.isArray(itemIds)) {
        sendResponse({ ok: false, error: 'bad payload' });
        return;
      }
      startDownloads(tabId, itemIds).catch((e) => console.warn('startDownloads:', e));
      sendResponse({ ok: true });
      return;
    }
  });
}

function updateBadge(tabId) {
  const s = peekTabState(tabId);
  const count = s ? s.items.size : 0;
  const text = count === 0 ? '' : count > 99 ? '99+' : String(count);
  chrome.action.setBadgeBackgroundColor({ color: '#2563eb', tabId }).catch(() => {});
  chrome.action.setBadgeText({ text, tabId }).catch(() => {});
}

export function broadcastState(tabId) {
  chrome.runtime
    .sendMessage({ type: 'STATE_UPDATE', tabId, snapshot: snapshotForPanel(tabId) })
    .catch(() => {});
}

export function broadcast(msg) {
  chrome.runtime.sendMessage(msg).catch(() => {});
}
