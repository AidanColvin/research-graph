'use client';

import React, { CSSProperties } from 'react';

type Sourced = { text: string; sources: string[] };
type SourceList = string[];

export type ReportData = {
  report_meta: { sector: string; date: string; prepared_by: string; version: string };
  section1_overview: {
    definition: Sourced;
    scale: Sourced;
    why_now: { signal: string; sources: SourceList }[];
    nc_context: Sourced;
    unc_units: { unit: string; focus: string; url: string }[];
  };
  section2_internal_mapping: {
    known_partnerships: { company: string; unc_unit: string; relationship_type: string; active: string; sources: SourceList }[];
    unc_faculty: { name: string; school: string; research_focus: string; sources: SourceList }[];
    data_assets: { name: string; description: string; held_by: string; sources: SourceList }[];
    risk_flags: { company: string; risk: string; sources: SourceList }[];
  };
  section3_selection: {
    selected: { company: string; unc_alignment: string; existing_tie: string; sources: SourceList }[];
    excluded: { company: string; reason: string; sources: SourceList }[];
  };
  section4_profiles: {
    company_name: string;
    overview: Sourced;
    partnership_type: string;
    existing_unc_tie: boolean;
    facts: Record<string, { value: string; source: string }>;
    sec_filings?: Record<string, { form: string; date: string; url: string }[]>;
    pipeline: { program: string; indication: string; stage: string; sources: SourceList }[];
    partnering_history: { partner: string; deal_type: string; year: string; sources: SourceList }[];
    unc_alignment: { company_program: string; unc_unit: string; company_fact: string; unc_fact: string; rationale: string; sources: SourceList }[];
    what_unc_offers: { offering: string; description: string; sources: SourceList }[];
    signals: { signal: string; sources: SourceList }[];
  }[];
  section5_value_prop: {
    data_assets: { name: string; description: string; relevance: string; sources: SourceList }[];
    research_capacity: { name: string; role: string; expertise: string; sources: SourceList }[];
    talent_pipeline: { program: string; school: string; output: string; sources: SourceList }[];
    nc_access: { asset: string; description: string; sources: SourceList }[];
    future_signals: { signal: string; sources: SourceList }[];
    partnership_models: { model: string; description: string; unit: string }[];
  };
  section6_talking_points: {
    sector_opening: Sourced;
    companies: {
      company: string;
      know_company: Sourced;
      know_pipeline: Sourced;
      know_moves: Sourced;
      unc_hook: Sourced;
    }[];
  };
  section7_verification: { label: string; checked: boolean }[];
  references: { id: number; title: string; year: string; publisher: string; url: string }[];
  _validation?: { total_claims: number; verified: number; unverified: number; issues: any[] };
  _meta?: { claude_live: boolean; model: string; seed_companies: string[] };
  _stub?: boolean;
};

// ── AMA citation index ─────────────────────────────────────────────────────────
type CitationIndex = {
  numberOf: (url: string) => number;
  list: { id: number; url: string; ama: string }[];
};

const TODAY = new Date().toLocaleDateString('en-US', {
  year: 'numeric', month: 'long', day: 'numeric',
});

// Format a single URL as an AMA citation (best-effort from URL structure).
function amaFormat(url: string): string {
  const u = (url || '').toLowerCase();
  const safe = url || '';
  if (u.includes('sec.gov/archives/edgar') || u.includes('sec.gov/cgi-bin/browse-edgar')) {
    return `US Securities and Exchange Commission. EDGAR filing. Accessed ${TODAY}. ${safe}`;
  }
  if (u.includes('sec.gov')) {
    return `US Securities and Exchange Commission. Accessed ${TODAY}. ${safe}`;
  }
  if (u.includes('pubmed.ncbi.nlm.nih.gov')) {
    const m = u.match(/pubmed\.ncbi\.nlm\.nih\.gov\/(\d+)/);
    const pmid = m ? m[1] : '';
    return `PubMed${pmid ? ` ID: ${pmid}` : ''}. National Library of Medicine. Accessed ${TODAY}. ${safe}`;
  }
  if (u.includes('clinicaltrials.gov')) {
    const m = u.match(/clinicaltrials\.gov\/study\/(nct\d+)/i);
    const nct = m ? m[1].toUpperCase() : '';
    return `ClinicalTrials.gov${nct ? ` identifier: ${nct}` : ''}. US National Library of Medicine. Accessed ${TODAY}. ${safe}`;
  }
  if (u.includes('reporter.nih.gov')) {
    const m = u.match(/project-details\/([^/?#]+)/);
    const proj = m ? m[1] : '';
    return `${proj ? `Project ${proj}. ` : ''}NIH RePORTER. National Institutes of Health. Accessed ${TODAY}. ${safe}`;
  }
  if (u.includes('research.unc.edu')) {
    return `Office of the Vice Chancellor for Research. University of North Carolina at Chapel Hill. Accessed ${TODAY}. ${safe}`;
  }
  if (u.includes('unclineberger.org')) {
    return `UNC Lineberger Comprehensive Cancer Center. Accessed ${TODAY}. ${safe}`;
  }
  if (u.includes('sph.unc.edu')) {
    return `UNC Gillings School of Global Public Health. Accessed ${TODAY}. ${safe}`;
  }
  if (u.includes('pharmacy.unc.edu')) {
    return `UNC Eshelman School of Pharmacy. Accessed ${TODAY}. ${safe}`;
  }
  if (u.includes('med.unc.edu')) {
    return `UNC School of Medicine. Accessed ${TODAY}. ${safe}`;
  }
  if (u.includes('tracs.unc.edu')) {
    return `NC TraCS Institute. University of North Carolina at Chapel Hill. Accessed ${TODAY}. ${safe}`;
  }
  if (u.includes('shepscenter.unc.edu')) {
    return `Cecil G. Sheps Center for Health Services Research. University of North Carolina at Chapel Hill. Accessed ${TODAY}. ${safe}`;
  }
  if (u.includes('ncahec.net')) {
    return `North Carolina Area Health Education Centers. Accessed ${TODAY}. ${safe}`;
  }
  if (u.includes('unc.edu')) {
    return `University of North Carolina at Chapel Hill. Accessed ${TODAY}. ${safe}`;
  }
  if (u.includes('cancer.gov')) {
    return `National Cancer Institute. Accessed ${TODAY}. ${safe}`;
  }
  if (u.includes('nih.gov')) {
    return `National Institutes of Health. Accessed ${TODAY}. ${safe}`;
  }
  if (u.includes('fda.gov')) {
    return `US Food and Drug Administration. Accessed ${TODAY}. ${safe}`;
  }
  if (u.includes('hrsa.gov')) {
    return `Health Resources and Services Administration. Accessed ${TODAY}. ${safe}`;
  }
  if (u.includes('cdc.gov')) {
    return `Centers for Disease Control and Prevention. Accessed ${TODAY}. ${safe}`;
  }
  if (u.includes('energy.gov')) {
    return `US Department of Energy. Accessed ${TODAY}. ${safe}`;
  }
  if (u.includes('nist.gov')) {
    return `National Institute of Standards and Technology. Accessed ${TODAY}. ${safe}`;
  }
  if (u.includes('quantum.gov')) {
    return `National Quantum Initiative. Accessed ${TODAY}. ${safe}`;
  }
  if (u.includes('ncbiotech.org')) {
    return `North Carolina Biotechnology Center. Accessed ${TODAY}. ${safe}`;
  }
  if (u.includes('rtp.org')) {
    return `Research Triangle Foundation of North Carolina. Accessed ${TODAY}. ${safe}`;
  }
  // Generic: extract host
  let host = '';
  try { host = new URL(safe).host.replace(/^www\./, ''); } catch { host = safe; }
  return `${host}. Accessed ${TODAY}. ${safe}`;
}

// Walk the normalized report tree and collect every URL in first-appearance order.
function collectUrls(node: any, out: string[], seen: Set<string>) {
  if (node && typeof node === 'object') {
    if (Array.isArray(node.sources)) {
      for (const u of node.sources) {
        if (typeof u === 'string' && u && !seen.has(u)) {
          seen.add(u); out.push(u);
        }
      }
    }
    if (typeof node.source === 'string' && node.source && !seen.has(node.source)) {
      seen.add(node.source); out.push(node.source);
    }
    if (typeof node.url === 'string' && node.url && !seen.has(node.url)) {
      seen.add(node.url); out.push(node.url);
    }
    for (const k of Object.keys(node)) collectUrls((node as any)[k], out, seen);
  }
}

function buildCitationIndex(data: any): CitationIndex {
  const ordered: string[] = [];
  const seen = new Set<string>();
  collectUrls(data, ordered, seen);
  const numbers = new Map<string, number>();
  ordered.forEach((u, i) => numbers.set(u, i + 1));
  const list = ordered.map((url, i) => ({
    id: i + 1, url, ama: amaFormat(url),
  }));
  return {
    numberOf: (u: string) => numbers.get(u) || 0,
    list,
  };
}

const CitationCtx = React.createContext<CitationIndex>({
  numberOf: () => 0,
  list: [],
});

// In-text superscript citation, AMA style: ¹ or ²,³ for multiple.
function Cite({ urls }: { urls: string[] }) {
  const idx = React.useContext(CitationCtx);
  if (!urls || urls.length === 0) return null;
  const nums = urls.map((u) => idx.numberOf(u)).filter((n) => n > 0);
  if (nums.length === 0) return null;
  // AMA: comma-separate non-consecutive; en-dash for runs of 3+. Keep simple here.
  const display = nums.join(',');
  return (
    <sup style={styles.cite} title={urls.join('\n')}>
      <a href={`#ref-${nums[0]}`} style={styles.citeLink}>{display}</a>
    </sup>
  );
}

// One pill for a standalone URL where a number is overkill (e.g. SEC filings grid).
function SourceLink({ url }: { url: string }) {
  const idx = React.useContext(CitationCtx);
  const n = idx.numberOf(url);
  return (
    <a href={url} target="_blank" rel="noreferrer" style={styles.sourceLink}>
      {n > 0 ? <sup style={styles.cite}>{n}</sup> : null}
    </a>
  );
}

// ── Section primitives ────────────────────────────────────────────────────────
function H2({ n, title }: { n: number; title: string }) {
  return (
    <h2 style={styles.h2}>
      <span style={styles.h2Num}>{n.toString().padStart(2, '0')}</span>
      {title}
    </h2>
  );
}

function H3({ children }: { children: React.ReactNode }) {
  return <h3 style={styles.h3}>{children}</h3>;
}

function Claim({ text, sources }: Sourced) {
  return (
    <p style={styles.claim}>
      {text}
      <Cite urls={sources || []} />
    </p>
  );
}

function Table({ headers, rows }: { headers: string[]; rows: React.ReactNode[][] }) {
  return (
    <div style={styles.tableWrap}>
      <table style={styles.table}>
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i} style={styles.th}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ borderTop: '1px solid #f0f0f0' }}>
              {r.map((c, j) => (
                <td key={j} style={styles.td}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return <p style={styles.empty}>{label}</p>;
}

// ── Defensive defaults — any missing field falls back to {} or [] ─────────────
function normalize(raw: any): ReportData {
  const d = raw || {};
  const sec = (k: string) => d[k] || {};
  const arr = (k: string) => Array.isArray(d[k]) ? d[k] : [];
  const sourced = (x: any): Sourced => ({
    text: (x && x.text) || '',
    sources: (x && Array.isArray(x.sources)) ? x.sources : [],
  });
  const s1 = sec('section1_overview');
  const s2 = sec('section2_internal_mapping');
  const s3 = sec('section3_selection');
  const s5 = sec('section5_value_prop');
  const s6 = sec('section6_talking_points');
  return {
    report_meta: {
      sector: d.report_meta?.sector || d.sector || '—',
      date: d.report_meta?.date || '',
      prepared_by: d.report_meta?.prepared_by || 'Research Intelligence Team — UNC Chapel Hill',
      version: d.report_meta?.version || 'Draft',
    },
    section1_overview: {
      definition: sourced(s1.definition),
      scale: sourced(s1.scale),
      why_now: Array.isArray(s1.why_now) ? s1.why_now : [],
      nc_context: sourced(s1.nc_context),
      unc_units: Array.isArray(s1.unc_units) ? s1.unc_units : [],
    },
    section2_internal_mapping: {
      known_partnerships: Array.isArray(s2.known_partnerships) ? s2.known_partnerships : [],
      unc_faculty: Array.isArray(s2.unc_faculty) ? s2.unc_faculty : [],
      data_assets: Array.isArray(s2.data_assets) ? s2.data_assets : [],
      risk_flags: Array.isArray(s2.risk_flags) ? s2.risk_flags : [],
    },
    section3_selection: {
      selected: Array.isArray(s3.selected) ? s3.selected : [],
      excluded: Array.isArray(s3.excluded) ? s3.excluded : [],
    },
    section4_profiles: Array.isArray(d.section4_profiles) ? d.section4_profiles.map((p: any) => ({
      company_name: p?.company_name || '—',
      overview: sourced(p?.overview),
      partnership_type: p?.partnership_type || 'Unknown',
      existing_unc_tie: !!p?.existing_unc_tie,
      facts: p?.facts || {},
      sec_filings: (p?.sec_filings && typeof p.sec_filings === 'object') ? p.sec_filings : undefined,
      pipeline: Array.isArray(p?.pipeline) ? p.pipeline : [],
      partnering_history: Array.isArray(p?.partnering_history) ? p.partnering_history : [],
      unc_alignment: Array.isArray(p?.unc_alignment) ? p.unc_alignment : [],
      what_unc_offers: Array.isArray(p?.what_unc_offers) ? p.what_unc_offers : [],
      signals: Array.isArray(p?.signals) ? p.signals : [],
    })) : [],
    section5_value_prop: {
      data_assets: Array.isArray(s5.data_assets) ? s5.data_assets : [],
      research_capacity: Array.isArray(s5.research_capacity) ? s5.research_capacity : [],
      talent_pipeline: Array.isArray(s5.talent_pipeline) ? s5.talent_pipeline : [],
      nc_access: Array.isArray(s5.nc_access) ? s5.nc_access : [],
      future_signals: Array.isArray(s5.future_signals) ? s5.future_signals : [],
      partnership_models: Array.isArray(s5.partnership_models) ? s5.partnership_models : [],
    },
    section6_talking_points: {
      sector_opening: sourced(s6.sector_opening),
      companies: Array.isArray(s6.companies) ? s6.companies.map((c: any) => ({
        company: c?.company || '—',
        know_company: sourced(c?.know_company),
        know_pipeline: sourced(c?.know_pipeline),
        know_moves: sourced(c?.know_moves),
        unc_hook: sourced(c?.unc_hook),
      })) : [],
    },
    section7_verification: Array.isArray(d.section7_verification) ? d.section7_verification : [],
    references: Array.isArray(d.references) ? d.references : [],
    _validation: d._validation,
    _meta: d._meta,
    _stub: d._stub,
  };
}

// ── Main Report ───────────────────────────────────────────────────────────────
export default function Report({ data: rawData }: { data: any }) {
  const data = normalize(rawData);
  const m = data.report_meta;
  const v = data._validation;
  const citations = React.useMemo(() => buildCitationIndex(data), [data]);

  return (
    <CitationCtx.Provider value={citations}>
    <article style={styles.article}>
      {/* HEADER */}
      <header style={styles.header}>
        <div style={styles.eyebrow}>Partnership Intelligence Report</div>
        <h1 style={styles.title}>{m.sector}</h1>
        <div style={styles.metaRow}>
          <span><strong>Prepared by:</strong> {m.prepared_by}</span>
          <span><strong>Date:</strong> {m.date}</span>
          <span style={styles.versionPill}>{m.version}</span>
        </div>

        {/* Verification summary banner */}
        {v && (
          <div style={styles.verifyBanner}>
            <span style={styles.verifyStat}>
              <strong>{v.verified}</strong> / {v.total_claims} claims double-sourced
            </span>
            {v.unverified > 0 && (
              <span style={{ ...styles.verifyStat, color: '#b91c1c' }}>
                <strong>{v.unverified}</strong> flagged for analyst review
              </span>
            )}
            <span style={styles.modeBadge}>FREE TIER · SEC + Trials + PubMed</span>
          </div>
        )}
      </header>

      {/* SECTION 1 */}
      <section style={styles.section}>
        <H2 n={1} title="Sector Overview" />

        <H3>1.1 Sector Definition and Scale</H3>
        <Claim {...data.section1_overview.definition} />
        <Claim {...data.section1_overview.scale} />

        <H3>1.2 Why This Sector Now</H3>
        {data.section1_overview.why_now?.length ? (
          <ul style={styles.list}>
            {data.section1_overview.why_now.map((s, i) => (
              <li key={i} style={styles.li}>
                {s.signal}
                <Cite urls={s.sources} />
              </li>
            ))}
          </ul>
        ) : <Empty label="No signals identified." />}

        <H3>1.3 NC-Specific Industry Context</H3>
        <Claim {...data.section1_overview.nc_context} />

        <H3>1.4 UNC Schools and Centers Active in This Sector</H3>
        {data.section1_overview.unc_units?.length ? (
          <Table
            headers={['UNC Unit', 'Focus', 'Source']}
            rows={data.section1_overview.unc_units.map((u) => [
              <strong key="u">{u.unit}</strong>,
              u.focus,
              <SourceLink url={u.url} />,
            ])}
          />
        ) : <Empty label="No UNC units identified." />}
      </section>

      {/* SECTION 2 */}
      <section style={styles.section}>
        <H2 n={2} title="Internal Mapping" />

        <H3>2.1 Known UNC Partnerships in This Sector</H3>
        {data.section2_internal_mapping.known_partnerships?.length ? (
          <Table
            headers={['Company', 'UNC Unit', 'Type', 'Active?', 'Ref.']}
            rows={data.section2_internal_mapping.known_partnerships.map((p) => [
              p.company, p.unc_unit, p.relationship_type, p.active,
              <Cite key="s" urls={p.sources} />,
            ])}
          />
        ) : <Empty label="None identified." />}

        <H3>2.2 UNC Faculty with Verified Sector Expertise</H3>
        {data.section2_internal_mapping.unc_faculty?.length ? (
          <Table
            headers={['Faculty', 'School', 'Research Focus', 'Ref.']}
            rows={data.section2_internal_mapping.unc_faculty.map((f) => [
              <strong key="n">{f.name}</strong>, f.school, f.research_focus,
              <Cite key="s" urls={f.sources} />,
            ])}
          />
        ) : <Empty label="None identified." />}

        <H3>2.3 UNC Data Assets Relevant to This Sector</H3>
        {data.section2_internal_mapping.data_assets?.length ? (
          <Table
            headers={['Dataset', 'Description', 'Held By', 'Ref.']}
            rows={data.section2_internal_mapping.data_assets.map((d) => [
              <strong key="n">{d.name}</strong>, d.description, d.held_by,
              <Cite key="s" urls={d.sources} />,
            ])}
          />
        ) : <Empty label="None identified." />}

        <H3>2.4 Relationship Risk Flags</H3>
        {data.section2_internal_mapping.risk_flags?.length ? (
          <Table
            headers={['Company', 'Risk', 'Ref.']}
            rows={data.section2_internal_mapping.risk_flags.map((r) => [
              <strong key="n">{r.company}</strong>, r.risk,
              <Cite key="s" urls={r.sources} />,
            ])}
          />
        ) : <Empty label="No risks flagged." />}
      </section>

      {/* SECTION 3 */}
      <section style={styles.section}>
        <H2 n={3} title="Company Selection" />

        <H3>3.2 Companies Selected</H3>
        {data.section3_selection.selected?.length ? (
          <Table
            headers={['Company', 'UNC Alignment', 'Existing Tie', 'Ref.']}
            rows={data.section3_selection.selected.map((s) => [
              <strong key="n">{s.company}</strong>, s.unc_alignment, s.existing_tie,
              <Cite key="s" urls={s.sources} />,
            ])}
          />
        ) : <Empty label="No selections recorded." />}

        <H3>3.3 Companies Reviewed and Excluded</H3>
        {data.section3_selection.excluded?.length ? (
          <Table
            headers={['Company', 'Reason', 'Ref.']}
            rows={data.section3_selection.excluded.map((s) => [
              s.company, s.reason, <Cite key="s" urls={s.sources} />,
            ])}
          />
        ) : <Empty label="No exclusions recorded." />}
      </section>

      {/* SECTION 4 — Company Profiles */}
      <section style={styles.section}>
        <H2 n={4} title="Company Profiles" />
        {data.section4_profiles?.map((p, i) => (
          <div key={i} style={styles.profileCard}>
            <div style={styles.profileHeader}>
              <h3 style={styles.profileTitle}>{p.company_name}</h3>
              <div style={styles.profileFlags}>
                <span style={{ ...styles.flag, background: '#0a0a0a', color: '#fff' }}>
                  {p.partnership_type}
                </span>
                <span style={{
                  ...styles.flag,
                  background: p.existing_unc_tie ? '#fef3c7' : '#f3f4f6',
                  color: p.existing_unc_tie ? '#92400e' : '#374151',
                }}>
                  {p.existing_unc_tie ? 'Existing UNC tie' : 'No UNC tie'}
                </span>
              </div>
            </div>

            <Claim {...p.overview} />

            <H3>Company Facts (SEC EDGAR + XBRL)</H3>
            <Table
              headers={['Field', 'Value', 'Source']}
              rows={Object.entries(p.facts || {}).map(([k, v]) => [
                <span key="k" style={styles.factKey}>{k.replace(/_/g, ' ')}</span>,
                v.value,
                <SourceLink url={v.source} />,
              ])}
            />

            {p.sec_filings && (
              <>
                <H3>Recent SEC Filings</H3>
                <div style={styles.filingsWrap}>
                  {Object.entries(p.sec_filings)
                    .filter(([, list]) => Array.isArray(list) && list.length > 0)
                    .map(([formLabel, list]) => (
                      <div key={formLabel} style={styles.filingsGroup}>
                        <div style={styles.filingsForm}>{formLabel}</div>
                        <ul style={styles.filingsList}>
                          {list.map((f, i) => (
                            <li key={i} style={styles.filingsItem}>
                              <a href={f.url} target="_blank" rel="noreferrer" style={styles.filingsLink}>
                                {f.date || 'undated'}
                              </a>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                </div>
              </>
            )}

            <H3>Pipeline and Platform</H3>
            {p.pipeline?.length ? (
              <Table
                headers={['Program', 'Indication', 'Stage', 'Ref.']}
                rows={p.pipeline.map((r) => [
                  <strong key="n">{r.program}</strong>, r.indication,
                  <span key="s" style={styles.stagePill}>{r.stage}</span>,
                  <Cite urls={r.sources} />,
                ])}
              />
            ) : <Empty label="No pipeline programs documented." />}

            <H3>External Partnering History</H3>
            {p.partnering_history?.length ? (
              <Table
                headers={['Partner', 'Deal Type', 'Year', 'Ref.']}
                rows={p.partnering_history.map((r) => [
                  r.partner, r.deal_type, r.year,
                  <Cite key="s" urls={r.sources} />,
                ])}
              />
            ) : <Empty label="No documented external partnerships." />}

            <H3>Pipeline Alignment with UNC</H3>
            {p.unc_alignment?.length ? (
              <div style={styles.alignWrap}>
                {p.unc_alignment.map((a, j) => (
                  <div key={j} style={styles.alignCard}>
                    <div style={styles.alignHeader}>
                      <span style={styles.alignSide}>{a.company_program}</span>
                      <span style={styles.alignArrow}>→</span>
                      <span style={styles.alignSide}>{a.unc_unit}</span>
                    </div>
                    <p style={styles.alignFact}><strong>Company:</strong> {a.company_fact}</p>
                    <p style={styles.alignFact}><strong>UNC:</strong> {a.unc_fact}</p>
                    <p style={styles.alignFact}><strong>Why it matters:</strong> {a.rationale}<Cite urls={a.sources} /></p>
                  </div>
                ))}
              </div>
            ) : <Empty label="No UNC alignments identified." />}

            <H3>What UNC Can Offer</H3>
            {p.what_unc_offers?.length ? (
              <Table
                headers={['Offering', 'Description', 'Ref.']}
                rows={p.what_unc_offers.map((r) => [
                  <strong key="n">{r.offering}</strong>, r.description,
                  <Cite key="s" urls={r.sources} />,
                ])}
              />
            ) : <Empty label="None documented." />}

            <H3>Key Recent Signals</H3>
            {p.signals?.length ? (
              <ul style={styles.list}>
                {p.signals.map((s, j) => (
                  <li key={j} style={styles.li}>
                    {s.signal}<Cite urls={s.sources} />
                  </li>
                ))}
              </ul>
            ) : <Empty label="No recent signals documented." />}
          </div>
        ))}
      </section>

      {/* SECTION 5 */}
      <section style={styles.section}>
        <H2 n={5} title="Value Proposition" />

        <H3>5.1 UNC Data Assets</H3>
        {data.section5_value_prop.data_assets?.length ? (
          <Table
            headers={['Dataset', 'Description', 'Relevance', 'Ref.']}
            rows={data.section5_value_prop.data_assets.map((d) => [
              <strong key="n">{d.name}</strong>, d.description, d.relevance,
              <Cite key="s" urls={d.sources} />,
            ])}
          />
        ) : <Empty label="None documented." />}

        <H3>5.2 UNC Research Capacity</H3>
        {data.section5_value_prop.research_capacity?.length ? (
          <Table
            headers={['Name', 'Role', 'Expertise', 'Ref.']}
            rows={data.section5_value_prop.research_capacity.map((d) => [
              <strong key="n">{d.name}</strong>, d.role, d.expertise,
              <Cite key="s" urls={d.sources} />,
            ])}
          />
        ) : <Empty label="None documented." />}

        <H3>5.3 Talent Pipeline</H3>
        {data.section5_value_prop.talent_pipeline?.length ? (
          <Table
            headers={['Program', 'School', 'Output', 'Ref.']}
            rows={data.section5_value_prop.talent_pipeline.map((d) => [
              <strong key="n">{d.program}</strong>, d.school, d.output,
              <Cite key="s" urls={d.sources} />,
            ])}
          />
        ) : <Empty label="None documented." />}

        <H3>5.4 NC Access and Infrastructure</H3>
        {data.section5_value_prop.nc_access?.length ? (
          <Table
            headers={['Asset', 'Description', 'Ref.']}
            rows={data.section5_value_prop.nc_access.map((d) => [
              <strong key="n">{d.asset}</strong>, d.description,
              <Cite key="s" urls={d.sources} />,
            ])}
          />
        ) : <Empty label="None documented." />}

        <H3>5.6 Partnership Models Available</H3>
        <Table
          headers={['Model', 'Description', 'UNC Unit']}
          rows={(data.section5_value_prop.partnership_models || []).map((d) => [
            <strong key="n">{d.model}</strong>, d.description, d.unit,
          ])}
        />
      </section>

      {/* SECTION 6 */}
      <section style={styles.section}>
        <H2 n={6} title="Talking Points" />

        <H3>Sector Opening</H3>
        <Claim {...data.section6_talking_points.sector_opening} />

        {data.section6_talking_points.companies?.map((c, i) => (
          <div key={i} style={styles.tpCard}>
            <h4 style={styles.tpCompany}>{c.company}</h4>
            <div style={styles.tpPoint}>
              <span style={styles.tpLabel}>1 — Know the company</span>
              <Claim {...c.know_company} />
            </div>
            <div style={styles.tpPoint}>
              <span style={styles.tpLabel}>2 — Know their pipeline</span>
              <Claim {...c.know_pipeline} />
            </div>
            <div style={styles.tpPoint}>
              <span style={styles.tpLabel}>3 — Know their moves</span>
              <Claim {...c.know_moves} />
            </div>
            <div style={styles.tpPoint}>
              <span style={{ ...styles.tpLabel, color: '#0a0a0a', fontWeight: 700 }}>4 — UNC hook</span>
              <Claim {...c.unc_hook} />
            </div>
          </div>
        ))}
      </section>

      {/* Section 7 (verification checklist) is computed by the backend for
          every report but intentionally not rendered to the public page. */}

      {/* REFERENCES — AMA */}
      {citations.list.length > 0 && (
        <section style={styles.section}>
          <H2 n={7} title="References" />
          <p style={styles.refNote}>Citations follow AMA Manual of Style (11th ed.).</p>
          <ol style={styles.refList}>
            {citations.list.map((r) => (
              <li key={r.id} id={`ref-${r.id}`} style={styles.refItem}>
                {r.ama.replace(r.url, '')}
                <a href={r.url} target="_blank" rel="noreferrer" style={styles.refLink}>
                  {r.url}
                </a>
              </li>
            ))}
          </ol>
        </section>
      )}
    </article>
    </CitationCtx.Provider>
  );
}

const styles: Record<string, CSSProperties> = {
  article: { paddingBottom: 120 },
  header: {
    borderBottom: '1px solid #e5e5e5',
    paddingBottom: 24,
    marginBottom: 32,
  },
  eyebrow: {
    fontSize: 11,
    letterSpacing: '0.22em',
    color: '#999',
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  title: {
    fontSize: 'clamp(36px, 5vw, 56px)',
    fontWeight: 700,
    letterSpacing: '-0.03em',
    lineHeight: 1.05,
  },
  metaRow: {
    marginTop: 14,
    display: 'flex',
    flexWrap: 'wrap',
    gap: 16,
    fontSize: 13,
    color: '#666',
    alignItems: 'center',
  },
  versionPill: {
    padding: '2px 8px',
    background: '#fef3c7',
    color: '#92400e',
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.06em',
  },
  verifyBanner: {
    marginTop: 16,
    padding: '12px 16px',
    background: '#fafafa',
    border: '1px solid #eee',
    borderRadius: 10,
    display: 'flex',
    gap: 24,
    flexWrap: 'wrap',
    fontSize: 13,
    color: '#374151',
  },
  verifyStat: { fontSize: 13 },
  modeBadge: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.08em',
    color: '#166534',
    background: '#dcfce7',
    padding: '2px 8px',
    borderRadius: 999,
  },
  section: { marginTop: 56 },
  h2: {
    fontSize: 24,
    fontWeight: 700,
    letterSpacing: '-0.02em',
    marginBottom: 20,
    display: 'flex',
    alignItems: 'baseline',
    gap: 12,
  },
  h2Num: {
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: '0.15em',
    color: '#bbb',
  },
  h3: {
    fontSize: 14,
    fontWeight: 600,
    letterSpacing: '0.04em',
    color: '#0a0a0a',
    textTransform: 'uppercase',
    marginTop: 28,
    marginBottom: 12,
  },
  claim: {
    fontSize: 15,
    lineHeight: 1.65,
    color: '#1f2937',
    marginBottom: 12,
  },
  list: { listStyle: 'none', padding: 0, margin: 0 },
  li: {
    fontSize: 15,
    lineHeight: 1.6,
    color: '#1f2937',
    paddingLeft: 18,
    position: 'relative',
    marginBottom: 10,
  },
  empty: {
    fontSize: 13,
    color: '#999',
    fontStyle: 'italic',
    padding: '8px 0',
  },
  tableWrap: { overflowX: 'auto', borderRadius: 10, border: '1px solid #eee' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: {
    textAlign: 'left',
    padding: '10px 12px',
    background: '#fafafa',
    color: '#666',
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
  },
  td: { padding: '10px 12px', color: '#1f2937', verticalAlign: 'top', lineHeight: 1.5 },
  profileCard: {
    border: '1px solid #eee',
    borderRadius: 14,
    padding: 24,
    marginBottom: 24,
    background: '#fff',
  },
  profileHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
    flexWrap: 'wrap',
    gap: 12,
  },
  profileTitle: {
    fontSize: 28,
    fontWeight: 700,
    letterSpacing: '-0.02em',
  },
  profileFlags: { display: 'flex', gap: 8 },
  flag: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.06em',
    padding: '4px 10px',
    borderRadius: 999,
  },
  factKey: { color: '#666', textTransform: 'capitalize', fontSize: 12 },
  filingsWrap: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
    gap: 12,
    marginTop: 4,
  },
  filingsGroup: {
    border: '1px solid #eee',
    borderRadius: 10,
    padding: 12,
    background: '#fafafa',
  },
  filingsForm: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.06em',
    color: '#1e40af',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  filingsList: { listStyle: 'none', padding: 0, margin: 0 },
  filingsItem: { fontSize: 12, padding: '2px 0', color: '#374151' },
  filingsLink: { color: '#1e40af', textDecoration: 'none' },
  stagePill: {
    fontSize: 11,
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: 999,
    background: '#f3f4f6',
    color: '#374151',
  },
  alignWrap: { display: 'flex', flexDirection: 'column', gap: 12 },
  alignCard: {
    background: '#fafafa',
    border: '1px solid #eee',
    borderRadius: 10,
    padding: 14,
  },
  alignHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
    flexWrap: 'wrap',
  },
  alignSide: {
    fontSize: 13,
    fontWeight: 600,
    padding: '4px 10px',
    background: '#fff',
    border: '1px solid #e5e5e5',
    borderRadius: 999,
  },
  alignArrow: { color: '#999', fontSize: 14 },
  alignFact: { fontSize: 13, lineHeight: 1.6, color: '#1f2937', marginTop: 4 },
  tpCard: {
    border: '1px solid #eee',
    borderRadius: 12,
    padding: 18,
    marginTop: 16,
    background: '#fff',
  },
  tpCompany: { fontSize: 18, fontWeight: 700, marginBottom: 12, letterSpacing: '-0.01em' },
  tpPoint: { marginTop: 10 },
  tpLabel: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.08em',
    color: '#999',
    textTransform: 'uppercase',
    display: 'block',
    marginBottom: 4,
  },
  checklist: { listStyle: 'none', padding: 0 },
  checkItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '10px 0',
    fontSize: 14,
    borderBottom: '1px solid #f5f5f5',
  },
  checkbox: {
    width: 18,
    height: 18,
    border: '1.5px solid #0a0a0a',
    borderRadius: 4,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff',
    fontSize: 12,
    fontWeight: 700,
    flexShrink: 0,
  },
  refList: { paddingLeft: 24, color: '#374151', fontSize: 13, lineHeight: 1.7 },
  refItem: { marginBottom: 6 },
  refLink: { color: '#0a0a0a', textDecoration: 'underline', wordBreak: 'break-all' },
  refNote: { fontSize: 12, color: '#999', marginBottom: 12, fontStyle: 'italic' },
  cite: {
    fontSize: 10,
    color: '#1e40af',
    fontWeight: 600,
    marginLeft: 2,
    verticalAlign: 'super',
    lineHeight: 1,
  },
  citeLink: { color: 'inherit', textDecoration: 'none' },
  sourceLink: { color: '#1e40af', textDecoration: 'none' },
};
