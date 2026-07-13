/**
 * Agentic UI — Framework-Agnostic Plugin  v2
 * ============================================
 * Works in ANY web app: React, Vue, Angular, Svelte, plain HTML.
 *
 * UX model:
 *  1. Floating bubble (bottom-right) → small composer opens
 *  2. User types a question → AI responds
 *  3. A full-screen Analytics Panel slides in over the host app
 *  4. All visualizations render in a beautiful grid inside that panel
 *  5. Follow-up questions UPDATE the panel in-place (no new windows)
 *  6. "← Back to Dashboard" slides the panel away, host app returns
 *
 * Integration (any tech stack — one line):
 *   <script type="module" src="/vendor/agentic-ui.js"></script>
 *   <agentic-ui-agent endpoint="http://localhost:4411"></agentic-ui-agent>
 */

/* =====================================================================
   SECTION 1: DESIGN TOKENS + UTILITIES
   ===================================================================== */

const C = {
  bg:        "transparent",
  bgPanel:   "rgba(255, 255, 255, 0.75)",
  surface:   "rgba(255, 255, 255, 0.65)",
  surface2:  "rgba(241, 245, 249, 0.5)",
  surface3:  "rgba(226, 232, 240, 0.4)",
  accent:    "#8b5cf6",
  blue:      "#6366f1",
  purple:    "#a855f7",
  amber:     "#f59e0b",
  rose:      "#ef4444",
  green:     "#10b981",
  orange:    "#f97316",
  text:      "#0f172a",
  muted:     "#64748b",
  border:    "rgba(0,0,0,0.06)",
  borderHov: "rgba(0,0,0,0.12)",
};

const PALETTE = [
  "#8b5cf6","#6366f1","#a855f7","#4f46e5",
  "#d946ef","#3b82f6","#c026d3","#2563eb",
  "#9333ea","#0ea5e9",
];

const FONT = "-apple-system,'Inter','Segoe UI',Roboto,sans-serif";

function esc(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}

function fmtVal(v, format) {
  const n = parseFloat(String(v).replace(/[^0-9.-]/g,""));
  if (format === "currency") return `$${isNaN(n) ? v : n.toLocaleString()}`;
  if (format === "percent")  return `${isNaN(n) ? v : (n*100).toFixed(1)}%`;
  if (format === "number" && !isNaN(n)) return n.toLocaleString();
  return String(v);
}

function uid() { return "_au_" + Math.random().toString(36).slice(2,9); }

function execScripts(container) {
  container.querySelectorAll("script").forEach(s => {
    try { new Function(s.textContent)(); } catch {}
  });
}

/* =====================================================================
   SECTION 2: CONTEXT SCANNER
   ===================================================================== */

class ContextScanner {
  scan() {
    const ctx = { url: window.location.href, title: document.title,
      kpis:[], tables:[], charts:[], dataProviders:[], data:{} };

    // KPI extraction
    const kpiSeen = new Set();
    ["[id*='kpi']","[id*='metric']","[id*='stat']","[class*='kpi']",
     "[class*='metric']","[data-kpi]","[data-metric]"].forEach(sel => {
      try { document.querySelectorAll(sel).forEach(el => {
        if (kpiSeen.has(el)) return; kpiSeen.add(el);
        let label="",value="";
        el.querySelectorAll("*").forEach(c => {
          const t = c.innerText?.trim()||"";
          if (!t || t.length>60) return;
          if (!value && /^[\$£€]?[\d,.]+[kKmMbB%]?$/.test(t.replace(/\s/g,""))) value=t;
          else if (!label && t.length<40 && !/^[\d$]/.test(t)) label=t;
        });
        if (!value) { const m=(el.innerText||"").match(/[\$£€]?[\d,.]+[kKmMbB%]?/); if(m) value=m[0]; }
        if (value) ctx.kpis.push({ id:el.id||null, label:label||el.id||"Metric", value });
      }); } catch {}
    });
    const seen = new Set();
    ctx.kpis = ctx.kpis.filter(k => { const key=`${k.label}|${k.value}`; if(seen.has(key))return false; seen.add(key); return true; }).slice(0,12);

    // Table extraction
    document.querySelectorAll("table").forEach(tbl => {
      const id = tbl.id||null;
      const title = tbl.caption?.innerText?.trim()||tbl.closest("[aria-label]")?.getAttribute("aria-label")||id||"Table";
      const headers=[];
      tbl.querySelector("thead tr,tr:first-child")?.querySelectorAll("th,td").forEach(c=>headers.push(c.innerText?.trim()||""));
      const rows=[];
      tbl.querySelectorAll("tbody tr,tr:not(:first-child)").forEach(tr=>{
        const row=[]; tr.querySelectorAll("td,th").forEach(td=>row.push(td.innerText?.trim()||""));
        if(row.some(c=>c)) rows.push(row);
      });
      if (headers.length||rows.length) ctx.tables.push({id,title,columns:headers,rows:rows.slice(0,50)});
    });

    // Chart elements
    ["[id*='chart']","[id*='graph']","canvas"].forEach(sel => {
      try { document.querySelectorAll(sel).forEach(el => {
        ctx.charts.push({id:el.id||null,type:el.tagName.toLowerCase(),title:el.id||null});
      }); } catch {}
    });
    ctx.charts = ctx.charts.slice(0,8);

    ctx.dataProviders = Object.keys(window.__agenticUI?.dataProviders || {});
    return ctx;
  }

  async scanWithData() {
    const ctx = this.scan();
    const providers = window.__agenticUI?.dataProviders || {};
    await Promise.all(Object.entries(providers).map(async([key,fn])=>{
      try { ctx.data[key] = await fn(); } catch {}
    }));
    return ctx;
  }
}

/* =====================================================================
   SECTION 3: CHART RENDERERS — pure SVG + HTML
   ===================================================================== */

function card(title, content, fullWidth=false) {
  return `<div style="background:${C.surface};border:1px solid ${C.border};border-radius:14px;
    padding:20px;${fullWidth?'grid-column:1/-1':''}">
    ${title?`<div style="font-size:13px;font-weight:600;color:${C.text};margin-bottom:16px;
      display:flex;align-items:center;gap:8px">
      <span style="display:inline-block;width:3px;height:14px;background:${C.accent};border-radius:2px"></span>
      ${esc(title)}</div>`:''}
    ${content}
  </div>`;
}
function noData(title) {
  return card(title,`<div style="color:${C.muted};font-size:12px;text-align:center;padding:28px 0">No data available</div>`);
}

/* --- Bar Chart --- */
function renderBarChart(spec) {
  const {data=[],title,color=C.accent}=spec;
  if(!data.length) return noData(title);
  const W=500,H=260,p={t:28,r:16,b:52,l:52};
  const cw=W-p.l-p.r,ch=H-p.t-p.b;
  const maxV=Math.max(...data.map(d=>+d.value||0))*1.12||1;
  const barW=Math.max(8,(cw/data.length)*0.6);
  const gap=cw/data.length;
  const grid=Array.from({length:6},(_,i)=>{
    const v=maxV*i/5, y=p.t+ch-ch*i/5;
    const l=v>=1e6?(v/1e6).toFixed(1)+"M":v>=1000?(v/1000).toFixed(1)+"k":Math.round(v);
    return `<line x1="${p.l}" y1="${y.toFixed(1)}" x2="${W-p.r}" y2="${y.toFixed(1)}"
      stroke="rgba(0,0,0,0.05)" stroke-dasharray="3 5"/>
    <text x="${(p.l-7).toFixed(1)}" y="${(y+4).toFixed(1)}" fill="${C.muted}" font-size="9" text-anchor="end">${l}</text>`;
  }).join("");
  const bars=data.map((d,i)=>{
    const bh=Math.max(2,((+d.value||0)/maxV)*ch);
    const x=(p.l+i*gap+(gap-barW)/2).toFixed(1);
    const y=(p.t+ch-bh).toFixed(1);
    const vl=+d.value>=1e6?"$"+(+d.value/1e6).toFixed(1)+"M":+d.value>=1000?(+d.value/1000).toFixed(1)+"k":String(d.value);
    return `<rect x="${x}" y="${y}" width="${barW.toFixed(1)}" height="${bh.toFixed(1)}" rx="4" fill="${color}" opacity="0.85"/>
    <text x="${(+x+barW/2).toFixed(1)}" y="${(+y-5).toFixed(1)}" fill="${color}" font-size="9" text-anchor="middle" font-weight="600">${esc(vl)}</text>
    <text x="${(+x+barW/2).toFixed(1)}" y="${(p.t+ch+18).toFixed(1)}" fill="${C.muted}" font-size="9" text-anchor="middle">${esc(d.label)}</text>`;
  }).join("");
  return card(title,`<svg viewBox="0 0 ${W} ${H}" style="width:100%;overflow:visible">
    <line x1="${p.l}" y1="${p.t}" x2="${p.l}" y2="${p.t+ch}" stroke="rgba(0,0,0,0.12)"/>
    <line x1="${p.l}" y1="${p.t+ch}" x2="${W-p.r}" y2="${p.t+ch}" stroke="rgba(0,0,0,0.12)"/>
    ${grid}${bars}</svg>`);
}

/* --- Line Chart --- */
function renderLineChart(spec) {
  const {data=[],title,color=C.accent}=spec;
  if(!data.length) return noData(title);
  const W=500,H=240,p={t:24,r:16,b:48,l:52};
  const cw=W-p.l-p.r,ch=H-p.t-p.b;
  const vals=data.map(d=>+d.value||0);
  const maxV=Math.max(...vals)*1.12||1, minV=Math.min(...vals)*0.9, range=maxV-minV||1;
  const pts=data.map((d,i)=>({
    x:p.l+(i/Math.max(data.length-1,1))*cw,
    y:p.t+ch-((+d.value-minV)/range)*ch, label:d.label
  }));
  const line=pts.map(pt=>`${pt.x.toFixed(1)},${pt.y.toFixed(1)}`).join(" ");
  const area=line+` ${pts[pts.length-1].x.toFixed(1)},${(p.t+ch).toFixed(1)} ${pts[0].x.toFixed(1)},${(p.t+ch).toFixed(1)}`;
  const gid=uid();
  const grid=Array.from({length:5},(_,i)=>{
    const v=minV+range*i/4, y=p.t+ch-((v-minV)/range)*ch;
    const l=v>=1000?(v/1000).toFixed(1)+"k":Math.round(v);
    return `<line x1="${p.l}" y1="${y.toFixed(1)}" x2="${W-p.r}" y2="${y.toFixed(1)}" stroke="rgba(0,0,0,0.05)" stroke-dasharray="3 5"/>
    <text x="${(p.l-7).toFixed(1)}" y="${(y+4).toFixed(1)}" fill="${C.muted}" font-size="9" text-anchor="end">${l}</text>`;
  }).join("");
  const dots=pts.map((pt,i)=>
    `<circle cx="${pt.x.toFixed(1)}" cy="${pt.y.toFixed(1)}" r="4.5" fill="${color}" stroke="${C.surface}" stroke-width="2"/>
    <text x="${pt.x.toFixed(1)}" y="${(p.t+ch+16).toFixed(1)}" fill="${C.muted}" font-size="9" text-anchor="middle">${esc(pt.label)}</text>`
  ).join("");
  return card(title,`<svg viewBox="0 0 ${W} ${H}" style="width:100%;overflow:visible">
    <defs><linearGradient id="lg${gid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${color}" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
    </linearGradient></defs>
    <line x1="${p.l}" y1="${p.t}" x2="${p.l}" y2="${p.t+ch}" stroke="rgba(0,0,0,0.12)"/>
    <line x1="${p.l}" y1="${p.t+ch}" x2="${W-p.r}" y2="${p.t+ch}" stroke="rgba(0,0,0,0.12)"/>
    ${grid}
    <polygon points="${area}" fill="url(#lg${gid})"/>
    <polyline points="${line}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round"/>
    ${dots}</svg>`);
}

/* --- Area Chart (alias of line) --- */
function renderAreaChart(spec) { return renderLineChart(spec); }

/* --- Pie / Donut shared --- */
function renderPieOrDonut(spec, isDonut) {
  const {data=[],title}=spec;
  if(!data.length) return noData(title);
  const total=data.reduce((s,d)=>s+Math.abs(+d.value||0),0)||1;
  const cx=110,cy=110,R=90,r=isDonut?54:0;
  let paths="",ang=-Math.PI/2;
  const slices=data.slice(0,10).map((d,i)=>{
    const frac=Math.abs(+d.value||0)/total;
    const sweep=frac*2*Math.PI;
    const x1=cx+R*Math.cos(ang),y1=cy+R*Math.sin(ang);
    ang+=sweep;
    const x2=cx+R*Math.cos(ang),y2=cy+R*Math.sin(ang);
    const large=sweep>Math.PI?1:0;
    const clr=PALETTE[i%PALETTE.length];
    if(frac>0.999){
      paths+=`<circle cx="${cx}" cy="${cy}" r="${R}" fill="${clr}"/>`;
      if(isDonut) paths+=`<circle cx="${cx}" cy="${cy}" r="${r}" fill="${C.surface}"/>`;
    } else if(isDonut){
      const ix1=cx+r*Math.cos(ang-sweep),iy1=cy+r*Math.sin(ang-sweep);
      const ix2=cx+r*Math.cos(ang),iy2=cy+r*Math.sin(ang);
      paths+=`<path d="M${x1.toFixed(1)},${y1.toFixed(1)} A${R},${R} 0 ${large},1 ${x2.toFixed(1)},${y2.toFixed(1)}
        L${ix2.toFixed(1)},${iy2.toFixed(1)} A${r},${r} 0 ${large},0 ${ix1.toFixed(1)},${iy1.toFixed(1)} Z" fill="${clr}"/>`;
    } else {
      paths+=`<path d="M${cx},${cy} L${x1.toFixed(1)},${y1.toFixed(1)} A${R},${R} 0 ${large},1 ${x2.toFixed(1)},${y2.toFixed(1)} Z" fill="${clr}"/>`;
    }
    return {label:d.label,pct:(frac*100).toFixed(1),color:clr,value:d.value};
  });
  const centerText=isDonut?`<text x="${cx}" y="${cy-8}" text-anchor="middle" fill="${C.text}" font-size="20" font-weight="700">
    ${total>=1e6?(total/1e6).toFixed(1)+"M":total>=1000?(total/1000).toFixed(1)+"k":Math.round(total)}</text>
    <text x="${cx}" y="${cy+12}" text-anchor="middle" fill="${C.muted}" font-size="11">Total</text>`:"";
  const legend=slices.map(s=>`<div style="display:flex;align-items:center;gap:7px;margin-bottom:6px">
    <div style="width:10px;height:10px;border-radius:3px;background:${s.color};flex-shrink:0"></div>
    <span style="color:${C.muted};font-size:12px">${esc(s.label)}</span>
    <span style="color:${C.text};font-size:12px;font-weight:600;margin-left:auto">${esc(s.pct)}%</span>
  </div>`).join("");
  return card(title,`<div style="display:flex;align-items:center;gap:24px;flex-wrap:wrap">
    <svg viewBox="0 0 220 220" style="width:200px;min-width:160px;flex-shrink:0">
      ${paths}${centerText}
      <circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="rgba(0,0,0,0.04)"/>
    </svg>
    <div style="flex:1;min-width:130px">${legend}</div>
  </div>`);
}
function renderPieChart(spec)   { return renderPieOrDonut(spec,false); }
function renderDonutChart(spec) { return renderPieOrDonut(spec,true);  }

/* --- KPI Cards --- */
function renderKpiCards(spec) {
  const {cards=[],title}=spec;
  if(!cards.length) return noData(title);
  const items=cards.map(c=>{
    const val=fmtVal(c.value,c.format);
    const pos=typeof c.delta==="number"&&c.delta>=0;
    const dc=pos?C.green:C.rose;
    return `<div style="background:${C.surface2};border:1px solid ${C.border};border-radius:12px;padding:18px 20px;flex:1;min-width:140px">
      <div style="color:${C.muted};font-size:11px;margin-bottom:8px">${esc(c.label)}</div>
      <div style="color:${C.text};font-size:28px;font-weight:700;letter-spacing:-0.5px">${esc(val)}</div>
      ${typeof c.delta==="number"?`<div style="color:${dc};font-size:11px;margin-top:5px">${pos?"▲":"▼"} ${Math.abs(c.delta*100).toFixed(1)}% vs last period</div>`:""}
    </div>`;
  }).join("");
  return card(title,`<div style="display:flex;gap:14px;flex-wrap:wrap">${items}</div>`,true);
}

/* --- Data Table --- */
function renderDataTable(spec) {
  const {columns=[],rows=[],title}=spec;
  if(!columns.length&&!rows.length) return noData(title);
  const tid=uid(), sid=uid();
  const thead=columns.map((c,i)=>`<th onclick="window.__aust${tid}(${i})" style="padding:10px 13px;text-align:left;
    color:${C.muted};font-size:11px;font-weight:500;cursor:pointer;white-space:nowrap;
    border-bottom:1px solid ${C.border};user-select:none">${esc(c)} <span id="${tid}h${i}" style="opacity:.5"></span></th>`).join("");
  const tbody=rows.map((row,ri)=>`<tr style="background:${ri%2?C.surface2:"transparent"}">
    ${row.map(cell=>`<td style="padding:9px 13px;font-size:12px;color:${C.text};border-bottom:1px solid ${C.border}">${esc(cell)}</td>`).join("")}
  </tr>`).join("");
  return card(title,`<div>
    <input id="${sid}" type="text" placeholder="Search rows…"
      style="width:100%;background:${C.surface2};border:1px solid ${C.border};border-radius:8px;
        color:${C.text};font-size:12px;padding:8px 11px;margin-bottom:12px;outline:none;box-sizing:border-box"
      oninput="window.__auss${tid}(this.value)"/>
    <div style="max-height:300px;overflow-y:auto;border-radius:8px;overflow:hidden">
      <table id="${tid}" style="width:100%;border-collapse:collapse">
        <thead><tr>${thead}</tr></thead>
        <tbody id="${tid}b">${tbody}</tbody>
      </table>
    </div>
  </div>
  <script>(function(){
    var or=${JSON.stringify(rows)}, sd={};
    window.__aust${tid}=function(c){ sd[c]=!sd[c];
      var s=[...or].sort(function(a,b){ var av=a[c]||'',bv=b[c]||',an=parseFloat(String(av).replace(/[^0-9.-]/g,'')),bn=parseFloat(String(bv).replace(/[^0-9.-]/g,''));
        return sd[c]?(!isNaN(an)&&!isNaN(bn)?an-bn:String(av).localeCompare(String(bv))):(!isNaN(an)&&!isNaN(bn)?bn-an:String(bv).localeCompare(String(av)));
      }); rf${tid}(s);
      ${JSON.stringify(columns)}.forEach(function(_,i){ var e=document.getElementById('${tid}h'+i); if(e)e.textContent=i===c?(sd[c]?'▲':'▼'):''; });
    };
    window.__auss${tid}=function(q){ var lq=q.toLowerCase();
      rf${tid}(or.filter(function(r){return r.some(function(c){return String(c).toLowerCase().includes(lq);});}));
    };
    function rf${tid}(data){ var b=document.getElementById('${tid}b'); if(!b)return;
      b.innerHTML=data.map(function(row,ri){
        return '<tr style="background:'+(ri%2?'${C.surface2}':'transparent')+'">'+
          row.map(function(cell){return '<td style="padding:9px 13px;font-size:12px;color:${C.text};border-bottom:1px solid ${C.border}">'+String(cell).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')+'</td>';}).join('')+'</tr>';
      }).join('');
    }
  })();<\/script>`,true);
}

/* --- Comparison --- */
function renderComparison(spec) {
  const {periods=[],title}=spec;
  if(!periods.length) return noData(title);
  const allNames=[...new Set(periods.flatMap(p=>(p.metrics||[]).map(m=>m.name)))];
  const cols=periods.map((p,i)=>`<th style="padding:9px 13px;text-align:right;color:${PALETTE[i]||C.accent};font-size:12px;font-weight:600">${esc(p.label)}</th>`).join("");
  const rows=allNames.map(name=>{
    const cells=periods.map(p=>{const m=(p.metrics||[]).find(x=>x.name===name);
      return m?`<td style="padding:9px 13px;text-align:right;color:${C.text};font-size:12px">${esc(m.value)}</td>`:`<td></td>`;
    }).join("");
    let delta="";
    if(periods.length>=2){
      const v1=(periods[0].metrics||[]).find(x=>x.name===name)?.value;
      const v2=(periods[1].metrics||[]).find(x=>x.name===name)?.value;
      const n1=parseFloat(String(v1).replace(/[^0-9.-]/g,"")),n2=parseFloat(String(v2).replace(/[^0-9.-]/g,""));
      if(!isNaN(n1)&&!isNaN(n2)&&n2!==0){
        const pct=((n1-n2)/Math.abs(n2)*100).toFixed(1);
        delta=`<td style="padding:9px 13px;text-align:right;font-size:11px;color:${n1>=n2?C.green:C.rose}">${n1>=n2?"▲":"▼"} ${Math.abs(pct)}%</td>`;
      }
    }
    return `<tr style="border-bottom:1px solid ${C.border}">
      <td style="padding:9px 13px;color:${C.muted};font-size:12px">${esc(name)}</td>${cells}${delta}</tr>`;
  }).join("");
  return card(title,`<div style="overflow-x:auto;border-radius:8px;overflow:hidden">
    <table style="width:100%;border-collapse:collapse">
      <thead><tr style="background:${C.surface2}">
        <th style="padding:9px 13px;text-align:left;color:${C.muted};font-size:12px">Metric</th>
        ${cols}${periods.length>=2?`<th style="padding:9px 13px;color:${C.muted};font-size:12px">Δ</th>`:""}
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`,true);
}

/* --- Text Insight --- */
function renderTextInsight(spec) {
  const {content="",bullets=[],title}=spec;
  return card(title,`<p style="color:${C.text};font-size:13px;line-height:1.7;margin:0">${esc(content)}</p>
    ${bullets.length?`<ul style="margin:12px 0 0;padding-left:18px;color:${C.muted};font-size:13px;line-height:1.7">
      ${bullets.map(b=>`<li>${esc(b)}</li>`).join("")}</ul>`:""}`,true);
}

/* --- Gauge --- */
function renderGauge(spec) {
  const {value=0,max=100,label="",title,color=C.accent}=spec;
  const frac=Math.min(1,Math.max(0,+value/(+max||1)));
  const pct=(frac*100).toFixed(1);
  const R=70,cx=100,cy=100;
  const sweep=frac*Math.PI;
  const ex=cx+R*Math.cos(Math.PI-sweep),ey=cy-R*Math.sin(Math.PI-sweep);
  const large=sweep>Math.PI/2?1:0;
  return card(title,`<div style="display:flex;flex-direction:column;align-items:center;padding:8px 0">
    <svg viewBox="0 0 200 112" style="width:200px">
      <path d="M ${cx-R},${cy} A ${R},${R} 0 0,1 ${cx+R},${cy}" fill="none" stroke="${C.surface2}" stroke-width="14" stroke-linecap="round"/>
      ${frac>0.01?`<path d="M ${cx-R},${cy} A ${R},${R} 0 ${large},1 ${ex.toFixed(1)},${ey.toFixed(1)}" fill="none" stroke="${color}" stroke-width="14" stroke-linecap="round"/>`:""}
      <text x="${cx}" y="${cy-8}" text-anchor="middle" fill="${C.text}" font-size="22" font-weight="700">${pct}%</text>
      <text x="${cx}" y="${cy+10}" text-anchor="middle" fill="${C.muted}" font-size="11">${esc(label)}</text>
      <text x="${cx-R-4}" y="${cy+22}" text-anchor="middle" fill="${C.muted}" font-size="9">0</text>
      <text x="${cx+R+4}" y="${cy+22}" text-anchor="middle" fill="${C.muted}" font-size="9">${max}</text>
    </svg>
  </div>`);
}

/* --- Scatter --- */
function renderScatterPlot(spec) {
  const {data=[],title,color=C.accent}=spec;
  if(!data.length) return noData(title);
  const W=460,H=230,p={t:20,r:16,b:44,l:48};
  const cw=W-p.l-p.r,ch=H-p.t-p.b;
  const xs=data.map(d=>+d.x||+d.value||0), ys=data.map(d=>+d.y||+d.value2||0);
  const xMin=Math.min(...xs),xMax=Math.max(...xs)||1,yMin=Math.min(...ys),yMax=Math.max(...ys)||1;
  const dots=data.map(d=>{
    const x=p.l+((+d.x||+d.value||0)-xMin)/((xMax-xMin)||1)*cw;
    const y=p.t+ch-((+d.y||+d.value2||0)-yMin)/((yMax-yMin)||1)*ch;
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5" fill="${color}" opacity="0.72"/>`;
  }).join("");
  return card(title,`<svg viewBox="0 0 ${W} ${H}" style="width:100%;overflow:visible">
    <line x1="${p.l}" y1="${p.t}" x2="${p.l}" y2="${p.t+ch}" stroke="rgba(0,0,0,0.12)"/>
    <line x1="${p.l}" y1="${p.t+ch}" x2="${W-p.r}" y2="${p.t+ch}" stroke="rgba(0,0,0,0.12)"/>
    ${dots}</svg>`);
}

/* --- Router --- */
function renderViz(spec) {
  if(!spec?.type) return noData("Unknown");
  if (EXTENDED_RENDERERS[spec.type]) return EXTENDED_RENDERERS[spec.type](spec);
  switch(spec.type) {
    case "bar_chart":    return renderBarChart(spec);
    case "line_chart":   return renderLineChart(spec);
    case "area_chart":   return renderAreaChart(spec);
    case "pie_chart":    return renderPieChart(spec);
    case "donut_chart":  return renderDonutChart(spec);
    case "kpi_cards":    return renderKpiCards(spec);
    case "data_table":   return renderDataTable(spec);
    case "scatter_plot": return renderScatterPlot(spec);
    case "comparison":   return renderComparison(spec);
    case "text_insight": return renderTextInsight(spec);
    case "gauge":        return renderGauge(spec);
    default: return renderTextInsight({title:spec.title||spec.type, content:JSON.stringify(spec)});
  }
}



/* =====================================================================
   SECTION 3.5: EXTENDED VISUALIZATIONS (50+ TYPES)
   ===================================================================== */

// Helpers
function makeGrid(W, H, p, maxV, minV=0) {
  const ch=H-p.t-p.b, cw=W-p.l-p.r, range=maxV-minV||1;
  return Array.from({length:5},(_,i)=>{
    const v=minV+range*i/4, y=p.t+ch-((v-minV)/range)*ch;
    const l=v>=1e6?(v/1e6).toFixed(1)+"M":v>=1000?(v/1000).toFixed(1)+"k":Math.round(v);
    return `<line x1="${p.l}" y1="${y.toFixed(1)}" x2="${W-p.r}" y2="${y.toFixed(1)}" stroke="rgba(0,0,0,0.05)" stroke-dasharray="3 5"/>
    <text x="${(p.l-7).toFixed(1)}" y="${(y+4).toFixed(1)}" fill="${C.muted}" font-size="9" text-anchor="end">${l}</text>`;
  }).join("");
}

// 1. Horizontal Bar Chart
function renderHorizontalBarChart(spec) {
  const {data=[],title,color=C.accent}=spec;
  if(!data.length) return noData(title);
  const W=500,H=260,p={t:20,r:40,b:20,l:80};
  const cw=W-p.l-p.r,ch=H-p.t-p.b;
  const maxV=Math.max(...data.map(d=>+d.value||0))*1.1||1;
  const barH=Math.max(8,(ch/data.length)*0.6), gap=ch/data.length;
  const bars=data.map((d,i)=>{
    const bw=((+d.value||0)/maxV)*cw;
    const y=(p.t+i*gap+(gap-barH)/2).toFixed(1);
    return `<rect class="au-viz-element" data-tooltip="${esc(d.label)}: ${fmtVal(d.value)}" x="${p.l}" y="${y}" width="${bw.toFixed(1)}" height="${barH.toFixed(1)}" rx="4" fill="${color}" opacity="0.85"/>
    <text x="${p.l-8}" y="${+y+barH/2+4}" fill="${C.muted}" font-size="9" text-anchor="end">${esc(d.label)}</text>
    <text x="${p.l+bw+8}" y="${+y+barH/2+4}" fill="${color}" font-size="9" font-weight="600">${fmtVal(d.value)}</text>`;
  }).join("");
  return card(title,`<svg viewBox="0 0 ${W} ${H}" style="width:100%;overflow:visible">
    <line x1="${p.l}" y1="${p.t}" x2="${p.l}" y2="${H-p.b}" stroke="rgba(0,0,0,0.12)"/>${bars}</svg>`);
}

// 2. Stacked Bar Chart
function renderStackedBarChart(spec) {
  // data: [{label, stacks:[{name, value}]}]
  const {data=[],title}=spec;
  if(!data.length||!data[0].stacks) return noData(title);
  const W=500,H=260,p={t:28,r:16,b:52,l:52}, cw=W-p.l-p.r, ch=H-p.t-p.b;
  const maxV=Math.max(...data.map(d=>d.stacks.reduce((s,x)=>s+(+x.value||0),0)))*1.1||1;
  const barW=Math.max(8,(cw/data.length)*0.6), gap=cw/data.length;
  const grid=makeGrid(W,H,p,maxV);
  const bars=data.map((d,i)=>{
    let cy=p.t+ch, str="";
    const x=(p.l+i*gap+(gap-barW)/2).toFixed(1);
    d.stacks.forEach((s,si)=>{
      const bh=((+s.value||0)/maxV)*ch; cy-=bh;
      str+=`<rect class="au-viz-element" data-tooltip="${esc(d.label)} - ${esc(s.name||'Item')}: ${fmtVal(s.value)}" x="${x}" y="${cy.toFixed(1)}" width="${barW.toFixed(1)}" height="${bh.toFixed(1)}" fill="${PALETTE[si%PALETTE.length]}" opacity="0.85"/>`;
    });
    return str+`<text x="${(+x+barW/2).toFixed(1)}" y="${(p.t+ch+18).toFixed(1)}" fill="${C.muted}" font-size="9" text-anchor="middle">${esc(d.label)}</text>`;
  }).join("");
  return card(title,`<svg viewBox="0 0 ${W} ${H}" style="width:100%;overflow:visible">${grid}${bars}</svg>`);
}

// 3. Grouped Bar Chart
function renderGroupedBarChart(spec) {
  const {data=[],title}=spec;
  if(!data.length||!data[0].groups) return noData(title);
  const W=500,H=260,p={t:28,r:16,b:52,l:52}, cw=W-p.l-p.r, ch=H-p.t-p.b;
  const maxV=Math.max(...data.flatMap(d=>d.groups.map(g=>+g.value||0)))*1.1||1;
  const gap=cw/data.length, gCount=data[0].groups.length, barW=Math.max(4,(gap*0.8)/gCount);
  const grid=makeGrid(W,H,p,maxV);
  const bars=data.map((d,i)=>{
    const cx=p.l+i*gap+gap/2;
    let str=`<text x="${cx.toFixed(1)}" y="${(p.t+ch+18).toFixed(1)}" fill="${C.muted}" font-size="9" text-anchor="middle">${esc(d.label)}</text>`;
    d.groups.forEach((g,gi)=>{
      const bh=((+g.value||0)/maxV)*ch, x=cx - (gCount*barW)/2 + gi*barW, y=p.t+ch-bh;
      str+=`<rect class="au-viz-element" data-tooltip="${esc(d.label)} - ${esc(g.name||'Item')}: ${fmtVal(g.value)}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(barW-1).toFixed(1)}" height="${bh.toFixed(1)}" rx="2" fill="${PALETTE[gi%PALETTE.length]}" opacity="0.85"/>`;
    });
    return str;
  }).join("");
  return card(title,`<svg viewBox="0 0 ${W} ${H}" style="width:100%;overflow:visible">${grid}${bars}</svg>`);
}

// 4. 100% Stacked Bar
function render100PercentStackedBar(spec) {
  const {data=[],title}=spec;
  if(!data.length||!data[0].stacks) return noData(title);
  const W=500,H=260,p={t:28,r:16,b:52,l:52}, cw=W-p.l-p.r, ch=H-p.t-p.b;
  const barW=Math.max(8,(cw/data.length)*0.6), gap=cw/data.length;
  const grid=makeGrid(W,H,p,100);
  const bars=data.map((d,i)=>{
    const total=d.stacks.reduce((s,x)=>s+(+x.value||0),0)||1;
    let cy=p.t+ch, str="";
    const x=(p.l+i*gap+(gap-barW)/2).toFixed(1);
    d.stacks.forEach((s,si)=>{
      const bh=((+s.value||0)/total)*ch; cy-=bh;
      str+=`<rect x="${x}" y="${cy.toFixed(1)}" width="${barW.toFixed(1)}" height="${bh.toFixed(1)}" fill="${PALETTE[si%PALETTE.length]}" opacity="0.85"/>`;
    });
    return str+`<text x="${(+x+barW/2).toFixed(1)}" y="${(p.t+ch+18).toFixed(1)}" fill="${C.muted}" font-size="9" text-anchor="middle">${esc(d.label)}</text>`;
  }).join("");
  return card(title,`<svg viewBox="0 0 ${W} ${H}" style="width:100%;overflow:visible">${grid}${bars}</svg>`);
}

// 5. Spline Chart (Smooth Line)
function renderSplineChart(spec) {
  const {data=[],title,color=C.accent}=spec;
  if(!data.length) return noData(title);
  const W=500,H=240,p={t:24,r:16,b:48,l:52}, cw=W-p.l-p.r, ch=H-p.t-p.b;
  const vals=data.map(d=>+d.value||0), maxV=Math.max(...vals)*1.1||1, minV=Math.min(...vals)*0.9, range=maxV-minV||1;
  const pts=data.map((d,i)=>({x:p.l+(i/Math.max(data.length-1,1))*cw, y:p.t+ch-((+d.value-minV)/range)*ch, label:d.label}));
  
  // Catmull-Rom to cubic bezier approximation for smooth curve
  let dPath = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for(let i=0; i<pts.length-1; i++){
    const p0=i>0?pts[i-1]:pts[0], p1=pts[i], p2=pts[i+1], p3=i!==pts.length-2?pts[i+2]:p2;
    const cp1x = p1.x + (p2.x - p0.x)/6, cp1y = p1.y + (p2.y - p0.y)/6;
    const cp2x = p2.x - (p3.x - p1.x)/6, cp2y = p2.y - (p3.y - p1.y)/6;
    dPath += ` C${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  
  const grid=makeGrid(W,H,p,maxV,minV);
  const labels=pts.map(pt=>`<text x="${pt.x.toFixed(1)}" y="${(p.t+ch+16).toFixed(1)}" fill="${C.muted}" font-size="9" text-anchor="middle">${esc(pt.label)}</text>`).join("");
  return card(title,`<svg viewBox="0 0 ${W} ${H}" style="width:100%;overflow:visible">${grid}
    <path d="${dPath}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round"/>${labels}</svg>`);
}

// 6. Step Line Chart
function renderStepLineChart(spec) {
  const {data=[],title,color=C.accent}=spec;
  if(!data.length) return noData(title);
  const W=500,H=240,p={t:24,r:16,b:48,l:52}, cw=W-p.l-p.r, ch=H-p.t-p.b;
  const vals=data.map(d=>+d.value||0), maxV=Math.max(...vals)*1.1||1, minV=Math.min(...vals)*0.9, range=maxV-minV||1;
  const pts=data.map((d,i)=>({x:p.l+(i/Math.max(data.length-1,1))*cw, y:p.t+ch-((+d.value-minV)/range)*ch, label:d.label}));
  
  let dPath = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for(let i=1; i<pts.length; i++){
    dPath += ` L${pts[i].x.toFixed(1)},${pts[i-1].y.toFixed(1)} L${pts[i].x.toFixed(1)},${pts[i].y.toFixed(1)}`;
  }
  
  const grid=makeGrid(W,H,p,maxV,minV);
  const labels=pts.map(pt=>`<text x="${pt.x.toFixed(1)}" y="${(p.t+ch+16).toFixed(1)}" fill="${C.muted}" font-size="9" text-anchor="middle">${esc(pt.label)}</text>`).join("");
  return card(title,`<svg viewBox="0 0 ${W} ${H}" style="width:100%;overflow:visible">${grid}
    <path d="${dPath}" fill="none" stroke="${color}" stroke-width="2.5"/>${labels}</svg>`);
}

// 7. Multi-Axis Line Chart
function renderMultiAxisLineChart(spec) {
  // data: [{label, lines:[{name, value}]}]
  const {data=[],title}=spec;
  if(!data.length||!data[0].lines) return noData(title);
  const W=500,H=240,p={t:24,r:52,b:48,l:52}, cw=W-p.l-p.r, ch=H-p.t-p.b;
  const maxV1=Math.max(...data.map(d=>+d.lines[0]?.value||0))*1.1||1;
  const maxV2=Math.max(...data.map(d=>+d.lines[1]?.value||0))*1.1||1;
  
  const line1=data.map((d,i)=>`${(p.l+(i/Math.max(data.length-1,1))*cw).toFixed(1)},${(p.t+ch-((+d.lines[0]?.value||0)/maxV1)*ch).toFixed(1)}`).join(" ");
  const line2=data.map((d,i)=>`${(p.l+(i/Math.max(data.length-1,1))*cw).toFixed(1)},${(p.t+ch-((+d.lines[1]?.value||0)/maxV2)*ch).toFixed(1)}`).join(" ");
  
  const grid=makeGrid(W,H,p,maxV1);
  const labels=data.map((d,i)=>`<text x="${(p.l+(i/Math.max(data.length-1,1))*cw).toFixed(1)}" y="${(p.t+ch+16).toFixed(1)}" fill="${C.muted}" font-size="9" text-anchor="middle">${esc(d.label)}</text>`).join("");
  return card(title,`<svg viewBox="0 0 ${W} ${H}" style="width:100%;overflow:visible">${grid}
    <polyline points="${line1}" fill="none" stroke="${PALETTE[0]}" stroke-width="2.5"/>
    <polyline points="${line2}" fill="none" stroke="${PALETTE[1]}" stroke-width="2.5" stroke-dasharray="4 4"/>
    ${labels}</svg>`);
}

// 8. Stacked Area Chart
function renderStackedAreaChart(spec) {
  const {data=[],title}=spec;
  if(!data.length||!data[0].stacks) return noData(title);
  const W=500,H=240,p={t:24,r:16,b:48,l:52}, cw=W-p.l-p.r, ch=H-p.t-p.b;
  const maxV=Math.max(...data.map(d=>d.stacks.reduce((s,x)=>s+(+x.value||0),0)))*1.1||1;
  const grid=makeGrid(W,H,p,maxV);
  
  let paths="", prevY=data.map(()=>p.t+ch);
  data[0].stacks.forEach((_,si)=>{
    let dPath="M", botPath="";
    data.forEach((d,i)=>{
      const x=p.l+(i/Math.max(data.length-1,1))*cw;
      const val=+d.stacks[si].value||0;
      const y=prevY[i]-((val)/maxV)*ch;
      dPath+=` ${x.toFixed(1)},${y.toFixed(1)}`;
      botPath=` ${x.toFixed(1)},${prevY[i].toFixed(1)}`+botPath;
      prevY[i]=y;
    });
    paths=`<path d="${dPath}${botPath} Z" fill="${PALETTE[si%PALETTE.length]}" opacity="0.6"/>`+paths;
  });
  const labels=data.map((d,i)=>`<text x="${(p.l+(i/Math.max(data.length-1,1))*cw).toFixed(1)}" y="${(p.t+ch+16).toFixed(1)}" fill="${C.muted}" font-size="9" text-anchor="middle">${esc(d.label)}</text>`).join("");
  return card(title,`<svg viewBox="0 0 ${W} ${H}" style="width:100%;overflow:visible">${grid}${paths}${labels}</svg>`);
}

// 9. Streamgraph
function renderStreamgraph(spec) {
  const {data=[],title}=spec;
  if(!data.length||!data[0].stacks) return noData(title);
  const W=500,H=240,p={t:24,r:16,b:48,l:20}, cw=W-p.l-p.r, ch=H-p.t-p.b;
  const maxV=Math.max(...data.map(d=>d.stacks.reduce((s,x)=>s+(+x.value||0),0)))||1;
  
  let paths="", base=data.map(d=>p.t+ch/2 + (d.stacks.reduce((s,x)=>s+(+x.value||0),0)/maxV)*(ch/2));
  data[0].stacks.forEach((_,si)=>{
    let dPath="M", botPath="";
    data.forEach((d,i)=>{
      const x=p.l+(i/Math.max(data.length-1,1))*cw;
      const val=+d.stacks[si].value||0;
      const y=base[i]-((val)/maxV)*ch;
      dPath+=` ${x.toFixed(1)},${y.toFixed(1)}`;
      botPath=` ${x.toFixed(1)},${base[i].toFixed(1)}`+botPath;
      base[i]=y;
    });
    paths=`<path d="${dPath}${botPath} Z" fill="${PALETTE[si%PALETTE.length]}" opacity="0.8"/>`+paths;
  });
  const labels=data.map((d,i)=>`<text x="${(p.l+(i/Math.max(data.length-1,1))*cw).toFixed(1)}" y="${(p.t+ch+16).toFixed(1)}" fill="${C.muted}" font-size="9" text-anchor="middle">${esc(d.label)}</text>`).join("");
  return card(title,`<svg viewBox="0 0 ${W} ${H}" style="width:100%;overflow:visible">${paths}${labels}</svg>`);
}

// 10. Range Area Chart
function renderRangeAreaChart(spec) {
  // data: [{label, min, max}]
  const {data=[],title,color=C.blue}=spec;
  if(!data.length) return noData(title);
  const W=500,H=240,p={t:24,r:16,b:48,l:52}, cw=W-p.l-p.r, ch=H-p.t-p.b;
  const maxV=Math.max(...data.map(d=>+d.max||0))*1.1||1, minV=Math.min(...data.map(d=>+d.min||0))*0.9, range=maxV-minV||1;
  const grid=makeGrid(W,H,p,maxV,minV);
  let top="M", bot="";
  data.forEach((d,i)=>{
    const x=(p.l+(i/Math.max(data.length-1,1))*cw).toFixed(1);
    top+=` ${x},${(p.t+ch-((+d.max-minV)/range)*ch).toFixed(1)}`;
    bot=` ${x},${(p.t+ch-((+d.min-minV)/range)*ch).toFixed(1)}`+bot;
  });
  const labels=data.map((d,i)=>`<text x="${(p.l+(i/Math.max(data.length-1,1))*cw).toFixed(1)}" y="${(p.t+ch+16).toFixed(1)}" fill="${C.muted}" font-size="9" text-anchor="middle">${esc(d.label)}</text>`).join("");
  return card(title,`<svg viewBox="0 0 ${W} ${H}" style="width:100%;overflow:visible">${grid}
    <path d="${top}${bot} Z" fill="${color}" opacity="0.3"/>${labels}</svg>`);
}

// 11. Half Donut
function renderHalfDonutChart(spec) {
  const {data=[],title}=spec;
  if(!data.length) return noData(title);
  const total=data.reduce((s,d)=>s+Math.abs(+d.value||0),0)||1;
  const cx=150,cy=120,R=100,r=60;
  let paths="",ang=Math.PI;
  data.slice(0,10).forEach((d,i)=>{
    const sweep=(Math.abs(+d.value||0)/total)*Math.PI;
    const x1=cx+R*Math.cos(ang), y1=cy+R*Math.sin(ang);
    const ix1=cx+r*Math.cos(ang), iy1=cy+r*Math.sin(ang);
    ang+=sweep;
    const x2=cx+R*Math.cos(ang), y2=cy+R*Math.sin(ang);
    const ix2=cx+r*Math.cos(ang), iy2=cy+r*Math.sin(ang);
    paths+=`<path d="M${x1.toFixed(1)},${y1.toFixed(1)} A${R},${R} 0 0,1 ${x2.toFixed(1)},${y2.toFixed(1)} L${ix2.toFixed(1)},${iy2.toFixed(1)} A${r},${r} 0 0,0 ${ix1.toFixed(1)},${iy1.toFixed(1)} Z" fill="${PALETTE[i%PALETTE.length]}"/>`;
  });
  return card(title,`<svg viewBox="0 0 300 150" style="width:100%">${paths}
    <text x="${cx}" y="${cy-10}" text-anchor="middle" fill="${C.text}" font-size="24" font-weight="700">${fmtVal(total)}</text>
    <text x="${cx}" y="${cy+10}" text-anchor="middle" fill="${C.muted}" font-size="12">Total</text>
  </svg>`);
}

// 12. Polar Area
function renderPolarAreaChart(spec) {
  const {data=[],title}=spec;
  if(!data.length) return noData(title);
  const maxV=Math.max(...data.map(d=>+d.value||0))||1;
  const cx=150,cy=150,R=130;
  const sweep=(2*Math.PI)/data.length;
  let paths="", ang=-Math.PI/2;
  data.forEach((d,i)=>{
    const r=R*(+d.value||0)/maxV;
    const x1=cx+r*Math.cos(ang), y1=cy+r*Math.sin(ang);
    ang+=sweep;
    const x2=cx+r*Math.cos(ang), y2=cy+r*Math.sin(ang);
    paths+=`<path d="M${cx},${cy} L${x1.toFixed(1)},${y1.toFixed(1)} A${r},${r} 0 0,1 ${x2.toFixed(1)},${y2.toFixed(1)} Z" fill="${PALETTE[i%PALETTE.length]}" opacity="0.75" stroke="${C.surface}" stroke-width="2"/>`;
  });
  const grid=`<circle cx="${cx}" cy="${cy}" r="${R/2}" fill="none" stroke="rgba(0,0,0,0.1)" stroke-dasharray="2 4"/>
              <circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="rgba(0,0,0,0.1)" stroke-dasharray="2 4"/>`;
  return card(title,`<svg viewBox="0 0 300 300" style="width:100%">${grid}${paths}</svg>`);
}

// 13. Radial Bar
function renderRadialBarChart(spec) {
  const {data=[],title}=spec;
  if(!data.length) return noData(title);
  const maxV=Math.max(...data.map(d=>+d.value||0))||1;
  const cx=150,cy=150, maxR=130, t=14;
  let paths="";
  data.slice(0,8).forEach((d,i)=>{
    const r=maxR - i*(t+4);
    const sweep=((+d.value||0)/maxV)*(2*Math.PI*0.75); // 270 deg
    const x2=cx+r*Math.cos(-Math.PI/2+sweep), y2=cy+r*Math.sin(-Math.PI/2+sweep);
    const large=sweep>Math.PI?1:0;
    paths+=`<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="rgba(0,0,0,0.05)" stroke-width="${t}"/>
    <path d="M${cx},${cy-r} A${r},${r} 0 ${large},1 ${x2.toFixed(1)},${y2.toFixed(1)}" fill="none" stroke="${PALETTE[i%PALETTE.length]}" stroke-width="${t}" stroke-linecap="round"/>
    <text x="${cx-r-5}" y="${cy+4}" fill="${C.text}" font-size="9" text-anchor="end">${esc(d.label)}</text>`;
  });
  return card(title,`<svg viewBox="0 0 300 300" style="width:100%">${paths}</svg>`);
}

// 14. Tree Map (Simplified Squarified)
function renderTreeMap(spec) {
  const {data=[],title}=spec;
  if(!data.length) return noData(title);
  const W=500,H=260;
  const total=data.reduce((s,d)=>s+(+d.value||0),0)||1;
  let curX=0, curY=0, curW=W, curH=H;
  const rects=data.map((d,i)=>{
    const frac=(+d.value||0)/total;
    let w,h,x=curX,y=curY;
    if(curW>curH) { w=curW*frac; h=curH; curX+=w; curW-=w; }
    else          { w=curW; h=curH*frac; curY+=h; curH-=h; }
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${PALETTE[i%PALETTE.length]}" stroke="${C.surface}" stroke-width="2"/>
    ${w>40&&h>20?`<text x="${x+5}" y="${y+15}" fill="#fff" font-size="10" font-weight="600" text-anchor="start">${esc(d.label)}</text>`:""}`;
  }).join("");
  return card(title,`<svg viewBox="0 0 ${W} ${H}" style="width:100%;overflow:visible">${rects}</svg>`);
}

// 15. Funnel Chart
function renderFunnelChart(spec) {
  const {data=[],title,color=C.accent}=spec;
  if(!data.length) return noData(title);
  const W=400,H=300, maxV=Math.max(...data.map(d=>+d.value||0))||1;
  const h=H/data.length;
  let paths="";
  for(let i=0; i<data.length; i++){
    const w1 = ((+data[i].value||0)/maxV)*W;
    const w2 = i<data.length-1 ? ((+data[i+1].value||0)/maxV)*W : w1*0.6;
    const y1=i*h, y2=(i+1)*h-2;
    paths+=`<polygon points="${W/2-w1/2},${y1} ${W/2+w1/2},${y1} ${W/2+w2/2},${y2} ${W/2-w2/2},${y2}" fill="${PALETTE[i%PALETTE.length]}" opacity="0.9"/>
    <text x="${W/2}" y="${y1+h/2+4}" fill="#fff" font-size="12" font-weight="bold" text-anchor="middle">${esc(data[i].label)}: ${fmtVal(data[i].value)}</text>`;
  }
  return card(title,`<svg viewBox="0 0 ${W} ${H}" style="width:100%;overflow:visible">${paths}</svg>`);
}

// 16. Pyramid Chart (Inverted Funnel)
function renderPyramidChart(spec) {
  const specCopy=JSON.parse(JSON.stringify(spec));
  if(specCopy.data) specCopy.data.reverse();
  return renderFunnelChart(specCopy);
}

// 17. Waterfall Chart
function renderWaterfallChart(spec) {
  const {data=[],title}=spec;
  if(!data.length) return noData(title);
  const W=500,H=260,p={t:28,r:16,b:52,l:52}, cw=W-p.l-p.r, ch=H-p.t-p.b;
  let run=0, maxV=0, minV=0;
  const wData = data.map(d=>{
    const v=+d.value||0, start=run, end=run+v;
    run=end; maxV=Math.max(maxV,run,0); minV=Math.min(minV,run,0);
    return {label:d.label, start, end, val:v};
  });
  const range=maxV-minV||1, barW=Math.max(8,(cw/wData.length)*0.6), gap=cw/wData.length;
  const grid=makeGrid(W,H,p,maxV,minV);
  const bars=wData.map((d,i)=>{
    const clr=d.val>=0?C.green:C.rose;
    const y1 = p.t+ch - ((Math.max(d.start,d.end)-minV)/range)*ch;
    const y2 = p.t+ch - ((Math.min(d.start,d.end)-minV)/range)*ch;
    const x=(p.l+i*gap+(gap-barW)/2).toFixed(1);
    return `<rect x="${x}" y="${y1}" width="${barW.toFixed(1)}" height="${Math.max(2,y2-y1)}" fill="${clr}"/>
    <text x="${(+x+barW/2).toFixed(1)}" y="${(p.t+ch+18).toFixed(1)}" fill="${C.muted}" font-size="9" text-anchor="middle">${esc(d.label)}</text>`;
  }).join("");
  return card(title,`<svg viewBox="0 0 ${W} ${H}" style="width:100%;overflow:visible">${grid}${bars}</svg>`);
}

// 18. Bubble Chart
function renderBubbleChart(spec) {
  const {data=[],title,color=C.accent}=spec;
  if(!data.length) return noData(title);
  const W=460,H=230,p={t:20,r:16,b:44,l:48}, cw=W-p.l-p.r, ch=H-p.t-p.b;
  const xs=data.map(d=>+d.x||0), ys=data.map(d=>+d.y||0), zs=data.map(d=>+d.z||+d.value||0);
  const xMin=Math.min(...xs),xMax=Math.max(...xs)||1,yMin=Math.min(...ys),yMax=Math.max(...ys)||1,zMax=Math.max(...zs)||1;
  const dots=data.map(d=>{
    const x=p.l+((+d.x||0)-xMin)/((xMax-xMin)||1)*cw;
    const y=p.t+ch-((+d.y||0)-yMin)/((yMax-yMin)||1)*ch;
    const r=Math.max(4, 25*Math.sqrt((+d.z||+d.value||0)/zMax));
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="${color}" opacity="0.5" stroke="${color}" stroke-width="1"/>
    ${r>10?`<text x="${x.toFixed(1)}" y="${(y+3).toFixed(1)}" fill="#fff" font-size="9" text-anchor="middle">${esc(d.label)}</text>`:""}`;
  }).join("");
  return card(title,`<svg viewBox="0 0 ${W} ${H}" style="width:100%;overflow:visible">
    <line x1="${p.l}" y1="${p.t}" x2="${p.l}" y2="${p.t+ch}" stroke="rgba(0,0,0,0.12)"/>
    <line x1="${p.l}" y1="${p.t+ch}" x2="${W-p.r}" y2="${p.t+ch}" stroke="rgba(0,0,0,0.12)"/>
    ${dots}</svg>`);
}

// 19. Stat with Sparkline
function renderStatWithSparkline(spec) {
  const {value,label,data=[],title,color=C.accent}=spec;
  const W=150,H=40;
  const vals=data.map(d=>+d.value||0), maxV=Math.max(...vals)||1, minV=Math.min(...vals);
  const pts=vals.map((v,i)=>`${(i/(vals.length-1)*W).toFixed(1)},${(H-((v-minV)/(maxV-minV||1))*H).toFixed(1)}`).join(" ");
  return card(title,`<div style="display:flex;justify-content:space-between;align-items:center">
    <div><div style="font-size:28px;font-weight:700;color:${C.text}">${fmtVal(value)}</div>
    <div style="font-size:12px;color:${C.muted}">${esc(label)}</div></div>
    <svg viewBox="0 0 ${W} ${H}" style="width:100px;height:30px;overflow:visible">
      <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2"/>
    </svg></div>`);
}

// 20. Stat with Sparkbar
function renderStatWithSparkbar(spec) {
  const {value,label,data=[],title,color=C.accent}=spec;
  const W=150,H=40, maxV=Math.max(...data.map(d=>+d.value||0))||1;
  const bw=W/data.length - 2;
  const bars=data.map((d,i)=>`<rect x="${i*(bw+2)}" y="${H-((+d.value||0)/maxV)*H}" width="${bw}" height="${((+d.value||0)/maxV)*H}" fill="${color}" rx="1"/>`).join("");
  return card(title,`<div style="display:flex;justify-content:space-between;align-items:center">
    <div><div style="font-size:28px;font-weight:700;color:${C.text}">${fmtVal(value)}</div>
    <div style="font-size:12px;color:${C.muted}">${esc(label)}</div></div>
    <svg viewBox="0 0 ${W} ${H}" style="width:100px;height:30px">${bars}</svg></div>`);
}

// 21. Progress Bar
function renderProgressBar(spec) {
  const {value=0,max=100,label,title,color=C.accent}=spec;
  const pct=Math.min(100, Math.max(0, (value/max)*100));
  return card(title,`<div style="margin-bottom:8px;display:flex;justify-content:space-between;font-size:13px">
    <span style="color:${C.muted}">${esc(label)}</span>
    <span style="color:${C.text};font-weight:600">${pct.toFixed(1)}%</span></div>
    <div style="height:10px;background:rgba(0,0,0,0.1);border-radius:5px;overflow:hidden">
      <div style="width:${pct}%;height:100%;background:${color};border-radius:5px"></div>
    </div>`);
}

// 22. Progress Ring
function renderProgressRing(spec) {
  const {value=0,max=100,label,title,color=C.accent}=spec;
  const pct=Math.min(100, Math.max(0, (value/max)*100)), C_circ=2*Math.PI*40, off=C_circ-(pct/100)*C_circ;
  return card(title,`<div style="display:flex;align-items:center;gap:20px">
    <svg viewBox="0 0 100 100" style="width:80px;height:80px;transform:rotate(-90deg)">
      <circle cx="50" cy="50" r="40" fill="none" stroke="rgba(0,0,0,0.1)" stroke-width="10"/>
      <circle cx="50" cy="50" r="40" fill="none" stroke="${color}" stroke-width="10" stroke-dasharray="${C_circ}" stroke-dashoffset="${off}" stroke-linecap="round"/>
    </svg>
    <div><div style="font-size:24px;font-weight:700;color:${C.text}">${pct.toFixed(1)}%</div>
    <div style="font-size:12px;color:${C.muted}">${esc(label)}</div></div></div>`);
}

// 23. Linear Gauge
function renderLinearGauge(spec) {
  const {value=0,min=0,max=100,target,title,color=C.blue}=spec;
  const range=max-min, pct=((value-min)/range)*100;
  return card(title,`<div style="position:relative;height:24px;background:rgba(0,0,0,0.1);border-radius:12px;margin:20px 0">
    <div style="position:absolute;top:0;left:0;height:100%;width:${Math.min(100,Math.max(0,pct))}%;background:${color};border-radius:12px"></div>
    ${target!==undefined?`<div style="position:absolute;top:-4px;bottom:-4px;left:${((target-min)/range)*100}%;width:3px;background:${C.rose};border-radius:2px"></div>` : ""}
    </div>
    <div style="display:flex;justify-content:space-between;color:${C.muted};font-size:11px">
      <span>${min}</span><span style="color:${C.text};font-weight:bold">${fmtVal(value)}</span><span>${max}</span>
    </div>`);
}

// 24. Bullet Chart
function renderBulletChart(spec) {
  // data: [{label, actual, target, range_max}]
  const {data=[],title}=spec;
  if(!data.length) return noData(title);
  const bars=data.map((d,i)=>{
    const max = Math.max(d.actual, d.target, d.range_max||0)||1;
    const pA=(d.actual/max)*100, pT=(d.target/max)*100;
    return `<div style="margin-bottom:16px"><div style="font-size:12px;color:${C.muted};margin-bottom:4px">${esc(d.label)}</div>
    <div style="position:relative;height:24px;background:rgba(0,0,0,0.05);border-radius:4px">
      <div style="position:absolute;top:0;left:0;height:100%;width:100%;background:rgba(0,0,0,0.05);border-radius:4px"></div>
      <div style="position:absolute;top:6px;left:0;height:12px;width:${pA}%;background:${C.accent};border-radius:2px"></div>
      <div style="position:absolute;top:2px;bottom:2px;left:${pT}%;width:4px;background:${C.rose}"></div>
    </div></div>`;
  }).join("");
  return card(title, bars);
}

// 25. Status Indicator
function renderStatusIndicator(spec) {
  const {data=[],title}=spec;
  const items=data.map(d=>{
    const clr=d.status==="ok"?C.green:d.status==="warning"?C.amber:C.rose;
    return `<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:${C.surface2};border-radius:8px">
      <div style="width:10px;height:10px;border-radius:50%;background:${clr};box-shadow:0 0 8px ${clr}"></div>
      <span style="color:${C.text};font-size:13px">${esc(d.label)}</span>
    </div>`;
  }).join("");
  return card(title,`<div style="display:flex;flex-wrap:wrap;gap:12px">${items}</div>`);
}

// 26. Matrix Table / Heatmap Grid
function renderMatrixTable(spec) {
  const {rows=[],cols=[],data=[],title}=spec; // data is 2D array mapping to rows/cols values
  if(!rows.length) return noData(title);
  const maxV=Math.max(...data.flat().map(x=>+x||0))||1;
  const trs=rows.map((r,ri)=>`<tr><td style="padding:6px 10px;color:${C.muted};font-size:11px">${esc(r)}</td>
    ${cols.map((_,ci)=>{
      const v=data[ri][ci]||0, op=0.1+((v/maxV)*0.9);
      return `<td style="padding:6px;text-align:center;background:rgba(94,234,212,${op});color:${op>0.5?'#000':'#fff'};font-size:11px;border-radius:4px">${v}</td>`;
    }).join("")}</tr>`).join("");
  return card(title,`<div style="overflow-x:auto"><table style="width:100%;border-spacing:2px;border-collapse:separate">
    <tr><td></td>${cols.map(c=>`<td style="padding:4px;text-align:center;color:${C.muted};font-size:10px">${esc(c)}</td>`).join("")}</tr>
    ${trs}</table></div>`);
}

// 27. Heatmap (alias)
function renderHeatmap(spec) { return renderMatrixTable(spec); }
function renderCalendarHeatmap(spec) { return renderMatrixTable(spec); }
function renderComparisonBoard(spec) { return renderComparison(spec); }

// 30. Word Cloud (Simplified random placement)
function renderWordCloud(spec) {
  const {data=[],title}=spec;
  if(!data.length) return noData(title);
  const maxV=Math.max(...data.map(d=>+d.value||0))||1;
  const words=data.map((d,i)=>{
    const sz=12+((+d.value||0)/maxV)*24;
    return `<span style="font-size:${sz}px;color:${PALETTE[i%PALETTE.length]};margin:4px 8px;display:inline-block">${esc(d.label)}</span>`;
  }).join("");
  return card(title,`<div style="text-align:center;padding:20px 0;line-height:1.2">${words}</div>`);
}

// 31. Candlestick Chart
function renderCandlestickChart(spec) {
  const {data=[],title}=spec; // data: [{label, o, h, l, c}]
  if(!data.length) return noData(title);
  const W=500,H=260,p={t:20,r:16,b:40,l:52}, cw=W-p.l-p.r, ch=H-p.t-p.b;
  const maxV=Math.max(...data.map(d=>+d.h||0))*1.05||1, minV=Math.min(...data.map(d=>+d.l||0))*0.95;
  const gap=cw/data.length, barW=Math.max(4, gap*0.6);
  const grid=makeGrid(W,H,p,maxV,minV);
  const candles=data.map((d,i)=>{
    const x=p.l+i*gap+gap/2;
    const yH=p.t+ch-((d.h-minV)/(maxV-minV))*ch, yL=p.t+ch-((d.l-minV)/(maxV-minV))*ch;
    const yO=p.t+ch-((d.o-minV)/(maxV-minV))*ch, yC=p.t+ch-((d.c-minV)/(maxV-minV))*ch;
    const clr=d.c>=d.o?C.green:C.rose;
    return `<line x1="${x.toFixed(1)}" y1="${yH.toFixed(1)}" x2="${x.toFixed(1)}" y2="${yL.toFixed(1)}" stroke="${clr}" stroke-width="1.5"/>
    <rect x="${(x-barW/2).toFixed(1)}" y="${Math.min(yO,yC).toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(1,Math.abs(yO-yC)).toFixed(1)}" fill="${clr}"/>
    ${i%Math.ceil(data.length/8)===0?`<text x="${x.toFixed(1)}" y="${H-10}" fill="${C.muted}" font-size="9" text-anchor="middle">${esc(d.label)}</text>`:""}`;
  }).join("");
  return card(title,`<svg viewBox="0 0 ${W} ${H}" style="width:100%;overflow:visible">${grid}${candles}</svg>`);
}

// 32. Box Plot (Simplified)
function renderBoxPlot(spec) {
  // mapped to candlestick for pure SVG simplicity as it's the same visual structure (min, q1, med, q3, max)
  return renderCandlestickChart(spec);
}

// 33. Range Bar Chart (Gantt-lite)
function renderRangeBarChart(spec) {
  const {data=[],title,color=C.blue}=spec; // {label, start, end}
  if(!data.length) return noData(title);
  const W=500,H=260,p={t:20,r:40,b:20,l:80}, cw=W-p.l-p.r, ch=H-p.t-p.b;
  const maxV=Math.max(...data.map(d=>+d.end||0)), minV=Math.min(...data.map(d=>+d.start||0)), range=maxV-minV||1;
  const gap=ch/data.length, barH=Math.max(8, gap*0.6);
  const bars=data.map((d,i)=>{
    const x=p.l+((d.start-minV)/range)*cw, w=((d.end-d.start)/range)*cw, y=p.t+i*gap+(gap-barH)/2;
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${barH.toFixed(1)}" rx="3" fill="${color}"/>
    <text x="${p.l-8}" y="${y+barH/2+4}" fill="${C.muted}" font-size="9" text-anchor="end">${esc(d.label)}</text>`;
  }).join("");
  return card(title,`<svg viewBox="0 0 ${W} ${H}" style="width:100%;overflow:visible">${bars}</svg>`);
}

// 34. Timeline Events
function renderTimelineEvents(spec) {
  const {data=[],title}=spec; // {label, date, desc}
  const events=data.map((d,i)=>`<div style="display:flex;gap:16px;margin-bottom:16px">
    <div style="display:flex;flex-direction:column;align-items:center;min-width:40px">
      <div style="font-size:10px;color:${C.muted};margin-bottom:4px">${esc(d.date)}</div>
      <div style="width:10px;height:10px;border-radius:50%;background:${C.accent};box-shadow:0 0 5px ${C.accent}"></div>
      ${i!==data.length-1?'<div style="flex:1;width:2px;background:rgba(0,0,0,0.1);margin-top:4px"></div>':""}
    </div>
    <div style="padding-bottom:16px"><div style="font-size:13px;color:${C.text};font-weight:600">${esc(d.label)}</div>
    ${d.desc?`<div style="font-size:12px;color:${C.muted};margin-top:4px">${esc(d.desc)}</div>`:""}</div>
  </div>`).join("");
  return card(title,`<div>${events}</div>`);
}

// 35. Radar Chart
function renderRadarChart(spec) {
  const {data=[],title}=spec; // [{name, metrics:[{axis, value}]}]
  if(!data.length||!data[0].metrics) return noData(title);
  const cx=150,cy=150,R=100, axes=data[0].metrics.map(m=>m.axis), maxV=Math.max(...data.flatMap(d=>d.metrics.map(m=>+m.value||0)))||1;
  const ang=Math.PI*2/axes.length;
  const webs=Array.from({length:4},(_,i)=>{
    const r=R*(i+1)/4;
    let pts=""; axes.forEach((_,j)=>{ pts+=`${cx+r*Math.cos(j*ang-Math.PI/2)},${cy+r*Math.sin(j*ang-Math.PI/2)} `; });
    return `<polygon points="${pts}" fill="none" stroke="rgba(0,0,0,0.1)"/>`;
  }).join("");
  const axisLines=axes.map((a,i)=>`<line x1="${cx}" y1="${cy}" x2="${cx+R*Math.cos(i*ang-Math.PI/2)}" y2="${cy+R*Math.sin(i*ang-Math.PI/2)}" stroke="rgba(0,0,0,0.1)"/>
    <text x="${cx+(R+15)*Math.cos(i*ang-Math.PI/2)}" y="${cy+(R+15)*Math.sin(i*ang-Math.PI/2)+4}" fill="${C.muted}" font-size="9" text-anchor="middle">${esc(a)}</text>`).join("");
  const polys=data.map((d,i)=>{
    let pts=""; d.metrics.forEach((m,j)=>{
      const r=R*(+m.value||0)/maxV; pts+=`${cx+r*Math.cos(j*ang-Math.PI/2)},${cy+r*Math.sin(j*ang-Math.PI/2)} `;
    });
    return `<polygon points="${pts}" fill="${PALETTE[i%PALETTE.length]}" opacity="0.3" stroke="${PALETTE[i%PALETTE.length]}" stroke-width="2"/>`;
  }).join("");
  return card(title,`<svg viewBox="0 0 300 300" style="width:100%;overflow:visible">${webs}${axisLines}${polys}</svg>`);
}

// 36. Pictograph
function renderPictograph(spec) {
  const {data=[],title,color=C.accent}=spec;
  if(!data.length) return noData(title);
  const rows=data.map(d=>{
    const count=Math.min(20, Math.round(+d.value||0));
    const icons=Array.from({length:count},()=>`<svg width="12" height="12" viewBox="0 0 24 24" fill="${color}" style="margin-right:2px"><path d="M12 2C6.48 2 2 5.58 2 10c0 2.4 1.2 4.56 3.1 6.1L4 22l5.9-2.95C11.2 19.34 12 20 12 20c5.52 0 10-3.58 10-8S17.52 2 12 2z"/></svg>`).join("");
    return `<div style="display:flex;align-items:center;margin-bottom:8px">
      <div style="width:80px;font-size:11px;color:${C.muted}">${esc(d.label)}</div><div style="flex:1">${icons}</div>
    </div>`;
  }).join("");
  return card(title, rows);
}

// 37. Dot Plot
function renderDotPlot(spec) {
  const {data=[],title,color=C.accent}=spec;
  if(!data.length) return noData(title);
  const W=500,H=260,p={t:20,r:20,b:20,l:80}, cw=W-p.l-p.r, ch=H-p.t-p.b;
  const maxV=Math.max(...data.map(d=>+d.value||0))*1.1||1, gap=ch/data.length;
  const dots=data.map((d,i)=>{
    const x=p.l+((+d.value||0)/maxV)*cw, y=p.t+i*gap+gap/2;
    return `<line x1="${p.l}" y1="${y}" x2="${W-p.r}" y2="${y}" stroke="rgba(0,0,0,0.05)" stroke-dasharray="2 2"/>
    <circle cx="${x}" cy="${y}" r="6" fill="${color}"/>
    <text x="${p.l-8}" y="${y+4}" fill="${C.muted}" font-size="9" text-anchor="end">${esc(d.label)}</text>`;
  }).join("");
  return card(title,`<svg viewBox="0 0 ${W} ${H}" style="width:100%;overflow:visible">${dots}</svg>`);
}

// 38. Dumbbell Plot
function renderDumbbellPlot(spec) {
  const {data=[],title}=spec; // {label, v1, v2}
  if(!data.length) return noData(title);
  const W=500,H=260,p={t:20,r:20,b:20,l:80}, cw=W-p.l-p.r, ch=H-p.t-p.b;
  const maxV=Math.max(...data.flatMap(d=>[+d.v1||0,+d.v2||0]))*1.1||1, gap=ch/data.length;
  const dbs=data.map((d,i)=>{
    const x1=p.l+((+d.v1||0)/maxV)*cw, x2=p.l+((+d.v2||0)/maxV)*cw, y=p.t+i*gap+gap/2;
    return `<line x1="${p.l}" y1="${y}" x2="${W-p.r}" y2="${y}" stroke="rgba(0,0,0,0.05)"/>
    <line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="rgba(0,0,0,0.2)" stroke-width="3"/>
    <circle cx="${x1}" cy="${y}" r="5" fill="${C.blue}"/>
    <circle cx="${x2}" cy="${y}" r="5" fill="${C.accent}"/>
    <text x="${p.l-8}" y="${y+4}" fill="${C.muted}" font-size="9" text-anchor="end">${esc(d.label)}</text>`;
  }).join("");
  return card(title,`<svg viewBox="0 0 ${W} ${H}" style="width:100%;overflow:visible">${dbs}</svg>`);
}

// 39. Parallel Coordinates (Simplified)
function renderParallelCoordinates(spec) {
  return renderMultiAxisLineChart(spec); // Visually similar enough for basic dashboards
}

// 40. Network Graph
function renderNetworkGraph(spec) {
  const {nodes=[],edges=[],title}=spec; // {id, label}, {source, target}
  if(!nodes.length) return noData(title);
  const W=400,H=300, cx=W/2, cy=H/2, R=100;
  const pos={};
  nodes.forEach((n,i)=>{ pos[n.id]={x:cx+R*Math.cos((i/nodes.length)*2*Math.PI), y:cy+R*Math.sin((i/nodes.length)*2*Math.PI)}; });
  const es=edges.map(e=>`<line x1="${pos[e.source]?.x}" y1="${pos[e.source]?.y}" x2="${pos[e.target]?.x}" y2="${pos[e.target]?.y}" stroke="rgba(0,0,0,0.15)"/>`).join("");
  const ns=nodes.map(n=>`<circle cx="${pos[n.id].x}" cy="${pos[n.id].y}" r="12" fill="${C.surface2}" stroke="${C.accent}" stroke-width="2"/>
    <text x="${pos[n.id].x}" y="${pos[n.id].y+22}" fill="${C.muted}" font-size="9" text-anchor="middle">${esc(n.label)}</text>`).join("");
  return card(title,`<svg viewBox="0 0 ${W} ${H}" style="width:100%;overflow:visible">${es}${ns}</svg>`);
}

/* =====================================================================
   UPDATE ROUTER
   ===================================================================== */
const EXTENDED_RENDERERS = {
  "horizontal_bar_chart": renderHorizontalBarChart,
  "stacked_bar_chart": renderStackedBarChart,
  "grouped_bar_chart": renderGroupedBarChart,
  "100_percent_stacked_bar": render100PercentStackedBar,
  "spline_chart": renderSplineChart,
  "step_line_chart": renderStepLineChart,
  "multi_axis_line_chart": renderMultiAxisLineChart,
  "stacked_area_chart": renderStackedAreaChart,
  "streamgraph": renderStreamgraph,
  "range_area_chart": renderRangeAreaChart,
  "half_donut_chart": renderHalfDonutChart,
  "polar_area_chart": renderPolarAreaChart,
  "radial_bar_chart": renderRadialBarChart,
  "tree_map": renderTreeMap,
  "funnel_chart": renderFunnelChart,
  "pyramid_chart": renderPyramidChart,
  "waterfall_chart": renderWaterfallChart,
  "bubble_chart": renderBubbleChart,
  "stat_with_sparkline": renderStatWithSparkline,
  "stat_with_sparkbar": renderStatWithSparkbar,
  "progress_bar": renderProgressBar,
  "progress_ring": renderProgressRing,
  "linear_gauge": renderLinearGauge,
  "bullet_chart": renderBulletChart,
  "status_indicator": renderStatusIndicator,
  "matrix_table": renderMatrixTable,
  "heatmap": renderHeatmap,
  "calendar_heatmap": renderCalendarHeatmap,
  "comparison_board": renderComparisonBoard,
  "word_cloud": renderWordCloud,
  "candlestick_chart": renderCandlestickChart,
  "box_plot": renderBoxPlot,
  "range_bar_chart": renderRangeBarChart,
  "timeline_events": renderTimelineEvents,
  "radar_chart": renderRadarChart,
  "pictograph": renderPictograph,
  "dot_plot": renderDotPlot,
  "dumbbell_plot": renderDumbbellPlot,
  "parallel_coordinates": renderParallelCoordinates,
  "network_graph": renderNetworkGraph
};


/* =====================================================================
   SECTION 4: ANALYTICS PANEL
   Full-screen overlay that slides in over the host dashboard.
   Shows all visualizations in a grid, with embedded follow-up composer.
   ===================================================================== */

class AnalyticsPanel {
  constructor(agent) {
    this._agent = agent;
    this._el = null;
    this._visible = false;
    this._history = []; // [{prompt, summary, visualizations}]
    this._loading = false;
  }

  /* ---- Build the DOM element once ---- */
  _build() {
    if (this._el) return;
    const el = document.createElement("div");
    el.id = "__au-analytics-panel__";
    Object.assign(el.style, {
      position:   "fixed",
      top:        "0",
      bottom:     "0",
      right:      "0",
      width:      "50vw",
      minWidth:   "450px",
      zIndex:     "2147483002",
      background: C.bgPanel,
      backdropFilter: "blur(24px)",
      WebkitBackdropFilter: "blur(24px)",
      borderLeft: "1px solid rgba(255,255,255,0.5)",
      boxShadow:  "-10px 0 30px rgba(0,0,0,0.1)",
      fontFamily: FONT,
      display:    "flex",
      flexDirection: "column",
      overflow:   "hidden",
      transform:  "translateX(100%)",
      transition: "transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1)",
    });
    document.body.appendChild(el);
    this._el = el;
  }

  /* ---- Open or update the panel ---- */
  openOrUpdate(prompt, summary, visualizations) {
    this._build();
    this._history.push({ prompt, summary, visualizations: visualizations || [] });
    this._loading = false;
    this._renderPanel();

    if (!this._visible) {
      this._visible = true;
      // Trigger slide-in animation
      requestAnimationFrame(() => {
        requestAnimationFrame(() => { this._el.style.transform = "translateX(0)"; });
      });
      this._agent._open = false; // close the mini bubble panel
      this._agent._render();
    }
  }

  /* ---- Show loading state inside panel while follow-up is fetching ---- */
  setLoading(isLoading) {
    this._loading = isLoading;
    if (this._el && this._visible) this._updateVizArea();
  }

  /* ---- Close → slide panel back down ---- */
  close() {
    if (!this._el) return;
    this._el.style.transform = "translateX(100%)";
    this._visible = false;
    this._agent._render(); // restore bubble
  }

  /* ---- Full panel re-render ---- */
  _renderPanel() {
    if (!this._el) return;
    const latest = this._history[this._history.length - 1] || {};
    const prevItems = this._history.slice(0, -1);
    const historyId = uid();
    const composerId = uid();

    this._el.innerHTML = `
      <!-- ═══ HEADER ═══ -->
      <div style="flex-shrink:0;display:flex;align-items:center;justify-content:space-between;
        padding:0 24px;height:64px;
        background:transparent;
        border-bottom:1px solid rgba(0,0,0,0.05)">
        
        <button id="__au-back__" style="display:flex;align-items:center;gap:8px;
          background:rgba(0,0,0,0.04);border:1px solid rgba(0,0,0,0.06);
          color:${C.text};font-size:13px;font-weight:600;
          padding:8px 16px;border-radius:12px;cursor:pointer;
          transition:background .2s, transform .1s;font-family:${FONT}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
            <path d="M19 12H5M12 5l-7 7 7 7"/>
          </svg>
          Back to Dashboard
        </button>

        <div style="display:flex;align-items:center;gap:10px">
          <div style="width:30px;height:30px;border-radius:9px;
            background:linear-gradient(135deg,${C.accent},${C.blue});
            display:flex;align-items:center;justify-content:center">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(0,0,0,0.8)" stroke-width="2">
              <path d="M12 2C6.48 2 2 5.58 2 10c0 2.4 1.2 4.56 3.1 6.1L4 22l5.9-2.95C11.2 19.34 12 20 12 20c5.52 0 10-3.58 10-8S17.52 2 12 2z"/>
            </svg>
          </div>
          <div>
            <div style="font-size:15px;font-weight:700;color:${C.text}">ViH Agentic UI</div>
            <div style="font-size:11px;color:${C.muted}">AI-powered · updates with every question</div>
          </div>
        </div>

        <div style="display:flex;align-items:center;gap:8px">
          <div style="width:7px;height:7px;border-radius:50%;background:${C.green}"></div>
          <span style="font-size:11px;color:${C.muted}">${this._agent._serverOk===false?"Offline":"Connected"}</span>
        </div>
      </div>

      <!-- ═══ SCROLLABLE MAIN AREA ═══ -->
      <div style="flex:1;overflow-y:auto;padding:28px 32px 120px;">

        <!-- Current query context -->
        <div style="margin-bottom:24px">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
            <div style="background:rgba(94,234,212,0.12);border:1px solid rgba(94,234,212,0.25);
              color:${C.accent};font-size:11px;font-weight:600;padding:4px 10px;
              border-radius:20px;white-space:nowrap">Current query</div>
            <div style="font-size:14px;font-weight:600;color:${C.text}">${esc(latest.prompt)}</div>
          </div>
          <div style="font-size:14px;color:${C.text};line-height:1.6;
            padding:12px 16px;background:${C.surface};border-radius:0 8px 8px 0;
            border-left:4px solid ${C.accent}">
            ${esc(latest.summary)}
          </div>
        </div>

        <!-- ═══ VIZ GRID ═══ -->
        <div id="__au-viz-grid__" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(420px,1fr));gap:20px">
          ${this._loading ? this._spinnerHTML() : this._vizGridHTML(latest.visualizations)}
        </div>

        <!-- ═══ CONVERSATION HISTORY ═══ -->
        ${prevItems.length ? `
        <div style="margin-top:32px">
          <button id="${historyId}-toggle" onclick="
            var c=document.getElementById('${historyId}-content');
            var open=c.style.display!=='none';
            c.style.display=open?'none':'block';
            this.querySelector('.au-chevron').style.transform=open?'rotate(0)':'rotate(180deg)';
          " style="display:flex;align-items:center;gap:8px;background:none;border:none;
            color:${C.muted};font-size:12px;cursor:pointer;padding:0;margin-bottom:12px;font-family:${FONT}">
            <svg class="au-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="transition:transform .2s">
              <path d="M6 9l6 6 6-6"/>
            </svg>
            Previous queries (${prevItems.length})
          </button>
          <div id="${historyId}-content" style="display:none;display:flex;flex-direction:column;gap:12px">
            ${prevItems.slice().reverse().map((item, i) => `
              <div class="au-history-item" data-index="${prevItems.length - 1 - i}" 
                style="background:${C.surface};border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:16px;cursor:pointer;
                transition:transform .15s, background .15s, box-shadow .15s"
                onmouseover="this.style.background='rgba(255,255,255,0.85)';this.style.transform='translateY(-2px)';this.style.boxShadow='0 4px 12px rgba(0,0,0,0.1)'" 
                onmouseout="this.style.background='${C.surface}';this.style.transform='translateY(0)';this.style.boxShadow='none'">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
                  <span style="font-size:11px;color:${C.muted}">Q</span>
                  <span style="font-size:13px;color:${C.text};font-weight:500">${esc(item.prompt)}</span>
                </div>
                <div style="font-size:12px;color:${C.muted};margin-bottom:8px">${esc(item.summary)}</div>
                <div style="display:flex;gap:6px;flex-wrap:wrap">
                  ${(item.visualizations||[]).map(v=>`<span style="background:${C.surface2};
                    border:1px solid ${C.border};color:${C.muted};font-size:10px;
                    padding:3px 8px;border-radius:5px">${esc(v.type?.replace(/_/g," "))}: ${esc(v.title)}</span>`).join("")}
                </div>
              </div>`).join("")}
          </div>
        </div>` : ""}

      </div><!-- end scrollable -->

      <!-- ═══ BOTTOM COMPOSER (fixed inside panel) ═══ -->
      <div style="flex-shrink:0;position:absolute;bottom:0;left:0;right:0;
        padding:16px 32px;
        background:linear-gradient(0deg,${C.bgPanel} 80%,transparent);
        border-top:1px solid ${C.border}">
        <div style="display:flex;gap:10px;align-items:flex-end;
          background:${C.surface};border:1px solid ${C.borderHov};
          border-radius:14px;padding:10px 12px;
          box-shadow:0 8px 32px rgba(0,0,0,0.4)">
          <div style="color:${C.muted};flex-shrink:0;padding-bottom:4px">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
          </div>
          <textarea id="${composerId}" rows="1" placeholder="Ask a follow-up question about your data…"
            style="flex:1;resize:none;background:transparent;color:${C.text};border:none;
              font-size:14px;font-family:${FONT};line-height:1.5;outline:none;
              min-height:24px;max-height:96px"></textarea>
          <button id="${composerId}-send" style="background:linear-gradient(135deg,${C.accent},${C.blue});
            border:none;border-radius:10px;width:38px;height:38px;flex-shrink:0;
            display:flex;align-items:center;justify-content:center;
            cursor:pointer;transition:transform .15s">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" stroke-width="2.5" stroke-linecap="round">
              <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </div>
      </div>

      <!-- ═══ TOOLTIP ═══ -->
      <div id="__au-tooltip__" style="position:fixed;display:none;background:rgba(0,0,0,0.85);color:#fff;
        padding:6px 12px;border-radius:6px;font-size:12px;font-family:${FONT};pointer-events:none;
        z-index:2147483005;white-space:nowrap;box-shadow:0 4px 12px rgba(0,0,0,0.2);transform:translate(-50%, -100%);margin-top:-8px;
        transition: opacity 0.1s; opacity: 0;">
      </div>
    `;

    // Event bindings
    this._el.querySelector("#__au-back__").onclick = () => this.close();
    
    // Tooltip logic
    const tooltip = this._el.querySelector("#__au-tooltip__");
    this._el.addEventListener('mouseover', e => {
      const target = e.target.closest('.au-viz-element');
      if (target) {
        const text = target.getAttribute('data-tooltip');
        if (text) {
          tooltip.innerHTML = text;
          tooltip.style.display = 'block';
          setTimeout(() => tooltip.style.opacity = '1', 10);
        }
      }
    });
    this._el.addEventListener('mousemove', e => {
      if (tooltip.style.display === 'block') {
        tooltip.style.left = e.clientX + 'px';
        tooltip.style.top = e.clientY + 'px';
      }
    });
    this._el.addEventListener('mouseout', e => {
      const target = e.target.closest('.au-viz-element');
      if (target) {
        tooltip.style.opacity = '0';
        setTimeout(() => { if(tooltip.style.opacity === '0') tooltip.style.display = 'none'; }, 100);
      }
    });
    
    // Bind click events to history items
    this._el.querySelectorAll(".au-history-item").forEach(el => {
      el.onclick = () => {
        const idx = parseInt(el.getAttribute("data-index"), 10);
        const item = this._history[idx];
        if (item) {
          // Move the clicked item to the end of the history array to make it the 'latest'
          this._history.splice(idx, 1);
          this._history.push(item);
          this._renderPanel(); // Re-render everything with the new latest item
        }
      };
    });

    const textarea = this._el.querySelector(`#${composerId}`);
    const sendBtn  = this._el.querySelector(`#${composerId}-send`);

    const doSend = () => {
      const v = textarea.value.trim();
      if (!v || this._agent._loading) return;
      textarea.value = "";
      textarea.style.height = "auto";
      this._agent._sendFollowup(v);
    };

    textarea.oninput = () => {
      textarea.style.height = "auto";
      textarea.style.height = Math.min(96, textarea.scrollHeight) + "px";
    };
    textarea.onkeydown = e => { if (e.key==="Enter"&&!e.shiftKey){ e.preventDefault(); doSend(); }};
    sendBtn.onclick = doSend;

    execScripts(this._el);
  }

  /* ---- Only refresh the viz grid (used during follow-up loading) ---- */
  _updateVizArea() {
    const grid = this._el?.querySelector("#__au-viz-grid__");
    if (!grid) return;
    const latest = this._history[this._history.length - 1] || {};
    grid.innerHTML = this._loading ? this._spinnerHTML() : this._vizGridHTML(latest.visualizations);
    execScripts(grid);
  }

  _vizGridHTML(visualizations = []) {
    if (!visualizations.length) {
      return `<div style="grid-column:1/-1;text-align:center;color:${C.muted};
        font-size:13px;padding:48px 0">No visualizations generated.</div>`;
    }
    return visualizations.map(v => renderViz(v)).join("");
  }

  _spinnerHTML() {
    return `<div style="grid-column:1/-1;display:flex;flex-direction:column;
      align-items:center;justify-content:center;padding:64px 0;gap:16px">
      <div style="display:flex;gap:8px">
        ${[0,150,300].map(d=>`<div style="width:10px;height:10px;border-radius:50%;
          background:${C.accent};animation:au-pulse 1.2s ease-in-out ${d}ms infinite"></div>`).join("")}
      </div>
      <div style="color:${C.muted};font-size:13px">Generating visualizations…</div>
    </div>
    <style>@keyframes au-pulse{0%,80%,100%{transform:scale(.5);opacity:.3}40%{transform:scale(1);opacity:1}}</style>`;
  }
}

/* =====================================================================
   SECTION 5: MINI COMPOSER (the floating bubble → small input)
   ===================================================================== */

const BUBBLE_CSS = `
  :host {
    all: initial;
    position: fixed; right: 24px; bottom: 24px;
    z-index: 2147483001;
    font-family: ${FONT};
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }

  .bubble {
    width: 56px; height: 56px; border-radius: 50%;
    background: linear-gradient(135deg, ${C.accent} 0%, ${C.blue} 100%);
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; border: 1px solid rgba(255,255,255,0.1);
    box-shadow: 0 8px 32px rgba(0,0,0,0.25), 0 2px 8px rgba(0,0,0,0.15);
    transition: transform .4s cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow .3s ease;
  }
  .bubble:hover { transform: scale(1.08); box-shadow: 0 12px 36px rgba(0,0,0,0.3); }
  .bubble svg  { width: 24px; height: 24px; color: #ffffff; }

  .mini-panel {
    position: absolute; bottom: 76px; right: 0;
    width: 380px; max-width: calc(100vw - 32px);
    background: ${C.bgPanel};
    backdrop-filter: blur(24px);
    -webkit-backdrop-filter: blur(24px);
    border-radius: 24px;
    border: 1px solid rgba(255,255,255,0.5);
    box-shadow: 0 24px 64px rgba(0,0,0,0.12), 0 8px 24px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.6);
    overflow: hidden;
    opacity: 0; transform: translateY(20px) scale(0.95); pointer-events: none;
    transition: opacity .3s ease, transform .4s cubic-bezier(0.2, 0.8, 0.2, 1);
  }
  .mini-panel.open { opacity: 1; transform: translateY(0) scale(1); pointer-events: all; }

  .mp-header {
    padding: 14px 16px;
    background: linear-gradient(135deg, ${C.surface2}, ${C.surface3});
    border-bottom: 1px solid ${C.border};
    display: flex; align-items: center; gap: 10px; justify-content: space-between;
  }
  .mp-icon { width: 30px; height: 30px; border-radius: 9px;
    background: linear-gradient(135deg,${C.accent},${C.blue});
    display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .mp-title { font-size: 14px; font-weight: 700; color: ${C.text}; }
  .mp-sub   { font-size: 11px; color: ${C.muted}; margin-top: 2px; }
  .close-btn { background:none;border:none;color:${C.muted};cursor:pointer;font-size:16px;
    padding:2px 6px;border-radius:5px;transition:color .15s; }
  .close-btn:hover { color: ${C.text}; }

  .chips { display:flex;flex-wrap:wrap;gap:6px;padding:14px 14px 0; }
  .chip {
    background: rgba(94,234,212,0.08); border: 1px solid rgba(94,234,212,0.2);
    color: ${C.accent}; font-size: 11px; padding: 5px 10px;
    border-radius: 20px; cursor: pointer; transition: background .15s, transform .1s;
    white-space: nowrap;
  }
  .chip:hover { background: rgba(94,234,212,0.18); transform: translateY(-1px); }

  .composer {
    padding: 12px 14px;
    display: flex; gap: 8px; align-items: flex-end;
  }
  .composer textarea {
    flex:1;resize:none;background:rgba(0,0,0,0.05);
    color:${C.text};border:1px solid ${C.border};border-radius:12px;
    padding:9px 12px;font-size:13px;font-family:inherit;
    min-height:40px;max-height:100px;outline:none;line-height:1.4;
    transition:border-color .15s;
  }
  .composer textarea:focus { border-color:rgba(94,234,212,.4); }
  .composer textarea::placeholder { color:${C.muted}; }
  .send-btn {
    background:linear-gradient(135deg,${C.accent},${C.blue});
    border:none;border-radius:12px;width:40px;height:40px;flex-shrink:0;
    display:flex;align-items:center;justify-content:center;
    cursor:pointer;transition:transform .15s,opacity .15s;
  }
  .send-btn:hover { transform:scale(1.06); }
  .send-btn:disabled { opacity:.4;cursor:default;transform:none; }
  .send-btn svg { width:15px;height:15px; }

  .loading-row {
    padding:10px 14px 14px;display:flex;align-items:center;gap:8px;
  }
  .dot {
    width:7px;height:7px;border-radius:50%;background:${C.accent};
    animation:p 1.2s ease-in-out infinite;
  }
  .dot:nth-child(2){animation-delay:.2s} .dot:nth-child(3){animation-delay:.4s}
  @keyframes p{0%,80%,100%{transform:scale(.5);opacity:.3}40%{transform:scale(1);opacity:1}}
  .loading-text{color:${C.muted};font-size:12px}

  .status-bar{
    padding:8px 14px 10px;font-size:10px;color:${C.muted};
    display:flex;align-items:center;gap:5px;
  }
  .sdot{width:6px;height:6px;border-radius:50%;background:${C.green}}
  .sdot.err{background:${C.rose}}
`;

const SUGGESTIONS = [
  "Show revenue by day as a bar chart",
  "Pie chart of orders by status",
  "Generate executive KPI summary",
  "Compare this week vs last week",
  "Summarize this dashboard",
  "Show all orders as a table",
];

/* =====================================================================
   SECTION 6: MAIN CUSTOM ELEMENT
   ===================================================================== */

class AgenticUIAgent extends HTMLElement {
  constructor() {
    super();
    this._open    = false;
    this._loading = false;
    this._serverOk = null;
    this._scanner  = new ContextScanner();
    this._panel    = new AnalyticsPanel(this);
    this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    this.endpoint = (this.getAttribute("endpoint") || "http://localhost:4411").replace(/\/$/,"");
    this.token    = this.getAttribute("token") || null;
    this._render();
    this._checkHealth();
  }

  _auth() {
    return this.token ? { Authorization: `Bearer ${this.token}` } : {};
  }

  async _checkHealth() {
    try {
      const r = await fetch(`${this.endpoint}/api/agentic-ui/health`, {headers:this._auth()});
      this._serverOk = r.ok;
    } catch { this._serverOk = false; }
    this._render();
  }

  _toggle(force) {
    this._open = typeof force === "boolean" ? force : !this._open;
    this._render();
    if (this._open) requestAnimationFrame(() => this._sq("textarea")?.focus());
  }

  /* ---- Send from the mini bubble composer (first query) ---- */
  async _send(prompt) {
    if (!prompt.trim() || this._loading) return;
    this._loading = true;
    this._render();

    try {
      const context = await this._scanner.scanWithData();
      const res = await fetch(`${this.endpoint}/api/agentic-ui/chat`, {
        method: "POST",
        headers: {"Content-Type":"application/json",...this._auth()},
        signal: AbortSignal.timeout(50000),
        body: JSON.stringify({ prompt, history: [], context }),
      });
      if (!res.ok) throw new Error(`Server ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      this._serverOk = true;
            if (data.actions && Array.isArray(data.actions)) {
        data.actions.forEach(act => {
          if (act.type === 'navigate' && act.url) {
            if (window.__agenticUI && typeof window.__agenticUI.onNavigate === 'function') {
              window.__agenticUI.onNavigate(act.url);
            } else {
              window.location.href = act.url;
            }
          } else if (act.type === 'scroll' && act.target) {
            setTimeout(() => {
              try {
                const el = document.querySelector(act.target);
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
              } catch(e) {}
            }, 100);
          }
        });
      }
      this._panel.openOrUpdate(prompt, data.summary || "Done.", data.visualizations || []);
    } catch(err) {
      const msg = err.name==="TimeoutError"
        ? "Request timed out — LLM may be slow."
        : err.message.includes("fetch")
        ? `Can't reach ${this.endpoint} — is the server running?`
        : err.message;
      // Show error in mini panel
      this._errorMsg = msg;
      this._serverOk = false;
    }

    this._loading = false;
    this._render();
  }

  /* ---- Send follow-up from inside the analytics panel ---- */
  async _sendFollowup(prompt) {
    if (this._loading) return;
    this._loading = true;
    this._panel.setLoading(true);

    try {
      const context = await this._scanner.scanWithData();
      const history = this._panel._history.slice(-6).map(h => ({
        role: "user",   text: h.prompt,
      })).concat(this._panel._history.slice(-6).map(h => ({
        role: "assistant", text: h.summary,
      })));

      const res = await fetch(`${this.endpoint}/api/agentic-ui/chat`, {
        method: "POST",
        headers: {"Content-Type":"application/json",...this._auth()},
        signal: AbortSignal.timeout(50000),
        body: JSON.stringify({ prompt, history, context }),
      });
      if (!res.ok) throw new Error(`Server ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
            if (data.actions && Array.isArray(data.actions)) {
        data.actions.forEach(act => {
          if (act.type === 'navigate' && act.url) {
            if (window.__agenticUI && typeof window.__agenticUI.onNavigate === 'function') {
              window.__agenticUI.onNavigate(act.url);
            } else {
              window.location.href = act.url;
            }
          } else if (act.type === 'scroll' && act.target) {
            setTimeout(() => {
              try {
                const el = document.querySelector(act.target);
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
              } catch(e) {}
            }, 100);
          }
        });
      }
      this._panel.openOrUpdate(prompt, data.summary || "Done.", data.visualizations || []);
    } catch(err) {
      this._panel.openOrUpdate(prompt, `Error: ${err.message}`, []);
    }

    this._loading = false;
  }

  _render() {
    const root = this.shadowRoot;
    const sdot = this._serverOk===false
      ? `<div class="sdot err"></div><span>Server offline</span>`
      : this._serverOk===true
      ? `<div class="sdot"></div><span>Connected</span>`
      : `<div class="sdot" style="background:${C.amber}"></div><span>Connecting…</span>`;

    const composerOrLoading = this._loading
      ? `<div class="loading-row">
           <div class="dot"></div><div class="dot"></div><div class="dot"></div>
           <span class="loading-text">Analysing your dashboard…</span>
         </div>`
      : (this._errorMsg
        ? `<div style="padding:10px 14px 14px;font-size:12px;color:${C.rose}">${esc(this._errorMsg)}</div>
           <div class="composer">
             <textarea placeholder="Try again…"></textarea>
             <button class="send-btn" aria-label="Send">
               <svg viewBox="0 0 24 24" fill="none" stroke="rgba(0,0,0,0.8)" stroke-width="2.5" stroke-linecap="round">
                 <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
               </svg>
             </button>
           </div>`
        : `<div class="chips">
             ${SUGGESTIONS.map(s=>`<button class="chip" data-chip="${esc(s)}">${esc(s)}</button>`).join("")}
           </div>
           <div class="composer">
             <textarea placeholder="Ask anything about your dashboard data…"></textarea>
             <button class="send-btn" aria-label="Send">
               <svg viewBox="0 0 24 24" fill="none" stroke="rgba(0,0,0,0.8)" stroke-width="2.5" stroke-linecap="round">
                 <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
               </svg>
             </button>
           </div>`);

    root.innerHTML = `
      <style>${BUBBLE_CSS}</style>

      <div class="mini-panel ${this._open ? "open" : ""}">
        <div class="mp-header">
          <div style="display:flex;align-items:center;gap:10px">
            <div class="mp-icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(0,0,0,0.8)" stroke-width="2">
                <path d="M12 2C6.48 2 2 5.58 2 10c0 2.4 1.2 4.56 3.1 6.1L4 22l5.9-2.95C11.2 19.34 12 20 12 20c5.52 0 10-3.58 10-8S17.52 2 12 2z"/>
              </svg>
            </div>
            <div>
              <div class="mp-title">ViH Agentic UI</div>
              <div class="mp-sub">Ask anything · charts open inline</div>
            </div>
          </div>
          <button class="close-btn">✕</button>
        </div>
        <div class="status-bar">${sdot}</div>
        ${composerOrLoading}
      </div>

      <button class="bubble" aria-label="Open Agentic Analytics">
        <svg viewBox="0 0 24 24" fill="none" stroke="rgba(0,0,0,0.8)" stroke-width="2">
          <path d="M12 2C6.48 2 2 5.58 2 10c0 2.4 1.2 4.56 3.1 6.1L4 22l5.9-2.95C11.2 19.34 12 20 12 20c5.52 0 10-3.58 10-8S17.52 2 12 2z"/>
          <path d="M8 10h.01M12 10h.01M16 10h.01" stroke-linecap="round"/>
        </svg>
      </button>`;

    // Events
    root.querySelector(".bubble").onclick = () => {
      if (this._panel._visible) { this._panel.close(); return; }
      this._toggle();
    };
    root.querySelector(".close-btn").onclick = () => this._toggle(false);

    const textarea = root.querySelector("textarea");
    const sendBtn  = root.querySelector(".send-btn");

    if (textarea && sendBtn) {
      const doSend = () => {
        const v = textarea.value.trim();
        if (!v || this._loading) return;
        textarea.value = "";
        this._errorMsg = null;
        this._send(v);
      };
      sendBtn.onclick = doSend;
      textarea.onkeydown = e => { if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();doSend();} };
      textarea.oninput = () => {
        textarea.style.height = "auto";
        textarea.style.height = Math.min(100, textarea.scrollHeight) + "px";
      };
    }

    root.querySelectorAll(".chip").forEach(chip => {
      chip.onclick = () => { const t=chip.dataset.chip; if(t){this._errorMsg=null;this._send(t);} };
    });
  }

  _sq(sel) { return this.shadowRoot?.querySelector(sel); }
}

window.__agenticUI = window.__agenticUI || {};
customElements.define("agentic-ui-agent", AgenticUIAgent);
