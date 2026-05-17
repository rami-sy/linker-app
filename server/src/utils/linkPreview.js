/**
 * Fetch Open Graph / basic HTML metadata for chat link previews.
 * Includes basic SSRF protection (scheme, DNS → IP check).
 */

const dns = require("dns").promises;
const net = require("net");
const { URL } = require("url");
const axios = require("axios");
const logger = require("./logger");

function extractFirstHttpUrl(text) {
  if (!text || typeof text !== "string") return null;
  const m = text.match(/https?:\/\/[^\s<>"'{}|\\^`[\]]+/i);
  if (!m) return null;
  let url = m[0].replace(/[.,;:!?)\]]+$/u, "");
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.href;
  } catch {
    return null;
  }
}

function isPrivateOrReservedIPv4(ip) {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

function isPrivateOrReservedIp(ip) {
  if (net.isIPv4(ip)) return isPrivateOrReservedIPv4(ip);
  if (net.isIPv6(ip)) {
    const s = ip.toLowerCase();
    if (s === "::1") return true;
    if (s.startsWith("fe80:")) return true;
    if (s.startsWith("fc") || s.startsWith("fd")) return true;
    if (s.startsWith("::ffff:")) {
      const v4 = s.replace(/^::ffff:/, "");
      if (net.isIPv4(v4)) return isPrivateOrReservedIPv4(v4);
    }
    return false;
  }
  return true;
}

async function assertUrlSafeForFetch(urlString) {
  let u;
  try {
    u = new URL(urlString);
  } catch {
    throw new Error("invalid url");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error("bad protocol");
  }
  const host = u.hostname;
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "0.0.0.0"
  ) {
    throw new Error("blocked host");
  }
  if (net.isIP(host)) {
    if (isPrivateOrReservedIp(host)) throw new Error("blocked ip");
    return;
  }
  const { address } = await dns.lookup(host);
  if (isPrivateOrReservedIp(address)) {
    throw new Error("blocked resolved ip");
  }
}

function decodeHtmlEntities(s) {
  if (!s) return s;
  return String(s)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function pickMeta(html, prop) {
  const p = prop.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re1 = new RegExp(
    `<meta[^>]+property=["']${p}["'][^>]+content=["']([^"']*)["']`,
    "i"
  );
  const re2 = new RegExp(
    `<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${p}["']`,
    "i"
  );
  let m = html.match(re1);
  if (m) return decodeHtmlEntities(m[1]);
  m = html.match(re2);
  return m ? decodeHtmlEntities(m[1]) : null;
}

function pickNameMeta(html, name) {
  const n = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re1 = new RegExp(
    `<meta[^>]+name=["']${n}["'][^>]+content=["']([^"']*)["']`,
    "i"
  );
  const re2 = new RegExp(
    `<meta[^>]+content=["']([^"']*)["'][^>]+name=["']${n}["']`,
    "i"
  );
  let m = html.match(re1);
  if (m) return decodeHtmlEntities(m[1]);
  m = html.match(re2);
  return m ? decodeHtmlEntities(m[1]) : null;
}

function pickTitle(html) {
  const m = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return m ? decodeHtmlEntities(m[1].trim()) : null;
}

function resolveUrl(base, maybeRelative) {
  if (!maybeRelative) return null;
  try {
    return new URL(maybeRelative, base).href;
  } catch {
    return null;
  }
}

function parseOpenGraph(html, finalUrl) {
  const title =
    pickMeta(html, "og:title") ||
    pickNameMeta(html, "twitter:title") ||
    pickTitle(html);
  const description =
    pickMeta(html, "og:description") ||
    pickNameMeta(html, "twitter:description") ||
    pickNameMeta(html, "description");
  let image =
    pickMeta(html, "og:image") || pickNameMeta(html, "twitter:image");
  if (image) {
    image = resolveUrl(finalUrl, image);
  }
  const siteName =
    pickMeta(html, "og:site_name") || new URL(finalUrl).hostname;

  return {
    url: finalUrl,
    title: title || siteName || finalUrl,
    description: description || "",
    image: image || "",
    siteName: siteName || "",
  };
}

/**
 * @returns {Promise<{ url: string, title: string, description: string, image: string, siteName: string } | null>}
 */
const PREVIEW_CACHE_TTL_MS = 60 * 60 * 1000;
const PREVIEW_CACHE_MAX = 300;
const previewCache = new Map();

function getCachedPreview(url) {
  const entry = previewCache.get(url);
  if (!entry) return null;
  if (Date.now() - entry.at > PREVIEW_CACHE_TTL_MS) {
    previewCache.delete(url);
    return null;
  }
  return entry.data;
}

function setCachedPreview(url, data) {
  if (previewCache.size >= PREVIEW_CACHE_MAX) {
    const first = previewCache.keys().next().value;
    if (first !== undefined) previewCache.delete(first);
  }
  previewCache.set(url, { at: Date.now(), data });
}

async function fetchLinkPreviewSafe(urlString) {
  await assertUrlSafeForFetch(urlString);
  const res = await axios.get(urlString, {
    timeout: 10000,
    maxRedirects: 5,
    maxContentLength: 524288,
    maxBodyLength: 524288,
    validateStatus: (s) => s >= 200 && s < 400,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; LinkerLinkPreview/1.0; +https://linker.app)",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
    responseType: "text",
  });
  const html = typeof res.data === "string" ? res.data : "";
  const finalUrl =
    res.request?.res?.responseUrl ||
    res.config?.url ||
    urlString;
  const parsed = parseOpenGraph(html, finalUrl);
  if (!parsed.title && !parsed.description && !parsed.image) {
    return null;
  }
  return parsed;
}

/**
 * Fire-and-forget safe fetch; logs failures. Uses in-memory LRU-ish cache by URL.
 */
async function tryFetchLinkPreview(urlString) {
  const cached = getCachedPreview(urlString);
  if (cached) {
    return cached;
  }
  try {
    const preview = await fetchLinkPreviewSafe(urlString);
    if (preview) {
      setCachedPreview(urlString, preview);
    }
    return preview;
  } catch (e) {
    logger.debug("linkPreview fetch skipped or failed", {
      url: urlString,
      message: e?.message,
    });
    return null;
  }
}

module.exports = {
  extractFirstHttpUrl,
  assertUrlSafeForFetch,
  fetchLinkPreviewSafe,
  tryFetchLinkPreview,
};
