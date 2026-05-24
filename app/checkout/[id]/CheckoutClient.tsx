"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";

interface ReservationDetail {
  id: string;
  productId: string;
  warehouseId: string;
  quantity: number;
  status: "PENDING" | "CONFIRMED" | "RELEASED";
  expiresAt: string;
  confirmedAt: string | null;
  releasedAt: string | null;
  createdAt: string;
  product: {
    id: string;
    name: string;
    sku: string;
    imageUrl: string;
    description: string;
  };
  warehouse: {
    id: string;
    name: string;
    location: string;
  };
}

// ─── Countdown Timer ──────────────────────────────────────────────────────────
function CountdownTimer({
  expiresAt,
  onExpired,
}: {
  expiresAt: string;
  onExpired: () => void;
}) {
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const hasExpiredRef = useRef(false);

  useEffect(() => {
    function tick() {
      const remaining = Math.max(
        0,
        Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)
      );
      setTimeLeft(remaining);
      if (remaining === 0 && !hasExpiredRef.current) {
        hasExpiredRef.current = true;
        onExpired();
      }
    }

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [expiresAt, onExpired]);

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const pct = timeLeft / (10 * 60); // fraction of 10 min window
  const isUrgent = timeLeft <= 60;
  const isCritical = timeLeft <= 30;

  const color = isCritical
    ? "#ef4444"
    : isUrgent
    ? "#f59e0b"
    : "#6366f1";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 12,
      }}
    >
      {/* Circular countdown */}
      <div style={{ position: "relative", width: 100, height: 100 }}>
        <svg
          width="100"
          height="100"
          style={{ transform: "rotate(-90deg)" }}
        >
          {/* Track */}
          <circle
            cx="50"
            cy="50"
            r="44"
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth="6"
          />
          {/* Progress */}
          <circle
            cx="50"
            cy="50"
            r="44"
            fill="none"
            stroke={color}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={`${2 * Math.PI * 44}`}
            strokeDashoffset={`${2 * Math.PI * 44 * (1 - pct)}`}
            style={{
              transition: "stroke-dashoffset 1s linear, stroke 0.5s ease",
            }}
          />
        </svg>
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span
            style={{
              fontSize: 20,
              fontWeight: 800,
              color: color,
              fontFamily: "'JetBrains Mono', monospace",
              lineHeight: 1,
              transition: "color 0.5s ease",
            }}
          >
            {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
          </span>
          <span style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 2 }}>
            remaining
          </span>
        </div>
      </div>

      <p
        style={{
          fontSize: 12,
          color: isCritical
            ? "#f87171"
            : isUrgent
            ? "#fbbf24"
            : "var(--text-muted)",
          fontWeight: isUrgent ? 600 : 400,
          transition: "color 0.5s ease",
        }}
      >
        {timeLeft === 0
          ? "Reservation expired"
          : isCritical
          ? "⚡ Expiring soon!"
          : isUrgent
          ? "⏰ Less than a minute left"
          : "Confirm before time runs out"}
      </p>
    </div>
  );
}

// ─── Status Display ───────────────────────────────────────────────────────────
function ReservationStatusBanner({
  status,
}: {
  status: "PENDING" | "CONFIRMED" | "RELEASED";
}) {
  if (status === "CONFIRMED") {
    return (
      <div
        style={{
          background: "rgba(16, 185, 129, 0.1)",
          border: "1px solid rgba(16, 185, 129, 0.3)",
          borderRadius: 14,
          padding: "20px 24px",
          display: "flex",
          alignItems: "center",
          gap: 16,
        }}
      >
        <span style={{ fontSize: 32 }}>🎉</span>
        <div>
          <p
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: "#34d399",
              marginBottom: 4,
            }}
          >
            Purchase Confirmed!
          </p>
          <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
            Your order is locked in. We'll prepare it for shipping shortly.
          </p>
        </div>
      </div>
    );
  }

  if (status === "RELEASED") {
    return (
      <div
        style={{
          background: "rgba(148, 163, 184, 0.08)",
          border: "1px solid rgba(148, 163, 184, 0.2)",
          borderRadius: 14,
          padding: "20px 24px",
          display: "flex",
          alignItems: "center",
          gap: 16,
        }}
      >
        <span style={{ fontSize: 32 }}>🔓</span>
        <div>
          <p
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: "var(--text-secondary)",
              marginBottom: 4,
            }}
          >
            Reservation Released
          </p>
          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
            This hold has been cancelled. The units are back in stock.
          </p>
        </div>
      </div>
    );
  }

  return null;
}

// ─── Checkout Client Component ────────────────────────────────────────────────
export default function CheckoutClient({ id }: { id: string }) {
  const router = useRouter();
  const [reservation, setReservation] = useState<ReservationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchReservation = useCallback(async () => {
    try {
      const res = await fetch(`/api/reservations/${id}`);
      if (!res.ok) {
        setFetchError("Reservation not found.");
        return;
      }
      const data = await res.json();
      setReservation(data.reservation);
    } catch {
      setFetchError("Failed to load reservation.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchReservation();
  }, [fetchReservation]);

  async function handleConfirm() {
    if (!reservation) return;
    setActionLoading(true);
    setError(null);

    const idempotencyKey = `confirm-${reservation.id}-${Date.now()}`;

    try {
      const res = await fetch(`/api/reservations/${reservation.id}/confirm`, {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey },
      });
      const data = await res.json();

      if (!res.ok) {
        if (res.status === 410) {
          setError(
            "⏱ Your reservation expired before payment could be confirmed. The units have been released back to inventory. Please start a new reservation."
          );
          // Refresh to show released state
          await fetchReservation();
        } else {
          setError(data.error ?? "Something went wrong.");
        }
        return;
      }

      // Update in-place — no page reload needed
      setReservation((prev) =>
        prev ? { ...prev, status: "CONFIRMED", confirmedAt: data.reservation.confirmedAt } : prev
      );
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleRelease() {
    if (!reservation) return;
    setActionLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/reservations/${reservation.id}/release`, {
        method: "POST",
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }

      // Update in-place
      setReservation((prev) =>
        prev ? { ...prev, status: "RELEASED", releasedAt: data.reservation.releasedAt } : prev
      );
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setActionLoading(false);
    }
  }

  function handleExpired() {
    // Re-fetch to get the server-authoritative released status
    fetchReservation();
  }

  // ── Loading skeleton ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ maxWidth: 680, margin: "60px auto", padding: "0 24px" }}>
        <div className="skeleton" style={{ height: 24, width: "40%", marginBottom: 32 }} />
        <div className="glass-card" style={{ padding: 32 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 24,
              marginBottom: 24,
            }}
          >
            <div className="skeleton" style={{ height: 200, borderRadius: 12 }} />
            <div>
              <div className="skeleton" style={{ height: 14, width: "50%", marginBottom: 12 }} />
              <div className="skeleton" style={{ height: 22, width: "80%", marginBottom: 12 }} />
              <div className="skeleton" style={{ height: 14, width: "60%", marginBottom: 8 }} />
              <div className="skeleton" style={{ height: 14, width: "70%", marginBottom: 8 }} />
            </div>
          </div>
          <div className="skeleton" style={{ height: 48, width: "100%", marginBottom: 12 }} />
          <div className="skeleton" style={{ height: 48, width: "100%" }} />
        </div>
      </div>
    );
  }

  // ── Fetch error ─────────────────────────────────────────────────────────────
  if (fetchError || !reservation) {
    return (
      <div style={{ maxWidth: 680, margin: "60px auto", padding: "0 24px" }}>
        <div
          className="glass-card"
          style={{
            padding: 32,
            textAlign: "center",
          }}
        >
          <span style={{ fontSize: 48, display: "block", marginBottom: 16 }}>
            🔍
          </span>
          <h2
            style={{
              fontSize: 20,
              fontWeight: 700,
              color: "var(--text-primary)",
              marginBottom: 8,
            }}
          >
            Reservation Not Found
          </h2>
          <p style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 24 }}>
            {fetchError ?? "This reservation doesn't exist or has been removed."}
          </p>
          <button
            onClick={() => router.push("/")}
            style={{
              padding: "10px 24px",
              background: "linear-gradient(135deg, #6366f1, #4f46e5)",
              border: "none",
              borderRadius: 10,
              color: "white",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            ← Back to Products
          </button>
        </div>
      </div>
    );
  }

  const isPending = reservation.status === "PENDING";

  return (
    <div
      style={{ maxWidth: 680, margin: "40px auto", padding: "0 24px 60px" }}
      className="animate-fade-in-up"
    >
      {/* Breadcrumb */}
      <button
        onClick={() => router.push("/")}
        style={{
          background: "transparent",
          border: "none",
          color: "var(--text-muted)",
          cursor: "pointer",
          fontSize: 13,
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 24,
          padding: 0,
        }}
      >
        ← Back to Products
      </button>

      {/* Page title */}
      <div style={{ marginBottom: 28 }}>
        <h1
          style={{
            fontSize: 28,
            fontWeight: 800,
            letterSpacing: "-0.02em",
            color: "var(--text-primary)",
            marginBottom: 6,
          }}
        >
          {reservation.status === "CONFIRMED"
            ? "Order Confirmed"
            : reservation.status === "RELEASED"
            ? "Reservation Cancelled"
            : "Complete Your Purchase"}
        </h1>
        <p
          style={{
            fontSize: 13,
            color: "var(--text-muted)",
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          Reservation ID: {reservation.id}
        </p>
      </div>

      {/* Status banner for terminal states */}
      {(reservation.status === "CONFIRMED" ||
        reservation.status === "RELEASED") && (
        <div style={{ marginBottom: 24 }}>
          <ReservationStatusBanner status={reservation.status} />
        </div>
      )}

      {/* Main card */}
      <div className="glass-card" style={{ padding: 28, marginBottom: 20 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "180px 1fr",
            gap: 24,
            alignItems: "start",
          }}
        >
          {/* Product image */}
          <div
            style={{
              borderRadius: 12,
              overflow: "hidden",
              aspectRatio: "1",
            }}
          >
            <img
              src={reservation.product.imageUrl}
              alt={reservation.product.name}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          </div>

          {/* Product details */}
          <div>
            <p
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "var(--brand-400)",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                marginBottom: 4,
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              {reservation.product.sku}
            </p>
            <h2
              style={{
                fontSize: 20,
                fontWeight: 700,
                color: "var(--text-primary)",
                marginBottom: 12,
              }}
            >
              {reservation.product.name}
            </h2>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                {
                  icon: "🏭",
                  label: "Warehouse",
                  value: `${reservation.warehouse.name} · ${reservation.warehouse.location}`,
                },
                {
                  icon: "📦",
                  label: "Quantity",
                  value: `${reservation.quantity} unit${reservation.quantity !== 1 ? "s" : ""}`,
                },
                {
                  icon: "🔖",
                  label: "Status",
                  value: reservation.status,
                  badge: true,
                },
              ].map((row) => (
                <div
                  key={row.label}
                  style={{ display: "flex", alignItems: "center", gap: 10 }}
                >
                  <span style={{ fontSize: 14 }}>{row.icon}</span>
                  <span
                    style={{
                      fontSize: 12,
                      color: "var(--text-muted)",
                      minWidth: 72,
                    }}
                  >
                    {row.label}
                  </span>
                  {row.badge ? (
                    <span
                      className={`badge ${
                        reservation.status === "CONFIRMED"
                          ? "badge-success"
                          : reservation.status === "RELEASED"
                          ? "badge-neutral"
                          : "badge-brand"
                      }`}
                    >
                      {reservation.status}
                    </span>
                  ) : (
                    <span
                      style={{ fontSize: 13, color: "var(--text-secondary)" }}
                    >
                      {row.value}
                    </span>
                  )}
                </div>
              ))}
            </div>

            {/* Timestamps */}
            <div
              style={{
                marginTop: 16,
                padding: "12px",
                background: "rgba(255,255,255,0.03)",
                borderRadius: 10,
                fontSize: 11,
                color: "var(--text-muted)",
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              <div>
                Created:{" "}
                {new Date(reservation.createdAt).toLocaleString()}
              </div>
              <div>
                Expires:{" "}
                {new Date(reservation.expiresAt).toLocaleString()}
              </div>
              {reservation.confirmedAt && (
                <div>
                  Confirmed:{" "}
                  {new Date(reservation.confirmedAt).toLocaleString()}
                </div>
              )}
              {reservation.releasedAt && (
                <div>
                  Released:{" "}
                  {new Date(reservation.releasedAt).toLocaleString()}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Countdown + actions (only for PENDING) */}
      {isPending && (
        <div className="glass-card" style={{ padding: 28 }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 24,
            }}
          >
            <CountdownTimer
              expiresAt={reservation.expiresAt}
              onExpired={handleExpired}
            />

            {/* Error banner */}
            {error && (
              <div
                style={{
                  width: "100%",
                  background: "rgba(239, 68, 68, 0.1)",
                  border: "1px solid rgba(239, 68, 68, 0.3)",
                  borderRadius: 10,
                  padding: "14px 16px",
                  fontSize: 13,
                  color: "#f87171",
                  lineHeight: 1.5,
                }}
              >
                {error}
              </div>
            )}

            {/* Action buttons */}
            <div style={{ display: "flex", gap: 12, width: "100%" }}>
              <button
                id="cancel-reservation-btn"
                onClick={handleRelease}
                disabled={actionLoading}
                style={{
                  flex: 1,
                  padding: "14px",
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  background: "transparent",
                  color: "var(--text-secondary)",
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: actionLoading ? "not-allowed" : "pointer",
                  opacity: actionLoading ? 0.5 : 1,
                  transition: "all 0.15s ease",
                }}
              >
                Cancel Reservation
              </button>
              <button
                id="confirm-purchase-btn"
                onClick={handleConfirm}
                disabled={actionLoading}
                style={{
                  flex: 2,
                  padding: "14px",
                  border: "none",
                  borderRadius: 10,
                  background: actionLoading
                    ? "rgba(16, 185, 129, 0.3)"
                    : "linear-gradient(135deg, #059669, #10b981)",
                  color: "white",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: actionLoading ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  boxShadow: actionLoading
                    ? "none"
                    : "0 4px 20px rgba(16, 185, 129, 0.35)",
                  transition: "all 0.2s ease",
                }}
              >
                {actionLoading ? (
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
                    Processing…
                  </>
                ) : (
                  "✓ Confirm Purchase"
                )}
              </button>
            </div>

            <p
              style={{
                fontSize: 12,
                color: "var(--text-muted)",
                textAlign: "center",
              }}
            >
              By confirming, you acknowledge the units will be permanently
              decremented from inventory.
            </p>
          </div>
        </div>
      )}

      {/* Back button for terminal states */}
      {!isPending && (
        <button
          onClick={() => router.push("/")}
          style={{
            width: "100%",
            padding: "14px",
            border: "1px solid var(--border)",
            borderRadius: 12,
            background: "transparent",
            color: "var(--text-secondary)",
            fontSize: 14,
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          ← Browse More Products
        </button>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
