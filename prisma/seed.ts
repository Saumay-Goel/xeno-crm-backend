import "dotenv/config";
import { faker } from "@faker-js/faker";
import { prisma } from "../src/config/db.js";

declare const process: { exit(code?: number): never };

const CITIES = [
  "Mumbai",
  "Delhi",
  "Bangalore",
  "Chennai",
  "Hyderabad",
  "Pune",
  "Kolkata",
  "Ahmedabad",
];

const CATALOG: Array<{ name: string; category: string; price: number }> = [
  { name: "Cold Brew Pack", category: "coffee", price: 450 },
  { name: "Espresso Beans 250g", category: "coffee", price: 600 },
  { name: "Latte Subscription", category: "coffee", price: 1200 },
  { name: "Ceramic Mug", category: "merch", price: 350 },
  { name: "Tote Bag", category: "merch", price: 500 },
  { name: "Hoodie", category: "apparel", price: 1800 },
  { name: "Cap", category: "apparel", price: 700 },
  { name: "Gift Card", category: "gifting", price: 1000 },
  { name: "Sampler Box", category: "gifting", price: 1500 },
];

const CUSTOMER_COUNT = 500;

/**
 * We bucket customers into behavioural archetypes so segments have something to bite on.
 * Each archetype controls how many orders they place and how recently.
 */
type Archetype = {
  weight: number; // relative frequency
  minOrders: number;
  maxOrders: number;
  recencyDaysMax: number; // most recent order within N days
};

const ARCHETYPES: Archetype[] = [
  { weight: 0.25, minOrders: 5, maxOrders: 15, recencyDaysMax: 20 }, // loyal, active high-spenders
  { weight: 0.3, minOrders: 2, maxOrders: 5, recencyDaysMax: 60 }, // regulars
  { weight: 0.25, minOrders: 1, maxOrders: 3, recencyDaysMax: 180 }, // lapsing
  { weight: 0.15, minOrders: 1, maxOrders: 2, recencyDaysMax: 400 }, // dormant (great re-engagement targets)
  { weight: 0.05, minOrders: 0, maxOrders: 0, recencyDaysMax: 0 }, // never purchased
];

function pickArchetype(): Archetype {
  const r = Math.random();
  let cumulative = 0;
  for (const a of ARCHETYPES) {
    cumulative += a.weight;
    if (r <= cumulative) return a;
  }
  return ARCHETYPES[ARCHETYPES.length - 1];
}

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

async function main() {
  console.log("🌱 Seeding...");

  // Clean slate — order matters because of FKs.
  await prisma.receipt.deleteMany();
  await prisma.communication.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.segment.deleteMany();
  await prisma.order.deleteMany();
  await prisma.customer.deleteMany();

  let totalOrders = 0;

  for (let i = 0; i < CUSTOMER_COUNT; i++) {
    const archetype = pickArchetype();
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();

    const customer = await prisma.customer.create({
      data: {
        name: `${firstName} ${lastName}`,
        // Unique email — append index to avoid Faker collisions across 500 rows.
        email: faker.internet
          .email({ firstName, lastName })
          .toLowerCase()
          .replace("@", `${i}@`),
        phone: `+9198${faker.string.numeric(8)}`,
        city: faker.helpers.arrayElement(CITIES),
        attributes: {
          gender: faker.helpers.arrayElement(["male", "female", "other"]),
          signupSource: faker.helpers.arrayElement([
            "organic",
            "ads",
            "referral",
          ]),
        },
      },
    });

    const orderCount = faker.number.int({
      min: archetype.minOrders,
      max: archetype.maxOrders,
    });

    for (let j = 0; j < orderCount; j++) {
      // Spread each order's date between the customer's recency window and ~1.5y back.
      const orderedDaysAgo = faker.number.int({
        min: j === 0 ? 0 : 1, // the most recent order lands near "now" for active archetypes
        max: archetype.recencyDaysMax || 1,
      });

      const lineItems = faker.helpers.arrayElements(
        CATALOG,
        faker.number.int({ min: 1, max: 3 }),
      );
      const items = lineItems.map((p) => ({
        name: p.name,
        category: p.category,
        qty: faker.number.int({ min: 1, max: 3 }),
      }));
      const amount = items.reduce((sum, it) => {
        const cat = CATALOG.find((c) => c.name === it.name)!;
        return sum + cat.price * it.qty;
      }, 0);

      await prisma.order.create({
        data: {
          customerId: customer.id,
          amount: amount.toFixed(2),
          items,
          orderedAt: daysAgo(orderedDaysAgo),
        },
      });
      totalOrders++;
    }
  }

  console.log(
    `✅ Seeded ${CUSTOMER_COUNT} customers and ${totalOrders} orders`,
  );
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("❌ Seed failed:", e);
  await prisma.$disconnect();
  process.exit(1);
});
