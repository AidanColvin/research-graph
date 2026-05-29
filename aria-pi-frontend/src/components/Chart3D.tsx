'use client';

import React from 'react';

// Lighten (amt>0) or darken (amt<0) a hex color by mixing toward white/black.
export function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const t = amt < 0 ? 0 : 255, p = Math.abs(amt);
  r = Math.round((t - r) * p) + r;
  g = Math.round((t - g) * p) + g;
  b = Math.round((t - b) * p) + b;
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

// ── Extruded 3D bar chart (cabinet projection) ────────────────────────────────
export function IsoBars({ items, valueFmt, baseColor = '#4f46e5', height = 380 }: {
  items: { label: string; value: number; color?: string }[];
  valueFmt: (n: number) => string;
  baseColor?: string;
  height?: number;
}) {
  const rows = items.filter((d) => d.value > 0);
  if (!rows.length) return <div style={empty}>Not enough data for this view.</div>;
  const W = 820, H = height, pl = 48, pr = 24, pt = 36, pb = 76, dx = 16, dy = -11;
  const n = rows.length;
  const slot = (W - pl - pr - dx) / n;
  const bw = Math.min(58, slot * 0.62);
  const max = Math.max(...rows.map((d) => d.value), 1);
  const baseY = H - pb;
  const plotH = H - pt - pb;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={svgStyle}>
      <line x1={pl + dx} y1={baseY} x2={W - pr} y2={baseY} stroke="#ddd" />
      {rows.map((d, i) => {
        const col = d.color || baseColor;
        const x = pl + dx + i * slot + (slot - bw) / 2;
        const h = Math.max(2, (d.value / max) * plotH);
        const y = baseY - h;
        const top = `${x},${y} ${x + dx},${y + dy} ${x + bw + dx},${y + dy} ${x + bw},${y}`;
        const side = `${x + bw},${y} ${x + bw + dx},${y + dy} ${x + bw + dx},${baseY + dy} ${x + bw},${baseY}`;
        return (
          <g key={i}>
            <rect x={x} y={y} width={bw} height={h} fill={col} />
            <polygon points={top} fill={shade(col, 0.22)} />
            <polygon points={side} fill={shade(col, -0.22)} />
            <text x={x + bw / 2 + dx / 2} y={y + dy - 5} textAnchor="middle" style={valLabel}>{valueFmt(d.value)}</text>
            <text x={x + bw / 2} y={baseY + 14} textAnchor="end" style={axisSm} transform={`rotate(-38 ${x + bw / 2} ${baseY + 14})`}>{d.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Isometric 3D scatter ─────────────────────────────────────────────────────
export function IsoScatter({ points, xLabel, yLabel, zLabel }: {
  points: { x: number; y: number; z: number; label: string; highlight?: boolean }[];
  xLabel: string; yLabel: string; zLabel: string;
}) {
  if (points.length < 2) return <div style={empty}>Not enough data for this view.</div>;
  const norm = (key: 'x' | 'y' | 'z') => {
    const vs = points.map((p) => p[key]);
    const lo = Math.min(...vs), hi = Math.max(...vs);
    return (v: number) => (hi === lo ? 0.5 : (v - lo) / (hi - lo));
  };
  const nx = norm('x'), ny = norm('y'), nz = norm('z');
  const W = 760, H = 540, ox = 380, oy = 320, S = 185;
  const C = Math.cos(Math.PI / 6), Sn = Math.sin(Math.PI / 6);
  const proj = (x: number, y: number, z: number) => [ox + (x - z) * S * C, oy + (x + z) * S * Sn - y * S];
  const O = proj(0, 0, 0), X = proj(1, 0, 0), Z = proj(0, 0, 1), XZ = proj(1, 0, 1);
  const Yt = proj(0, 1, 0), Xt = proj(1, 1, 0), Zt = proj(0, 1, 1);
  const pts = points.map((p) => ({ ...p, nx: nx(p.x), ny: ny(p.y), nz: nz(p.z) }))
    .sort((a, b) => (a.nx + a.nz) - (b.nx + b.nz));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={svgStyle}>
      <defs>
        <radialGradient id="iso-hi" cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#a5b4fc" /><stop offset="100%" stopColor="#4f46e5" />
        </radialGradient>
        <radialGradient id="iso-lo" cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#ffffff" /><stop offset="100%" stopColor="#cfd2e8" />
        </radialGradient>
      </defs>
      {/* floor */}
      <polygon points={`${O.join(',')} ${X.join(',')} ${XZ.join(',')} ${Z.join(',')}`} fill="#f5f6fb" stroke="#e3e5f0" />
      {/* vertical edges */}
      {[[O, Yt], [X, Xt], [Z, Zt]].map(([a, b], i) => <line key={i} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="#e3e5f0" />)}
      <line x1={Yt[0]} y1={Yt[1]} x2={Xt[0]} y2={Xt[1]} stroke="#eef0f7" />
      <line x1={Yt[0]} y1={Yt[1]} x2={Zt[0]} y2={Zt[1]} stroke="#eef0f7" />
      {/* axis labels */}
      <text x={(O[0] + X[0]) / 2 + 6} y={(O[1] + X[1]) / 2 + 18} style={axis}>{xLabel} →</text>
      <text x={(O[0] + Z[0]) / 2 - 6} y={(O[1] + Z[1]) / 2 + 18} textAnchor="end" style={axis}>{zLabel} →</text>
      <text x={Yt[0] - 6} y={Yt[1] - 6} textAnchor="end" style={axis}>{yLabel} ↑</text>
      {/* points */}
      {pts.map((p, i) => {
        const [sx, sy] = proj(p.nx, p.ny, p.nz);
        const [fx, fy] = proj(p.nx, 0, p.nz);
        return (
          <g key={i}>
            <line x1={fx} y1={fy} x2={sx} y2={sy} stroke="#c8cbe0" strokeDasharray="2 3" />
            <ellipse cx={fx} cy={fy} rx={6} ry={3} fill="#000" opacity={0.06} />
            <circle cx={sx} cy={sy} r={9} fill={p.highlight ? 'url(#iso-hi)' : 'url(#iso-lo)'} stroke={p.highlight ? '#4f46e5' : '#9aa0c8'} strokeWidth={1} />
            <circle cx={sx - 2.5} cy={sy - 2.5} r={2} fill="#fff" opacity={0.6} />
            <text x={sx + 11} y={sy + 4} style={pointLabel}>{p.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Rotating 3D orbital network ───────────────────────────────────────────────
// Companies sit on a sphere around a central node and rotate continuously, like
// the logo. Motion + even spherical spacing keep labels from stacking the way a
// static projection does. Depth controls size, opacity, and which labels show.
export function OrbitNetwork({ points, centerLabel = 'UNC', height = 580, baseColor = '#4f46e5' }: {
  points: { label: string; size: number; highlight?: boolean; weight?: number }[];
  centerLabel?: string;
  height?: number;
  baseColor?: string;
}) {
  const [angle, setAngle] = React.useState(0);
  const paused = React.useRef(false);

  React.useEffect(() => {
    let raf = 0, last = 0;
    const reduce = typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches : false;
    const tick = (t: number) => {
      if (last && !paused.current && !reduce) setAngle((a) => (a + (t - last) * 0.00035) % (Math.PI * 2));
      last = t;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const n = points.length;
  if (!n) return <div style={empty}>Not enough data for this view.</div>;

  const W = 820, H = height, cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.33;
  const tilt = 0.42, ct = Math.cos(tilt), stt = Math.sin(tilt);
  const ca = Math.cos(angle), sa = Math.sin(angle);
  const GA = Math.PI * (3 - Math.sqrt(5)); // golden angle → even sphere spread
  const f = 2.6; // camera distance for perspective

  const nodes = points.map((p, i) => {
    const y0 = n === 1 ? 0 : 1 - (i / (n - 1)) * 2;
    const rad = Math.sqrt(Math.max(0, 1 - y0 * y0));
    const th = GA * i;
    const x0 = Math.cos(th) * rad, z0 = Math.sin(th) * rad;
    const x1 = x0 * ca + z0 * sa;           // rotate around vertical axis
    const z1 = -x0 * sa + z0 * ca;
    const y2 = y0 * ct - z1 * stt;          // tilt toward viewer
    const z2 = y0 * stt + z1 * ct;
    const scale = f / (f - z2);
    return {
      ...p,
      sx: cx + x1 * R * scale,
      sy: cy - y2 * R * scale,
      z2,
      depth: (z2 + 1) / 2,                  // 0 back → 1 front
      scale,
    };
  }).sort((a, b) => a.z2 - b.z2);

  const renderNode = (nd: typeof nodes[number], i: number) => {
    const r = Math.max(3, (4.5 + nd.size * 11) * nd.scale);
    const op = 0.28 + nd.depth * 0.72;
    const showLabel = nd.depth > 0.52;
    const right = nd.sx >= cx;
    const stroke = nd.highlight ? baseColor : '#9aa0c8';
    return (
      <g key={i} opacity={op}>
        <line x1={cx} y1={cy} x2={nd.sx} y2={nd.sy}
          stroke={nd.highlight ? baseColor : '#c8cbe0'}
          strokeWidth={0.6 + (nd.weight || 0) * 0.5}
          strokeOpacity={0.1 + nd.depth * 0.45} />
        <circle cx={nd.sx} cy={nd.sy} r={r}
          fill={nd.highlight ? 'url(#orb-hi)' : 'url(#orb-lo)'}
          stroke={stroke} strokeWidth={1} />
        <circle cx={nd.sx - r * 0.3} cy={nd.sy - r * 0.3} r={r * 0.25} fill="#fff" opacity={0.55} />
        {showLabel && (
          <text x={right ? nd.sx + r + 4 : nd.sx - r - 4} y={nd.sy + 4}
            textAnchor={right ? 'start' : 'end'} style={orbitLabel}>{nd.label}</text>
        )}
      </g>
    );
  };

  const back = nodes.filter((nd) => nd.z2 < 0);
  const front = nodes.filter((nd) => nd.z2 >= 0);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={svgStyle}
      onMouseEnter={() => { paused.current = true; }}
      onMouseLeave={() => { paused.current = false; }}>
      <defs>
        <radialGradient id="orb-hi" cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#a5b4fc" /><stop offset="100%" stopColor={baseColor} />
        </radialGradient>
        <radialGradient id="orb-lo" cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#ffffff" /><stop offset="100%" stopColor="#cfd2e8" />
        </radialGradient>
      </defs>
      {/* faint orbital rings for the interconnected feel */}
      {[0, 60, 120].map((rot, i) => (
        <ellipse key={i} cx={cx} cy={cy} rx={R * 1.04} ry={R * 0.42}
          transform={`rotate(${rot} ${cx} ${cy})`} fill="none" stroke="#e3e5f0" strokeWidth={1} />
      ))}
      {back.map(renderNode)}
      {/* center node */}
      <circle cx={cx} cy={cy} r={30} fill="#0a0a0a" />
      <text x={cx} y={cy + 5} textAnchor="middle" style={orbitCenter}>{centerLabel}</text>
      {front.map(renderNode)}
    </svg>
  );
}

const orbitLabel: React.CSSProperties = { fontSize: 11, fill: '#1f2937', fontWeight: 600, paintOrder: 'stroke', stroke: '#fff', strokeWidth: 3 } as React.CSSProperties;
const orbitCenter: React.CSSProperties = { fontSize: 15, fill: '#fff', fontWeight: 700 };

const svgStyle: React.CSSProperties = { width: '100%', height: 'auto', display: 'block' };
const axis: React.CSSProperties = { fontSize: 12, fill: '#888' };
const axisSm: React.CSSProperties = { fontSize: 10, fill: '#999' };
const valLabel: React.CSSProperties = { fontSize: 10, fill: '#0a0a0a', fontWeight: 700 };
const pointLabel: React.CSSProperties = { fontSize: 11, fill: '#374151', fontWeight: 600 };
const empty: React.CSSProperties = { fontSize: 13, color: '#999', fontStyle: 'italic', padding: '20px 0' };
