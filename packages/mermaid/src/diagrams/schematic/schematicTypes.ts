import type { SchematicDiagramConfig } from '../../config.type.js';
import type { DiagramDBBase } from '../../diagram-api/types.js';

export type Side = 'WEST' | 'EAST' | 'NORTH' | 'SOUTH';
export type PortDir = 'in' | 'out' | 'inout';

export interface PortModel {
  name: string;
  dir: PortDir;
  width: number; // 1 when undeclared
  kind?: string; // 'clock' | 'reset' | any user string
  side: Side; // resolved per §4.4 — never undefined after elaboration
  groupName?: string;
  index: number; // position within its side, 0-based, source order
  x: number; // set in §5, relative to node origin
  y: number;
}

export interface GroupModel {
  name: string;
  side: Side;
  firstIndex: number; // inclusive, index within side
  lastIndex: number; // inclusive
}

export interface ModuleModel {
  name: string;
  ports: PortModel[]; // source order preserved
  groups: GroupModel[];
}

export type NodeRender = 'glyph' | 'box' | 'terminal';
export type NodeKind = 'instance' | 'terminal';

export interface NodeModel {
  id: string; // instance name, or `__term_<portName>` for terminals
  kind: NodeKind;
  type: string; // primitive name, module name, or '__terminal'
  render: NodeRender;
  label: string; // box title / terminal text
  caption?: string; // instance name under a glyph
  ports: PortModel[];
  groups: GroupModel[];
  width: number; // computed in §5
  height: number;
}

export interface NetModel {
  id: string; // 'net_<n>', allocation order
  source: { node: string; port: string };
  target: { node: string; port: string };
  width: number; // resolved per §4.6
}

export interface SchematicModel {
  direction: 'LR' | 'RL' | 'TB' | 'BT'; // default 'LR'
  nodes: NodeModel[];
  nets: NetModel[];
}

export interface SchematicDB extends DiagramDBBase<SchematicDiagramConfig> {
  getModel: () => SchematicModel;
}

export interface GlyphShapeDef {
  render: 'glyph';
  shape: 'and' | 'or' | 'xor' | 'buf';
  inverting: boolean;
  minInputs: number;
  maxInputs: number;
}

export const PRIMITIVES: Record<string, GlyphShapeDef> = {
  and: { render: 'glyph', shape: 'and', inverting: false, minInputs: 2, maxInputs: 8 },
  nand: { render: 'glyph', shape: 'and', inverting: true, minInputs: 2, maxInputs: 8 },
  or: { render: 'glyph', shape: 'or', inverting: false, minInputs: 2, maxInputs: 8 },
  nor: { render: 'glyph', shape: 'or', inverting: true, minInputs: 2, maxInputs: 8 },
  xor: { render: 'glyph', shape: 'xor', inverting: false, minInputs: 2, maxInputs: 8 },
  xnor: { render: 'glyph', shape: 'xor', inverting: true, minInputs: 2, maxInputs: 8 },
  not: { render: 'glyph', shape: 'buf', inverting: true, minInputs: 1, maxInputs: 1 },
  buf: { render: 'glyph', shape: 'buf', inverting: false, minInputs: 1, maxInputs: 1 },
};

export type SchematicErrorCode =
  | 'SCH-001'
  | 'SCH-002'
  | 'SCH-003'
  | 'SCH-004'
  | 'SCH-005'
  | 'SCH-006'
  | 'SCH-007'
  | 'SCH-008'
  | 'SCH-009'
  | 'SCH-010'
  | 'SCH-011'
  | 'SCH-012'
  | 'SCH-013';

export class SchematicError extends Error {
  public code: SchematicErrorCode;
  constructor(code: SchematicErrorCode, message: string) {
    super(`${code}: ${message}`);
    this.code = code;
  }
}
