/**
 * Excel export — a deep multi-worksheet analytics workbook built from the
 * report. buildSheets() is the single source of truth: it returns every sheet's
 * name, note, and rows, so the on-screen Excel view can preview each sheet live
 * and the .xlsx download contains exactly the same data.
 */
import { normalize, fmtUsd } from '@/components/Report';
import { reportFilename } from '@/lib/report-export';
import { computeAnalytics } from '@/lib/report-analytics';

export type Cell = string | number | null;
export type Sheet = { name: string; note: string; rows: Cell[][] };

const usd = (n: number | null) => (n ? fmtUsd(n) : 'n/a');
const pct = (n: number | null) => (n == null ? 'n/a' : `${n}%`);

export function buildSheets(rawData: any): Sheet[] {
  const d = normalize(rawData);
  const a = computeAnalytics(rawData);
  const C = a.counts;
  const sheets: Sheet[] = [];
  const S = (name: string, note: string, rows: Cell[][]) => sheets.push({ name, note, rows });

  // 1. Summary
  S('Summary', 'Sector totals, counts, and headline statistics', [
    ['map · Partnership Intelligence'],
    ['Sector', a.sector],
    ['Generated', d.report_meta.generated_at || d.report_meta.date || ''],
    ['Company selection', d._meta?.resolution || ''],
    [],
    ['Metric', 'Value'],
    ['Companies reviewed', C.total],
    ['Public (with SEC financials)', C.publicWithFinancials],
    ['Documented UNC tie', C.uncTie],
    ['Strategic scale', C.strategic],
    ['NC-based', C.ncBased],
    ['Combined revenue (USD)', a.totals.revenue || null],
    ['Combined R&D (USD)', a.totals.rd || null],
    ['Aggregate R&D % of revenue', a.aggregate.rdIntensity],
    ['Aggregate net margin %', a.aggregate.netMargin],
    ['Profitable firms', `${a.profitability.profitable}/${a.profitability.withData}`],
    ['Total trial programs', a.totals.trials],
    ['Total UNC alignment signals', a.totals.alignment],
    ['Average priority (0-100)', a.priorityTiers.avg],
    ['Claims double-sourced', d._validation ? `${d._validation.verified}/${d._validation.total_claims}` : ''],
  ]);

  // 2. Insights
  S('Insights', 'Auto-generated, data-driven findings', [['#', 'Insight'], ...a.insights.map((t, i) => [i + 1, t])]);

  // 3. Sector Statistics (distribution shape)
  const stRow = (label: string, st: typeof a.stats.revenue, money = false) => st
    ? [label, money ? usd(st.min) : st.min, money ? usd(st.q1) : st.q1, money ? usd(st.median) : st.median,
       money ? usd(st.q3) : st.q3, money ? usd(st.max) : st.max, money ? usd(st.mean) : st.mean,
       money ? usd(st.stdev) : st.stdev, st.cv]
    : [label, 'n/a', '', '', '', '', '', '', ''];
  S('Sector Statistics', 'Min, quartiles, mean, dispersion per metric', [
    ['Metric', 'Min', 'Q1', 'Median', 'Q3', 'Max', 'Mean', 'Std dev', 'CV'],
    stRow('Revenue (USD)', a.stats.revenue, true),
    stRow('R&D intensity %', a.stats.rdIntensity),
    stRow('Net margin %', a.stats.netMargin),
  ]);

  // 4. Concentration & Correlation
  S('Concentration & Correlation', 'Market concentration and metric relationships', [
    ['Measure', 'Value', 'Reading'],
    ['Revenue HHI', a.concentration.hhi, a.concentration.label],
    ['Top-1 revenue share %', a.concentration.top1Share, ''],
    ['Top-3 revenue share %', a.concentration.top3Share, ''],
    [],
    ['Correlation (Pearson r)', 'r', ''],
    ['R&D intensity vs net margin', a.correlation.rdVsMargin, ''],
    ['Revenue vs R&D spend', a.correlation.revVsRd, ''],
    ['Revenue vs R&D intensity', a.correlation.sizeVsIntensity, ''],
  ]);

  // 5. Segment Analysis
  S('Segment Analysis', 'Averages by segment (scale, geography, tie)', [
    ['Segment', 'Companies', '% with UNC tie', 'Avg revenue (USD)', 'Avg R&D intensity %', 'Avg priority'],
    ...a.segments.map((s) => [s.label, s.count, `${s.tiePct}%`, s.avgRevenue ? usd(s.avgRevenue) : 'n/a', pct(s.avgRdIntensity), s.avgPriority]),
    [],
    ['Cross-tab', 'Strategic', 'Translational', '', '', ''],
    ['Existing UNC tie', a.crosstab.tieStrategic, a.crosstab.tieTranslational, '', '', ''],
    ['No documented tie', a.crosstab.noTieStrategic, a.crosstab.noTieTranslational, '', '', ''],
  ]);

  // 6. Best-Fit Targets
  S('Best-Fit Targets', 'Existing tie + strategic scale or research overlap', [
    ['Rank', 'Company', 'Priority', 'Revenue', 'R&D intensity %', 'Alignment', 'Type'],
    ...a.bestFit.map((c, i) => [i + 1, c.name, c.priority, usd(c.revenue), pct(c.rdIntensity), c.alignment, c.partnershipType]),
  ]);

  // 7. Company Master
  S('Company Master', 'One row per company, all attributes', [
    ['Company', 'Ticker', 'Sector (SIC)', 'HQ', 'NC-based', 'Type', 'UNC tie', 'Trials', 'Alignment', 'Partners', 'Signals', 'Alumni', 'Priority'],
    ...a.companies.map((c) => [c.name, c.ticker, c.sic, c.hq, c.ncBased ? 'Yes' : 'No', c.partnershipType, c.uncTie ? 'Yes' : 'No', c.trials, c.alignment, c.partners, c.signals, c.alumni, c.priority]),
  ]);

  // 8. Financials
  S('Financials', 'Reported figures (USD)', [
    ['Company', 'Revenue', 'R&D', 'Net income', 'Total assets', 'Employees'],
    ...a.companies.map((c) => [c.name, c.revenue || null, c.rd || null, c.netIncome || null, c.assets || null, c.employees || null]),
  ]);

  // 9. Financial Ratios
  S('Financial Ratios', 'Derived efficiency and profitability ratios', [
    ['Company', 'R&D % of revenue', 'Net margin %', 'ROA %', 'Revenue / employee', 'R&D / employee', 'Asset turnover'],
    ...a.companies.map((c) => [c.name, c.rdIntensity, c.netMargin, c.roa, c.revPerEmp, c.rdPerEmp, c.assetTurnover]),
  ]);

  // 10. Rankings
  const rk = a.rankings;
  const maxLen = Math.max(rk.revenue.length, rk.rdIntensity.length, rk.netMargin.length, rk.trials.length, rk.alignment.length, 1);
  const rankRows: Cell[][] = [['By revenue', '', 'By R&D intensity', '', 'By net margin', '', 'By trials', '', 'By alignment', '']];
  for (let i = 0; i < maxLen; i++) {
    rankRows.push([
      rk.revenue[i]?.name || '', rk.revenue[i] ? usd(rk.revenue[i].value) : '',
      rk.rdIntensity[i]?.name || '', rk.rdIntensity[i]?.value ?? '',
      rk.netMargin[i]?.name || '', rk.netMargin[i]?.value ?? '',
      rk.trials[i]?.name || '', rk.trials[i]?.value ?? '',
      rk.alignment[i]?.name || '', rk.alignment[i]?.value ?? '',
    ]);
  }
  S('Rankings', 'Leaders across key metrics', rankRows);

  // 11. Partnership Priority
  const byP = [...a.companies].sort((x, y) => y.priority - x.priority);
  S('Partnership Priority', 'Outreach priority score and components', [
    ['Rank', 'Company', 'Priority', 'Tie (+40)', 'Align (+5 ea, cap 25)', 'NC (+15)', 'Strategic (+10)', 'Trials (+10)'],
    ...byP.map((c, i) => [i + 1, c.name, c.priority, c.uncTie ? 40 : 0, Math.min(25, c.alignment * 5), c.ncBased ? 15 : 0, c.partnershipType === 'Strategic' ? 10 : 0, c.trials > 0 ? 10 : 0]),
  ]);

  // 12. UNC Engagement
  S('UNC Engagement', 'Ties, alignment, trials, alumni', [
    ['Company', 'Existing tie', 'Alignment signals', 'Trial programs', 'UNC alumni', 'Priority'],
    ...a.companies.map((c) => [c.name, c.uncTie ? 'Yes' : 'No', c.alignment, c.trials, c.alumni, c.priority]),
  ]);

  // 13. Distributions
  const distBlock = (title: string, dist: { label: string; value: number }[]): Cell[][] => [[title, ''], ...dist.map((x) => [x.label, x.value]), []];
  S('Distributions', 'Counts by category', [
    ['Distribution', 'Count'], [],
    ...distBlock('By partnership type', a.distributions.byType),
    ...distBlock('By UNC tie', a.distributions.byTie),
    ...distBlock('By NC presence', a.distributions.byNc),
    ...distBlock('By revenue band', a.distributions.byRevenueBucket),
    ...distBlock('By priority tier', a.distributions.byPriorityTier),
  ]);

  // 14-18. Detail sheets
  const profs = d.section4_profiles || [];
  const trialRows: Cell[][] = [['Company', 'Program', 'Stage']];
  profs.forEach((p) => (p.pipeline || []).forEach((t) => trialRows.push([p.company_name, t.program, t.stage])));
  S('Clinical Trials', 'Every trial program by company', trialRows);

  const alignRows: Cell[][] = [['Company', 'Company program', 'UNC unit', 'UNC fact', 'Why it matters']];
  profs.forEach((p) => (p.unc_alignment || []).forEach((x) => alignRows.push([p.company_name, x.company_program, x.unc_unit, x.unc_fact, x.rationale])));
  S('UNC Alignment', 'Company-to-UNC research overlaps', alignRows);

  const kp = d.section2_internal_mapping.known_partnerships || [];
  S('Known Partnerships', 'Existing UNC partnerships', [['Company', 'UNC unit', 'Type', 'Active?'], ...kp.map((p) => [p.company, p.unc_unit, p.relationship_type, p.active])]);

  const fac = d.section2_internal_mapping.unc_faculty || [];
  S('UNC Faculty', 'Faculty with sector expertise', [['Name', 'School', 'Research focus'], ...fac.map((f) => [f.name, f.school, f.research_focus])]);

  S('References', 'AMA citation list', [['#', 'Citation', 'URL'], ...(d.references || []).map((r: any) => [r.id, `${r.publisher || ''} ${r.title || ''}`.trim(), r.url])]);

  return sheets;
}

export function excelSheetSummary(rawData: any): { name: string; note: string }[] {
  return buildSheets(rawData).map((s) => ({ name: s.name, note: s.note }));
}

export async function downloadExcel(rawData: any) {
  const XLSX = await import('xlsx');
  const sheets = buildSheets(rawData);
  const wb = XLSX.utils.book_new();
  for (const sh of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(sh.rows);
    // Auto column widths
    const widths: number[] = [];
    sh.rows.forEach((r) => r.forEach((c, i) => {
      widths[i] = Math.max(widths[i] || 10, Math.min(64, (c == null ? 0 : String(c).length) + 2));
    }));
    ws['!cols'] = widths.map((w) => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, sh.name.slice(0, 31));
  }
  XLSX.writeFile(wb, `${reportFilename(rawData)}.xlsx`);
}
