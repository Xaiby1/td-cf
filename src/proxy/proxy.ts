import type { Context } from 'hono';

function base64UrlDecodeToString(b64url: string): string | null {
  try {
    let b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4 !== 0) b64 += '=';
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)!;
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

function base64UrlEncodeString(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  const b64 = btoa(binary);
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function toAbsoluteUrl(urlOrPath: string, base: string): string {
  try {
    if (!urlOrPath) return urlOrPath;
    if (/^https?:\/\//i.test(urlOrPath)) return urlOrPath;
    if (urlOrPath.startsWith('//')) return `https:${urlOrPath}`;
    return new URL(urlOrPath, base).toString();
  } catch {
    return urlOrPath;
  }
}

function rewritePlaylist(playlist: string, masterUrl: string): string {
  const lines = playlist.split(/\r?\n/);
  const base = masterUrl;
  const out: string[] = [];
  for (const line of lines) {
    if (!line || line.startsWith('#')) {
      out.push(line);
      continue;
    }
    const abs = toAbsoluteUrl(line.trim(), base);
    const proxied = '/hls/' + base64UrlEncodeString(abs);
    out.push(proxied);
  }
  return out.join('\n');
}

export const handleHlsProxy = async (c: Context) => {
  const b64 = c.req.param('b64');
  let base64 = b64.replace(/\.m3u8$/, '');
  if (!base64) return c.text('Missing param', 400, { 'Access-Control-Allow-Origin': '*' });

  const target = base64UrlDecodeToString(base64);
  if (!target || !/^https?:\/\//i.test(target)) {
    return c.text('Invalid target', 400, { 'Access-Control-Allow-Origin': '*' });
  }

  const ua = 'Mozilla/5.0 (X11; Linux x86_64; rv:143.0) Gecko/20100101 Firefox/143.0';
  const upstreamHeaders: Record<string, string> = {
    'User-Agent': ua,
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.5',
    'Referer': 'https://thrfive.io/',
    'Origin': 'https://thrfive.io',
    'Connection': 'keep-alive',
  };
  const range = c.req.header('range') || c.req.header('Range');
  if (range) upstreamHeaders['Range'] = range;

  const isPlaylist = /\.m3u8(\?|$)/i.test(new URL(target).pathname);
  const resp = await fetch(target, { headers: upstreamHeaders, method: 'GET' });

  if (isPlaylist) {
    const text = await resp.text();
    const rewritten = rewritePlaylist(text, target);
    return new Response(rewritten, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache',
      },
    });
  }

  const headers = new Headers();
  const ct = resp.headers.get('Content-Type') || 'application/octet-stream';
  headers.set('Content-Type', ct);
  const cr = resp.headers.get('Content-Range');
  const cl = resp.headers.get('Content-Length');
  const ar = resp.headers.get('Accept-Ranges') || 'bytes';
  if (cr) headers.set('Content-Range', cr);
  if (cl) headers.set('Content-Length', cl);
  if (ar) headers.set('Accept-Ranges', ar);
  headers.set('Access-Control-Allow-Origin', '*');

  return new Response(resp.body, { status: resp.status, headers });
};
