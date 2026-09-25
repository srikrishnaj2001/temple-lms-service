'use strict';

/**
 * HTML sanitization for announcement body content.
 *
 * The whitelist below mirrors the v1 rich-text toolbar in the admin form
 * (bold, italic, headings, lists, links). Anything else — images, scripts,
 * tables, inline styles, custom attributes — is stripped silently.
 *
 * Server-side sanitization is the source of truth. Client-side stripping
 * is just defense-in-depth.
 */

const sanitizeHtmlLib = require('sanitize-html');

// Tags allowed in stored HTML. Headings are limited to h1/h2/h3 — anything
// deeper would visually overwhelm an announcement card.
const ALLOWED_TAGS = ['b', 'strong', 'i', 'em', 'u', 'p', 'br', 'h1', 'h2', 'h3', 'ul', 'ol', 'li', 'a'];

// Only <a> may carry attributes. href is validated against ALLOWED_SCHEMES.
const ALLOWED_ATTRIBUTES = {
  a: ['href', 'name', 'target', 'rel']
};

// javascript: and data: URLs are blocked by exclusion (mailto allowed because
// admins sometimes want to surface a contact email).
const ALLOWED_SCHEMES = ['http', 'https', 'mailto'];

/**
 * Strip everything outside the v1 whitelist and force all <a> tags to open in
 * a new tab with rel="noopener noreferrer" (so external sites can't snoop on
 * window.opener).
 */
function sanitize(html) {
  if (!html) return '';
  return sanitizeHtmlLib(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRIBUTES,
    allowedSchemes: ALLOWED_SCHEMES,
    transformTags: {
      // simpleTransform(tagName, newAttrs, mergeAttrs) — mergeAttrs=true keeps
      // the existing href on the link while injecting our safer rel/target.
      a: sanitizeHtmlLib.simpleTransform('a', { rel: 'noopener noreferrer', target: '_blank' }, true)
    }
  });
}

/**
 * Build a plain-text preview from sanitized HTML.
 *
 * Stored denormalized on the announcement row so list queries and the
 * WhatsApp helper don't have to re-strip HTML every time.
 *
 * Truncates at maxLength with a horizontal ellipsis when the body is longer.
 */
function buildPreview(html, maxLength = 250) {
  if (!html) return '';
  // Pass through sanitize-html with an empty whitelist to get pure text.
  const text = sanitizeHtmlLib(html, { allowedTags: [], allowedAttributes: {} })
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 1).trimEnd() + '…';
}

module.exports = {
  sanitize,
  buildPreview
};
