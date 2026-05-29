'use client';

import React from 'react';
import { fmtUsd } from '@/components/Report';
import { computeAnalytics, type CompanyMetrics } from '@/lib/report-analytics';

const INDIGO = '#4f46e5';
const INK = '#0a0a0a';
const GREY = '#cbcbcb';
const RED = '#b91c1c';

export default function VisualsView({ data: rawData }: { data: any }) {
  const a = React.useMemo(() => computeAnalytics(rawData), [rawData]);
  const cos = a.companies;

  return (
    <div style={st.wrap}>
      <div style={st.head}>
        <div style={st.eyebrow}>Visualizations</div>
        <h1 style={st.title}>{a.sector} · visual analysis</h1>
        <p style={st.sub}>
          Seven views of the {a.sector} field, each built from the searched sector&apos;s own companies and
          figures. Scroll for the opportunity matrix, financial scatter, revenue treemap, priority
          breakdown, margins, R&amp;D distribution, and the engagement funnel.
        </p>
      </div>

      <Card title="Opportunity matrix" caption="Revenue (log scale) vs partnership priority. Bubble size = trial programs; filled = existing UNC tie. Quadrants split at the medians.">
        <OpportunityMatrix cos={cos} />
      </Card>

      <Card title="Profitability vs R&D intensity" caption="Each point is a company. Horizontal = R&D as % of revenue; vertical = net margin %. The dashed line is break-even.">
        <Scatter cos={cos} />
      </Card>

      <Card title="Revenue treemap" caption="Area is proportional to each company's latest reported revenue — a quick read on who dominates the sector.">
        <Treemap cos={cos} />
      </Card>

      <Card title="Priority composition" caption="What drives each company's priority score: existing tie, research alignment, NC presence, scale, and trials.">
        <PriorityStacks cos={cos} />
      </Card>

      <Card title="Net margin spread" caption="Profitability by company, diverging from break-even. Red = loss-making.">
        <DivergingMargin cos={cos} />
      </Card>

      <Card title="R&D intensity distribution" caption="How many companies fall in each R&D-intensity band. Right-skew indicates a few research-heavy firms.">
        <Histogram cos={cos} />
      </Card>

      <Card title="Engagement funnel" caption="The set narrows from all companies to the actionable shortlist.">
        <Funnel a={a} />
      </Card>
    </div>
  );
}

// ── Chart frame ──────────────────────────────────────────────────────────────
function Card({ title, caption, children }: { title: string; caption: string; children: React.ReactNode }) {
  return (
    <div style={st.card}>
      <div style={st.cardTitle}>{title}</div>
      <div style={st.cardCaption}>{caption}</div>
      <div style={st.cardBody}>{children}</div>
    </div>
  );
}

const lin = (v: number, d0: number, d1: number, r0: number, r1: number) =>
  d1 === d0 ? (r0 + r1) / 2 : r0 + ((v - d0) / (d1 - d0)) * (r1 - r0);
const median = (arr: number[]) => {
  if (!arr.length) return 0;
  const a = [...arr].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};

// ── 1. Opportunity matrix ────────────────────────────────────────────────────
function OpportunityMatrix({ cos }: { cos: CompanyMetrics[] }) {
  const pts = cos.filter((c) => c.revenue > 0);
  if (!pts.length) return <Empty />;
  const W = 820, H = 480, pl = 64, pr = 24, pt = 24, pb = 48;
  const xs = pts.map((c) => Math.log10(c.revenue));
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const X = (c: CompanyMetrics) => lin(Math.log10(c.revenue), x0, x1, pl, W - pr);
  const Y = (c: CompanyMetrics) => lin(c.priority, 0, 100, H - pb, pt);
  const xMid = median(xs);
  const xMidPx = lin(xMid, x0, x1, pl, W - pr);
  const yMidPx = lin(50, 0, 100, H - pb, pt);
  const labelled = [...pts].sort((a, b) => b.priority - a.priority).slice(0, 6);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={st.svg}>
      {/* quadrant guides */}
      <line x1={xMidPx} y1={pt} x2={xMidPx} y2={H - pb} stroke="#eee" />
      <line x1={pl} y1={yMidPx} x2={W - pr} y2={yMidPx} stroke="#eee" />
      <text x={W - pr - 4} y={pt + 14} textAnchor="end" style={st.quad}>Pursue now</text>
      <text x={pl + 4} y={pt + 14} style={st.quad}>Build relationship</text>
      <text x={W - pr - 4} y={H - pb - 6} textAnchor="end" style={st.quad}>Monitor</text>
      <text x={pl + 4} y={H - pb - 6} style={st.quad}>Watch</text>
      {/* axes */}
      <line x1={pl} y1={H - pb} x2={W - pr} y2={H - pb} stroke="#ccc" />
      <line x1={pl} y1={pt} x2={pl} y2={H - pb} stroke="#ccc" />
      <text x={(pl + W - pr) / 2} y={H - 10} textAnchor="middle" style={st.axis}>Revenue (log) →</text>
      <text x={16} y={(pt + H - pb) / 2} textAnchor="middle" style={st.axis} transform={`rotate(-90 16 ${(pt + H - pb) / 2})`}>Priority →</text>
      {/* points */}
      {pts.map((c, i) => {
        const r = 5 + Math.min(c.trials, 10) * 1.4;
        return (
          <circle key={i} cx={X(c)} cy={Y(c)} r={r}
            fill={c.uncTie ? INDIGO : '#fff'} stroke={INDIGO} strokeWidth={1.5} fillOpacity={c.uncTie ? 0.85 : 1} />
        );
      })}
      {labelled.map((c, i) => (
        <text key={i} x={X(c) + 8} y={Y(c) - 8} style={st.pointLabel}>{c.name}</text>
      ))}
    </svg>
  );
}

// ── 2. Scatter: R&D intensity vs net margin ──────────────────────────────────
function Scatter({ cos }: { cos: CompanyMetrics[] }) {
  const pts = cos.filter((c) => c.rdIntensity != null && c.netMargin != null) as (CompanyMetrics & { rdIntensity: number; netMargin: number })[];
  if (pts.length < 2) return <Empty />;
  const W = 820, H = 460, pl = 56, pr = 24, pt = 24, pb = 48;
  const xMax = Math.max(...pts.map((c) => c.rdIntensity), 5);
  const yMin = Math.min(...pts.map((c) => c.netMargin), 0);
  const yMax = Math.max(...pts.map((c) => c.netMargin), 5);
  const X = (v: number) => lin(v, 0, xMax, pl, W - pr);
  const Y = (v: number) => lin(v, yMin, yMax, H - pb, pt);
  const zeroY = Y(0);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={st.svg}>
      <line x1={pl} y1={zeroY} x2={W - pr} y2={zeroY} stroke="#bbb" strokeDasharray="4 4" />
      <text x={W - pr} y={zeroY - 5} textAnchor="end" style={st.quad}>break-even</text>
      <line x1={pl} y1={pt} x2={pl} y2={H - pb} stroke="#ccc" />
      <line x1={pl} y1={H - pb} x2={W - pr} y2={H - pb} stroke="#ccc" />
      <text x={(pl + W - pr) / 2} y={H - 10} textAnchor="middle" style={st.axis}>R&D intensity % →</text>
      <text x={14} y={(pt + H - pb) / 2} textAnchor="middle" style={st.axis} transform={`rotate(-90 14 ${(pt + H - pb) / 2})`}>Net margin % →</text>
      {pts.map((c, i) => (
        <g key={i}>
          <circle cx={X(c.rdIntensity)} cy={Y(c.netMargin)} r={6} fill={c.netMargin >= 0 ? INK : RED} fillOpacity={0.8} />
          <text x={X(c.rdIntensity) + 8} y={Y(c.netMargin) - 7} style={st.pointLabel}>{c.name}</text>
        </g>
      ))}
    </svg>
  );
}

// ── 3. Revenue treemap (slice-and-dice rows) ─────────────────────────────────
function Treemap({ cos }: { cos: CompanyMetrics[] }) {
  const items = cos.filter((c) => c.revenue > 0).sort((a, b) => b.revenue - a.revenue);
  if (!items.length) return <Empty />;
  const total = items.reduce((s, c) => s + c.revenue, 0);
  const W = 820, H = 440;
  // Greedy rows: up to 3 per row, row height proportional to row revenue.
  const rows: CompanyMetrics[][] = [];
  for (let i = 0; i < items.length; i += 3) rows.push(items.slice(i, i + 3));
  let y = 0;
  const rects: React.ReactNode[] = [];
  rows.forEach((row, ri) => {
    const rowVal = row.reduce((s, c) => s + c.revenue, 0);
    const rh = (rowVal / total) * H;
    let x = 0;
    row.forEach((c, ci) => {
      const rw = (c.revenue / rowVal) * W;
      const shade = lin(ci + ri, 0, 6, 0.92, 0.55);
      rects.push(
        <g key={`${ri}-${ci}`}>
          <rect x={x} y={y} width={rw - 2} height={rh - 2} fill={INDIGO} fillOpacity={Math.max(0.35, shade)} />
          {rw > 70 && rh > 28 && (
            <>
              <text x={x + 8} y={y + 20} style={st.tmName}>{c.name}</text>
              <text x={x + 8} y={y + 38} style={st.tmVal}>{fmtUsd(c.revenue)}</text>
            </>
          )}
        </g>,
      );
      x += rw;
    });
    y += rh;
  });
  return <svg viewBox={`0 0 ${W} ${H}`} style={st.svg}>{rects}</svg>;
}

// ── 4. Priority composition (stacked horizontal bars) ────────────────────────
function PriorityStacks({ cos }: { cos: CompanyMetrics[] }) {
  const items = [...cos].sort((a, b) => b.priority - a.priority).slice(0, 12).filter((c) => c.priority > 0);
  if (!items.length) return <Empty />;
  const W = 820, rowH = 30, pl = 150, pr = 40, top = 30;
  const H = top + items.length * rowH + 10;
  const segs = [
    { key: 'tie', label: 'Tie', color: '#312e81', val: (c: CompanyMetrics) => (c.uncTie ? 40 : 0) },
    { key: 'align', label: 'Alignment', color: '#4f46e5', val: (c: CompanyMetrics) => Math.min(25, c.alignment * 5) },
    { key: 'nc', label: 'NC', color: '#818cf8', val: (c: CompanyMetrics) => (c.ncBased ? 15 : 0) },
    { key: 'strat', label: 'Strategic', color: '#a5b4fc', val: (c: CompanyMetrics) => (c.partnershipType === 'Strategic' ? 10 : 0) },
    { key: 'trials', label: 'Trials', color: '#c7d2fe', val: (c: CompanyMetrics) => (c.trials > 0 ? 10 : 0) },
  ];
  const X = (v: number) => (v / 100) * (W - pl - pr);
  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} style={st.svg}>
        {items.map((c, i) => {
          let x = pl;
          const y = top + i * rowH;
          return (
            <g key={i}>
              <text x={pl - 8} y={y + rowH / 2 + 4} textAnchor="end" style={st.barLabel}>{c.name}</text>
              {segs.map((s) => {
                const w = X(s.val(c));
                const rect = w > 0 ? <rect key={s.key} x={x} y={y + 5} width={w} height={rowH - 12} fill={s.color} /> : null;
                x += w;
                return rect;
              })}
              <text x={x + 6} y={y + rowH / 2 + 4} style={st.barVal}>{c.priority}</text>
            </g>
          );
        })}
      </svg>
      <Legend items={segs.map((s) => ({ label: s.label, color: s.color }))} />
    </>
  );
}

// ── 5. Diverging net margin ──────────────────────────────────────────────────
function DivergingMargin({ cos }: { cos: CompanyMetrics[] }) {
  const items = cos.filter((c) => c.netMargin != null).sort((a, b) => (b.netMargin || 0) - (a.netMargin || 0)) as (CompanyMetrics & { netMargin: number })[];
  if (!items.length) return <Empty />;
  const W = 820, rowH = 28, pl = 150, pr = 56, top = 16;
  const H = top + items.length * rowH + 10;
  const maxAbs = Math.max(...items.map((c) => Math.abs(c.netMargin)), 5);
  const mid = pl + (W - pl - pr) / 2;
  const half = (W - pl - pr) / 2;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={st.svg}>
      <line x1={mid} y1={top} x2={mid} y2={H - 10} stroke="#ccc" />
      {items.map((c, i) => {
        const y = top + i * rowH;
        const w = (Math.abs(c.netMargin) / maxAbs) * half;
        const pos = c.netMargin >= 0;
        return (
          <g key={i}>
            <text x={pl - 8} y={y + rowH / 2 + 4} textAnchor="end" style={st.barLabel}>{c.name}</text>
            <rect x={pos ? mid : mid - w} y={y + 5} width={w} height={rowH - 12} fill={pos ? INK : RED} />
            <text x={pos ? mid + w + 5 : mid - w - 5} y={y + rowH / 2 + 4} textAnchor={pos ? 'start' : 'end'} style={st.barVal}>{c.netMargin}%</text>
          </g>
        );
      })}
    </svg>
  );
}

// ── 6. R&D intensity histogram ───────────────────────────────────────────────
function Histogram({ cos }: { cos: CompanyMetrics[] }) {
  const vals = cos.map((c) => c.rdIntensity).filter((v): v is number => v != null);
  if (vals.length < 2) return <Empty />;
  // Cap the axis near the 90th percentile so pre-revenue outliers (R&D >> revenue)
  // don't create hundreds of empty bins; the top bin is an overflow bucket.
  const sorted = [...vals].sort((a, b) => a - b);
  const p90 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.9))];
  const cap = Math.max(30, Math.ceil(p90 / 10) * 10);
  const binW = Math.max(5, Math.ceil((cap / 8) / 5) * 5);
  const nbins = Math.max(1, Math.ceil(cap / binW));
  const bins = Array.from({ length: nbins }, (_, i) => ({ lo: i * binW, hi: (i + 1) * binW, n: 0 }));
  vals.forEach((v) => { const idx = Math.min(nbins - 1, Math.floor(v / binW)); bins[idx].n++; });
  const W = 820, H = 360, pl = 40, pr = 20, pt = 20, pb = 44;
  const maxN = Math.max(...bins.map((b) => b.n), 1);
  const bw = (W - pl - pr) / nbins;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={st.svg}>
      <line x1={pl} y1={H - pb} x2={W - pr} y2={H - pb} stroke="#ccc" />
      {bins.map((b, i) => {
        const h = (b.n / maxN) * (H - pt - pb);
        const x = pl + i * bw;
        const label = i === nbins - 1 ? `${b.lo}+%` : `${b.lo}-${b.hi}%`;
        return (
          <g key={i}>
            <rect x={x + 3} y={H - pb - h} width={bw - 6} height={h} fill={INDIGO} fillOpacity={0.85} />
            {b.n > 0 && <text x={x + bw / 2} y={H - pb - h - 6} textAnchor="middle" style={st.barVal}>{b.n}</text>}
            <text x={x + bw / 2} y={H - pb + 16} textAnchor="middle" style={st.axisSm}>{label}</text>
          </g>
        );
      })}
      <text x={(pl + W - pr) / 2} y={H - 6} textAnchor="middle" style={st.axis}>R&D intensity band</text>
    </svg>
  );
}

// ── 7. Engagement funnel ─────────────────────────────────────────────────────
function Funnel({ a }: { a: ReturnType<typeof computeAnalytics> }) {
  const stages = [
    { label: 'All companies', value: a.counts.total },
    { label: 'Public w/ financials', value: a.counts.publicWithFinancials },
    { label: 'Existing UNC tie', value: a.counts.uncTie },
    { label: 'Best-fit targets', value: a.bestFit.length },
  ];
  const W = 820, rowH = 64, pt = 16;
  const H = pt + stages.length * rowH + 10;
  const max = Math.max(...stages.map((s) => s.value), 1);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={st.svg}>
      {stages.map((s, i) => {
        const w = Math.max(40, (s.value / max) * (W - 40));
        const x = (W - w) / 2;
        const y = pt + i * rowH;
        return (
          <g key={i}>
            <rect x={x} y={y} width={w} height={rowH - 14} rx={6} fill={INDIGO} fillOpacity={lin(i, 0, stages.length, 0.9, 0.45)} />
            <text x={W / 2} y={y + (rowH - 14) / 2 - 2} textAnchor="middle" style={st.funnelVal}>{s.value}</text>
            <text x={W / 2} y={y + (rowH - 14) / 2 + 14} textAnchor="middle" style={st.funnelLbl}>{s.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div style={st.legend}>
      {items.map((it, i) => (
        <span key={i} style={st.legendItem}><span style={{ ...st.legendSwatch, background: it.color }} />{it.label}</span>
      ))}
    </div>
  );
}
function Empty() { return <div style={st.empty}>Not enough reported data for this view.</div>; }

const st: Record<string, React.CSSProperties> = {
  wrap: { maxWidth: 1000, margin: '0 auto', padding: '8px 4px 90px' },
  head: { marginTop: 16, marginBottom: 24 },
  eyebrow: { fontSize: 11, letterSpacing: '0.22em', color: '#999', textTransform: 'uppercase', marginBottom: 10 },
  title: { fontSize: 'clamp(26px, 4vw, 38px)', fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.1 },
  sub: { fontSize: 14.5, color: '#666', marginTop: 12, maxWidth: 720, lineHeight: 1.6 },
  card: { border: '1px solid #eee', borderRadius: 16, padding: '22px 24px', marginBottom: 20, background: '#fff' },
  cardTitle: { fontSize: 18, fontWeight: 700, letterSpacing: '-0.01em', color: '#0a0a0a' },
  cardCaption: { fontSize: 13, color: '#777', marginTop: 6, marginBottom: 16, lineHeight: 1.55, maxWidth: 760 },
  cardBody: {},
  svg: { width: '100%', height: 'auto', display: 'block' },
  axis: { fontSize: 12, fill: '#888' },
  axisSm: { fontSize: 10, fill: '#999' },
  quad: { fontSize: 11, fill: '#b4b4b4', fontWeight: 600 },
  pointLabel: { fontSize: 11, fill: '#374151', fontWeight: 600 },
  barLabel: { fontSize: 12, fill: '#374151' },
  barVal: { fontSize: 11, fill: '#0a0a0a', fontWeight: 700 },
  tmName: { fontSize: 13, fill: '#fff', fontWeight: 700 },
  tmVal: { fontSize: 12, fill: '#e0e7ff' },
  funnelVal: { fontSize: 18, fill: '#fff', fontWeight: 700 },
  funnelLbl: { fontSize: 11, fill: '#e0e7ff' },
  legend: { display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 12 },
  legendItem: { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#374151' },
  legendSwatch: { width: 12, height: 12, borderRadius: 3, display: 'inline-block' },
  empty: { fontSize: 13, color: '#999', fontStyle: 'italic', padding: '20px 0' },
};
