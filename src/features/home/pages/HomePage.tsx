import { Link } from "react-router-dom";

export default function HomePage() {
  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        background:
          "radial-gradient(circle at top, #1e3a8a, #020617 60%)",
        color: "#ffffff",
      }}
    >
      <section
        style={{
          width: "min(520px, 100%)",
          padding: 28,
          borderRadius: 28,
          background: "rgba(15, 23, 42, 0.92)",
          border: "1px solid rgba(125, 211, 252, 0.3)",
          boxShadow: "0 30px 90px rgba(0,0,0,0.5)",
        }}
      >
        <h1 style={{ marginTop: 0 }}>Welcome to Tracking System</h1>

        <p style={{ color: "#cbd5e1", lineHeight: 1.6 }}>
          Share your live location or view online students in real time.
        </p>

        <div
          style={{
            display: "grid",
            gap: 12,
            marginTop: 24,
          }}
        >
          <Link
            to="/driver"
            style={{
              padding: 16,
              borderRadius: 16,
              background: "linear-gradient(135deg, #2563eb, #06b6d4)",
              color: "#ffffff",
              fontWeight: 800,
              textAlign: "center",
              textDecoration: "none",
            }}
          >
            Share Your Live Location
          </Link>

          <Link
            to="/map"
            style={{
              padding: 16,
              borderRadius: 16,
              background: "rgba(30, 41, 59, 0.9)",
              border: "1px solid rgba(148, 163, 184, 0.3)",
              color: "#ffffff",
              fontWeight: 800,
              textAlign: "center",
              textDecoration: "none",
            }}
          >
            View Online Students
          </Link>
        </div>
      </section>
    </main>
  );
}


