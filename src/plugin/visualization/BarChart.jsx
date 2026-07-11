import React, { useEffect, useRef, useState } from 'react';

const PADDING = { top: 28, right: 16, bottom: 48, left: 52 };

function niceMax(max) {
  if (max === 0) return 10;
  const magnitude = Math.pow(10, Math.floor(Math.log10(max)));
  return Math.ceil(max / magnitude) * magnitude;
}

function formatValue(v) {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(0)}k`;
  return String(v);
}

export default function BarChart({ title, data = [], color = '#5eead4' }) {
  const [animated, setAnimated] = useState(false);
  const containerRef = useRef(null);
  const [width, setWidth] = useState(480);

  useEffect(() => {
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setWidth(entry.contentRect.width || 480);
      }
    });
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const t = requestAnimationFrame(() => setAnimated(true));
    return () => cancelAnimationFrame(t);
  }, []);

  if (!data || data.length === 0) {
    return (
      <div ref={containerRef} style={styles.wrapper}>
        {title && <div style={styles.title}>{title}</div>}
        <div style={styles.empty}>No data available</div>
      </div>
    );
  }

  const height = 240;
  const chartW = width - PADDING.left - PADDING.right;
  const chartH = height - PADDING.top - PADDING.bottom;

  const maxVal = niceMax(Math.max(...data.map((d) => d.value), 0));
  const minVal = Math.min(...data.map((d) => d.value), 0);
  const range = maxVal - (minVal < 0 ? minVal : 0);

  const barW = Math.max(8, Math.floor((chartW / data.length) * 0.55));
  const gap = chartW / data.length;

  // Y-axis ticks (5 ticks)
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => ({
    value: minVal < 0 ? minVal + f * (maxVal - minVal) : f * maxVal,
    y: chartH - f * chartH,
  }));

  const barColor = color || '#5eead4';
  const barColorAlpha = barColor + '22';

  return (
    <div ref={containerRef} style={styles.wrapper}>
      {title && <div style={styles.title}>{title}</div>}
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ display: 'block', overflow: 'visible' }}
      >
        <defs>
          <linearGradient id={`bar-grad-${title}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={barColor} stopOpacity="0.9" />
            <stop offset="100%" stopColor={barColor} stopOpacity="0.45" />
          </linearGradient>
        </defs>

        {/* Y-axis grid lines and labels */}
        <g transform={`translate(${PADDING.left}, ${PADDING.top})`}>
          {yTicks.map((tick, i) => (
            <g key={i}>
              <line
                x1={0}
                y1={tick.y}
                x2={chartW}
                y2={tick.y}
                stroke="rgba(255,255,255,0.07)"
                strokeWidth={1}
              />
              <text
                x={-8}
                y={tick.y + 4}
                textAnchor="end"
                fill="#8b93a1"
                fontSize={10}
              >
                {formatValue(tick.value)}
              </text>
            </g>
          ))}

          {/* X-axis baseline */}
          <line
            x1={0}
            y1={chartH}
            x2={chartW}
            y2={chartH}
            stroke="rgba(255,255,255,0.12)"
            strokeWidth={1}
          />

          {/* Bars */}
          {data.map((d, i) => {
            const x = i * gap + gap / 2 - barW / 2;
            const barH = range > 0 ? ((d.value - (minVal < 0 ? minVal : 0)) / range) * chartH : 0;
            const y = chartH - barH;

            return (
              <g key={i}>
                {/* Bar background track */}
                <rect
                  x={x}
                  y={0}
                  width={barW}
                  height={chartH}
                  fill={barColorAlpha}
                  rx={4}
                />
                {/* Actual bar with animation */}
                <rect
                  x={x}
                  y={animated ? y : chartH}
                  width={barW}
                  height={animated ? barH : 0}
                  fill={`url(#bar-grad-${title})`}
                  rx={4}
                  style={{
                    transition: `y 0.5s cubic-bezier(0.34,1.56,0.64,1) ${i * 60}ms, height 0.5s cubic-bezier(0.34,1.56,0.64,1) ${i * 60}ms`,
                  }}
                />
                {/* Value label above bar */}
                {animated && barH > 14 && (
                  <text
                    x={x + barW / 2}
                    y={y - 5}
                    textAnchor="middle"
                    fill="#e7eaee"
                    fontSize={10}
                    fontWeight={600}
                    style={{ opacity: animated ? 1 : 0, transition: `opacity 0.3s ${i * 60 + 300}ms` }}
                  >
                    {formatValue(d.value)}
                  </text>
                )}
                {/* X-axis label */}
                <text
                  x={x + barW / 2}
                  y={chartH + 16}
                  textAnchor="middle"
                  fill="#8b93a1"
                  fontSize={10}
                >
                  {d.label?.length > 8 ? d.label.slice(0, 7) + '…' : d.label}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}

const styles = {
  wrapper: {
    width: '100%',
    fontFamily: '-apple-system, Inter, Segoe UI, sans-serif',
  },
  title: {
    fontSize: 13,
    fontWeight: 600,
    color: '#e7eaee',
    marginBottom: 12,
    letterSpacing: 0.2,
  },
  empty: {
    padding: '40px 0',
    textAlign: 'center',
    color: '#8b93a1',
    fontSize: 13,
  },
};
