import { z } from "zod";

const fieldEnum = z.enum([
  "total_spend",
  "order_count",
  "days_since_last_order",
  "city",
  "signup_source",
  "name",
  "email",
]);

const operatorEnum = z.enum([
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "in",
  "contains",
]);

const conditionSchema = z.object({
  field: fieldEnum,
  op: operatorEnum,
  value: z.union([
    z.string(),
    z.number(),
    z.array(z.union([z.string(), z.number()])),
  ]),
});

export const ruleSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    conditionSchema,
    z.object({
      combinator: z.enum(["and", "or"]),
      rules: z.array(ruleSchema).min(1),
    }),
  ]),
);
