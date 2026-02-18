/**
 * Email text utilities for thread deduplication.
 *
 * Strips quoted reply content and normalizes subjects so that
 * only new content is stored per message.
 */

/** Patterns that introduce a quoted reply block. */
const QUOTE_HEADERS = [
  /^On .+ wrote:\s*$/m,
  /^-{3,}\s*Original Message\s*-{3,}\s*$/im,
  /^_{3,}\s*$/m,
  /^From:\s.+$/m,
];

/**
 * Return only the new content from an email reply, stripping
 * quoted previous messages. Preserves leading whitespace trimming.
 */
export function stripQuotedReply(text: string): string {
  const lines = text.split("\n");
  const result: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    // Block of > quoted lines — skip the rest.
    if (line.startsWith(">")) break;

    // Check for quote header patterns followed by > lines or end of content.
    let matched = false;
    for (const pattern of QUOTE_HEADERS) {
      if (pattern.test(line)) {
        matched = true;
        break;
      }
    }
    if (matched) break;

    result.push(line);
  }

  return result.join("\n").trim();
}

/** Strip Re:/Fwd:/Fw: prefixes and normalize whitespace. */
export function normalizeSubject(subject: string): string {
  return subject
    .replace(/^(Re|Fwd?)\s*:\s*/gi, "")
    .replace(/^(Re|Fwd?)\s*:\s*/gi, "")
    .trim();
}
