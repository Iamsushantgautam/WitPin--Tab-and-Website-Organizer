/**
 * WitPin - Favicon Helper Utility & Fallback Generator
 */

const PALETTE = [
  '#6366F1', '#10B981', '#EC4899', '#F59E0B',
  '#8B5CF6', '#06B6D4', '#EF4444', '#3B82F6'
];

/**
 * Extract clean domain name from URL
 */
export function getDomain(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') return 'website';
  try {
    let cleanUrl = urlStr.trim();
    if (!/^https?:\/\//i.test(cleanUrl)) {
      cleanUrl = 'https://' + cleanUrl;
    }
    const parsed = new URL(cleanUrl);
    return parsed.hostname.replace(/^www\./i, '') || 'website';
  } catch (e) {
    return 'website';
  }
}

/**
 * Get favicon URL for a website domain from Google S2 service
 */
export function getFaviconUrl(urlStr, size = 64) {
  const domain = getDomain(urlStr);
  if (!domain || domain === 'website') return null;
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=${size}`;
}

/**
 * Generate a clean SVG data URI displaying the first letter of the domain / title
 */
export function getLetterBadgeSvg(urlStr = '', title = '') {
  const domain = getDomain(urlStr);
  const rawLetter = (title?.trim() || domain)[0] || 'W';
  const letter = rawLetter.toUpperCase();

  let hash = 0;
  for (let i = 0; i < domain.length; i++) {
    hash = domain.charCodeAt(i) + ((hash << 5) - hash);
  }
  const color = PALETTE[Math.abs(hash) % PALETTE.length];

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="${color}"/><text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" fill="#FFFFFF" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif" font-size="16" font-weight="700">${letter}</text></svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/**
 * Sanitize and extract clean favicon URL
 * Handles HTML string migration, URL extraction, Google S2 fallback, and SVG letter badge fallback
 */
export function cleanFaviconUrl(favicon, siteUrl = '', title = '') {
  if (favicon && typeof favicon === 'string') {
    let str = favicon.trim();

    // 1. Extract src URL if favicon is a raw HTML string snippet like <img src="...">
    const srcMatch = str.match(/src=["']([^"']+)["']/i);
    if (srcMatch && srcMatch[1]) {
      str = srcMatch[1].trim();
    }

    // 2. Validate URL format and ensure no HTML tag injection remains
    if ((str.startsWith('http://') || str.startsWith('https://') || str.startsWith('data:image/')) && !/[<>"']/.test(str)) {
      return str;
    }
  }

  // 3. Fallback to Google S2 favicon service
  const s2Url = getFaviconUrl(siteUrl);
  if (s2Url) return s2Url;

  // 4. Ultimate fallback to domain letter badge SVG
  return getLetterBadgeSvg(siteUrl, title);
}

/**
 * Inline SVG string fallback for missing favicons
 */
export const DEFAULT_FAVICON_SVG = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="%236366F1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`;
