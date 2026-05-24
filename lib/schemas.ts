import { z } from "zod";

// ─── Request schemas ────────────────────────────────────────────────────────

export const ReserveRequestSchema = z.object({
  productId: z.string().min(1, "productId is required"),
  warehouseId: z.string().min(1, "warehouseId is required"),
  quantity: z.number().int().positive("quantity must be a positive integer"),
});
export type ReserveRequest = z.infer<typeof ReserveRequestSchema>;

// ─── Response shapes ────────────────────────────────────────────────────────

export const ReservationStatusEnum = z.enum(["PENDING", "CONFIRMED", "RELEASED"]);
export type ReservationStatus = z.infer<typeof ReservationStatusEnum>;

export const ReservationSchema = z.object({
  id: z.string(),
  productId: z.string(),
  warehouseId: z.string(),
  quantity: z.number(),
  status: ReservationStatusEnum,
  expiresAt: z.string().datetime(),
  confirmedAt: z.string().datetime().nullable(),
  releasedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});
export type Reservation = z.infer<typeof ReservationSchema>;

export const WarehouseStockSchema = z.object({
  warehouseId: z.string(),
  warehouseName: z.string(),
  warehouseLocation: z.string(),
  totalUnits: z.number(),
  reservedUnits: z.number(),
  availableUnits: z.number(),
});
export type WarehouseStock = z.infer<typeof WarehouseStockSchema>;

export const ProductSchema = z.object({
  id: z.string(),
  name: z.string(),
  sku: z.string(),
  description: z.string(),
  imageUrl: z.string(),
  stock: z.array(WarehouseStockSchema),
});
export type Product = z.infer<typeof ProductSchema>;

export const WarehouseSchema = z.object({
  id: z.string(),
  name: z.string(),
  location: z.string(),
});
export type Warehouse = z.infer<typeof WarehouseSchema>;

// ─── API error shape ─────────────────────────────────────────────────────────

export interface ApiError {
  error: string;
  code?: string;
}
