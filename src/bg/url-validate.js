// @ts-check
import { isHttpUrl } from '../shared/url.js';

// Phase 1+2 trust model: the user activated us on the current tab. We accept
// any http/https URL and the conflictAction:'uniquify' on chrome.downloads
// keeps the filesystem safe. Schemes like data:, file:, javascript: are
// rejected.
export function isDownloadableUrl(s) {
  return isHttpUrl(s) || /^data:image\/svg\+xml/i.test(String(s ?? ''));
}

export function isPanelOrigin(senderId) {
  return senderId === chrome.runtime.id;
}
