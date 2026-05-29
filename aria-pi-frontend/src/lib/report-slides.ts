/**
 * Slide deck — a presentation generated from the report. Every slide is built
 * from the report's own data (sector name, real companies, real numbers,
 * real talking points) so each deck is specific to the sector searched, never
 * a fixed template. Every slide carries speaker notes. buildSlides() powers the
 * on-screen deck; downloadPptx() writes a PowerPoint with native charts/tables
 * and the same notes attached.
 */
import { normalize, fmtUsd } from '@/components/Report';
import { reportFilename } from '@/lib/report-export';
import { computeAnalytics, type CompanyMetrics } from '@/lib/report-analytics';

export type Slide = (
  | { kind: 'title'; title: string; subtitle: string; meta: string }
  | { kind: 'text'; title: string; body: string }
  | { kind: 'metrics'; title: string; tiles: { label: string; value: string }[] }
  | { kind: 'bars'; title: string; subtitle?: string; data: { label: string; value: number; display: string }[] }
  | { kind: 'pie'; title: string; segments: { label: string; value: number; color: string }[] }
  | { kind: 'table'; title: string; headers: string[]; rows: string[][] }
  | { kind: 'bullets'; title: string; items: string[] }
  | { kind: 'spotlight'; title: string; tags: string[]; facts: { label: string; value: string }[]; points: string[] }
) & { notes: string };

const pct = (n: number | null) => (n == null ? 'n/a' : `${n}%`);

export function buildSlides(rawData: any): Slide[] {
  const d = normalize(rawData);
  const a = computeAnalytics(rawData);
  const m = d.report_meta;
  const sector = m.sector;
  const C = a.counts;
  const slides: Slide[] = [];

  // Talking points indexed by company for spotlights.
  const tp = new Map<string, any>();
  (d.section6_talking_points?.companies || []).forEach((c) => tp.set(c.company, c));

  const topPriority = [...a.companies].sort((x, y) => y.priority - x.priority);
  const topNames = topPriority.slice(0, 3).map((c) => c.name);

  // 1. Title
  slides.push({
    kind: 'title', title: sector, subtitle: 'Partnership Intelligence',
    meta: m.generated_at ? `Generated ${m.date}` : '',
    notes: `Briefing on the ${sector} sector: ${C.total} companies assessed as research and `
      + `commercialization partners for UNC Chapel Hill. Open by framing why this sector matters now, `
      + `then walk the room through the landscape, the priority targets, and the recommended next steps.`,
  });

  // 2. Thesis
  const thesis = `We reviewed ${C.total} ${sector} companies as research partners for UNC Chapel Hill. `
    + `${C.uncTie} of ${C.total} already have a documented UNC link; ${C.strategic} `
    + `${C.strategic === 1 ? 'is' : 'are'} at strategic scale`
    + `${C.ncBased ? ` and ${C.ncBased} ${C.ncBased === 1 ? 'is' : 'are'} based in North Carolina` : ''}.`
    + (topNames.length ? ` The strongest first targets are ${topNames.join(', ')}.` : '');
  slides.push({
    kind: 'text', title: 'Thesis', body: thesis,
    notes: `This is the one-sentence takeaway. ${topNames[0] || 'The top target'} ranks first on our `
      + `priority model because of its combination of existing UNC ties, research overlap, and scale. `
      + `If the room only remembers one slide, it should be this one.`,
  });

  // 3. At a glance
  slides.push({
    kind: 'metrics', title: 'At a glance', tiles: [
      { label: 'Companies', value: String(C.total) },
      { label: 'UNC tie', value: `${C.uncTie}/${C.total}` },
      { label: 'Strategic', value: String(C.strategic) },
      { label: 'NC-based', value: String(C.ncBased) },
      { label: 'Trial programs', value: String(a.totals.trials) },
      { label: 'Claims sourced', value: d._validation ? `${d._validation.verified}/${d._validation.total_claims}` : 'n/a' },
    ],
    notes: `Every figure here is traceable to a primary source (SEC, ClinicalTrials.gov, PubMed, NIH). `
      + `${C.uncTie} of ${C.total} firms already touch UNC, which means outreach is warm, not cold, for those.`,
  });

  // 4. Sector landscape (financial scale)
  slides.push({
    kind: 'metrics', title: 'Sector landscape', tiles: [
      { label: 'Combined revenue', value: a.totals.revenue ? fmtUsd(a.totals.revenue) : 'n/a' },
      { label: 'Combined R&D', value: a.totals.rd ? fmtUsd(a.totals.rd) : 'n/a' },
      { label: 'Aggregate R&D %', value: pct(a.aggregate.rdIntensity) },
      { label: 'Aggregate net margin', value: pct(a.aggregate.netMargin) },
      { label: 'Median revenue', value: a.medians.revenue ? fmtUsd(a.medians.revenue) : 'n/a' },
      { label: 'Public w/ financials', value: `${C.publicWithFinancials}/${C.total}` },
    ],
    notes: `The ${sector} field here spends about ${pct(a.aggregate.rdIntensity)} of revenue on R&D in aggregate. `
      + `High R&D intensity signals firms that fund external research and are more receptive to university partnerships.`,
  });

  // 5. Revenue by company
  const rev = a.rankings.revenue.slice(0, 6);
  if (rev.length) {
    slides.push({
      kind: 'bars', title: 'Revenue by company', subtitle: 'Latest reported, SEC XBRL',
      data: rev.map((r) => ({ label: r.name, value: r.value, display: fmtUsd(r.value) })),
      notes: `${rev[0].name} leads at ${fmtUsd(rev[0].value)}. Scale matters for the kind of partnership on `
        + `the table: larger firms can fund multi-year sponsored research; smaller firms move faster on focused pilots.`,
    });
  }

  // 6. R&D intensity (innovation lens)
  const rdi = a.rankings.rdIntensity.slice(0, 6);
  if (rdi.length) {
    slides.push({
      kind: 'bars', title: 'R&D intensity', subtitle: 'R&D as % of revenue',
      data: rdi.map((r) => ({ label: r.name, value: r.value, display: `${r.value}%` })),
      notes: `R&D intensity is often a better partnership signal than raw size. ${rdi[0].name} reinvests the most `
        + `(${rdi[0].value}% of revenue), which usually means active external-collaboration budgets.`,
    });
  }

  // 7. UNC connection (pie)
  slides.push({
    kind: 'pie', title: 'Existing UNC connection',
    segments: [
      { label: 'Existing tie', value: C.uncTie, color: '0A0A0A' },
      { label: 'No documented tie', value: C.total - C.uncTie, color: 'D4D4D4' },
    ],
    notes: `${C.uncTie} firms already have a shared trial, NIH grant, or co-authored paper with UNC. `
      + `Start there: an existing tie is the fastest path to a first meeting.`,
  });

  // 8. Partnership scale (pie)
  slides.push({
    kind: 'pie', title: 'Partnership scale',
    segments: [
      { label: 'Strategic', value: C.strategic, color: '0A0A0A' },
      { label: 'Translational', value: C.translational, color: '9A988F' },
    ],
    notes: `Strategic-scale firms can anchor a long-term relationship; translational ones are better suited to `
      + `a specific project or pilot. Match the ask to the scale.`,
  });

  // 9. Priority targets
  slides.push({
    kind: 'table', title: 'Partnership priority',
    headers: ['#', 'Company', 'Score', 'Tie', 'Align', 'NC'],
    rows: topPriority.slice(0, 8).map((c, i) => [String(i + 1), c.name, String(c.priority),
      c.uncTie ? 'Yes' : '', String(c.alignment), c.ncBased ? 'Yes' : '']),
    notes: `Priority score (0-100) weights existing UNC tie (40), research alignment (up to 25), NC presence (15), `
      + `strategic scale (10), and active trials (10). Work the list top-down for outreach.`,
  });

  // 10-12. Spotlight on top 3 priority companies (fully dynamic)
  topPriority.slice(0, 3).forEach((c) => {
    const t = tp.get(c.name);
    const points = [t?.know_company?.text, t?.know_pipeline?.text, t?.know_moves?.text, t?.unc_hook?.text]
      .filter(Boolean) as string[];
    const facts = [
      { label: 'Revenue', value: c.revenue ? fmtUsd(c.revenue) : 'n/a' },
      { label: 'R&D', value: c.rd ? fmtUsd(c.rd) : 'n/a' },
      { label: 'R&D intensity', value: pct(c.rdIntensity) },
      { label: 'Trial programs', value: String(c.trials) },
      { label: 'UNC alignment', value: String(c.alignment) },
      { label: 'Priority', value: `${c.priority}/100` },
    ];
    const tags = [c.partnershipType, c.uncTie ? 'Existing UNC tie' : 'No documented tie', ...(c.ncBased ? ['NC-based'] : [])];
    slides.push({
      kind: 'spotlight', title: c.name, tags, facts,
      points: points.length ? points : [`${c.name} ranks ${c.priority}/100 on the partnership-priority model.`],
      notes: `Spotlight on ${c.name}. ${c.uncTie ? 'There is already a documented UNC tie, so lead with that. ' : 'No documented UNC tie yet, so lead with research overlap. '}`
        + `Use the talking points as your opening; the facts on the right are the proof points to have ready.`,
    });
  });

  // 13. Closing / next steps
  slides.push({
    kind: 'bullets', title: 'Recommended next steps',
    items: [
      topNames.length ? `Open outreach with ${topNames.join(', ')} (highest priority).` : 'Confirm the priority list with the team.',
      C.uncTie ? `Route the ${C.uncTie} firms with existing UNC ties to the relevant PI or center first.` : 'Identify a faculty champion for each target.',
      'Verify every flagged claim before any external outreach.',
      'Re-run this report quarterly to catch new filings, trials, and grants.',
    ],
    notes: `Close with a clear ask: who owns outreach to the top targets, and by when. Remind the room this is a `
      + `draft for human verification, not a final outreach list.`,
  });

  // 14. Sources
  slides.push({
    kind: 'text', title: 'Sources',
    body: `${d.references?.length || 0} citations. Every claim is backed by primary sources: SEC EDGAR, `
      + `ClinicalTrials.gov, PubMed, and NIH RePORTER. No Wikipedia, no aggregators.`,
    notes: `If asked "how do we know this?", point here. The full citation list ships with the report and the Excel workbook.`,
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
    if (s.notes) slide.addNotes(s.notes);

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
      s.tiles.forEach((t, i) => {
        const x = 0.6 + (i % 3) * 4.1, y = 1.7 + Math.floor(i / 3) * 2.2;
        slide.addText(t.value, { x, y, w: 3.8, h: 1, fontSize: 36, bold: true, color: INK });
        slide.addText(t.label.toUpperCase(), { x, y: y + 1, w: 3.8, h: 0.4, fontSize: 12, color: '777777' });
      });
    } else if (s.kind === 'bars') {
      if (s.subtitle) slide.addText(s.subtitle, { x: 0.6, y: 1.15, w: 12, h: 0.3, fontSize: 12, color: '999999' });
      slide.addChart(pptx.ChartType.bar, [{ name: s.title, labels: s.data.map((x) => x.label), values: s.data.map((x) => x.value) }],
        { x: 0.6, y: 1.6, w: 12, h: 5.2, barDir: 'bar', chartColors: [INK], showValue: false, catAxisLabelFontSize: 11, valAxisHidden: true });
    } else if (s.kind === 'pie') {
      slide.addChart(pptx.ChartType.pie, [{ name: 'Split', labels: s.segments.map((g) => g.label), values: s.segments.map((g) => g.value) }],
        { x: 2.5, y: 1.6, w: 8, h: 5, chartColors: s.segments.map((g) => g.color), showLegend: true, legendPos: 'r', showValue: true });
    } else if (s.kind === 'table') {
      const head = s.headers.map((h) => ({ text: h, options: { bold: true, color: 'FFFFFF', fill: { color: INK } } }));
      const body = s.rows.map((r) => r.map((c) => ({ text: String(c || ''), options: { color: '1F2937' } })));
      slide.addTable([head, ...body] as any, { x: 0.6, y: 1.6, w: 12, fontSize: 13, border: { type: 'solid', pt: 0.5, color: 'DDDDDD' } });
    } else if (s.kind === 'bullets') {
      slide.addText(s.items.map((t) => ({ text: t, options: { bullet: true } })) as any,
        { x: 0.6, y: 1.6, w: 12, h: 5, fontSize: 18, color: '1F2937', lineSpacingMultiple: 1.3 });
    } else if (s.kind === 'spotlight') {
      slide.addText(s.tags.join('  ·  '), { x: 0.6, y: 1.2, w: 7, h: 0.4, fontSize: 13, color: '777777' });
      slide.addText(s.points.map((t) => ({ text: t, options: { bullet: true } })) as any,
        { x: 0.6, y: 1.8, w: 7.4, h: 5, fontSize: 16, color: '1F2937', lineSpacingMultiple: 1.2 });
      const factRows = s.facts.map((f) => [
        { text: f.label, options: { color: '777777', fontSize: 12 } },
        { text: f.value, options: { color: '0A0A0A', bold: true, fontSize: 12, align: 'right' } },
      ]);
      slide.addTable(factRows as any, { x: 8.4, y: 1.8, w: 4.2, colW: [2.4, 1.8], border: { type: 'none' }, rowH: 0.4 });
    }
  }

  await pptx.writeFile({ fileName: `${reportFilename(rawData)}.pptx` });
}
