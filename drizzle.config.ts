import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "mysql",
  schema: "./src/platform/database/schema.ts",
  out: "./src/platform/database/migrations",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "mysql://tndocs:tndocs_dev_only@127.0.0.1:3306/tndocs",
  },
});
