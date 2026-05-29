'use client';

import React from 'react';

/**
 * Animated network-graph intro that plays once on load, then hands off to the
 * main app via onDone(). Builds outward from a center "map" node: spokes draw
 * to an inner ring of 8 nodes, each of those branches to small leaf nodes, and
 * faint orbital curves fade in behind. The whole thing fades out and calls
 * onDone() so the original first page takes over unchanged.
 */

const CX = 500;
const CY = 400;
const INNER_N = 8;
const INNER_R = 200;
const LEAF_R = 150;

type Node = { x: number; y: number; r: number; delay: number };
type Edge = { x1: number; y1: number; x2: number; y2: number; delay: number };

function buildGraph() {
  const inner: Node[] = [];
  const spokes: Edge[] = [];
  const leaves: Node[] = [];
  const branches: Edge[] = [];

  for (let i = 0; i < INNER_N; i++) {
    const ang = ((-90 + (360 / INNER_N) * i) * Math.PI) / 180;
    const x = CX + INNER_R * Math.cos(ang);
    const y = CY + INNER_R * Math.sin(ang);
    const spokeDelay = 0.7 + i * 0.06;
    spokes.push({ x1: CX, y1: CY, x2: x, y2: y, delay: spokeDelay });
    inner.push({ x, y, r: 26, delay: spokeDelay + 0.4 });

    // 2–4 leaf nodes fanning out from each inner node
    const count = 2 + (i % 3);
    const spread = 52; // total degrees of fan
    for (let j = 0; j < count; j++) {
      const off = count === 1 ? 0 : -spread / 2 + (spread / (count - 1)) * j;
      const la = ang + (off * Math.PI) / 180;
      const lr = INNER_R + LEAF_R + (j % 2) * 26;
      const lx = CX + lr * Math.cos(la);
      const ly = CY + lr * Math.sin(la);
      const bDelay = 1.55 + i * 0.05 + j * 0.05;
      branches.push({ x1: x, y1: y, x2: lx, y2: ly, delay: bDelay });
      leaves.push({ x: lx, y: ly, r: 8 + (j % 2) * 5, delay: bDelay + 0.35 });
    }
  }

  // Faint orbital ellipses for the "interconnected" feel
  const orbits = [
    { rx: 200, ry: 120, rot: 0 },
    { rx: 200, ry: 120, rot: 60 },
    { rx: 200, ry: 120, rot: 120 },
  ];

  return { inner, spokes, leaves, branches, orbits };
}

export default function Intro({ onDone }: { onDone: () => void }) {
  const g = React.useMemo(buildGraph, []);
  const [fading, setFading] = React.useState(false);

  const finish = React.useCallback(() => {
    setFading(true);
    window.setTimeout(onDone, 650);
  }, [onDone]);

  React.useEffect(() => {
    // Auto-advance once the build animation has fully played.
    const t = window.setTimeout(finish, 5200);
    return () => window.clearTimeout(t);
  }, [finish]);

  return (
    <main
      style={{ ...styles.wrap, opacity: fading ? 0 : 1 }}
      onClick={finish}
      title="Click to skip"
    >
      <svg viewBox="0 0 1000 800" style={styles.svg} role="img" aria-label="map">
        {/* Faint orbital interconnections */}
        {g.orbits.map((o, i) => (
          <ellipse
            key={`o${i}`}
            cx={CX}
            cy={CY}
            rx={o.rx}
            ry={o.ry}
            transform={`rotate(${o.rot} ${CX} ${CY})`}
            fill="none"
            stroke="#c9c7c1"
            strokeWidth={1}
            style={{ opacity: 0, animation: 'introFade 1.4s ease forwards', animationDelay: '2.4s' }}
          />
        ))}

        {/* Spokes: center → inner ring */}
        {g.spokes.map((e, i) => (
          <line
            key={`s${i}`}
            x1={e.x1}
            y1={e.y1}
            x2={e.x2}
            y2={e.y2}
            pathLength={1}
            stroke="#1a1a1a"
            strokeWidth={1.3}
            style={{
              strokeDasharray: 1,
              strokeDashoffset: 1,
              animation: 'introDraw 0.55s ease forwards',
              animationDelay: `${e.delay}s`,
            }}
          />
        ))}

        {/* Branches: inner ring → leaves */}
        {g.branches.map((e, i) => (
          <line
            key={`b${i}`}
            x1={e.x1}
            y1={e.y1}
            x2={e.x2}
            y2={e.y2}
            pathLength={1}
            stroke="#9a988f"
            strokeWidth={1}
            style={{
              strokeDasharray: 1,
              strokeDashoffset: 1,
              animation: 'introDraw 0.5s ease forwards',
              animationDelay: `${e.delay}s`,
            }}
          />
        ))}

        {/* Leaf nodes */}
        {g.leaves.map((n, i) => (
          <circle
            key={`l${i}`}
            cx={n.x}
            cy={n.y}
            r={n.r}
            fill="#faf9f5"
            stroke="#2a2a2a"
            strokeWidth={1.2}
            style={{ ...styles.popNode, animationDelay: `${n.delay}s` }}
          />
        ))}

        {/* Inner ring nodes */}
        {g.inner.map((n, i) => (
          <circle
            key={`i${i}`}
            cx={n.x}
            cy={n.y}
            r={n.r}
            fill="#faf9f5"
            stroke="#1a1a1a"
            strokeWidth={2}
            style={{ ...styles.popNode, animationDelay: `${n.delay}s` }}
          />
        ))}

        {/* Center node */}
        <circle
          cx={CX}
          cy={CY}
          r={70}
          fill="#faf9f5"
          stroke="#0a0a0a"
          strokeWidth={3}
          style={{ ...styles.popNode, animationDelay: '0.05s' }}
        />
        <text
          x={CX}
          y={CY}
          textAnchor="middle"
          dominantBaseline="central"
          style={styles.centerText}
        >
          map
        </text>
      </svg>

      <div style={styles.footer}>mapping architecture platform</div>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    minHeight: '100vh',
    width: '100%',
    background: '#f7f6f3',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: 'opacity 0.6s ease',
    padding: '24px',
  },
  svg: {
    width: '100%',
    maxWidth: 860,
    height: 'auto',
  },
  popNode: {
    opacity: 0,
    transformBox: 'fill-box',
    transformOrigin: 'center',
    animation: 'introPop 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
  },
  centerText: {
    fontSize: 40,
    fontWeight: 700,
    letterSpacing: '-0.02em',
    fill: '#0a0a0a',
    opacity: 0,
    animation: 'introFade 0.6s ease forwards',
    animationDelay: '0.4s',
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Helvetica Neue', Helvetica, Arial, sans-serif",
  },
  footer: {
    marginTop: 36,
    fontSize: 12,
    letterSpacing: '0.35em',
    color: '#bbb',
    textTransform: 'uppercase',
    opacity: 0,
    animation: 'introFade 1s ease forwards',
    animationDelay: '2.8s',
  },
};
