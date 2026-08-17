import type { GroupModel, NodeModel, PortModel, Side } from './schematicTypes.js';

export const G = {
  TITLE_SIZE: 14,
  TITLE_WEIGHT: 600,
  TITLE_LINE: 18,
  CAPTION_SIZE: 11,
  CAPTION_LINE: 15,
  PORT_LABEL_SIZE: 11,
  NET_LABEL_SIZE: 10.5,
  GROUP_LABEL_SIZE: 10.5,

  BOX_MIN_W: 96,
  BOX_MIN_H: 56,
  BOX_PAD_X: 12,
  BOX_PAD_Y: 10,
  BOX_RADIUS: 3,

  PORT_PITCH: 24,
  PORT_MARGIN: 18,
  PORT_LABEL_INSET: 8,

  BAND_W: 22,
  BAND_INSET: 1,

  TITLE_GAP: 16,
  TERMINAL_LEAD: 18,
  TERMINAL_H: 20,

  STROKE_BODY: 1.8,
  STROKE_NET: 1.5,
  STROKE_BUS: 3.2,
  EDGE_RADIUS: 4,
  ARROW_W: 9,
  ARROW_H: 7,
  BUBBLE_R: 5,
} as const;

export const FONT_SANS = '"trebuchet ms", verdana, arial, sans-serif';
export const FONT_MONO = '"Courier New", Courier, monospace';

export interface TextMetrics {
  w: number;
  h: number;
}

/**
 * Measures text using a hidden SVG <text> + getBBox() when a DOM is
 * available and functional (mirrors the `packet` diagram's approach), and
 * falls back to an analytic approximation otherwise. jsdom (used by this
 * repo's unit tests) exposes `document` but does not implement
 * `SVGElement.getBBox()`, so unit tests exercise the fallback automatically
 * — this is what makes the §5.2 geometry expectations stable.
 */
export function measureText(
  text: string,
  size: number,
  family: string,
  weight?: number
): TextMetrics {
  if (typeof document !== 'undefined') {
    try {
      const svgNS = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(svgNS, 'svg');
      svg.setAttribute('width', '0');
      svg.setAttribute('height', '0');
      svg.style.position = 'absolute';
      svg.style.visibility = 'hidden';
      const textEl = document.createElementNS(svgNS, 'text');
      textEl.setAttribute('font-size', String(size));
      textEl.setAttribute('font-family', family);
      if (weight !== undefined) {
        textEl.setAttribute('font-weight', String(weight));
      }
      textEl.textContent = text;
      svg.appendChild(textEl);
      document.body.appendChild(svg);
      const bbox = textEl.getBBox();
      document.body.removeChild(svg);
      if (bbox && bbox.width > 0) {
        return { w: bbox.width, h: bbox.height || size * 1.25 };
      }
    } catch {
      // Not implemented in this DOM (e.g. jsdom) — fall through.
    }
  }
  return { w: text.length * size * 0.6, h: size * 1.25 };
}

export type TextMeasurer = typeof measureText;

/** `name` when `width === 1`, else `name[width-1:0]`.
 *
 * §4.1 deliberately keeps `PortModel` closed to just `{name, width, ...}` —
 * it does not carry the originally-declared `msb`/`lsb`. §5.4's
 * `${name}[${msb}:${lsb}]` display formula is therefore reconstructed here
 * from `width` alone as `[width-1:0]`; the exact declared bit range (e.g.
 * `[10:3]`) is not preserved in the IR. See PR description.
 */
export function portDisplayName(port: PortModel): string {
  return port.width === 1 ? port.name : `${port.name}[${port.width - 1}:0]`;
}

// ---------------------------------------------------------------------------
// §5.3 Glyph bodies
// ---------------------------------------------------------------------------

export interface GlyphPortLayout {
  name: string;
  x: number;
  y: number;
}

export interface GlyphGeometry {
  glyphH: number;
  glyphW: number;
  nodeW: number;
  nodeH: number;
  xorExtra: number;
  inputs: GlyphPortLayout[];
  output: GlyphPortLayout;
}

const GLYPH_BASE_W: Record<'and' | 'or' | 'xor' | 'buf', number> = {
  and: 52,
  or: 56,
  xor: 56,
  buf: 40,
};

export function computeGlyphGeometry(
  shape: 'and' | 'or' | 'xor' | 'buf',
  inverting: boolean,
  inputCount: number
): GlyphGeometry {
  const n = inputCount;
  const glyphH = Math.max(48, 24 * n);
  const baseW = GLYPH_BASE_W[shape];
  const bubbleExtra = inverting ? 2 * G.BUBBLE_R : 0;
  const xorExtra = shape === 'xor' ? 6 : 0;
  const glyphW = baseW + bubbleExtra;
  const nodeW = glyphW + xorExtra;
  const nodeH = glyphH + G.CAPTION_LINE + 5;

  const inputs: GlyphPortLayout[] = [];
  for (let i = 0; i < n; i++) {
    inputs.push({
      name: String.fromCharCode(97 + i),
      x: 0 + xorExtra,
      y: (glyphH * (2 * i + 1)) / (2 * n),
    });
  }
  const output: GlyphPortLayout = { name: 'y', x: glyphW + xorExtra, y: glyphH / 2 };

  return { glyphH, glyphW, nodeW, nodeH, xorExtra, inputs, output };
}

/** Mutates `node.width`/`node.height` and each port's `x`/`y` in place. */
export function computeGlyphNodeGeometry(
  node: NodeModel,
  primitive: {
    shape: 'and' | 'or' | 'xor' | 'buf';
    inverting: boolean;
  }
): void {
  const inputs = node.ports.filter((p) => p.name !== 'y');
  const geometry = computeGlyphGeometry(primitive.shape, primitive.inverting, inputs.length);
  node.width = Math.ceil(geometry.nodeW);
  node.height = Math.ceil(geometry.nodeH);
  inputs.sort((a, b) => a.index - b.index);
  inputs.forEach((port, i) => {
    port.x = geometry.inputs[i].x;
    port.y = geometry.inputs[i].y;
  });
  const output = node.ports.find((p) => p.name === 'y');
  if (output) {
    output.x = geometry.output.x;
    output.y = geometry.output.y;
  }
}

// ---------------------------------------------------------------------------
// §5.4 Box bodies
// ---------------------------------------------------------------------------

function bySide(ports: PortModel[], side: Side): PortModel[] {
  return ports.filter((p) => p.side === side).sort((a, b) => a.index - b.index);
}

function maxLabelWidth(ports: PortModel[], measurer: TextMeasurer): number {
  if (ports.length === 0) {
    return 0;
  }
  return Math.max(
    ...ports.map((p) => measurer(portDisplayName(p), G.PORT_LABEL_SIZE, FONT_MONO).w)
  );
}

function sideHasGroup(ports: PortModel[]): boolean {
  return ports.some((p) => p.groupName !== undefined);
}

function labelBlock(ports: PortModel[], measurer: TextMeasurer): number {
  if (ports.length === 0) {
    return 0;
  }
  return G.PORT_LABEL_INSET + maxLabelWidth(ports, measurer) + (sideHasGroup(ports) ? G.BAND_W : 0);
}

function portSpan(ports: PortModel[]): number {
  if (ports.length === 0) {
    return 0;
  }
  return 2 * G.PORT_MARGIN + G.PORT_PITCH * (ports.length - 1);
}

/**
 * Mutates `node.width`/`node.height` and every port's `x`/`y` in place.
 *
 * Deviation from the literal §5.4 formulas: the "label block + title +
 * 2*TITLE_GAP" cross terms are only added when the relevant perpendicular
 * side(s) actually have ports. Read literally (unconditionally), those
 * terms evaluate to `titleBlockH/titleW + 2*TITLE_GAP` even for a box with
 * *no* ports at all, which contradicts §10.2's own worked example ("Box, no
 * ports, type ALU, instance u_alu" → `H = 56`, not 65). Gating the cross
 * term on port presence is the only reading under which that example (and
 * every other §10.2 example) checks out. See PR description.
 */
export function computeBoxGeometry(node: NodeModel, measurer: TextMeasurer = measureText): void {
  const west = bySide(node.ports, 'WEST');
  const east = bySide(node.ports, 'EAST');
  const north = bySide(node.ports, 'NORTH');
  const south = bySide(node.ports, 'SOUTH');

  const titleW = Math.max(
    measurer(node.label, G.TITLE_SIZE, FONT_SANS, G.TITLE_WEIGHT).w,
    node.caption ? measurer(node.caption, G.CAPTION_SIZE, FONT_MONO).w : 0
  );
  const titleBlockH = G.TITLE_LINE + G.CAPTION_LINE;

  const westEastCross =
    west.length > 0 || east.length > 0
      ? labelBlock(west, measurer) + labelBlock(east, measurer) + titleW + 2 * G.TITLE_GAP
      : 0;
  const northSouthCross =
    north.length > 0 || south.length > 0
      ? labelBlock(north, measurer) + labelBlock(south, measurer) + titleBlockH + 2 * G.TITLE_GAP
      : 0;

  const width = Math.ceil(
    Math.max(G.BOX_MIN_W, 2 * G.BOX_PAD_X + titleW, westEastCross, portSpan(north), portSpan(south))
  );
  const height = Math.ceil(
    Math.max(
      G.BOX_MIN_H,
      2 * G.BOX_PAD_Y + titleBlockH,
      portSpan(west),
      portSpan(east),
      northSouthCross
    )
  );

  node.width = width;
  node.height = height;

  const place = (ports: PortModel[], side: Side) => {
    const n = ports.length;
    if (side === 'WEST' || side === 'EAST') {
      const x = side === 'WEST' ? 0 : width;
      const base = (height - G.PORT_PITCH * (n - 1)) / 2;
      ports.forEach((p, i) => {
        p.x = x;
        p.y = base + i * G.PORT_PITCH;
      });
    } else {
      const y = side === 'NORTH' ? 0 : height;
      const base = (width - G.PORT_PITCH * (n - 1)) / 2;
      ports.forEach((p, i) => {
        p.x = base + i * G.PORT_PITCH;
        p.y = y;
      });
    }
  };
  place(west, 'WEST');
  place(east, 'EAST');
  place(north, 'NORTH');
  place(south, 'SOUTH');
}

// ---------------------------------------------------------------------------
// §5.5 Terminal bodies
// ---------------------------------------------------------------------------

export function computeTerminalGeometry(
  node: NodeModel,
  measurer: TextMeasurer = measureText
): void {
  const w = measurer(node.label, G.PORT_LABEL_SIZE, FONT_MONO).w + G.TERMINAL_LEAD;
  node.width = Math.ceil(w);
  node.height = G.TERMINAL_H;
  const port = node.ports[0];
  if (!port) {
    return;
  }
  switch (port.side) {
    case 'EAST':
      port.x = node.width;
      port.y = node.height / 2;
      break;
    case 'WEST':
      port.x = 0;
      port.y = node.height / 2;
      break;
    case 'SOUTH':
      port.x = node.width / 2;
      port.y = node.height;
      break;
    case 'NORTH':
      port.x = node.width / 2;
      port.y = 0;
      break;
  }
}

// ---------------------------------------------------------------------------
// §5.6 Group bands
// ---------------------------------------------------------------------------

export interface GroupBand {
  x: number;
  y: number;
  w: number;
  h: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function computeGroupBand(group: GroupModel, node: NodeModel): GroupBand {
  const members = bySide(node.ports, group.side).filter(
    (p) => p.index >= group.firstIndex && p.index <= group.lastIndex
  );
  const first = members[0];
  const last = members[members.length - 1] ?? first;
  const pitch = G.PORT_PITCH;
  const { width: W, height: H } = node;

  if (group.side === 'WEST' || group.side === 'EAST') {
    const x = group.side === 'WEST' ? G.BAND_INSET : W - G.BAND_INSET - G.BAND_W;
    const y = clamp(first.y - pitch / 2, G.BAND_INSET, H - G.BAND_INSET);
    const h = Math.min(last.y - first.y + pitch, H - 2 * G.BAND_INSET - (y - G.BAND_INSET));
    return { x, y, w: G.BAND_W, h };
  }
  const y = group.side === 'NORTH' ? G.BAND_INSET : H - G.BAND_INSET - G.BAND_W;
  const x = clamp(first.x - pitch / 2, G.BAND_INSET, W - G.BAND_INSET);
  const w = Math.min(last.x - first.x + pitch, W - 2 * G.BAND_INSET - (x - G.BAND_INSET));
  return { x, y, w, h: G.BAND_W };
}
