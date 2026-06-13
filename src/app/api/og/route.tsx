import { ImageResponse } from "next/og";

export const runtime = "edge";

// Dynamic OpenGraph image. Placeholder design — swap fonts/branding as needed.
export function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const title = (searchParams.get("title") || "The Immigration Clock").slice(0, 90);

  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "linear-gradient(135deg, #05070d 0%, #0f1424 60%, #1c2440 100%)",
          padding: "64px",
          color: "white",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: "linear-gradient(135deg, #38bdf8, #f43f5e)",
            }}
          />
          <div style={{ display: "flex", fontSize: 30, fontWeight: 700, letterSpacing: -0.5 }}>
            <span>Immigration</span>
            <span style={{ color: "#38bdf8" }}>Clock</span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 64, fontWeight: 800, lineHeight: 1.05, maxWidth: 980 }}>{title}</div>
          <div style={{ marginTop: 24, fontSize: 28, color: "#94a3b8", maxWidth: 900 }}>
            Live public data on immigration, visas, enforcement, and jobs.
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 22, color: "#64748b" }}>
          <div>Facts first. Trends live. Sources included.</div>
          <div>immigrationclock</div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
