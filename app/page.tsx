"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { Product } from "@/lib/schemas";

// ─── Stock Badge ──────────────────────────────────────────────────────────────
function StockBadge({ available }: { available: number }) {
  if (available === 0)
    return <span className="badge badge-danger">Out of stock</span>;
  if (available <= 3)
    return (
      <span className="badge badge-warning">
        ⚡ {available} left
      </span>
    );
  return (
    <span className="badge badge-success">
      {available} available
    </span>
  );
}

// ─── Reserve Modal ────────────────────────────────────────────────────────────
interface ReserveModalProps {
  product: Product;
  onClose: () => void;
  onSuccess: (reservationId: string) => void;
}

function ReserveModal({ product, onClose, onSuccess }: ReserveModalProps) {
  const [selectedWarehouse, setSelectedWarehouse] = useState(
    product.stock.find((s) => s.availableUnits > 0)?.warehouseId ?? ""
  );
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedStock = product.stock.find(
    (s) => s.warehouseId === selectedWarehouse
  );
  const maxQty = selectedStock?.availableUnits ?? 0;

  async function handleReserve() {
    if (!selectedWarehouse || quantity < 1) return;
    setLoading(true);
    setError(null);

    // Generate idempotency key for this reservation attempt
    const idempotencyKey = `${product.id}-${selectedWarehouse}-${Date.now()}`;

    try {
      const res = await fetch("/api/reservations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          productId: product.id,
          warehouseId: selectedWarehouse,
          quantity,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 409) {
          setError(
            `❌ Not enough stock — only ${maxQty} unit${maxQty !== 1 ? "s" : ""} available at this warehouse.`
          );
        } else if (res.status === 429) {
          setError("⏳ High demand — please try again in a moment.");
        } else {
          setError(data.error ?? "Something went wrong. Please try again.");
        }
        return;
      }

      onSuccess(data.reservation.id);
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0,0,0,0.7)",
          backdropFilter: "blur(8px)",
        }}
      />

      {/* Modal */}
      <div
        className="glass-card animate-fade-in-up"
        style={{
          position: "relative",
          width: "100%",
          maxWidth: 460,
          padding: 32,
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: 24,
          }}
        >
          <div>
            <p
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "var(--brand-400)",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                marginBottom: 4,
              }}
            >
              Reserve Stock
            </p>
            <h2
              style={{
                fontSize: 20,
                fontWeight: 700,
                color: "var(--text-primary)",
                lineHeight: 1.2,
              }}
            >
              {product.name}
            </h2>
            <p
              style={{
                fontSize: 12,
                color: "var(--text-muted)",
                fontFamily: "'JetBrains Mono', monospace",
                marginTop: 4,
              }}
            >
              SKU: {product.sku}
            </p>
          </div>
          <button
            onClick={onClose}
            id="modal-close-btn"
            style={{
              background: "transparent",
              border: "1px solid var(--border)",
              borderRadius: 8,
              width: 32,
              height: 32,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--text-muted)",
              cursor: "pointer",
              fontSize: 16,
              flexShrink: 0,
            }}
          >
            ✕
          </button>
        </div>

        {/* Warehouse selector */}
        <div style={{ marginBottom: 20 }}>
          <label
            style={{
              display: "block",
              fontSize: 13,
              fontWeight: 500,
              color: "var(--text-secondary)",
              marginBottom: 8,
            }}
          >
            Warehouse
          </label>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {product.stock.map((s) => (
              <button
                key={s.warehouseId}
                id={`warehouse-btn-${s.warehouseId}`}
                disabled={s.availableUnits === 0}
                onClick={() => {
                  setSelectedWarehouse(s.warehouseId);
                  setQuantity(1);
                  setError(null);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "12px 16px",
                  border: `1px solid ${
                    selectedWarehouse === s.warehouseId
                      ? "var(--brand-500)"
                      : "var(--border)"
                  }`,
                  borderRadius: 10,
                  background:
                    selectedWarehouse === s.warehouseId
                      ? "rgba(99,102,241,0.1)"
                      : "transparent",
                  cursor: s.availableUnits === 0 ? "not-allowed" : "pointer",
                  opacity: s.availableUnits === 0 ? 0.5 : 1,
                  transition: "all 0.15s ease",
                  textAlign: "left",
                }}
              >
                <div>
                  <p
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color:
                        selectedWarehouse === s.warehouseId
                          ? "var(--brand-300)"
                          : "var(--text-primary)",
                    }}
                  >
                    {s.warehouseName}
                  </p>
                  <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    {s.warehouseLocation}
                  </p>
                </div>
                <StockBadge available={s.availableUnits} />
              </button>
            ))}
          </div>
        </div>

        {/* Quantity selector */}
        <div style={{ marginBottom: 24 }}>
          <label
            style={{
              display: "block",
              fontSize: 13,
              fontWeight: 500,
              color: "var(--text-secondary)",
              marginBottom: 8,
            }}
          >
            Quantity
          </label>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button
              id="qty-decrease"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              disabled={quantity <= 1}
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "transparent",
                color: quantity <= 1 ? "var(--text-muted)" : "var(--text-primary)",
                cursor: quantity <= 1 ? "not-allowed" : "pointer",
                fontSize: 18,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              −
            </button>
            <span
              style={{
                fontSize: 20,
                fontWeight: 700,
                color: "var(--text-primary)",
                minWidth: 32,
                textAlign: "center",
              }}
            >
              {quantity}
            </span>
            <button
              id="qty-increase"
              onClick={() => setQuantity((q) => Math.min(maxQty, q + 1))}
              disabled={quantity >= maxQty}
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "transparent",
                color: quantity >= maxQty ? "var(--text-muted)" : "var(--text-primary)",
                cursor: quantity >= maxQty ? "not-allowed" : "pointer",
                fontSize: 18,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              +
            </button>
          </div>
          {maxQty > 0 && (
            <p
              style={{
                fontSize: 12,
                color: "var(--text-muted)",
                marginTop: 6,
              }}
            >
              Max {maxQty} unit{maxQty !== 1 ? "s" : ""} from this warehouse
            </p>
          )}
        </div>

        {/* Error banner */}
        {error && (
          <div
            style={{
              background: "rgba(239, 68, 68, 0.1)",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              borderRadius: 10,
              padding: "12px 16px",
              marginBottom: 16,
              fontSize: 13,
              color: "#f87171",
            }}
          >
            {error}
          </div>
        )}

        {/* Expiry notice */}
        <div
          style={{
            background: "rgba(99, 102, 241, 0.05)",
            border: "1px solid rgba(99, 102, 241, 0.15)",
            borderRadius: 10,
            padding: "10px 14px",
            marginBottom: 20,
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 12,
            color: "var(--text-secondary)",
          }}
        >
          <span>⏱</span>
          <span>
            Held for <strong style={{ color: "var(--brand-300)" }}>10 minutes</strong>.
            Confirm payment before the timer expires or units are released.
          </span>
        </div>

        {/* Action buttons */}
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={onClose}
            style={{
              flex: 1,
              padding: "12px 20px",
              border: "1px solid var(--border)",
              borderRadius: 10,
              background: "transparent",
              color: "var(--text-secondary)",
              fontSize: 14,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            id="confirm-reserve-btn"
            onClick={handleReserve}
            disabled={loading || !selectedWarehouse || maxQty === 0}
            style={{
              flex: 2,
              padding: "12px 20px",
              border: "none",
              borderRadius: 10,
              background:
                loading || !selectedWarehouse || maxQty === 0
                  ? "rgba(99, 102, 241, 0.3)"
                  : "linear-gradient(135deg, #6366f1, #4f46e5)",
              color: "white",
              fontSize: 14,
              fontWeight: 600,
              cursor:
                loading || !selectedWarehouse || maxQty === 0
                  ? "not-allowed"
                  : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              boxShadow:
                loading || !selectedWarehouse || maxQty === 0
                  ? "none"
                  : "0 4px 20px rgba(99, 102, 241, 0.4)",
              transition: "all 0.2s ease",
            }}
          >
            {loading ? (
              <>
                <span
                  style={{
                    width: 14,
                    height: 14,
                    border: "2px solid rgba(255,255,255,0.3)",
                    borderTopColor: "white",
                    borderRadius: "50%",
                    animation: "spin 0.8s linear infinite",
                    display: "inline-block",
                  }}
                />
                Reserving…
              </>
            ) : (
              "Reserve Now →"
            )}
          </button>
        </div>

        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    </div>
  );
}

// ─── Product Card ─────────────────────────────────────────────────────────────
function ProductCard({
  product,
  onReserve,
}: {
  product: Product;
  onReserve: (p: Product) => void;
}) {
  const totalAvailable = product.stock.reduce(
    (sum, s) => sum + s.availableUnits,
    0
  );

  return (
    <div
      className="glass-card"
      style={{
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        transition: "transform 0.2s ease, box-shadow 0.2s ease",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.transform = "translateY(-4px)";
        (e.currentTarget as HTMLElement).style.boxShadow =
          "0 20px 60px rgba(0,0,0,0.4)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.transform = "translateY(0)";
        (e.currentTarget as HTMLElement).style.boxShadow = "none";
      }}
    >
      {/* Product image */}
      <div style={{ position: "relative", aspectRatio: "16/9", overflow: "hidden" }}>
        <img
          src={product.imageUrl}
          alt={product.name}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            transition: "transform 0.4s ease",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.transform = "scale(1.05)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.transform = "scale(1)";
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(to top, rgba(10,10,15,0.8) 0%, transparent 50%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: 12,
            right: 12,
          }}
        >
          {totalAvailable === 0 ? (
            <span className="badge badge-danger">Sold Out</span>
          ) : totalAvailable <= 5 ? (
            <span className="badge badge-warning">Low Stock</span>
          ) : null}
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: "20px", flex: 1, display: "flex", flexDirection: "column" }}>
        <div style={{ flex: 1 }}>
          <p
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "var(--brand-400)",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              marginBottom: 6,
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            {product.sku}
          </p>
          <h3
            style={{
              fontSize: 18,
              fontWeight: 700,
              color: "var(--text-primary)",
              marginBottom: 8,
              lineHeight: 1.2,
            }}
          >
            {product.name}
          </h3>
          <p
            style={{
              fontSize: 13,
              color: "var(--text-secondary)",
              lineHeight: 1.6,
              marginBottom: 16,
            }}
          >
            {product.description}
          </p>

          {/* Per-warehouse stock breakdown */}
          <div
            style={{
              borderTop: "1px solid var(--border-subtle)",
              paddingTop: 14,
              marginBottom: 16,
            }}
          >
            <p
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "var(--text-muted)",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                marginBottom: 8,
              }}
            >
              Warehouse Stock
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {product.stock.map((s) => (
                <div
                  key={s.warehouseId}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 12 }}>🏭</span>
                    <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                      {s.warehouseName}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <StockBadge available={s.availableUnits} />
                    {s.reservedUnits > 0 && (
                      <span
                        style={{
                          fontSize: 10,
                          color: "var(--text-muted)",
                          fontFamily: "'JetBrains Mono', monospace",
                        }}
                      >
                        ({s.reservedUnits} held)
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Reserve button */}
        <button
          id={`reserve-btn-${product.id}`}
          onClick={() => onReserve(product)}
          disabled={totalAvailable === 0}
          style={{
            width: "100%",
            padding: "12px",
            borderRadius: 10,
            border: "none",
            background:
              totalAvailable === 0
                ? "rgba(148, 163, 184, 0.1)"
                : "linear-gradient(135deg, #6366f1, #4f46e5)",
            color: totalAvailable === 0 ? "var(--text-muted)" : "white",
            fontSize: 14,
            fontWeight: 600,
            cursor: totalAvailable === 0 ? "not-allowed" : "pointer",
            transition: "all 0.2s ease",
            boxShadow:
              totalAvailable === 0
                ? "none"
                : "0 4px 16px rgba(99, 102, 241, 0.35)",
          }}
          onMouseEnter={(e) => {
            if (totalAvailable > 0) {
              (e.currentTarget as HTMLElement).style.boxShadow =
                "0 6px 24px rgba(99, 102, 241, 0.5)";
              (e.currentTarget as HTMLElement).style.transform = "translateY(-1px)";
            }
          }}
          onMouseLeave={(e) => {
            if (totalAvailable > 0) {
              (e.currentTarget as HTMLElement).style.boxShadow =
                "0 4px 16px rgba(99, 102, 241, 0.35)";
              (e.currentTarget as HTMLElement).style.transform = "translateY(0)";
            }
          }}
        >
          {totalAvailable === 0 ? "Out of Stock" : "Reserve →"}
        </button>
      </div>
    </div>
  );
}

// ─── Skeleton loader ──────────────────────────────────────────────────────────
function ProductSkeleton() {
  return (
    <div className="glass-card" style={{ overflow: "hidden" }}>
      <div className="skeleton" style={{ aspectRatio: "16/9", width: "100%" }} />
      <div style={{ padding: 20 }}>
        <div className="skeleton" style={{ height: 12, width: "40%", marginBottom: 10 }} />
        <div className="skeleton" style={{ height: 20, width: "70%", marginBottom: 10 }} />
        <div className="skeleton" style={{ height: 14, width: "90%", marginBottom: 6 }} />
        <div className="skeleton" style={{ height: 14, width: "60%", marginBottom: 20 }} />
        <div className="skeleton" style={{ height: 40, width: "100%" }} />
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function HomePage() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reservingProduct, setReservingProduct] = useState<Product | null>(null);

  const fetchProducts = useCallback(async () => {
    try {
      const res = await fetch("/api/products");
      if (!res.ok) throw new Error("Failed to load products");
      const data = await res.json();
      setProducts(data);
    } catch {
      setError("Failed to load products. Is the database connected?");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts();
    // Refresh every 30s so stock counts stay live
    const interval = setInterval(fetchProducts, 30_000);
    return () => clearInterval(interval);
  }, [fetchProducts]);

  return (
    <div style={{ maxWidth: 1280, margin: "0 auto", padding: "40px 24px" }}>
      {/* Hero */}
      <div
        className="animate-fade-in-up"
        style={{ marginBottom: 48, textAlign: "center" }}
      >
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            background: "rgba(99,102,241,0.1)",
            border: "1px solid rgba(99,102,241,0.25)",
            borderRadius: 100,
            padding: "6px 16px",
            marginBottom: 20,
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "#10b981",
              animation: "pulse-ring 2s infinite",
              display: "inline-block",
            }}
          />
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "var(--brand-300)",
              letterSpacing: "0.04em",
            }}
          >
            Real-time inventory — auto-refreshes every 30s
          </span>
        </div>

        <h1
          style={{
            fontSize: "clamp(32px, 5vw, 52px)",
            fontWeight: 800,
            letterSpacing: "-0.03em",
            lineHeight: 1.1,
            marginBottom: 16,
          }}
        >
          Multi-Warehouse{" "}
          <span className="gradient-text">Inventory</span>
        </h1>
        <p
          style={{
            fontSize: "clamp(15px, 2vw, 18px)",
            color: "var(--text-secondary)",
            maxWidth: 540,
            margin: "0 auto",
            lineHeight: 1.6,
          }}
        >
          Reserve stock at checkout. No oversell. Held for 10 minutes while
          payment processes — automatically released if abandoned.
        </p>
      </div>

      {/* Stats bar */}
      {!loading && !error && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 12,
            marginBottom: 40,
            maxWidth: 560,
            margin: "0 auto 40px",
          }}
        >
          {[
            { label: "Products", value: products.length },
            {
              label: "Total Available",
              value: products
                .flatMap((p) => p.stock)
                .reduce((s, st) => s + st.availableUnits, 0),
            },
            {
              label: "Currently Held",
              value: products
                .flatMap((p) => p.stock)
                .reduce((s, st) => s + st.reservedUnits, 0),
            },
          ].map((stat) => (
            <div
              key={stat.label}
              className="glass-card"
              style={{ padding: "16px", textAlign: "center" }}
            >
              <p
                style={{
                  fontSize: 24,
                  fontWeight: 800,
                  color: "var(--text-primary)",
                  letterSpacing: "-0.02em",
                }}
              >
                {stat.value}
              </p>
              <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                {stat.label}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Error state */}
      {error && (
        <div
          style={{
            background: "rgba(239, 68, 68, 0.1)",
            border: "1px solid rgba(239, 68, 68, 0.3)",
            borderRadius: 16,
            padding: "24px",
            textAlign: "center",
            color: "#f87171",
            marginBottom: 32,
          }}
        >
          <p style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
            ⚠️ Connection Error
          </p>
          <p style={{ fontSize: 14, opacity: 0.8 }}>{error}</p>
          <button
            onClick={fetchProducts}
            style={{
              marginTop: 16,
              padding: "8px 20px",
              background: "rgba(239,68,68,0.2)",
              border: "1px solid rgba(239,68,68,0.4)",
              borderRadius: 8,
              color: "#f87171",
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            Retry
          </button>
        </div>
      )}

      {/* Product grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
          gap: 24,
        }}
      >
        {loading
          ? Array.from({ length: 4 }).map((_, i) => <ProductSkeleton key={i} />)
          : products.map((product, i) => (
              <div
                key={product.id}
                className="animate-fade-in-up"
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <ProductCard
                  product={product}
                  onReserve={(p) => setReservingProduct(p)}
                />
              </div>
            ))}
      </div>

      {/* Reserve Modal */}
      {reservingProduct && (
        <ReserveModal
          product={reservingProduct}
          onClose={() => setReservingProduct(null)}
          onSuccess={(reservationId) => {
            setReservingProduct(null);
            router.push(`/checkout/${reservationId}`);
          }}
        />
      )}
    </div>
  );
}
