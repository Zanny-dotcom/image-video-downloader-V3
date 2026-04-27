// @ts-check

/** @type {Map<number, TabState>} */
const tabState = new Map();

/**
 * @typedef {Object} TabState
 * @property {Map<string, import('../shared/media-item.js').MediaItem>} items
 * @property {string} pageTitle
 * @property {string} pageHref
 * @property {boolean} inProgress
 * @property {{ found: number, new: number, alreadySaved: number } | null} summary
 * @property {Array<{ itemId: string, url: string, reason: string }>} errors
 * @property {number} completed
 * @property {Set<string>} downloadingIds
 */

export function getTabState(tabId) {
  let s = tabState.get(tabId);
  if (!s) {
    s = {
      items: new Map(),
      pageTitle: '',
      pageHref: '',
      inProgress: false,
      summary: null,
      errors: [],
      completed: 0,
      downloadingIds: new Set(),
    };
    tabState.set(tabId, s);
  }
  return s;
}

export function peekTabState(tabId) {
  return tabState.get(tabId) || null;
}

export function deleteTabState(tabId) {
  tabState.delete(tabId);
}

export function snapshotForPanel(tabId) {
  const s = peekTabState(tabId);
  if (!s) return null;
  return {
    items: Array.from(s.items.values()),
    pageTitle: s.pageTitle,
    pageHref: s.pageHref,
    summary: s.summary,
    errors: s.errors,
    completed: s.completed,
    inProgress: s.inProgress,
  };
}

export function mergeItems(tabId, newItems, pageMeta) {
  const s = getTabState(tabId);
  if (pageMeta) {
    s.pageTitle = pageMeta.pageTitle || s.pageTitle;
    s.pageHref = pageMeta.pageHref || s.pageHref;
  }
  for (const it of newItems) {
    if (!it || typeof it.id !== 'string') continue;
    const existing = s.items.get(it.id);
    if (!existing) {
      s.items.set(it.id, it);
    } else {
      // Merge: prefer existing values for fields it already has.
      s.items.set(it.id, { ...it, ...existing });
    }
  }
  return s;
}

export function clearItems(tabId) {
  const s = peekTabState(tabId);
  if (!s) return;
  s.items.clear();
  s.summary = null;
  s.errors = [];
  s.completed = 0;
}
