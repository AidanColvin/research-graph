'use client';

import React from 'react';
import { normalize, fmtUsd } from '@/components/Report';

const BLUE = '#0891b2';
const INK = '#0a0a0a';
const GREEN = '#15803d';
const RED = '#b91c1c';
const PALETTE = ['#0891b2', '#0a0a0a', '#15803d', '#b45309', '#7c3aed', '#be123c', '#0369a1', '#4d7c0f'];

type Pt = { fy: number; val: number };
type Series = { name: string; color: string; points: Pt[] };

export default function TrendsView({ data: rawData }: { data: any }) {
  const d = React.useMemo(() => normalize(rawData), [rawData]);
  const profs = (d.section4_profiles || []).map((p) => ({
    name: p.company_name,
    revenue: (p.trends?.revenue || []) as Pt[],
    rd: (p.trends?.rd_expense || []) as Pt[],
    ni: (p.trends?.net_income || []) as Pt[],
  }));
  const withRev = profs.filter((p) => p.revenue.length >= 2);

  if (withRev.length < 1) {
    return (
      <div style={st.wrap}>
        <Head sector={d.report_meta.sector} />
        <div style={st.empty}>No multi-year financial history is available for this sector&apos;s companies
          (they may be private or pre-revenue). Trends draw on SEC annual filings, which these firms don&apos;t report.</div>
      </div>
    );
  }

  // Aggregate sector revenue & R&D per fiscal year (sum across reporting firms).
  const aggregate = (key: 'revenue' | 'rd' | 'ni'): Pt[] => {
    const m = new Map<number, number>();
    profs.forEach((p) => p[key].forEach((pt) => m.set(pt.fy, (m.get(pt.fy) || 0) + pt.val)));
    return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([fy, val]) => ({ fy, val }));
  };
  const aggRev = aggregate('revenue');
  const aggRd = aggregate('rd');

  // CAGR / total change per company over its covered span.
  const growth = withRev.map((p) => {
    const a = p.revenue[0], b = p.revenue[p.revenue.length - 1];
    const years = Math.max(1, b.fy - a.fy);
    const pct = a.val ? ((b.val - a.val) / Math.abs(a.val)) * 100 : 0;
    const cagr = a.val > 0 && b.val > 0 ? (Math.pow(b.val / a.val, 1 / years) - 1) * 100 : null;
    return { name: p.name, pct: +pct.toFixed(0), cagr: cagr == null ? null : +cagr.toFixed(1), from: a, to: b };
  }).sort((x, y) => y.pct - x.pct);

  const topByLatest = [...withRev].sort((a, b) => b.revenue[b.revenue.length - 1].val - a.revenue[a.revenue.length - 1].val).slice(0, 6);
  const revSeries: Series[] = topByLatest.map((p, i) => ({ name: p.name, color: PALETTE[i % PALETTE.length], points: p.revenue }));
  // Indexed to 100 at each company's first reported year.
  const idxSeries: Series[] = [...withRev].sort((a, b) => b.revenue[b.revenue.length - 1].val - a.revenue[a.revenue.length - 1].val).slice(0, 8)
    .map((p, i) => ({ name: p.name, color: PALETTE[i % PALETTE.length], points: p.revenue.map((pt) => ({ fy: pt.fy, val: (pt.val / p.revenue[0].val) * 100 })) }));

  // Sector aggregate stats
  const aggCagr = aggRev.length >= 2 && aggRev[0].val > 0
    ? +((Math.pow(aggRev[aggRev.length - 1].val / aggRev[0].val, 1 / Math.max(1, aggRev[aggRev.length - 1].fy - aggRev[0].fy)) - 1) * 100).toFixed(1)
    : null;
  const span = aggRev.length ? `${aggRev[0].fy}-${aggRev[aggRev.length - 1].fy}` : '';
  const grower = growth[0], decliner = growth[growth.length - 1];

  return (
    <div style={st.wrap}>
      <Head sector={d.report_meta.sector} />

      <div style={st.kpiGrid}>
        <Kpi label="Years covered" value={span || '—'} />
        <Kpi label="Sector revenue CAGR" value={aggCagr == null ? '—' : `${aggCagr}%`} />
        <Kpi label="Fastest grower" value={grower ? `${grower.name}` : '—'} sub={grower ? `${grower.pct >= 0 ? '+' : ''}${grower.pct}%` : ''} />
        <Kpi label="Biggest decliner" value={decliner ? `${decliner.name}` : '—'} sub={decliner ? `${decliner.pct >= 0 ? '+' : ''}${decliner.pct}%` : ''} />
      </div>

      <Card title="Sector revenue over time" caption={`Total revenue across reporting ${d.report_meta.sector} companies, by fiscal year (SEC filings). Note: earlier years cover fewer firms.`}>
        <LineChart series={[{ name: 'Sector revenue', color: BLUE, points: aggRev }]} yFmt={fmtUsd} area />
      </Card>

      <Card title="Revenue by company" caption="The largest firms' annual revenue trajectories — who is climbing and who has plateaued.">
        <LineChart series={revSeries} yFmt={fmtUsd} />
      </Card>

      <Card title="Indexed revenue growth" caption="Each company rebased to 100 at its first reported year, so growth rates are comparable regardless of size.">
        <LineChart series={idxSeries} yFmt={(v) => String(Math.round(v))} baseline100 />
      </Card>

      <Card title="R&D spend over time" caption="Total reported research-and-development spend across the sector, by fiscal year.">
        <LineChart series={[{ name: 'Sector R&D', color: GREEN, points: aggRd }]} yFmt={fmtUsd} area />
      </Card>

      <Card title="Revenue growth: leaders & laggards" caption="Total revenue change over each company's reported span. Green = grew, red = shrank.">
        <GrowthBars rows={growth} />
      </Card>
    </div>
  );
}

function Head({ sector }: { sector: string }) {
  return (
    <div style={st.head}>
      <div style={st.eyebrow}>Market trends</div>
      <h1 style={st.title}>{sector} · trends</h1>
      <p style={st.sub}>
        Ten-year financial trajectories for the {sector} sector, drawn from SEC annual filings — what
        has grown and what has shrunk. (Stock-price feeds aren&apos;t part of the free data set; these
        are revenue, R&amp;D, and income trends from primary filings.)
      </p>
    </div>
  );
}

// ── Line chart ────────────────────────────────────────────────────────────────
function LineChart({ series, yFmt, area, baseline100 }: { series: Series[]; yFmt: (v: number) => string; area?: boolean; baseline100?: boolean }) {
  const pts = series.flatMap((s) => s.points);
  if (pts.length < 2) return <Empty />;
  const W = 820, H = 380, pl = 70, pr = 24, pt = 20, pb = 40;
  const fys = pts.map((p) => p.fy);
  const x0 = Math.min(...fys), x1 = Math.max(...fys);
  const vals = pts.map((p) => p.val);
  const y0 = baseline100 ? Math.min(...vals, 100) : Math.min(0, ...vals);
  const y1 = Math.max(...vals);
  const X = (fy: number) => (x1 === x0 ? (pl + W - pr) / 2 : pl + ((fy - x0) / (x1 - x0)) * (W - pl - pr));
  const Y = (v: number) => (y1 === y0 ? (pt + H - pb) / 2 : (H - pb) - ((v - y0) / (y1 - y0)) * (H - pb - pt));
  const yticks = 4;
  const years = Array.from(new Set(fys)).sort((a, b) => a - b);
  const yearStep = Math.ceil(years.length / 10);
  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} style={st.svg}>
        {/* y grid + labels */}
        {Array.from({ length: yticks + 1 }, (_, i) => {
          const v = y0 + ((y1 - y0) * i) / yticks; const yy = Y(v);
          return (
            <g key={i}>
              <line x1={pl} y1={yy} x2={W - pr} y2={yy} stroke="#f0f0f0" />
              <text x={pl - 8} y={yy + 4} textAnchor="end" style={st.axisSm}>{yFmt(v)}</text>
            </g>
          );
        })}
        {baseline100 && <line x1={pl} y1={Y(100)} x2={W - pr} y2={Y(100)} stroke="#bbb" strokeDasharray="4 4" />}
        {/* x labels */}
        {years.filter((_, i) => i % yearStep === 0).map((fy) => (
          <text key={fy} x={X(fy)} y={H - pb + 16} textAnchor="middle" style={st.axisSm}>{`'${String(fy).slice(2)}`}</text>
        ))}
        {/* series */}
        {series.map((s, si) => {
          const sp = [...s.points].sort((a, b) => a.fy - b.fy);
          const path = sp.map((p, i) => `${i ? 'L' : 'M'} ${X(p.fy).toFixed(1)} ${Y(p.val).toFixed(1)}`).join(' ');
          return (
            <g key={si}>
              {area && <path d={`${path} L ${X(sp[sp.length - 1].fy)} ${Y(y0)} L ${X(sp[0].fy)} ${Y(y0)} Z`} fill={s.color} fillOpacity={0.08} />}
              <path d={path} fill="none" stroke={s.color} strokeWidth={2.4} />
              {sp.map((p, i) => <circle key={i} cx={X(p.fy)} cy={Y(p.val)} r={2.6} fill={s.color} />)}
            </g>
          );
        })}
      </svg>
      {series.length > 1 && <Legend items={series.map((s) => ({ label: s.name, color: s.color }))} />}
    </>
  );
}

// ── Growth diverging bars ─────────────────────────────────────────────────────
function GrowthBars({ rows }: { rows: { name: string; pct: number; cagr: number | null; from: Pt; to: Pt }[] }) {
  if (!rows.length) return <Empty />;
  const W = 820, rowH = 30, pl = 160, pr = 80, top = 12;
  const H = top + rows.length * rowH + 10;
  const maxAbs = Math.max(...rows.map((r) => Math.abs(r.pct)), 1);
  const mid = pl + (W - pl - pr) / 2, half = (W - pl - pr) / 2;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={st.svg}>
      <line x1={mid} y1={top} x2={mid} y2={H - 10} stroke="#ccc" />
      {rows.map((r, i) => {
        const y = top + i * rowH; const w = (Math.abs(r.pct) / maxAbs) * half; const pos = r.pct >= 0;
        return (
          <g key={i}>
            <text x={pl - 8} y={y + rowH / 2 + 4} textAnchor="end" style={st.barLabel}>{r.name}</text>
            <rect x={pos ? mid : mid - w} y={y + 5} width={w} height={rowH - 12} fill={pos ? GREEN : RED} />
            <text x={pos ? mid + w + 5 : mid - w - 5} y={y + rowH / 2 + 4} textAnchor={pos ? 'start' : 'end'} style={st.barVal}>
              {pos ? '+' : ''}{r.pct}%{r.cagr != null ? `  (${r.cagr}%/yr)` : ''}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function Card({ title, caption, children }: { title: string; caption: string; children: React.ReactNode }) {
  return <div style={st.card}><div style={st.cardTitle}>{title}</div><div style={st.cardCaption}>{caption}</div>{children}</div>;
}
function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return <div style={st.kpi}><div style={st.kpiVal}>{value}</div>{sub ? <div style={st.kpiSub}>{sub}</div> : null}<div style={st.kpiLbl}>{label}</div></div>;
}
function Legend({ items }: { items: { label: string; color: string }[] }) {
  return <div style={st.legend}>{items.map((it, i) => <span key={i} style={st.legendItem}><span style={{ ...st.legendSwatch, background: it.color }} />{it.label}</span>)}</div>;
}
function Empty() { return <div style={st.empty}>Not enough multi-year data for this view.</div>; }

const st: Record<string, React.CSSProperties> = {
  wrap: { maxWidth: 1000, margin: '0 auto', padding: '8px 4px 90px' },
  head: { marginTop: 16, marginBottom: 24 },
  eyebrow: { fontSize: 11, letterSpacing: '0.22em', color: '#999', textTransform: 'uppercase', marginBottom: 10 },
  title: { fontSize: 'clamp(26px, 4vw, 38px)', fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.1 },
  sub: { fontSize: 14.5, color: '#666', marginTop: 12, maxWidth: 720, lineHeight: 1.6 },
  kpiGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginBottom: 8 },
  kpi: { border: '1px solid #eee', borderRadius: 12, padding: '14px 16px', background: '#fafafa' },
  kpiVal: { fontSize: 20, fontWeight: 700, letterSpacing: '-0.01em', color: '#0a0a0a' },
  kpiSub: { fontSize: 13, fontWeight: 600, color: BLUE, marginTop: 2 },
  kpiLbl: { fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#777', marginTop: 6 },
  card: { border: '1px solid #eee', borderRadius: 16, padding: '22px 24px', marginTop: 20, background: '#fff' },
  cardTitle: { fontSize: 18, fontWeight: 700, letterSpacing: '-0.01em', color: '#0a0a0a' },
  cardCaption: { fontSize: 13, color: '#777', marginTop: 6, marginBottom: 16, lineHeight: 1.55, maxWidth: 780 },
  svg: { width: '100%', height: 'auto', display: 'block' },
  axisSm: { fontSize: 10, fill: '#999' },
  barLabel: { fontSize: 12, fill: '#374151' },
  barVal: { fontSize: 11, fill: '#0a0a0a', fontWeight: 700 },
  legend: { display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 12 },
  legendItem: { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#374151' },
  legendSwatch: { width: 12, height: 12, borderRadius: 3, display: 'inline-block' },
  empty: { fontSize: 14, color: '#777', fontStyle: 'italic', padding: '24px 0', lineHeight: 1.6 },
};
