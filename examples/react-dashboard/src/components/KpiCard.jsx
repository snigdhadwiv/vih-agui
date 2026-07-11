const formatters = {
  currency: (v) => `$${v.toLocaleString()}`,
  number: (v) => v.toLocaleString(),
  percent: (v) => `${(v * 100).toFixed(1)}%`,
};

/**
 * Generic KPI card. Reused across the dashboard (see App.jsx) rather than
 * one-off card components — this is the realistic pattern: when you ask the
 * agent for "a new KPI card", it should extend usage of THIS component
 * rather than inventing a new one from scratch.
 */
export default function KpiCard({ label, value, format = "number", delta }) {
  const positive = typeof delta === "number" && delta >= 0;
  return (
    <div
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-md)",
        padding: 18,
      }}
    >
      <div style={{ color: "var(--color-muted)", fontSize: 12 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, marginTop: 6 }}>
        {formatters[format](value)}
      </div>
      {typeof delta === "number" && (
        <div
          style={{
            fontSize: 12,
            marginTop: 4,
            color: positive ? "var(--color-positive)" : "var(--color-negative)",
          }}
        >
          {positive ? "▲" : "▼"} {Math.abs(delta * 100).toFixed(1)}% vs last period
        </div>
      )}
    </div>
  );
}
