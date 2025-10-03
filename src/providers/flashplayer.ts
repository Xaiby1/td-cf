import type { Source } from '../types/sources';
import { unpackEvaled } from '../impl/unpacker';

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

function extractM3u8Candidates(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const reAbs = /https?:\/\/[^\s"']+?\.m3u8(?:\?[^\s"']*)?/gi;
  let m: RegExpExecArray | null;
  while ((m = reAbs.exec(text)) !== null) {
    const s = m[0]!;
    if (!seen.has(s)) { seen.add(s); out.push(s); }
  }
  return out;
}

function pickPreferredM3u8(candidates: string[]): string | null {
  if (candidates.length === 0) return null;
  const good = candidates.filter(s => /\/stream\//i.test(s) || /infamous\./i.test(s))
                         .filter(s => !/Cannot%20GET%20|Cannot\s+GET/i.test(s));
  if (good.length > 0) return good[0]!;
  const filtered = candidates.filter(s => !/Cannot%20GET%20|Cannot\s+GET/i.test(s));
  return (filtered[0] || candidates[0]) ?? null;
}

function sanitizeM3u8Url(raw: string): string {
  try {
    const u = new URL(raw);
    let path = u.pathname.replace(/Cannot%20GET%20/gi, '').replace(/Cannot\s+GET/gi, '');
    const ix = path.toLowerCase().lastIndexOf('/stream/');
    if (ix >= 0) {
      const tail = path.substring(ix);
      const end = tail.toLowerCase().indexOf('.m3u8');
      if (end >= 0) {
        path = tail.substring(0, end + '.m3u8'.length);
      } else {
        path = tail;
      }
    }
    path = path.replace(/\/+/g, '/');
    u.pathname = path;
    u.search = '';
    return u.protocol + '//' + u.host + u.pathname;
  } catch {
    return raw.replace(/Cannot%20GET%20/gi, '').replace(/Cannot\s+GET/gi, '').replace(/(^https?:\/\/[^\/]+)\/+/, '$1/').replace(/([^:])\/{2,}/g, '$1/');
  }
}

function tryBase64Decode(s: string): string | null {
  try {
    let str = s.replace(/\s+/g, '');
    while (str.length % 4 !== 0) str += '=';
    const bin = atob(str);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)!;
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

function extractIframeSrc(html: string, base: string): string | null {
  const upperMatch = html.match(/<iframe[^>]*?src=["']([^"'\s>]+)["'][^>]*?>/i);
  const src = upperMatch?.[1] || '';
  if (!src) return null;
  return toAbsoluteUrl(src, base);
}

function base64UrlToBase64(b64url: string): string {
  let b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4 !== 0) b64 += '=';
  return b64;
}

function base64UrlDecodeToString(b64url: string): string | null {
  try {
    const b64 = base64UrlToBase64(b64url);
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)!;
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

function extractHlsFromConfig(jsOrHtml: string, base: string): { url: string; label?: string } | null {
  const srcMatch = jsOrHtml.match(/sources\s*:\s*\[[\s\S]*?\{[\s\S]*?\"src\"\s*:\s*\"([^\"]+\.m3u8[^\"]*)\"[\s\S]*?\}/i);
  if (!srcMatch || !srcMatch[1]) return null;
  const url = toAbsoluteUrl(srcMatch[1], base);
  let label: string | undefined;
  const labelMatch = jsOrHtml.match(/sources\s*:\s*\[[\s\S]*?\{[\s\S]*?\"label\"\s*:\s*\"([^\"]+)\"[\s\S]*?\}/i);
  if (labelMatch && labelMatch[1]) label = labelMatch[1];
  return { url, label };
}

function extractM3u8Generic(jsOrHtml: string): string | null {
  const m = jsOrHtml.match(/["']([^"']*\.m3u8[^"']*)["']/i);
  return m && m[1] ? m[1] : null;
}

function extractDictionary(unpacked: string): string[] | null {
  const dictMatch = unpacked.match(/'([^']*)'\.split\('\|\'\)/);
  if (!dictMatch || !dictMatch[1]) return null;
  return dictMatch[1].split('|');
}

function denormalizeNumericTokens(encodedUrl: string, dict: string[] | null): string {
  if (!dict) return encodedUrl;
  return encodedUrl.replace(/\b(\d+)\b/g, (full, d) => {
    const idx = parseInt(d, 10);
    return Number.isFinite(idx) && idx >= 0 && idx < dict.length && dict[idx] ? dict[idx] : full;
  });
}

async function fetchText(url: string, referer: string, userAgent: string): Promise<string> {
  const res = await fetch(url, { headers: { Referer: referer, 'User-Agent': userAgent, Accept: '*/*' } });
  return await res.text();
}

type Variant = { url: string; bandwidth?: number; resolution?: { width: number; height: number } };

function parseMasterVariants(masterText: string, masterUrl: string): Variant[] {
  const lines = masterText.split(/\r?\n/);
  const variants: Variant[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] as string;
    if (/^#EXT-X-STREAM-INF:/i.test(line)) {
      const meta = line;
      const next = lines[i + 1] || '';
      if (!next || next.startsWith('#')) continue;
      let bandwidth: number | undefined;
      let resolution: { width: number; height: number } | undefined;
      const bwMatch = meta.match(/BANDWIDTH=(\d+)/i);
      if (bwMatch) bandwidth = parseInt(bwMatch[1] as string, 10);
      const resMatch = meta.match(/RESOLUTION=(\d+)x(\d+)/i);
      if (resMatch) {
        resolution = { width: parseInt(resMatch[1] as string, 10), height: parseInt(resMatch[2] as string, 10) };
      }
      const abs = toAbsoluteUrl(next.trim(), masterUrl);
      variants.push({ url: abs, bandwidth, resolution });
    }
  }
  if (variants.length === 0) {
    for (const line of lines) {
      if (line && !line.startsWith('#') && /\.m3u8(\?|$)/i.test(line)) {
        variants.push({ url: toAbsoluteUrl(line.trim(), masterUrl) });
      }
    }
  }
  return variants;
}

function pickVariant(variants: Variant[]): Variant | null {
  if (variants.length === 0) return null;
  let best = variants[0] as Variant;
  for (const v of variants) {
    const areaBest = best.resolution ? best.resolution.width * best.resolution.height : 0;
    const areaV = v.resolution ? v.resolution.width * v.resolution.height : 0;
    if (areaV > areaBest) best = v;
    else if (areaV === areaBest) {
      const bwBest = best.bandwidth ?? 0;
      const bwV = v.bandwidth ?? 0;
      if (bwV > bwBest) best = v;
    }
  }
  return best;
}

function base64UrlEncodeString(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  const b64 = btoa(binary);
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function rot13(s: string): string {
  return s.replace(/[A-Za-z]/g, (c) => {
    const code = c.charCodeAt(0);
    const base = code >= 97 ? 97 : 65;
    return String.fromCharCode(((code - base + 13) % 26) + base);
  });
}

function juicySymbolMap(): string[] {
  return ['`', '%', '-', '+', '*', '$', '!', '_', '^', '='];
}

function juicyDecodeSalt(s: string): number | null {
  if (!s) return null;
  let acc = '';
  for (const ch of s) acc += String(ch.charCodeAt(0) - 100);
  const n = parseInt(acc, 10);
  return Number.isFinite(n) ? n : null;
}

function decodeJuicycodesEncoded(arg: string): string | null {
  try {
    if (!arg || arg.length < 4) return null;
    const body = arg.slice(0, -3);
    const saltRaw = arg.slice(-3);
    const salt = juicyDecodeSalt(saltRaw) ?? 0;
    const stage1 = base64UrlDecodeToString(body);
    if (stage1 == null) return null;
    const stage2 = rot13(stage1);
    const map = juicySymbolMap();
    let digits = '';
    for (const ch of stage2) {
      const idx = map.indexOf(ch);
      if (idx >= 0) digits += String(idx);
    }
    const groups = digits.match(/.{4}/g);
    if (!groups) return null;

    let out = '';
    for (const g of groups) {
      const n = parseInt(g, 10);
      if (!Number.isFinite(n)) continue;
      const code = (n % 1000) - salt;
      out += String.fromCharCode(code);
    }
    return out;
  } catch {
    return null;
  }
}

function decodeJuicyCodesPayloadFromHtml(html: string): string | null {
  const uMatch = html.match(/_juicycodes\(\s*((?:"[^"]*"|'[^']*')(?:\s*\+\s*(?:"[^"]*"|'[^']*'))*)\s*\)/i);
  if (uMatch && uMatch[1]) {
    const concatSection = uMatch[1];
    const partRegex = /"([^"]*)"|'([^']*)'/g;
    let combined = '';
    let mm: RegExpExecArray | null;
    while ((mm = partRegex.exec(concatSection)) !== null) {
      combined += (mm[1] ?? mm[2] ?? '');
    }
    if (combined) {
      const decoded = decodeJuicycodesEncoded(combined);
      if (decoded) return decoded;
    }
  }

 const runMatch = html.match(/JuicyCodes\.Run\(\s*((?:"[^"]*"|'[^']*')(?:\s*\+\s*(?:"[^"]*"|'[^']*'))*)\s*\)/i);
  if (runMatch && runMatch[1]) {
    const concatSection = runMatch[1];
    const partRegex = /"([^"]*)"|'([^']*)'/g;
    let combined = '';
    let m: RegExpExecArray | null;
    while ((m = partRegex.exec(concatSection)) !== null) {
      const piece = (m[1] ?? m[2] ?? '');
      combined += piece;
    }
    if (!combined) return null;
    return base64UrlDecodeToString(combined);
  }

  return null;
}

export async function extractFlash(id: string): Promise<Source> {
  const userAgent = 'Mozilla/5.0 (X11; Linux x86_64; rv:143.0) Gecko/20100101 Firefox/143.0';

  const directIframeUrl = `https://thrfive.io/embed/${encodeURIComponent(id)}`;
  const directHeaders: Record<string, string> = {
    'User-Agent': userAgent,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Referer': 'https://tamildhool.art/',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'iframe',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'cross-site',
    'Priority': 'u=4',
  };

  const directRes = await fetch(directIframeUrl, { headers: directHeaders });
  console.log(directRes);
  const directHtml = await directRes.text();
  console.log(directHtml);

  const juicyDirect = decodeJuicyCodesPayloadFromHtml(directHtml);
  if (!juicyDirect) throw new Error('DESI-FLASH: Direct embed payload not found');

  const iframeOrigin = new URL(directIframeUrl).origin + '/';

  let unpacked: string;
  try {
    unpacked = unpackEvaled(juicyDirect);
  } catch {
    unpacked = juicyDirect;
  }
  let chosenUrl: string | null = null;
  const candidates = extractM3u8Candidates(unpacked);
  if (candidates.length > 0) {
    const picked = pickPreferredM3u8(candidates);
    if (picked) chosenUrl = sanitizeM3u8Url(picked);
  }
  if (!chosenUrl) {
    let hls = extractHlsFromConfig(unpacked, iframeOrigin);
    if (!hls) {
      const dict = extractDictionary(unpacked);
      const genericUrl = extractM3u8Generic(unpacked);
      if (genericUrl) {
        const rebuilt = denormalizeNumericTokens(genericUrl, dict);
        const finalUrl = toAbsoluteUrl(rebuilt, iframeOrigin);
        hls = { url: finalUrl, label: 'auto' };
      }
    }
    if (!hls) throw new Error('DESI-FLASH: HLS source not found after unpacking');
    chosenUrl = sanitizeM3u8Url(hls.url);
  }

  let hlsUrl = chosenUrl!;
  try {
    const master = await fetchText(hlsUrl, iframeOrigin, userAgent);
    const variants = parseMasterVariants(master, hlsUrl);
    const best = pickVariant(variants);
    if (best && best.url) hlsUrl = best.url; else if (variants.length > 0) hlsUrl = variants[0]!.url;
  } catch {}
  const quality = 'auto';
  let tokenRaw: string | undefined;
  let tokenDecoded: string | null | undefined;
  try {
    const m = hlsUrl.match(/\/stream\/([^\s?]+?\.m3u8)(?:$|\?)/i);
    if (m && m[1]) {
      tokenRaw = m[1].replace(/\.m3u8.*/, '');
      tokenDecoded = tryBase64Decode(tokenRaw);
    }
  } catch {}

  const proxied = `/hls/${base64UrlEncodeString(hlsUrl)}.m3u8`;
  return {
    sources: [{ url: proxied, quality }],
    tracks: [],
    audio: [],
    intro: { start: 0, end: 0 },
    outro: { start: 0, end: 0 },
    headers: {
      Referer: iframeOrigin,
    },
  };
}