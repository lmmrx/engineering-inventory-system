import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const HOTELS = [
  { code: "YQFES", name: "Holiday Inn Express Red Deer North" },
  { code: "YQFSB", name: "Staybridge Suites Red Deer" },
  { code: "YRDAB", name: "Holiday Inn Express Red Deer" },
  { code: "YRDWS", name: "Holiday Inn & Suites Red Deer South" },
  { code: "YHTSS", name: "Holiday Inn Express Hotel & Suites Hinton" },
  { code: "YHTCA", name: "Holiday Inn Hinton" },
  { code: "YHDEE", name: "Holiday Inn Express & Suites Edson" },
];
const ADMIN_EMAIL = "admin@example.com";
const ADMIN_PASSWORD = "ChangeMe123!";

const STARTER_CATEGORIES: Record<string, string[]> = {
  ENGINEERING: ["HVAC", "Plumbing", "Electrical", "General Maintenance", "Safety & PPE"],
  HOUSEKEEPING: ["Linens & Towels", "Cleaning Supplies", "Guest Amenities", "Laundry Chemicals", "Equipment"],
  GUEST_SERVICES: ["Front Desk Supplies", "Guest Amenities", "Stationery & Printing", "Lost & Found", "Uniforms"],
  FOOD_BEVERAGE: ["Kitchen Supplies", "Bar & Beverage", "Tableware & Linens", "Cleaning & Sanitation", "Disposables"],
};

async function main() {
  const engineering = await prisma.department.upsert({
    where: { code: "ENGINEERING" },
    update: {},
    create: { name: "Engineering", code: "ENGINEERING" },
  });

  const otherDepartments = await Promise.all(
    [
      { name: "Housekeeping", code: "HOUSEKEEPING" },
      { name: "Guest Services", code: "GUEST_SERVICES" },
      { name: "Food & Beverage", code: "FOOD_BEVERAGE" },
    ].map((dept) => prisma.department.upsert({ where: { code: dept.code }, update: {}, create: dept }))
  );

  for (const dept of [engineering, ...otherDepartments]) {
    for (const name of STARTER_CATEGORIES[dept.code] ?? []) {
      await prisma.category.upsert({
        where: { departmentId_name: { departmentId: dept.id, name } },
        update: {},
        create: { name, departmentId: dept.id },
      });
    }
  }

  const hotels = [];
  for (const { code, name } of HOTELS) {
    const hotel = await prisma.hotel.upsert({
      where: { code },
      update: { name },
      create: { name, code },
    });
    hotels.push(hotel);
  }

  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: {},
    create: {
      name: "System Admin",
      email: ADMIN_EMAIL,
      passwordHash,
      role: "ADMIN",
      departmentId: engineering.id,
    },
  });

  // A few starter items on the first hotel so the dashboard isn't empty on first login.
  const hvac = await prisma.category.findFirstOrThrow({
    where: { departmentId: engineering.id, name: "HVAC" },
  });
  const plumbing = await prisma.category.findFirstOrThrow({
    where: { departmentId: engineering.id, name: "Plumbing" },
  });
  await prisma.inventoryItem.upsert({
    where: { hotelId_sku: { hotelId: hotels[0].id, sku: "HVAC-FILTER-16x20" } },
    update: {},
    create: {
      name: "Air Filter 16x20",
      sku: "HVAC-FILTER-16x20",
      unit: "ea",
      quantityOnHand: 12,
      reorderPoint: 5,
      maxLevel: 40,
      hotelId: hotels[0].id,
      departmentId: engineering.id,
      categoryId: hvac.id,
    },
  });
  await prisma.inventoryItem.upsert({
    where: { hotelId_sku: { hotelId: hotels[0].id, sku: "PLB-WASHER-STD" } },
    update: {},
    create: {
      name: "Faucet Washer (standard)",
      sku: "PLB-WASHER-STD",
      unit: "box",
      quantityOnHand: 2,
      reorderPoint: 3,
      maxLevel: 20,
      hotelId: hotels[0].id,
      departmentId: engineering.id,
      categoryId: plumbing.id,
    },
  });

  console.log("Seed complete.");
  console.log(`Admin login -> email: ${ADMIN_EMAIL}  password: ${ADMIN_PASSWORD}`);
  console.log("Change this password after first login.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
