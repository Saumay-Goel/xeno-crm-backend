import { prisma } from "../config/db.js";
import type { Rule, Condition, Group } from "../types/segment.types.js";
import { isGroup } from "../types/segment.types.js";

interface CustomerMetrics {
  id: string;
  name: string;
  email: string;
  city: string | null;
  signupSource: string | null;
  totalSpend: number;
  orderCount: number;
  daysSinceLastOrder: number | null;
}

async function loadCustomerMetrics(): Promise<CustomerMetrics[]> {
  const customers = await prisma.customer.findMany({
    include: { orders: { select: { amount: true, orderedAt: true } } },
  });

  const now = Date.now();
  return customers.map((c) => {
    const totalSpend = c.orders.reduce((sum, o) => sum + Number(o.amount), 0);
    const orderCount = c.orders.length;
    let daysSinceLastOrder: number | null = null;
    if (orderCount > 0) {
      const last = Math.max(...c.orders.map((o) => o.orderedAt.getTime()));
      daysSinceLastOrder = Math.floor((now - last) / (1000 * 60 * 60 * 24));
    }
    return {
      id: c.id,
      name: c.name,
      email: c.email,
      city: c.city,
      signupSource:
        ((c.attributes as Record<string, unknown>)?.signupSource as string) ??
        null,
      totalSpend,
      orderCount,
      daysSinceLastOrder,
    };
  });
}

function getFieldValue(
  m: CustomerMetrics,
  field: Condition["field"],
): string | number | null {
  switch (field) {
    case "total_spend":
      return m.totalSpend;
    case "order_count":
      return m.orderCount;
    case "days_since_last_order":
      return m.daysSinceLastOrder;
    case "city":
      return m.city;
    case "signup_source":
      return m.signupSource;
  }
}

function evalCondition(m: CustomerMetrics, cond: Condition): boolean {
  const actual = getFieldValue(m, cond.field);
  if (actual === null) return false;

  const { op, value } = cond;
  switch (op) {
    case "eq":
      return actual === value;
    case "neq":
      return actual !== value;
    case "gt":
      return Number(actual) > Number(value);
    case "gte":
      return Number(actual) >= Number(value);
    case "lt":
      return Number(actual) < Number(value);
    case "lte":
      return Number(actual) <= Number(value);
    case "in":
      return Array.isArray(value) && value.includes(actual as string | number);
  }
}

function evalRule(m: CustomerMetrics, rule: Rule): boolean {
  if (isGroup(rule)) {
    const group = rule as Group;
    return group.combinator === "and"
      ? group.rules.every((r) => evalRule(m, r))
      : group.rules.some((r) => evalRule(m, r));
  }
  return evalCondition(m, rule as Condition);
}

export async function evaluateSegment(rules: Rule): Promise<CustomerMetrics[]> {
  const all = await loadCustomerMetrics();
  return all.filter((m) => evalRule(m, rules));
}

export async function previewSegment(rules: Rule, limit = 10) {
  const matches = await evaluateSegment(rules);
  return {
    count: matches.length,
    preview: matches.slice(0, limit).map((m) => ({
      id: m.id,
      name: m.name,
      email: m.email,
      city: m.city,
      totalSpend: m.totalSpend,
      orderCount: m.orderCount,
      daysSinceLastOrder: m.daysSinceLastOrder,
    })),
  };
}

export async function createSegment(userId: string, name: string, rules: Rule) {
  return prisma.segment.create({
    data: { userId, name, rules: rules as object },
  });
}

export async function listSegments(userId: string) {
  return prisma.segment.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
}

export async function getSegment(id: string, userId: string) {
  return prisma.segment.findFirst({ where: { id, userId } });
}
