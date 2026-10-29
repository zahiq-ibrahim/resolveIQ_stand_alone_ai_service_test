
import "dotenv/config";
import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;
const model =
  process.env.GEMINI_EMBEDDING_MODEL ?? "gemini-embedding-001";
const dimensions = Number(
  process.env.EMBEDDING_DIMENSIONS ?? "768",
);

if (!apiKey) {
  throw new Error("GEMINI_API_KEY is missing from .env");
}

if (!Number.isInteger(dimensions) || dimensions < 1) {
  throw new Error("EMBEDDING_DIMENSIONS must be a positive integer.");
}

const ai = new GoogleGenAI({ apiKey });

export async function generateEmbedding(
  text: string,
  taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY" =
    "RETRIEVAL_DOCUMENT",
): Promise<number[]> {
  const input = text.trim();

  if (!input) {
    throw new Error("Cannot generate an embedding for empty text.");
  }

  const response = await ai.models.embedContent({
    model,
    contents: input,
    config: {
      taskType,
      outputDimensionality: dimensions,
    },
  });

  const values = response.embeddings?.[0]?.values;

  if (!values || values.length !== dimensions) {
    throw new Error(
      `Expected ${dimensions} embedding values, received ${
        values?.length ?? 0
      }.`,
    );
  }

  if (!values.every(Number.isFinite)) {
    throw new Error("Embedding contains invalid numeric values.");
  }

  // gemini-embedding-001 requires normalization when using
  // a reduced dimension such as 768.
  const magnitude = Math.sqrt(
    values.reduce((sum, value) => sum + value * value, 0),
  );

  if (magnitude === 0) {
    throw new Error("Cannot normalize a zero-length embedding.");
  }

  return values.map((value) => value / magnitude);
}
