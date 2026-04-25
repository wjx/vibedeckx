"use client";

/**
 * Format a free-form selection as a Markdown blockquote. Each line is
 * prefixed with "> " so multi-line selections render as a single quote
 * block. A trailing blank line is appended so the caret lands on a fresh
 * line below the quote.
 */
export function formatAsQuote(text: string): string {
  return text.replace(/\r?\n/g, "\n").split("\n").map((l) => `> ${l}`).join("\n") + "\n\n";
}
