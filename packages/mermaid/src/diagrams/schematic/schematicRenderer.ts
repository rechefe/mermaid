import type { Diagram } from '../../Diagram.js';
import type { DiagramRenderer, DrawDefinition, SVG, SVGGroup } from '../../diagram-api/types.js';
import { selectSvgElement } from '../../rendering-util/selectSvgElement.js';
import { configureSvgSize } from '../../setupGraphViewbox.js';
import {
  FONT_MONO,
  FONT_SANS,
  G,
  computeBoxGeometry,
  computeGlyphNodeGeometry,
  computeGroupBand,
  computeTerminalGeometry,
  measureText,
  portDisplayName,
} from './geometry.js';
import { glyphBodyPath, invertingBubble, xorBackArcPath } from './glyphs.js';
import { layoutSchematic, pointsToRoundedPath, type Point } from './layout.js';
import type { SchematicDB } from './schematicDb.js';
import type {
  GroupModel,
  NetModel,
  NodeModel,
  PortModel,
  SchematicModel,
} from './schematicTypes.js';
import { PRIMITIVES } from './schematicTypes.js';

const GLYPH_BASE_W: Record<'and' | 'or' | 'xor' | 'buf', number> = {
  and: 52,
  or: 56,
  xor: 56,
  buf: 40,
};

function truncateForBand(label: string, bandLength: number, fontSize: number): string {
  const approxCharW = fontSize * 0.6;
  const maxChars = Math.floor((bandLength - 8) / approxCharW);
  if (maxChars >= label.length || maxChars < 1) {
    return label;
  }
  return `${label.slice(0, Math.max(1, maxChars - 1))}…`;
}

function drawGlyphNode(g: SVGGroup, node: NodeModel): void {
  const primitive = PRIMITIVES[node.type];
  const inputs = node.ports.filter((p) => p.name !== 'y').sort((a, b) => a.index - b.index);
  const n = inputs.length;
  const glyphH = Math.max(48, 24 * n);
  const baseW = GLYPH_BASE_W[primitive.shape];
  const xorExtra = primitive.shape === 'xor' ? 6 : 0;

  const bodyG = g.append('g').attr('transform', `translate(${xorExtra}, 0)`);
  bodyG
    .append('path')
    .attr('d', glyphBodyPath(primitive.shape, baseW, glyphH))
    .attr('class', 'sch-body');
  if (primitive.shape === 'xor') {
    bodyG
      .append('path')
      .attr('d', xorBackArcPath(baseW, glyphH))
      .attr('class', 'sch-body')
      .attr('fill', 'none');
  }
  if (primitive.inverting) {
    const bubble = invertingBubble(baseW, glyphH, G.BUBBLE_R);
    bodyG
      .append('circle')
      .attr('cx', bubble.cx)
      .attr('cy', bubble.cy)
      .attr('r', bubble.r)
      .attr('class', 'sch-body');
  }

  if (primitive.shape === 'or' || primitive.shape === 'xor') {
    for (const port of inputs) {
      g.append('path')
        .attr('d', `M ${port.x} ${port.y} L ${port.x + 0.22 * baseW} ${port.y}`)
        .attr('class', 'sch-lead')
        .attr('fill', 'none');
    }
  }

  g.append('text')
    .attr('class', 'sch-caption')
    .attr('text-anchor', 'middle')
    .attr('font-family', FONT_MONO)
    .attr('x', node.width / 2)
    .attr('y', glyphH + G.CAPTION_LINE)
    .text(node.caption ?? '');
}

function drawClockMarker(g: SVGGroup, node: NodeModel, port: PortModel): void {
  const { x, y } = port;
  let d: string;
  switch (port.side) {
    case 'SOUTH':
      d = `M ${x - 7} ${node.height} L ${x} ${node.height - 9} L ${x + 7} ${node.height}`;
      break;
    case 'NORTH':
      d = `M ${x - 7} 0 L ${x} 9 L ${x + 7} 0`;
      break;
    case 'WEST':
      d = `M 0 ${y - 7} L 9 ${y} L 0 ${y + 7}`;
      break;
    case 'EAST':
      d = `M ${node.width} ${y - 7} L ${node.width - 9} ${y} L ${node.width} ${y + 7}`;
      break;
  }
  g.append('path').attr('d', d).attr('class', 'sch-lead').attr('fill', 'none');
}

function drawBoxPortLabel(g: SVGGroup, node: NodeModel, port: PortModel): void {
  const grouped = port.groupName !== undefined;
  let inset = G.PORT_LABEL_INSET + (grouped ? G.BAND_W + G.BAND_INSET : 0);
  if (port.kind === 'clock') {
    inset += 10;
  }
  const text = g.append('text').attr('class', 'sch-port-label').attr('font-family', FONT_MONO);
  switch (port.side) {
    case 'WEST':
      text
        .attr('x', inset)
        .attr('y', port.y + 4)
        .attr('text-anchor', 'start');
      break;
    case 'EAST':
      text
        .attr('x', node.width - inset)
        .attr('y', port.y + 4)
        .attr('text-anchor', 'end');
      break;
    case 'NORTH':
      text
        .attr('x', port.x)
        .attr('y', inset)
        .attr('text-anchor', 'start')
        .attr('transform', `rotate(-90, ${port.x}, ${inset})`);
      break;
    case 'SOUTH':
      text
        .attr('x', port.x)
        .attr('y', node.height - inset)
        .attr('text-anchor', 'end')
        .attr('transform', `rotate(-90, ${port.x}, ${node.height - inset})`);
      break;
  }
  text.text(portDisplayName(port));

  if (port.kind === 'clock') {
    drawClockMarker(g, node, port);
  }
}

function drawGroupBand(g: SVGGroup, node: NodeModel, group: GroupModel): void {
  const band = computeGroupBand(group, node);
  g.append('rect')
    .attr('x', band.x)
    .attr('y', band.y)
    .attr('width', band.w)
    .attr('height', band.h)
    .attr('rx', 2)
    .attr('class', 'sch-group-band');

  const vertical = group.side === 'WEST' || group.side === 'EAST';
  const cx = band.x + band.w / 2;
  const cy = band.y + band.h / 2;
  const bandLength = vertical ? band.h : band.w;
  const label = g
    .append('text')
    .attr('class', 'sch-group-label')
    .attr('text-anchor', 'middle')
    .attr('font-family', FONT_MONO)
    .attr('x', cx)
    .attr('y', cy);
  if (vertical) {
    label.attr('transform', `rotate(-90 ${cx} ${cy})`);
  }
  label.text(truncateForBand(group.name, bandLength, G.GROUP_LABEL_SIZE));
}

function drawBoxNode(g: SVGGroup, node: NodeModel): void {
  g.append('rect')
    .attr('width', node.width)
    .attr('height', node.height)
    .attr('rx', G.BOX_RADIUS)
    .attr('class', 'sch-body');

  for (const group of node.groups) {
    drawGroupBand(g, node, group);
  }

  const titleBlockH = G.TITLE_LINE + G.CAPTION_LINE;
  const line1Y = (node.height - titleBlockH) / 2 + G.TITLE_LINE - 3;
  const line2Y = line1Y + G.CAPTION_LINE;
  g.append('text')
    .attr('class', 'sch-title')
    .attr('text-anchor', 'middle')
    .attr('font-family', FONT_SANS)
    .attr('x', node.width / 2)
    .attr('y', line1Y)
    .text(node.label);
  g.append('text')
    .attr('class', 'sch-caption')
    .attr('text-anchor', 'middle')
    .attr('font-family', FONT_MONO)
    .attr('x', node.width / 2)
    .attr('y', line2Y)
    .text(node.caption ?? '');

  for (const port of node.ports) {
    drawBoxPortLabel(g, node, port);
  }
}

function drawTerminalNode(g: SVGGroup, node: NodeModel): void {
  const port = node.ports[0];
  if (!port) {
    return;
  }
  const busClass = port.width > 1 ? 'sch-bus' : 'sch-net';
  const cx = node.width / 2;
  const cy = node.height / 2;
  // The lead line must stop at the label's edge, not run underneath it —
  // measure the label so the two never overlap.
  const labelMetrics = measureText(node.label, G.PORT_LABEL_SIZE, FONT_MONO);
  const labelW = Math.min(labelMetrics.w, node.width);
  const labelH = Math.min(labelMetrics.h, node.height);
  let lead: { x1: number; y1: number; x2: number; y2: number };
  let label: { x: number; y: number; anchor: string };
  switch (port.side) {
    case 'EAST':
      lead = { x1: labelW, y1: cy, x2: node.width, y2: cy };
      label = { x: 0, y: cy, anchor: 'start' };
      break;
    case 'WEST':
      lead = { x1: node.width - labelW, y1: cy, x2: 0, y2: cy };
      label = { x: node.width, y: cy, anchor: 'end' };
      break;
    case 'SOUTH':
      lead = { x1: cx, y1: labelH, x2: cx, y2: node.height };
      label = { x: cx, y: 0, anchor: 'middle' };
      break;
    case 'NORTH':
      lead = { x1: cx, y1: node.height - labelH, x2: cx, y2: 0 };
      label = { x: cx, y: node.height, anchor: 'middle' };
      break;
  }
  g.append('line')
    .attr('x1', lead.x1)
    .attr('y1', lead.y1)
    .attr('x2', lead.x2)
    .attr('y2', lead.y2)
    .attr('class', busClass);
  g.append('text')
    .attr('class', 'sch-terminal-label')
    .attr('font-family', FONT_MONO)
    .attr('dominant-baseline', 'middle')
    .attr('text-anchor', label.anchor)
    .attr('x', label.x)
    .attr('y', label.y)
    .text(node.label);
}

function drawNode(root: SVGGroup, node: NodeModel, pos: Point): void {
  const g = root
    .append('g')
    .attr('class', `sch-node sch-node-${node.render}`)
    .attr('transform', `translate(${pos.x}, ${pos.y})`);
  if (node.render === 'glyph') {
    drawGlyphNode(g, node);
  } else if (node.render === 'box') {
    drawBoxNode(g, node);
  } else {
    drawTerminalNode(g, node);
  }
}

function addArrowMarker(defs: SVGGroup, id: string, tipClass: string): void {
  const w = G.ARROW_W;
  const h = G.ARROW_H;
  defs
    .append('marker')
    .attr('id', id)
    .attr('markerUnits', 'userSpaceOnUse')
    .attr('markerWidth', w + 2)
    .attr('markerHeight', h + 2)
    .attr('refX', w)
    .attr('refY', (h + 2) / 2)
    .attr('orient', 'auto')
    .append('path')
    .attr('d', `M 0 0.6 L ${w} ${(h + 2) / 2} L 0 ${h + 1.4} z`)
    .attr('class', tipClass);
}

function longestSegment(points: Point[]): { a: Point; b: Point } | undefined {
  let bestLen = -1;
  let best: { a: Point; b: Point } | undefined;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len > bestLen) {
      bestLen = len;
      best = { a, b };
    }
  }
  return best;
}

function drawWidthAnnotation(root: SVGGroup, points: Point[], width: number): void {
  const segment = longestSegment(points);
  if (!segment) {
    return;
  }
  const { a, b } = segment;
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const horizontal = Math.abs(a.y - b.y) < Math.abs(a.x - b.x);
  const tickD = horizontal
    ? `M ${mx - 5} ${my + 7} L ${mx + 5} ${my - 7}`
    : `M ${mx - 7} ${my - 5} L ${mx + 7} ${my + 5}`;
  root
    .append('path')
    .attr('d', tickD)
    .attr('stroke-width', 1.4)
    .attr('class', 'sch-bus')
    .attr('fill', 'none');
  const labelX = mx + 9;
  const labelY = horizontal ? my - 9 : my + 4;
  root
    .append('text')
    .attr('class', 'sch-net-label')
    .attr('font-family', FONT_MONO)
    .attr('x', labelX)
    .attr('y', labelY)
    .text(String(width));
}

function drawNet(
  root: SVGGroup,
  net: NetModel,
  points: Point[],
  markerTipId: string,
  markerTipBusId: string
): void {
  if (points.length < 2) {
    return;
  }
  const path = pointsToRoundedPath(points, G.EDGE_RADIUS);
  const isBus = net.width > 1;
  root
    .append('path')
    .attr('d', path)
    .attr('class', isBus ? 'sch-bus' : 'sch-net')
    .attr('marker-end', isBus ? `url(#${markerTipBusId})` : `url(#${markerTipId})`);

  if (isBus) {
    drawWidthAnnotation(root, points, net.width);
  }
}

function computeAllGeometry(model: SchematicModel): void {
  for (const node of model.nodes) {
    if (node.render === 'glyph') {
      computeGlyphNodeGeometry(node, PRIMITIVES[node.type]);
    } else if (node.render === 'box') {
      computeBoxGeometry(node);
    } else {
      computeTerminalGeometry(node);
    }
  }
}

const draw: DrawDefinition = async (_text, id, _version, diagram: Diagram) => {
  const db = diagram.db as unknown as SchematicDB;
  const config = db.getConfig();
  const model = db.getModel();

  computeAllGeometry(model);
  const layout = await layoutSchematic(model);

  const svg: SVG = selectSvgElement(id);
  svg.attr('viewBox', `0 0 ${layout.width} ${layout.height}`);
  configureSvgSize(svg, layout.height, layout.width, config.useMaxWidth);
  svg.attr('role', 'img');

  if (!db.getAccDescription()) {
    const instanceCount = model.nodes.filter((n) => n.kind === 'instance').length;
    svg
      .insert('desc', ':first-child')
      .text(`Schematic with ${instanceCount} instances and ${model.nets.length} nets.`);
  }

  const markerTipId = `${id}-sch-tip`;
  const markerTipBusId = `${id}-sch-tip-bus`;
  const defs = svg.append('defs') as unknown as SVGGroup;
  addArrowMarker(defs, markerTipId, 'sch-net-tip');
  addArrowMarker(defs, markerTipBusId, 'sch-bus-tip');

  const root = svg.append('g').attr('class', 'schematic-root') as unknown as SVGGroup;

  for (const node of model.nodes) {
    const pos = layout.nodePositions.get(node.id) ?? { x: 0, y: 0 };
    drawNode(root, node, pos);
  }

  for (const net of model.nets) {
    const points = layout.netPoints.get(net.id) ?? [];
    drawNet(root, net, points, markerTipId, markerTipBusId);
  }
};

export const renderer: DiagramRenderer = { draw };
