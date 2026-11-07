/**
 * Allowlist HTML sanitizer for untrusted email bodies.
 * Blocks scripts, handlers, remote resources (privacy), and dangerous URLs.
 * Compatible with Cloudflare Workers (no DOM dependency).
 */

const ALLOWED_TAGS = new Set([
  "a",
  "b",
  "blockquote",
  "br",
  "code",
  "div",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "i",
  "li",
  "ol",
  "p",
  "pre",
  "span",
  "strong",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
  "tr",
  "u",
  "ul",
]);

const VOID_TAGS = new Set(["br", "hr"]);

function escapeText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isSafeHref(href: string): boolean {
  const t = href.trim().toLowerCase();
  if (!t) return false;
  if (t.startsWith("mailto:")) return true;
  if (t.startsWith("https://") || t.startsWith("http://")) return true;
  if (t.startsWith("#")) return true;
  return false;
}

function parseAttrs(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    const name = m[1]!.toLowerCase();
    const val = m[3] ?? m[4] ?? m[5] ?? "";
    out[name] = val;
  }
  return out;
}

/**
 * Tokenize and rebuild HTML with an explicit allowlist.
 * Remote images, stylesheets, scripts, and event handlers are stripped.
 */
export function sanitizeHtml(input: string, maxChars = 200_000): string {
  if (!input) return "";
  let html = input.length > maxChars ? input.slice(0, maxChars) : input;

  // Neutralize script/style blocks early
  html = html.replace(/<\s*(script|style|iframe|object|embed|link|meta|base|form|svg|math)[\s\S]*?>[\s\S]*?<\s*\/\s*\1\s*>/gi, "");
  html = html.replace(/<\s*(script|style|iframe|object|embed|link|meta|base|form|svg|math)[^>]*\/?\s*>/gi, "");

  const out: string[] = [];
  const openStack: string[] = [];
  const tokenRe = /<!--[\s\S]*?-->|<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>|([^<]+)/g;
  let match: RegExpExecArray | null;

  while ((match = tokenRe.exec(html))) {
    const full = match[0];
    if (full.startsWith("<!--")) continue;

    if (match[3] !== undefined) {
      out.push(escapeText(match[3]));
      continue;
    }

    const tag = match[1]!.toLowerCase();
    const isClose = full.startsWith("</");
    const attrsRaw = match[2] ?? "";

    if (!ALLOWED_TAGS.has(tag)) continue;

    if (isClose) {
      const idx = openStack.lastIndexOf(tag);
      if (idx >= 0) {
        while (openStack.length > idx) {
          const t = openStack.pop()!;
          out.push(`</${t}>`);
        }
      }
      continue;
    }

    if (VOID_TAGS.has(tag) || /\/\s*$/.test(attrsRaw)) {
      if (tag === "br" || tag === "hr") out.push(`<${tag}>`);
      continue;
    }

    const attrs = parseAttrs(attrsRaw);
    const safe: string[] = [];
    if (tag === "a" && attrs.href && isSafeHref(attrs.href)) {
      safe.push(`href="${escapeText(attrs.href.trim())}"`);
      safe.push('rel="noopener noreferrer nofollow"');
      safe.push('target="_blank"');
    }
    // No src, style, on*, class remote loading

    openStack.push(tag);
    out.push(safe.length ? `<${tag} ${safe.join(" ")}>` : `<${tag}>`);
  }

  while (openStack.length) {
    out.push(`</${openStack.pop()}>`);
  }

  return out.join("");
}
