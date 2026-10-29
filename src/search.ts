
import {
  closeSearchDatabase,
  searchDocuments,
} from "./database/search-documents.js";

async function main(): Promise<void> {
  const query = process.argv[2];
  const organizationId = process.argv[3];

  if (!query || !organizationId) {
    throw new Error(
      'Usage: npm run search -- "your question" <organization-id>',
    );
  }

  const results = await searchDocuments(query, organizationId, 5);

  console.log(
    JSON.stringify(
      {
        query,
        resultCount: results.length,
        results,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error: unknown) => {
    console.error("Semantic search failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeSearchDatabase();
  });
