'use client';

import { useState } from 'react';
import Report, { ReportData } from '@/components/Report';

type Status = 'idle' | 'running' | 'done' | 'error';

const STAGES = [
  'Sector overview',
  'Internal mapping',
  'Company selection',
  'Profiles',
  'Verification',
];

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

    const tick = setInterval(() => {
      setStageIdx((i) => (i < STAGES.length - 1 ? i + 1 : i));
    }, 1800);

    try {
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120_000);
      const res = await fetch(`${baseUrl}/run-pipeline`, {
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

  return (
    <main style={styles.main}>
      <header style={styles.header}>
        <div style={styles.brand}>ARIA</div>
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
            <input
              autoFocus
              value={sector}
              onChange={(e) => setSector(e.target.value)}
              placeholder="Oncology"
              style={styles.input}
            />
            <button
              type="submit"
              disabled={!sector.trim()}
              style={{ ...styles.cta, opacity: sector.trim() ? 1 : 0.3 }}
            >
              Generate →
            </button>
          </form>

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
            {STAGES.map((s, i) => (
              <div key={s} style={styles.stepRow}>
                <div style={{
                  ...styles.stepDot,
                  background: i <= stageIdx ? '#0a0a0a' : '#e5e5e5',
                }} />
                <div style={{
                  ...styles.stepText,
                  color: i <= stageIdx ? '#0a0a0a' : '#bdbdbd',
                  fontWeight: i === stageIdx ? 600 : 400,
                }}>
                  {s}
                </div>
              </div>
            ))}
          </div>
          <p style={styles.runHint}>
            Pulling live data from SEC EDGAR, ClinicalTrials.gov, and PubMed.
            This takes 20–45 seconds.
          </p>
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
  input: { flex: 1, fontSize: 28, fontWeight: 400, letterSpacing: '-0.01em' },
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
