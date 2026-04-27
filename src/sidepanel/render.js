// @ts-check
import { getState } from './store.js';

const grid = /** @type {HTMLElement} */ (document.getElementById('grid'));
const status = /** @type {HTMLElement} */ (document.getElementById('status'));
const progressEl = /** @type {HTMLElement} */ (document.getElementById('progress'));
const errorsEl = /** @type {HTMLElement} */ (document.getElementById('errors'));
const countImages = /** @type {HTMLElement} */ (document.getElementById('count-images'));
const countVideos = /** @type {HTMLElement} */ (document.getElementById('count-videos'));
const countBlocked = /** @type {HTMLElement} */ (document.getElementById('count-blocked'));
const downloadBtn = /** @type {HTMLButtonElement} */ (document.getElementById('download-btn'));
const selectSummary = /** @type {HTMLElement} */ (document.getElementById('select-summary'));

export function render() {
  const s = getState();
  const byKind = {
    images: s.items.filter((it) => it.kind === 'image'),
    videos: s.items.filter((it) => it.kind === 'video'),
    blocked: s.items.filter((it) => it.blocked || it.kind === 'embedded' || it.kind === 'drm'),
  };
  countImages.textContent = String(byKind.images.length);
  countVideos.textContent = String(byKind.videos.length);
  countBlocked.textContent = String(byKind.blocked.length);

  const list = byKind[s.activeTab] || [];
  renderGrid(list, s);
  renderStatus(s);
  renderProgress(s);
  renderErrors(s);
  updateSelectionSummary();
}

function renderGrid(list, s) {
  // Preserve checked state across re-renders
  const previouslyChecked = new Set(
    Array.from(grid.querySelectorAll('input[type="checkbox"]:checked')).map(
      (ck) => /** @type {HTMLInputElement} */ (ck).value
    )
  );
  grid.replaceChildren();
  if (list.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent =
      'Nothing here yet — try ↻ Rescan after the page settles, or scroll to load more lazy media.';
    grid.appendChild(empty);
    return;
  }
  for (const item of list) {
    const card = createCard(item, s);
    if (previouslyChecked.has(item.id)) {
      const ck = card.querySelector('.card-check');
      if (ck) /** @type {HTMLInputElement} */ (ck).checked = true;
    }
    grid.appendChild(card);
  }
}

function createCard(item, s) {
  const card = document.createElement('div');
  card.className = 'card';
  card.dataset.id = item.id;
  if (s.downloadingIds.has(item.id)) card.classList.add('downloading');
  if (s.doneIds.has(item.id)) card.classList.add('done');

  if (item.blocked || item.kind === 'embedded' || item.kind === 'drm') {
    card.classList.add('blocked');
    const label = document.createElement('div');
    label.className = 'blocked-label';
    label.textContent = item.blocked?.detail || item.kind;
    card.appendChild(label);
    const detail = document.createElement('div');
    detail.className = 'blocked-detail';
    detail.textContent =
      item.blocked?.reason === 'embedded-player'
        ? 'Embedded player — not supported'
        : item.blocked?.reason === 'drm'
        ? 'DRM-protected — not supported'
        : 'Out of scope';
    card.appendChild(detail);
    return card;
  }

  const ck = document.createElement('input');
  ck.type = 'checkbox';
  ck.value = item.id;
  ck.className = 'card-check';
  ck.setAttribute('aria-label', 'Select');
  card.appendChild(ck);

  if (item.kind === 'image') {
    const thumb = document.createElement('img');
    thumb.loading = 'lazy';
    thumb.src = item.thumbnailUrl || item.url;
    thumb.alt = item.alt || '';
    thumb.className = 'thumb';
    thumb.addEventListener('error', () => thumb.classList.add('broken'));
    card.appendChild(thumb);
  } else if (item.kind === 'video') {
    if (item.thumbnailUrl) {
      const thumb = document.createElement('img');
      thumb.loading = 'lazy';
      thumb.src = item.thumbnailUrl;
      thumb.className = 'thumb';
      thumb.addEventListener('error', () => thumb.classList.add('broken'));
      card.appendChild(thumb);
    } else {
      const ph = document.createElement('div');
      ph.className = 'video-placeholder';
      ph.textContent = '▶';
      card.appendChild(ph);
    }
    const badge = document.createElement('span');
    badge.className = 'kind-badge';
    badge.textContent = (item.ext || 'video').toUpperCase();
    card.appendChild(badge);
  }

  const meta = document.createElement('div');
  meta.className = 'meta';
  const ext = (item.ext || '').toUpperCase();
  meta.textContent = `${ext}${
    item.width && item.height ? ` · ${item.width}×${item.height}` : ''
  }`;
  card.appendChild(meta);

  card.addEventListener('click', (e) => {
    if (e.target === ck) return;
    ck.checked = !ck.checked;
    ck.dispatchEvent(new Event('change', { bubbles: true }));
  });

  return card;
}

function renderStatus(s) {
  if (s.summary) {
    const { found, new: newCount, alreadySaved } = s.summary;
    status.textContent = `Selected ${found}, downloading ${newCount} new (${alreadySaved} already saved).`;
  } else {
    status.textContent = '';
  }
}

function renderProgress(s) {
  if (s.summary && s.summary.new > 0) {
    progressEl.classList.remove('hidden');
    progressEl.textContent = `Downloaded ${s.completed} / ${s.summary.new}`;
  } else {
    progressEl.classList.add('hidden');
  }
}

function renderErrors(s) {
  errorsEl.replaceChildren();
  if (!s.errors || s.errors.length === 0) {
    errorsEl.classList.add('hidden');
    return;
  }
  errorsEl.classList.remove('hidden');
  const heading = document.createElement('strong');
  heading.textContent = `Errors (${s.errors.length}):`;
  errorsEl.appendChild(heading);
  const list = document.createElement('ul');
  for (const e of s.errors) {
    const li = document.createElement('li');
    li.textContent = e.reason;
    list.appendChild(li);
  }
  errorsEl.appendChild(list);
}

export function updateSelectionSummary() {
  const total = grid.querySelectorAll('input[type="checkbox"]').length;
  const selected = grid.querySelectorAll('input[type="checkbox"]:checked').length;
  selectSummary.textContent = `${selected} of ${total} selected`;
  downloadBtn.disabled = selected === 0;
}
