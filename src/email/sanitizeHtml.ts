/**
 * Minimal HTML sanitizer for untrusted email HTML.
 * Strips script/style/iframe/object/embed/form and event handlers / javascript: URLs.
 * Not a full DOM sanitizer — adequate for stored preview until a heavier library is justified.
 */
export function sanitizeHtml(input: string, maxLength = 500_000): string {
  if (!input) return "";
  let html = input.length > maxLength ? input.slice(0, maxLength) : input;

  // Remove dangerous elements (including content)
  html = html.replace(
    /<\s*(script|style|iframe|object|embed|form|link|meta|base)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi,
    "",
  );
  html = html.replace(
    /<\s*(script|style|iframe|object|embed|form|link|meta|base)[^>]*\/?\s*>/gi,
    "",
  );

  // Strip on* event handlers
  html = html.replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");

  // Neutralize javascript: and data: in href/src
  html = html.replace(
    /\s(href|src|xlink:href|action)\s*=\s*(["'])\s*(javascript|data|vbscript):/gi,
    ' $1=$2#blocked-',
  );
  html = html.replace(
    /\s(href|src|xlink:href|action)\s*=\s*(javascript|data|vbscript):/gi,
    " $1=#blocked-",
  );

  return html;
}
