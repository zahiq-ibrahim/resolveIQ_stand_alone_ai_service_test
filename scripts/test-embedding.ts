
import { generateEmbedding } from "../src/embeddings/generate-embedding.js";

async function main(): Promise<void> {
  const text =
    "Customers may request a subscription refund within 30 days.";

  const embedding = await generateEmbedding(text);

  const magnitude = Math.sqrt(
    embedding.reduce((sum, value) => sum + value * value, 0),
  );

  console.log({
    dimensions: embedding.length,
    firstFiveValues: embedding.slice(0, 5),
    magnitude: Number(magnitude.toFixed(6)),
  });
}

main().catch((error: unknown) => {
  console.error("Embedding test failed:", error);
  process.exitCode = 1;
});
