// Shared label de-collision for scatter / bubble / network charts.
//
// Many companies can project onto nearly the same screen position, so their
// text labels overlap. relaxLabels() runs a light iterative simulation: each
// label box repels the others along its smallest-overlap axis and is gently
// pulled back toward its own point, so labels spread just enough to stop
// touching while staying near what they describe. Charts draw a thin leader
// line from the point to any label that had to move.

export function truncate(s: string, n = 16): string {
  return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s;
}

export type LabelInput = { x: number; y: number; text: string };
export type PlacedLabel = { x: number; y: number; text: string; lx: number; ly: number; moved: boolean };

type Bounds = { minX: number; maxX: number; minY: number; maxY: number };

export function relaxLabels(
  items: LabelInput[],
  opts: {
    fontSize?: number;
    padX?: number;
    padY?: number;
    iterations?: number;
    charW?: number;
    dy?: number;        // initial vertical offset of the label above its point
    bounds?: Bounds;
  } = {},
): PlacedLabel[] {
  const fs = opts.fontSize ?? 11;
  const padX = opts.padX ?? 4;
  const padY = opts.padY ?? 4;
  const iter = opts.iterations ?? 160;
  const charW = opts.charW ?? 0.58;
  const dy0 = opts.dy ?? -12;

  const L = items.map((it) => ({
    x: it.x,
    y: it.y,
    text: it.text,
    w: it.text.length * fs * charW + 8,
    h: fs + 5,
    cx: it.x,
    cy: it.y + dy0,
  }));

  const clamp = (l: (typeof L)[number]) => {
    const b = opts.bounds;
    if (!b) return;
    l.cx = Math.max(b.minX + l.w / 2, Math.min(b.maxX - l.w / 2, l.cx));
    l.cy = Math.max(b.minY + l.h / 2, Math.min(b.maxY - l.h / 2, l.cy));
  };

  for (let k = 0; k < iter; k++) {
    for (let i = 0; i < L.length; i++) {
      const a = L[i];
      // gentle pull toward the desired spot (just above the point). Kept weak so
      // labels can travel far enough to clear a crowded cluster before it tugs
      // them back; the leader line keeps them readable once they've moved.
      a.cx += (a.x - a.cx) * 0.01;
      a.cy += (a.y + dy0 - a.cy) * 0.01;
      for (let j = i + 1; j < L.length; j++) {
        const b = L[j];
        const dx = b.cx - a.cx;
        const dy = b.cy - a.cy;
        const ox = (a.w + b.w) / 2 + padX - Math.abs(dx);
        const oy = (a.h + b.h) / 2 + padY - Math.abs(dy);
        if (ox > 0 && oy > 0) {
          // Favor vertical separation. Stacking labels apart by a line height is
          // stable regardless of how wide the text is, whereas a sideways nudge
          // (often the smaller overlap for a row of points) only needs the pull
          // back and bounds clamp to undo it — which is how rows of labels stay
          // stuck on top of each other. Only shift horizontally when the labels
          // are nearly directly above/below one another.
          if (ox < oy * 0.35) {
            const s = ((dx < 0 ? -1 : 1) * ox) / 2;
            a.cx -= s;
            b.cx += s;
          } else {
            const s = ((dy < 0 ? -1 : 1) * oy) / 2;
            a.cy -= s;
            b.cy += s;
          }
        }
      }
      clamp(a);
    }
  }

  return L.map((l) => ({
    x: l.x,
    y: l.y,
    text: l.text,
    lx: l.cx,
    ly: l.cy + fs / 3,
    moved: Math.hypot(l.cx - l.x, l.cy - l.y) > 16,
  }));
}
