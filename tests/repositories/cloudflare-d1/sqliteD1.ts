import type { DatabaseSync } from "node:sqlite";
import type {
  D1Database,
  D1PreparedStatement,
  D1Result,
  D1Value,
} from "../../../src/workers/api/types";

type SqliteValue = bigint | null | number | string;

export function createSqliteD1(db: DatabaseSync): D1Database {
  return {
    batch: async <T = unknown>(statements: D1PreparedStatement[]) => {
      db.exec("BEGIN TRANSACTION");
      try {
        const results: D1Result<T>[] = [];
        for (const statement of statements) {
          results.push(await statement.run<T>());
        }
        db.exec("COMMIT");
        return results;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
    exec: async (query) => {
      db.exec(query);
      return { success: true };
    },
    prepare: (query) => createStatement(db, query),
  };
}

function createStatement(
  db: DatabaseSync,
  query: string,
  values: D1Value[] = [],
): D1PreparedStatement {
  const sqliteValues = values.map(toSqliteValue);

  return {
    all: async <T = unknown>() => {
      const results = db.prepare(query).all(...sqliteValues) as T[];
      return { results, success: true } satisfies D1Result<T>;
    },
    bind: (...nextValues) => createStatement(db, query, nextValues),
    first: async <T = unknown>() =>
      (db.prepare(query).get(...sqliteValues) as T | undefined) ?? null,
    raw: async <_T = unknown>() => {
      throw new Error("raw is not implemented in this test adapter");
    },
    run: async <T = unknown>() => {
      const result = db.prepare(query).run(...sqliteValues) as { changes?: bigint | number };
      return {
        meta: { changes: Number(result.changes ?? 0) },
        success: true,
      } satisfies D1Result<T>;
    },
  };
}

function toSqliteValue(value: D1Value): SqliteValue {
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }

  if (value instanceof ArrayBuffer) {
    throw new Error("ArrayBuffer values are not implemented in this test adapter");
  }

  return value;
}
