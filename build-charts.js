const fs = require('fs');
const path = require('path');

const CHARTS = `

/* =====================================================================
   SECTION 3.5: EXTENDED VISUALIZATIONS (50+ TYPES)
   ===================================================================== */

// Helpers
function makeGrid(W, H, p, maxV, minV=0) {
  const ch=H-p.t-p.b, cw=W-p.l-p.r, range=maxV-minV||1;
  return Array.from({length:5},(_,i)=>{
    const v=minV+range*i/4, y=p.t+ch-((v-minV)/range)*ch;
    const l=v>=1e6?(v/1e6).toFixed(1)+"M":v>=1000?(v/1000).toFixed(1)+"k":Math.round(v);
    return \`<line x1="\${p.l}" y1="\${y.toFixed(1)}" x2="\${W-p.r}" y2="\${y.toFixed(1)}" stroke="rgba(255,255,255,0.05)" stroke-dasharray="3 5"/>
    <text x="\${(p.l-7).toFixed(1)}" y="\${(y+4).toFixed(1)}" fill="\${C.muted}" font-size="9" text-anchor="end">\${l}</text>\`;
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
    return \`<rect x="\${p.l}" y="\${y}" width="\${bw.toFixed(1)}" height="\${barH.toFixed(1)}" rx="4" fill="\${color}" opacity="0.85"/>
    <text x="\${p.l-8}" y="\${+y+barH/2+4}" fill="\${C.muted}" font-size="9" text-anchor="end">\${esc(d.label)}</text>
    <text x="\${p.l+bw+8}" y="\${+y+barH/2+4}" fill="\${color}" font-size="9" font-weight="600">\${fmtVal(d.value)}</text>\`;
  }).join("");
  return card(title,\`<svg viewBox="0 0 \${W} \${H}" style="width:100%;overflow:visible">
    <line x1="\${p.l}" y1="\${p.t}" x2="\${p.l}" y2="\${H-p.b}" stroke="rgba(255,255,255,0.12)"/>\${bars}</svg>\`);
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
      str+=\`<rect x="\${x}" y="\${cy.toFixed(1)}" width="\${barW.toFixed(1)}" height="\${bh.toFixed(1)}" fill="\${PALETTE[si%PALETTE.length]}" opacity="0.85"/>\`;
    });
    return str+\`<text x="\${(+x+barW/2).toFixed(1)}" y="\${(p.t+ch+18).toFixed(1)}" fill="\${C.muted}" font-size="9" text-anchor="middle">\${esc(d.label)}</text>\`;
  }).join("");
  return card(title,\`<svg viewBox="0 0 \${W} \${H}" style="width:100%;overflow:visible">\${grid}\${bars}</svg>\`);
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
    let str=\`<text x="\${cx.toFixed(1)}" y="\${(p.t+ch+18).toFixed(1)}" fill="\${C.muted}" font-size="9" text-anchor="middle">\${esc(d.label)}</text>\`;
    d.groups.forEach((g,gi)=>{
      const bh=((+g.value||0)/maxV)*ch, x=cx - (gCount*barW)/2 + gi*barW, y=p.t+ch-bh;
      str+=\`<rect x="\${x.toFixed(1)}" y="\${y.toFixed(1)}" width="\${(barW-1).toFixed(1)}" height="\${bh.toFixed(1)}" rx="2" fill="\${PALETTE[gi%PALETTE.length]}" opacity="0.85"/>\`;
    });
    return str;
  }).join("");
  return card(title,\`<svg viewBox="0 0 \${W} \${H}" style="width:100%;overflow:visible">\${grid}\${bars}</svg>\`);
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
      str+=\`<rect x="\${x}" y="\${cy.toFixed(1)}" width="\${barW.toFixed(1)}" height="\${bh.toFixed(1)}" fill="\${PALETTE[si%PALETTE.length]}" opacity="0.85"/>\`;
    });
    return str+\`<text x="\${(+x+barW/2).toFixed(1)}" y="\${(p.t+ch+18).toFixed(1)}" fill="\${C.muted}" font-size="9" text-anchor="middle">\${esc(d.label)}</text>\`;
  }).join("");
  return card(title,\`<svg viewBox="0 0 \${W} \${H}" style="width:100%;overflow:visible">\${grid}\${bars}</svg>\`);
}

// 5. Spline Chart (Smooth Line)
function renderSplineChart(spec) {
  const {data=[],title,color=C.accent}=spec;
  if(!data.length) return noData(title);
  const W=500,H=240,p={t:24,r:16,b:48,l:52}, cw=W-p.l-p.r, ch=H-p.t-p.b;
  const vals=data.map(d=>+d.value||0), maxV=Math.max(...vals)*1.1||1, minV=Math.min(...vals)*0.9, range=maxV-minV||1;
  const pts=data.map((d,i)=>({x:p.l+(i/Math.max(data.length-1,1))*cw, y:p.t+ch-((+d.value-minV)/range)*ch, label:d.label}));
  
  // Catmull-Rom to cubic bezier approximation for smooth curve
  let dPath = \`M\${pts[0].x.toFixed(1)},\${pts[0].y.toFixed(1)}\`;
  for(let i=0; i<pts.length-1; i++){
    const p0=i>0?pts[i-1]:pts[0], p1=pts[i], p2=pts[i+1], p3=i!==pts.length-2?pts[i+2]:p2;
    const cp1x = p1.x + (p2.x - p0.x)/6, cp1y = p1.y + (p2.y - p0.y)/6;
    const cp2x = p2.x - (p3.x - p1.x)/6, cp2y = p2.y - (p3.y - p1.y)/6;
    dPath += \` C\${cp1x.toFixed(1)},\${cp1y.toFixed(1)} \${cp2x.toFixed(1)},\${cp2y.toFixed(1)} \${p2.x.toFixed(1)},\${p2.y.toFixed(1)}\`;
  }
  
  const grid=makeGrid(W,H,p,maxV,minV);
  const labels=pts.map(pt=>\`<text x="\${pt.x.toFixed(1)}" y="\${(p.t+ch+16).toFixed(1)}" fill="\${C.muted}" font-size="9" text-anchor="middle">\${esc(pt.label)}</text>\`).join("");
  return card(title,\`<svg viewBox="0 0 \${W} \${H}" style="width:100%;overflow:visible">\${grid}
    <path d="\${dPath}" fill="none" stroke="\${color}" stroke-width="2.5" stroke-linecap="round"/>\${labels}</svg>\`);
}

// 6. Step Line Chart
function renderStepLineChart(spec) {
  const {data=[],title,color=C.accent}=spec;
  if(!data.length) return noData(title);
  const W=500,H=240,p={t:24,r:16,b:48,l:52}, cw=W-p.l-p.r, ch=H-p.t-p.b;
  const vals=data.map(d=>+d.value||0), maxV=Math.max(...vals)*1.1||1, minV=Math.min(...vals)*0.9, range=maxV-minV||1;
  const pts=data.map((d,i)=>({x:p.l+(i/Math.max(data.length-1,1))*cw, y:p.t+ch-((+d.value-minV)/range)*ch, label:d.label}));
  
  let dPath = \`M\${pts[0].x.toFixed(1)},\${pts[0].y.toFixed(1)}\`;
  for(let i=1; i<pts.length; i++){
    dPath += \` L\${pts[i].x.toFixed(1)},\${pts[i-1].y.toFixed(1)} L\${pts[i].x.toFixed(1)},\${pts[i].y.toFixed(1)}\`;
  }
  
  const grid=makeGrid(W,H,p,maxV,minV);
  const labels=pts.map(pt=>\`<text x="\${pt.x.toFixed(1)}" y="\${(p.t+ch+16).toFixed(1)}" fill="\${C.muted}" font-size="9" text-anchor="middle">\${esc(pt.label)}</text>\`).join("");
  return card(title,\`<svg viewBox="0 0 \${W} \${H}" style="width:100%;overflow:visible">\${grid}
    <path d="\${dPath}" fill="none" stroke="\${color}" stroke-width="2.5"/>\${labels}</svg>\`);
}

// 7. Multi-Axis Line Chart
function renderMultiAxisLineChart(spec) {
  // data: [{label, lines:[{name, value}]}]
  const {data=[],title}=spec;
  if(!data.length||!data[0].lines) return noData(title);
  const W=500,H=240,p={t:24,r:52,b:48,l:52}, cw=W-p.l-p.r, ch=H-p.t-p.b;
  const maxV1=Math.max(...data.map(d=>+d.lines[0]?.value||0))*1.1||1;
  const maxV2=Math.max(...data.map(d=>+d.lines[1]?.value||0))*1.1||1;
  
  const line1=data.map((d,i)=>\`\${(p.l+(i/Math.max(data.length-1,1))*cw).toFixed(1)},\${(p.t+ch-((+d.lines[0]?.value||0)/maxV1)*ch).toFixed(1)}\`).join(" ");
  const line2=data.map((d,i)=>\`\${(p.l+(i/Math.max(data.length-1,1))*cw).toFixed(1)},\${(p.t+ch-((+d.lines[1]?.value||0)/maxV2)*ch).toFixed(1)}\`).join(" ");
  
  const grid=makeGrid(W,H,p,maxV1);
  const labels=data.map((d,i)=>\`<text x="\${(p.l+(i/Math.max(data.length-1,1))*cw).toFixed(1)}" y="\${(p.t+ch+16).toFixed(1)}" fill="\${C.muted}" font-size="9" text-anchor="middle">\${esc(d.label)}</text>\`).join("");
  return card(title,\`<svg viewBox="0 0 \${W} \${H}" style="width:100%;overflow:visible">\${grid}
    <polyline points="\${line1}" fill="none" stroke="\${PALETTE[0]}" stroke-width="2.5"/>
    <polyline points="\${line2}" fill="none" stroke="\${PALETTE[1]}" stroke-width="2.5" stroke-dasharray="4 4"/>
    \${labels}</svg>\`);
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
      dPath+=\` \${x.toFixed(1)},\${y.toFixed(1)}\`;
      botPath=\` \${x.toFixed(1)},\${prevY[i].toFixed(1)}\`+botPath;
      prevY[i]=y;
    });
    paths=\`<path d="\${dPath}\${botPath} Z" fill="\${PALETTE[si%PALETTE.length]}" opacity="0.6"/>\`+paths;
  });
  const labels=data.map((d,i)=>\`<text x="\${(p.l+(i/Math.max(data.length-1,1))*cw).toFixed(1)}" y="\${(p.t+ch+16).toFixed(1)}" fill="\${C.muted}" font-size="9" text-anchor="middle">\${esc(d.label)}</text>\`).join("");
  return card(title,\`<svg viewBox="0 0 \${W} \${H}" style="width:100%;overflow:visible">\${grid}\${paths}\${labels}</svg>\`);
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
      dPath+=\` \${x.toFixed(1)},\${y.toFixed(1)}\`;
      botPath=\` \${x.toFixed(1)},\${base[i].toFixed(1)}\`+botPath;
      base[i]=y;
    });
    paths=\`<path d="\${dPath}\${botPath} Z" fill="\${PALETTE[si%PALETTE.length]}" opacity="0.8"/>\`+paths;
  });
  const labels=data.map((d,i)=>\`<text x="\${(p.l+(i/Math.max(data.length-1,1))*cw).toFixed(1)}" y="\${(p.t+ch+16).toFixed(1)}" fill="\${C.muted}" font-size="9" text-anchor="middle">\${esc(d.label)}</text>\`).join("");
  return card(title,\`<svg viewBox="0 0 \${W} \${H}" style="width:100%;overflow:visible">\${paths}\${labels}</svg>\`);
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
    top+=\` \${x},\${(p.t+ch-((+d.max-minV)/range)*ch).toFixed(1)}\`;
    bot=\` \${x},\${(p.t+ch-((+d.min-minV)/range)*ch).toFixed(1)}\`+bot;
  });
  const labels=data.map((d,i)=>\`<text x="\${(p.l+(i/Math.max(data.length-1,1))*cw).toFixed(1)}" y="\${(p.t+ch+16).toFixed(1)}" fill="\${C.muted}" font-size="9" text-anchor="middle">\${esc(d.label)}</text>\`).join("");
  return card(title,\`<svg viewBox="0 0 \${W} \${H}" style="width:100%;overflow:visible">\${grid}
    <path d="\${top}\${bot} Z" fill="\${color}" opacity="0.3"/>\${labels}</svg>\`);
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
    paths+=\`<path d="M\${x1.toFixed(1)},\${y1.toFixed(1)} A\${R},\${R} 0 0,1 \${x2.toFixed(1)},\${y2.toFixed(1)} L\${ix2.toFixed(1)},\${iy2.toFixed(1)} A\${r},\${r} 0 0,0 \${ix1.toFixed(1)},\${iy1.toFixed(1)} Z" fill="\${PALETTE[i%PALETTE.length]}"/>\`;
  });
  return card(title,\`<svg viewBox="0 0 300 150" style="width:100%">\${paths}
    <text x="\${cx}" y="\${cy-10}" text-anchor="middle" fill="\${C.text}" font-size="24" font-weight="700">\${fmtVal(total)}</text>
    <text x="\${cx}" y="\${cy+10}" text-anchor="middle" fill="\${C.muted}" font-size="12">Total</text>
  </svg>\`);
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
    paths+=\`<path d="M\${cx},\${cy} L\${x1.toFixed(1)},\${y1.toFixed(1)} A\${r},\${r} 0 0,1 \${x2.toFixed(1)},\${y2.toFixed(1)} Z" fill="\${PALETTE[i%PALETTE.length]}" opacity="0.75" stroke="\${C.surface}" stroke-width="2"/>\`;
  });
  const grid=\`<circle cx="\${cx}" cy="\${cy}" r="\${R/2}" fill="none" stroke="rgba(255,255,255,0.1)" stroke-dasharray="2 4"/>
              <circle cx="\${cx}" cy="\${cy}" r="\${R}" fill="none" stroke="rgba(255,255,255,0.1)" stroke-dasharray="2 4"/>\`;
  return card(title,\`<svg viewBox="0 0 300 300" style="width:100%">\${grid}\${paths}</svg>\`);
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
    paths+=\`<circle cx="\${cx}" cy="\${cy}" r="\${r}" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="\${t}"/>
    <path d="M\${cx},\${cy-r} A\${r},\${r} 0 \${large},1 \${x2.toFixed(1)},\${y2.toFixed(1)}" fill="none" stroke="\${PALETTE[i%PALETTE.length]}" stroke-width="\${t}" stroke-linecap="round"/>
    <text x="\${cx-r-5}" y="\${cy+4}" fill="\${C.text}" font-size="9" text-anchor="end">\${esc(d.label)}</text>\`;
  });
  return card(title,\`<svg viewBox="0 0 300 300" style="width:100%">\${paths}</svg>\`);
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
    return \`<rect x="\${x}" y="\${y}" width="\${w}" height="\${h}" fill="\${PALETTE[i%PALETTE.length]}" stroke="\${C.surface}" stroke-width="2"/>
    \${w>40&&h>20?\`<text x="\${x+5}" y="\${y+15}" fill="#fff" font-size="10" font-weight="600" text-anchor="start">\${esc(d.label)}</text>\`:""}\`;
  }).join("");
  return card(title,\`<svg viewBox="0 0 \${W} \${H}" style="width:100%;overflow:visible">\${rects}</svg>\`);
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
    paths+=\`<polygon points="\${W/2-w1/2},\${y1} \${W/2+w1/2},\${y1} \${W/2+w2/2},\${y2} \${W/2-w2/2},\${y2}" fill="\${PALETTE[i%PALETTE.length]}" opacity="0.9"/>
    <text x="\${W/2}" y="\${y1+h/2+4}" fill="#fff" font-size="12" font-weight="bold" text-anchor="middle">\${esc(data[i].label)}: \${fmtVal(data[i].value)}</text>\`;
  }
  return card(title,\`<svg viewBox="0 0 \${W} \${H}" style="width:100%;overflow:visible">\${paths}</svg>\`);
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
    return \`<rect x="\${x}" y="\${y1}" width="\${barW.toFixed(1)}" height="\${Math.max(2,y2-y1)}" fill="\${clr}"/>
    <text x="\${(+x+barW/2).toFixed(1)}" y="\${(p.t+ch+18).toFixed(1)}" fill="\${C.muted}" font-size="9" text-anchor="middle">\${esc(d.label)}</text>\`;
  }).join("");
  return card(title,\`<svg viewBox="0 0 \${W} \${H}" style="width:100%;overflow:visible">\${grid}\${bars}</svg>\`);
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
    return \`<circle cx="\${x.toFixed(1)}" cy="\${y.toFixed(1)}" r="\${r.toFixed(1)}" fill="\${color}" opacity="0.5" stroke="\${color}" stroke-width="1"/>
    \${r>10?\`<text x="\${x.toFixed(1)}" y="\${(y+3).toFixed(1)}" fill="#fff" font-size="9" text-anchor="middle">\${esc(d.label)}</text>\`:""}\`;
  }).join("");
  return card(title,\`<svg viewBox="0 0 \${W} \${H}" style="width:100%;overflow:visible">
    <line x1="\${p.l}" y1="\${p.t}" x2="\${p.l}" y2="\${p.t+ch}" stroke="rgba(255,255,255,0.12)"/>
    <line x1="\${p.l}" y1="\${p.t+ch}" x2="\${W-p.r}" y2="\${p.t+ch}" stroke="rgba(255,255,255,0.12)"/>
    \${dots}</svg>\`);
}

// 19. Stat with Sparkline
function renderStatWithSparkline(spec) {
  const {value,label,data=[],title,color=C.accent}=spec;
  const W=150,H=40;
  const vals=data.map(d=>+d.value||0), maxV=Math.max(...vals)||1, minV=Math.min(...vals);
  const pts=vals.map((v,i)=>\`\${(i/(vals.length-1)*W).toFixed(1)},\${(H-((v-minV)/(maxV-minV||1))*H).toFixed(1)}\`).join(" ");
  return card(title,\`<div style="display:flex;justify-content:space-between;align-items:center">
    <div><div style="font-size:28px;font-weight:700;color:\${C.text}">\${fmtVal(value)}</div>
    <div style="font-size:12px;color:\${C.muted}">\${esc(label)}</div></div>
    <svg viewBox="0 0 \${W} \${H}" style="width:100px;height:30px;overflow:visible">
      <polyline points="\${pts}" fill="none" stroke="\${color}" stroke-width="2"/>
    </svg></div>\`);
}

// 20. Stat with Sparkbar
function renderStatWithSparkbar(spec) {
  const {value,label,data=[],title,color=C.accent}=spec;
  const W=150,H=40, maxV=Math.max(...data.map(d=>+d.value||0))||1;
  const bw=W/data.length - 2;
  const bars=data.map((d,i)=>\`<rect x="\${i*(bw+2)}" y="\${H-((+d.value||0)/maxV)*H}" width="\${bw}" height="\${((+d.value||0)/maxV)*H}" fill="\${color}" rx="1"/>\`).join("");
  return card(title,\`<div style="display:flex;justify-content:space-between;align-items:center">
    <div><div style="font-size:28px;font-weight:700;color:\${C.text}">\${fmtVal(value)}</div>
    <div style="font-size:12px;color:\${C.muted}">\${esc(label)}</div></div>
    <svg viewBox="0 0 \${W} \${H}" style="width:100px;height:30px">\${bars}</svg></div>\`);
}

// 21. Progress Bar
function renderProgressBar(spec) {
  const {value=0,max=100,label,title,color=C.accent}=spec;
  const pct=Math.min(100, Math.max(0, (value/max)*100));
  return card(title,\`<div style="margin-bottom:8px;display:flex;justify-content:space-between;font-size:13px">
    <span style="color:\${C.muted}">\${esc(label)}</span>
    <span style="color:\${C.text};font-weight:600">\${pct.toFixed(1)}%</span></div>
    <div style="height:10px;background:rgba(255,255,255,0.1);border-radius:5px;overflow:hidden">
      <div style="width:\${pct}%;height:100%;background:\${color};border-radius:5px"></div>
    </div>\`);
}

// 22. Progress Ring
function renderProgressRing(spec) {
  const {value=0,max=100,label,title,color=C.accent}=spec;
  const pct=Math.min(100, Math.max(0, (value/max)*100)), C_circ=2*Math.PI*40, off=C_circ-(pct/100)*C_circ;
  return card(title,\`<div style="display:flex;align-items:center;gap:20px">
    <svg viewBox="0 0 100 100" style="width:80px;height:80px;transform:rotate(-90deg)">
      <circle cx="50" cy="50" r="40" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="10"/>
      <circle cx="50" cy="50" r="40" fill="none" stroke="\${color}" stroke-width="10" stroke-dasharray="\${C_circ}" stroke-dashoffset="\${off}" stroke-linecap="round"/>
    </svg>
    <div><div style="font-size:24px;font-weight:700;color:\${C.text}">\${pct.toFixed(1)}%</div>
    <div style="font-size:12px;color:\${C.muted}">\${esc(label)}</div></div></div>\`);
}

// 23. Linear Gauge
function renderLinearGauge(spec) {
  const {value=0,min=0,max=100,target,title,color=C.blue}=spec;
  const range=max-min, pct=((value-min)/range)*100;
  return card(title,\`<div style="position:relative;height:24px;background:rgba(255,255,255,0.1);border-radius:12px;margin:20px 0">
    <div style="position:absolute;top:0;left:0;height:100%;width:\${Math.min(100,Math.max(0,pct))}%;background:\${color};border-radius:12px"></div>
    \${target!==undefined?\`<div style="position:absolute;top:-4px;bottom:-4px;left:\${((target-min)/range)*100}%;width:3px;background:\${C.rose};border-radius:2px"></div>\` : ""}
    </div>
    <div style="display:flex;justify-content:space-between;color:\${C.muted};font-size:11px">
      <span>\${min}</span><span style="color:\${C.text};font-weight:bold">\${fmtVal(value)}</span><span>\${max}</span>
    </div>\`);
}

// 24. Bullet Chart
function renderBulletChart(spec) {
  // data: [{label, actual, target, range_max}]
  const {data=[],title}=spec;
  if(!data.length) return noData(title);
  const bars=data.map((d,i)=>{
    const max = Math.max(d.actual, d.target, d.range_max||0)||1;
    const pA=(d.actual/max)*100, pT=(d.target/max)*100;
    return \`<div style="margin-bottom:16px"><div style="font-size:12px;color:\${C.muted};margin-bottom:4px">\${esc(d.label)}</div>
    <div style="position:relative;height:24px;background:rgba(255,255,255,0.05);border-radius:4px">
      <div style="position:absolute;top:0;left:0;height:100%;width:100%;background:rgba(255,255,255,0.05);border-radius:4px"></div>
      <div style="position:absolute;top:6px;left:0;height:12px;width:\${pA}%;background:\${C.accent};border-radius:2px"></div>
      <div style="position:absolute;top:2px;bottom:2px;left:\${pT}%;width:4px;background:\${C.rose}"></div>
    </div></div>\`;
  }).join("");
  return card(title, bars);
}

// 25. Status Indicator
function renderStatusIndicator(spec) {
  const {data=[],title}=spec;
  const items=data.map(d=>{
    const clr=d.status==="ok"?C.green:d.status==="warning"?C.amber:C.rose;
    return \`<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:\${C.surface2};border-radius:8px">
      <div style="width:10px;height:10px;border-radius:50%;background:\${clr};box-shadow:0 0 8px \${clr}"></div>
      <span style="color:\${C.text};font-size:13px">\${esc(d.label)}</span>
    </div>\`;
  }).join("");
  return card(title,\`<div style="display:flex;flex-wrap:wrap;gap:12px">\${items}</div>\`);
}

// 26. Matrix Table / Heatmap Grid
function renderMatrixTable(spec) {
  const {rows=[],cols=[],data=[],title}=spec; // data is 2D array mapping to rows/cols values
  if(!rows.length) return noData(title);
  const maxV=Math.max(...data.flat().map(x=>+x||0))||1;
  const trs=rows.map((r,ri)=>\`<tr><td style="padding:6px 10px;color:\${C.muted};font-size:11px">\${esc(r)}</td>
    \${cols.map((_,ci)=>{
      const v=data[ri][ci]||0, op=0.1+((v/maxV)*0.9);
      return \`<td style="padding:6px;text-align:center;background:rgba(94,234,212,\${op});color:\${op>0.5?'#000':'#fff'};font-size:11px;border-radius:4px">\${v}</td>\`;
    }).join("")}</tr>\`).join("");
  return card(title,\`<div style="overflow-x:auto"><table style="width:100%;border-spacing:2px;border-collapse:separate">
    <tr><td></td>\${cols.map(c=>\`<td style="padding:4px;text-align:center;color:\${C.muted};font-size:10px">\${esc(c)}</td>\`).join("")}</tr>
    \${trs}</table></div>\`);
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
    return \`<span style="font-size:\${sz}px;color:\${PALETTE[i%PALETTE.length]};margin:4px 8px;display:inline-block">\${esc(d.label)}</span>\`;
  }).join("");
  return card(title,\`<div style="text-align:center;padding:20px 0;line-height:1.2">\${words}</div>\`);
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
    return \`<line x1="\${x.toFixed(1)}" y1="\${yH.toFixed(1)}" x2="\${x.toFixed(1)}" y2="\${yL.toFixed(1)}" stroke="\${clr}" stroke-width="1.5"/>
    <rect x="\${(x-barW/2).toFixed(1)}" y="\${Math.min(yO,yC).toFixed(1)}" width="\${barW.toFixed(1)}" height="\${Math.max(1,Math.abs(yO-yC)).toFixed(1)}" fill="\${clr}"/>
    \${i%Math.ceil(data.length/8)===0?\`<text x="\${x.toFixed(1)}" y="\${H-10}" fill="\${C.muted}" font-size="9" text-anchor="middle">\${esc(d.label)}</text>\`:""}\`;
  }).join("");
  return card(title,\`<svg viewBox="0 0 \${W} \${H}" style="width:100%;overflow:visible">\${grid}\${candles}</svg>\`);
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
    return \`<rect x="\${x.toFixed(1)}" y="\${y.toFixed(1)}" width="\${w.toFixed(1)}" height="\${barH.toFixed(1)}" rx="3" fill="\${color}"/>
    <text x="\${p.l-8}" y="\${y+barH/2+4}" fill="\${C.muted}" font-size="9" text-anchor="end">\${esc(d.label)}</text>\`;
  }).join("");
  return card(title,\`<svg viewBox="0 0 \${W} \${H}" style="width:100%;overflow:visible">\${bars}</svg>\`);
}

// 34. Timeline Events
function renderTimelineEvents(spec) {
  const {data=[],title}=spec; // {label, date, desc}
  const events=data.map((d,i)=>\`<div style="display:flex;gap:16px;margin-bottom:16px">
    <div style="display:flex;flex-direction:column;align-items:center;min-width:40px">
      <div style="font-size:10px;color:\${C.muted};margin-bottom:4px">\${esc(d.date)}</div>
      <div style="width:10px;height:10px;border-radius:50%;background:\${C.accent};box-shadow:0 0 5px \${C.accent}"></div>
      \${i!==data.length-1?'<div style="flex:1;width:2px;background:rgba(255,255,255,0.1);margin-top:4px"></div>':""}
    </div>
    <div style="padding-bottom:16px"><div style="font-size:13px;color:\${C.text};font-weight:600">\${esc(d.label)}</div>
    \${d.desc?\`<div style="font-size:12px;color:\${C.muted};margin-top:4px">\${esc(d.desc)}</div>\`:""}</div>
  </div>\`).join("");
  return card(title,\`<div>\${events}</div>\`);
}

// 35. Radar Chart
function renderRadarChart(spec) {
  const {data=[],title}=spec; // [{name, metrics:[{axis, value}]}]
  if(!data.length||!data[0].metrics) return noData(title);
  const cx=150,cy=150,R=100, axes=data[0].metrics.map(m=>m.axis), maxV=Math.max(...data.flatMap(d=>d.metrics.map(m=>+m.value||0)))||1;
  const ang=Math.PI*2/axes.length;
  const webs=Array.from({length:4},(_,i)=>{
    const r=R*(i+1)/4;
    let pts=""; axes.forEach((_,j)=>{ pts+=\`\${cx+r*Math.cos(j*ang-Math.PI/2)},\${cy+r*Math.sin(j*ang-Math.PI/2)} \`; });
    return \`<polygon points="\${pts}" fill="none" stroke="rgba(255,255,255,0.1)"/>\`;
  }).join("");
  const axisLines=axes.map((a,i)=>\`<line x1="\${cx}" y1="\${cy}" x2="\${cx+R*Math.cos(i*ang-Math.PI/2)}" y2="\${cy+R*Math.sin(i*ang-Math.PI/2)}" stroke="rgba(255,255,255,0.1)"/>
    <text x="\${cx+(R+15)*Math.cos(i*ang-Math.PI/2)}" y="\${cy+(R+15)*Math.sin(i*ang-Math.PI/2)+4}" fill="\${C.muted}" font-size="9" text-anchor="middle">\${esc(a)}</text>\`).join("");
  const polys=data.map((d,i)=>{
    let pts=""; d.metrics.forEach((m,j)=>{
      const r=R*(+m.value||0)/maxV; pts+=\`\${cx+r*Math.cos(j*ang-Math.PI/2)},\${cy+r*Math.sin(j*ang-Math.PI/2)} \`;
    });
    return \`<polygon points="\${pts}" fill="\${PALETTE[i%PALETTE.length]}" opacity="0.3" stroke="\${PALETTE[i%PALETTE.length]}" stroke-width="2"/>\`;
  }).join("");
  return card(title,\`<svg viewBox="0 0 300 300" style="width:100%;overflow:visible">\${webs}\${axisLines}\${polys}</svg>\`);
}

// 36. Pictograph
function renderPictograph(spec) {
  const {data=[],title,color=C.accent}=spec;
  if(!data.length) return noData(title);
  const rows=data.map(d=>{
    const count=Math.min(20, Math.round(+d.value||0));
    const icons=Array.from({length:count},()=>\`<svg width="12" height="12" viewBox="0 0 24 24" fill="\${color}" style="margin-right:2px"><path d="M12 2C6.48 2 2 5.58 2 10c0 2.4 1.2 4.56 3.1 6.1L4 22l5.9-2.95C11.2 19.34 12 20 12 20c5.52 0 10-3.58 10-8S17.52 2 12 2z"/></svg>\`).join("");
    return \`<div style="display:flex;align-items:center;margin-bottom:8px">
      <div style="width:80px;font-size:11px;color:\${C.muted}">\${esc(d.label)}</div><div style="flex:1">\${icons}</div>
    </div>\`;
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
    return \`<line x1="\${p.l}" y1="\${y}" x2="\${W-p.r}" y2="\${y}" stroke="rgba(255,255,255,0.05)" stroke-dasharray="2 2"/>
    <circle cx="\${x}" cy="\${y}" r="6" fill="\${color}"/>
    <text x="\${p.l-8}" y="\${y+4}" fill="\${C.muted}" font-size="9" text-anchor="end">\${esc(d.label)}</text>\`;
  }).join("");
  return card(title,\`<svg viewBox="0 0 \${W} \${H}" style="width:100%;overflow:visible">\${dots}</svg>\`);
}

// 38. Dumbbell Plot
function renderDumbbellPlot(spec) {
  const {data=[],title}=spec; // {label, v1, v2}
  if(!data.length) return noData(title);
  const W=500,H=260,p={t:20,r:20,b:20,l:80}, cw=W-p.l-p.r, ch=H-p.t-p.b;
  const maxV=Math.max(...data.flatMap(d=>[+d.v1||0,+d.v2||0]))*1.1||1, gap=ch/data.length;
  const dbs=data.map((d,i)=>{
    const x1=p.l+((+d.v1||0)/maxV)*cw, x2=p.l+((+d.v2||0)/maxV)*cw, y=p.t+i*gap+gap/2;
    return \`<line x1="\${p.l}" y1="\${y}" x2="\${W-p.r}" y2="\${y}" stroke="rgba(255,255,255,0.05)"/>
    <line x1="\${x1}" y1="\${y}" x2="\${x2}" y2="\${y}" stroke="rgba(255,255,255,0.2)" stroke-width="3"/>
    <circle cx="\${x1}" cy="\${y}" r="5" fill="\${C.blue}"/>
    <circle cx="\${x2}" cy="\${y}" r="5" fill="\${C.accent}"/>
    <text x="\${p.l-8}" y="\${y+4}" fill="\${C.muted}" font-size="9" text-anchor="end">\${esc(d.label)}</text>\`;
  }).join("");
  return card(title,\`<svg viewBox="0 0 \${W} \${H}" style="width:100%;overflow:visible">\${dbs}</svg>\`);
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
  const es=edges.map(e=>\`<line x1="\${pos[e.source]?.x}" y1="\${pos[e.source]?.y}" x2="\${pos[e.target]?.x}" y2="\${pos[e.target]?.y}" stroke="rgba(255,255,255,0.15)"/>\`).join("");
  const ns=nodes.map(n=>\`<circle cx="\${pos[n.id].x}" cy="\${pos[n.id].y}" r="12" fill="\${C.surface2}" stroke="\${C.accent}" stroke-width="2"/>
    <text x="\${pos[n.id].x}" y="\${pos[n.id].y+22}" fill="\${C.muted}" font-size="9" text-anchor="middle">\${esc(n.label)}</text>\`).join("");
  return card(title,\`<svg viewBox="0 0 \${W} \${H}" style="width:100%;overflow:visible">\${es}\${ns}</svg>\`);
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

`;

fs.writeFileSync(path.join(__dirname, 'extended-charts.js'), CHARTS);
console.log('Created extended-charts.js');
