'use client';

import React from 'react';
import { fmtUsd } from '@/components/Report';
import { downloadExcel, excelSheetSummary } from '@/lib/report-excel';
import { computeAnalytics, type Dist } from '@/lib/report-analytics';

const GREEN = '#15803d';
const pct = (n: number | null) => (n == null ? '—' : `${n}%`);
const usd = (n: number) => (n ? fmtUsd(n) : '—');

export default function ExcelView({ data: rawData }: { data: any }) {
  const [busy, setBusy] = React.useState(false);
  const a = React.useMemo(() => computeAnalytics(rawData), [rawData]);
  const sheets = React.useMemo(() => excelSheetSummary(rawData), [rawData]);

  async function handle() {
    if (busy) return;
    try { setBusy(true); await downloadExcel(rawData); }
    catch (e) { console.error(e); alert('Sorry, the Excel export failed. Please try again.'); }
    finally { setBusy(false); }
  }

  const byPriority = [...a.companies].sort((x, y) => y.priority - x.priority);

  return (
    <div style={s.wrap}>
      <div style={s.head}>
        <div>
          <div style={s.eyebrow}>Spreadsheet · Analytics</div>
          <h1 style={s.title}>{a.sector} · data &amp; analytics</h1>
          <p style={s.sub}>
            {a.counts.total} companies analyzed across {sheets.length} worksheets — financial ratios,
            rankings, a partnership-priority model, distributions, and sector statistics. View it all
            below, or download the full workbook.
          </p>
        </div>
        <button onClick={handle} disabled={busy} style={s.dl}>
          {busy ? 'Building…' : 'Download Excel (.xlsx)'}
        </button>
      </div>

      {/* KPI cards */}
      <div style={s.kpiGrid}>
        <Kpi label="Combined revenue" value={usd(a.totals.revenue)} />
        <Kpi label="Combined R&D" value={usd(a.totals.rd)} />
        <Kpi label="Aggregate R&D intensity" value={pct(a.aggregate.rdIntensity)} />
        <Kpi label="Aggregate net margin" value={pct(a.aggregate.netMargin)} />
        <Kpi label="Median revenue" value={a.medians.revenue ? usd(a.medians.revenue) : '—'} />
        <Kpi label="Total trial programs" value={String(a.totals.trials)} />
        <Kpi label="UNC tie" value={`${a.counts.uncTie}/${a.counts.total}`} />
        <Kpi label="Public w/ financials" value={`${a.counts.publicWithFinancials}/${a.counts.total}`} />
      </div>

      {/* Distributions */}
      <H>Distributions</H>
      <div style={s.distGrid}>
        <DistCard title="Partnership type" dist={a.distributions.byType} />
        <DistCard title="Revenue band" dist={a.distributions.byRevenueBucket} />
        <DistCard title="UNC connection" dist={a.distributions.byTie} />
        <DistCard title="NC presence" dist={a.distributions.byNc} />
      </div>

      {/* Partnership priority */}
      <H>Partnership priority model</H>
      <p style={s.note}>
        Score (0-100) = existing UNC tie (+40) · alignment signals (+5 each, cap 25) · NC-based (+15)
        · strategic scale (+10) · has trials (+10). A quick outreach-ranking heuristic.
      </p>
      <div style={s.tableWrap}>
        <table style={s.table}>
          <thead><tr>{['#', 'Company', 'Priority', 'Tie', 'Align', 'NC', 'Strategic', 'Trials'].map((h) => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
          <tbody>
            {byPriority.map((c, i) => (
              <tr key={i}>
                <td style={s.tdNum}>{i + 1}</td>
                <td style={s.tdName}>{c.name}</td>
                <td style={s.tdBar}>
                  <div style={s.barTrack}><div style={{ ...s.barFill, width: `${c.priority}%` }} /></div>
                  <span style={s.barVal}>{c.priority}</span>
                </td>
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

      {/* Rankings quick lists */}
      <H>Leaders</H>
      <div style={s.rankGrid}>
        <RankList title="Revenue" items={a.rankings.revenue} fmt={(v) => usd(v)} />
        <RankList title="R&D intensity %" items={a.rankings.rdIntensity} fmt={(v) => `${v}%`} />
        <RankList title="Trial programs" items={a.rankings.trials} fmt={(v) => String(v)} />
        <RankList title="UNC alignment" items={a.rankings.alignment} fmt={(v) => String(v)} />
      </div>

      {/* Worksheet manifest */}
      <H>Workbook contents ({sheets.length} sheets)</H>
      <div style={s.sheetGrid}>
        {sheets.map((sh) => (
          <div key={sh.name} style={s.sheetCard}>
            <div style={s.sheetName}>{sh.name}</div>
            <div style={s.sheetNote}>{sh.note}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div style={s.kpi}>
      <div style={s.kpiVal}>{value}</div>
      <div style={s.kpiLbl}>{label}</div>
    </div>
  );
}

function H({ children }: { children: React.ReactNode }) {
  return <h3 style={s.h3}>{children}</h3>;
}

function DistCard({ title, dist }: { title: string; dist: Dist }) {
  const total = dist.reduce((x, y) => x + y.value, 0) || 1;
  return (
    <div style={s.distCard}>
      <div style={s.distTitle}>{title}</div>
      {dist.map((x, i) => (
        <div key={i} style={s.distRow}>
          <div style={s.distLabel} title={x.label}>{x.label}</div>
          <div style={s.barTrack}><div style={{ ...s.barFill, width: `${(x.value / total) * 100}%`, background: GREEN }} /></div>
          <span style={s.distVal}>{x.value}</span>
        </div>
      ))}
    </div>
  );
}

function RankList({ title, items, fmt }: { title: string; items: { name: string; value: number }[]; fmt: (v: number) => string }) {
  return (
    <div style={s.rankCard}>
      <div style={s.rankTitle}>{title}</div>
      {items.slice(0, 6).map((it, i) => (
        <div key={i} style={s.rankRow}>
          <span style={s.rankName}>{i + 1}. {it.name}</span>
          <span style={s.rankVal}>{fmt(it.value)}</span>
        </div>
      ))}
      {!items.length && <div style={s.rankEmpty}>No data</div>}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  wrap: { maxWidth: 1000, margin: '0 auto', padding: '8px 4px 80px' },
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 20, flexWrap: 'wrap', marginTop: 16 },
  eyebrow: { fontSize: 11, letterSpacing: '0.22em', color: '#999', textTransform: 'uppercase', marginBottom: 10 },
  title: { fontSize: 'clamp(26px, 4vw, 38px)', fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.1 },
  sub: { fontSize: 14.5, color: '#666', marginTop: 12, maxWidth: 680, lineHeight: 1.6 },
  dl: { fontSize: 14, fontWeight: 600, color: '#fff', background: GREEN, padding: '12px 18px', borderRadius: 999, whiteSpace: 'nowrap' },
  h3: { fontSize: 13, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#0a0a0a', marginTop: 42, marginBottom: 14 },
  note: { fontSize: 12.5, color: '#777', marginTop: -6, marginBottom: 14, lineHeight: 1.6 },
  kpiGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12, marginTop: 28 },
  kpi: { border: '1px solid #eee', borderRadius: 12, padding: '14px 16px', background: '#fafafa' },
  kpiVal: { fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', color: '#0a0a0a' },
  kpiLbl: { fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#777', marginTop: 6 },
  distGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 },
  distCard: { border: '1px solid #eee', borderRadius: 12, padding: '16px 18px' },
  distTitle: { fontSize: 13, fontWeight: 700, marginBottom: 12, color: '#0a0a0a' },
  distRow: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 },
  distLabel: { width: 120, fontSize: 12, color: '#374151', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flexShrink: 0 },
  distVal: { width: 28, textAlign: 'right', fontSize: 12, fontWeight: 600, flexShrink: 0 },
  tableWrap: { overflowX: 'auto', borderRadius: 10, border: '1px solid #eee' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { textAlign: 'left', padding: '9px 12px', background: '#fafafa', color: '#666', fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', whiteSpace: 'nowrap' },
  tdName: { padding: '8px 12px', color: '#0a0a0a', fontWeight: 600, borderTop: '1px solid #f0f0f0', whiteSpace: 'nowrap' },
  tdNum: { padding: '8px 12px', color: '#1f2937', borderTop: '1px solid #f0f0f0', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' },
  tdc: { padding: '8px 12px', color: GREEN, borderTop: '1px solid #f0f0f0', textAlign: 'center', fontWeight: 700 },
  tdBar: { padding: '8px 12px', borderTop: '1px solid #f0f0f0', minWidth: 140 },
  barTrack: { display: 'inline-block', width: 90, height: 8, background: '#f0f0f0', borderRadius: 999, overflow: 'hidden', verticalAlign: 'middle' },
  barFill: { height: '100%', background: '#0a0a0a', borderRadius: 999 },
  barVal: { marginLeft: 8, fontSize: 12, fontWeight: 600, verticalAlign: 'middle' },
  rankGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 },
  rankCard: { border: '1px solid #eee', borderRadius: 12, padding: '14px 16px', background: '#fafafa' },
  rankTitle: { fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: GREEN, marginBottom: 10 },
  rankRow: { display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13, marginBottom: 6 },
  rankName: { color: '#1f2937', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  rankVal: { color: '#0a0a0a', fontWeight: 600, flexShrink: 0, fontVariantNumeric: 'tabular-nums' },
  rankEmpty: { fontSize: 12, color: '#999', fontStyle: 'italic' },
  sheetGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 },
  sheetCard: { border: '1px solid #eee', borderRadius: 12, padding: '12px 14px', background: '#fafafa' },
  sheetName: { fontSize: 14, fontWeight: 700, color: GREEN },
  sheetNote: { fontSize: 12, color: '#666', marginTop: 4, lineHeight: 1.45 },
};
