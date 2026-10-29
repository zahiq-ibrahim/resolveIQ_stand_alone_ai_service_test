
import path from "node:path";
import {
  closeDatabase,
  storeDocument,
} from "../src/database/store-document";

async function main(): Promise<void> {
  const filePath = process.argv[2];
  const organizationId = process.argv[3];

  if (!filePath || !organizationId) {
    throw new Error(
      "Usage: npm run ingest:store -- <file-path> <organization-id>",
    );
  }

  const result = await storeDocument(
    path.resolve(filePath),
    organizationId,
  );

  console.log("Document stored successfully:");
  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error: unknown) => {
    console.error("Document storage failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });
