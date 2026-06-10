export type SegmentField =
  | "total_spend"
  | "order_count"
  | "days_since_last_order"
  | "city"
  | "signup_source";

export type Operator =
  | "eq" // =
  | "neq" // !=
  | "gt" // >
  | "gte" // >=
  | "lt" //
  | "lte" // <=
  | "in"; // value is an array, field must be one of them

export interface Condition {
  field: SegmentField;
  op: Operator;
  value: string | number | Array<string | number>;
}

export interface Group {
  combinator: "and" | "or";
  rules: Rule[];
}

export type Rule = Condition | Group;

export function isGroup(rule: Rule): rule is Group {
  return (rule as Group).combinator !== undefined;
}
