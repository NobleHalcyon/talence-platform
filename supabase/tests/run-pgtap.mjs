import fs from "node:fs/promises";
import process from "node:process";
import { Client } from "pg";

const databaseUrl =
  process.env.TALENCE_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const files = process.argv.slice(2);

if (files.length === 0) {
  throw new Error("Pass one or more pgTAP .test.sql files.");
}

const client = new Client({ connectionString: databaseUrl });
await client.connect();
await client.query(
  "create extension if not exists pgtap with schema extensions; set search_path = public, extensions, pg_catalog",
);

let failed = false;
try {
  for (const file of files) {
    const sql = await fs.readFile(file, "utf8");
    const results = await client.query(sql);
    const resultList = Array.isArray(results) ? results : [results];
    const tapLines = resultList.flatMap((result) =>
      (result.rows ?? []).flatMap((row) =>
        Object.values(row).filter((value) => typeof value === "string"),
      ),
    );
    const failures = tapLines.filter((line) => line.startsWith("not ok "));
    process.stdout.write(`${file}\n`);
    for (const line of tapLines) {
      if (/^(?:ok|not ok|1\.\.|#)/.test(line)) {
        process.stdout.write(`${line}\n`);
      }
    }
    if (failures.length > 0) {
      failed = true;
    }
  }
} finally {
  await client.end();
}

if (failed) {
  process.exitCode = 1;
}
