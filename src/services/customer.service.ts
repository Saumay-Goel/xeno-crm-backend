import { prisma } from "../config/db.js";
import { Prisma } from "@prisma/client";

interface ListParams {
  page: number;
  pageSize: number;
  search?: string;
  city?: string;
}

export async function listCustomers({
  page,
  pageSize,
  search,
  city,
}: ListParams) {
  const where: Prisma.CustomerWhereInput = {
    ...(city ? { city } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { email: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [total, customers] = await Promise.all([
    prisma.customer.count({ where }),
    prisma.customer.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { orders: true } },
        orders: { select: { amount: true } },
      },
    }),
  ]);

  // Shape the response: collapse orders into count + total spend.
  const data = customers.map((c) => {
    const totalSpend = c.orders.reduce((sum, o) => sum + Number(o.amount), 0);
    return {
      id: c.id,
      name: c.name,
      email: c.email,
      phone: c.phone,
      city: c.city,
      attributes: c.attributes,
      createdAt: c.createdAt,
      orderCount: c._count.orders,
      totalSpend,
    };
  });

  return {
    data,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

export async function getCustomerById(id: string) {
  const customer = await prisma.customer.findUnique({
    where: { id },
    include: { orders: { orderBy: { orderedAt: "desc" } } },
  });
  if (!customer) return null;

  const totalSpend = customer.orders.reduce(
    (sum, o) => sum + Number(o.amount),
    0,
  );
  return { ...customer, totalSpend, orderCount: customer.orders.length };
}
