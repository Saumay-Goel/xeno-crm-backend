import { prisma } from "../config/db.js";

function normalizeKey(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export async function getDatasetRows(
  id: string,
  userId: string,
  page = 1,
  pageSize = 50,
) {
  const ds = await prisma.dataset.findFirst({ where: { id, userId } });
  if (!ds) return null;

  const [rows, total] = await Promise.all([
    prisma.datasetRow.findMany({
      where: { datasetId: id },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.datasetRow.count({ where: { datasetId: id } }),
  ]);

  return {
    rows: rows.map((r) => r.data as Record<string, unknown>),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

function inferType(values: string[]): "number" | "date" | "boolean" | "string" {
  const sample = values.filter((v) => v != null && v !== "").slice(0, 50);
  if (sample.length === 0) return "string";

  const allNumbers = sample.every((v) => !isNaN(Number(v)));
  if (allNumbers) return "number";

  const allBool = sample.every((v) =>
    ["true", "false", "yes", "no", "0", "1"].includes(v.toLowerCase()),
  );
  if (allBool) return "boolean";

  const allDates = sample.every((v) => !isNaN(Date.parse(v)));
  if (allDates) return "date";

  return "string";
}

export async function createDatasetFromRows(
  userId: string,
  name: string,
  headers: string[],
  rows: Record<string, string>[],
) {
  const keys = headers.map(normalizeKey);

  const columns = headers.map((header, i) => {
    const key = keys[i];
    const colValues = rows.map((r) => r[header]).filter(Boolean);
    return {
      name: header,
      key,
      type: inferType(colValues as string[]),
      position: i,
      sampleValues: [...new Set(colValues)].slice(0, 5) as string[],
    };
  });

  const jsonRows = rows.map((r) => {
    const obj: Record<string, unknown> = {};
    headers.forEach((header, i) => {
      const key = keys[i];
      const raw = r[header];
      const col = columns[i];
      if (raw == null || raw === "") {
        obj[key] = null;
      } else if (col.type === "number") {
        obj[key] = Number(raw);
      } else if (col.type === "boolean") {
        obj[key] = ["true", "yes", "1"].includes(String(raw).toLowerCase());
      } else {
        obj[key] = raw;
      }
    });
    return obj;
  });

  const dataset = await prisma.dataset.create({
    data: {
      userId,
      name,
      rowCount: jsonRows.length,
      columns: { create: columns },
      rows: { create: jsonRows.map((data) => ({ data: data as object })) },
    },
    include: { columns: true },
  });

  return dataset;
}

export async function listDatasets(userId: string) {
  return prisma.dataset.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: { columns: true },
  });
}

export async function getDataset(id: string, userId: string) {
  return prisma.dataset.findFirst({
    where: { id, userId },
    include: { columns: true },
  });
}

export async function deleteDataset(id: string, userId: string) {
  const result = await prisma.dataset.deleteMany({ where: { id, userId } });
  return result.count > 0;
}

export function buildSchemaPrompt(
  datasetId: string,
  datasetName: string,
  columns: {
    name: string;
    key: string;
    type: string;
    sampleValues: string[];
  }[],
): string {
  const cols = columns
    .map((c) => {
      const samples = c.sampleValues.length
        ? ` — e.g. ${c.sampleValues.slice(0, 4).join(", ")}`
        : "";
      return `  ${c.key} (${c.type})${samples}`;
    })
    .join("\n");

  return `You are querying the user's dataset named "${datasetName}".

IMPORTANT: When the user refers to "${datasetName}", "@${datasetName}", "this dataset", "the data", "these customers", "all customers", or "everyone", they mean ALL rows in this dataset. NEVER treat the dataset name (or an @tag of it) as a filter value, a city, or a name to match — it is just the container being queried.

The data is a single table "dataset_rows". Each row has a JSONB column "data" with these fields:
${cols}

QUERYING RULES:
- Access fields with data->>'key'. e.g. data->>'name'
- Cast numbers: (data->>'spend')::numeric. Cast dates: (data->>'signup_date')::timestamp.
- Use ILIKE for case-insensitive text matching.
- ALWAYS include: WHERE dataset_id = '${datasetId}'
- Alias outputs with clean names, e.g. data->>'name' AS name.
- To return ALL rows (e.g. "give all customers"), select the columns with no extra filter beyond the dataset_id.

EXAMPLE (specific filter):
SELECT data->>'name' AS name, data->>'city' AS city, (data->>'spend')::numeric AS spend
FROM dataset_rows
WHERE dataset_id = '${datasetId}' AND data->>'city' ILIKE 'Mumbai' AND (data->>'spend')::numeric > 5000

EXAMPLE (all rows):
SELECT data->>'name' AS name, data->>'city' AS city
FROM dataset_rows
WHERE dataset_id = '${datasetId}'`;
}

export interface ContactCandidate {
  key: string;
  name: string;
  kind: "email" | "phone";
  confidence: number;
}

export function detectContactColumns(
  columns: {
    name: string;
    key: string;
    type: string;
    sampleValues: string[];
  }[],
): ContactCandidate[] {
  const candidates: ContactCandidate[] = [];

  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const phoneRe = /[\d][\d\s\-().+x]{6,}/;

  for (const col of columns) {
    const key = col.key.toLowerCase();
    const name = col.name.toLowerCase();
    const samples = col.sampleValues.filter(Boolean);

    const nameHintsEmail = /e-?mail/.test(key) || /e-?mail/.test(name);
    const samplesLookEmail =
      samples.length > 0 && samples.every((v) => emailRe.test(String(v)));
    if (nameHintsEmail || samplesLookEmail) {
      candidates.push({
        key: col.key,
        name: col.name,
        kind: "email",
        confidence: (nameHintsEmail ? 0.5 : 0) + (samplesLookEmail ? 0.5 : 0),
      });
      continue;
    }

    if (col.type === "date") continue;

    const nameHintsPhone =
      /phone|mobile|cell|tel|contact|whatsapp|msisdn/.test(key) ||
      /phone|mobile|cell|tel/.test(name);
    const samplesLookPhone =
      samples.length > 0 &&
      samples.every((v) => phoneRe.test(String(v))) &&
      samples.some((v) => /[()+x]|\d{3,}[-.\s]\d{3,}/.test(String(v)));
    if (nameHintsPhone || samplesLookPhone) {
      candidates.push({
        key: col.key,
        name: col.name,
        kind: "phone",
        confidence: (nameHintsPhone ? 0.5 : 0) + (samplesLookPhone ? 0.5 : 0),
      });
    }
  }

  return candidates.sort((a, b) => b.confidence - a.confidence);
}
