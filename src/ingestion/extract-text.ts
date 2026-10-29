import { readFile } from "node:fs/promises";
import path from "node:path";
import mammoth from "mammoth";
import pdf from "pdf-parse/lib/pdf-parse.js";

import type {
  ExtractedDocument,
  SupportedDocumentType,
} from "./types.js";

export async function extractText(
  filePath: string,
): Promise<ExtractedDocument> {
  const extension = path.extname(filePath).toLowerCase();

  const supportedTypes: Record<string, SupportedDocumentType> = {
    ".txt": "txt",
    ".md": "md",
    ".pdf": "pdf",
    ".docx": "docx",
  };

  const contentType = supportedTypes[extension];

  if (!contentType) {
    throw new Error(
      `Unsupported file type: ${extension || "(no extension)"}`,
    );
  }

  const buffer = await readFile(filePath);

  let text: string;
  let pageCount: number | undefined;

  switch (contentType) {
    case "txt":
    case "md":
      text = buffer.toString("utf8");
      break;

    case "docx": {
      const result = await mammoth.extractRawText({ buffer });
      text = result.value;
      break;
    }

    case "pdf": {
      const result = await pdf(buffer);
      text = result.text;
      pageCount = result.numpages;
      break;
    }
  }

  if (!text.trim()) {
    throw new Error(
      `No text could be extracted from ${path.basename(filePath)}.`,
    );
  }

  return {
    sourceName: path.basename(filePath),
    contentType,
    text,
    ...(pageCount !== undefined ? { pageCount } : {}),
  };
}