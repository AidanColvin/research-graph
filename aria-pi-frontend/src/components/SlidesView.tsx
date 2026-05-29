'use client';

import React from 'react';
import { buildSlides, downloadPptx, type Slide } from '@/lib/report-slides';

export default function SlidesView({ data: rawData }: { data: any }) {
  const slides = React.useMemo(() => buildSlides(rawData), [rawData]);
  const [idx, setIdx] = React.useState(0);
  const [busy, setBusy] = React.useState(false);

  const go = React.useCallback((n: number) => setIdx((i) => Math.max(0, Math.min(slides.length - 1, i + n))), [slides.length]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go]);

  async function handle() {
    if (busy) return;
    try { setBusy(true); await downloadPptx(rawData); }
    catch (e) { console.error(e); alert('Sorry, the slide export failed. Please try again.'); }
    finally { setBusy(false); }
  }

  const s = slides[idx];

  return (
    <div style={styles.wrap}>
      <div style={styles.head}>
        <div>
          <div style={styles.eyebrow}>Presentation</div>
          <h1 style={styles.title}>Slide deck</h1>
        </div>
        <button onClick={handle} disabled={busy} style={styles.dl}>
          {busy ? 'Building…' : 'Download PowerPoint (.pptx)'}
        </button>
      </div>

      <div style={styles.stage}>
        <div style={styles.slide}>{renderSlide(s)}</div>
      </div>

      <div style={styles.controls}>
        <button onClick={() => go(-1)} disabled={idx === 0} style={styles.navBtn}>← Prev</button>
        <span style={styles.counter}>{idx + 1} / {slides.length}</span>
        <button onClick={() => go(1)} disabled={idx === slides.length - 1} style={styles.navBtn}>Next →</button>
      </div>

      <div style={styles.dots}>
        {slides.map((_, i) => (
          <button key={i} onClick={() => setIdx(i)} aria-label={`Slide ${i + 1}`}
            style={{ ...styles.dot, background: i === idx ? '#0a0a0a' : '#d4d4d4' }} />
        ))}
      </div>
    </div>
  );
}

function renderSlide(s: Slide) {
  if (!s) return null;
  if (s.kind === 'title') {
    return (
      <div style={{ ...styles.inner, background: '#0a0a0a', color: '#fff', justifyContent: 'center' }}>
        <div style={styles.titleSub}>{s.subtitle}</div>
        <div style={styles.titleBig}>{s.title}</div>
        {s.meta && <div style={styles.titleMeta}>{s.meta}</div>}
      </div>
    );
  }
  return (
    <div style={styles.inner}>
      <div style={styles.slideTitle}>{s.title}</div>
      {s.kind === 'text' && <p style={styles.body}>{s.body}</p>}
      {s.kind === 'metrics' && (
        <div style={styles.tileRow}>
          {s.tiles.map((t, i) => (
            <div key={i} style={styles.tile}>
              <div style={styles.tileVal}>{t.value}</div>
              <div style={styles.tileLbl}>{t.label}</div>
            </div>
          ))}
        </div>
      )}
      {s.kind === 'bars' && (
        <div style={{ width: '100%' }}>
          {s.subtitle && <div style={styles.subtle}>{s.subtitle}</div>}
          {(() => { const max = Math.max(...s.data.map((d) => d.value), 1); return s.data.map((d, i) => (
            <div key={i} style={styles.barRow}>
              <div style={styles.barLabel} title={d.label}>{d.label}</div>
              <div style={styles.barTrack}><div style={{ ...styles.barFill, width: `${Math.max(3, (d.value / max) * 100)}%` }} /></div>
              <div style={styles.barVal}>{d.display}</div>
            </div>
          )); })()}
        </div>
      )}
      {s.kind === 'pie' && <PieBig segments={s.segments} />}
      {s.kind === 'table' && (
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead><tr>{s.headers.map((h) => <th key={h} style={styles.th}>{h}</th>)}</tr></thead>
            <tbody>{s.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} style={styles.td}>{c}</td>)}</tr>)}</tbody>
          </table>
        </div>
      )}
      {s.kind === 'bullets' && (
        <ul style={styles.bullets}>{s.items.map((it, i) => <li key={i} style={styles.bullet}>{it}</li>)}</ul>
      )}
    </div>
  );
}

function PieBig({ segments }: { segments: { label: string; value: number; color: string }[] }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const R = 30; const C = 2 * Math.PI * R; let acc = 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 36, marginTop: 10 }}>
      <svg width={200} height={200} viewBox="0 0 120 120">
        <g transform="rotate(-90 60 60)">
          {segments.map((g, i) => {
            const frac = g.value / total; const dash = frac * C;
            const el = <circle key={i} cx={60} cy={60} r={R} fill="none" stroke={'#' + g.color} strokeWidth={60}
              strokeDasharray={`${dash} ${C - dash}`} strokeDashoffset={-acc * C} />;
            acc += frac; return el;
          })}
        </g>
      </svg>
      <div>
        {segments.map((g, i) => (
          <div key={i} style={styles.legendRow}>
            <span style={{ ...styles.swatch, background: '#' + g.color }} />
            {g.label}: <strong style={{ marginLeft: 4 }}>{g.value}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { maxWidth: 960, margin: '0 auto', padding: '8px 4px 80px' },
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 20, flexWrap: 'wrap', marginTop: 16, marginBottom: 20 },
  eyebrow: { fontSize: 11, letterSpacing: '0.22em', color: '#999', textTransform: 'uppercase', marginBottom: 10 },
  title: { fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: 700, letterSpacing: '-0.02em' },
  dl: { fontSize: 14, fontWeight: 600, color: '#fff', background: '#b45309', padding: '12px 18px', borderRadius: 999, whiteSpace: 'nowrap' },
  stage: { border: '1px solid #e5e5e5', borderRadius: 16, overflow: 'hidden', background: '#fff', boxShadow: '0 2px 20px rgba(0,0,0,0.05)' },
  slide: { width: '100%', aspectRatio: '16 / 9' as any, position: 'relative' },
  inner: { position: 'absolute', inset: 0, padding: 'clamp(24px, 4vw, 56px)', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  titleSub: { fontSize: 16, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#9a988f' },
  titleBig: { fontSize: 'clamp(36px, 6vw, 72px)', fontWeight: 700, letterSpacing: '-0.03em', marginTop: 12 },
  titleMeta: { position: 'absolute', bottom: 'clamp(24px,4vw,56px)', fontSize: 13, color: '#9a988f' },
  slideTitle: { fontSize: 'clamp(22px, 3vw, 32px)', fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 18 },
  body: { fontSize: 'clamp(16px, 2vw, 22px)', lineHeight: 1.55, color: '#1f2937' },
  subtle: { fontSize: 13, color: '#999', marginBottom: 14 },
  tileRow: { display: 'flex', flexWrap: 'wrap', gap: 16 },
  tile: { border: '1px solid #eee', borderRadius: 12, padding: '16px 22px', background: '#fafafa', minWidth: 130 },
  tileVal: { fontSize: 36, fontWeight: 700, letterSpacing: '-0.02em' },
  tileLbl: { fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#777', marginTop: 6 },
  barRow: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 },
  barLabel: { width: 160, fontSize: 14, color: '#374151', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flexShrink: 0 },
  barTrack: { flex: 1, height: 14, background: '#f0f0f0', borderRadius: 999, overflow: 'hidden' },
  barFill: { height: '100%', background: '#0a0a0a', borderRadius: 999 },
  barVal: { width: 80, textAlign: 'right', fontSize: 14, fontWeight: 600, flexShrink: 0 },
  tableWrap: { overflow: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 14 },
  th: { textAlign: 'left', padding: '8px 10px', background: '#0a0a0a', color: '#fff', fontSize: 12, fontWeight: 600 },
  td: { padding: '8px 10px', color: '#1f2937', borderBottom: '1px solid #eee' },
  bullets: { margin: 0, paddingLeft: 22 },
  bullet: { fontSize: 'clamp(15px, 1.8vw, 20px)', lineHeight: 1.5, color: '#1f2937', marginBottom: 12 },
  legendRow: { display: 'flex', alignItems: 'center', fontSize: 16, color: '#374151', marginBottom: 10 },
  swatch: { width: 14, height: 14, borderRadius: 3, marginRight: 8, display: 'inline-block' },
  controls: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20, marginTop: 18 },
  navBtn: { fontSize: 14, fontWeight: 600, color: '#0a0a0a', border: '1px solid #ddd', borderRadius: 999, padding: '8px 16px' },
  counter: { fontSize: 13, color: '#666', fontVariantNumeric: 'tabular-nums' },
  dots: { display: 'flex', justifyContent: 'center', gap: 6, marginTop: 14, flexWrap: 'wrap' },
  dot: { width: 8, height: 8, borderRadius: '50%', border: 'none', padding: 0, cursor: 'pointer' },
};
