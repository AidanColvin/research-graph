/**
 * Slide deck — an analytical, bullet-driven briefing generated from the report.
 * Every slide is built from the report's own data (sector, real companies, real
 * numbers, real talking points) so each deck is specific to the sector searched.
 * Bullets are short declarative sentences, graduate level, no filler. Every
 * slide carries speaker notes. buildSlides() powers the on-screen deck;
 * downloadPptx() writes a PowerPoint with the same content + notes.
 */
import { normalize, fmtUsd } from '@/components/Report';
import { reportFilename } from '@/lib/report-export';
import { computeAnalytics } from '@/lib/report-analytics';

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

  const tp = new Map<string, any>();
  (d.section6_talking_points?.companies || []).forEach((c) => tp.set(c.company, c));

  const byPriority = [...a.companies].sort((x, y) => y.priority - x.priority);
  const top = byPriority.slice(0, 3);
  const topNames = top.map((c) => c.name);
  const topRev = a.rankings.revenue[0];
  const topRdi = a.rankings.rdIntensity[0];
  const topAlign = a.rankings.alignment[0];
  const revShare = topRev && a.totals.revenue ? Math.round(100 * topRev.value / a.totals.revenue) : null;
  const usd = (n: number) => (n ? fmtUsd(n) : 'n/a');

  // 1. Title
  slides.push({
    kind: 'title', title: sector, subtitle: 'Partnership Intelligence',
    meta: m.generated_at ? `Generated ${m.date}` : '',
    notes: `Briefing on the ${sector} sector. ${C.total} companies screened as UNC research and `
      + `commercialization partners. Frame the sector, the targets, and the recommended outreach order.`,
  });

  // 2. Thesis (short bullets)
  slides.push({
    kind: 'bullets', title: 'Thesis',
    items: [
      `${C.total} ${sector} firms screened as UNC partners.`,
      `${C.uncTie} of ${C.total} already have a documented UNC link.`,
      `${C.strategic} are strategic-scale; ${C.ncBased} are NC-based.`,
      a.aggregate.rdIntensity != null ? `Sector reinvests ${a.aggregate.rdIntensity}% of revenue in R&D.` : `Public financials cover ${C.publicWithFinancials} of ${C.total} firms.`,
      topNames.length ? `Lead targets: ${topNames.join(', ')}.` : 'Priority list pending verification.',
      top[0] ? `Open with ${top[0].name} (priority ${top[0].priority}/100).` : 'Confirm priority order with the team.',
    ],
    notes: `The argument in six lines. ${top[0]?.name || 'The top target'} ranks first because it pairs an `
      + `existing UNC tie with research overlap and scale. If they remember one slide, make it this.`,
  });

  // 3. Why this sector now (real signals)
  const why = (d.section1_overview.why_now || []).map((w) => w.signal).filter(Boolean).slice(0, 5);
  if (why.length) {
    slides.push({
      kind: 'bullets', title: 'Why this sector now', items: why,
      notes: `Macro tailwinds that make outreach timely. Each signal is sourced in the report. Use one as the `
        + `opening line of a cold email to show you understand the firm's environment.`,
    });
  }

  // 4. Sector economics (bullets + numbers)
  slides.push({
    kind: 'bullets', title: 'Sector economics',
    items: [
      `Combined revenue: ${usd(a.totals.revenue)} across ${C.publicWithFinancials} public firms.`,
      `Combined R&D spend: ${usd(a.totals.rd)}.`,
      `Aggregate R&D intensity: ${pct(a.aggregate.rdIntensity)} of revenue.`,
      `Median revenue: ${a.medians.revenue ? usd(a.medians.revenue) : 'n/a'}; median net margin: ${pct(a.medians.netMargin)}.`,
      revShare != null ? `Concentrated: ${topRev.name} is ${revShare}% of combined revenue.` : 'Revenue spread across the set.',
      `High R&D intensity signals firms that fund external research.`,
    ],
    notes: `R&D intensity is the partnership tell. Firms above the sector median are the most likely to fund `
      + `sponsored research with a university. Aggregate intensity here is ${pct(a.aggregate.rdIntensity)}.`,
  });

  // 5. Market structure (distribution bullets)
  const band = (label: string) => a.distributions.byRevenueBucket.find((x) => x.label.startsWith(label))?.value || 0;
  slides.push({
    kind: 'bullets', title: 'Market structure',
    items: [
      `Mega-cap (≥$100B): ${band('Mega')}. Large ($10-100B): ${band('Large')}. Mid (<$10B): ${band('Mid')}.`,
      `Strategic-scale: ${C.strategic}. Translational: ${C.translational}.`,
      `Existing UNC tie: ${C.uncTie}. No documented tie: ${C.total - C.uncTie}.`,
      `NC-based: ${C.ncBased} of ${C.total}.`,
      `Match the ask to scale: large firms fund multi-year research; mid-caps move faster on pilots.`,
    ],
    notes: `Segment the room's expectations. Strategic firms anchor long-term relationships; translational firms `
      + `suit a single project. Lead each conversation with the model that fits the firm's size.`,
  });

  // 6. Revenue leaders (chart)
  const rev = a.rankings.revenue.slice(0, 6);
  if (rev.length) {
    slides.push({
      kind: 'bars', title: 'Revenue leaders', subtitle: 'Latest reported, SEC XBRL',
      data: rev.map((r) => ({ label: r.name, value: r.value, display: fmtUsd(r.value) })),
      notes: `${rev[0].name} leads at ${fmtUsd(rev[0].value)}. Scale sets the ceiling on what a partnership can fund.`,
    });
  }

  // 7. Innovation intensity (chart)
  const rdi = a.rankings.rdIntensity.slice(0, 6);
  if (rdi.length) {
    slides.push({
      kind: 'bars', title: 'Innovation intensity', subtitle: 'R&D as % of revenue',
      data: rdi.map((r) => ({ label: r.name, value: r.value, display: `${r.value}%` })),
      notes: `${rdi[0].name} reinvests the most (${rdi[0].value}%). Rank by intensity, not size, to find the most `
        + `research-receptive firms.`,
    });
  }

  // 8. UNC engagement (bullets)
  slides.push({
    kind: 'bullets', title: 'UNC engagement',
    items: [
      `${C.uncTie} of ${C.total} firms have a documented UNC link.`,
      `Links run through clinical trials, NIH grants, and co-authored papers.`,
      `${a.totals.alignment} research-overlap signals across the set.`,
      topAlign ? `${topAlign.name} shows the most overlap (${topAlign.value} signals).` : 'Overlap is thin; lead with sector fit.',
      `Existing ties are warm outreach. Start there.`,
    ],
    notes: `An existing tie is the shortest path to a first meeting. Route those firms to the relevant PI or center `
      + `rather than a generic contact.`,
  });

  // 9. UNC connection (pie)
  slides.push({
    kind: 'pie', title: 'Existing UNC connection',
    segments: [
      { label: 'Existing tie', value: C.uncTie, color: '0A0A0A' },
      { label: 'No documented tie', value: C.total - C.uncTie, color: 'D4D4D4' },
    ],
    notes: `${C.uncTie} firms are already connected to UNC. Prioritize them; the rest need a faculty champion first.`,
  });

  // 10. Priority model (table)
  slides.push({
    kind: 'table', title: 'Partnership priority',
    headers: ['#', 'Company', 'Score', 'Tie', 'Align', 'NC'],
    rows: byPriority.slice(0, 8).map((c, i) => [String(i + 1), c.name, String(c.priority),
      c.uncTie ? 'Yes' : '', String(c.alignment), c.ncBased ? 'Yes' : '']),
    notes: `Score (0-100): existing tie 40, alignment up to 25, NC presence 15, strategic scale 10, active trials 10. `
      + `Work the list top-down.`,
  });

  // 11-13. Spotlights (top 3)
  top.forEach((c) => {
    const t = tp.get(c.name);
    const points = [t?.know_company?.text, t?.know_pipeline?.text, t?.know_moves?.text, t?.unc_hook?.text]
      .filter(Boolean) as string[];
    const ask = c.uncTie
      ? 'Ask: warm intro through the existing UNC contact.'
      : 'Ask: a scoping call with the aligned UNC center.';
    slides.push({
      kind: 'spotlight', title: c.name,
      tags: [c.partnershipType, c.uncTie ? 'Existing UNC tie' : 'No documented tie', ...(c.ncBased ? ['NC-based'] : [])],
      facts: [
        { label: 'Revenue', value: usd(c.revenue) },
        { label: 'R&D', value: usd(c.rd) },
        { label: 'R&D intensity', value: pct(c.rdIntensity) },
        { label: 'Net margin', value: pct(c.netMargin) },
        { label: 'Trials', value: String(c.trials) },
        { label: 'Priority', value: `${c.priority}/100` },
      ],
      points: [...(points.length ? points : [`Ranks ${c.priority}/100 on the priority model.`]), ask],
      notes: `Spotlight on ${c.name}. ${c.uncTie ? 'Lead with the existing UNC tie.' : 'Lead with research overlap.'} `
        + `The facts on the right are your proof points; the last bullet is the concrete ask.`,
    });
  });

  // 14. Risks / due diligence
  const risks = (d.section2_internal_mapping.risk_flags || []).slice(0, 5);
  if (risks.length) {
    slides.push({
      kind: 'bullets', title: 'Due diligence',
      items: [
        ...risks.map((r) => `${r.company}: ${String(r.risk).replace(/\s+/g, ' ').slice(0, 110)}.`),
        'Coordinate with the named PI or OSP before any outreach.',
      ],
      notes: `These firms have active UNC funding or trial ties. Outreach without coordinating with the PI risks `
        + `crossing an existing relationship. Clear it internally first.`,
    });
  }

  // 15. Next steps
  slides.push({
    kind: 'bullets', title: 'Next steps',
    items: [
      topNames.length ? `Open outreach with ${topNames.join(', ')}.` : 'Confirm the priority list.',
      C.uncTie ? `Route the ${C.uncTie} tied firms to the relevant PI first.` : 'Recruit a faculty champion per target.',
      'Verify every flagged claim before contact.',
      'Re-run quarterly to catch new filings, trials, and grants.',
    ],
    notes: `Close with ownership: who runs outreach to the top targets, and by when. This is a draft for human `
      + `verification, not a final list.`,
  });

  // 16. Method / sources
  slides.push({
    kind: 'bullets', title: 'Method and sources',
    items: [
      `${d.references?.length || 0} citations; every claim double-sourced.`,
      'Primary sources only: SEC EDGAR, ClinicalTrials.gov, PubMed, NIH RePORTER.',
      'No Wikipedia, no aggregators.',
      d._validation ? `${d._validation.verified} of ${d._validation.total_claims} claims verified.` : 'Claims verified against the two-source rule.',
    ],
    notes: `If asked "how do we know this?", point here. Full citations ship with the report and the Excel workbook.`,
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
        { x: 0.6, y: 1.6, w: 12, h: 5.2, fontSize: 20, color: '1F2937', lineSpacingMultiple: 1.35 });
    } else if (s.kind === 'spotlight') {
      slide.addText(s.tags.join('  ·  '), { x: 0.6, y: 1.2, w: 7, h: 0.4, fontSize: 13, color: '777777' });
      slide.addText(s.points.map((t) => ({ text: t, options: { bullet: true } })) as any,
        { x: 0.6, y: 1.8, w: 7.4, h: 5, fontSize: 16, color: '1F2937', lineSpacingMultiple: 1.25 });
      const factRows = s.facts.map((f) => [
        { text: f.label, options: { color: '777777', fontSize: 12 } },
        { text: f.value, options: { color: '0A0A0A', bold: true, fontSize: 12, align: 'right' } },
      ]);
      slide.addTable(factRows as any, { x: 8.4, y: 1.8, w: 4.2, colW: [2.4, 1.8], border: { type: 'none' }, rowH: 0.4 });
    }
  }

  await pptx.writeFile({ fileName: `${reportFilename(rawData)}.pptx` });
}
