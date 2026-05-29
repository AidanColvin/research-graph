/**
 * Analytics engine — derives quantitative metrics, distribution statistics,
 * concentration and correlation measures, segment comparisons, a partnership
 * priority model, and auto-generated insights from a report. Shared by the
 * on-screen Excel view and the .xlsx generator so the numbers always match.
 */
import { normalize, parseMoney } from '@/components/Report';

export type CompanyMetrics = {
  name: string; ticker: string; sic: string; hq: string;
  ncBased: boolean; partnershipType: string; uncTie: boolean;
  revenue: number; rd: number; netIncome: number; assets: number; employees: number;
  rdIntensity: number | null; netMargin: number | null; roa: number | null;
  revPerEmp: number | null; rdPerEmp: number | null; assetTurnover: number | null;
  trials: number; alignment: number; partners: number; signals: number; alumni: number;
  priority: number;
};

export type Dist = { label: string; value: number }[];
export type Stat = { min: number; q1: number; median: number; q3: number; max: number; mean: number; stdev: number; cv: number | null };
export type Segment = { label: string; count: number; tiePct: number; avgRevenue: number | null; avgRdIntensity: number | null; avgPriority: number };

export type Analytics = {
  sector: string;
  companies: CompanyMetrics[];
  counts: { total: number; uncTie: number; strategic: number; translational: number; ncBased: number; publicWithFinancials: number };
  totals: { revenue: number; rd: number; netIncome: number; assets: number; employees: number; trials: number; alignment: number };
  averages: { revenue: number | null; rd: number | null; rdIntensity: number | null; netMargin: number | null };
  medians: { revenue: number | null; rdIntensity: number | null; netMargin: number | null };
  aggregate: { rdIntensity: number | null; netMargin: number | null; roa: number | null };
  stats: { revenue: Stat | null; rdIntensity: Stat | null; netMargin: Stat | null };
  concentration: { hhi: number | null; top1Share: number | null; top3Share: number | null; label: string };
  correlation: { rdVsMargin: number | null; revVsRd: number | null; sizeVsIntensity: number | null };
  profitability: { profitable: number; unprofitable: number; withData: number };
  priorityTiers: { high: number; medium: number; low: number; avg: number };
  segments: Segment[];
  crosstab: { tieStrategic: number; tieTranslational: number; noTieStrategic: number; noTieTranslational: number };
  bestFit: CompanyMetrics[];
  distributions: { byType: Dist; byTie: Dist; byNc: Dist; byRevenueBucket: Dist; byPriorityTier: Dist };
  rankings: {
    revenue: { name: string; value: number }[];
    rdIntensity: { name: string; value: number }[];
    netMargin: { name: string; value: number }[];
    trials: { name: string; value: number }[];
    alignment: { name: string; value: number }[];
    priority: { name: string; value: number }[];
  };
  insights: string[];
};

function signedMoney(s?: string): number {
  if (!s) return 0;
  const mag = parseMoney(s);
  const t = s.trim();
  const neg = t.startsWith('-') || t.startsWith('(') || /-\s*\$/.test(t) || /\$\s*-/.test(t);
  return neg ? -mag : mag;
}

const r1 = (n: number) => +n.toFixed(1);
const r2 = (n: number) => +n.toFixed(2);

function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  return sorted[base + 1] !== undefined ? sorted[base] + rest * (sorted[base + 1] - sorted[base]) : sorted[base];
}

function statOf(vals: (number | null)[]): Stat | null {
  const a = vals.filter((x): x is number => x != null).sort((x, y) => x - y);
  if (a.length < 2) return null;
  const mean = a.reduce((s, x) => s + x, 0) / a.length;
  const variance = a.reduce((s, x) => s + (x - mean) ** 2, 0) / a.length;
  const stdev = Math.sqrt(variance);
  return {
    min: r1(a[0]), q1: r1(quantile(a, 0.25)), median: r1(quantile(a, 0.5)),
    q3: r1(quantile(a, 0.75)), max: r1(a[a.length - 1]), mean: r1(mean),
    stdev: r1(stdev), cv: mean ? r2(stdev / Math.abs(mean)) : null,
  };
}

function pearson(pairs: [number, number][]): number | null {
  const n = pairs.length;
  if (n < 3) return null;
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
  for (const [x, y] of pairs) { sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; }
  const den = Math.sqrt((n * sxx - sx * sx) * (n * syy - sy * sy));
  return den ? r2((n * sxy - sx * sy) / den) : null;
}

export function computeAnalytics(rawData: any): Analytics {
  const d = normalize(rawData);
  const profs = d.section4_profiles || [];

  const companies: CompanyMetrics[] = profs.map((p) => {
    const revenue = parseMoney(p.facts?.['revenue']?.value);
    const rd = parseMoney(p.facts?.['rd_expense']?.value);
    const netIncome = signedMoney(p.facts?.['net_income']?.value);
    const assets = parseMoney(p.facts?.['total_assets']?.value);
    const employees = parseMoney(p.facts?.['employees']?.value);
    const trials = p.pipeline?.length || 0;
    const alignment = p.unc_alignment?.length || 0;
    const partners = p.partnering_history?.length || 0;
    const signals = p.signals?.length || 0;
    const alumni = p.unc_alumni?.length || 0;
    const uncTie = !!p.existing_unc_tie;
    const ncBased = !!p.nc_based;
    const strategic = p.partnership_type === 'Strategic';
    const priority = Math.min(100,
      (uncTie ? 40 : 0) + Math.min(25, alignment * 5) + (ncBased ? 15 : 0) + (strategic ? 10 : 0) + (trials > 0 ? 10 : 0));
    return {
      name: p.company_name, ticker: p.facts?.['ticker']?.value || '',
      sic: p.sector_tag || p.facts?.['sic']?.value || '', hq: p.facts?.['hq']?.value || '',
      ncBased, partnershipType: p.partnership_type, uncTie,
      revenue, rd, netIncome, assets, employees,
      rdIntensity: revenue ? r1(100 * rd / revenue) : null,
      netMargin: revenue ? r1(100 * netIncome / revenue) : null,
      roa: assets ? r1(100 * netIncome / assets) : null,
      revPerEmp: employees ? Math.round(revenue / employees) : null,
      rdPerEmp: employees ? Math.round(rd / employees) : null,
      assetTurnover: assets ? r2(revenue / assets) : null,
      trials, alignment, partners, signals, alumni, priority,
    };
  });

  const sum = (k: keyof CompanyMetrics) => companies.reduce((s, c) => s + (Number(c[k]) || 0), 0);
  const withRev = companies.filter((c) => c.revenue > 0);
  const totals = { revenue: sum('revenue'), rd: sum('rd'), netIncome: sum('netIncome'), assets: sum('assets'), employees: sum('employees'), trials: sum('trials'), alignment: sum('alignment') };
  const counts = {
    total: companies.length, uncTie: companies.filter((c) => c.uncTie).length,
    strategic: companies.filter((c) => c.partnershipType === 'Strategic').length,
    translational: companies.filter((c) => c.partnershipType !== 'Strategic').length,
    ncBased: companies.filter((c) => c.ncBased).length, publicWithFinancials: withRev.length,
  };

  const avg = (vals: (number | null)[]) => {
    const a = vals.filter((x): x is number => x != null);
    return a.length ? r1(a.reduce((s, x) => s + x, 0) / a.length) : null;
  };
  const med = (vals: (number | null)[]) => {
    const a = vals.filter((x): x is number => x != null).sort((x, y) => x - y);
    if (!a.length) return null;
    return r1(quantile(a, 0.5));
  };
  const averages = {
    revenue: withRev.length ? Math.round(totals.revenue / withRev.length) : null,
    rd: withRev.length ? Math.round(totals.rd / withRev.length) : null,
    rdIntensity: avg(companies.map((c) => c.rdIntensity)),
    netMargin: avg(companies.map((c) => c.netMargin)),
  };
  const medians = {
    revenue: med(companies.map((c) => (c.revenue > 0 ? c.revenue : null))),
    rdIntensity: med(companies.map((c) => c.rdIntensity)),
    netMargin: med(companies.map((c) => c.netMargin)),
  };
  const aggregate = {
    rdIntensity: totals.revenue ? r1(100 * totals.rd / totals.revenue) : null,
    netMargin: totals.revenue ? r1(100 * totals.netIncome / totals.revenue) : null,
    roa: totals.assets ? r1(100 * totals.netIncome / totals.assets) : null,
  };

  const stats = {
    revenue: statOf(companies.map((c) => (c.revenue > 0 ? c.revenue : null))),
    rdIntensity: statOf(companies.map((c) => c.rdIntensity)),
    netMargin: statOf(companies.map((c) => c.netMargin)),
  };

  // Concentration (HHI on revenue shares)
  let concentration: Analytics['concentration'] = { hhi: null, top1Share: null, top3Share: null, label: 'n/a' };
  if (totals.revenue > 0) {
    const shares = withRev.map((c) => c.revenue / totals.revenue).sort((a, b) => b - a);
    const hhi = Math.round(shares.reduce((s, x) => s + x * x, 0) * 10000);
    const top1 = r1(shares[0] * 100);
    const top3 = r1(shares.slice(0, 3).reduce((s, x) => s + x, 0) * 100);
    concentration = { hhi, top1Share: top1, top3Share: top3, label: hhi > 2500 ? 'highly concentrated' : hhi > 1500 ? 'moderately concentrated' : 'fragmented' };
  }

  const correlation = {
    rdVsMargin: pearson(companies.filter((c) => c.rdIntensity != null && c.netMargin != null).map((c) => [c.rdIntensity!, c.netMargin!])),
    revVsRd: pearson(companies.filter((c) => c.revenue > 0 && c.rd > 0).map((c) => [c.revenue, c.rd])),
    sizeVsIntensity: pearson(companies.filter((c) => c.revenue > 0 && c.rdIntensity != null).map((c) => [c.revenue, c.rdIntensity!])),
  };

  const withMargin = companies.filter((c) => c.netMargin != null);
  const profitability = { profitable: withMargin.filter((c) => c.netIncome > 0).length, unprofitable: withMargin.filter((c) => c.netIncome <= 0).length, withData: withMargin.length };

  const priorityTiers = {
    high: companies.filter((c) => c.priority >= 60).length,
    medium: companies.filter((c) => c.priority >= 30 && c.priority < 60).length,
    low: companies.filter((c) => c.priority < 30).length,
    avg: companies.length ? Math.round(companies.reduce((s, c) => s + c.priority, 0) / companies.length) : 0,
  };

  const segOf = (label: string, set: CompanyMetrics[]): Segment => ({
    label, count: set.length,
    tiePct: set.length ? Math.round(100 * set.filter((c) => c.uncTie).length / set.length) : 0,
    avgRevenue: avg(set.map((c) => (c.revenue > 0 ? c.revenue : null))),
    avgRdIntensity: avg(set.map((c) => c.rdIntensity)),
    avgPriority: set.length ? Math.round(set.reduce((s, c) => s + c.priority, 0) / set.length) : 0,
  });
  const bandOf = (rev: number) => rev >= 100e9 ? 'Mega (≥$100B)' : rev >= 10e9 ? 'Large ($10-100B)' : rev > 0 ? 'Mid (<$10B)' : 'Private / n/a';
  const segments: Segment[] = [
    segOf('Strategic', companies.filter((c) => c.partnershipType === 'Strategic')),
    segOf('Translational', companies.filter((c) => c.partnershipType !== 'Strategic')),
    segOf('NC-based', companies.filter((c) => c.ncBased)),
    segOf('Non-NC', companies.filter((c) => !c.ncBased)),
    segOf('Existing UNC tie', companies.filter((c) => c.uncTie)),
    segOf('No documented tie', companies.filter((c) => !c.uncTie)),
  ].filter((s) => s.count > 0);

  const crosstab = {
    tieStrategic: companies.filter((c) => c.uncTie && c.partnershipType === 'Strategic').length,
    tieTranslational: companies.filter((c) => c.uncTie && c.partnershipType !== 'Strategic').length,
    noTieStrategic: companies.filter((c) => !c.uncTie && c.partnershipType === 'Strategic').length,
    noTieTranslational: companies.filter((c) => !c.uncTie && c.partnershipType !== 'Strategic').length,
  };

  const bestFit = companies.filter((c) => c.uncTie && (c.partnershipType === 'Strategic' || c.alignment > 0)).sort((a, b) => b.priority - a.priority);

  const countBy = (fn: (c: CompanyMetrics) => string): Dist => {
    const m = new Map<string, number>();
    companies.forEach((c) => m.set(fn(c), (m.get(fn(c)) || 0) + 1));
    return [...m.entries()].map(([label, value]) => ({ label, value }));
  };
  const distributions = {
    byType: countBy((c) => c.partnershipType),
    byTie: [{ label: 'Existing tie', value: counts.uncTie }, { label: 'No documented tie', value: counts.total - counts.uncTie }],
    byNc: [{ label: 'NC-based', value: counts.ncBased }, { label: 'Other', value: counts.total - counts.ncBased }],
    byRevenueBucket: countBy((c) => bandOf(c.revenue)),
    byPriorityTier: [{ label: 'High (≥60)', value: priorityTiers.high }, { label: 'Medium (30-59)', value: priorityTiers.medium }, { label: 'Low (<30)', value: priorityTiers.low }],
  };

  const topBy = (key: keyof CompanyMetrics, n = 10) => companies
    .filter((c) => c[key] != null && Number(c[key]) !== 0)
    .map((c) => ({ name: c.name, value: Number(c[key]) }))
    .sort((a, b) => b.value - a.value).slice(0, n);
  const rankings = {
    revenue: topBy('revenue'), rdIntensity: topBy('rdIntensity'), netMargin: topBy('netMargin'),
    trials: topBy('trials'), alignment: topBy('alignment'),
    priority: companies.map((c) => ({ name: c.name, value: c.priority })).sort((a, b) => b.value - a.value),
  };

  // Auto-generated insights (short, data-driven)
  const insights: string[] = [];
  const sector = d.report_meta.sector;
  if (concentration.hhi != null) insights.push(`Revenue is ${concentration.label}: the top firm holds ${concentration.top1Share}% and the top three ${concentration.top3Share}% (HHI ${concentration.hhi}).`);
  if (stats.rdIntensity) insights.push(`R&D intensity spans ${stats.rdIntensity.min}% to ${stats.rdIntensity.max}%, median ${stats.rdIntensity.median}%.`);
  if (aggregate.rdIntensity != null && averages.rdIntensity != null) {
    const gap = aggregate.rdIntensity - averages.rdIntensity;
    insights.push(`Revenue-weighted R&D intensity is ${aggregate.rdIntensity}% vs a ${averages.rdIntensity}% simple average, so larger firms spend ${gap >= 0 ? 'more' : 'less'} on R&D relative to size.`);
  }
  if (profitability.withData) insights.push(`${profitability.profitable} of ${profitability.withData} firms with data are profitable.`);
  if (correlation.rdVsMargin != null) {
    const r = correlation.rdVsMargin; const mag = Math.abs(r);
    const desc = mag < 0.2 ? 'effectively uncorrelated' : mag < 0.5 ? (r > 0 ? 'weakly positive' : 'weakly negative') : mag < 0.8 ? (r > 0 ? 'moderately positive' : 'moderately negative') : (r > 0 ? 'strongly positive' : 'strongly negative');
    insights.push(`R&D intensity and net margin are ${desc} (r=${r}).`);
  }
  insights.push(`${counts.uncTie} of ${counts.total} firms already have a documented UNC link; ${crosstab.tieStrategic} are also strategic-scale.`);
  if (bestFit.length) insights.push(`${bestFit.length} firms are best-fit targets (existing tie plus strategic scale or research overlap): ${bestFit.slice(0, 4).map((c) => c.name).join(', ')}.`);
  insights.push(`Priority is ${priorityTiers.high} high, ${priorityTiers.medium} medium, ${priorityTiers.low} low (avg ${priorityTiers.avg}/100).`);
  const ncSeg = segments.find((s) => s.label === 'NC-based');
  if (ncSeg && ncSeg.count) insights.push(`${sector} has ${ncSeg.count} NC-based ${ncSeg.count === 1 ? 'firm' : 'firms'}, averaging ${ncSeg.avgPriority}/100 priority.`);

  return { sector, companies, counts, totals, averages, medians, aggregate, stats, concentration, correlation, profitability, priorityTiers, segments, crosstab, bestFit, distributions, rankings, insights };
}
