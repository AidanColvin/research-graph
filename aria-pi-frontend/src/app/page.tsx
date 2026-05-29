'use client';

import { useState } from 'react';
import Report, { ReportData } from '@/components/Report';
import Intro from '@/components/Intro';
import ExcelView from '@/components/ExcelView';
import SlidesView from '@/components/SlidesView';
import VisualsView from '@/components/VisualsView';

type View = 'report' | 'excel' | 'slides' | 'visuals';

// Small brand mark shown next to the wordmark (a node-graph glyph echoing the
// intro). Swap for an <img src="/logo.svg"> if you add a logo file.
function LogoMark() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="3.2" fill="#0a0a0a" />
      {[0, 60, 120, 180, 240, 300].map((deg) => {
        const r = deg * Math.PI / 180;
        const x = 12 + 8 * Math.cos(r), y = 12 + 8 * Math.sin(r);
        return (
          <g key={deg}>
            <line x1={12} y1={12} x2={x} y2={y} stroke="#0a0a0a" strokeWidth="0.9" />
            <circle cx={x} cy={y} r="2" fill="#faf9f5" stroke="#0a0a0a" strokeWidth="1" />
          </g>
        );
      })}
    </svg>
  );
}

type Status = 'idle' | 'running' | 'done' | 'error';

// Labels for the progress lines. These advance on a fixed cosmetic timer
// (STAGE_MS each) — they don't measure real backend progress. The genuine
// work runs in parallel and the report only loads once it actually returns;
// see run() and STAGE_MS below.
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

// How long the dot rests on each line as it travels down (cosmetic pacing).
// Kept short — 10 lines × 3s ≈ 30s — so the animation reliably finishes before
// the slower backend (22 companies) does, adding no artificial wait. Once the
// dot reaches the last line, it pulses until the real report data arrives, so
// the total wait equals the genuine backend time, not this timer.
const STAGE_MS = 3000;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

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
  // Plays the network-graph intro once on first load, then reveals the app.
  const [showIntro, setShowIntro] = useState(true);
  const [sector, setSector] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [stageIdx, setStageIdx] = useState(0);
  // Live "N of M companies analyzed" count from the real backend stream.
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [data, setData] = useState<ReportData | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Which tab is showing once a report is loaded (report is the default page 3).
  const [view, setView] = useState<View>('report');

  async function run() {
    if (!sector.trim() || status === 'running') return;
    setStatus('running');
    setError(null);
    setData(null);
    setStageIdx(0);
    setProgress(null);
    setView('report'); // a fresh report always opens on the Report page

    // Prefer the live progress stream (real backend events drive the dots).
    // If streaming is unavailable or fails before delivering the report, fall
    // back to the plain endpoint + cosmetic timer so a report still loads.
    const ok = await runStreaming();
    if (!ok) await runFallback();
  }

  // Map a real backend signal to which progress line the dot should be on.
  // Lines 0–1 are setup, 2–7 track company data collection, 8 is verification,
  // 9 is final assembly.
  const DATA_FIRST = 2;   // first line driven by company completion
  const DATA_LINES = 6;   // lines 2..7 inclusive

  // Live-stream path: read Server-Sent Events and advance the dots on genuine
  // backend milestones. Returns true if it loaded the report, false to fall back.
  async function runStreaming(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 300_000);
      const res = await fetch('/api/run-pipeline-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sector }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        clearTimeout(timeout);
        return false;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let finalData: ReportData | null = null;
      let failed = false;

      const handle = (ev: any) => {
        if (ev.type === 'stage') {
          if (ev.key === 'resolved') {
            setProgress({ done: 0, total: ev.total || 0 });
            setStageIdx((p) => Math.max(p, 1));
          } else if (ev.key === 'building') {
            setStageIdx((p) => Math.max(p, 8));
          } else if (ev.key === 'verifying') {
            setStageIdx((p) => Math.max(p, 8));
          }
        } else if (ev.type === 'progress') {
          setProgress({ done: ev.done, total: ev.total });
          const frac = ev.total ? ev.done / ev.total : 0;
          const target = Math.min(
            DATA_FIRST + DATA_LINES - 1,
            DATA_FIRST + Math.floor(frac * DATA_LINES),
          );
          setStageIdx((p) => Math.max(p, target));
        } else if (ev.type === 'done') {
          finalData = (ev.report ?? null) as ReportData | null;
          setStageIdx(STAGES.length - 1);
        } else if (ev.type === 'error') {
          failed = true;
        }
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const frames = buf.split('\n\n');
        buf = frames.pop() ?? '';
        for (const frame of frames) {
          const line = frame.split('\n').find((l) => l.startsWith('data:'));
          if (!line) continue;
          try {
            handle(JSON.parse(line.slice(5).trim()));
          } catch {
            /* ignore malformed frame */
          }
        }
      }
      clearTimeout(timeout);

      if (finalData && !failed) {
        setData(finalData);
        setStatus('done');
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  // Fallback path: plain request + cosmetic line timer (original behavior).
  async function runFallback(): Promise<void> {
    setStageIdx(0);
    setProgress(null);

    const result: { data?: ReportData; error?: string } = {};
    const fetchPromise = (async () => {
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
        result.data = json.data as ReportData;
      } catch (e: any) {
        result.error = e?.name === 'AbortError'
          ? 'The engine took too long to respond. Try again or check the backend.'
          : e?.message ?? 'Something went wrong.';
      }
    })();

    for (let i = 0; i < STAGES.length; i++) {
      setStageIdx(i);
      await sleep(STAGE_MS);
    }
    await fetchPromise;

    if (result.error) {
      setError(result.error);
      setStatus('error');
    } else {
      setData(result.data ?? null);
      setStatus('done');
    }
  }

  function reset() {
    setStatus('idle');
    setData(null);
    setError(null);
    setSector('');
    setStageIdx(0);
    setProgress(null);
    setView('report');
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

  // Intro plays first; once it finishes (or is skipped) the original app shows.
  if (showIntro) {
    return <Intro onDone={() => setShowIntro(false)} />;
  }

  const NAV: { key: View | 'home'; label: string }[] = [
    { key: 'home', label: 'Home' },
    { key: 'report', label: 'Report' },
    { key: 'visuals', label: 'Visualize' },
    { key: 'excel', label: 'Excel' },
    { key: 'slides', label: 'Slide Deck' },
  ];

  return (
    <main style={styles.main}>
      <header style={{ ...styles.header, ...(status === 'done' ? styles.headerSticky : {}) }}>
        <button
          onClick={reset}
          style={styles.brandBtn}
          title={status === 'done' ? 'Home — new search' : undefined}
        >
          <LogoMark />
          <span style={styles.brand}>map</span>
        </button>
        {status === 'done' && (
          <nav style={styles.nav}>
            {NAV.map((item) => {
              const active = item.key !== 'home' && view === item.key;
              return (
                <button
                  key={item.key}
                  onClick={() => (item.key === 'home' ? reset() : setView(item.key as View))}
                  style={{ ...styles.navItem, ...(active ? styles.navItemActive : {}) }}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>
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
              // The dot trail: every line the dot has reached (current + passed)
              // is black; lines still ahead are grey. The current line is bold.
              const reached = i <= stageIdx;
              const active = i === stageIdx;
              // The active line's dot pulses to show work is happening there
              // right now (driven by real stream events, or the fallback timer).
              const pulsing = active;
              return (
                <div key={s} style={styles.stepRow}>
                  <div style={{
                    ...styles.stepDot,
                    background: reached ? '#0a0a0a' : '#e5e5e5',
                    animation: pulsing ? 'pulse 1.2s ease-in-out infinite' : undefined,
                  }} />
                  <div style={{
                    ...styles.stepText,
                    color: reached ? '#0a0a0a' : '#bdbdbd',
                    fontWeight: active ? 600 : 400,
                  }}>
                    {s}
                  </div>
                </div>
              );
            })}
          </div>
          {progress && progress.total > 0 ? (
            <p style={{ ...styles.runHint, color: '#666', marginTop: 28 }}>
              Analyzed <strong>{progress.done}</strong> of {progress.total} companies
              — pulling live SEC EDGAR, ClinicalTrials.gov, PubMed, and NIH data,
              then verifying every claim against ≥2 sources.
            </p>
          ) : (
            <p style={styles.runHint}>
              Pulling live data from SEC EDGAR (financials + filings),
              ClinicalTrials.gov, PubMed, and NIH Reporter across up to 22 companies.
              Thoroughness over speed — expect 1–3 minutes.
            </p>
          )}
        </section>
      )}

      {status === 'done' && data && view === 'report' && <Report data={data} />}
      {status === 'done' && data && view === 'visuals' && <VisualsView data={data} />}
      {status === 'done' && data && view === 'excel' && <ExcelView data={data} />}
      {status === 'done' && data && view === 'slides' && <SlidesView data={data} />}

      {status === 'error' && (
        <section style={styles.hero}>
          <div style={styles.errLabel}>Couldn’t reach the engine</div>
          <div style={styles.errMsg}>{error}</div>
          <button onClick={reset} style={styles.linkBtn}>← Try again</button>
        </section>
      )}

      <footer style={styles.footer}>map · partnership intelligence</footer>
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
    gap: 12,
    flexWrap: 'wrap',
  },
  headerSticky: {
    position: 'sticky',
    top: 0,
    zIndex: 30,
    background: 'rgba(255,255,255,0.92)',
    backdropFilter: 'saturate(180%) blur(8px)',
    WebkitBackdropFilter: 'saturate(180%) blur(8px)',
    borderBottom: '1px solid #eee',
    paddingTop: 12,
    paddingBottom: 12,
    marginBottom: 8,
  },
  brandBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: 0,
  },
  brand: { fontSize: 14, fontWeight: 600, letterSpacing: '0.18em' },
  nav: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    flexWrap: 'wrap',
  },
  navItem: {
    fontSize: 13.5,
    fontWeight: 500,
    color: '#666',
    padding: '7px 14px',
    borderRadius: 999,
    border: '1px solid transparent',
    cursor: 'pointer',
    background: 'none',
  },
  navItemActive: {
    color: '#0a0a0a',
    fontWeight: 600,
    background: '#f3f4f6',
    border: '1px solid #e5e5e5',
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
