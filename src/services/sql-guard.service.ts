const FORBIDDEN = [
  "insert",
  "update",
  "delete",
  "drop",
  "truncate",
  "alter",
  "create",
  "grant",
  "revoke",
  "comment",
  "copy",
  "vacuum",
  "reindex",
  "call",
  "do",
  "execute",
  "merge",
  "replace",
  "into ",
  "set ",
];

export function assertSafeSelect(sql: string): string {
  const trimmed = sql.trim().replace(/;+\s*$/, "");

  if (trimmed.includes(";")) {
    throw new Error("Only a single statement is allowed.");
  }

  const lower = trimmed.toLowerCase();

  if (!/^\s*(select|with)\b/.test(lower)) {
    throw new Error("Only SELECT queries are allowed.");
  }

  for (const kw of FORBIDDEN) {
    const pattern = new RegExp(`\\b${kw.trim()}\\b`, "i");
    if (pattern.test(lower)) {
      throw new Error(`Query contains a forbidden keyword: ${kw.trim()}`);
    }
  }

  return trimmed;
}

export function enforceLimit(sql: string, max = 100): string {
  return `SELECT * FROM (${sql}) AS ai_query LIMIT ${max}`;
}
