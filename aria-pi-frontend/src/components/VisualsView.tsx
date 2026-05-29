'use client';

import React from 'react';
import { fmtUsd } from '@/components/Report';
import { computeAnalytics, type CompanyMetrics } from '@/lib/report-analytics';

const INDIGO = '#4f46e5';
const INK = '#0a0a0a';
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
          Fifteen views of the {a.sector} field, each computed from the searched sector&apos;s own
          companies and figures — positioning, financial structure, concentration, correlation,
          distribution, ranking, and UNC engagement.
        </p>
      </div>

      <Card title="Opportunity matrix" caption="Revenue (log) vs partnership priority. Bubble size = trial programs; filled = existing UNC tie. Quadrants split at the medians.">
        <OpportunityMatrix cos={cos} />
      </Card>

      <Card title="Company × metric heatmap" caption="Each cell shaded by the company's percentile rank for that metric — a fast read on who leads where.">
        <Heatmap cos={cos} />
      </Card>

      <Card title="Profitability vs R&D intensity" caption="Horizontal = R&D as % of revenue; vertical = net margin %. Dashed line is break-even.">
        <Scatter cos={cos} />
      </Card>

      <Card title="Metric correlation matrix" caption="Pairwise Pearson correlation across financial metrics. Indigo = positive, red = negative; deeper = stronger.">
        <CorrMatrix m={a.correlationMatrix} />
      </Card>

      <Card title="Revenue concentration (Lorenz curve)" caption="Cumulative share of revenue vs cumulative share of companies. The further the curve bows from the diagonal, the more concentrated the sector.">
        <Lorenz cos={cos} hhi={a.concentration.hhi} label={a.concentration.label} />
      </Card>

      <Card title="Revenue vs R&D by company" caption="Side-by-side revenue and R&D spend for the largest firms.">
        <GroupedFinancials cos={cos} />
      </Card>

      <Card title="Distribution box plots" caption="Five-number summaries: whiskers span min to max, the box covers Q1-Q3, the line marks the median.">
        <BoxPlots a={a} />
      </Card>

      <Card title="Revenue treemap" caption="Area is proportional to each company's latest reported revenue.">
        <Treemap cos={cos} />
      </Card>

      <Card title="Size vs fit (slope)" caption="Rank by revenue on the left, rank by partnership priority on the right. Indigo lines rise — firms that punch above their size on UNC fit.">
        <SlopeRank cos={cos} />
      </Card>

      <Card title="Priority composition" caption="What drives each company's priority score: tie, alignment, NC presence, scale, trials.">
        <PriorityStacks cos={cos} />
      </Card>

      <Card title="Net margin spread" caption="Profitability by company, diverging from break-even. Red = loss-making.">
        <DivergingMargin cos={cos} />
      </Card>

      <Card title="R&D intensity distribution" caption="Companies per R&D-intensity band; the top band is an overflow bucket.">
        <Histogram cos={cos} />
      </Card>

      <Card title="Leader profiles (radar)" caption="Top three by priority across five normalized dimensions. Each axis is scaled 0-1 against the set.">
        <Radar cos={cos} />
      </Card>

      <Card title="UNC engagement scatter" caption="Trial programs vs research-alignment signals. Bubble size = priority; filled = existing tie.">
        <TrialAlign cos={cos} />
      </Card>

      <Card title="Engagement funnel" caption="The set narrows from all companies to the actionable shortlist.">
        <Funnel a={a} />
      </Card>
    </div>
  );
}

// ── helpers ──────────────────────────────────────────────────────────────────
function Card({ title, caption, children }: { title: string; caption: string; children: React.ReactNode }) {
  return (
    <div style={st.card}>
      <div style={st.cardTitle}>{title}</div>
      <div style={st.cardCaption}>{caption}</div>
      <div>{children}</div>
    </div>
  );
}
const lin = (v: number, d0: number, d1: number, r0: number, r1: number) => d1 === d0 ? (r0 + r1) / 2 : r0 + ((v - d0) / (d1 - d0)) * (r1 - r0);
const median = (arr: number[]) => { if (!arr.length) return 0; const a = [...arr].sort((x, y) => x - y); const m = Math.floor(a.length / 2); return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
function ranks(vals: (number | null)[]): (number | null)[] {
  const idx = vals.map((v, i) => ({ v, i })).filter((o) => o.v != null).sort((x, y) => (x.v as number) - (y.v as number));
  const out = vals.map(() => null as number | null);
  idx.forEach((o, k) => { out[o.i] = idx.length > 1 ? k / (idx.length - 1) : 1; });
  return out;
}
function Empty() { return <div style={st.empty}>Not enough reported data for this view.</div>; }
function Legend({ items }: { items: { label: string; color: string }[] }) {
  return <div style={st.legend}>{items.map((it, i) => <span key={i} style={st.legendItem}><span style={{ ...st.legendSwatch, background: it.color }} />{it.label}</span>)}</div>;
}

// ── 1. Opportunity matrix ────────────────────────────────────────────────────
function OpportunityMatrix({ cos }: { cos: CompanyMetrics[] }) {
  const pts = cos.filter((c) => c.revenue > 0);
  if (!pts.length) return <Empty />;
  const W = 820, H = 480, pl = 64, pr = 24, pt = 24, pb = 48;
  const xs = pts.map((c) => Math.log10(c.revenue));
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const X = (c: CompanyMetrics) => lin(Math.log10(c.revenue), x0, x1, pl, W - pr);
  const Y = (c: CompanyMetrics) => lin(c.priority, 0, 100, H - pb, pt);
  const xMidPx = lin(median(xs), x0, x1, pl, W - pr);
  const yMidPx = lin(50, 0, 100, H - pb, pt);
  const labelled = [...pts].sort((a, b) => b.priority - a.priority).slice(0, 6);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={st.svg}>
      <line x1={xMidPx} y1={pt} x2={xMidPx} y2={H - pb} stroke="#eee" />
      <line x1={pl} y1={yMidPx} x2={W - pr} y2={yMidPx} stroke="#eee" />
      <text x={W - pr - 4} y={pt + 14} textAnchor="end" style={st.quad}>Pursue now</text>
      <text x={pl + 4} y={pt + 14} style={st.quad}>Build relationship</text>
      <text x={W - pr - 4} y={H - pb - 6} textAnchor="end" style={st.quad}>Monitor</text>
      <text x={pl + 4} y={H - pb - 6} style={st.quad}>Watch</text>
      <line x1={pl} y1={H - pb} x2={W - pr} y2={H - pb} stroke="#ccc" />
      <line x1={pl} y1={pt} x2={pl} y2={H - pb} stroke="#ccc" />
      <text x={(pl + W - pr) / 2} y={H - 10} textAnchor="middle" style={st.axis}>Revenue (log) →</text>
      <text x={16} y={(pt + H - pb) / 2} textAnchor="middle" style={st.axis} transform={`rotate(-90 16 ${(pt + H - pb) / 2})`}>Priority →</text>
      {pts.map((c, i) => <circle key={i} cx={X(c)} cy={Y(c)} r={5 + Math.min(c.trials, 10) * 1.4} fill={c.uncTie ? INDIGO : '#fff'} stroke={INDIGO} strokeWidth={1.5} fillOpacity={c.uncTie ? 0.85 : 1} />)}
      {labelled.map((c, i) => <text key={i} x={X(c) + 8} y={Y(c) - 8} style={st.pointLabel}>{c.name}</text>)}
    </svg>
  );
}

// ── 2. Heatmap ───────────────────────────────────────────────────────────────
function Heatmap({ cos }: { cos: CompanyMetrics[] }) {
  if (!cos.length) return <Empty />;
  const metrics: { label: string; get: (c: CompanyMetrics) => number | null; fmt: (v: number) => string }[] = [
    { label: 'Revenue', get: (c) => (c.revenue > 0 ? c.revenue : null), fmt: (v) => fmtUsd(v) },
    { label: 'R&D', get: (c) => (c.rd > 0 ? c.rd : null), fmt: (v) => fmtUsd(v) },
    { label: 'R&D %', get: (c) => c.rdIntensity, fmt: (v) => `${v}%` },
    { label: 'Margin %', get: (c) => c.netMargin, fmt: (v) => `${v}%` },
    { label: 'ROA %', get: (c) => c.roa, fmt: (v) => `${v}%` },
    { label: 'Trials', get: (c) => c.trials, fmt: (v) => String(v) },
    { label: 'Align', get: (c) => c.alignment, fmt: (v) => String(v) },
    { label: 'Priority', get: (c) => c.priority, fmt: (v) => String(v) },
  ];
  const rk = metrics.map((m) => ranks(cos.map(m.get)));
  const rows = cos.length;
  const W = 820, pl = 150, top = 26, rowH = 26;
  const cw = (W - pl) / metrics.length;
  const H = top + rows * rowH + 4;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={st.svg}>
      {metrics.map((m, j) => <text key={j} x={pl + j * cw + cw / 2} y={16} textAnchor="middle" style={st.axisSm}>{m.label}</text>)}
      {cos.map((c, i) => (
        <g key={i}>
          <text x={pl - 8} y={top + i * rowH + rowH / 2 + 4} textAnchor="end" style={st.barLabel}>{c.name}</text>
          {metrics.map((m, j) => {
            const v = m.get(c); const r = rk[j][i];
            const x = pl + j * cw, y = top + i * rowH;
            return (
              <g key={j}>
                <rect x={x + 1} y={y + 1} width={cw - 2} height={rowH - 2} fill={r == null ? '#f4f4f4' : INDIGO} fillOpacity={r == null ? 1 : 0.12 + r * 0.8} />
                {v != null && <text x={x + cw / 2} y={y + rowH / 2 + 4} textAnchor="middle" style={{ fontSize: 10, fill: (r ?? 0) > 0.6 ? '#fff' : '#1f2937' }}>{m.fmt(v)}</text>}
              </g>
            );
          })}
        </g>
      ))}
    </svg>
  );
}

// ── 3. Scatter ───────────────────────────────────────────────────────────────
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

// ── 4. Correlation matrix ────────────────────────────────────────────────────
function CorrMatrix({ m }: { m: { labels: string[]; matrix: (number | null)[][] } }) {
  const n = m.labels.length;
  if (!n) return <Empty />;
  const W = 700, pl = 90, pt = 90, cell = (W - pl) / n;
  const H = pt + n * cell + 4;
  const col = (r: number | null) => {
    if (r == null) return '#f4f4f4';
    return r >= 0 ? `rgba(79,70,229,${0.12 + Math.abs(r) * 0.85})` : `rgba(185,28,28,${0.12 + Math.abs(r) * 0.85})`;
  };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ ...st.svg, maxWidth: 560 }}>
      {m.labels.map((l, j) => <text key={`c${j}`} x={pl + j * cell + cell / 2} y={pt - 8} textAnchor="middle" style={st.axisSm} transform={`rotate(-35 ${pl + j * cell + cell / 2} ${pt - 8})`}>{l}</text>)}
      {m.labels.map((l, i) => (
        <g key={`r${i}`}>
          <text x={pl - 8} y={pt + i * cell + cell / 2 + 4} textAnchor="end" style={st.axisSm}>{l}</text>
          {m.matrix[i].map((r, j) => {
            const x = pl + j * cell, y = pt + i * cell;
            return (
              <g key={j}>
                <rect x={x + 1} y={y + 1} width={cell - 2} height={cell - 2} fill={col(r)} />
                <text x={x + cell / 2} y={y + cell / 2 + 4} textAnchor="middle" style={{ fontSize: 11, fill: r != null && Math.abs(r) > 0.55 ? '#fff' : '#374151' }}>{r == null ? '' : r.toFixed(2)}</text>
              </g>
            );
          })}
        </g>
      ))}
    </svg>
  );
}

// ── 5. Lorenz curve ──────────────────────────────────────────────────────────
function Lorenz({ cos, hhi, label }: { cos: CompanyMetrics[]; hhi: number | null; label: string }) {
  const revs = cos.filter((c) => c.revenue > 0).map((c) => c.revenue).sort((a, b) => b - a);
  if (revs.length < 2) return <Empty />;
  const total = revs.reduce((s, x) => s + x, 0);
  const n = revs.length;
  const W = 600, H = 440, pl = 50, pr = 20, pt = 20, pb = 46;
  const pts: [number, number][] = [[0, 0]];
  let cum = 0;
  revs.forEach((r, i) => { cum += r; pts.push([(i + 1) / n, cum / total]); });
  const X = (f: number) => lin(f, 0, 1, pl, W - pr);
  const Y = (f: number) => lin(f, 0, 1, H - pb, pt);
  const path = pts.map((p, i) => `${i ? 'L' : 'M'} ${X(p[0]).toFixed(1)} ${Y(p[1]).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ ...st.svg, maxWidth: 560 }}>
      <line x1={pl} y1={H - pb} x2={W - pr} y2={pt} stroke="#ccc" strokeDasharray="4 4" />
      <path d={`${path} L ${X(1)} ${Y(0)} Z`} fill={INDIGO} fillOpacity={0.08} />
      <path d={path} fill="none" stroke={INDIGO} strokeWidth={2.5} />
      <line x1={pl} y1={pt} x2={pl} y2={H - pb} stroke="#ccc" />
      <line x1={pl} y1={H - pb} x2={W - pr} y2={H - pb} stroke="#ccc" />
      <text x={(pl + W - pr) / 2} y={H - 8} textAnchor="middle" style={st.axis}>Cumulative share of companies →</text>
      <text x={14} y={(pt + H - pb) / 2} textAnchor="middle" style={st.axis} transform={`rotate(-90 14 ${(pt + H - pb) / 2})`}>Cumulative revenue →</text>
      <text x={X(0.04)} y={Y(0.95)} style={st.pointLabel}>{label}{hhi != null ? ` (HHI ${hhi})` : ''}</text>
    </svg>
  );
}

// ── 6. Grouped financials (revenue vs R&D) ───────────────────────────────────
function GroupedFinancials({ cos }: { cos: CompanyMetrics[] }) {
  const items = cos.filter((c) => c.revenue > 0).sort((a, b) => b.revenue - a.revenue).slice(0, 8);
  if (!items.length) return <Empty />;
  const W = 820, pl = 150, pr = 70, top = 30, groupH = 46;
  const H = top + items.length * groupH + 10;
  const max = Math.max(...items.map((c) => Math.max(c.revenue, c.rd)), 1);
  const Xw = (v: number) => (v / max) * (W - pl - pr);
  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} style={st.svg}>
        {items.map((c, i) => {
          const y = top + i * groupH;
          return (
            <g key={i}>
              <text x={pl - 8} y={y + groupH / 2 + 2} textAnchor="end" style={st.barLabel}>{c.name}</text>
              <rect x={pl} y={y + 4} width={Xw(c.revenue)} height={14} fill={INK} />
              <text x={pl + Xw(c.revenue) + 5} y={y + 15} style={st.barVal}>{fmtUsd(c.revenue)}</text>
              <rect x={pl} y={y + 22} width={Xw(c.rd)} height={14} fill={INDIGO} />
              <text x={pl + Xw(c.rd) + 5} y={y + 33} style={st.barVal}>{fmtUsd(c.rd)}</text>
            </g>
          );
        })}
      </svg>
      <Legend items={[{ label: 'Revenue', color: INK }, { label: 'R&D', color: INDIGO }]} />
    </>
  );
}

// ── 7. Box plots ─────────────────────────────────────────────────────────────
function BoxPlots({ a }: { a: ReturnType<typeof computeAnalytics> }) {
  const defs = [
    { label: 'Revenue', st: a.stats.revenue, money: true },
    { label: 'R&D intensity %', st: a.stats.rdIntensity, money: false },
    { label: 'Net margin %', st: a.stats.netMargin, money: false },
  ].filter((d) => d.st);
  if (!defs.length) return <Empty />;
  const W = 820, pl = 130, pr = 30, rowH = 90, top = 10;
  const H = top + defs.length * rowH;
  const fmt = (v: number, money: boolean) => (money ? fmtUsd(v) : `${v}`);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={st.svg}>
      {defs.map((d, i) => {
        const s = d.st!;
        const cy = top + i * rowH + rowH / 2 - 8;
        const lo = d.money ? Math.log10(Math.max(1, s.min)) : s.min;
        const hi = d.money ? Math.log10(Math.max(1, s.max)) : s.max;
        const sc = (v: number) => lin(d.money ? Math.log10(Math.max(1, v)) : v, lo, hi, pl, W - pr);
        return (
          <g key={i}>
            <text x={pl - 10} y={cy + 4} textAnchor="end" style={st.barLabel}>{d.label}</text>
            <line x1={sc(s.min)} y1={cy} x2={sc(s.max)} y2={cy} stroke="#bbb" />
            <line x1={sc(s.min)} y1={cy - 8} x2={sc(s.min)} y2={cy + 8} stroke="#bbb" />
            <line x1={sc(s.max)} y1={cy - 8} x2={sc(s.max)} y2={cy + 8} stroke="#bbb" />
            <rect x={sc(s.q1)} y={cy - 14} width={Math.max(1, sc(s.q3) - sc(s.q1))} height={28} fill={INDIGO} fillOpacity={0.18} stroke={INDIGO} />
            <line x1={sc(s.median)} y1={cy - 14} x2={sc(s.median)} y2={cy + 14} stroke={INDIGO} strokeWidth={2} />
            <text x={sc(s.min)} y={cy + 30} textAnchor="middle" style={st.axisSm}>{fmt(s.min, d.money)}</text>
            <text x={sc(s.median)} y={cy - 20} textAnchor="middle" style={st.axisSm}>med {fmt(s.median, d.money)}</text>
            <text x={sc(s.max)} y={cy + 30} textAnchor="middle" style={st.axisSm}>{fmt(s.max, d.money)}</text>
          </g>
        );
      })}
    </svg>
  );
}

// ── 8. Treemap ───────────────────────────────────────────────────────────────
function Treemap({ cos }: { cos: CompanyMetrics[] }) {
  const items = cos.filter((c) => c.revenue > 0).sort((a, b) => b.revenue - a.revenue);
  if (!items.length) return <Empty />;
  const total = items.reduce((s, c) => s + c.revenue, 0);
  const W = 820, H = 440;
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
      rects.push(
        <g key={`${ri}-${ci}`}>
          <rect x={x} y={y} width={rw - 2} height={rh - 2} fill={INDIGO} fillOpacity={Math.max(0.35, 0.9 - (ri + ci) * 0.07)} />
          {rw > 70 && rh > 28 && <><text x={x + 8} y={y + 20} style={st.tmName}>{c.name}</text><text x={x + 8} y={y + 38} style={st.tmVal}>{fmtUsd(c.revenue)}</text></>}
        </g>,
      );
      x += rw;
    });
    y += rh;
  });
  return <svg viewBox={`0 0 ${W} ${H}`} style={st.svg}>{rects}</svg>;
}

// ── 9. Slope: rank by revenue vs rank by priority ────────────────────────────
function SlopeRank({ cos }: { cos: CompanyMetrics[] }) {
  const items = cos.filter((c) => c.revenue > 0);
  if (items.length < 2) return <Empty />;
  const byRev = [...items].sort((a, b) => b.revenue - a.revenue);
  const byPri = [...items].sort((a, b) => b.priority - a.priority);
  const revRank = new Map(byRev.map((c, i) => [c.name, i]));
  const priRank = new Map(byPri.map((c, i) => [c.name, i]));
  const n = items.length;
  const W = 820, pt = 24, pb = 20, lx = 250, rx = W - 250;
  const H = pt + n * 26 + pb;
  const Y = (rank: number) => lin(rank, 0, n - 1, pt, H - pb);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={st.svg}>
      <text x={lx} y={14} textAnchor="end" style={st.axisSm}>Rank by revenue</text>
      <text x={rx} y={14} style={st.axisSm}>Rank by priority</text>
      {items.map((c, i) => {
        const yr = Y(revRank.get(c.name)!), yp = Y(priRank.get(c.name)!);
        const rises = priRank.get(c.name)! < revRank.get(c.name)!;
        return (
          <g key={i}>
            <line x1={lx} y1={yr} x2={rx} y2={yp} stroke={rises ? INDIGO : '#d4d4d4'} strokeWidth={rises ? 2 : 1} />
            <circle cx={lx} cy={yr} r={3} fill="#999" />
            <circle cx={rx} cy={yp} r={3} fill={rises ? INDIGO : '#999'} />
            <text x={lx - 8} y={yr + 4} textAnchor="end" style={st.barLabel}>{c.name}</text>
            <text x={rx + 8} y={yp + 4} style={{ ...st.barLabel, fill: rises ? INDIGO : '#374151' }}>{c.name}</text>
          </g>
        );
      })}
    </svg>
  );
}

// ── 10. Priority composition ─────────────────────────────────────────────────
function PriorityStacks({ cos }: { cos: CompanyMetrics[] }) {
  const items = [...cos].sort((a, b) => b.priority - a.priority).slice(0, 12).filter((c) => c.priority > 0);
  if (!items.length) return <Empty />;
  const W = 820, rowH = 30, pl = 150, pr = 40, top = 10;
  const H = top + items.length * rowH + 6;
  const segs = [
    { label: 'Tie', color: '#312e81', val: (c: CompanyMetrics) => (c.uncTie ? 40 : 0) },
    { label: 'Alignment', color: '#4f46e5', val: (c: CompanyMetrics) => Math.min(25, c.alignment * 5) },
    { label: 'NC', color: '#818cf8', val: (c: CompanyMetrics) => (c.ncBased ? 15 : 0) },
    { label: 'Strategic', color: '#a5b4fc', val: (c: CompanyMetrics) => (c.partnershipType === 'Strategic' ? 10 : 0) },
    { label: 'Trials', color: '#c7d2fe', val: (c: CompanyMetrics) => (c.trials > 0 ? 10 : 0) },
  ];
  const X = (v: number) => (v / 100) * (W - pl - pr);
  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} style={st.svg}>
        {items.map((c, i) => {
          let x = pl; const y = top + i * rowH;
          return (
            <g key={i}>
              <text x={pl - 8} y={y + rowH / 2 + 4} textAnchor="end" style={st.barLabel}>{c.name}</text>
              {segs.map((sg) => { const w = X(sg.val(c)); const rect = w > 0 ? <rect key={sg.label} x={x} y={y + 5} width={w} height={rowH - 12} fill={sg.color} /> : null; x += w; return rect; })}
              <text x={x + 6} y={y + rowH / 2 + 4} style={st.barVal}>{c.priority}</text>
            </g>
          );
        })}
      </svg>
      <Legend items={segs.map((sg) => ({ label: sg.label, color: sg.color }))} />
    </>
  );
}

// ── 11. Diverging margin ─────────────────────────────────────────────────────
function DivergingMargin({ cos }: { cos: CompanyMetrics[] }) {
  const items = cos.filter((c) => c.netMargin != null).sort((a, b) => (b.netMargin || 0) - (a.netMargin || 0)) as (CompanyMetrics & { netMargin: number })[];
  if (!items.length) return <Empty />;
  const W = 820, rowH = 28, pl = 150, pr = 56, top = 12;
  const H = top + items.length * rowH + 10;
  const maxAbs = Math.max(...items.map((c) => Math.abs(c.netMargin)), 5);
  const mid = pl + (W - pl - pr) / 2; const half = (W - pl - pr) / 2;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={st.svg}>
      <line x1={mid} y1={top} x2={mid} y2={H - 10} stroke="#ccc" />
      {items.map((c, i) => {
        const y = top + i * rowH; const w = (Math.abs(c.netMargin) / maxAbs) * half; const pos = c.netMargin >= 0;
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

// ── 12. Histogram ────────────────────────────────────────────────────────────
function Histogram({ cos }: { cos: CompanyMetrics[] }) {
  const vals = cos.map((c) => c.rdIntensity).filter((v): v is number => v != null);
  if (vals.length < 2) return <Empty />;
  const sorted = [...vals].sort((a, b) => a - b);
  const p90 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.9))];
  const cap = Math.max(30, Math.ceil(p90 / 10) * 10);
  const binW = Math.max(5, Math.ceil((cap / 8) / 5) * 5);
  const nbins = Math.max(1, Math.ceil(cap / binW));
  const bins = Array.from({ length: nbins }, (_, i) => ({ lo: i * binW, hi: (i + 1) * binW, n: 0 }));
  vals.forEach((v) => { bins[Math.min(nbins - 1, Math.floor(v / binW))].n++; });
  const W = 820, H = 360, pl = 40, pr = 20, pt = 20, pb = 44;
  const maxN = Math.max(...bins.map((b) => b.n), 1); const bw = (W - pl - pr) / nbins;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={st.svg}>
      <line x1={pl} y1={H - pb} x2={W - pr} y2={H - pb} stroke="#ccc" />
      {bins.map((b, i) => {
        const h = (b.n / maxN) * (H - pt - pb); const x = pl + i * bw;
        return (
          <g key={i}>
            <rect x={x + 3} y={H - pb - h} width={bw - 6} height={h} fill={INDIGO} fillOpacity={0.85} />
            {b.n > 0 && <text x={x + bw / 2} y={H - pb - h - 6} textAnchor="middle" style={st.barVal}>{b.n}</text>}
            <text x={x + bw / 2} y={H - pb + 16} textAnchor="middle" style={st.axisSm}>{i === nbins - 1 ? `${b.lo}+%` : `${b.lo}-${b.hi}%`}</text>
          </g>
        );
      })}
      <text x={(pl + W - pr) / 2} y={H - 6} textAnchor="middle" style={st.axis}>R&D intensity band</text>
    </svg>
  );
}

// ── 13. Radar (top 3 by priority) ────────────────────────────────────────────
function Radar({ cos }: { cos: CompanyMetrics[] }) {
  const top = [...cos].sort((a, b) => b.priority - a.priority).slice(0, 3);
  if (top.length < 1) return <Empty />;
  const dims = [
    { label: 'Revenue', get: (c: CompanyMetrics) => c.revenue },
    { label: 'R&D %', get: (c: CompanyMetrics) => c.rdIntensity || 0 },
    { label: 'Margin %', get: (c: CompanyMetrics) => Math.max(0, c.netMargin || 0) },
    { label: 'Trials', get: (c: CompanyMetrics) => c.trials },
    { label: 'Alignment', get: (c: CompanyMetrics) => c.alignment },
  ];
  const maxes = dims.map((d) => Math.max(...cos.map((c) => d.get(c)), 1));
  const W = 560, H = 460, cx = W / 2, cy = H / 2 + 8, R = 150;
  const ang = (i: number) => -Math.PI / 2 + (i / dims.length) * Math.PI * 2;
  const pt = (i: number, frac: number) => [cx + R * frac * Math.cos(ang(i)), cy + R * frac * Math.sin(ang(i))];
  const colors = [INDIGO, '#818cf8', '#c7d2fe'];
  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ ...st.svg, maxWidth: 480 }}>
        {[0.25, 0.5, 0.75, 1].map((g, gi) => (
          <polygon key={gi} points={dims.map((_, i) => pt(i, g).join(',')).join(' ')} fill="none" stroke="#eee" />
        ))}
        {dims.map((d, i) => {
          const [x, y] = pt(i, 1.12);
          return <text key={i} x={x} y={y} textAnchor="middle" style={st.axisSm}>{d.label}</text>;
        })}
        {top.map((c, ci) => {
          const poly = dims.map((d, i) => pt(i, Math.min(1, d.get(c) / maxes[i])).join(',')).join(' ');
          return <polygon key={ci} points={poly} fill={colors[ci]} fillOpacity={0.12} stroke={colors[ci]} strokeWidth={2} />;
        })}
      </svg>
      <Legend items={top.map((c, i) => ({ label: c.name, color: colors[i] }))} />
    </>
  );
}

// ── 14. Trials vs alignment ──────────────────────────────────────────────────
function TrialAlign({ cos }: { cos: CompanyMetrics[] }) {
  const pts = cos.filter((c) => c.trials > 0 || c.alignment > 0);
  if (!pts.length) return <Empty />;
  const W = 820, H = 440, pl = 50, pr = 24, pt = 24, pb = 48;
  const xMax = Math.max(...pts.map((c) => c.trials), 1);
  const yMax = Math.max(...pts.map((c) => c.alignment), 1);
  const X = (v: number) => lin(v, 0, xMax, pl, W - pr);
  const Y = (v: number) => lin(v, 0, yMax, H - pb, pt);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={st.svg}>
      <line x1={pl} y1={pt} x2={pl} y2={H - pb} stroke="#ccc" />
      <line x1={pl} y1={H - pb} x2={W - pr} y2={H - pb} stroke="#ccc" />
      <text x={(pl + W - pr) / 2} y={H - 10} textAnchor="middle" style={st.axis}>Trial programs →</text>
      <text x={14} y={(pt + H - pb) / 2} textAnchor="middle" style={st.axis} transform={`rotate(-90 14 ${(pt + H - pb) / 2})`}>UNC alignment →</text>
      {pts.map((c, i) => {
        const jx = (i % 3 - 1) * 4, jy = (i % 2 - 0.5) * 6;
        return (
          <g key={i}>
            <circle cx={X(c.trials) + jx} cy={Y(c.alignment) + jy} r={5 + c.priority / 14} fill={c.uncTie ? INDIGO : '#fff'} stroke={INDIGO} strokeWidth={1.5} fillOpacity={c.uncTie ? 0.8 : 1} />
            {(c.alignment >= 2 || c.trials >= 4) && <text x={X(c.trials) + jx + 8} y={Y(c.alignment) + jy - 7} style={st.pointLabel}>{c.name}</text>}
          </g>
        );
      })}
    </svg>
  );
}

// ── 15. Funnel ───────────────────────────────────────────────────────────────
function Funnel({ a }: { a: ReturnType<typeof computeAnalytics> }) {
  const stages = [
    { label: 'All companies', value: a.counts.total },
    { label: 'Public w/ financials', value: a.counts.publicWithFinancials },
    { label: 'Existing UNC tie', value: a.counts.uncTie },
    { label: 'Best-fit targets', value: a.bestFit.length },
  ];
  const W = 820, rowH = 64, pt = 16; const H = pt + stages.length * rowH + 10;
  const max = Math.max(...stages.map((s) => s.value), 1);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={st.svg}>
      {stages.map((s, i) => {
        const w = Math.max(40, (s.value / max) * (W - 40)); const x = (W - w) / 2; const y = pt + i * rowH;
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

const st: Record<string, React.CSSProperties> = {
  wrap: { maxWidth: 1000, margin: '0 auto', padding: '8px 4px 90px' },
  head: { marginTop: 16, marginBottom: 24 },
  eyebrow: { fontSize: 11, letterSpacing: '0.22em', color: '#999', textTransform: 'uppercase', marginBottom: 10 },
  title: { fontSize: 'clamp(26px, 4vw, 38px)', fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.1 },
  sub: { fontSize: 14.5, color: '#666', marginTop: 12, maxWidth: 720, lineHeight: 1.6 },
  card: { border: '1px solid #eee', borderRadius: 16, padding: '22px 24px', marginBottom: 20, background: '#fff' },
  cardTitle: { fontSize: 18, fontWeight: 700, letterSpacing: '-0.01em', color: '#0a0a0a' },
  cardCaption: { fontSize: 13, color: '#777', marginTop: 6, marginBottom: 16, lineHeight: 1.55, maxWidth: 780 },
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
