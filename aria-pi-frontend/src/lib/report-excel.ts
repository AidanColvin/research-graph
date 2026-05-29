/**
 * Excel export — a multi-worksheet analytics workbook built from the report.
 * Goes well beyond the report tables: financial ratios, rankings, a partnership
 * priority model, distributions, and sector-level statistics. Numbers come from
 * the shared analytics engine so the workbook matches the on-screen view.
 */
import { normalize } from '@/components/Report';
import { reportFilename } from '@/lib/report-export';
import { computeAnalytics } from '@/lib/report-analytics';

type Row = (string | number | null)[];

function autoCols(rows: Row[]): { wch: number }[] {
  const widths: number[] = [];
  for (const r of rows) {
    r.forEach((c, i) => {
      const len = c == null ? 0 : String(c).length;
      widths[i] = Math.max(widths[i] || 10, Math.min(64, len + 2));
    });
  }
  return widths.map((w) => ({ wch: w }));
}

export function excelSheetSummary(rawData: any): { name: string; note: string }[] {
  return [
    { name: 'Summary', note: 'Sector totals, counts, and key statistics' },
    { name: 'Company Master', note: 'One row per company, all attributes' },
    { name: 'Financials', note: 'Revenue, R&D, net income, assets, employees' },
    { name: 'Financial Ratios', note: 'R&D intensity, net margin, ROA, per-employee, asset turnover' },
    { name: 'Rankings', note: 'Leaders by revenue, R&D intensity, margin, trials, alignment' },
    { name: 'Partnership Priority', note: 'Outreach-priority score and its components' },
    { name: 'UNC Engagement', note: 'Ties, alignment signals, trials, alumni' },
    { name: 'Distributions', note: 'Counts by type, tie, NC, revenue band' },
    { name: 'Sector Analytics', note: 'Totals, averages, medians, aggregate ratios' },
    { name: 'Clinical Trials', note: 'Every trial program by company' },
    { name: 'UNC Alignment', note: 'Company-to-UNC research overlaps' },
    { name: 'Known Partnerships', note: 'Existing UNC partnerships' },
    { name: 'UNC Faculty', note: 'Faculty with sector expertise' },
    { name: 'References', note: 'AMA citation list' },
  ];
}

export async function downloadExcel(rawData: any) {
  const XLSX = await import('xlsx');
  const d = normalize(rawData);
  const a = computeAnalytics(rawData);
  const wb = XLSX.utils.book_new();
  const add = (name: string, rows: Row[]) => {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = autoCols(rows);
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
  };

  // 1. Summary
  add('Summary', [
    ['map · Partnership Intelligence'],
    ['Sector', a.sector],
    ['Generated', d.report_meta.generated_at || d.report_meta.date || ''],
    ['Company selection', d._meta?.resolution || ''],
    [],
    ['Metric', 'Value'],
    ['Companies reviewed', a.counts.total],
    ['Public (with SEC financials)', a.counts.publicWithFinancials],
    ['Documented UNC tie', a.counts.uncTie],
    ['Strategic scale', a.counts.strategic],
    ['NC-based', a.counts.ncBased],
    ['Combined revenue (USD)', a.totals.revenue || null],
    ['Combined R&D (USD)', a.totals.rd || null],
    ['Aggregate R&D % of revenue', a.aggregate.rdIntensity],
    ['Aggregate net margin %', a.aggregate.netMargin],
    ['Total trial programs', a.totals.trials],
    ['Total UNC alignment signals', a.totals.alignment],
    ['Claims double-sourced', d._validation ? `${d._validation.verified}/${d._validation.total_claims}` : ''],
  ]);

  // 2. Company Master
  add('Company Master', [
    ['Company', 'Ticker', 'Sector (SIC)', 'HQ', 'NC-based', 'Partnership type', 'Existing UNC tie',
      'Trials', 'Alignment', 'Partners', 'Signals', 'Alumni', 'Priority'],
    ...a.companies.map((c) => [c.name, c.ticker, c.sic, c.hq, c.ncBased ? 'Yes' : 'No', c.partnershipType,
      c.uncTie ? 'Yes' : 'No', c.trials, c.alignment, c.partners, c.signals, c.alumni, c.priority]),
  ]);

  // 3. Financials (raw numbers so Excel can chart/compute)
  add('Financials', [
    ['Company', 'Revenue (USD)', 'R&D (USD)', 'Net income (USD)', 'Total assets (USD)', 'Employees'],
    ...a.companies.map((c) => [c.name, c.revenue || null, c.rd || null, c.netIncome || null, c.assets || null, c.employees || null]),
  ]);

  // 4. Financial Ratios
  add('Financial Ratios', [
    ['Company', 'R&D % of revenue', 'Net margin %', 'Return on assets %', 'Revenue / employee (USD)', 'R&D / employee (USD)', 'Asset turnover'],
    ...a.companies.map((c) => [c.name, c.rdIntensity, c.netMargin, c.roa, c.revPerEmp, c.rdPerEmp, c.assetTurnover]),
  ]);

  // 5. Rankings (parallel top-10 columns)
  const rk = a.rankings;
  const maxLen = Math.max(rk.revenue.length, rk.rdIntensity.length, rk.netMargin.length, rk.trials.length, rk.alignment.length);
  const rankRows: Row[] = [[
    'By revenue', '', 'By R&D intensity %', '', 'By net margin %', '', 'By trial programs', '', 'By alignment', '',
  ]];
  for (let i = 0; i < maxLen; i++) {
    rankRows.push([
      rk.revenue[i]?.name || '', rk.revenue[i] ? Math.round(rk.revenue[i].value) : '',
      rk.rdIntensity[i]?.name || '', rk.rdIntensity[i]?.value ?? '',
      rk.netMargin[i]?.name || '', rk.netMargin[i]?.value ?? '',
      rk.trials[i]?.name || '', rk.trials[i]?.value ?? '',
      rk.alignment[i]?.name || '', rk.alignment[i]?.value ?? '',
    ]);
  }
  add('Rankings', rankRows);

  // 6. Partnership Priority (sorted, with components)
  const byPriority = [...a.companies].sort((x, y) => y.priority - x.priority);
  add('Partnership Priority', [
    ['Rank', 'Company', 'Priority (0-100)', 'Existing tie (+40)', 'Alignment (+5 ea, cap 25)', 'NC-based (+15)', 'Strategic (+10)', 'Has trials (+10)'],
    ...byPriority.map((c, i) => [i + 1, c.name, c.priority,
      c.uncTie ? 40 : 0, Math.min(25, c.alignment * 5), c.ncBased ? 15 : 0,
      c.partnershipType === 'Strategic' ? 10 : 0, c.trials > 0 ? 10 : 0]),
  ]);

  // 7. UNC Engagement
  add('UNC Engagement', [
    ['Company', 'Existing tie', 'Alignment signals', 'Trial programs', 'UNC alumni found', 'Priority'],
    ...a.companies.map((c) => [c.name, c.uncTie ? 'Yes' : 'No', c.alignment, c.trials, c.alumni, c.priority]),
  ]);

  // 8. Distributions
  const distBlock = (title: string, dist: { label: string; value: number }[]): Row[] =>
    [[title, ''], ...dist.map((x) => [x.label, x.value]), []];
  add('Distributions', [
    ['Distribution', 'Count'],
    [],
    ...distBlock('By partnership type', a.distributions.byType),
    ...distBlock('By UNC tie', a.distributions.byTie),
    ...distBlock('By NC presence', a.distributions.byNc),
    ...distBlock('By revenue band', a.distributions.byRevenueBucket),
  ]);

  // 9. Sector Analytics
  add('Sector Analytics', [
    ['Statistic', 'Value'],
    ['Companies', a.counts.total],
    ['Public with financials', a.counts.publicWithFinancials],
    ['Combined revenue (USD)', a.totals.revenue || null],
    ['Combined R&D (USD)', a.totals.rd || null],
    ['Combined net income (USD)', a.totals.netIncome || null],
    ['Combined total assets (USD)', a.totals.assets || null],
    ['Total employees', a.totals.employees || null],
    ['Average revenue (USD)', a.averages.revenue],
    ['Median revenue (USD)', a.medians.revenue],
    ['Average R&D intensity %', a.averages.rdIntensity],
    ['Median R&D intensity %', a.medians.rdIntensity],
    ['Aggregate R&D intensity %', a.aggregate.rdIntensity],
    ['Average net margin %', a.averages.netMargin],
    ['Median net margin %', a.medians.netMargin],
    ['Aggregate net margin %', a.aggregate.netMargin],
    ['Aggregate ROA %', a.aggregate.roa],
    ['Total trial programs', a.totals.trials],
    ['Total alignment signals', a.totals.alignment],
    ['Share with UNC tie %', a.counts.total ? Math.round(100 * a.counts.uncTie / a.counts.total) : null],
    ['Share NC-based %', a.counts.total ? Math.round(100 * a.counts.ncBased / a.counts.total) : null],
  ]);

  // 10-14. Detail sheets from the report
  const profs = d.section4_profiles || [];
  const trialRows: Row[] = [['Company', 'Program', 'Stage']];
  profs.forEach((p) => (p.pipeline || []).forEach((t) => trialRows.push([p.company_name, t.program, t.stage])));
  add('Clinical Trials', trialRows);

  const alignRows: Row[] = [['Company', 'Company program', 'UNC unit', 'UNC fact', 'Why it matters']];
  profs.forEach((p) => (p.unc_alignment || []).forEach((x) => alignRows.push([p.company_name, x.company_program, x.unc_unit, x.unc_fact, x.rationale])));
  add('UNC Alignment', alignRows);

  const kp = d.section2_internal_mapping.known_partnerships || [];
  add('Known Partnerships', [['Company', 'UNC unit', 'Type', 'Active?'], ...kp.map((p) => [p.company, p.unc_unit, p.relationship_type, p.active])]);

  const fac = d.section2_internal_mapping.unc_faculty || [];
  add('UNC Faculty', [['Name', 'School', 'Research focus'], ...fac.map((f) => [f.name, f.school, f.research_focus])]);

  add('References', [['#', 'Citation', 'URL'], ...(d.references || []).map((r: any) => [r.id, `${r.publisher || ''} ${r.title || ''}`.trim(), r.url])]);

  XLSX.writeFile(wb, `${reportFilename(rawData)}.xlsx`);
}
