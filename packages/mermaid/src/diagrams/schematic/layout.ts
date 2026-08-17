import ELK from 'elkjs/lib/elk.bundled.js';
import type { ElkExtendedEdge, ElkNode } from 'elkjs/lib/elk-api.js';
import { G } from './geometry.js';
import type { NodeModel, SchematicModel } from './schematicTypes.js';

export interface Point {
  x: number;
  y: number;
}

export interface LayoutResult {
  width: number;
  height: number;
  nodePositions: Map<string, Point>;
  netPoints: Map<string, Point[]>;
}

const ELK_DIRECTION: Record<SchematicModel['direction'], string> = {
  LR: 'RIGHT',
  RL: 'LEFT',
  TB: 'DOWN',
  BT: 'UP',
};

function terminalConstraint(node: NodeModel): 'FIRST_SEPARATE' | 'LAST_SEPARATE' {
  return node.ports[0]?.dir === 'in' ? 'FIRST_SEPARATE' : 'LAST_SEPARATE';
}

function portId(nodeId: string, portName: string): string {
  return `${nodeId}__${portName}`;
}

export async function layoutSchematic(model: SchematicModel): Promise<LayoutResult> {
  // @ts-expect-error - elkjs's bundled .d.ts default-exports a construct signature that
  // TS's `nodenext` resolution doesn't pick up here; `mermaid-layout-elk` hits the same
  // false positive with the identical import (packages/mermaid-layout-elk/src/render.ts).
  const elk = new ELK();

  const graph: ElkNode = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': ELK_DIRECTION[model.direction],
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.spacing.nodeNode': '40',
      'elk.layered.spacing.nodeNodeBetweenLayers': '64',
      'elk.spacing.edgeNode': '16',
      'elk.spacing.edgeEdge': '12',
      'elk.layered.spacing.edgeNodeBetweenLayers': '20',
      'elk.layered.mergeEdges': 'false',
      'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
      'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
      'elk.padding': '[top=16,left=16,bottom=16,right=16]',
    },
    children: model.nodes.map((n) => ({
      id: n.id,
      width: n.width,
      height: n.height,
      layoutOptions: {
        'elk.portConstraints': 'FIXED_POS',
        ...(n.kind === 'terminal'
          ? { 'elk.layered.layering.layerConstraint': terminalConstraint(n) }
          : {}),
      },
      ports: n.ports.map((p) => ({
        id: portId(n.id, p.name),
        x: p.x,
        y: p.y,
        width: 0,
        height: 0,
        layoutOptions: { 'elk.port.side': p.side },
      })),
    })),
    edges: model.nets.map((e) => ({
      id: e.id,
      sources: [portId(e.source.node, e.source.port)],
      targets: [portId(e.target.node, e.target.port)],
    })),
  };

  const laidOut = await elk.layout(graph);

  const nodePositions = new Map<string, Point>();
  for (const child of laidOut.children ?? []) {
    nodePositions.set(child.id, { x: child.x ?? 0, y: child.y ?? 0 });
  }

  const netPoints = new Map<string, Point[]>();
  for (const edge of (laidOut.edges ?? []) as ElkExtendedEdge[]) {
    const points: Point[] = [];
    for (const section of edge.sections ?? []) {
      points.push(section.startPoint, ...(section.bendPoints ?? []), section.endPoint);
    }
    netPoints.set(edge.id, points);
  }

  return {
    width: laidOut.width ?? 0,
    height: laidOut.height ?? 0,
    nodePositions,
    netPoints,
  };
}

function dist(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function pointAt(from: Point, toward: Point, d: number): Point {
  const len = dist(from, toward);
  if (len === 0) {
    return { ...from };
  }
  const t = d / len;
  return { x: from.x + (toward.x - from.x) * t, y: from.y + (toward.y - from.y) * t };
}

/**
 * Converts a polyline into an SVG path with rounded corners (§6.3): at each
 * interior vertex, cut back `min(EDGE_RADIUS, prevSegLen/2, nextSegLen/2)`
 * along both segments and join with a quadratic Bézier whose control point
 * is the vertex. A cut-back under 1px emits a plain corner instead.
 */
export function pointsToRoundedPath(points: Point[], radius: number = G.EDGE_RADIUS): string {
  if (points.length === 0) {
    return '';
  }
  if (points.length === 1) {
    return `M ${points[0].x} ${points[0].y}`;
  }
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const cur = points[i];
    const next = points[i + 1];
    const cut = Math.min(radius, dist(prev, cur) / 2, dist(cur, next) / 2);
    if (cut < 1) {
      d += ` L ${cur.x} ${cur.y}`;
      continue;
    }
    const p1 = pointAt(cur, prev, cut);
    const p2 = pointAt(cur, next, cut);
    d += ` L ${p1.x} ${p1.y} Q ${cur.x} ${cur.y} ${p2.x} ${p2.y}`;
  }
  const last = points[points.length - 1];
  d += ` L ${last.x} ${last.y}`;
  return d;
}
