import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
  const adapter = new PrismaPg(process.env.DATABASE_URL!);
  const prisma = new PrismaClient({ adapter });


  console.log("🌱 Seeding database...");

  // Create warehouses
  const warehouseNYC = await prisma.warehouse.upsert({
    where: { id: "wh-nyc-001" },
    update: {},
    create: {
      id: "wh-nyc-001",
      name: "NYC Fulfillment Center",
      location: "New York, NY",
    },
  });

  const warehouseLA = await prisma.warehouse.upsert({
    where: { id: "wh-la-001" },
    update: {},
    create: {
      id: "wh-la-001",
      name: "LA Distribution Hub",
      location: "Los Angeles, CA",
    },
  });

  console.log(`✅ Warehouses: ${warehouseNYC.name}, ${warehouseLA.name}`);

  // Create products
  const tshirt = await prisma.product.upsert({
    where: { sku: "APP-TS-001" },
    update: {},
    create: {
      id: "prod-ts-001",
      name: "Classic Crew Tee",
      sku: "APP-TS-001",
      description:
        "Premium 100% organic cotton crew neck t-shirt. Relaxed fit, ultra-soft feel. Available in multiple colors.",
      imageUrl: "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=600&q=80",
    },
  });

  const hoodie = await prisma.product.upsert({
    where: { sku: "APP-HD-001" },
    update: {},
    create: {
      id: "prod-hd-001",
      name: "Essential Pullover Hoodie",
      sku: "APP-HD-001",
      description:
        "Heavyweight fleece pullover hoodie with kangaroo pocket. Pre-shrunk, pill-resistant fabric.",
      imageUrl: "https://images.unsplash.com/photo-1556821840-3a63f15732ce?w=600&q=80",
    },
  });

  const sneakers = await prisma.product.upsert({
    where: { sku: "FTW-SN-001" },
    update: {},
    create: {
      id: "prod-sn-001",
      name: "Urban Runner Sneakers",
      sku: "FTW-SN-001",
      description:
        "Lightweight mesh upper with responsive foam cushioning. Breathable and durable for everyday wear.",
      imageUrl: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600&q=80",
    },
  });

  const cap = await prisma.product.upsert({
    where: { sku: "ACC-CP-001" },
    update: {},
    create: {
      id: "prod-cp-001",
      name: "Structured Baseball Cap",
      sku: "ACC-CP-001",
      description:
        "6-panel structured cap with embroidered logo. Adjustable strap, one size fits most.",
      imageUrl: "https://images.unsplash.com/photo-1588850561407-ed78c282e89b?w=600&q=80",
    },
  });

  console.log(`✅ Products: ${tshirt.name}, ${hoodie.name}, ${sneakers.name}, ${cap.name}`);

  // Create stock levels
  // T-shirt: plenty in NYC, low in LA
  await prisma.warehouseStock.upsert({
    where: { productId_warehouseId: { productId: tshirt.id, warehouseId: warehouseNYC.id } },
    update: {},
    create: {
      productId: tshirt.id,
      warehouseId: warehouseNYC.id,
      totalUnits: 48,
      reservedUnits: 0,
    },
  });
  await prisma.warehouseStock.upsert({
    where: { productId_warehouseId: { productId: tshirt.id, warehouseId: warehouseLA.id } },
    update: {},
    create: {
      productId: tshirt.id,
      warehouseId: warehouseLA.id,
      totalUnits: 12,
      reservedUnits: 0,
    },
  });

  // Hoodie: moderate stock both
  await prisma.warehouseStock.upsert({
    where: { productId_warehouseId: { productId: hoodie.id, warehouseId: warehouseNYC.id } },
    update: {},
    create: {
      productId: hoodie.id,
      warehouseId: warehouseNYC.id,
      totalUnits: 25,
      reservedUnits: 0,
    },
  });
  await prisma.warehouseStock.upsert({
    where: { productId_warehouseId: { productId: hoodie.id, warehouseId: warehouseLA.id } },
    update: {},
    create: {
      productId: hoodie.id,
      warehouseId: warehouseLA.id,
      totalUnits: 18,
      reservedUnits: 0,
    },
  });

  // Sneakers: 1 unit in NYC (great for race condition demo!), none in LA
  await prisma.warehouseStock.upsert({
    where: { productId_warehouseId: { productId: sneakers.id, warehouseId: warehouseNYC.id } },
    update: {},
    create: {
      productId: sneakers.id,
      warehouseId: warehouseNYC.id,
      totalUnits: 1,
      reservedUnits: 0,
    },
  });
  await prisma.warehouseStock.upsert({
    where: { productId_warehouseId: { productId: sneakers.id, warehouseId: warehouseLA.id } },
    update: {},
    create: {
      productId: sneakers.id,
      warehouseId: warehouseLA.id,
      totalUnits: 8,
      reservedUnits: 0,
    },
  });

  // Cap: only in LA
  await prisma.warehouseStock.upsert({
    where: { productId_warehouseId: { productId: cap.id, warehouseId: warehouseLA.id } },
    update: {},
    create: {
      productId: cap.id,
      warehouseId: warehouseLA.id,
      totalUnits: 35,
      reservedUnits: 0,
    },
  });

  console.log("✅ Stock levels seeded");
  console.log("");
  console.log("🎉 Seed complete! Try reserving the last Urban Runner Sneaker in NYC to demo the race condition protection.");

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
