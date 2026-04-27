// @ts-check

const HTTP_RE = /^https?:$/;

export function isHttpUrl(s) {
  if (typeof s !== 'string') return false;
  try {
    const u = new URL(s);
    return HTTP_RE.test(u.protocol);
  } catch {
    return false;
  }
}

export function isHttpsUrl(s) {
  if (typeof s !== 'string') return false;
  try {
    const u = new URL(s);
    return u.protocol === 'https:';
  } catch {
    return false;
  }
}

export function pathKey(url, base) {
  try {
    const u = new URL(url, base);
    return u.origin + u.pathname;
  } catch {
    return String(url);
  }
}

export function urlExt(url) {
  try {
    const u = new URL(url);
    const m = u.pathname.match(/\.([a-z0-9]{1,5})$/i);
    return m ? m[1].toLowerCase() : '';
  } catch {
    return '';
  }
}
