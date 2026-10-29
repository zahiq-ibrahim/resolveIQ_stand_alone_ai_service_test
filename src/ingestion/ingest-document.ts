import { extractText } from "./extract-text.js";
import { cleanText } from "./clean-text.js";
import { chunkText } from "./chunk-text.js";

export async function ingestDocument(filePath: string) {
  // Step 1: Extract text from the file.
  const document = await extractText(filePath);

  // Step 2: Normalize the extracted text.
  const cleanedText = cleanText(document.text);

  if (!cleanedText) {
    throw new Error("Document is empty after cleaning.");
  }

  // Step 3: Split the cleaned text into chunks.
  const chunks = chunkText(cleanedText);

  return {
    sourceName: document.sourceName,
    contentType: document.contentType,
    pageCount: document.pageCount,
    characterCount: cleanedText.length,
    chunkCount: chunks.length,
    chunks,
  };
}