/**
 * Sanitize untrusted text before embedding in AI agent context.
 *
 * Prevents indirect prompt injection by:
 * - Stripping XML-like tags that could mimic system instructions
 * - Stripping markdown headings that could create fake sections
 * - Truncating to a safe length
 */

const XML_TAG_RE = /<\/?[a-zA-Z][a-zA-Z0-9_-]*[^>]*>/g;
const HEADING_RE = /^#{1,6}\s/gm;
const MAX_LEN = 500;

export function sanitizeText(text: string, maxLen = MAX_LEN): string {
  return text
    .replace(XML_TAG_RE, '')
    .replace(HEADING_RE, '')
    .slice(0, maxLen);
}

/** Wrap a block of untrusted text in a data fence so the AI treats it as content, not instructions. */
export function fenceData(label: string, text: string): string {
  const clean = sanitizeText(text);
  return `[DATA:${label}]${clean}[/DATA:${label}]`;
}
