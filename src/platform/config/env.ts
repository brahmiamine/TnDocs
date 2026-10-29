import { z } from "zod";

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  DATABASE_URL: z.string().url().optional(),
  MEILISEARCH_URL: z.string().url().optional(),
  MEILISEARCH_MASTER_KEY: z.string().optional(),
  STORAGE_ROOT: z.string().default("./.data/storage"),
});

export const env = environmentSchema.parse({
  NODE_ENV: process.env.NODE_ENV,
  APP_URL: process.env.APP_URL,
  DATABASE_URL: process.env.DATABASE_URL,
  MEILISEARCH_URL: process.env.MEILISEARCH_URL,
  MEILISEARCH_MASTER_KEY: process.env.MEILISEARCH_MASTER_KEY,
  STORAGE_ROOT: process.env.STORAGE_ROOT,
});
