import { useEffect, useState, useCallback } from 'react';
import KpiCard from './components/KpiCard.jsx';
import { getKpis, getRevenueTrend, getOrders } from './api/mockApi.js';

/* -------------------------------------------------------
   Register data providers so the Agentic UI plugin has
   access to the real application data when scanning.
   ------------------------------------------------------- */
window.__agenticUI = {
  dataProviders: {
    kpis: getKpis,
    revenueTrend: getRevenueTrend,
    orders: ({ status } = {}) => getOrders({ status }),
  },
};

/* -------------------------------------------------------
   Inline SVG Revenue Trend Chart (zero dependencies)
   ------------------------------------------------------- */
function RevenueTrendChart({ data }) {
  if (!data?.length) return null;

  const W = 600, H = 200;
  const pad = { top: 20, right: 16, bottom: 40, left: 56 };
  const cw = W - pad.left - pad.right;
  const ch = H - pad.top - pad.bottom;
  const maxV = Math.max(...data.map(d => d.revenue)) * 1.1 || 1;
  const minV = Math.min(...data.map(d => d.revenue)) * 0.9;
  const range = maxV - minV || 1;

  const pts = data.map((d, i) => ({
    x: pad.left + (i / Math.max(data.length - 1, 1)) * cw,
    y: pad.top + ch - ((d.revenue - minV) / range) * ch,
    label: d.day,
    value: d.revenue,
  }));

  const polyline = pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const areaTop = polyline;
  const areaBot = `${pts[pts.length-1].x.toFixed(1)},${(pad.top+ch).toFixed(1)} ${pts[0].x.toFixed(1)},${(pad.top+ch).toFixed(1)}`;

  const yTicks = 4;
  const gridLines = Array.from({length: yTicks+1}, (_, i) => {
    const v = minV + (range * i / yTicks);
    const y = pad.top + ch - ((v - minV) / range) * ch;
    const lbl = v >= 1000 ? '$' + (v/1000).toFixed(0) + 'k' : '$' + Math.round(v);
    return (
      <g key={i}>
        <line x1={pad.left} y1={y.toFixed(1)} x2={W-pad.right} y2={y.toFixed(1)}
          stroke="rgba(255,255,255,0.05)" strokeDasharray="3 5"/>
        <text x={(pad.left-8).toFixed(1)} y={(y+4).toFixed(1)} fill="#8b93a1"
          fontSize="9" textAnchor="end">{lbl}</text>
      </g>
    );
  });

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', overflow: 'visible' }}>
      <defs>
        <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#5eead4" stopOpacity="0.4"/>
          <stop offset="100%" stopColor="#5eead4" stopOpacity="0"/>
        </linearGradient>
      </defs>
      <line x1={pad.left} y1={pad.top} x2={pad.left} y2={pad.top+ch}
        stroke="rgba(255,255,255,0.12)"/>
      <line x1={pad.left} y1={pad.top+ch} x2={W-pad.right} y2={pad.top+ch}
        stroke="rgba(255,255,255,0.12)"/>
      {gridLines}
      <polygon points={`${areaTop} ${areaBot}`} fill="url(#revGrad)"/>
      <polyline points={polyline} fill="none" stroke="#5eead4" strokeWidth="2.5" strokeLinejoin="round"/>
      {pts.map((p, i) => (
        <g key={i}>
          <circle cx={p.x.toFixed(1)} cy={p.y.toFixed(1)} r="4.5"
            fill="#5eead4" stroke="#171b22" strokeWidth="2"/>
          <text x={p.x.toFixed(1)} y={(pad.top+ch+18).toFixed(1)}
            fill="#8b93a1" fontSize="10" textAnchor="middle">{p.label}</text>
        </g>
      ))}
    </svg>
  );
}

/* -------------------------------------------------------
   Orders Table
   ------------------------------------------------------- */
function OrdersTable({ orders }) {
  const statusColor = { paid: '#4ade80', pending: '#f59e0b', refunded: '#f87171' };
  return (
    <table id="orders-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          {['Order', 'Customer', 'Amount', 'Status'].map(h => (
            <th key={h} style={{
              textAlign: 'left', padding: '10px 12px',
              color: 'var(--color-muted)', fontSize: 12, fontWeight: 500,
              borderBottom: '1px solid var(--color-border)',
            }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {orders.map((o, i) => (
          <tr key={o.id} style={{ background: i % 2 ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
            <td style={{ padding: '10px 12px', fontSize: 13, color: 'var(--color-text)',
              borderBottom: '1px solid var(--color-border)' }}>{o.id}</td>
            <td style={{ padding: '10px 12px', fontSize: 13, color: 'var(--color-text)',
              borderBottom: '1px solid var(--color-border)' }}>{o.customer}</td>
            <td style={{ padding: '10px 12px', fontSize: 13, color: 'var(--color-text)',
              borderBottom: '1px solid var(--color-border)' }}>${o.amount.toLocaleString()}</td>
            <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--color-border)' }}>
              <span style={{
                fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 20,
                background: `${statusColor[o.status] || '#8b93a1'}22`,
                color: statusColor[o.status] || '#8b93a1',
                border: `1px solid ${statusColor[o.status] || '#8b93a1'}44`,
              }}>{o.status}</span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* -------------------------------------------------------
   Main App
   ------------------------------------------------------- */
export default function App() {
  const [kpis, setKpis] = useState([]);
  const [trend, setTrend] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    Promise.all([getKpis(), getRevenueTrend(), getOrders()])
      .then(([k, t, o]) => { setKpis(k); setTrend(t); setOrders(o); setLoading(false); });
  }, []);

  const filteredOrders = statusFilter === 'all'
    ? orders
    : orders.filter(o => o.status === statusFilter);

  const filterOrders = useCallback((status) => {
    setStatusFilter(status);
    getOrders({ status }).then(setOrders);
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', color: 'var(--color-muted)', fontSize: 14 }}>
        Loading…
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px 60px' }}>

      {/* Header */}
      <header className="dashboard-header" style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12,
      }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-text)', margin: 0, letterSpacing: '-0.3px' }}>
            Revenue Dashboard
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--color-muted)' }}>
            Last 7 days · Updated just now
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {['This Week', 'This Month', 'This Quarter'].map(label => (
            <button key={label} style={{
              background: label === 'This Week' ? 'rgba(94,234,212,0.12)' : 'transparent',
              border: `1px solid ${label === 'This Week' ? 'rgba(94,234,212,0.35)' : 'var(--color-border)'}`,
              color: label === 'This Week' ? 'var(--color-accent)' : 'var(--color-muted)',
              padding: '6px 12px', borderRadius: 8, fontSize: 12, cursor: 'pointer',
            }}>{label}</button>
          ))}
        </div>
      </header>

      {/* KPI Grid */}
      <div id="kpi-grid" className="dashboard-grid" style={{ paddingLeft: 0, paddingRight: 0 }}>
        {kpis.map(k => (
          <div key={k.id} id={`kpi-card-${k.id}`} data-kpi data-label={k.label} data-value={k.value}>
            <KpiCard label={k.label} value={k.value} format={k.format} delta={k.delta}/>
          </div>
        ))}
      </div>

      {/* Revenue Trend */}
      <div className="dashboard-section">
        <div style={{
          background: 'var(--color-surface)', borderRadius: 'var(--radius-md)',
          border: '1px solid var(--color-border)', padding: '20px 20px 16px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text)' }}>Revenue Trend</div>
              <div style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 2 }}>Daily revenue this week</div>
            </div>
            <div style={{
              background: 'rgba(94,234,212,0.1)', border: '1px solid rgba(94,234,212,0.25)',
              color: 'var(--color-accent)', fontSize: 11, padding: '4px 10px', borderRadius: 6,
            }}>+8.4% vs last week</div>
          </div>
          <RevenueTrendChart data={trend}/>
        </div>
      </div>

      {/* Orders Table */}
      <div className="dashboard-section">
        <div style={{
          background: 'var(--color-surface)', borderRadius: 'var(--radius-md)',
          border: '1px solid var(--color-border)', padding: '20px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text)' }}>Recent Orders</div>
              <div style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 2 }}>
                {filteredOrders.length} orders
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {['all', 'paid', 'pending', 'refunded'].map(s => (
                <button key={s} onClick={() => filterOrders(s)} style={{
                  background: statusFilter === s ? 'rgba(94,234,212,0.12)' : 'transparent',
                  border: `1px solid ${statusFilter === s ? 'rgba(94,234,212,0.35)' : 'var(--color-border)'}`,
                  color: statusFilter === s ? 'var(--color-accent)' : 'var(--color-muted)',
                  padding: '5px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer',
                  textTransform: 'capitalize',
                }}>{s}</button>
              ))}
            </div>
          </div>
          <OrdersTable orders={filteredOrders}/>
        </div>
      </div>

      {/* Agentic UI Plugin — works in any tech stack via web component */}
      <agentic-ui-agent endpoint="http://localhost:4411"></agentic-ui-agent>
    </div>
  );
}
