
import {
  closeSearchDatabase,
  searchDocuments,
} from "./database/search-documents.js";
import { answerQuestion } from "./rag/answer-question.js";

async function main(): Promise<void> {
  const question = process.argv[2];
  const organizationId = process.argv[3];

  if (!question || !organizationId) {
    throw new Error(
      'Usage: npm run ask -- "Your question" <organization-id>',
    );
  }

  const result = await answerQuestion(question, organizationId);

  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error: unknown) => {
    console.error("Answer generation failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeSearchDatabase();
  });
