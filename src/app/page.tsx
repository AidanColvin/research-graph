'use client';

import { useState } from 'react';

type Status = 'idle' | 'running' | 'done' | 'error';

const STAGES = ['Sector', 'Mapping', 'Profiling', 'Verification', 'Report'];

export default function Home() {
  const [sector, setSector] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [stageIdx, setStageIdx] = useState(0);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (!sector.trim() || status === 'running') return;
    setStatus('running');
    setError(null);
    setData(null);
    setStageIdx(0);

    const tick = setInterval(() => {
      setStageIdx((i) => (i < STAGES.length - 1 ? i + 1 : i));
    }, 700);

    try {
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const res = await fetch(`${baseUrl}/run-pipeline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sector }),
      });
      if (!res.ok) throw new Error(`Pipeline failed (${res.status})`);
      const json = await res.json();
      clearInterval(tick);
      setStageIdx(STAGES.length - 1);
      setData(json.data ?? json);
      setStatus('done');
    } catch (e: any) {
      clearInterval(tick);
      setError(e?.message ?? 'Something went wrong.');
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
      </header>

      <section style={styles.hero}>
        {status === 'idle' && (
          <>
            <h1 style={styles.title}>
              Research intelligence,
              <br />
              <span style={styles.titleAccent}>instantly.</span>
            </h1>
            <p style={styles.sub}>
              Name a sector. Get a source-cited partnership report.
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                run();
              }}
              style={styles.inputWrap}
            >
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
                style={{
                  ...styles.cta,
                  opacity: sector.trim() ? 1 : 0.3,
                }}
              >
                Generate →
              </button>
            </form>

            <div style={styles.examples}>
              {['Oncology', 'Quantum Computing', 'Climate Tech', 'Biotech'].map((s) => (
                <button key={s} onClick={() => setSector(s)} style={styles.chip}>
                  {s}
                </button>
              ))}
            </div>
          </>
        )}

        {status === 'running' && (
          <div style={styles.runWrap}>
            <div style={styles.runLabel}>Analyzing</div>
            <div style={styles.runSector}>{sector}</div>
            <div style={styles.steps}>
              {STAGES.map((s, i) => (
                <div key={s} style={styles.stepRow}>
                  <div
                    style={{
                      ...styles.stepDot,
                      background: i <= stageIdx ? '#0a0a0a' : '#e5e5e5',
                    }}
                  />
                  <div
                    style={{
                      ...styles.stepText,
                      color: i <= stageIdx ? '#0a0a0a' : '#bdbdbd',
                      fontWeight: i === stageIdx ? 600 : 400,
                    }}
                  >
                    {s}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {status === 'done' && data && (
          <div style={styles.resultWrap}>
            <div style={styles.resultLabel}>Report</div>
            <h2 style={styles.resultTitle}>
              {data.company_name || data.sector || sector}
            </h2>
            <div style={styles.resultCard}>
              <pre style={styles.pre}>{JSON.stringify(data, null, 2)}</pre>
            </div>
            <button onClick={reset} style={styles.linkBtn}>
              ← New search
            </button>
          </div>
        )}

        {status === 'error' && (
          <div style={styles.errWrap}>
            <div style={styles.errLabel}>Couldn’t reach the engine</div>
            <div style={styles.errMsg}>{error}</div>
            <button onClick={reset} style={styles.linkBtn}>
              ← Try again
            </button>
          </div>
        )}
      </section>

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
    maxWidth: 880,
    margin: '0 auto',
  },
  header: { paddingTop: 8 },
  brand: { fontSize: 14, fontWeight: 600, letterSpacing: '0.18em' },
  hero: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
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
  runWrap: { paddingTop: 40 },
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
  resultWrap: { paddingTop: 24 },
  resultLabel: {
    fontSize: 12,
    letterSpacing: '0.2em',
    color: '#999',
    textTransform: 'uppercase',
  },
  resultTitle: {
    fontSize: 'clamp(32px, 5vw, 48px)',
    fontWeight: 700,
    letterSpacing: '-0.03em',
    marginTop: 8,
    marginBottom: 24,
  },
  resultCard: {
    background: '#fafafa',
    border: '1px solid #eee',
    borderRadius: 12,
    padding: 20,
    maxHeight: 420,
    overflow: 'auto',
  },
  pre: {
    fontSize: 13,
    lineHeight: 1.6,
    fontFamily: 'SF Mono, Menlo, monospace',
    color: '#222',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  errWrap: { paddingTop: 24 },
  errLabel: { fontSize: 24, fontWeight: 600, letterSpacing: '-0.02em' },
  errMsg: { marginTop: 8, fontSize: 15, color: '#999' },
  linkBtn: { marginTop: 24, fontSize: 15, color: '#666' },
  footer: { fontSize: 12, color: '#bbb', letterSpacing: '0.05em' },
};
