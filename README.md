# Universal Media Downloader — v3

A Manifest V3 Chrome extension that discovers images and videos on **any** web page and downloads selected ones into a folder under your Downloads directory.

This is a sibling to two narrower-scoped extensions by the same author:
- [`image-video-downloader-V1`](https://github.com/Zanny-dotcom/image-video-downloader-V1) — IG/FB only, basic.
- [`image-video-downloader-V2`](https://github.com/Zanny-dotcom/image-video-downloader-V2) — IG/FB only, hardened.

v3 generalizes the scope. v2 remains the right pick if you only need IG/FB.

## What v3 ships (Phase 1 + 2)

- **DOM-based image scanner** covering `<img src>`, `<img srcset>` (largest pick), `<picture><source>`, CSS `background-image`, inline `<svg>` (≥64×64 px serialized to a data URL), and 8 common lazy-load attribute variants (`data-src`, `data-original`, `data-srcset`, etc.).
- **DOM-based video scanner** covering `<video src>` and `<video><source>` for direct MP4/WebM/Ogg sources. `<video src="blob:...">` is intentionally ignored — those need network capture (Phase 3).
- **Embedded-player detection** — iframes from YouTube, Vimeo, Twitch, Dailymotion, TikTok are surfaced in a **Blocked** tab with an explanation, never with a download button. Honest about what we won't do.
- **Side-panel UI** with a Images / Videos / Blocked tabbed grid, multi-select with shift-click range, select-all, per-card thumbnails.
- **Concurrent download pool** (default 6, configurable 1–16), dedup against Chrome's download history, `conflictAction: 'uniquify'` so nothing on disk is overwritten silently.
- **Filename resolver** with layered fallback: alt → caption → URL last segment → page title + index. 4-char hash suffix to disambiguate.
- **Live rescan** on DOM mutation (debounced 750 ms) and on SPA navigation (`pushState` / `replaceState` / `popstate`).
- **Accessibility**: `lang="en"`, `:focus-visible` rings, `aria-live` regions, real `<button>` for every action.
- **Dark mode** via `prefers-color-scheme`.
- **No build step, no production dependencies.** Vanilla JS with `// @ts-check` JSDoc annotations.

## What v3 does NOT do (yet, or by policy)

- **No HLS / DASH / blob: video.** The `<video>` element on streaming sites is fed by `MediaSource` and the real URLs are only visible to the network layer. Phase 3 will add an opt-in network-capture mode behind `chrome.permissions.request('webRequest', '<all_urls>')`.
- **No DRM-protected content.** Widevine / PlayReady / FairPlay video cannot be saved by any extension; we don't pretend.
- **No YouTube / Vimeo / TikTok extraction.** Use `yt-dlp` for those.
- **No audio.** Out of v3 scope.
- **No segment stitching.** When Phase 3 lands, we'll save the `.m3u8` playlist and let you feed it to `ffmpeg`. Optional WASM ffmpeg integration is Phase 5 and not committed.

## Permissions explained

Declared at install:

| Permission | Why |
|---|---|
| `downloads` | The whole point — `chrome.downloads.download()`. |
| `storage` | Save user settings (`subfolder`, `concurrencyLimit`). |
| `activeTab` | When you click the icon or open the side panel, we get temporary access to the current tab to inject the scanner. No persistent host access. |
| `sidePanel` | Open the side-panel UI. |
| `scripting` | Programmatically inject the scanner content script (requires `activeTab`). |

Optional (requested only when Phase 3 deep-scan ships):

| Permission | Why |
|---|---|
| `webRequest` | Tap network responses to see HLS/DASH/streaming media URLs. Off by default; user-toggle. |
| `<all_urls>` host access | Same — required for `webRequest` to observe responses across all tabs. |

## Install (unpacked)

1. Open `chrome://extensions`.
2. Enable **Developer mode** (top-right toggle).
3. Click **Load unpacked**.
4. Select this folder: `/Users/zanny/Desktop/links-v3/`.
5. Pin the extension from the toolbar puzzle-piece menu.

Requires Chrome 116+ (`chrome.sidePanel.open` API).

## Use

1. Browse to any page with images or videos.
2. Click the toolbar icon — the side panel opens and the page is scanned.
3. Pick a tab (Images / Videos / Blocked) and select cards (click anywhere on a card or on the checkbox; shift-click for range; **Select all** for the whole tab).
4. Click **Download selected**. Files land in `~/Downloads/web-downloads/` by default.

Click the **↻** button to rescan after you've scrolled to load more lazy media. Click the **⚙** button for options.

## Options

| Option | Default | Effect |
|---|---|---|
| Subfolder name | `web-downloads` | Where files are saved inside `~/Downloads/`. Sanitized to `[A-Za-z0-9._-]`. |
| Concurrent downloads | `6` | How many files download in parallel. 1–16. |

## File layout

```
links-v3/
├─ manifest.json                Manifest V3, sidePanel, optional perms
├─ icons/                       16/48/128 px
└─ src/
   ├─ shared/
   │  ├─ defaults.js            DEFAULTS (subfolder, concurrencyLimit)
   │  ├─ url.js                 URL helpers
   │  └─ media-item.js          MediaItem JSDoc typedef + djb2 hasher
   ├─ bg/                       ESM service worker
   │  ├─ index.js               Entry — installs router, behavior, lifecycle
   │  ├─ messages.js            chrome.runtime.onMessage router (with sender check)
   │  ├─ url-validate.js        isDownloadableUrl, isPanelOrigin
   │  ├─ filename.js            resolveFilename, sanitizeSubfolder, sanitizeFilename
   │  ├─ tab-state.js           Per-tab state Map + snapshot for panel
   │  └─ download-orchestrator.js  Concurrent pool, dedup, retry, broadcast
   ├─ content/
   │  └─ main.js                Single-file scanner (programmatically injected)
   ├─ sidepanel/
   │  ├─ index.html
   │  ├─ index.css              Tokens + dark mode + grid
   │  ├─ index.js               Top-level wiring + msg listener
   │  ├─ store.js               State + subscribe pattern
   │  └─ render.js              Grid / status / progress / errors render
   └─ options/
      ├─ index.html
      ├─ index.css
      └─ index.js
```

## Test plan

1. **Install** — `chrome://extensions` → Load unpacked → no errors. Service-worker DevTools console clean.
2. **Image-heavy page** — visit a Wikipedia article with several images. Click the toolbar icon. Side panel opens; Images tab shows thumbnails within ~1 s. Counts on each tab match.
3. **Multi-select + download** — select 3 images, click **Download selected** → files appear in `~/Downloads/web-downloads/` with sensible names. Progress counter increments.
4. **Dedup** — click Rescan and try again on the same selection → summary says `0 new (3 already saved)`.
5. **Subfolder change** — Options → set subfolder to `test-downloads` → reload the side panel → files land in the new folder.
6. **Concurrency** — Options → set concurrent downloads to 1 → trigger a 5-image download → progress increments one at a time.
7. **`<picture>` element** — visit a responsive site (e.g. an Apple product page) → confirm Image tab includes the largest source from `<source srcset>` rather than the fallback `<img>`.
8. **CSS background** — visit a gallery site that uses `background-image:` tiles → confirm those URLs appear.
9. **Embedded player** — visit a page with a YouTube `<iframe>` → confirm the Blocked tab shows it with the explanation, no download button.
10. **`<video>`** — visit a page with a direct MP4 (e.g. a documentation site that hosts demo videos) → confirm Videos tab includes it. Visit a streaming site (Twitch, YouTube) → expect Videos tab empty in v3.0 (Phase 3 territory).
11. **Lazy-loading** — visit an image-heavy infinite-scroll page. Scroll to load more, click ↻ Rescan, confirm new items added without losing previous selections.
12. **SPA nav** — on a SPA (e.g. a React app), navigate via in-app links → confirm the side panel re-receives `STATE_UPDATE` after the debounce.
13. **Restricted page** — try `chrome://extensions` itself → side panel should display "Can't scan this page".
14. **Dark mode** — switch system appearance → side panel and options page follow.
15. **Keyboard** — Tab through the side panel. Every interactive element should show a focus ring.

## Roadmap

- **Phase 3** — opt-in `webRequest` deep-scan for HLS / DASH manifest detection, blob:-source resolution.
- **Phase 4** — virtualized grid (currently fine up to a few hundred items), shift-range select, sort/filter chips, "Open in tab" library page.
- **Phase 5** *(maybe)* — lazy-loaded ffmpeg.wasm to stitch HLS segments to MP4 client-side, behind a feature flag.
- **Phase 6** — HEAD-based size pre-flight + total-size warning, retry policy, debug-log toggle.

## License

TBD.
