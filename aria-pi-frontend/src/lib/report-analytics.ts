/**
 * Analytics engine — derives quantitative metrics, ratios, rankings, and
 * distributions from a report. Shared by the on-screen Excel view and the
 * .xlsx generator so the numbers always match.
 */
import { normalize, parseMoney } from '@/components/Report';

export type CompanyMetrics = {
  name: string; ticker: string; sic: string; hq: string;
  ncBased: boolean; partnershipType: string; uncTie: boolean;
  // raw numbers (0 when not reported)
  revenue: number; rd: number; netIncome: number; assets: number; employees: number;
  // ratios (null when not computable)
  rdIntensity: number | null;   // R&D / revenue %
  netMargin: number | null;     // net income / revenue %
  roa: number | null;           // net income / assets %
  revPerEmp: number | null;     // revenue / employee (USD)
  rdPerEmp: number | null;      // R&D / employee (USD)
  assetTurnover: number | null; // revenue / assets
  // engagement
  trials: number; alignment: number; partners: number; signals: number; alumni: number;
  priority: number;             // 0-100 outreach-priority score
};

export type Dist = { label: string; value: number }[];

export type Analytics = {
  sector: string;
  companies: CompanyMetrics[];
  counts: {
    total: number; uncTie: number; strategic: number; translational: number;
    ncBased: number; publicWithFinancials: number;
  };
  totals: { revenue: number; rd: number; netIncome: number; assets: number; employees: number; trials: number; alignment: number };
  averages: { revenue: number | null; rd: number | null; rdIntensity: number | null; netMargin: number | null };
  medians: { revenue: number | null; rdIntensity: number | null; netMargin: number | null };
  aggregate: { rdIntensity: number | null; netMargin: number | null; roa: number | null };
  distributions: { byType: Dist; byTie: Dist; byNc: Dist; byRevenueBucket: Dist };
  rankings: {
    revenue: { name: string; value: number }[];
    rdIntensity: { name: string; value: number }[];
    netMargin: { name: string; value: number }[];
    trials: { name: string; value: number }[];
    alignment: { name: string; value: number }[];
    priority: { name: string; value: number }[];
  };
};

// Net income can be negative; parseMoney returns magnitude, so re-apply sign.
function signedMoney(s?: string): number {
  if (!s) return 0;
  const mag = parseMoney(s);
  const t = s.trim();
  const neg = t.startsWith('-') || t.startsWith('(') || /-\s*\$/.test(t) || /\$\s*-/.test(t);
  return neg ? -mag : mag;
}

const r1 = (n: number) => +n.toFixed(1);
const median = (arr: (number | null)[]): number | null => {
  const a = arr.filter((x): x is number => x != null).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};

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
      name: p.company_name,
      ticker: p.facts?.['ticker']?.value || '',
      sic: p.sector_tag || p.facts?.['sic']?.value || '',
      hq: p.facts?.['hq']?.value || '',
      ncBased, partnershipType: p.partnership_type, uncTie,
      revenue, rd, netIncome, assets, employees,
      rdIntensity: revenue ? r1(100 * rd / revenue) : null,
      netMargin: revenue ? r1(100 * netIncome / revenue) : null,
      roa: assets ? r1(100 * netIncome / assets) : null,
      revPerEmp: employees ? Math.round(revenue / employees) : null,
      rdPerEmp: employees ? Math.round(rd / employees) : null,
      assetTurnover: assets ? +(revenue / assets).toFixed(2) : null,
      trials, alignment, partners, signals, alumni, priority,
    };
  });

  const sum = (k: keyof CompanyMetrics) => companies.reduce((s, c) => s + (Number(c[k]) || 0), 0);
  const withRev = companies.filter((c) => c.revenue > 0);
  const totals = {
    revenue: sum('revenue'), rd: sum('rd'), netIncome: sum('netIncome'),
    assets: sum('assets'), employees: sum('employees'), trials: sum('trials'), alignment: sum('alignment'),
  };
  const counts = {
    total: companies.length,
    uncTie: companies.filter((c) => c.uncTie).length,
    strategic: companies.filter((c) => c.partnershipType === 'Strategic').length,
    translational: companies.filter((c) => c.partnershipType !== 'Strategic').length,
    ncBased: companies.filter((c) => c.ncBased).length,
    publicWithFinancials: withRev.length,
  };
  const averages = {
    revenue: withRev.length ? Math.round(totals.revenue / withRev.length) : null,
    rd: withRev.length ? Math.round(totals.rd / withRev.length) : null,
    rdIntensity: median(companies.map((c) => c.rdIntensity)) != null
      ? r1(companies.filter((c) => c.rdIntensity != null).reduce((s, c) => s + (c.rdIntensity || 0), 0) / Math.max(1, companies.filter((c) => c.rdIntensity != null).length)) : null,
    netMargin: companies.some((c) => c.netMargin != null)
      ? r1(companies.filter((c) => c.netMargin != null).reduce((s, c) => s + (c.netMargin || 0), 0) / companies.filter((c) => c.netMargin != null).length) : null,
  };
  const medians = {
    revenue: median(companies.map((c) => (c.revenue > 0 ? c.revenue : null))),
    rdIntensity: median(companies.map((c) => c.rdIntensity)),
    netMargin: median(companies.map((c) => c.netMargin)),
  };
  const aggregate = {
    rdIntensity: totals.revenue ? r1(100 * totals.rd / totals.revenue) : null,
    netMargin: totals.revenue ? r1(100 * totals.netIncome / totals.revenue) : null,
    roa: totals.assets ? r1(100 * totals.netIncome / totals.assets) : null,
  };

  const bucket = (rev: number) => rev >= 100e9 ? 'Mega (≥$100B)' : rev >= 10e9 ? 'Large ($10-100B)' : rev > 0 ? 'Mid (<$10B)' : 'Private / n/a';
  const countBy = (fn: (c: CompanyMetrics) => string): Dist => {
    const m = new Map<string, number>();
    companies.forEach((c) => m.set(fn(c), (m.get(fn(c)) || 0) + 1));
    return [...m.entries()].map(([label, value]) => ({ label, value }));
  };
  const distributions = {
    byType: countBy((c) => c.partnershipType),
    byTie: [
      { label: 'Existing tie', value: counts.uncTie },
      { label: 'No documented tie', value: counts.total - counts.uncTie },
    ],
    byNc: [
      { label: 'NC-based', value: counts.ncBased },
      { label: 'Other', value: counts.total - counts.ncBased },
    ],
    byRevenueBucket: countBy((c) => bucket(c.revenue)),
  };

  const topBy = (key: keyof CompanyMetrics, n = 10) => companies
    .filter((c) => c[key] != null && Number(c[key]) !== 0)
    .map((c) => ({ name: c.name, value: Number(c[key]) }))
    .sort((a, b) => b.value - a.value).slice(0, n);
  const rankings = {
    revenue: topBy('revenue'),
    rdIntensity: topBy('rdIntensity'),
    netMargin: topBy('netMargin'),
    trials: topBy('trials'),
    alignment: topBy('alignment'),
    priority: companies.map((c) => ({ name: c.name, value: c.priority })).sort((a, b) => b.value - a.value),
  };

  return { sector: d.report_meta.sector, companies, counts, totals, averages, medians, aggregate, distributions, rankings };
}
