import "dotenv/config";
import { z } from "zod";

const Env = z.object({
  /** Neon POOLED connection string (host contains -pooler). Used by the API and worker at runtime. */
  DATABASE_URL: z.string().min(1),
  /** Neon DIRECT connection string. Used ONLY by the migration script / DDL. */
  DIRECT_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  AI_PROVIDER: z.enum(["gemini", "openai"]).default("gemini"),
  GEMINI_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  LLM_MODEL: z.string().default("gemini-2.0-flash"),
  EMBEDDING_MODEL: z.string().default("gemini-embedding-001"),
  EMBEDDING_DIMENSIONS: z.coerce.number().default(768),
  MIN_SIMILARITY: z.coerce.number().default(0.5),
  HYBRID_RRF_K: z.coerce.number().default(60),
  ADMIN_API_KEY: z.string().min(16),
  PORT: z.coerce.number().default(4000),
  MAX_CHUNK_CHARS: z.coerce.number().default(2000),
  CHUNK_OVERLAP: z.coerce.number().default(300),
});

export const env = Env.parse(process.env);
