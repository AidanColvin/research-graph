'use client';

import React from 'react';
import { normalize, parseMoney, fmtUsd } from '@/components/Report';
import { downloadExcel, excelSheetSummary } from '@/lib/report-excel';

export default function ExcelView({ data: rawData }: { data: any }) {
  const [busy, setBusy] = React.useState(false);
  const d = React.useMemo(() => normalize(rawData), [rawData]);
  const sheets = React.useMemo(() => excelSheetSummary(rawData), [rawData]);
  const profs = d.section4_profiles || [];

  async function handle() {
    if (busy) return;
    try { setBusy(true); await downloadExcel(rawData); }
    catch (e) { console.error(e); alert('Sorry, the Excel export failed. Please try again.'); }
    finally { setBusy(false); }
  }

  const fact = (p: any, k: string) => p?.facts?.[k]?.value || '';

  return (
    <div style={styles.wrap}>
      <div style={styles.head}>
        <div>
          <div style={styles.eyebrow}>Spreadsheet</div>
          <h1 style={styles.title}>{d.report_meta.sector} · data workbook</h1>
          <p style={styles.sub}>
            Every quantitative figure in the report, structured for comparison and analysis
            across {profs.length} companies. {sheets.length} worksheets.
          </p>
        </div>
        <button onClick={handle} disabled={busy} style={styles.dl}>
          {busy ? 'Building…' : 'Download Excel (.xlsx)'}
        </button>
      </div>

      <h3 style={styles.h3}>Worksheets</h3>
      <div style={styles.sheetGrid}>
        {sheets.map((s) => (
          <div key={s.name} style={styles.sheetCard}>
            <div style={styles.sheetName}>{s.name}</div>
            <div style={styles.sheetNote}>{s.note}</div>
            <div style={styles.sheetRows}>{s.rows} rows</div>
          </div>
        ))}
      </div>

      <h3 style={styles.h3}>Preview · Companies</h3>
      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              {['Company', 'Type', 'NC', 'UNC tie', 'Revenue', 'R&D', 'Net income', 'Trials', 'Alignment'].map((h) => (
                <th key={h} style={styles.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {profs.map((p, i) => (
              <tr key={i}>
                <td style={styles.tdName}>{p.company_name}</td>
                <td style={styles.td}>{p.partnership_type}</td>
                <td style={styles.td}>{p.nc_based ? 'Yes' : ''}</td>
                <td style={styles.td}>{p.existing_unc_tie ? 'Yes' : ''}</td>
                <td style={styles.tdNum}>{fact(p, 'revenue') || 'n/a'}</td>
                <td style={styles.tdNum}>{fact(p, 'rd_expense') || ''}</td>
                <td style={styles.tdNum}>{fact(p, 'net_income') || ''}</td>
                <td style={styles.tdNum}>{p.pipeline?.length || 0}</td>
                <td style={styles.tdNum}>{p.unc_alignment?.length || 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={styles.note}>
        The downloaded workbook also includes Financials (with R&D-to-revenue and net-margin
        ratios), Clinical Trials, UNC Alignment, Known Partnerships, UNC Faculty, an Analytics
        sheet (rankings and averages), and References.
      </p>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { maxWidth: 960, margin: '0 auto', padding: '8px 4px 80px' },
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 20, flexWrap: 'wrap', marginTop: 16 },
  eyebrow: { fontSize: 11, letterSpacing: '0.22em', color: '#999', textTransform: 'uppercase', marginBottom: 10 },
  title: { fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.1 },
  sub: { fontSize: 15, color: '#666', marginTop: 12, maxWidth: 620, lineHeight: 1.6 },
  dl: { fontSize: 14, fontWeight: 600, color: '#fff', background: '#15803d', padding: '12px 18px', borderRadius: 999, whiteSpace: 'nowrap' },
  h3: { fontSize: 13, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#0a0a0a', marginTop: 40, marginBottom: 14 },
  sheetGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 },
  sheetCard: { border: '1px solid #eee', borderRadius: 12, padding: '14px 16px', background: '#fafafa' },
  sheetName: { fontSize: 15, fontWeight: 700, color: '#15803d' },
  sheetNote: { fontSize: 12.5, color: '#666', marginTop: 4, lineHeight: 1.5 },
  sheetRows: { fontSize: 11, color: '#999', marginTop: 8 },
  tableWrap: { overflowX: 'auto', borderRadius: 10, border: '1px solid #eee' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { textAlign: 'left', padding: '10px 12px', background: '#fafafa', color: '#666', fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap' },
  td: { padding: '9px 12px', color: '#1f2937', borderTop: '1px solid #f0f0f0' },
  tdName: { padding: '9px 12px', color: '#0a0a0a', fontWeight: 600, borderTop: '1px solid #f0f0f0', whiteSpace: 'nowrap' },
  tdNum: { padding: '9px 12px', color: '#1f2937', borderTop: '1px solid #f0f0f0', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' },
  note: { fontSize: 12.5, color: '#999', marginTop: 18, lineHeight: 1.6, fontStyle: 'italic' },
};
