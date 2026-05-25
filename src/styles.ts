// Inlined version of styles.css for runtime injection. The CSS file is also
// shipped (and exported as './styles.css') for consumers who'd rather pipe it
// through their own build, but by default core.ts injects this string into a
// <style data-anno-styles> tag on first init so the package "just works"
// without any CSS import on the consumer side.
//
// Keep this in sync with src/styles.css. The build step does not regenerate
// this string — edit both files together.

export const ANNOTATOR_CSS = `
:root {
  --anno-accent: #008a52;
  --anno-accent-deep: #00703f;
  --anno-toggle-bg: #1a1a1a;
  --anno-z: 999997;
}

#anno-toggle {
  position: fixed; right: 20px; bottom: 20px;
  z-index: calc(var(--anno-z) + 1);
  display: inline-flex; align-items: center; gap: 8px;
  padding: 10px 16px;
  background: var(--anno-toggle-bg); color: #fff;
  border: 0; border-radius: 999px;
  font: 600 13px/1 system-ui, -apple-system, sans-serif;
  letter-spacing: 0.02em;
  box-shadow: 0 4px 12px rgba(0,0,0,.18), 0 8px 24px rgba(0,0,0,.12);
  cursor: pointer;
  transition: transform 160ms ease, background 160ms ease;
}
#anno-toggle:hover { transform: translateY(-1px); background: var(--anno-accent); }
#anno-toggle[data-active="true"] { background: var(--anno-accent); }
.anno-toggle-icon { display: inline-flex; }
.anno-toggle-count {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 18px; height: 18px; padding: 0 6px;
  background: rgba(255,255,255,.2); border-radius: 999px;
  font-size: 11px; font-weight: 700;
}
.anno-toggle-count:empty { display: none; }

#anno-toolbar[hidden] { display: none !important; }
#anno-toolbar {
  position: fixed; left: 50%; bottom: 20px; transform: translateX(-50%);
  z-index: calc(var(--anno-z) + 1);
  display: inline-flex; align-items: center; gap: 14px;
  padding: 10px 14px 10px 18px;
  background: var(--anno-toggle-bg); color: #fff;
  border-radius: 999px;
  font: 500 13px/1 system-ui, -apple-system, sans-serif;
  box-shadow: 0 8px 28px rgba(0,0,0,.24);
}
.anno-toolbar-status { opacity: .85; }
.anno-toolbar-meta {
  padding-left: 14px;
  border-left: 1px solid rgba(255,255,255,.15);
  font-weight: 600; opacity: .9;
}
.anno-btn {
  background: transparent; color: #fff;
  border: 1px solid rgba(255,255,255,.25);
  padding: 6px 12px; border-radius: 999px;
  font: inherit; cursor: pointer; text-decoration: none;
  transition: background 160ms ease, border-color 160ms ease;
}
.anno-btn:hover { background: rgba(255,255,255,.1); border-color: rgba(255,255,255,.45); }
.anno-btn--primary { background: var(--anno-accent); border-color: var(--anno-accent); }
.anno-btn--primary:hover { background: var(--anno-accent-deep); border-color: var(--anno-accent-deep); }
.anno-btn[hidden] { display: none !important; }

html[data-anno-mode="on"] body { cursor: crosshair !important; }
html[data-anno-mode="on"] *[data-anno-hover] {
  outline: 2px dashed var(--anno-accent) !important;
  outline-offset: 2px !important;
}

.anno-pin {
  position: absolute; z-index: var(--anno-z);
  width: 26px; height: 26px;
  background: var(--anno-accent); color: #fff;
  border-radius: 50%;
  display: inline-flex; align-items: center; justify-content: center;
  font: 700 12px/1 system-ui, -apple-system, sans-serif;
  cursor: pointer;
  box-shadow: 0 2px 6px rgba(0,0,0,.25), 0 0 0 3px rgba(255,255,255,.9);
  transition: transform 160ms ease;
}
.anno-pin:hover { transform: scale(1.1); }
.anno-pin[data-pin-open="true"] { background: var(--anno-accent-deep); }
.anno-pin[data-pin-new="true"] {
  background: #c89000;
  animation: anno-pulse 1.4s ease-out 2;
}
@keyframes anno-pulse {
  0%   { box-shadow: 0 0 0 0 rgba(200,144,0,.55), 0 0 0 3px rgba(255,255,255,.9); }
  100% { box-shadow: 0 0 0 12px rgba(200,144,0,0), 0 0 0 3px rgba(255,255,255,.9); }
}

.anno-editor {
  position: fixed; right: 20px; bottom: 72px;
  z-index: calc(var(--anno-z) + 2);
  width: 340px;
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0,0,0,.18), 0 16px 48px rgba(0,0,0,.12);
  border: 1px solid rgba(0,0,0,.08);
  padding: 14px;
  font: 13px/1.4 system-ui, -apple-system, sans-serif;
  color: #1a1a1a;
}
html[data-anno-mode="on"] .anno-editor { bottom: 120px; }
.anno-editor textarea, .anno-editor input[type="password"] {
  width: 100%; padding: 8px 10px;
  border: 1px solid rgba(0,0,0,.15); border-radius: 6px;
  font: inherit; box-sizing: border-box;
}
.anno-editor textarea { min-height: 80px; resize: vertical; }
.anno-editor textarea:focus, .anno-editor input[type="password"]:focus {
  outline: none; border-color: var(--anno-accent);
  box-shadow: 0 0 0 3px color-mix(in oklch, var(--anno-accent) 16%, transparent);
}
.anno-editor-meta {
  margin: 0 0 8px;
  font-size: 11px; color: #6a7680;
  word-break: break-all; line-height: 1.45;
}
.anno-editor-meta strong { color: #1a1a1a; }
.anno-editor-token { margin-bottom: 8px; }
.anno-editor-token-label {
  display: block; font-size: 11px; color: #6a7680; margin-bottom: 4px;
}
.anno-editor-actions {
  display: flex; gap: 8px; margin-top: 10px;
  justify-content: flex-end; align-items: center;
}
.anno-editor-actions button, .anno-editor-actions a {
  padding: 6px 12px; border-radius: 6px;
  font: 600 12px/1 system-ui, sans-serif;
  cursor: pointer;
  border: 1px solid rgba(0,0,0,.12);
  background: #fff; color: #1a1a1a;
  text-decoration: none;
  transition: background 160ms ease;
}
.anno-editor-actions button:hover, .anno-editor-actions a:hover { background: #f4f6f8; }
.anno-editor-actions .anno-editor-save {
  background: var(--anno-accent); color: #fff; border-color: var(--anno-accent);
}
.anno-editor-actions .anno-editor-save:hover { background: var(--anno-accent-deep); }
.anno-editor-actions .anno-editor-save:disabled { opacity: .5; cursor: wait; }
.anno-editor-actions .anno-editor-delete { color: #b00020; margin-right: auto; }
.anno-editor-status {
  font-size: 11px; color: #6a7680;
  margin-top: 8px; min-height: 14px;
}
.anno-editor-status[data-state="error"] { color: #b00020; }
.anno-editor-status[data-state="ok"]    { color: var(--anno-accent); }
.anno-editor-link {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 11px; margin-top: 6px;
  color: var(--anno-accent); text-decoration: none;
}
.anno-editor-link:hover { text-decoration: underline; }

#anno-toggle, #anno-toolbar, .anno-pin, .anno-editor, .anno-editor * {
  outline: 0 !important;
}
`;
