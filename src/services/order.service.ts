import { prisma } from "../config/db.js";

interface ListParams {
  page: number;
  pageSize: number;
  customerId?: string;
}

export async function listOrders({ page, pageSize, customerId }: ListParams) {
  const where = customerId ? { customerId } : {};

  const [total, orders] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { orderedAt: "desc" },
      include: { customer: { select: { id: true, name: true, email: true } } },
    }),
  ]);

  return {
    data: orders,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}
