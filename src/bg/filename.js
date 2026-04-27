// @ts-check
import { urlExt } from '../shared/url.js';
import { djb2 } from '../shared/media-item.js';

const SAFE_CHAR = /[^A-Za-z0-9._-]/g;

export function sanitizeFilename(s) {
  return String(s ?? '')
    .replace(SAFE_CHAR, '_')
    .replace(/^\.+/, '')
    .slice(0, 200) || 'download';
}

export function sanitizeSubfolder(s, fallback = 'web-downloads') {
  const cleaned = String(s ?? '')
    .replace(SAFE_CHAR, '_')
    .replace(/^\.+/, '')
    .slice(0, 100);
  return cleaned || fallback;
}

export function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * @param {{ url: string, alt?: string, caption?: string, ext?: string, filename?: string, kind: string }} item
 * @param {{ pageTitle?: string, index: number }} ctx
 */
export function resolveFilename(item, ctx) {
  if (item.filename) return ensureExt(sanitizeFilename(item.filename), item);
  if (item.alt && hasContent(item.alt)) {
    return ensureExt(`${sanitizeFilename(item.alt)}-${shortHash(item.url)}`, item);
  }
  if (item.caption && hasContent(item.caption)) {
    return ensureExt(`${sanitizeFilename(item.caption)}-${shortHash(item.url)}`, item);
  }
  const last = lastUrlSegment(item.url);
  if (last && /[a-z]/i.test(last)) {
    return ensureExt(sanitizeFilename(last), item);
  }
  const base = ctx.pageTitle ? sanitizeFilename(ctx.pageTitle) : 'media';
  return ensureExt(`${base}-${ctx.index}-${shortHash(item.url)}`, item);
}

function hasContent(s) {
  if (!s) return false;
  const t = s.trim();
  if (t.length < 2) return false;
  if (/^image$|^photo$|^picture$|^untitled$/i.test(t)) return false;
  if (/^[\d\s_-]+$/.test(t)) return false;
  return true;
}

function lastUrlSegment(url) {
  try {
    const u = new URL(url);
    const seg = u.pathname.split('/').pop() || '';
    return seg.replace(/\.[a-z0-9]{1,5}$/i, '');
  } catch {
    return '';
  }
}

function ensureExt(name, item) {
  const stripped = name.replace(/\.[a-z0-9]{1,5}$/i, '');
  const ext = item.ext || urlExt(item.url) || (item.kind === 'video' ? 'mp4' : 'jpg');
  return `${stripped}.${ext}`;
}

function shortHash(s) {
  return djb2(s).slice(0, 4);
}
