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
  { code: "YETEX", name: "Holiday Inn Express & Suites Edson" },
];
const ADMIN_EMAIL = "admin@example.com";
const ADMIN_PASSWORD = "ChangeMe123!";

// Two-level category hierarchy per department: group name -> subcategory names.
const CATEGORY_STRUCTURE: Record<string, Record<string, string[]>> = {
  ENGINEERING: {
    "HVAC & R": ["Consumables", "Spares"],
    "Electrical & Lighting Supplies": ["Lighting", "Wiring & Controls"],
    "Plumbing & Water Systems": ["Fixtures", "Pipes & Fittings", "Water Treatment"],
    "Mechanical & Plant Room Equipment": ["Boiler & Pumps", "Elevator / Lift"],
    "Carpentry, Hardware & Building Fabric": ["Hardware", "Building Materials", "Finishes"],
    "Tools, Safety & PPE (OS&E)": ["Hand & Power Tools", "PPE", "Safety Gear"],
  },
  HOUSEKEEPING: {
    "Linen Inventory": ["Bed Linens", "Bath Linens", "Food & Beverage Linens"],
    "Guest Amenities & Toiletries": ["Personal Care", "Vanity Items"],
    "Cleaning Supplies & Chemicals": ["Chemicals", "Tools"],
    "In-Room Operational Supplies": ["Paper Products", "Room Essentials"],
  },
  GUEST_SERVICES: {
    "Front Desk & Concierge Supplies": ["Key Management", "Stationery & Printed Goods"],
    "Guest Convenience & Retail Items": ["Marketplace / Pantry Stock", "Branded Merchandise"],
    "Loaner Items & Guest Equipment": ["Room Additions", "Tech & Convenience"],
  },
  FOOD_BEVERAGE: {
    "Perishable & Non-Perishable Food": ["Fresh Stock", "Dry Goods"],
    Beverages: ["Alcoholic", "Non-Alcoholic"],
    "Serviceware & Operating Equipment (OS&E)": ["Chinaware", "Glassware", "Flatware / Cutlery", "Hollowware"],
    "Disposable & Takeout Supplies": ["Packaging", "Service Disposables"],
  },
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

  const categoriesByName: Record<string, { id: string }> = {};

  for (const dept of [engineering, ...otherDepartments]) {
    const groups = CATEGORY_STRUCTURE[dept.code] ?? {};
    for (const [groupName, subNames] of Object.entries(groups)) {
      const group = await prisma.category.upsert({
        where: { departmentId_name: { departmentId: dept.id, name: groupName } },
        update: {},
        create: { name: groupName, departmentId: dept.id },
      });
      categoriesByName[groupName] = group;

      for (const subName of subNames) {
        const sub = await prisma.category.upsert({
          where: { departmentId_name: { departmentId: dept.id, name: subName } },
          update: {},
          create: { name: subName, departmentId: dept.id, parentId: group.id },
        });
        categoriesByName[subName] = sub;
      }
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
      categoryId: categoriesByName["Consumables"].id,
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
      categoryId: categoriesByName["Pipes & Fittings"].id,
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
