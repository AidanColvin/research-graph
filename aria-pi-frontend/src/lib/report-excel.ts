/**
 * Excel export — turns the report's quantitative data into a multi-worksheet
 * .xlsx workbook for company comparison and analysis. Built from the same
 * normalized report the web view uses, so the numbers always match.
 */
import { normalize, parseMoney } from '@/components/Report';
import { reportFilename } from '@/lib/report-export';

type Row = (string | number | null)[];

function autoCols(rows: Row[]): { wch: number }[] {
  const widths: number[] = [];
  for (const r of rows) {
    r.forEach((c, i) => {
      const len = c == null ? 0 : String(c).length;
      widths[i] = Math.max(widths[i] || 10, Math.min(60, len + 2));
    });
  }
  return widths.map((w) => ({ wch: w }));
}

const fact = (p: any, k: string) => p?.facts?.[k]?.value ?? '';
const num = (p: any, k: string) => parseMoney(p?.facts?.[k]?.value);

// Describe every worksheet the workbook will contain (for the on-screen preview).
export function excelSheetSummary(rawData: any): { name: string; rows: number; note: string }[] {
  const d = normalize(rawData);
  const profs = d.section4_profiles || [];
  return [
    { name: 'Summary', rows: 8, note: 'Sector totals and counts' },
    { name: 'Companies', rows: profs.length, note: 'One row per company, all key facts' },
    { name: 'Financials', rows: profs.length, note: 'Revenue, R&D, income, assets + ratios' },
    { name: 'Clinical Trials', rows: profs.reduce((s, p) => s + (p.pipeline?.length || 0), 0), note: 'Every trial program by company' },
    { name: 'UNC Alignment', rows: profs.reduce((s, p) => s + (p.unc_alignment?.length || 0), 0), note: 'Company-to-UNC research overlaps' },
    { name: 'Known Partnerships', rows: (d.section2_internal_mapping.known_partnerships || []).length, note: 'Existing UNC partnerships' },
    { name: 'UNC Faculty', rows: (d.section2_internal_mapping.unc_faculty || []).length, note: 'Faculty with sector expertise' },
    { name: 'Analytics', rows: 12, note: 'Rankings, averages, ratios' },
    { name: 'References', rows: (d.references || []).length, note: 'AMA citation list' },
  ];
}

export async function downloadExcel(rawData: any) {
  const XLSX = await import('xlsx');
  const d = normalize(rawData);
  const profs = d.section4_profiles || [];
  const m = d.report_meta;
  const wb = XLSX.utils.book_new();

  const add = (name: string, rows: Row[]) => {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = autoCols(rows);
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
  };

  // ── Summary ──
  const tied = profs.filter((p) => p.existing_unc_tie).length;
  const strategic = profs.filter((p) => p.partnership_type === 'Strategic').length;
  const ncBased = profs.filter((p) => p.nc_based).length;
  const totalTrials = profs.reduce((s, p) => s + (p.pipeline?.length || 0), 0);
  const totalAlign = profs.reduce((s, p) => s + (p.unc_alignment?.length || 0), 0);
  add('Summary', [
    ['map · Partnership Intelligence'],
    ['Sector', m.sector],
    ['Generated', m.generated_at || m.date || ''],
    ['Company selection', d._meta?.resolution || ''],
    [],
    ['Metric', 'Value'],
    ['Companies reviewed', profs.length],
    ['Documented UNC tie', tied],
    ['Strategic scale', strategic],
    ['NC-based', ncBased],
    ['Trial programs', totalTrials],
    ['UNC alignment signals', totalAlign],
    ['Claims double-sourced', d._validation ? `${d._validation.verified}/${d._validation.total_claims}` : ''],
  ]);

  // ── Companies ──
  const compHead = ['Company', 'Sector (SIC)', 'NC-based', 'Partnership type', 'Existing UNC tie',
    'Ticker', 'CIK', 'HQ', 'Revenue', 'R&D', 'Net income', 'Total assets', 'Employees',
    'Trial programs', 'UNC alignment signals', 'UNC alumni found'];
  add('Companies', [compHead, ...profs.map((p) => [
    p.company_name, p.sector_tag || '', p.nc_based ? 'Yes' : 'No', p.partnership_type,
    p.existing_unc_tie ? 'Yes' : 'No',
    fact(p, 'ticker'), fact(p, 'cik'), fact(p, 'hq'),
    fact(p, 'revenue'), fact(p, 'rd_expense'), fact(p, 'net_income'), fact(p, 'total_assets'), fact(p, 'employees'),
    p.pipeline?.length || 0, p.unc_alignment?.length || 0, p.unc_alumni?.length || 0,
  ])]);

  // ── Financials (raw numbers + ratios) ──
  const finHead = ['Company', 'Revenue (USD)', 'R&D (USD)', 'Net income (USD)', 'Total assets (USD)',
    'R&D % of revenue', 'Net margin %'];
  add('Financials', [finHead, ...profs.map((p) => {
    const rev = num(p, 'revenue'), rd = num(p, 'rd_expense'), ni = num(p, 'net_income'), ta = num(p, 'total_assets');
    return [
      p.company_name, rev || null, rd || null, ni || null, ta || null,
      rev ? +(100 * rd / rev).toFixed(1) : null,
      rev ? +(100 * ni / rev).toFixed(1) : null,
    ];
  })]);

  // ── Clinical Trials ──
  const trialRows: Row[] = [['Company', 'Program', 'Stage']];
  profs.forEach((p) => (p.pipeline || []).forEach((t) => trialRows.push([p.company_name, t.program, t.stage])));
  add('Clinical Trials', trialRows);

  // ── UNC Alignment ──
  const alignRows: Row[] = [['Company', 'Company program', 'UNC unit', 'UNC fact', 'Why it matters']];
  profs.forEach((p) => (p.unc_alignment || []).forEach((a) =>
    alignRows.push([p.company_name, a.company_program, a.unc_unit, a.unc_fact, a.rationale])));
  add('UNC Alignment', alignRows);

  // ── Known Partnerships ──
  const kp = d.section2_internal_mapping.known_partnerships || [];
  add('Known Partnerships', [['Company', 'UNC unit', 'Type', 'Active?'],
    ...kp.map((p) => [p.company, p.unc_unit, p.relationship_type, p.active])]);

  // ── UNC Faculty ──
  const fac = d.section2_internal_mapping.unc_faculty || [];
  add('UNC Faculty', [['Name', 'School', 'Research focus'],
    ...fac.map((f) => [f.name, f.school, f.research_focus])]);

  // ── Analytics ──
  const withRev = profs.map((p) => ({ name: p.company_name, rev: num(p, 'revenue'), rd: num(p, 'rd_expense') }))
    .filter((x) => x.rev > 0);
  const sumRev = withRev.reduce((s, x) => s + x.rev, 0);
  const sumRd = withRev.reduce((s, x) => s + x.rd, 0);
  const topRev = [...withRev].sort((a, b) => b.rev - a.rev)[0];
  const topRd = [...withRev].sort((a, b) => b.rd - a.rd)[0];
  const mostTrials = [...profs].sort((a, b) => (b.pipeline?.length || 0) - (a.pipeline?.length || 0))[0];
  const mostAlign = [...profs].sort((a, b) => (b.unc_alignment?.length || 0) - (a.unc_alignment?.length || 0))[0];
  add('Analytics', [
    ['Metric', 'Value'],
    ['Public companies (with SEC financials)', withRev.length],
    ['Combined revenue (USD)', sumRev || null],
    ['Combined R&D (USD)', sumRd || null],
    ['Average revenue (USD)', withRev.length ? Math.round(sumRev / withRev.length) : null],
    ['Aggregate R&D % of revenue', sumRev ? +(100 * sumRd / sumRev).toFixed(1) : null],
    ['Highest revenue', topRev ? `${topRev.name} (${topRev.rev.toLocaleString()})` : ''],
    ['Highest R&D', topRd ? `${topRd.name} (${topRd.rd.toLocaleString()})` : ''],
    ['Most trial programs', mostTrials ? `${mostTrials.company_name} (${mostTrials.pipeline?.length || 0})` : ''],
    ['Most UNC alignment signals', mostAlign ? `${mostAlign.company_name} (${mostAlign.unc_alignment?.length || 0})` : ''],
    ['Share with documented UNC tie', profs.length ? `${Math.round(100 * tied / profs.length)}%` : ''],
    ['Share NC-based', profs.length ? `${Math.round(100 * ncBased / profs.length)}%` : ''],
  ]);

  // ── References ──
  add('References', [['#', 'Citation', 'URL'],
    ...(d.references || []).map((r: any) => [r.id, `${r.publisher || ''} ${r.title || ''}`.trim(), r.url])]);

  XLSX.writeFile(wb, `${reportFilename(rawData)}.xlsx`);
}
