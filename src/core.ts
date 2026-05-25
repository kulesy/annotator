/**
 * @kulesy/annotator — core (framework-agnostic).
 *
 * Mounts a floating "Annotate" button on the page. When toggled on, the user
 * can click any element to leave a comment. Comments are stored either:
 *
 *   • locally (localStorage) — for dev workflows: "Copy all" exports JSON
 *   • via your backend (POST `/api/annotations`) — creates a GitHub Issue
 *
 * Mode auto-detects on localhost (= local) vs everywhere else (= api), or
 * can be forced via the `mode` config.
 *
 * Usage (vanilla):
 *
 *   import { initAnnotator } from '@kulesy/annotator';
 *   initAnnotator({
 *     endpoint: '/api/annotations',
 *     viewIssuesUrl: 'https://github.com/me/repo/labels/annotation',
 *     accentColor: '#ec407a',
 *   });
 *
 * For React / Astro wrappers, see `@kulesy/annotator/react` and
 * `@kulesy/annotator/astro`.
 */

import { ANNOTATOR_CSS } from './styles.js';

// ────────────────────────────────────────────────────────────────────
// Public types
// ────────────────────────────────────────────────────────────────────

export interface AnnotatorConfig {
  /** Backend endpoint that handles GET (list) and POST (create). Default: `/api/annotations` */
  endpoint?: string;
  /** Force mode. Default: `'auto'` (localhost → `'local'`, else `'api'`) */
  mode?: 'auto' | 'local' | 'api';
  /** Pre-set auth token. If absent and required, the UI prompts the user once and caches it. */
  authToken?: string;
  /** External "View on GitHub" link in the toolbar (only shown in api mode). */
  viewIssuesUrl?: string;
  /** Primary brand colour. Default `#008a52` */
  accentColor?: string;
  /** Hover/active shade of the primary. Default derived from accent. */
  accentColorDeep?: string;
  /** Toggle button background. Default `#1a1a1a` */
  toggleBackground?: string;
  /** Toggle button label text. Default `'Annotate'` */
  label?: string;
  /** Restrict annotation targets to elements inside this CSS selector. Default: whole page. */
  scopeSelector?: string;
  /** localStorage key for cached comments (local mode). Default: `'annotator-local'` */
  localStorageKey?: string;
  /** localStorage key for the cached auth token. Default: `'annotator-token'` */
  tokenStorageKey?: string;
  /** Skip injecting CSS at runtime (if you imported `@kulesy/annotator/styles.css` yourself). */
  skipCssInjection?: boolean;
  /** Mount element. Defaults to a freshly-created div appended to `document.body`. */
  mount?: HTMLElement;
  /** Optional hook fired after a successful POST. */
  onAnnotationCreated?: (annotation: Annotation) => void;
}

export interface Annotation {
  id: string | number;
  /** Issue number from GitHub (api mode) */
  n?: number;
  /** Page URL the annotation belongs to */
  url: string;
  /** CSS selector targeting the annotated element */
  selector: string;
  /** Short HTML preview of the targeted element */
  element?: string;
  /** Author's comment text */
  comment?: string;
  /** Alias for `comment` (local mode) */
  text?: string;
  /** Link to the GitHub Issue (api mode) */
  html_url?: string;
  /** Element snippet (tag/classes/text preview) */
  snippet?: ElementSnippet;
  /** Internal: marks freshly created annotations for the pulse animation */
  _isNew?: boolean;
  /** Internal: marks pending (not-yet-saved) annotations */
  _isPending?: boolean;
}

export interface ElementSnippet {
  tag: string;
  classes: string;
  text: string;
}

export interface AnnotatorInstance {
  /** Removes all UI + listeners. Safe to call after mount. */
  destroy(): void;
  /** Forces a re-fetch + re-render from the backend (api mode) or storage. */
  refresh(): Promise<void>;
}

// ────────────────────────────────────────────────────────────────────
// Markup
// ────────────────────────────────────────────────────────────────────

const ROOT_HTML = `
<button id="anno-toggle" type="button" aria-label="Toggle annotation mode">
  <span class="anno-toggle-icon" aria-hidden="true">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  </span>
  <span class="anno-toggle-label"></span>
  <span class="anno-toggle-count" aria-live="polite"></span>
</button>

<div id="anno-toolbar" hidden>
  <span class="anno-toolbar-status">Comment mode on. Click any element.</span>
  <span class="anno-toolbar-meta"><span id="anno-meta-count">0</span> comments</span>
  <button type="button" class="anno-btn" id="anno-copy" data-mode-local>Copy all</button>
  <button type="button" class="anno-btn" id="anno-clear" data-mode-local>Clear</button>
  <a href="#" class="anno-btn" id="anno-view" target="_blank" rel="noopener" data-mode-api hidden>View on GitHub</a>
  <button type="button" class="anno-btn anno-btn--primary" id="anno-done">Done</button>
</div>

<div id="anno-pins"></div>
`;

// ────────────────────────────────────────────────────────────────────
// Implementation
// ────────────────────────────────────────────────────────────────────

const STYLE_TAG_ID = 'anno-injected-styles';
const DEFAULT_STORAGE_KEY = 'annotator-local';
const DEFAULT_TOKEN_KEY = 'annotator-token';
const DEFAULT_ENDPOINT = '/api/annotations';

function injectStylesOnce() {
  if (document.getElementById(STYLE_TAG_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_TAG_ID;
  style.textContent = ANNOTATOR_CSS;
  document.head.appendChild(style);
}

function applyBrandOverrides(root: HTMLElement, config: AnnotatorConfig) {
  if (config.accentColor) root.style.setProperty('--anno-accent', config.accentColor);
  if (config.accentColorDeep) root.style.setProperty('--anno-accent-deep', config.accentColorDeep);
  if (config.toggleBackground) root.style.setProperty('--anno-toggle-bg', config.toggleBackground);
}

function detectMode(forced?: AnnotatorConfig['mode']): 'local' | 'api' {
  if (forced && forced !== 'auto') return forced;
  const host = typeof location !== 'undefined' ? location.hostname : '';
  return host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' ? 'local' : 'api';
}

function uid() {
  return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function escapeHtml(s: string) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  } as Record<string, string>)[c]!);
}

// ────────────────────────────────────────────────────────────────────
// initAnnotator — the only public entry
// ────────────────────────────────────────────────────────────────────

export function initAnnotator(config: AnnotatorConfig = {}): AnnotatorInstance {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return { destroy() {}, async refresh() {} };
  }

  if (!config.skipCssInjection) injectStylesOnce();

  // Build root container
  const root = config.mount ?? document.createElement('div');
  root.id = 'anno-root';
  root.dataset.annoVersion = '2';
  root.innerHTML = ROOT_HTML;
  applyBrandOverrides(root, config);

  // Set label
  const labelEl = root.querySelector<HTMLElement>('.anno-toggle-label');
  if (labelEl) labelEl.textContent = config.label ?? 'Annotate';

  if (!config.mount) document.body.appendChild(root);

  // Local refs
  const toggle = root.querySelector<HTMLButtonElement>('#anno-toggle')!;
  const toolbar = root.querySelector<HTMLElement>('#anno-toolbar')!;
  const pinsLayer = root.querySelector<HTMLElement>('#anno-pins')!;
  const toggleCount = toggle.querySelector<HTMLElement>('.anno-toggle-count')!;
  const metaCount = root.querySelector<HTMLElement>('#anno-meta-count')!;
  const copyBtn = root.querySelector<HTMLButtonElement>('#anno-copy')!;
  const clearBtn = root.querySelector<HTMLButtonElement>('#anno-clear')!;
  const doneBtn = root.querySelector<HTMLButtonElement>('#anno-done')!;
  const viewBtn = root.querySelector<HTMLAnchorElement>('#anno-view')!;

  // Config-with-defaults
  const MODE = detectMode(config.mode);
  const ENDPOINT = config.endpoint ?? DEFAULT_ENDPOINT;
  const STORAGE_KEY = config.localStorageKey ?? DEFAULT_STORAGE_KEY;
  const TOKEN_KEY = config.tokenStorageKey ?? DEFAULT_TOKEN_KEY;

  // Hide mode-irrelevant toolbar buttons
  root.querySelectorAll<HTMLElement>('[data-mode-local]').forEach(el => { if (MODE !== 'local') el.hidden = true; });
  root.querySelectorAll<HTMLElement>('[data-mode-api]').forEach(el => { if (MODE !== 'api') el.hidden = true; });
  if (MODE === 'api' && config.viewIssuesUrl) {
    viewBtn.href = config.viewIssuesUrl;
  } else if (MODE === 'api') {
    viewBtn.hidden = true;
  }

  // Seed an externally-supplied token (skips the password prompt)
  if (config.authToken && MODE === 'api') {
    localStorage.setItem(TOKEN_KEY, config.authToken);
  }

  // ── State
  let annotations: Annotation[] = [];
  let mode = false;
  let openEditor: HTMLElement | null = null;
  let hoverEl: HTMLElement | null = null;
  let destroyed = false;

  function isAnnoUI(el: Element) {
    return !!el.closest('#anno-root, .anno-pin, .anno-editor');
  }

  function isInScope(el: Element): boolean {
    if (!config.scopeSelector) return true;
    return !!el.closest(config.scopeSelector);
  }

  function getSelectorFor(el: Element): string {
    if (el.id) return '#' + CSS.escape(el.id);
    const parts: string[] = [];
    let cur: Element | null = el;
    while (cur && cur.nodeType === 1 && cur.tagName !== 'BODY') {
      let part = cur.tagName.toLowerCase();
      const cls =
        cur.className && typeof cur.className === 'string'
          ? cur.className.trim().split(/\s+/).filter(c => c && !c.startsWith('anno-')).slice(0, 2)
          : [];
      if (cls.length) part += '.' + cls.map(c => CSS.escape(c)).join('.');
      if (cur.parentElement) {
        const siblings = Array.from(cur.parentElement.children).filter(
          s => s.tagName === cur!.tagName && (cls.length === 0 || cls.every(c => s.classList.contains(c)))
        );
        if (siblings.length > 1) {
          const idx = siblings.indexOf(cur) + 1;
          part += `:nth-of-type(${idx})`;
        }
      }
      parts.unshift(part);
      cur = cur.parentElement;
      if (parts.length >= 5) break;
    }
    return parts.join(' > ');
  }

  function getElementSnippet(el: Element): ElementSnippet {
    const text = (el.textContent || '').trim().slice(0, 80);
    return {
      tag: el.tagName.toLowerCase(),
      classes:
        el.className && typeof el.className === 'string'
          ? el.className.trim().split(/\s+/).filter(c => c && !c.startsWith('anno-')).join(' ')
          : '',
      text: text + ((el.textContent || '').length > 80 ? '…' : ''),
    };
  }

  function renderSnippet(snippet: ElementSnippet) {
    const cls = snippet.classes ? ' class="' + snippet.classes + '"' : '';
    return '<' + snippet.tag + cls + '>' + (snippet.text || '');
  }

  // ── Storage adapters
  async function load(): Promise<Annotation[]> {
    if (MODE === 'local') {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter((a: Annotation) => a && a.id) : [];
      } catch {
        return [];
      }
    }
    try {
      const res = await fetch(`${ENDPOINT}?url=${encodeURIComponent(location.pathname)}`);
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data.annotations) ? data.annotations : [];
    } catch {
      return [];
    }
  }

  function saveLocal() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(annotations));
    } catch {}
  }

  function getToken() { return localStorage.getItem(TOKEN_KEY) || ''; }
  function setToken(t: string) { localStorage.setItem(TOKEN_KEY, t); }
  function clearToken() { localStorage.removeItem(TOKEN_KEY); }

  async function postAnnotation(payload: { url: string; selector: string; element: string; comment: string }) {
    const token = getToken();
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Annotator-Token': token,
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401) clearToken();
      return { ok: false, status: res.status, error: data.error || ('HTTP ' + res.status) };
    }
    return { ok: true, ...data };
  }

  // ── Pin rendering
  function render() {
    pinsLayer.innerHTML = '';
    annotations.forEach((anno, i) => {
      const el = document.querySelector(anno.selector);
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const x = rect.left + window.scrollX;
      const y = rect.top + window.scrollY;
      const pin = document.createElement('div');
      pin.className = 'anno-pin';
      pin.dataset.annoId = String(anno.id);
      pin.textContent = MODE === 'api' && anno.n ? String(anno.n) : String(i + 1);
      pin.style.left = x - 13 + 'px';
      pin.style.top = y - 13 + 'px';
      pin.title = anno.comment || anno.text || '';
      if (anno._isNew) {
        pin.dataset.pinNew = 'true';
        setTimeout(() => {
          delete pin.dataset.pinNew;
          delete anno._isNew;
        }, 3000);
      }
      pin.addEventListener('click', e => {
        e.stopPropagation();
        openEditorFor(anno, el);
      });
      pinsLayer.appendChild(pin);
    });
    toggleCount.textContent = annotations.length ? String(annotations.length) : '';
    if (metaCount) metaCount.textContent = String(annotations.length);
  }

  // ── Editor
  function openEditorFor(anno: Annotation, el: Element) {
    closeEditor();
    const pin = pinsLayer.querySelector<HTMLElement>(`[data-anno-id="${anno.id}"]`);
    if (pin) pin.dataset.pinOpen = 'true';

    const editor = document.createElement('div');
    editor.className = 'anno-editor';
    editor.dataset.editorId = String(anno.id);
    const snippet = anno.snippet || getElementSnippet(el);

    // Read-only existing api annotation
    if (MODE === 'api' && anno.html_url) {
      editor.innerHTML = `
        <div class="anno-editor-meta"><strong>${escapeHtml(snippet.tag)}${snippet.classes ? '.' + escapeHtml(snippet.classes.split(' ').join('.')) : ''}</strong>${snippet.text ? '<br/>' + escapeHtml(snippet.text) : ''}</div>
        <div class="anno-comment">${escapeHtml(anno.comment || '').replace(/\n/g, '<br/>')}</div>
        <a class="anno-editor-link" href="${anno.html_url}" target="_blank" rel="noopener">View on GitHub →</a>
        <div class="anno-editor-actions">
          <button type="button" class="anno-editor-cancel">Close</button>
        </div>
      `;
      pinsLayer.appendChild(editor);
      editor.querySelector<HTMLButtonElement>('.anno-editor-cancel')!.addEventListener('click', closeEditor);
      openEditor = editor;
      return;
    }

    // Compose new (api or local)
    const needsToken = MODE === 'api' && !getToken();
    editor.innerHTML = `
      <div class="anno-editor-meta"><strong>${escapeHtml(snippet.tag)}${snippet.classes ? '.' + escapeHtml(snippet.classes.split(' ').join('.')) : ''}</strong>${snippet.text ? '<br/>' + escapeHtml(snippet.text) : ''}</div>
      ${needsToken ? `
        <div class="anno-editor-token">
          <label class="anno-editor-token-label" for="anno-tok">Password (one-time, stored in this browser)</label>
          <input type="password" id="anno-tok" autocomplete="current-password" />
        </div>` : ''}
      <textarea placeholder="What needs to change about this element?"></textarea>
      <div class="anno-editor-actions">
        ${MODE === 'local' ? '<button type="button" class="anno-editor-delete">Delete</button>' : ''}
        <button type="button" class="anno-editor-cancel">Cancel</button>
        <button type="button" class="anno-editor-save">${MODE === 'api' ? 'Post comment' : 'Save'}</button>
      </div>
      <div class="anno-editor-status" data-state=""></div>
    `;
    pinsLayer.appendChild(editor);
    const ta = editor.querySelector<HTMLTextAreaElement>('textarea')!;
    const tokenInput = editor.querySelector<HTMLInputElement>('#anno-tok');
    const statusEl = editor.querySelector<HTMLElement>('.anno-editor-status')!;
    ta.value = anno.text || anno.comment || '';
    (tokenInput || ta).focus();
    if (!tokenInput) ta.select();

    const saveBtn = editor.querySelector<HTMLButtonElement>('.anno-editor-save')!;
    saveBtn.addEventListener('click', async () => {
      const text = ta.value.trim();
      if (!text) {
        statusEl.textContent = 'Comment is empty.';
        statusEl.dataset.state = 'error';
        return;
      }
      if (tokenInput) {
        const t = tokenInput.value.trim();
        if (!t) {
          statusEl.textContent = 'Password required.';
          statusEl.dataset.state = 'error';
          tokenInput.focus();
          return;
        }
        setToken(t);
      }

      if (MODE === 'local') {
        anno.text = text;
        anno.snippet = snippet;
        saveLocal();
        render();
        closeEditor();
        return;
      }

      saveBtn.disabled = true;
      statusEl.textContent = 'Posting…';
      statusEl.dataset.state = '';
      const result = await postAnnotation({
        url: anno.url || location.pathname,
        selector: anno.selector,
        element: renderSnippet(snippet),
        comment: text,
      });
      if (!result.ok) {
        saveBtn.disabled = false;
        statusEl.textContent = result.status === 401 ? 'Wrong password. Try again.' : 'Failed: ' + result.error;
        statusEl.dataset.state = 'error';
        return;
      }
      annotations = annotations.filter(a => a.id !== anno.id);
      const created: Annotation = {
        id: result.id,
        n: result.n,
        url: anno.url || location.pathname,
        selector: anno.selector,
        comment: text,
        html_url: result.html_url,
        snippet,
        _isNew: true,
      };
      annotations.unshift(created);
      render();
      statusEl.textContent = '✓ Saved as Issue #' + result.n;
      statusEl.dataset.state = 'ok';
      setTimeout(closeEditor, 900);
      try { config.onAnnotationCreated?.(created); } catch {}
    });

    editor.querySelector<HTMLButtonElement>('.anno-editor-cancel')!.addEventListener('click', () => {
      if (anno._isPending) {
        annotations = annotations.filter(a => a.id !== anno.id);
        render();
      }
      closeEditor();
    });

    const deleteBtn = editor.querySelector<HTMLButtonElement>('.anno-editor-delete');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => {
        annotations = annotations.filter(a => a.id !== anno.id);
        saveLocal();
        render();
        closeEditor();
      });
    }

    ta.addEventListener('keydown', e => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        saveBtn.click();
      }
      if (e.key === 'Escape') closeEditor();
    });
    openEditor = editor;
  }

  function closeEditor() {
    if (!openEditor) return;
    const id = openEditor.dataset.editorId;
    const pin = pinsLayer.querySelector<HTMLElement>(`[data-anno-id="${id}"]`);
    if (pin) delete pin.dataset.pinOpen;
    openEditor.remove();
    openEditor = null;
  }

  // ── Comment mode
  function setHover(el: Element | null) {
    if (hoverEl) delete hoverEl.dataset.annoHover;
    hoverEl = el as HTMLElement | null;
    if (hoverEl) hoverEl.dataset.annoHover = 'true';
  }

  function onMouseMove(e: MouseEvent) {
    if (!mode) return;
    const el = e.target as Element;
    if (!el || isAnnoUI(el) || !isInScope(el)) {
      setHover(null);
      return;
    }
    setHover(el);
  }

  function onClick(e: MouseEvent) {
    if (!mode) return;
    const el = e.target as Element;
    if (!el || isAnnoUI(el) || !isInScope(el)) return;
    e.preventDefault();
    e.stopPropagation();
    const selector = getSelectorFor(el);
    const snippet = getElementSnippet(el);
    const existing = annotations.find(a => a.selector === selector && a.url === location.pathname);
    if (existing) {
      openEditorFor(existing, el);
      return;
    }
    const anno: Annotation = {
      id: uid(),
      selector,
      snippet,
      text: '',
      url: location.pathname,
      _isPending: true,
    };
    annotations.push(anno);
    render();
    openEditorFor(anno, el);
  }

  function setMode(on: boolean) {
    mode = on;
    document.documentElement.dataset.annoMode = on ? 'on' : 'off';
    toggle.dataset.active = on ? 'true' : 'false';
    toolbar.hidden = !on;
    if (!on) setHover(null);
  }

  toggle.addEventListener('click', () => setMode(!mode));
  doneBtn.addEventListener('click', () => setMode(false));

  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      const payload = annotations.map((a, i) => ({
        n: i + 1,
        url: a.url,
        selector: a.selector,
        element: a.snippet ? renderSnippet(a.snippet) : a.element || '',
        comment: a.text || a.comment,
      }));
      const text = JSON.stringify(payload, null, 2);
      try {
        await navigator.clipboard.writeText(text);
        copyBtn.textContent = 'Copied!';
      } catch {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
        copyBtn.textContent = 'Copied!';
      }
      setTimeout(() => {
        copyBtn.textContent = 'Copy all';
      }, 1500);
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (annotations.length === 0) return;
      if (!confirm('Clear all ' + annotations.length + ' annotations?')) return;
      annotations = [];
      saveLocal();
      closeEditor();
      render();
    });
  }

  // Reposition pins on scroll/resize
  let rafToken: number | null = null;
  function scheduleRender() {
    if (rafToken !== null) return;
    rafToken = requestAnimationFrame(() => {
      rafToken = null;
      render();
    });
  }
  window.addEventListener('scroll', scheduleRender, { passive: true });
  window.addEventListener('resize', scheduleRender);

  function onDocMouseDown(e: MouseEvent) {
    if (openEditor && !openEditor.contains(e.target as Node) && !(e.target as Element).classList?.contains('anno-pin')) {
      closeEditor();
    }
  }
  document.addEventListener('mousedown', onDocMouseDown, true);
  document.addEventListener('mousemove', onMouseMove, true);
  document.addEventListener('click', onClick, true);

  // ── Init data load
  async function refresh() {
    annotations = await load();
    requestAnimationFrame(() => requestAnimationFrame(render));
  }
  refresh();

  // ── Destroy
  return {
    refresh,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      window.removeEventListener('scroll', scheduleRender);
      window.removeEventListener('resize', scheduleRender);
      document.removeEventListener('mousedown', onDocMouseDown, true);
      document.removeEventListener('mousemove', onMouseMove, true);
      document.removeEventListener('click', onClick, true);
      delete document.documentElement.dataset.annoMode;
      closeEditor();
      if (!config.mount && root.parentElement) root.parentElement.removeChild(root);
    },
  };
}
