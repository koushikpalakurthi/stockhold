import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { releaseExpiredReservations } from "@/lib/expiry";

export async function GET() {
  try {
    // Lazy cleanup: release expired reservations before computing available stock
    await releaseExpiredReservations();

    const products = await prisma.product.findMany({
      include: {
        stock: {
          include: {
            warehouse: true,
          },
        },
      },
      orderBy: { name: "asc" },
    });

    type ProductWithStock = (typeof products)[number];
    type StockWithWarehouse = ProductWithStock["stock"][number];

    const response = products.map((p: ProductWithStock) => ({
      id: p.id,
      name: p.name,
      sku: p.sku,
      description: p.description,
      imageUrl: p.imageUrl,
      stock: p.stock.map((s: StockWithWarehouse) => ({
        warehouseId: s.warehouseId,
        warehouseName: s.warehouse.name,
        warehouseLocation: s.warehouse.location,
        totalUnits: s.totalUnits,
        reservedUnits: s.reservedUnits,
        availableUnits: s.totalUnits - s.reservedUnits,
      })),
    }));

    return NextResponse.json(response);
  } catch (err) {
    console.error("[GET /api/products]", err);
    return NextResponse.json(
      { error: "Failed to fetch products" },
      { status: 500 }
    );
  }
}
