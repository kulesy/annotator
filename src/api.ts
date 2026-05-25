/**
 * API handler factory — backs the annotator's POST/GET endpoint by creating
 * and listing GitHub Issues labelled `annotation`.
 *
 * Two flavours are exported because hosts differ:
 *   • createAnnotationHandler         — Web standard (Request → Response).
 *                                       Works in Vercel Edge, Cloudflare
 *                                       Workers, Deno, modern TanStack Start
 *                                       server functions.
 *   • createNodeAnnotationHandler     — Node-style (req, res). Use for the
 *                                       classic Vercel `api/foo.js` convention.
 *
 * Both share the same config:
 *
 *   {
 *     owner: 'kulesy',
 *     repo: 'nhwa-redesign',
 *     label: 'annotation',                // default
 *     githubToken: process.env.GITHUB_TOKEN!,
 *     authToken:   process.env.ANNOTATOR_TOKEN!,
 *     cacheMaxAgeSeconds: 10,             // default
 *   }
 *
 * Auth: POST requires header `X-Annotator-Token` matching `authToken`. If
 * `authToken` is not set, POSTs are rejected (500). GET is unauthenticated.
 */

export interface AnnotationHandlerConfig {
  owner: string;
  repo: string;
  /** Label used to filter annotation issues. Default `'annotation'` */
  label?: string;
  /** GitHub PAT with Issues: read/write on the repo. */
  githubToken: string;
  /** Shared password the annotator UI sends with each POST. */
  authToken?: string;
  /** Cache-Control max-age on GET responses (seconds). Default 10. */
  cacheMaxAgeSeconds?: number;
  /** User-Agent on outgoing GitHub requests. Default 'annotator'. */
  userAgent?: string;
}

interface AnnotationPayload {
  url?: string;
  selector?: string;
  element?: string;
  comment?: string;
  author?: string;
}

interface IssueAnnotation {
  id: number;
  n: number;
  url: string;
  selector: string;
  element: string;
  comment: string;
  html_url: string;
  created_at: string;
  author?: string;
}

const META_START = '<!-- annotation-meta';
const META_END = '-->';
const DEFAULT_LABEL = 'annotation';
const DEFAULT_CACHE = 10;
const DEFAULT_UA = 'annotator';

function buildIssueBody(p: Required<Pick<AnnotationPayload, 'url' | 'selector' | 'element' | 'comment'>> & { author?: string }) {
  const meta = JSON.stringify({ url: p.url, selector: p.selector, element: p.element });
  return [
    `**Page:** \`${p.url}\``,
    `**Selector:** \`${p.selector}\``,
    '',
    '**Element:**',
    '```html',
    p.element,
    '```',
    '',
    '**Comment:**',
    '',
    p.comment,
    p.author ? `\n— ${p.author}` : '',
    '',
    `${META_START}\n${meta}\n${META_END}`,
  ]
    .filter(Boolean)
    .join('\n');
}

function parseIssueBody(body = '') {
  const start = body.indexOf(META_START);
  if (start === -1) return null;
  const end = body.indexOf(META_END, start);
  if (end === -1) return null;
  const json = body.slice(start + META_START.length, end).trim();
  try {
    return JSON.parse(json) as { url?: string; selector?: string; element?: string };
  } catch {
    return null;
  }
}

function extractComment(body: string) {
  const m = body.match(/\*\*Comment:\*\*\s*\n+([\s\S]*?)(?:\n+<!-- annotation-meta|$)/);
  if (!m || !m[1]) return body;
  return m[1].replace(/\n+— [^\n]*$/, '').trim();
}

function stripHtml(s: string) { return String(s).replace(/<[^>]*>/g, ''); }
function truncate(s: string, n: number) { return s.length > n ? s.slice(0, n - 1) + '…' : s; }

async function gh<T = any>(config: AnnotationHandlerConfig, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      Authorization: `Bearer ${config.githubToken}`,
      'User-Agent': config.userAgent ?? DEFAULT_UA,
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`GitHub ${path} → ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

// ────────────────────────────────────────────────────────────────────
// Normalised core — single place where the logic lives.
// ────────────────────────────────────────────────────────────────────

interface NormalizedReq {
  method: string;
  urlSearchParams: URLSearchParams;
  headers: Record<string, string | undefined>;
  body: AnnotationPayload | null;
}

interface NormalizedRes {
  status: number;
  body: any;
  headers?: Record<string, string>;
}

async function handleNormalized(config: AnnotationHandlerConfig, req: NormalizedReq): Promise<NormalizedRes> {
  if (!config.githubToken) {
    return { status: 500, body: { error: 'githubToken not configured' } };
  }
  const label = config.label ?? DEFAULT_LABEL;
  const cacheMaxAge = config.cacheMaxAgeSeconds ?? DEFAULT_CACHE;

  if (req.method === 'GET') {
    try {
      const issues = await gh<any[]>(
        config,
        `/repos/${config.owner}/${config.repo}/issues?labels=${encodeURIComponent(label)}&state=open&per_page=100`
      );
      const filterUrl = req.urlSearchParams.get('url') || undefined;
      const annotations: IssueAnnotation[] = issues
        .filter(i => !i.pull_request)
        .map(i => {
          const meta = parseIssueBody(i.body || '') || {};
          return {
            id: i.number,
            n: i.number,
            url: meta.url || '',
            selector: meta.selector || '',
            element: meta.element || '',
            comment: extractComment(i.body || ''),
            html_url: i.html_url,
            created_at: i.created_at,
            author: i.user?.login,
          };
        })
        .filter(a => !filterUrl || a.url === filterUrl);

      return {
        status: 200,
        body: { annotations },
        headers: { 'Cache-Control': `public, max-age=${cacheMaxAge}, s-maxage=${cacheMaxAge}` },
      };
    } catch (err: any) {
      return { status: 500, body: { error: String(err.message || err) } };
    }
  }

  if (req.method === 'POST') {
    if (!config.authToken) {
      return { status: 500, body: { error: 'authToken not configured' } };
    }
    const token = req.headers['x-annotator-token'];
    if (token !== config.authToken) {
      return { status: 401, body: { error: 'Invalid annotator token' } };
    }

    const body = req.body || {};
    const { url, selector, element, comment, author } = body;
    if (!url || !selector || !comment) {
      return { status: 400, body: { error: 'url, selector, and comment are required' } };
    }
    const safe = {
      url: String(url).slice(0, 500),
      selector: String(selector).slice(0, 500),
      element: String(element || '').slice(0, 800),
      comment: String(comment).slice(0, 4000),
      author: author ? String(author).slice(0, 80) : undefined,
    };

    const title = `[Annotation] ${safe.url} — ${truncate(stripHtml(safe.comment), 60)}`;
    const issueBody = buildIssueBody(safe);
    try {
      const issue = await gh<any>(config, `/repos/${config.owner}/${config.repo}/issues`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, body: issueBody, labels: [label] }),
      });
      return {
        status: 200,
        body: { id: issue.number, n: issue.number, html_url: issue.html_url },
      };
    } catch (err: any) {
      return { status: 500, body: { error: String(err.message || err) } };
    }
  }

  return { status: 405, body: null, headers: { Allow: 'GET, POST' } };
}

// ────────────────────────────────────────────────────────────────────
// Public adapters
// ────────────────────────────────────────────────────────────────────

/** Web standard adapter — `(Request) => Promise<Response>`. */
export function createAnnotationHandler(config: AnnotationHandlerConfig) {
  return async function handler(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const headers: Record<string, string> = {};
    request.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
    let body: AnnotationPayload | null = null;
    if (request.method === 'POST') {
      try { body = await request.json() as AnnotationPayload; } catch { body = {}; }
    }
    const result = await handleNormalized(config, {
      method: request.method,
      urlSearchParams: url.searchParams,
      headers,
      body,
    });
    const resHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
    Object.assign(resHeaders, result.headers || {});
    return new Response(result.body == null ? '' : JSON.stringify(result.body), {
      status: result.status,
      headers: resHeaders,
    });
  };
}

/** Node-style adapter — `(req, res) => void`. Use for classic Vercel `api/*.js`. */
export function createNodeAnnotationHandler(config: AnnotationHandlerConfig) {
  return async function handler(req: any, res: any) {
    const urlSearchParams = new URL(req.url || '/', 'http://x').searchParams;
    const headers: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(req.headers || {})) {
      headers[String(k).toLowerCase()] = Array.isArray(v) ? v[0] : (v as string | undefined);
    }
    let body: AnnotationPayload | null = null;
    if (req.method === 'POST') {
      if (req.body && typeof req.body === 'object') {
        body = req.body;
      } else {
        body = await new Promise<AnnotationPayload>((resolve, reject) => {
          let raw = '';
          req.on('data', (c: any) => { raw += c; });
          req.on('end', () => {
            try { resolve(raw ? JSON.parse(raw) : {}); } catch (e) { reject(e); }
          });
          req.on('error', reject);
        }).catch(() => ({}));
      }
    }
    const result = await handleNormalized(config, {
      method: req.method,
      urlSearchParams,
      headers,
      body,
    });
    for (const [k, v] of Object.entries(result.headers || {})) res.setHeader(k, v);
    res.status(result.status).json(result.body);
  };
}
