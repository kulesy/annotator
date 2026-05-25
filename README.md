# @kulesy/annotator

A floating "Annotate" button you drop on any web app. Click an element, leave a comment, and the package files it as a GitHub Issue tagged `annotation` in a repo of your choice. Designed for PO / stakeholder design reviews where comments need to land somewhere actionable, not a Slack thread.

- **Framework-agnostic core** — plain JS, zero deps in the browser
- **React wrapper** — single component, mounts to `document.body`
- **Astro wrapper** — drop-in `.astro` component
- **API handler factory** — Vercel / Cloudflare / Node, your call
- **Self-contained styling** — CSS injected at runtime; CSS variables for branding
- **Two modes** — `local` (localStorage, dev) or `api` (POSTs to your backend → GitHub Issues). Auto-detects via `localhost`

## Install

```bash
npm install @kulesy/annotator
```

## Quick start — React

```tsx
// src/routes/__root.tsx (TanStack Start) or wherever your global layout is
import { Annotator } from '@kulesy/annotator/react';

export default function Root() {
  return (
    <>
      {/* ...your app... */}
      <Annotator
        enabled={import.meta.env.VITE_SHOW_ANNOTATOR === 'true'}
        endpoint="/api/annotations"
        viewIssuesUrl="https://github.com/me/repo/labels/annotation"
        accentColor="#ec407a"
      />
    </>
  );
}
```

## Quick start — Astro

```astro
---
import Annotator from '@kulesy/annotator/astro';
---

<html>
  <body>
    <slot />
    <Annotator
      enabled={import.meta.env.PUBLIC_SHOW_ANNOTATOR === 'true'}
      endpoint="/api/annotations"
      viewIssuesUrl="https://github.com/me/repo/labels/annotation"
      accentColor="#008a52"
    />
  </body>
</html>
```

## Quick start — vanilla

```ts
import { initAnnotator } from '@kulesy/annotator';

const instance = initAnnotator({
  endpoint: '/api/annotations',
  viewIssuesUrl: 'https://github.com/me/repo/labels/annotation',
  accentColor: '#008a52',
});

// To remove later
// instance.destroy();
```

## Backend — the GitHub Issue bridge

The annotator POSTs to `/api/annotations` with `{ url, selector, element, comment }` and expects the server to create a GitHub Issue and respond with `{ id, n, html_url }`. The handler factory does this for you.

### TanStack Start / modern server functions

```ts
// src/routes/api/annotations.ts
import { createFileRoute } from '@tanstack/react-start';
import { createAnnotationHandler } from '@kulesy/annotator/api';

const handler = createAnnotationHandler({
  owner: 'tinacms',
  repo: 'tina-dashboard',
  label: 'annotation',
  githubToken: process.env.GITHUB_TOKEN!,
  authToken: process.env.ANNOTATOR_TOKEN!,
});

export const Route = createFileRoute('/api/annotations')({
  server: {
    handlers: {
      GET: ({ request }) => handler(request),
      POST: ({ request }) => handler(request),
    },
  },
});
```

### Classic Vercel `api/foo.js`

```js
// api/annotations.js
import { createNodeAnnotationHandler } from '@kulesy/annotator/api';

export default createNodeAnnotationHandler({
  owner: 'kulesy',
  repo: 'nhwa-redesign',
  label: 'annotation',
  githubToken: process.env.GITHUB_TOKEN,
  authToken: process.env.ANNOTATOR_TOKEN,
});
```

### Cloudflare Workers

```ts
import { createAnnotationHandler } from '@kulesy/annotator/api';

const handler = createAnnotationHandler({
  owner: 'me',
  repo: 'site',
  githubToken: GITHUB_TOKEN,
  authToken: ANNOTATOR_TOKEN,
});

export default { fetch: handler };
```

## Environment variables

Two secrets, both server-side only:

| Var | What | Required |
|---|---|---|
| `GITHUB_TOKEN` | Fine-grained PAT scoped to **one repo** with `Issues: read & write` | **yes** |
| `ANNOTATOR_TOKEN` | Shared password the UI sends with each POST. The user is prompted once and the value is cached in their browser | **yes** for write |

A third client-side flag is conventional but not enforced:

| Var | What |
|---|---|
| `PUBLIC_SHOW_ANNOTATOR` / `VITE_SHOW_ANNOTATOR` | Master switch for production builds — set true on a private preview deploy, false on the public one |

## All config options

```ts
interface AnnotatorConfig {
  endpoint?: string;              // default '/api/annotations'
  mode?: 'auto' | 'local' | 'api'; // default 'auto' (localhost → local)
  authToken?: string;             // skip the password prompt
  viewIssuesUrl?: string;         // "View on GitHub" toolbar link
  accentColor?: string;           // default '#008a52'
  accentColorDeep?: string;       // default '#00703f'
  toggleBackground?: string;      // default '#1a1a1a'
  label?: string;                 // toggle button text, default 'Annotate'
  scopeSelector?: string;         // restrict targets to inside this CSS selector
  localStorageKey?: string;       // default 'annotator-local'
  tokenStorageKey?: string;       // default 'annotator-token'
  skipCssInjection?: boolean;     // if you import the CSS yourself
  mount?: HTMLElement;            // custom mount node
  onAnnotationCreated?: (a: Annotation) => void;
}
```

## How comments map to GitHub Issues

The handler creates one Issue per annotation:

- **Title**: `[Annotation] /the/page — first 60 chars of comment…`
- **Label**: `annotation` (configurable)
- **Body**: Markdown with `Page:`, `Selector:`, `Element:` (HTML code block), `Comment:`, plus a hidden `<!-- annotation-meta {...} -->` JSON block at the bottom so the GET endpoint can reconstruct the structured payload when listing

This means: in the GitHub Issues UI, comments read naturally as a code-reviewable thread. Resolving an annotation = closing the Issue. Filtering pinged comments per page = the GET endpoint's `?url=/some/path` filter.

## Styling

CSS is injected at runtime — no `import './styles.css'` required. Override the palette via CSS custom properties on `:root` (or anywhere up the cascade from `#anno-root`):

```css
:root {
  --anno-accent: #ec407a;
  --anno-accent-deep: #d81b60;
  --anno-toggle-bg: #1a1a1a;
  --anno-z: 999997; /* base z-index; toolbar/toggle land at +1, editor at +2 */
}
```

If you'd rather pipe the CSS through your own build:

```ts
import { initAnnotator } from '@kulesy/annotator';
import '@kulesy/annotator/styles.css';

initAnnotator({ skipCssInjection: true, /* ...rest */ });
```

## Two modes in detail

**Local mode** (`mode: 'local'`, or auto-detected on `localhost`)
- Comments stored in `localStorage` under `annotator-local`
- "Copy all" exports the buffer as JSON to clipboard
- "Clear" wipes everything
- No backend required — pure client

**API mode** (`mode: 'api'`, or auto-detected on any non-localhost host)
- POSTs to `endpoint` with `X-Annotator-Token` header
- On 401, prompts the user for a password and retries
- Loads existing annotations for the current path on mount
- "View on GitHub" toolbar link opens the issues page

## Releasing

Publishes happen from GitHub Actions via [npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers) — no long-lived `NPM_TOKEN` anywhere. The workflow is at [`.github/workflows/publish.yml`](.github/workflows/publish.yml).

**To cut a release:**

```bash
npm version patch -m "Release v%s"   # 0.1.0 → 0.1.1 (or minor / major)
git push --follow-tags                # triggers the publish workflow
```

The Action verifies the tag matches `package.json`, builds, and runs `npm publish --access public --provenance`. The provenance attestation shows up as a green badge on the package page on npmjs.com — consumers can verify the tarball was built from this exact repo + commit.

**One-time setup** (already done — record only):

1. Generate a Classic Automation token, do the first publish (`v0.1.0`) manually with it
2. On npmjs.com → package settings → **Publishing access** → **Add Trusted Publisher**:
   - Repository owner: `kulesy`
   - Repository name: `annotator`
   - Workflow filename: `publish.yml`
   - Environment: *(leave blank)*
3. Revoke the Automation token
4. All future tag-push publishes go through OIDC

## License

MIT
