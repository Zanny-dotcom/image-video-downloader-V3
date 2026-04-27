// Universal Media Downloader — content script.
// Loaded programmatically via chrome.scripting.executeScript when the user
// activates the extension on this tab (activeTab grant). Single file because
// declarative content scripts can't use ES modules and programmatic injection
// shares globals across files anyway.

(() => {
  console.log('[mediadl/content] injection on', location.href);
  if (globalThis.__mediadl_injected) {
    console.log('[mediadl/content] already injected, triggering rescan');
    globalThis.__mediadl_rescan?.();
    return;
  }
  globalThis.__mediadl_injected = true;

  const SCAN_NODE_BUDGET = 5000;
  const RESCAN_DEBOUNCE_MS = 750;

  const EMBEDDED_PLAYERS = [
    { rx: /(?:^|\.)youtube(?:-nocookie)?\.com$/i, label: 'YouTube' },
    { rx: /(?:^|\.)player\.vimeo\.com$/i, label: 'Vimeo' },
    { rx: /(?:^|\.)clips\.twitch\.tv$/i, label: 'Twitch' },
    { rx: /(?:^|\.)dailymotion\.com$/i, label: 'Dailymotion' },
    { rx: /(?:^|\.)tiktok\.com$/i, label: 'TikTok' },
  ];

  // ----- URL utils --------------------------------------------------------

  function isHttpUrl(s) {
    if (typeof s !== 'string') return false;
    try {
      const u = new URL(s, location.href);
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
      return false;
    }
  }

  function abs(url) {
    try {
      return new URL(url, location.href).href;
    } catch {
      return url;
    }
  }

  function pathKey(url) {
    try {
      const u = new URL(url, location.href);
      return u.origin + u.pathname;
    } catch {
      return String(url);
    }
  }

  function urlExt(url) {
    try {
      const u = new URL(url, location.href);
      const m = u.pathname.match(/\.([a-z0-9]{1,5})$/i);
      return m ? m[1].toLowerCase() : '';
    } catch {
      return '';
    }
  }

  function djb2(s) {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  }

  function makeId(kind, url) {
    return `${kind}:${djb2(pathKey(url))}`;
  }

  // ----- srcset -----------------------------------------------------------

  function parseSrcset(srcset) {
    const items = [];
    const s = String(srcset);
    let i = 0;
    while (i < s.length) {
      while (i < s.length && /\s/.test(s[i])) i++;
      if (i >= s.length) break;
      const urlStart = i;
      while (i < s.length && !/\s/.test(s[i]) && s[i] !== ',') i++;
      const url = s.slice(urlStart, i);
      while (i < s.length && /\s/.test(s[i])) i++;
      const descStart = i;
      while (i < s.length && s[i] !== ',') i++;
      const descriptor = s.slice(descStart, i).trim();
      if (url) items.push({ url, descriptor });
      if (s[i] === ',') i++;
    }
    return items;
  }

  function pickLargest(srcset) {
    const items = parseSrcset(srcset);
    if (!items.length) return null;
    let best = items[0];
    let bestValue = -1;
    for (const it of items) {
      let v = 0;
      const m = it.descriptor.match(/^(\d+(?:\.\d+)?)(w|x)$/);
      if (m) v = parseFloat(m[1]);
      if (v > bestValue) {
        bestValue = v;
        best = it;
      }
    }
    return best.url;
  }

  // ----- Lazy-load attribute candidates ----------------------------------

  const LAZY_ATTRS_SRC = [
    'data-src',
    'data-original',
    'data-lazy',
    'data-url',
    'data-image',
    'data-bg',
    'data-large',
    'data-full',
  ];
  const LAZY_ATTRS_SRCSET = ['data-srcset', 'data-lazy-srcset'];

  function lazyCandidatesForImg(img) {
    const out = [];
    for (const a of LAZY_ATTRS_SRC) {
      const v = img.getAttribute(a);
      if (v) out.push(v);
    }
    for (const a of LAZY_ATTRS_SRCSET) {
      const v = img.getAttribute(a);
      if (v) {
        const best = pickLargest(v);
        if (best) out.push(best);
      }
    }
    return out;
  }

  // ----- Filename hints --------------------------------------------------

  function findCaption(el) {
    let p = el.parentElement;
    while (p && p !== document.body) {
      if (p.tagName === 'FIGURE') {
        const cap = p.querySelector('figcaption');
        if (cap && cap.textContent) return cap.textContent.trim();
        break;
      }
      p = p.parentElement;
    }
    return '';
  }

  function pageMeta() {
    const og =
      document.querySelector('meta[property="og:title"]')?.getAttribute('content') ||
      '';
    return {
      pageTitle: og || document.title || '',
      pageHref: location.href,
    };
  }

  // ----- Scanners --------------------------------------------------------

  let nodeBudget = SCAN_NODE_BUDGET;

  function makeImageItem(url, opts = {}) {
    if (!isHttpUrl(url)) return null;
    return {
      id: makeId('image', abs(url)),
      kind: 'image',
      url: abs(url),
      source: opts.source || 'dom-img',
      thumbnailUrl: opts.thumbnailUrl,
      width: opts.width,
      height: opts.height,
      ext: urlExt(url) || undefined,
      alt: opts.alt,
      caption: opts.caption,
      pageHref: location.href,
      capturedAt: Date.now(),
    };
  }

  function makeVideoItem(url, opts = {}) {
    if (!isHttpUrl(url)) return null;
    return {
      id: makeId('video', abs(url)),
      kind: 'video',
      url: abs(url),
      source: opts.source || 'dom-video',
      thumbnailUrl: opts.thumbnailUrl,
      ext: urlExt(url) || undefined,
      pageHref: location.href,
      capturedAt: Date.now(),
    };
  }

  function makeBlockedItem(label, detail) {
    return {
      id: 'blocked:' + djb2(label + detail),
      kind: 'embedded',
      url: detail,
      source: 'iframe',
      blocked: { reason: 'embedded-player', detail: label },
      pageHref: location.href,
      capturedAt: Date.now(),
    };
  }

  function scanImages(items, seen) {
    for (const img of document.querySelectorAll('img')) {
      if (--nodeBudget <= 0) return;
      const candidates = [];
      if (img.srcset) {
        const best = pickLargest(img.srcset);
        if (best) candidates.push(best);
      }
      candidates.push(...lazyCandidatesForImg(img));
      if (img.src) candidates.push(img.src);
      for (const u of candidates) {
        const absU = abs(u);
        if (seen.has(absU)) continue;
        const it = makeImageItem(absU, {
          source: 'dom-img',
          width: img.naturalWidth || undefined,
          height: img.naturalHeight || undefined,
          alt: img.alt || undefined,
          caption: findCaption(img),
        });
        if (!it) continue;
        seen.add(absU);
        items.push(it);
        break;
      }
    }
  }

  function scanPicture(items, seen) {
    for (const pic of document.querySelectorAll('picture')) {
      if (--nodeBudget <= 0) return;
      let best = null;
      for (const src of pic.querySelectorAll('source')) {
        const ss = src.getAttribute('srcset');
        if (!ss) continue;
        const cand = pickLargest(ss);
        if (cand) {
          best = cand;
          break;
        }
      }
      if (!best) continue;
      const absU = abs(best);
      if (seen.has(absU)) continue;
      const inner = pic.querySelector('img');
      const it = makeImageItem(absU, {
        source: 'picture',
        alt: inner?.alt,
        caption: findCaption(pic),
      });
      if (!it) continue;
      seen.add(absU);
      items.push(it);
    }
  }

  const CSS_URL_RE = /url\((['"]?)([^'")]+)\1\)/g;

  function extractCssUrls(bg) {
    const out = [];
    let m;
    CSS_URL_RE.lastIndex = 0;
    while ((m = CSS_URL_RE.exec(bg)) !== null) out.push(m[2]);
    return out;
  }

  function scanCssBackground(items, seen) {
    // Heuristic: only walk elements with a hint they may carry a styled bg.
    const all = document.querySelectorAll(
      '[style*="background"], [class*="bg-"], [class*="background"], [class*="hero"], [class*="cover"], [class*="thumb"]'
    );
    for (const el of all) {
      if (--nodeBudget <= 0) return;
      const cs = getComputedStyle(el);
      const bg = cs.backgroundImage;
      if (!bg || bg === 'none') continue;
      const urls = extractCssUrls(bg);
      for (const u of urls) {
        const absU = abs(u);
        if (seen.has(absU)) continue;
        const it = makeImageItem(absU, { source: 'css-bg' });
        if (!it) continue;
        seen.add(absU);
        items.push(it);
      }
    }
  }

  function scanInlineSvg(items, seen) {
    for (const svg of document.querySelectorAll('svg')) {
      if (--nodeBudget <= 0) return;
      const w =
        parseFloat(svg.getAttribute('width') || '0') ||
        svg.getBoundingClientRect().width;
      const h =
        parseFloat(svg.getAttribute('height') || '0') ||
        svg.getBoundingClientRect().height;
      if (w < 64 || h < 64) continue;
      const xml = new XMLSerializer().serializeToString(svg);
      const url =
        'data:image/svg+xml;base64,' +
        btoa(unescape(encodeURIComponent(xml)));
      if (seen.has(url)) continue;
      seen.add(url);
      items.push({
        id: 'svg:' + djb2(xml),
        kind: 'image',
        url,
        source: 'svg-inline',
        ext: 'svg',
        width: Math.round(w),
        height: Math.round(h),
        alt: svg.getAttribute('aria-label') || undefined,
        pageHref: location.href,
        capturedAt: Date.now(),
      });
    }
  }

  function scanVideos(items, seen) {
    for (const v of document.querySelectorAll('video')) {
      if (--nodeBudget <= 0) return;
      const candidates = [];
      if (v.src && !v.src.startsWith('blob:')) candidates.push(v.src);
      for (const s of v.querySelectorAll('source')) {
        if (s.src && !s.src.startsWith('blob:')) candidates.push(s.src);
      }
      for (const u of candidates) {
        const absU = abs(u);
        if (seen.has(absU)) continue;
        const it = makeVideoItem(absU, {
          source: 'dom-video',
          thumbnailUrl: v.poster || undefined,
        });
        if (!it) continue;
        seen.add(absU);
        items.push(it);
        break;
      }
    }
  }

  function scanIframes(items, seen) {
    for (const iframe of document.querySelectorAll('iframe')) {
      if (--nodeBudget <= 0) return;
      let host = '';
      try {
        host = new URL(iframe.src, location.href).hostname;
      } catch {
        continue;
      }
      for (const { rx, label } of EMBEDDED_PLAYERS) {
        if (rx.test(host)) {
          const key = label + ':' + iframe.src;
          if (seen.has(key)) break;
          seen.add(key);
          items.push(makeBlockedItem(label, iframe.src));
          break;
        }
      }
    }
  }

  // ----- Main scan --------------------------------------------------------

  function scan() {
    nodeBudget = SCAN_NODE_BUDGET;
    const items = [];
    const seen = new Set();
    try { scanImages(items, seen); } catch (e) { console.warn('[mediadl/content] img', e); }
    try { scanPicture(items, seen); } catch (e) { console.warn('[mediadl/content] picture', e); }
    try { scanCssBackground(items, seen); } catch (e) { console.warn('[mediadl/content] css-bg', e); }
    try { scanInlineSvg(items, seen); } catch (e) { console.warn('[mediadl/content] svg', e); }
    try { scanVideos(items, seen); } catch (e) { console.warn('[mediadl/content] video', e); }
    try { scanIframes(items, seen); } catch (e) { console.warn('[mediadl/content] iframe', e); }

    const imgCount = items.filter((it) => it.kind === 'image').length;
    const vidCount = items.filter((it) => it.kind === 'video').length;
    const blkCount = items.filter((it) => it.blocked).length;
    console.log(
      '[mediadl/content] scan complete: ' +
        items.length +
        ' total (' +
        imgCount +
        ' images, ' +
        vidCount +
        ' videos, ' +
        blkCount +
        ' blocked)'
    );

    try {
      chrome.runtime.sendMessage({
        type: 'SCAN_RESULT',
        items,
        pageMeta: pageMeta(),
      });
    } catch (e) {
      console.warn('[mediadl/content] sendMessage failed (extension context invalidated):', e);
    }
  }

  // ----- Rescan on DOM change + SPA nav -----------------------------------

  let rescanTimer = null;
  function debouncedRescan() {
    if (rescanTimer) clearTimeout(rescanTimer);
    rescanTimer = setTimeout(() => scan(), RESCAN_DEBOUNCE_MS);
  }
  globalThis.__mediadl_rescan = debouncedRescan;

  const observer = new MutationObserver(() => debouncedRescan());
  observer.observe(document.documentElement, { childList: true, subtree: true });

  for (const fn of ['pushState', 'replaceState']) {
    const orig = history[fn];
    history[fn] = function (...args) {
      const r = orig.apply(this, args);
      debouncedRescan();
      return r;
    };
  }
  window.addEventListener('popstate', debouncedRescan);

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.type === 'RESCAN_REQUEST') {
      scan();
      sendResponse({ ok: true });
      return;
    }
  });

  scan();
})();
