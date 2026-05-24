// Prisma 7 config — connection URLs are defined here, not in schema.prisma
import "dotenv/config";
import { defineConfig } from "prisma/config";

// For migrations we MUST use the direct connection (port 5432, bypasses PgBouncer)
// At runtime the app uses the pooled connection (port 6543)
const isMigration =
  process.argv.some((a) => a.includes("migrate")) ||
  process.argv.some((a) => a.includes("db"));

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Use DIRECT_URL for migrations, DATABASE_URL for everything else
    url: isMigration
      ? (process.env["DIRECT_URL"] ?? process.env["DATABASE_URL"] ?? "")
      : (process.env["DATABASE_URL"] ?? ""),
  },
});
