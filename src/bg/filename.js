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

const VIDEO_EXTS = new Set(['mp4', 'webm', 'ogg', 'ogv', 'mov', 'm4v', 'mkv']);
const IMAGE_EXTS = new Set([
  'jpg', 'jpeg', 'png', 'webp', 'avif', 'gif', 'bmp', 'ico', 'svg', 'heic', 'heif',
]);

function ensureExt(name, item) {
  const stripped = name.replace(/\.[a-z0-9]{1,5}$/i, '');
  const candidate = String(item.ext || urlExt(item.url) || '').toLowerCase();
  let ext;
  if (item.kind === 'video') {
    // Don't trust an arbitrary URL extension (e.g. a YouTube watch URL ending
    // in /watch or .html). Only keep it if it's actually a video extension;
    // otherwise default to mp4.
    ext = VIDEO_EXTS.has(candidate) ? candidate : 'mp4';
  } else if (item.kind === 'image') {
    ext = IMAGE_EXTS.has(candidate) ? candidate : 'jpg';
  } else {
    ext = candidate || 'bin';
  }
  return `${stripped}.${ext}`;
}

function shortHash(s) {
  return djb2(s).slice(0, 4);
}
