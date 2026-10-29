export type SupportedDocumentType =
  | "txt"
  | "md"
  | "pdf"
  | "docx";

export interface ExtractedDocument {
  sourceName: string;
  contentType: SupportedDocumentType;
  text: string;
  pageCount?: number;
}

export interface DocumentChunk {
  chunkIndex: number;
  text: string;
  startChar: number;
  endChar: number;
}