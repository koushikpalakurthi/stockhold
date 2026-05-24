import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "StockHold — Inventory Reservation Platform",
  description:
    "Multi-warehouse inventory management with real-time stock reservations. Built for D2C and retail brands.",
  keywords: ["inventory", "reservation", "warehouse", "fulfillment", "D2C"],
  openGraph: {
    title: "StockHold — Inventory Reservation Platform",
    description: "Reserve inventory at checkout. No oversell. No manual clean-up.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
      </head>
      <body>
        <div className="min-h-screen" style={{ background: "var(--bg-primary)" }}>
          {/* Top nav */}
          <nav
            style={{
              borderBottom: "1px solid var(--border)",
              background: "rgba(10, 10, 15, 0.8)",
              backdropFilter: "blur(20px)",
              position: "sticky",
              top: 0,
              zIndex: 50,
            }}
          >
            <div
              style={{
                maxWidth: 1280,
                margin: "0 auto",
                padding: "0 24px",
                height: 60,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <a
                href="/"
                style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: "linear-gradient(135deg, #6366f1, #a78bfa)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 16,
                  }}
                >
                  📦
                </div>
                <span
                  style={{
                    fontWeight: 700,
                    fontSize: 18,
                    color: "var(--text-primary)",
                    letterSpacing: "-0.02em",
                  }}
                >
                  Stock<span className="gradient-text">Hold</span>
                </span>
              </a>

              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  className="badge badge-success"
                  style={{ fontSize: 10 }}
                >
                  ● Live
                </span>
                <span
                  style={{
                    fontSize: 12,
                    color: "var(--text-muted)",
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                >
                  v1.0.0
                </span>
              </div>
            </div>
          </nav>

          {/* Page content */}
          <main>{children}</main>

          {/* Footer */}
          <footer
            style={{
              borderTop: "1px solid var(--border)",
              padding: "24px",
              textAlign: "center",
              color: "var(--text-muted)",
              fontSize: 13,
            }}
          >
            <p>
              StockHold · Race-condition-free inventory reservations ·{" "}
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>
                Redis + PostgreSQL
              </span>
            </p>
          </footer>
        </div>
      </body>
    </html>
  );
}
