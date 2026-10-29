/**
 * Evaluation metric functions.
 * All pure functions — no side effects.
 */

/**
 * Recall@K: what fraction of expected sources appear in the top-K retrieved sources.
 * Returns 1.0 if expectedSources is empty (no sources needed = perfectly recalled).
 */
export function recallAtK(retrieved: string[], expected: string[], k: number): number {
  if (expected.length === 0) return 1;
  const topK = new Set(retrieved.slice(0, k).map((s) => s.toLowerCase()));
  return expected.filter((e) => topK.has(e.toLowerCase())).length / expected.length;
}

/**
 * Mean Reciprocal Rank: 1 / rank_of_first_relevant_result.
 * Returns 0 if no expected source appears in retrieved list.
 */
export function mrr(retrieved: string[], expected: string[]): number {
  const norm = retrieved.map((s) => s.toLowerCase());
  const expectedNorm = expected.map((e) => e.toLowerCase());
  for (let i = 0; i < norm.length; i++) {
    if (expectedNorm.some((e) => norm[i]?.includes(e) || e.includes(norm[i] ?? ""))) {
      return 1 / (i + 1);
    }
  }
  return 0;
}

/**
 * Fact coverage: fraction of expected facts that appear in the answer.
 * Matching is case-insensitive with punctuation stripped.
 */
export function factCoverage(answer: string, expectedFacts: string[]): number {
  if (expectedFacts.length === 0) return 1;
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .replace(/\s+/g, " ")
      .trim();

  const normAnswer = normalize(answer);
  return (
    expectedFacts.filter((fact) => normAnswer.includes(normalize(fact))).length /
    expectedFacts.length
  );
}

/**
 * Citation precision: fraction of [S#] tags in the answer that map to real sources.
 */
export function citationPrecision(answer: string, numSources: number): number {
  const tags = answer.match(/\[S\d+\]/g) ?? [];
  if (tags.length === 0) return 1; // no citations = trivially precise
  const valid = tags.filter((tag) => {
    const n = Number(tag.slice(2, -1));
    return n >= 1 && n <= numSources;
  });
  return valid.length / tags.length;
}

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)] ?? 0;
}
