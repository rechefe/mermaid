/**
 * Pure SVG path builders for §5.3 gate glyph bodies. `W`/`H` are the glyph's
 * own (pre-shift) width/height — i.e. `baseW`/`glyphH`, not `nodeW`/`nodeH`.
 */

export function andPath(W: number, H: number): string {
  return `M 0 0 H ${W - H / 2} A ${H / 2} ${H / 2} 0 0 1 ${W - H / 2} ${H} H 0 Z`;
}

export function orPath(W: number, H: number): string {
  return `M 0 0 Q ${0.35 * W} ${0.5 * H} 0 ${H} Q ${0.75 * W} ${H} ${W} ${0.5 * H} Q ${0.75 * W} 0 0 0 Z`;
}

export function xorBackArcPath(W: number, H: number): string {
  return `M -6 0 Q ${0.35 * W - 6} ${0.5 * H} -6 ${H}`;
}

export function bufPath(W: number, H: number): string {
  return `M 0 0 L ${W} ${0.5 * H} L 0 ${H} Z`;
}

export function glyphBodyPath(shape: 'and' | 'or' | 'xor' | 'buf', W: number, H: number): string {
  switch (shape) {
    case 'and':
      return andPath(W, H);
    case 'or':
    case 'xor':
      return orPath(W, H);
    case 'buf':
      return bufPath(W, H);
  }
}

/** `or`/`xor`/`nor`/`xnor` draw a lead line from each input pin to the
 * (concave) body outline, since the pin point doesn't touch the outline. */
export function inputLeadPath(portX: number, portY: number, W: number): string {
  return `M ${portX} ${portY} L ${portX + 0.22 * W} ${portY}`;
}

export function invertingBubble(
  baseW: number,
  H: number,
  r: number
): { cx: number; cy: number; r: number } {
  return { cx: baseW + r, cy: H / 2, r };
}
