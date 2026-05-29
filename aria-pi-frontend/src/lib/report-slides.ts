/**
 * Slide deck — turns the report into a presentation. buildSlides() powers the
 * on-screen deck; downloadPptx() writes a PowerPoint with native charts/tables.
 * Both read the same normalized report as the web view.
 */
import { normalize, parseMoney, fmtUsd } from '@/components/Report';
import { reportFilename } from '@/lib/report-export';

export type Slide =
  | { kind: 'title'; title: string; subtitle: string; meta: string }
  | { kind: 'text'; title: string; body: string }
  | { kind: 'metrics'; title: string; tiles: { label: string; value: string }[] }
  | { kind: 'bars'; title: string; subtitle?: string; data: { label: string; value: number; display: string }[] }
  | { kind: 'pie'; title: string; segments: { label: string; value: number; color: string }[] }
  | { kind: 'table'; title: string; headers: string[]; rows: string[][] }
  | { kind: 'bullets'; title: string; items: string[] };

function aggregates(rawData: any) {
  const d = normalize(rawData);
  const profs = d.section4_profiles || [];
  const tied = profs.filter((p) => p.existing_unc_tie);
  const strategic = profs.filter((p) => p.partnership_type === 'Strategic').length;
  const ncBased = profs.filter((p) => p.nc_based).length;
  const totalTrials = profs.reduce((s, p) => s + (p.pipeline?.length || 0), 0);
  const rev = profs
    .map((p) => ({ label: p.company_name, value: parseMoney(p.facts?.['revenue']?.value) }))
    .filter((x) => x.value > 0).sort((a, b) => b.value - a.value).slice(0, 6);
  return { d, profs, tied, strategic, ncBased, totalTrials, rev };
}

export function buildSlides(rawData: any): Slide[] {
  const { d, profs, tied, strategic, ncBased, totalTrials, rev } = aggregates(rawData);
  const m = d.report_meta;
  const topTied = tied.slice(0, 3).map((p) => p.company_name);
  const slides: Slide[] = [];

  slides.push({ kind: 'title', title: m.sector, subtitle: 'Partnership Intelligence',
    meta: m.generated_at ? `Generated ${m.date}` : '' });

  slides.push({ kind: 'text', title: 'Thesis',
    body: `We reviewed ${profs.length} ${m.sector} companies as research partners for UNC Chapel Hill. `
      + `${tied.length} of ${profs.length} have a documented UNC link. `
      + `${strategic} ${strategic === 1 ? 'is' : 'are'} large enough to anchor a strategic deal`
      + `${ncBased ? ` (${ncBased} based in North Carolina)` : ''}.`
      + (topTied.length ? ` Best first targets: ${topTied.join(', ')}.` : '') });

  slides.push({ kind: 'metrics', title: 'At a glance', tiles: [
    { label: 'Companies', value: String(profs.length) },
    { label: 'UNC tie', value: String(tied.length) },
    { label: 'Strategic', value: String(strategic) },
    { label: 'NC-based', value: String(ncBased) },
    { label: 'Trial programs', value: String(totalTrials) },
    { label: 'Claims sourced', value: d._validation ? `${d._validation.verified}/${d._validation.total_claims}` : 'n/a' },
  ] });

  if (rev.length) {
    slides.push({ kind: 'bars', title: 'Revenue by company', subtitle: 'Latest reported, SEC XBRL',
      data: rev.map((r) => ({ label: r.label, value: r.value, display: fmtUsd(r.value) })) });
  }

  slides.push({ kind: 'pie', title: 'Existing UNC connection', segments: [
    { label: 'Existing tie', value: tied.length, color: '0A0A0A' },
    { label: 'No documented tie', value: profs.length - tied.length, color: 'D4D4D4' },
  ] });

  const sel = d.section3_selection.selected || [];
  if (sel.length) {
    slides.push({ kind: 'table', title: 'Selected companies',
      headers: ['Company', 'UNC alignment', 'Existing tie'],
      rows: sel.slice(0, 12).map((s) => [s.company, (s.unc_alignment || '').slice(0, 60), s.existing_tie]) });
  }

  const tp = d.section6_talking_points?.companies || [];
  tp.slice(0, 5).forEach((c) => {
    slides.push({ kind: 'bullets', title: c.company, items: [
      c.know_company?.text, c.know_pipeline?.text, c.know_moves?.text, c.unc_hook?.text,
    ].filter(Boolean) as string[] });
  });

  return slides;
}

export async function downloadPptx(rawData: any) {
  const { default: pptxgen } = await import('pptxgenjs');
  const slides = buildSlides(rawData);
  const pptx = new pptxgen();
  pptx.layout = 'LAYOUT_WIDE';
  const INK = '0A0A0A';

  for (const s of slides) {
    const slide = pptx.addSlide();
    if (s.kind === 'title') {
      slide.background = { color: INK };
      slide.addText(s.title, { x: 0.6, y: 2.2, w: 12, h: 1.4, fontSize: 54, bold: true, color: 'FFFFFF' });
      slide.addText(s.subtitle, { x: 0.6, y: 3.5, w: 12, h: 0.6, fontSize: 22, color: '9A988F' });
      if (s.meta) slide.addText(s.meta, { x: 0.6, y: 6.6, w: 12, h: 0.4, fontSize: 12, color: '9A988F' });
      continue;
    }
    slide.addText(s.title, { x: 0.6, y: 0.4, w: 12, h: 0.8, fontSize: 28, bold: true, color: INK });
    if (s.kind === 'text') {
      slide.addText(s.body, { x: 0.6, y: 1.6, w: 12, h: 4, fontSize: 20, color: '1F2937', lineSpacingMultiple: 1.3 });
    } else if (s.kind === 'metrics') {
      const cols = s.tiles.map((t, i) => ({ x: 0.6 + (i % 3) * 4.1, y: 1.7 + Math.floor(i / 3) * 2.2, t }));
      cols.forEach(({ x, y, t }) => {
        slide.addText(t.value, { x, y, w: 3.8, h: 1, fontSize: 40, bold: true, color: INK });
        slide.addText(t.label.toUpperCase(), { x, y: y + 1, w: 3.8, h: 0.4, fontSize: 12, color: '777777' });
      });
    } else if (s.kind === 'bars') {
      if (s.subtitle) slide.addText(s.subtitle, { x: 0.6, y: 1.15, w: 12, h: 0.3, fontSize: 12, color: '999999' });
      slide.addChart(pptx.ChartType.bar, [{ name: 'Revenue', labels: s.data.map((d) => d.label), values: s.data.map((d) => d.value) }],
        { x: 0.6, y: 1.6, w: 12, h: 5.2, barDir: 'bar', chartColors: [INK], showValue: false, catAxisLabelFontSize: 10, valAxisHidden: true });
    } else if (s.kind === 'pie') {
      slide.addChart(pptx.ChartType.pie, [{ name: 'Split', labels: s.segments.map((g) => g.label), values: s.segments.map((g) => g.value) }],
        { x: 2.5, y: 1.6, w: 8, h: 5, chartColors: s.segments.map((g) => g.color), showLegend: true, legendPos: 'r', showValue: true });
    } else if (s.kind === 'table') {
      const head = s.headers.map((h) => ({ text: h, options: { bold: true, color: 'FFFFFF', fill: { color: INK } } }));
      const body = s.rows.map((r) => r.map((c) => ({ text: String(c || ''), options: { color: '1F2937' } })));
      slide.addTable([head, ...body] as any, { x: 0.6, y: 1.6, w: 12, fontSize: 12, border: { type: 'solid', pt: 0.5, color: 'DDDDDD' } });
    } else if (s.kind === 'bullets') {
      slide.addText(s.items.map((t) => ({ text: t, options: { bullet: true } })) as any,
        { x: 0.6, y: 1.6, w: 12, h: 5, fontSize: 18, color: '1F2937', lineSpacingMultiple: 1.2 });
    }
  }

  await pptx.writeFile({ fileName: `${reportFilename(rawData)}.pptx` });
}
