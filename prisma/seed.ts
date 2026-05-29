import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

const DEMO_PASSWORD = "password123";

interface SeedWorker {
  email: string;
  name: string;
}

const DEMO_WORKERS: SeedWorker[] = [
  { email: "worker@demo.local", name: "Demo Worker" },
  { email: "alex@demo.local", name: "Alex Student" },
  { email: "sam@demo.local", name: "Sam Flexi" },
];

/**
 * Builds a Date offset from a base reference at the given hour and minute.
 */
function dateAt(base: Date, dayOffset: number, hour: number, minute = 0): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, minute, 0, 0);
  return d;
}

async function main() {
  const passwordHash = await hash(DEMO_PASSWORD, 12);

  const owner = await prisma.user.upsert({
    where: { email: "owner@demo.local" },
    update: { passwordHash, name: "Demo Owner", role: "OWNER" },
    create: {
      email: "owner@demo.local",
      passwordHash,
      name: "Demo Owner",
      role: "OWNER",
    },
  });

  const business = await prisma.business.upsert({
    where: { ownerId: owner.id },
    update: { name: "Demo Bistro" },
    create: { name: "Demo Bistro", ownerId: owner.id },
  });

  await prisma.user.update({
    where: { id: owner.id },
    data: { businessId: business.id },
  });

  const workers = await Promise.all(
    DEMO_WORKERS.map((w) =>
      prisma.user.upsert({
        where: { email: w.email },
        update: {
          passwordHash,
          name: w.name,
          role: "WORKER",
          businessId: business.id,
        },
        create: {
          email: w.email,
          passwordHash,
          name: w.name,
          role: "WORKER",
          businessId: business.id,
        },
      }),
    ),
  );

  // Membership is the source of truth for "who belongs to a business" — the
  // legacy User.businessId column alone is no longer enough (e.g. assignment
  // requires an active membership). Mirror the role for the owner and workers.
  await Promise.all(
    [
      { userId: owner.id, role: "OWNER" as const },
      ...workers.map((w) => ({ userId: w.id, role: "WORKER" as const })),
    ].map(({ userId, role }) =>
      prisma.membership.upsert({
        where: { userId_businessId: { userId, businessId: business.id } },
        update: { role, status: "ACTIVE" },
        create: { userId, businessId: business.id, role, status: "ACTIVE" },
      }),
    ),
  );

  await prisma.shift.deleteMany({ where: { businessId: business.id } });
  await prisma.availability.deleteMany({
    where: { userId: { in: workers.map((w) => w.id) } },
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const ROLES = ["Barista", "Waiter", "Bartender", "Kitchen helper"] as const;
  const SHIFT_TEMPLATES = [
    { startHour: 8, endHour: 12, spots: 2 },
    { startHour: 12, endHour: 18, spots: 2 },
    { startHour: 18, endHour: 23, spots: 3 },
  ];

  const shiftCreations: Promise<unknown>[] = [];
  const now = new Date();
  for (let day = 1; day <= 14; day++) {
    SHIFT_TEMPLATES.forEach((tpl, idx) => {
      const role = ROLES[(day + idx) % ROLES.length] ?? "Barista";
      // Publish everything except the final day, which stays a draft so the
      // owner can still see the publish workflow (workers only see published
      // shifts).
      const isDraft = day === 14;
      shiftCreations.push(
        prisma.shift.create({
          data: {
            businessId: business.id,
            startsAt: dateAt(today, day, tpl.startHour),
            endsAt: dateAt(today, day, tpl.endHour),
            roleLabel: role,
            requiredSpots: tpl.spots,
            notes: idx === 0 ? "Opening shift" : undefined,
            publishedAt: isDraft ? null : now,
            publishedById: isDraft ? null : owner.id,
          },
        }),
      );
    });
  }
  await Promise.all(shiftCreations);

  await prisma.availability.createMany({
    data: workers.flatMap((worker, workerIdx) =>
      [2, 5, 9].map((dayOffset) => ({
        userId: worker.id,
        startsAt: dateAt(today, dayOffset + workerIdx, 9),
        endsAt: dateAt(today, dayOffset + workerIdx, 17),
      })),
    ),
  });

  console.log("\n=== Seed complete ===\n");
  console.log(`Business: ${business.name} (id: ${business.id})`);
  console.log(`\nDemo accounts (password: ${DEMO_PASSWORD}):`);
  console.log(`  OWNER  ${owner.email}`);
  workers.forEach((w) => console.log(`  WORKER ${w.email}`));
  console.log(
    `\nCreated ${shiftCreations.length} shifts across the next 14 days.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
