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
  | { t: 'chart'; chartKind: 'bars' | 'donut'; title: string; subtitle?: string; series: ChartSeries[]; money?: boolean };

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
    b.push({ t: 'h2', text: 'Overview' });
    b.push({ t: 'p', text: 'A ten-second scan. The full sourced report follows below.' });
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
    const so = data.section6_talking_points?.sector_opening;
    if (so?.text) b.push({ t: 'p', text: so.text + mark(so.sources, cites) });
    b.push({ t: 'chart', chartKind: 'donut', title: 'Existing UNC connection', series: [
      { label: 'Existing tie', value: tied.length, color: '#0a0a0a' },
      { label: 'No documented tie', value: nCos - tied.length, color: '#d4d4d4' },
    ] });
    b.push({ t: 'chart', chartKind: 'donut', title: 'Partnership scale', series: [
      { label: 'Strategic', value: strategic, color: '#0a0a0a' },
      { label: 'Translational', value: translational, color: '#9a988f' },
    ] });
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
    ctx.beginPath(); ctx.arc(cx, cy, rInner, 0, Math.PI * 2); ctx.fillStyle = '#ffffff'; ctx.fill();
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
  const { blocks } = buildBlocks(rawData);
  const {
    Document, Packer, Paragraph, TextRun, HeadingLevel,
    Table, TableRow, TableCell, WidthType, BorderStyle, ImageRun,
  } = await import('docx');

  // Pre-render every chart to a PNG up front (async), keyed by index, so the
  // synchronous block loop below can drop the image in.
  const chartImgs = new Map<number, { bytes: Uint8Array; w: number; h: number }>();
  await Promise.all(blocks.map(async (blk, i) => {
    if (blk.t === 'chart') {
      try {
        const { dataUrl, w, h } = await renderChartPng(blk);
        chartImgs.set(i, { bytes: dataUrlToBytes(dataUrl), w, h });
      } catch { /* fall back to table below */ }
    }
  }));

  const thin = { style: BorderStyle.SINGLE, size: 1, color: 'DDDDDD' };
  const cellBorders = { top: thin, bottom: thin, left: thin, right: thin };

  const children: any[] = [];
  blocks.forEach((blk, blkIdx) => {
    switch (blk.t) {
      case 'h1':
        children.push(new Paragraph({ text: blk.text, heading: HeadingLevel.TITLE }));
        break;
      case 'h2':
        children.push(new Paragraph({ text: blk.text, heading: HeadingLevel.HEADING_1, spacing: { before: 240, after: 120 } }));
        break;
      case 'h3':
        children.push(new Paragraph({ text: blk.text, heading: HeadingLevel.HEADING_2, spacing: { before: 160, after: 80 } }));
        break;
      case 'p':
        children.push(new Paragraph({ children: [new TextRun(blk.text)], spacing: { after: 120 } }));
        break;
      case 'meta':
        blk.pairs.forEach(([k, val]) => children.push(new Paragraph({
          children: [new TextRun({ text: `${k}: `, bold: true }), new TextRun(val)],
          spacing: { after: 20 },
        })));
        break;
      case 'list':
        blk.items.forEach((i) => children.push(new Paragraph({ text: i, bullet: { level: 0 } })));
        break;
      case 'refs':
        blk.items.forEach((r) => children.push(new Paragraph({
          children: [new TextRun({ text: `${r.id}. ${r.text} ` }), new TextRun({ text: r.url, style: 'Hyperlink' })],
          spacing: { after: 40 },
        })));
        break;
      case 'table': {
        const headerRow = new TableRow({
          tableHeader: true,
          children: blk.headers.map((h) => new TableCell({
            borders: cellBorders,
            shading: { fill: 'F4F4F4' },
            children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, size: 18 })] })],
          })),
        });
        const bodyRows = blk.rows.map((r) => new TableRow({
          children: r.map((c) => new TableCell({
            borders: cellBorders,
            children: [new Paragraph({ children: [new TextRun({ text: c || '', size: 18 })] })],
          })),
        }));
        children.push(new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [headerRow, ...bodyRows],
        }));
        children.push(new Paragraph({ text: '', spacing: { after: 120 } }));
        break;
      }
      case 'chart': {
        children.push(new Paragraph({
          children: [new TextRun({ text: blk.title, bold: true, size: 20 })],
          spacing: { before: 160, after: blk.subtitle ? 20 : 80 },
        }));
        if (blk.subtitle) {
          children.push(new Paragraph({
            children: [new TextRun({ text: blk.subtitle, italics: true, size: 16, color: '999999' })],
            spacing: { after: 80 },
          }));
        }
        const img = chartImgs.get(blkIdx);
        if (img) {
          children.push(new Paragraph({
            children: [new ImageRun({ data: img.bytes, transformation: { width: img.w, height: img.h } })],
            spacing: { after: 160 },
          }));
        } else {
          // Fallback: render the series as a small table if the image failed.
          const headerRow = new TableRow({
            tableHeader: true,
            children: [blk.chartKind === 'donut' ? 'Segment' : 'Company', 'Value'].map((h) => new TableCell({
              borders: cellBorders, shading: { fill: 'F4F4F4' },
              children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, size: 18 })] })],
            })),
          });
          const bodyRows = blk.series.map((s) => new TableRow({
            children: [s.label, blk.money ? fmtUsd(s.value) : String(s.value)].map((c) => new TableCell({
              borders: cellBorders,
              children: [new Paragraph({ children: [new TextRun({ text: c, size: 18 })] })],
            })),
          }));
          children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [headerRow, ...bodyRows] }));
          children.push(new Paragraph({ text: '', spacing: { after: 120 } }));
        }
        break;
      }
    }
  });

  const doc = new Document({
    styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } },
    sections: [{ properties: {}, children }],
  });
  const blob = await Packer.toBlob(doc);
  saveBlob(blob, `${reportFilename(rawData)}.docx`);
}

// ── Renderer 3: PDF ─────────────────────────────────────────────────────────
export async function downloadPdf(rawData: any) {
  const { blocks } = buildBlocks(rawData);
  const { jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 54;
  const contentW = pageW - margin * 2;
  let y = margin;

  const ensure = (need: number) => {
    if (y + need > pageH - margin) { doc.addPage(); y = margin; }
  };
  const writeText = (text: string, size: number, opts: { bold?: boolean; color?: [number, number, number]; gapBefore?: number; gapAfter?: number } = {}) => {
    const { bold = false, color = [31, 41, 55], gapBefore = 0, gapAfter = 6 } = opts;
    y += gapBefore;
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    doc.setTextColor(color[0], color[1], color[2]);
    const lines = doc.splitTextToSize(text, contentW) as string[];
    for (const line of lines) {
      ensure(size + 4);
      doc.text(line, margin, y);
      y += size + 4;
    }
    y += gapAfter;
  };

  // Pre-render charts to PNGs (async), keyed by block index.
  const chartImgs = new Map<number, { dataUrl: string; w: number; h: number }>();
  await Promise.all(blocks.map(async (blk, i) => {
    if (blk.t === 'chart') {
      try { chartImgs.set(i, await renderChartPng(blk)); } catch { /* skip */ }
    }
  }));

  blocks.forEach((blk, blkIdx) => {
    switch (blk.t) {
      case 'h1': writeText(blk.text, 24, { bold: true, color: [10, 10, 10], gapAfter: 10 }); break;
      case 'h2': writeText(blk.text, 16, { bold: true, color: [10, 10, 10], gapBefore: 14, gapAfter: 8 }); break;
      case 'h3': writeText(blk.text, 12, { bold: true, color: [10, 10, 10], gapBefore: 8, gapAfter: 4 }); break;
      case 'p': writeText(blk.text, 10.5); break;
      case 'meta':
        blk.pairs.forEach(([k, val]) => writeText(`${k}: ${val}`, 9.5, { color: [102, 102, 102], gapAfter: 2 }));
        y += 4;
        break;
      case 'list':
        blk.items.forEach((i) => writeText(`•  ${i}`, 10.5, { gapAfter: 3 }));
        break;
      case 'refs':
        blk.items.forEach((r) => writeText(`${r.id}. ${r.text} ${r.url}`, 8.5, { color: [55, 65, 81], gapAfter: 2 }));
        break;
      case 'table':
        autoTable(doc, {
          head: [blk.headers],
          body: blk.rows.map((r) => r.map((c) => c || '')),
          startY: y + 2,
          margin: { left: margin, right: margin },
          styles: { fontSize: 8.5, cellPadding: 4, overflow: 'linebreak', textColor: [31, 41, 55] },
          headStyles: { fillColor: [244, 244, 244], textColor: [80, 80, 80], fontStyle: 'bold' },
          theme: 'grid',
          tableLineColor: [225, 225, 225],
          tableLineWidth: 0.5,
        });
        // @ts-ignore – autotable stashes the final Y on the doc
        y = (doc as any).lastAutoTable.finalY + 12;
        break;
      case 'chart': {
        writeText(blk.title, 12, { bold: true, color: [10, 10, 10], gapBefore: 8, gapAfter: blk.subtitle ? 2 : 4 });
        if (blk.subtitle) writeText(blk.subtitle, 9, { color: [153, 153, 153], gapAfter: 4 });
        const img = chartImgs.get(blkIdx);
        if (img) {
          let dw = img.w, dh = img.h;
          if (dw > contentW) { const r = contentW / dw; dw = contentW; dh = img.h * r; }
          ensure(dh + 8);
          doc.addImage(img.dataUrl, 'PNG', margin, y, dw, dh);
          y += dh + 14;
        } else {
          autoTable(doc, {
            head: [[blk.chartKind === 'donut' ? 'Segment' : 'Company', 'Value']],
            body: blk.series.map((s) => [s.label, blk.money ? fmtUsd(s.value) : String(s.value)]),
            startY: y + 2,
            margin: { left: margin, right: margin },
            styles: { fontSize: 8.5, cellPadding: 4, overflow: 'linebreak', textColor: [31, 41, 55] },
            headStyles: { fillColor: [244, 244, 244], textColor: [80, 80, 80], fontStyle: 'bold' },
            theme: 'grid', tableLineColor: [225, 225, 225], tableLineWidth: 0.5,
          });
          // @ts-ignore
          y = (doc as any).lastAutoTable.finalY + 12;
        }
        break;
      }
    }
  });

  // Footer: page numbers
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(160, 160, 160);
    doc.text(`Innovate Carolina · UNC Chapel Hill`, margin, pageH - 24);
    doc.text(`${i} / ${pages}`, pageW - margin, pageH - 24, { align: 'right' });
  }

  doc.save(`${reportFilename(rawData)}.pdf`);
}
