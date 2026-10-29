import type { DocumentChunk } from "./types.js";

export function chunkText(
  text: string,
  maxChars = 2000,
  overlapChars = 300,
): DocumentChunk[] {
  if (maxChars <= 0) {
    throw new Error("maxChars must be greater than zero.");
  }

  if (overlapChars < 0 || overlapChars >= maxChars) {
    throw new Error(
      "overlapChars must be at least zero and smaller than maxChars.",
    );
  }

  const chunks: DocumentChunk[] = [];
  let start = 0;

  while (start < text.length) {
    let end = Math.min(start + maxChars, text.length);

    if (end < text.length) {
      // Prefer ending at a paragraph boundary.
      const paragraphBoundary = text.lastIndexOf("\n\n", end);

      // Otherwise, prefer a word boundary.
      const wordBoundary = text.lastIndexOf(" ", end);

      const minimumBoundary = start + Math.floor(maxChars * 0.6);

      if (paragraphBoundary >= minimumBoundary) {
        end = paragraphBoundary;
      } else if (wordBoundary >= minimumBoundary) {
        end = wordBoundary;
      }
    }

    const chunk = text.slice(start, end).trim();

    if (chunk) {
      chunks.push({
        chunkIndex: chunks.length,
        text: chunk,
        startChar: start,
        endChar: end,
      });
    }

    if (end >= text.length) {
      break;
    }

    const nextStart = end - overlapChars;

    // Ensure that the loop always moves forward.
    start = Math.max(start + 1, nextStart);
  }

  return chunks;
}