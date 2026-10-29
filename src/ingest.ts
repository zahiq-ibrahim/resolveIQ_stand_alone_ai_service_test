import path from "node:path";
import { ingestDocument } from "./ingestion/ingest-document.js";

async function main(): Promise<void> {
  const inputPath = process.argv[2];

  if (!inputPath) {
    throw new Error(
      "Provide a document path. Example: npm run ingest -- resources/sample-refund-policy.md",
    );
  }

  const filePath = path.resolve(inputPath);
  const result = await ingestDocument(filePath);

  console.log(
    JSON.stringify(
      {
        sourceName: result.sourceName,
        contentType: result.contentType,
        pageCount: result.pageCount,
        characterCount: result.characterCount,
        chunkCount: result.chunkCount,
        chunks: result.chunks,
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  console.error("Document ingestion failed:", error);
  process.exitCode = 1;
});