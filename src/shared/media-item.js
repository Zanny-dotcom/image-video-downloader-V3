// @ts-check

/**
 * @typedef {'image'|'video'|'stream-hls'|'stream-dash'|'embedded'|'drm'} MediaKind
 *
 * @typedef {Object} BlockedReason
 * @property {'embedded-player'|'drm'|'unknown-host'} reason
 * @property {string} detail
 *
 * @typedef {Object} MediaItem
 * @property {string} id
 * @property {MediaKind} kind
 * @property {string} url
 * @property {string} [originalUrl]
 * @property {string} source
 * @property {string} [thumbnailUrl]
 * @property {number} [width]
 * @property {number} [height]
 * @property {number} [bytes]
 * @property {string} [mimeType]
 * @property {string} [ext]
 * @property {string} [filename]
 * @property {string} [alt]
 * @property {string} [caption]
 * @property {BlockedReason} [blocked]
 * @property {string} pageHref
 * @property {number} capturedAt
 */

export function djb2(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
