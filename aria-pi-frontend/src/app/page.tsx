'use client';

import { useState } from 'react';
import Report, { ReportData } from '@/components/Report';

type Status = 'idle' | 'running' | 'done' | 'error';

// Ten stages × 10 s = 100 s of visible animation, covering the full
// backend run (22 companies, SEC + Trials + NIH + PubMed + alumni).
const STAGES = [
  'Sector overview',
  'Company selection',
  'SEC EDGAR data',
  'Clinical trials',
  'NIH grants & PubMed',
  'NC company profiles',
  'Leadership analysis',
  'Pipeline alignment',
  'Verification',
  'Report assembly',
];

// Canonical sectors the backend understands — used for inline autocomplete.
const SECTORS = [
  'Healthcare', 'Oncology', 'Biotech', 'Pharmaceutical', 'Ag-Bio', 'Medtech',
  'Rural Health', 'Health IT', 'Technology', 'Software', 'Artificial Intelligence',
  'Semiconductors', 'Cybersecurity', 'Cloud Computing', 'Fintech',
  'Quantum Computing', 'Robotics', 'Telecom', 'Climate Tech', 'Energy',
  'Automotive', 'Aerospace', 'Consumer', 'Retail', 'Financial Services',
  'Finance', 'Insurance', 'Industrial',
];

// First sector whose name starts with what's typed (case-insensitive).
function suggestFor(input: string): string {
  const q = input.trim().toLowerCase();
  if (!q) return '';
  const m = SECTORS.find(
    (s) => s.toLowerCase().startsWith(q) && s.toLowerCase() !== q
  );
  return m ?? '';
}

export default function Home() {
  const [sector, setSector] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [stageIdx, setStageIdx] = useState(0);
  const [data, setData] = useState<ReportData | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (!sector.trim() || status === 'running') return;
    setStatus('running');
    setError(null);
    setData(null);
    setStageIdx(0);

    // Pace the visible stages to the real backend work (live SEC/PubMed/NIH/
    // trials fetches take tens of seconds). Advancing slowly keeps the progress
    // screen honest instead of racing to "done" while data is still loading.
    const tick = setInterval(() => {
      setStageIdx((i) => (i < STAGES.length - 1 ? i + 1 : i));
    }, 10000);

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 300_000);
      const res = await fetch('/api/run-pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sector }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) throw new Error(`Pipeline failed (${res.status})`);
      const json = await res.json();
      clearInterval(tick);
      setStageIdx(STAGES.length - 1);
      setData(json.data as ReportData);
      setStatus('done');
    } catch (e: any) {
      clearInterval(tick);
      const msg = e?.name === 'AbortError'
        ? 'The engine took too long to respond. Try again or check the backend.'
        : e?.message ?? 'Something went wrong.';
      setError(msg);
      setStatus('error');
    }
  }

  function reset() {
    setStatus('idle');
    setData(null);
    setError(null);
    setSector('');
    setStageIdx(0);
  }

  // Inline autocomplete: ghost suffix shown after what the user typed.
  const suggestion = suggestFor(sector);
  const suffix = suggestion ? suggestion.slice(sector.length) : '';

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    const atEnd = e.currentTarget.selectionStart === sector.length;
    if (e.key === 'Tab' && suffix) {
      e.preventDefault();
      setSector(suggestion);
    } else if (e.key === 'ArrowRight' && suffix && atEnd) {
      e.preventDefault();
      setSector(suggestion);
    } else if (e.key === 'Enter' && suffix) {
      // First Enter completes the word; a second Enter (no suffix) submits.
      e.preventDefault();
      setSector(suggestion);
    }
  }

  return (
    <main style={styles.main}>
      <header style={styles.header}>
        <div style={styles.brand}>map</div>
        {status === 'done' && (
          <button onClick={reset} style={styles.newSearch}>← New search</button>
        )}
      </header>

      {status === 'idle' && (
        <section style={styles.hero}>
          <h1 style={styles.title}>
            Research intelligence,<br />
            <span style={styles.titleAccent}>instantly.</span>
          </h1>
          <p style={styles.sub}>Name a sector. Get a source-cited partnership report.</p>

          <form onSubmit={(e) => { e.preventDefault(); run(); }} style={styles.inputWrap}>
            <div style={styles.inputField}>
              <div aria-hidden style={styles.ghost}>
                <span style={styles.ghostTyped}>{sector}</span>
                <span style={styles.ghostSuffix}>{suffix}</span>
              </div>
              <input
                autoFocus
                value={sector}
                onChange={(e) => setSector(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Oncology"
                style={styles.input}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <button
              type="submit"
              disabled={!sector.trim()}
              style={{ ...styles.cta, opacity: sector.trim() ? 1 : 0.3 }}
            >
              Generate →
            </button>
          </form>

          {suffix && (
            <p style={styles.tabHint}>
              Press <kbd style={styles.kbd}>Tab</kbd> to complete “{suggestion}”
            </p>
          )}

          <div style={styles.examples}>
            {['Oncology', 'Quantum Computing', 'Climate Tech', 'Biotech', 'Rural Health'].map((s) => (
              <button key={s} onClick={() => setSector(s)} style={styles.chip}>{s}</button>
            ))}
          </div>

          <p style={styles.disclaimer}>
            Free tier. No API keys. Every claim cites SEC filings, PubMed,
            or ClinicalTrials.gov. No Wikipedia. No aggregators.
          </p>
        </section>
      )}

      {status === 'running' && (
        <section style={styles.hero}>
          <div style={styles.runLabel}>Analyzing</div>
          <div style={styles.runSector}>{sector}</div>
          <div style={styles.steps}>
            {STAGES.map((s, i) => {
              const done = i < stageIdx;
              const active = i === stageIdx;
              const pending = i > stageIdx;
              const lastAndWaiting = active && i === STAGES.length - 1;
              return (
                <div key={s} style={styles.stepRow}>
                  <div style={{
                    ...styles.stepDot,
                    background: (done || active) ? '#0a0a0a' : '#e5e5e5',
                    opacity: lastAndWaiting ? undefined : 1,
                    animation: lastAndWaiting ? 'pulse 1.2s ease-in-out infinite' : undefined,
                  }} />
                  <div style={{
                    ...styles.stepText,
                    color: pending ? '#bdbdbd' : '#0a0a0a',
                    fontWeight: active ? 600 : 400,
                  }}>
                    {s}{done ? ' ✓' : ''}
                  </div>
                </div>
              );
            })}
          </div>
          {stageIdx === STAGES.length - 1 && (
            <p style={{ ...styles.runHint, color: '#666', marginTop: 28 }}>
              Compiling {sector} report — assembling up to 22 company profiles, NC-based companies, and UNC partnership data. This can take 2–3 minutes.
            </p>
          )}
          {stageIdx < STAGES.length - 1 && (
            <p style={styles.runHint}>
              Pulling live data from SEC EDGAR (financials + filings),
              ClinicalTrials.gov, PubMed, and NIH Reporter across up to 22 companies.
              Thoroughness over speed — expect 1–3 minutes.
            </p>
          )}
        </section>
      )}

      {status === 'done' && data && <Report data={data} />}

      {status === 'error' && (
        <section style={styles.hero}>
          <div style={styles.errLabel}>Couldn’t reach the engine</div>
          <div style={styles.errMsg}>{error}</div>
          <button onClick={reset} style={styles.linkBtn}>← Try again</button>
        </section>
      )}

      <footer style={styles.footer}>Innovate Carolina · UNC Chapel Hill</footer>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  main: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    padding: '32px 24px',
    maxWidth: 960,
    margin: '0 auto',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
  },
  brand: { fontSize: 14, fontWeight: 600, letterSpacing: '0.18em' },
  newSearch: {
    fontSize: 13,
    color: '#666',
    padding: '6px 12px',
    border: '1px solid #e5e5e5',
    borderRadius: 999,
  },
  hero: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    paddingTop: 60,
    paddingBottom: 80,
  },
  title: {
    fontSize: 'clamp(40px, 7vw, 72px)',
    lineHeight: 1.05,
    fontWeight: 700,
    letterSpacing: '-0.03em',
  },
  titleAccent: { color: '#9a9a9a' },
  sub: { fontSize: 18, color: '#666', marginTop: 20, fontWeight: 400 },
  inputWrap: {
    marginTop: 48,
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    borderBottom: '1px solid #0a0a0a',
    paddingBottom: 14,
  },
  inputField: { position: 'relative', flex: 1, display: 'flex', alignItems: 'center' },
  input: {
    width: '100%',
    fontSize: 28,
    fontWeight: 400,
    letterSpacing: '-0.01em',
    lineHeight: 1.3,
    padding: 0,
    background: 'transparent',
    position: 'relative',
    zIndex: 1,
  },
  ghost: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    display: 'flex',
    alignItems: 'center',
    fontSize: 28,
    fontWeight: 400,
    letterSpacing: '-0.01em',
    lineHeight: 1.3,
    padding: 0,
    whiteSpace: 'pre',
    pointerEvents: 'none',
    zIndex: 0,
    overflow: 'hidden',
  },
  ghostTyped: { color: 'transparent' },
  ghostSuffix: { color: '#c9c9c9' },
  tabHint: { marginTop: 14, fontSize: 13, color: '#999' },
  kbd: {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: 11,
    padding: '2px 6px',
    border: '1px solid #ddd',
    borderRadius: 4,
    background: '#fafafa',
    color: '#666',
  },
  cta: {
    fontSize: 16,
    fontWeight: 600,
    padding: '12px 20px',
    background: '#0a0a0a',
    color: '#fff',
    borderRadius: 999,
    transition: 'opacity 0.2s',
  },
  examples: { marginTop: 24, display: 'flex', flexWrap: 'wrap', gap: 8 },
  chip: {
    fontSize: 13,
    color: '#666',
    padding: '6px 12px',
    border: '1px solid #e5e5e5',
    borderRadius: 999,
  },
  disclaimer: {
    marginTop: 40,
    fontSize: 12,
    color: '#999',
    maxWidth: 520,
    lineHeight: 1.6,
  },
  runLabel: {
    fontSize: 12,
    letterSpacing: '0.2em',
    color: '#999',
    textTransform: 'uppercase',
  },
  runSector: {
    fontSize: 'clamp(36px, 6vw, 56px)',
    fontWeight: 700,
    letterSpacing: '-0.03em',
    marginTop: 8,
    marginBottom: 48,
  },
  steps: { display: 'flex', flexDirection: 'column', gap: 18 },
  stepRow: { display: 'flex', alignItems: 'center', gap: 16 },
  stepDot: { width: 8, height: 8, borderRadius: '50%', transition: 'background 0.3s' },
  stepText: { fontSize: 17, letterSpacing: '-0.01em', transition: 'color 0.3s' },
  runHint: {
    marginTop: 40,
    fontSize: 13,
    color: '#999',
    maxWidth: 480,
    lineHeight: 1.6,
  },
  errLabel: { fontSize: 24, fontWeight: 600, letterSpacing: '-0.02em' },
  errMsg: { marginTop: 8, fontSize: 15, color: '#999' },
  linkBtn: { marginTop: 24, fontSize: 15, color: '#666', alignSelf: 'flex-start' },
  footer: { fontSize: 12, color: '#bbb', letterSpacing: '0.05em', marginTop: 40 },
};
