'use client';

import React from 'react';
import { fmtUsd } from '@/components/Report';
import { downloadExcel, buildSheets } from '@/lib/report-excel';
import { computeAnalytics } from '@/lib/report-analytics';

const GREEN = '#15803d';
const pct = (n: number | null) => (n == null ? '—' : `${n}%`);
const usd = (n: number | null) => (n ? fmtUsd(n) : '—');

export default function ExcelView({ data: rawData }: { data: any }) {
  const [busy, setBusy] = React.useState(false);
  const [open, setOpen] = React.useState<string | null>(null);
  const a = React.useMemo(() => computeAnalytics(rawData), [rawData]);
  const sheets = React.useMemo(() => buildSheets(rawData), [rawData]);

  async function handle() {
    if (busy) return;
    try { setBusy(true); await downloadExcel(rawData); }
    catch (e) { console.error(e); alert('Sorry, the Excel export failed. Please try again.'); }
    finally { setBusy(false); }
  }

  const byPriority = [...a.companies].sort((x, y) => y.priority - x.priority);
  const corr = (r: number | null) => {
    if (r == null) return '—';
    const mag = Math.abs(r);
    const w = mag < 0.2 ? 'none' : mag < 0.5 ? 'weak' : mag < 0.8 ? 'moderate' : 'strong';
    return `${r} (${w})`;
  };

  return (
    <div style={s.wrap}>
      <div style={s.head}>
        <div>
          <div style={s.eyebrow}>Spreadsheet · Analytics</div>
          <h1 style={s.title}>{a.sector} · data &amp; analytics</h1>
          <p style={s.sub}>
            {a.counts.total} companies, {sheets.length} worksheets. Distribution statistics, concentration
            and correlation, segment comparisons, a partnership-priority model, and best-fit targets —
            all viewable below and in the workbook.
          </p>
        </div>
        <button onClick={handle} disabled={busy} style={s.dl}>{busy ? 'Building…' : 'Download Excel (.xlsx)'}</button>
      </div>

      {/* Insights */}
      {a.insights.length > 0 && (
        <>
          <H>Key findings</H>
          <ul style={s.insights}>{a.insights.map((t, i) => <li key={i} style={s.insight}>{t}</li>)}</ul>
        </>
      )}

      {/* KPIs */}
      <div style={s.kpiGrid}>
        <Kpi label="Combined revenue" value={usd(a.totals.revenue)} />
        <Kpi label="Combined R&D" value={usd(a.totals.rd)} />
        <Kpi label="Aggregate R&D %" value={pct(a.aggregate.rdIntensity)} />
        <Kpi label="Aggregate net margin" value={pct(a.aggregate.netMargin)} />
        <Kpi label="Profitable" value={`${a.profitability.profitable}/${a.profitability.withData}`} />
        <Kpi label="Avg priority" value={`${a.priorityTiers.avg}/100`} />
        <Kpi label="UNC tie" value={`${a.counts.uncTie}/${a.counts.total}`} />
        <Kpi label="Best-fit targets" value={String(a.bestFit.length)} />
      </div>

      {/* Distribution shape */}
      <H>Distribution shape (5-number summary)</H>
      <div style={s.tableWrap}>
        <table style={s.table}>
          <thead><tr>{['Metric', 'Min', 'Q1', 'Median', 'Q3', 'Max', 'Mean', 'Std dev', 'CV'].map((h) => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
          <tbody>
            <StatRow label="Revenue" st={a.stats.revenue} money />
            <StatRow label="R&D intensity %" st={a.stats.rdIntensity} />
            <StatRow label="Net margin %" st={a.stats.netMargin} />
          </tbody>
        </table>
      </div>

      {/* Concentration + correlation + profitability */}
      <H>Structure &amp; relationships</H>
      <div style={s.cardRow}>
        <div style={s.miniCard}>
          <div style={s.miniTitle}>Revenue concentration</div>
          <Row k="HHI" v={`${a.concentration.hhi ?? '—'} (${a.concentration.label})`} />
          <Row k="Top-1 share" v={a.concentration.top1Share != null ? `${a.concentration.top1Share}%` : '—'} />
          <Row k="Top-3 share" v={a.concentration.top3Share != null ? `${a.concentration.top3Share}%` : '—'} />
        </div>
        <div style={s.miniCard}>
          <div style={s.miniTitle}>Correlation (Pearson r)</div>
          <Row k="R&D intensity ~ margin" v={corr(a.correlation.rdVsMargin)} />
          <Row k="Revenue ~ R&D spend" v={corr(a.correlation.revVsRd)} />
          <Row k="Revenue ~ R&D intensity" v={corr(a.correlation.sizeVsIntensity)} />
        </div>
        <div style={s.miniCard}>
          <div style={s.miniTitle}>Profitability &amp; priority</div>
          <Row k="Profitable firms" v={`${a.profitability.profitable}/${a.profitability.withData}`} />
          <Row k="High priority (≥60)" v={String(a.priorityTiers.high)} />
          <Row k="Medium / Low" v={`${a.priorityTiers.medium} / ${a.priorityTiers.low}`} />
        </div>
      </div>

      {/* Segment analysis */}
      <H>Segment analysis</H>
      <div style={s.tableWrap}>
        <table style={s.table}>
          <thead><tr>{['Segment', 'Cos', '% UNC tie', 'Avg revenue', 'Avg R&D %', 'Avg priority'].map((h) => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
          <tbody>
            {a.segments.map((g, i) => (
              <tr key={i}>
                <td style={s.tdName}>{g.label}</td>
                <td style={s.tdNum}>{g.count}</td>
                <td style={s.tdNum}>{g.tiePct}%</td>
                <td style={s.tdNum}>{g.avgRevenue ? usd(g.avgRevenue) : '—'}</td>
                <td style={s.tdNum}>{pct(g.avgRdIntensity)}</td>
                <td style={s.tdNum}>{g.avgPriority}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Best-fit targets */}
      {a.bestFit.length > 0 && (
        <>
          <H>Best-fit targets</H>
          <p style={s.note}>Existing UNC tie plus strategic scale or research overlap — the actionable shortlist.</p>
          <div style={s.tableWrap}>
            <table style={s.table}>
              <thead><tr>{['#', 'Company', 'Priority', 'Revenue', 'R&D %', 'Alignment', 'Type'].map((h) => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
              <tbody>
                {a.bestFit.map((c, i) => (
                  <tr key={i}>
                    <td style={s.tdNum}>{i + 1}</td>
                    <td style={s.tdName}>{c.name}</td>
                    <td style={s.tdNum}>{c.priority}</td>
                    <td style={s.tdNum}>{usd(c.revenue)}</td>
                    <td style={s.tdNum}>{pct(c.rdIntensity)}</td>
                    <td style={s.tdNum}>{c.alignment}</td>
                    <td style={s.tdNum}>{c.partnershipType}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Partnership priority */}
      <H>Partnership priority</H>
      <div style={s.tableWrap}>
        <table style={s.table}>
          <thead><tr>{['#', 'Company', 'Priority', 'Tie', 'Align', 'NC', 'Strategic', 'Trials'].map((h) => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
          <tbody>
            {byPriority.map((c, i) => (
              <tr key={i}>
                <td style={s.tdNum}>{i + 1}</td>
                <td style={s.tdName}>{c.name}</td>
                <td style={s.tdBar}><div style={s.barTrack}><div style={{ ...s.barFill, width: `${c.priority}%` }} /></div><span style={s.barVal}>{c.priority}</span></td>
                <td style={s.tdc}>{c.uncTie ? '✓' : ''}</td>
                <td style={s.tdNum}>{c.alignment}</td>
                <td style={s.tdc}>{c.ncBased ? '✓' : ''}</td>
                <td style={s.tdc}>{c.partnershipType === 'Strategic' ? '✓' : ''}</td>
                <td style={s.tdNum}>{c.trials}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Financial ratios */}
      <H>Financial ratios</H>
      <div style={s.tableWrap}>
        <table style={s.table}>
          <thead><tr>{['Company', 'Revenue', 'R&D', 'R&D %', 'Net margin %', 'ROA %', 'Rev / emp', 'Asset turn'].map((h) => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
          <tbody>
            {a.companies.map((c, i) => (
              <tr key={i}>
                <td style={s.tdName}>{c.name}</td>
                <td style={s.tdNum}>{usd(c.revenue)}</td>
                <td style={s.tdNum}>{usd(c.rd)}</td>
                <td style={s.tdNum}>{pct(c.rdIntensity)}</td>
                <td style={s.tdNum}>{pct(c.netMargin)}</td>
                <td style={s.tdNum}>{pct(c.roa)}</td>
                <td style={s.tdNum}>{c.revPerEmp ? usd(c.revPerEmp) : '—'}</td>
                <td style={s.tdNum}>{c.assetTurnover ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Live worksheets — click to preview */}
      <H>All worksheets ({sheets.length}) — click to view</H>
      <div style={s.sheetGrid}>
        {sheets.map((sh) => (
          <button key={sh.name} onClick={() => setOpen(open === sh.name ? null : sh.name)}
            style={{ ...s.sheetCard, ...(open === sh.name ? s.sheetCardActive : {}) }}>
            <div style={s.sheetName}>{sh.name}</div>
            <div style={s.sheetNote}>{sh.note}</div>
            <div style={s.sheetMeta}>{Math.max(0, sh.rows.length - 1)} rows · {open === sh.name ? 'hide ▲' : 'view ▼'}</div>
          </button>
        ))}
      </div>

      {open && <SheetPreview sheet={sheets.find((x) => x.name === open)!} />}
    </div>
  );
}

function SheetPreview({ sheet }: { sheet: { name: string; rows: (string | number | null)[][] } }) {
  const rows = sheet.rows;
  const header = rows[0] || [];
  const body = rows.slice(1, 81);
  const more = rows.length - 1 - body.length;
  return (
    <div style={s.preview}>
      <div style={s.previewHead}>{sheet.name}</div>
      <div style={s.tableWrap}>
        <table style={s.table}>
          <thead><tr>{header.map((h, i) => <th key={i} style={s.th}>{String(h ?? '')}</th>)}</tr></thead>
          <tbody>
            {body.map((r, i) => (
              <tr key={i}>{header.map((_, j) => <td key={j} style={s.tdPrev}>{r[j] == null ? '' : String(r[j])}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
      {more > 0 && <p style={s.note}>+{more} more rows in the downloaded workbook.</p>}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return <div style={s.kpi}><div style={s.kpiVal}>{value}</div><div style={s.kpiLbl}>{label}</div></div>;
}
function H({ children }: { children: React.ReactNode }) { return <h3 style={s.h3}>{children}</h3>; }
function Row({ k, v }: { k: string; v: string }) { return <div style={s.kv}><span style={s.kvK}>{k}</span><span style={s.kvV}>{v}</span></div>; }
function StatRow({ label, st, money }: { label: string; st: any; money?: boolean }) {
  const f = (n: number) => (money ? (n ? fmtUsd(n) : '—') : n);
  if (!st) return <tr><td style={s.tdName}>{label}</td><td style={s.tdNum} colSpan={8}>n/a</td></tr>;
  return (
    <tr>
      <td style={s.tdName}>{label}</td>
      {[st.min, st.q1, st.median, st.q3, st.max, st.mean, st.stdev].map((v: number, i: number) => <td key={i} style={s.tdNum}>{f(v)}</td>)}
      <td style={s.tdNum}>{st.cv ?? '—'}</td>
    </tr>
  );
}

const s: Record<string, React.CSSProperties> = {
  wrap: { maxWidth: 1000, margin: '0 auto', padding: '8px 4px 90px' },
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 20, flexWrap: 'wrap', marginTop: 16 },
  eyebrow: { fontSize: 11, letterSpacing: '0.22em', color: '#999', textTransform: 'uppercase', marginBottom: 10 },
  title: { fontSize: 'clamp(26px, 4vw, 38px)', fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.1 },
  sub: { fontSize: 14.5, color: '#666', marginTop: 12, maxWidth: 700, lineHeight: 1.6 },
  dl: { fontSize: 14, fontWeight: 600, color: '#fff', background: GREEN, padding: '12px 18px', borderRadius: 999, whiteSpace: 'nowrap' },
  h3: { fontSize: 13, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#0a0a0a', marginTop: 42, marginBottom: 14 },
  note: { fontSize: 12.5, color: '#777', marginTop: -6, marginBottom: 14, lineHeight: 1.6 },
  insights: { margin: 0, paddingLeft: 20 },
  insight: { fontSize: 14.5, lineHeight: 1.6, color: '#1f2937', marginBottom: 8 },
  kpiGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12, marginTop: 28 },
  kpi: { border: '1px solid #eee', borderRadius: 12, padding: '14px 16px', background: '#fafafa' },
  kpiVal: { fontSize: 23, fontWeight: 700, letterSpacing: '-0.02em', color: '#0a0a0a' },
  kpiLbl: { fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#777', marginTop: 6 },
  cardRow: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 },
  miniCard: { border: '1px solid #eee', borderRadius: 12, padding: '16px 18px' },
  miniTitle: { fontSize: 13, fontWeight: 700, color: '#0a0a0a', marginBottom: 10 },
  kv: { display: 'flex', justifyContent: 'space-between', gap: 10, padding: '6px 0', borderTop: '1px solid #f3f4f6', fontSize: 13 },
  kvK: { color: '#666' }, kvV: { color: '#0a0a0a', fontWeight: 600, textAlign: 'right' },
  tableWrap: { overflowX: 'auto', borderRadius: 10, border: '1px solid #eee' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { textAlign: 'left', padding: '9px 12px', background: '#fafafa', color: '#666', fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', whiteSpace: 'nowrap' },
  tdName: { padding: '8px 12px', color: '#0a0a0a', fontWeight: 600, borderTop: '1px solid #f0f0f0', whiteSpace: 'nowrap' },
  tdNum: { padding: '8px 12px', color: '#1f2937', borderTop: '1px solid #f0f0f0', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' },
  tdPrev: { padding: '7px 12px', color: '#1f2937', borderTop: '1px solid #f0f0f0', verticalAlign: 'top', maxWidth: 340, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  tdc: { padding: '8px 12px', color: GREEN, borderTop: '1px solid #f0f0f0', textAlign: 'center', fontWeight: 700 },
  tdBar: { padding: '8px 12px', borderTop: '1px solid #f0f0f0', minWidth: 140 },
  barTrack: { display: 'inline-block', width: 90, height: 8, background: '#f0f0f0', borderRadius: 999, overflow: 'hidden', verticalAlign: 'middle' },
  barFill: { height: '100%', background: '#0a0a0a', borderRadius: 999 },
  barVal: { marginLeft: 8, fontSize: 12, fontWeight: 600, verticalAlign: 'middle' },
  sheetGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 },
  sheetCard: { textAlign: 'left', border: '1px solid #e5e5e5', borderRadius: 12, padding: '12px 14px', background: '#fafafa', cursor: 'pointer' },
  sheetCardActive: { border: `1px solid ${GREEN}`, background: '#f0fdf4' },
  sheetName: { fontSize: 14, fontWeight: 700, color: GREEN },
  sheetNote: { fontSize: 12, color: '#666', marginTop: 4, lineHeight: 1.45 },
  sheetMeta: { fontSize: 11, color: '#999', marginTop: 8, fontWeight: 600 },
  preview: { marginTop: 16, border: '1px solid #e5e5e5', borderRadius: 12, padding: 16, background: '#fff' },
  previewHead: { fontSize: 13, fontWeight: 700, color: '#0a0a0a', marginBottom: 12 },
};
