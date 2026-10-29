
import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  closeSearchDatabase,
} from "./database/search-documents.js";
import { answerQuestion } from "./rag/answer-question.js";

interface EvaluationCase {
  id: string;
  question: string;
  expectedFacts: string[];
  expectedSources: string[];
  answerable: boolean;
}

const FALLBACK_MESSAGE =
  "I couldn't find sufficient information in the available support documents to answer this question.";

async function main(): Promise<void> {
  const datasetPath = path.resolve(
    "resources/evaluation-dataset.json",
  );

  const dataset = JSON.parse(
    await readFile(datasetPath, "utf8"),
  ) as EvaluationCase[];

  const organizationId = process.env.EVALUATION_ORGANIZATION_ID;

  if (!organizationId?.trim()) {
    throw new Error(
      "Set EVALUATION_ORGANIZATION_ID in your .env file to the organization ID used for your evaluation documents.",
    );
  }

  let answerabilityCorrect = 0;
  let sourceCoverageCorrect = 0;

  for (const testCase of dataset) {
    console.log(`\nEvaluating: ${testCase.id}`);

    const result = await answerQuestion(
      testCase.question,
      organizationId,
    );

    const predictedAnswerable =
      !result.answer.includes(FALLBACK_MESSAGE);

    const answerabilityPassed =
      predictedAnswerable === testCase.answerable;

    const citedSources = new Set(
      result.citations.map((citation) => citation.sourceName),
    );

    const sourceCoveragePassed =
      testCase.expectedSources.length === 0
        ? result.citations.length === 0
        : testCase.expectedSources.every((source) =>
            citedSources.has(source),
          );

    if (answerabilityPassed) answerabilityCorrect++;
    if (sourceCoveragePassed) sourceCoverageCorrect++;

    console.log({
      question: testCase.question,
      expectedAnswerable: testCase.answerable,
      predictedAnswerable,
      answerabilityPassed,
      expectedSources: testCase.expectedSources,
      citedSources: [...citedSources],
      sourceCoveragePassed,
      answer: result.answer,
    });
  }

  console.log("\n=== RAG Evaluation Summary ===");
  console.log(`Total cases: ${dataset.length}`);
  console.log(
    `Answerability accuracy: ${answerabilityCorrect}/${dataset.length}`,
  );
  console.log(
    `Source coverage: ${sourceCoverageCorrect}/${dataset.length}`,
  );
}

main()
  .catch((error: unknown) => {
    console.error("RAG evaluation failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeSearchDatabase();
  });
