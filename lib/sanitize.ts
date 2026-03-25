// lib/sanitize.ts
// Utilidad compartida para sanitizar inputs

/**
 * Sanitiza un string para uso seguro en queries PostgreSQL ILIKE.
 * Escapa caracteres especiales (%, _, \) y limita longitud.
 */
export function sanitizeSearchInput(input: string, maxLength = 100): string {
  return input
    .slice(0, maxLength)
    .replace(/[%_\\]/g, "\\$&");
}

/**
 * Escapa caracteres especiales de HTML para prevenir XSS
 * cuando se interpola texto de usuario en templates HTML.
 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Allowed HTML tags for sanitized content.
 * Everything not on this list is stripped.
 */
const ALLOWED_TAGS = new Set([
  "div", "span", "p", "h1", "h2", "h3", "h4", "h5", "h6",
  "table", "thead", "tbody", "tfoot", "tr", "td", "th",
  "ul", "ol", "li",
  "strong", "em", "b", "i", "u",
  "br", "hr",
  "a", "img",
  "blockquote", "pre", "code",
  "caption", "col", "colgroup",
]);

/** Tags whose content (including children) should be removed entirely. */
const STRIP_WITH_CONTENT = new Set([
  "script", "style", "iframe", "embed", "object", "form",
  "applet", "base", "link", "meta",
]);

/**
 * Sanitize an HTML string by removing dangerous tags, attributes, and
 * protocol handlers while keeping safe structural/semantic markup.
 *
 * This is a server-side sanitizer that does NOT rely on a DOM parser.
 * It operates via regex passes which is acceptable here because the
 * output is stored as-is and later rendered inside a controlled
 * React component (dangerouslySetInnerHTML or similar).
 */
export function sanitizeHtml(html: string): string {
  let result = html;

  // 1. Remove tags (and their content) that should never appear.
  //    Use a non-greedy match that handles nested cases by repeating.
  for (const tag of Array.from(STRIP_WITH_CONTENT)) {
    // Case-insensitive, dotAll ([\s\S] for cross-line matching)
    const pattern = new RegExp(
      `<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`,
      "gi"
    );
    // Repeat until stable in case of nested tags of the same kind
    let prev: string;
    do {
      prev = result;
      result = result.replace(pattern, "");
    } while (result !== prev);

    // Also strip self-closing variants (e.g. <embed />)
    result = result.replace(new RegExp(`<${tag}\\b[^>]*/?>`, "gi"), "");
  }

  // 2. Process remaining tags: allow listed tags, strip the rest.
  result = result.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)\/?\s*>/g,
    (match, tagName: string, attrs: string) => {
      const lower = tagName.toLowerCase();

      // Strip tags not in the allow-list (remove tag but keep inner text)
      if (!ALLOWED_TAGS.has(lower)) {
        return "";
      }

      // For closing tags, no attributes needed
      if (match.startsWith("</")) {
        return `</${lower}>`;
      }

      const selfClosing = match.trimEnd().endsWith("/>") || lower === "br" || lower === "hr";

      // 3. Sanitize attributes
      const cleanAttrs = sanitizeAttributes(lower, attrs);

      return selfClosing
        ? `<${lower}${cleanAttrs} />`
        : `<${lower}${cleanAttrs}>`;
    }
  );

  return result;
}

/** Attributes that are safe on any element. */
const GLOBAL_SAFE_ATTRS = new Set([
  "class", "id", "title", "lang", "dir",
  "colspan", "rowspan", "headers", "scope", "align", "valign",
  "width", "height", "alt",
]);

/**
 * Parse attributes from a tag and return only the safe ones.
 * Strips all on* event handlers and dangerous protocol URIs.
 */
function sanitizeAttributes(tag: string, attrsStr: string): string {
  const parts: string[] = [];

  // Match attribute="value", attribute='value', attribute=value, or bare attribute
  const attrRegex = /([a-zA-Z][a-zA-Z0-9\-_]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let m: RegExpExecArray | null;

  while ((m = attrRegex.exec(attrsStr)) !== null) {
    const attrName = m[1].toLowerCase();
    const attrValue = m[2] ?? m[3] ?? m[4] ?? "";

    // Block all event handlers (on*)
    if (attrName.startsWith("on")) continue;

    // Block style attribute (can contain expressions in some browsers)
    if (attrName === "style") continue;

    // Handle href on <a>
    if (attrName === "href") {
      if (tag !== "a") continue;
      if (!isAllowedUrl(attrValue, ["http:", "https:", "mailto:"])) continue;
      parts.push(` href="${escapeAttrValue(attrValue)}"`);
      continue;
    }

    // Handle src on <img>
    if (attrName === "src") {
      if (tag !== "img") continue;
      if (!isAllowedUrl(attrValue, ["http:", "https:", "data:"])) continue;
      parts.push(` src="${escapeAttrValue(attrValue)}"`);
      continue;
    }

    // Allow global safe attrs
    if (GLOBAL_SAFE_ATTRS.has(attrName)) {
      parts.push(` ${attrName}="${escapeAttrValue(attrValue)}"`);
    }

    // Allow target/rel on <a>
    if (tag === "a" && (attrName === "target" || attrName === "rel")) {
      parts.push(` ${attrName}="${escapeAttrValue(attrValue)}"`);
    }
  }

  return parts.join("");
}

/** Check that a URL value starts with one of the allowed protocols. */
function isAllowedUrl(url: string, protocols: string[]): boolean {
  const trimmed = url.trim().toLowerCase().replace(/[\x00-\x1f\x7f]/g, "");
  // Relative URLs (no protocol) are safe
  if (!trimmed.includes(":")) return true;
  return protocols.some((p) => trimmed.startsWith(p));
}

/** Escape a value for use inside an HTML attribute (double-quoted). */
function escapeAttrValue(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
