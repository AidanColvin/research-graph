/**
 * Report export — one source of truth, three formats.
 *
 * The on-screen report (components/Report.tsx) and every downloadable file
 * must show the SAME content in the SAME order with the SAME citation numbers.
 * To guarantee that, we flatten the report into a small, format-neutral block
 * list (the IR below) exactly once, then render that IR to Markdown, PDF, or
 * Word. Add a section in one place; all three downloads stay in sync.
 */
import type { ReportData, CitationIndex } from '@/components/Report';
import { normalize, buildCitationIndex, parseMoney, fmtUsd } from '@/components/Report';

// ── Block intermediate representation ──────────────────────────────────────
export type ChartSeries = { label: string; value: number; color?: string };
export type Block =
  | { t: 'h1'; text: string }
  | { t: 'h2'; text: string }
  | { t: 'h3'; text: string }
  | { t: 'p'; text: string }
  | { t: 'meta'; pairs: [string, string][] }
  | { t: 'list'; items: string[] }
  | { t: 'table'; headers: string[]; rows: string[][] }
  | { t: 'refs'; items: { id: number; text: string; url: string }[] }
  | { t: 'pagebreak' }
  | { t: 'chart'; chartKind: 'bars' | 'donut'; title: string; subtitle?: string; series: ChartSeries[]; money?: boolean; solid?: boolean };

// ── Helpers ────────────────────────────────────────────────────────────────

// Inline citation marker, e.g. " [1,2]" — plain text so it survives every format.
function mark(urls: string[] | undefined, cites: CitationIndex): string {
  if (!urls || !urls.length) return '';
  const nums = urls.map((u) => cites.numberOf(u)).filter((n) => n > 0);
  return nums.length ? ` [${nums.join(',')}]` : '';
}

function fmtGenerated(iso?: string): string {
  if (!iso) return '';
  const dt = new Date(iso);
  if (isNaN(dt.getTime())) return iso;
  return dt.toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

function resolutionLabel(r?: string): string {
  switch (r) {
    case 'curated': return 'Curated sector set';
    case 'discovered': return 'Discovered live from SEC EDGAR';
    case 'override': return 'Custom company list';
    case 'default': return 'Generic anchor set';
    default: return r || '';
  }
}

/** Build a filesystem-safe base name like "oncology-partnership-report". */
export function reportFilename(rawData: any): string {
  const sector = (rawData?.report_meta?.sector || rawData?.sector || 'report')
    .toString().toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'report';
  return `${sector}-partnership-report`;
}

// ── IR builder: ReportData -> Block[] ──────────────────────────────────────
export function buildBlocks(rawData: any): { blocks: Block[]; cites: CitationIndex } {
  const data: ReportData = normalize(rawData);
  const cites = buildCitationIndex(data);
  const b: Block[] = [];
  const m = data.report_meta;

  // Header + metadata
  b.push({ t: 'h1', text: m.sector });
  const meta: [string, string][] = [
    ['Prepared by', m.prepared_by],
    ['Date', m.date || 'n/a'],
  ];
  if (m.generated_at) meta.push(['Generated', fmtGenerated(m.generated_at)]);
  if (data._meta?.resolution) meta.push(['Company selection', resolutionLabel(data._meta.resolution)]);
  meta.push(['Version', m.version]);
  const v = data._validation;
  if (v) {
    meta.push(['Claims double-sourced', `${v.verified} / ${v.total_claims}`]);
    if (v.unverified > 0) meta.push(['Flagged for review', String(v.unverified)]);
  }
  b.push({ t: 'meta', pairs: meta });

  // ── Executive Overview (10-second scan) ──
  const profs = data.section4_profiles || [];
  const nCos = profs.length;
  const tied = profs.filter((p) => p.existing_unc_tie);
  const strategic = profs.filter((p) => p.partnership_type === 'Strategic').length;
  const translational = nCos - strategic;
  const ncBased = profs.filter((p) => (p as any).nc_based).length;
  const totalTrials = profs.reduce((s, p) => s + (p.pipeline?.length || 0), 0);
  const topTied = tied.slice(0, 3).map((p) => p.company_name);
  const revSeries = profs
    .map((p) => ({ label: p.company_name, value: parseMoney(p.facts?.['revenue']?.value) }))
    .filter((d) => d.value > 0).sort((a, b) => b.value - a.value).slice(0, 10);
  const rdSeries = profs
    .map((p) => ({ label: p.company_name, value: parseMoney(p.facts?.['rd expense']?.value || (p.facts as any)?.['rd_expense']?.value) }))
    .filter((d) => d.value > 0).sort((a, b) => b.value - a.value).slice(0, 10);
  const trialSeries = profs
    .map((p) => ({ label: p.company_name, value: p.pipeline?.length || 0 }))
    .filter((d) => d.value > 0).sort((a, b) => b.value - a.value);
  const alignSeries = profs
    .map((p) => ({ label: p.company_name, value: p.unc_alignment?.length || 0 }))
    .filter((d) => d.value > 0).sort((a, b) => b.value - a.value);

  if (nCos > 0) {
    b.push({ t: 'h2', text: 'Summary' });
    b.push({ t: 'p', text: 'One-page brief. The full sourced report follows.' });
    b.push({ t: 'meta', pairs: [
      ['Companies reviewed', String(nCos)],
      ['Documented UNC tie', String(tied.length)],
      ['Strategic scale', String(strategic)],
      ['NC-based', String(ncBased)],
      ['Trial programs', String(totalTrials)],
    ] });
    const thesis = `We reviewed ${nCos} ${m.sector} ${nCos === 1 ? 'company' : 'companies'} as research partners for UNC Chapel Hill. `
      + `${tied.length} of ${nCos} have a documented UNC link: a shared trial, an NIH grant, or a co-authored paper. `
      + `${strategic} ${strategic === 1 ? 'is' : 'are'} large enough to anchor a strategic deal${ncBased > 0 ? ` (${ncBased} based in North Carolina)` : ''}.`
      + (topTied.length ? ` The best first targets are ${topTied.join(', ')}, where UNC scientists already study related work.` : '');
    b.push({ t: 'p', text: thesis });
    b.push({ t: 'chart', chartKind: 'donut', solid: true, title: 'Existing UNC connection', series: [
      { label: 'Existing tie', value: tied.length, color: '#0a0a0a' },
      { label: 'No documented tie', value: nCos - tied.length, color: '#d4d4d4' },
    ] });
    b.push({ t: 'chart', chartKind: 'donut', solid: true, title: 'Partnership scale', series: [
      { label: 'Strategic', value: strategic, color: '#0a0a0a' },
      { label: 'Translational', value: translational, color: '#9a988f' },
    ] });
    // What SEC filings show now
    const combinedRev = revSeries.reduce((s, d) => s + d.value, 0);
    const topRev = revSeries[0], topRd = rdSeries[0];
    if (topRev || topRd) {
      let secLine = 'What SEC filings show now. ';
      if (revSeries.length) secLine += `Across ${revSeries.length} public ${revSeries.length === 1 ? 'company' : 'companies'}, latest reported revenue totals ${fmtUsd(combinedRev)}. `;
      if (topRev) secLine += `${topRev.label} is largest at ${fmtUsd(topRev.value)}. `;
      if (topRd) secLine += `${topRd.label} leads R&D spend at ${fmtUsd(topRd.value)}.`;
      b.push({ t: 'p', text: secLine });
    }
    const nc = data.section1_overview.nc_context;
    if (nc?.text) b.push({ t: 'p', text: `NC context. ${nc.text}` + mark(nc.sources, cites) });
    const units = data.section1_overview.unc_units || [];
    if (units.length) b.push({ t: 'p', text: `UNC schools and centers active. ${units.map((u) => u.unit).join(', ')}.` });
    b.push({ t: 'pagebreak' });
  }

  // Section 1 - Sector Overview
  const s1 = data.section1_overview;
  b.push({ t: 'h2', text: '01  Sector Overview' });
  b.push({ t: 'h3', text: '1.1 Sector Definition and Scale' });
  if (s1.definition.text) b.push({ t: 'p', text: s1.definition.text + mark(s1.definition.sources, cites) });
  if (s1.scale.text) b.push({ t: 'p', text: s1.scale.text + mark(s1.scale.sources, cites) });
  if (revSeries.length) b.push({ t: 'chart', chartKind: 'bars', title: 'Annual revenue by company', subtitle: 'Latest reported, SEC XBRL', series: revSeries, money: true });
  if (rdSeries.length) b.push({ t: 'chart', chartKind: 'bars', title: 'R&D expense by company', subtitle: 'Latest reported, SEC XBRL', series: rdSeries, money: true });
  b.push({ t: 'h3', text: '1.2 Why This Sector Now' });
  b.push(s1.why_now.length
    ? { t: 'list', items: s1.why_now.map((s) => s.signal + mark(s.sources, cites)) }
    : { t: 'p', text: 'No signals identified.' });
  b.push({ t: 'h3', text: '1.3 NC-Specific Industry Context' });
  if (s1.nc_context.text) b.push({ t: 'p', text: s1.nc_context.text + mark(s1.nc_context.sources, cites) });
  b.push({ t: 'h3', text: '1.4 UNC Schools and Centers Active in This Sector' });
  b.push(s1.unc_units.length
    ? { t: 'table', headers: ['UNC Unit', 'Focus', 'Ref.'],
        rows: s1.unc_units.map((u) => [u.unit, u.focus, mark([u.url], cites).trim()]) }
    : { t: 'p', text: 'No UNC units identified.' });

  // Section 2 - Internal Mapping
  const s2 = data.section2_internal_mapping;
  b.push({ t: 'h2', text: '02  Internal Mapping' });
  b.push({ t: 'h3', text: '2.1 Known UNC Partnerships in This Sector' });
  b.push(s2.known_partnerships.length
    ? { t: 'table', headers: ['Company', 'UNC Unit', 'Type', 'Active?', 'Ref.'],
        rows: s2.known_partnerships.map((p) => [p.company, p.unc_unit, p.relationship_type, p.active, mark(p.sources, cites).trim()]) }
    : { t: 'p', text: 'None identified.' });
  if (alignSeries.length) b.push({ t: 'chart', chartKind: 'bars', title: 'UNC alignment signals by company', subtitle: 'Matched grants, trials, and publications', series: alignSeries });
  b.push({ t: 'h3', text: '2.2 UNC Faculty with Verified Sector Expertise' });
  b.push(s2.unc_faculty.length
    ? { t: 'table', headers: ['Faculty', 'School', 'Research Focus', 'Ref.'],
        rows: s2.unc_faculty.map((f) => [f.name, f.school, f.research_focus, mark(f.sources, cites).trim()]) }
    : { t: 'p', text: 'None identified.' });
  b.push({ t: 'h3', text: '2.3 UNC Data Assets Relevant to This Sector' });
  b.push(s2.data_assets.length
    ? { t: 'table', headers: ['Dataset', 'Description', 'Held By', 'Ref.'],
        rows: s2.data_assets.map((d) => [d.name, d.description, d.held_by, mark(d.sources, cites).trim()]) }
    : { t: 'p', text: 'None identified.' });
  b.push({ t: 'h3', text: '2.4 Relationship Risk Flags' });
  b.push(s2.risk_flags.length
    ? { t: 'table', headers: ['Company', 'Risk', 'Ref.'],
        rows: s2.risk_flags.map((r) => [r.company, r.risk, mark(r.sources, cites).trim()]) }
    : { t: 'p', text: 'No risks flagged.' });

  // Section 3 — Company Selection
  const s3 = data.section3_selection;
  b.push({ t: 'h2', text: '03  Company Selection' });
  b.push({ t: 'h3', text: '3.2 Companies Selected' });
  b.push(s3.selected.length
    ? { t: 'table', headers: ['Company', 'UNC Alignment', 'Existing Tie', 'Ref.'],
        rows: s3.selected.map((s) => [s.company, s.unc_alignment, s.existing_tie, mark(s.sources, cites).trim()]) }
    : { t: 'p', text: 'No selections recorded.' });
  b.push({ t: 'h3', text: '3.3 Companies Reviewed and Excluded' });
  b.push(s3.excluded.length
    ? { t: 'table', headers: ['Company', 'Reason', 'Ref.'],
        rows: s3.excluded.map((s) => [s.company, s.reason, mark(s.sources, cites).trim()]) }
    : { t: 'p', text: 'No exclusions recorded.' });

  // Section 4 - Company Profiles
  b.push({ t: 'h2', text: '04  Company Profiles' });
  if (trialSeries.length) b.push({ t: 'chart', chartKind: 'bars', title: 'Clinical-trial programs by company', subtitle: 'Documented on ClinicalTrials.gov', series: trialSeries });
  data.section4_profiles.forEach((p) => {
    const tie = p.existing_unc_tie ? 'Existing UNC tie' : 'No UNC tie';
    b.push({ t: 'h3', text: `${p.company_name} (${p.partnership_type}, ${tie})` });
    if (p.overview.text) b.push({ t: 'p', text: p.overview.text + mark(p.overview.sources, cites) });

    const facts = Object.entries(p.facts || {});
    if (facts.length) {
      b.push({ t: 'table', headers: ['Field', 'Value'],
        rows: facts.map(([k, val]) => [k.replace(/_/g, ' '), val?.value ?? '']) });
    }

    if (p.sec_filings) {
      const lines: string[] = [];
      Object.entries(p.sec_filings).forEach(([form, list]) => {
        if (Array.isArray(list) && list.length) {
          lines.push(`${form}: ${list.map((f) => f.date || 'undated').join(', ')}`);
        }
      });
      if (lines.length) {
        b.push({ t: 'h3', text: 'Recent SEC Filings' });
        b.push({ t: 'list', items: lines });
      }
    }

    if (p.pipeline.length) {
      b.push({ t: 'h3', text: 'Pipeline and Platform' });
      b.push({ t: 'table', headers: ['Program', 'Indication', 'Stage', 'Ref.'],
        rows: p.pipeline.map((r) => [r.program, r.indication, r.stage, mark(r.sources, cites).trim()]) });
    }
    if (p.partnering_history.length) {
      b.push({ t: 'h3', text: 'External Partnering History' });
      b.push({ t: 'table', headers: ['Partner', 'Deal Type', 'Year', 'Ref.'],
        rows: p.partnering_history.map((r) => [r.partner, r.deal_type, r.year, mark(r.sources, cites).trim()]) });
    }
    if (p.unc_alignment.length) {
      b.push({ t: 'h3', text: 'Pipeline Alignment with UNC' });
      p.unc_alignment.forEach((a) => {
        b.push({ t: 'p', text: `${a.company_program} → ${a.unc_unit}` });
        b.push({ t: 'p', text: `Company: ${a.company_fact}` });
        b.push({ t: 'p', text: `UNC: ${a.unc_fact}` });
        b.push({ t: 'p', text: `Why it matters: ${a.rationale}${mark(a.sources, cites)}` });
      });
    }
    if (p.what_unc_offers.length) {
      b.push({ t: 'h3', text: 'What UNC Can Offer' });
      b.push({ t: 'table', headers: ['Offering', 'Description', 'Ref.'],
        rows: p.what_unc_offers.map((r) => [r.offering, r.description, mark(r.sources, cites).trim()]) });
    }
    if (p.signals.length) {
      b.push({ t: 'h3', text: 'Key Recent Signals' });
      b.push({ t: 'list', items: p.signals.map((s) => s.signal + mark(s.sources, cites)) });
    }
  });

  // Section 5 — Value Proposition
  const s5 = data.section5_value_prop;
  b.push({ t: 'h2', text: '05  Value Proposition' });
  b.push({ t: 'h3', text: '5.1 UNC Data Assets' });
  b.push(s5.data_assets.length
    ? { t: 'table', headers: ['Dataset', 'Description', 'Relevance', 'Ref.'],
        rows: s5.data_assets.map((d) => [d.name, d.description, d.relevance, mark(d.sources, cites).trim()]) }
    : { t: 'p', text: 'None documented.' });
  b.push({ t: 'h3', text: '5.2 UNC Research Capacity' });
  b.push(s5.research_capacity.length
    ? { t: 'table', headers: ['Name', 'Role', 'Expertise', 'Ref.'],
        rows: s5.research_capacity.map((d) => [d.name, d.role, d.expertise, mark(d.sources, cites).trim()]) }
    : { t: 'p', text: 'None documented.' });
  b.push({ t: 'h3', text: '5.3 Talent Pipeline' });
  b.push(s5.talent_pipeline.length
    ? { t: 'table', headers: ['Program', 'School', 'Output', 'Ref.'],
        rows: s5.talent_pipeline.map((d) => [d.program, d.school, d.output, mark(d.sources, cites).trim()]) }
    : { t: 'p', text: 'None documented.' });
  b.push({ t: 'h3', text: '5.4 NC Access and Infrastructure' });
  b.push(s5.nc_access.length
    ? { t: 'table', headers: ['Asset', 'Description', 'Ref.'],
        rows: s5.nc_access.map((d) => [d.asset, d.description, mark(d.sources, cites).trim()]) }
    : { t: 'p', text: 'None documented.' });
  b.push({ t: 'h3', text: '5.6 Partnership Models Available' });
  b.push({ t: 'table', headers: ['Model', 'Description', 'UNC Unit'],
    rows: s5.partnership_models.map((d) => [d.model, d.description, d.unit]) });

  // Section 6 — Talking Points
  const s6 = data.section6_talking_points;
  b.push({ t: 'h2', text: '06  Talking Points' });
  b.push({ t: 'h3', text: 'Sector Opening' });
  if (s6.sector_opening.text) b.push({ t: 'p', text: s6.sector_opening.text + mark(s6.sector_opening.sources, cites) });
  s6.companies.forEach((c) => {
    b.push({ t: 'h3', text: c.company });
    b.push({ t: 'p', text: `1. Know the company: ${c.know_company.text}${mark(c.know_company.sources, cites)}` });
    b.push({ t: 'p', text: `2. Know their pipeline: ${c.know_pipeline.text}${mark(c.know_pipeline.sources, cites)}` });
    b.push({ t: 'p', text: `3. Know their moves: ${c.know_moves.text}${mark(c.know_moves.sources, cites)}` });
    b.push({ t: 'p', text: `4. UNC hook: ${c.unc_hook.text}${mark(c.unc_hook.sources, cites)}` });
  });

  // References (AMA)
  if (cites.list.length) {
    b.push({ t: 'h2', text: '07  References' });
    b.push({ t: 'p', text: 'Citations follow AMA Manual of Style (11th ed.).' });
    b.push({ t: 'refs', items: cites.list.map((r) => ({
      id: r.id, text: r.ama.replace(r.url, '').trim(), url: r.url,
    })) });
  }

  return { blocks: b, cites };
}

// ── Browser download helper ────────────────────────────────────────────────
function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ── Capture the rendered report DOM into letter-page-sized PNG slices ────────
// This is what makes the PDF / Word look exactly like the webpage: we snapshot
// the live report element (real charts, tiles, tables, spacing) and slice it
// into page-height pieces for pagination.
async function captureReportSlices(): Promise<{ dataUrl: string; w: number; h: number }[]> {
  const el = document.getElementById('report-article');
  if (!el) throw new Error('Report element not found');

  const { default: html2canvas } = await import('html2canvas');
  const full = await html2canvas(el, {
    scale: 2,
    backgroundColor: '#ffffff',
    useCORS: true,
    logging: false,
    windowWidth: el.scrollWidth,
    // Skip the on-screen download toolbar so it never appears in the file.
    ignoreElements: (node) => (node as HTMLElement).classList?.contains('no-export'),
  });

  // Slice into letter-aspect (8.5 x 11) page-height chunks, breaking on
  // whitespace-ish rows where possible so we don't cut a line in half.
  const pageH = Math.floor(full.width * (11 / 8.5));
  const slices: { dataUrl: string; w: number; h: number }[] = [];
  let y = 0;
  while (y < full.height) {
    let h = Math.min(pageH, full.height - y);
    // If this isn't the last slice, nudge the cut up to a near-blank row to
    // avoid slicing through text/charts.
    if (y + h < full.height) {
      const cut = findBlankRow(full, y + h, Math.floor(pageH * 0.14));
      if (cut > y + pageH * 0.5) h = cut - y;
    }
    const c = document.createElement('canvas');
    c.width = full.width;
    c.height = h;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, c.width, h);
    ctx.drawImage(full, 0, y, full.width, h, 0, 0, full.width, h);
    slices.push({ dataUrl: c.toDataURL('image/png'), w: c.width, h });
    y += h;
  }
  return slices;
}

// Scan upward from `from` for an all-white row within `maxUp` px (a clean place
// to break a page). Returns the row y, or `from` if none found.
function findBlankRow(canvas: HTMLCanvasElement, from: number, maxUp: number): number {
  const ctx = canvas.getContext('2d');
  if (!ctx) return from;
  const w = canvas.width;
  for (let y = from; y > from - maxUp && y > 0; y--) {
    const row = ctx.getImageData(0, y, w, 1).data;
    let blank = true;
    for (let i = 0; i < row.length; i += 4 * 6) { // sample every 6th px
      if (row[i] < 250 || row[i + 1] < 250 || row[i + 2] < 250) { blank = false; break; }
    }
    if (blank) return y;
  }
  return from;
}

// ── Chart -> PNG (for Word & PDF) ───────────────────────────────────────────
// Draw a chart Block on an offscreen canvas and return a PNG data URL. Runs in
// the browser only (download handlers are client-side).
async function renderChartPng(blk: Extract<Block, { t: 'chart' }>): Promise<{ dataUrl: string; w: number; h: number }> {
  const scale = 2;
  const fmtVal = (n: number) => (blk.money ? fmtUsd(n) : String(n));

  if (blk.chartKind === 'donut') {
    const W = 360, H = 150;
    const canvas = document.createElement('canvas');
    canvas.width = W * scale; canvas.height = H * scale;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(scale, scale);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
    const total = blk.series.reduce((s, x) => s + x.value, 0) || 1;
    const cx = 75, cy = 75, rOuter = 55, rInner = 33;
    let start = -Math.PI / 2;
    blk.series.forEach((s) => {
      const ang = (s.value / total) * Math.PI * 2;
      ctx.beginPath(); ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, rOuter, start, start + ang); ctx.closePath();
      ctx.fillStyle = s.color || '#999999'; ctx.fill();
      start += ang;
    });
    if (!blk.solid) { ctx.beginPath(); ctx.arc(cx, cy, rInner, 0, Math.PI * 2); ctx.fillStyle = '#ffffff'; ctx.fill(); }
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.font = '13px Calibri, Arial, sans-serif';
    let ly = 58;
    blk.series.forEach((s) => {
      ctx.fillStyle = s.color || '#999999';
      ctx.fillRect(160, ly - 6, 12, 12);
      ctx.fillStyle = '#1f2937';
      ctx.fillText(`${s.label}: ${s.value}`, 178, ly);
      ly += 24;
    });
    return { dataUrl: canvas.toDataURL('image/png'), w: W, h: H };
  }

  // Horizontal bars
  const rows = blk.series.filter((d) => d.value > 0);
  const rowH = 26, padT = 8, padB = 8, W = 520;
  const H = padT + padB + Math.max(1, rows.length) * rowH;
  const canvas = document.createElement('canvas');
  canvas.width = W * scale; canvas.height = H * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
  const max = Math.max(...rows.map((d) => d.value), 1);
  const labelW = 150, barX0 = 158, barX1 = 452, valX = 458;
  ctx.textBaseline = 'middle';
  rows.forEach((d, i) => {
    const y = padT + i * rowH + rowH / 2;
    ctx.textAlign = 'left';
    ctx.font = '12px Calibri, Arial, sans-serif';
    ctx.fillStyle = '#374151';
    let label = d.label;
    while (ctx.measureText(label).width > labelW - 6 && label.length > 4) label = label.slice(0, -2);
    if (label !== d.label) label = label + '…';
    ctx.fillText(label, 4, y);
    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(barX0, y - 5, barX1 - barX0, 10);
    const w = Math.max(3, (d.value / max) * (barX1 - barX0));
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(barX0, y - 5, w, 10);
    ctx.font = 'bold 12px Calibri, Arial, sans-serif';
    ctx.fillText(fmtVal(d.value), valX, y);
  });
  return { dataUrl: canvas.toDataURL('image/png'), w: W, h: H };
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const b64 = dataUrl.split(',')[1] || '';
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// ── Renderer 1: Markdown ────────────────────────────────────────────────────
export function blocksToMarkdown(blocks: Block[]): string {
  const out: string[] = [];
  for (const blk of blocks) {
    switch (blk.t) {
      case 'h1': out.push(`# ${blk.text}\n`); break;
      case 'h2': out.push(`\n## ${blk.text}\n`); break;
      case 'h3': out.push(`\n### ${blk.text}\n`); break;
      case 'p': out.push(`${blk.text}\n`); break;
      case 'meta':
        out.push(blk.pairs.map(([k, val]) => `**${k}:** ${val}`).join('  \n') + '\n');
        break;
      case 'list':
        out.push(blk.items.map((i) => `- ${i}`).join('\n') + '\n');
        break;
      case 'table': {
        out.push(`| ${blk.headers.join(' | ')} |`);
        out.push(`| ${blk.headers.map(() => '---').join(' | ')} |`);
        for (const r of blk.rows) {
          out.push(`| ${r.map((c) => (c || '').replace(/\n/g, ' ').replace(/\|/g, '\\|')).join(' | ')} |`);
        }
        out.push('');
        break;
      }
      case 'refs':
        out.push(blk.items.map((r) => `${r.id}. ${r.text} ${r.url}`).join('\n') + '\n');
        break;
      case 'pagebreak':
        out.push('\n---\n');
        break;
      case 'chart': {
        out.push(`\n**${blk.title}**${blk.subtitle ? ` (${blk.subtitle})` : ''}\n`);
        out.push(`| ${blk.chartKind === 'donut' ? 'Segment' : 'Company'} | Value |`);
        out.push(`| --- | --- |`);
        for (const s of blk.series) {
          out.push(`| ${s.label} | ${blk.money ? fmtUsd(s.value) : s.value} |`);
        }
        out.push('');
        break;
      }
    }
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

export function downloadMarkdown(rawData: any) {
  const { blocks } = buildBlocks(rawData);
  const md = blocksToMarkdown(blocks);
  saveBlob(new Blob([md], { type: 'text/markdown;charset=utf-8' }), `${reportFilename(rawData)}.md`);
}

// ── Renderer 2: Word (.docx) ────────────────────────────────────────────────
export async function downloadDocx(rawData: any) {
  // Capture the rendered report so the .docx looks exactly like the webpage.
  const slices = await captureReportSlices();
  const { Document, Packer, Paragraph, ImageRun, PageBreak } = await import('docx');

  // Letter content width at ~96dpi minus 0.5in margins each side (= 7.5in).
  const targetW = 720;
  const children: any[] = [];
  slices.forEach((s, i) => {
    if (i > 0) children.push(new Paragraph({ children: [new PageBreak()] }));
    const h = Math.round(targetW * (s.h / s.w));
    children.push(new Paragraph({
      children: [new ImageRun({ type: 'png', data: dataUrlToBytes(s.dataUrl), transformation: { width: targetW, height: h } })],
    }));
  });

  const doc = new Document({
    sections: [{
      properties: { page: { margin: { top: 360, bottom: 360, left: 360, right: 360 } } },
      children,
    }],
  });
  const blob = await Packer.toBlob(doc);
  saveBlob(blob, `${reportFilename(rawData)}.docx`);
}

// ── Renderer 3: PDF ─────────────────────────────────────────────────────────
export async function downloadPdf(rawData: any) {
  // Capture the rendered report so the PDF matches the webpage pixel-for-pixel.
  const slices = await captureReportSlices();
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 24;
  const w = pageW - margin * 2;
  slices.forEach((s, i) => {
    if (i > 0) doc.addPage();
    const h = w * (s.h / s.w);
    doc.addImage(s.dataUrl, 'PNG', margin, margin, w, Math.min(h, pageH - margin * 2));
  });
  doc.save(`${reportFilename(rawData)}.pdf`);
}
