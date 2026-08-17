import type {
  Connection as ConnectionAst,
  Endpoint as EndpointAst,
  Instance as InstanceAst,
  ModuleDef as ModuleDefAst,
  ModuleMember as ModuleMemberAst,
  PortDecl as PortDeclAst,
  Schematic as SchematicAst,
  Side as SideAst,
  Width as WidthAst,
} from '@mermaid-js/parser';
import {
  isConnection,
  isInstance,
  isModuleDef,
  isPortDecl,
  isSchDirection,
  parse,
} from '@mermaid-js/parser';
import { getConfig as commonGetConfig } from '../../config.js';
import type { SchematicDiagramConfig } from '../../config.type.js';
import DEFAULT_CONFIG from '../../defaultConfig.js';
import type { ParserDefinition } from '../../diagram-api/types.js';
import { log } from '../../logger.js';
import { cleanAndMerge } from '../../utils.js';
import {
  clear as commonClear,
  getAccDescription,
  getAccTitle,
  getDiagramTitle,
  setAccDescription,
  setAccTitle,
  setDiagramTitle,
} from '../common/commonDb.js';
import { PRIMITIVES, SchematicError } from './schematicTypes.js';
import type {
  GroupModel,
  ModuleModel,
  NetModel,
  NodeModel,
  PortDir,
  PortModel,
  SchematicModel,
  Side,
} from './schematicTypes.js';

const DEFAULT_SCHEMATIC_CONFIG: Required<SchematicDiagramConfig> = DEFAULT_CONFIG[
  'schematic-beta'
] as Required<SchematicDiagramConfig>;

const SIDE_BY_VALUE: Record<string, Side> = {
  left: 'WEST',
  right: 'EAST',
  top: 'NORTH',
  bottom: 'SOUTH',
};

function resolveExplicitSide(side?: SideAst): Side | undefined {
  return side ? SIDE_BY_VALUE[side.value] : undefined;
}

function computeWidth(width: WidthAst | undefined): number {
  if (width?.lsb === undefined) {
    return 1;
  }
  if (width.msb < width.lsb) {
    throw new SchematicError('SCH-010', `invalid width [${width.msb}:${width.lsb}]`);
  }
  return width.msb - width.lsb + 1;
}

function warn(code: string, message: string): void {
  // eslint-disable-next-line no-console
  console.warn(`[schematic] ${code}: ${message}`);
}

interface FlatPort {
  ast: PortDeclAst;
  groupName?: string;
}

interface GroupDecl {
  name: string;
  explicitSide?: Side;
}

/**
 * Resolves the side + per-side index for a flat, source-ordered list of port
 * declarations belonging to one host (a module, or the top-level schematic).
 * Implements the normative order in §4.4.
 */
function resolvePorts(
  flatPorts: FlatPort[],
  groupOrder: GroupDecl[],
  hostLabel: string
): PortModel[] {
  const groupExplicitSide = new Map(
    groupOrder.filter((g) => g.explicitSide).map((g) => [g.name, g.explicitSide!])
  );
  // Dominant side (§4.4 rule 3): needs raw dir membership of each group.
  const groupDominantSide = new Map<string, Side>();
  for (const { ast, groupName } of flatPorts) {
    if (!groupName) {
      continue;
    }
    if (!groupDominantSide.has(groupName)) {
      groupDominantSide.set(groupName, 'EAST');
    }
    if (ast.dir === 'in' || ast.dir === 'inout') {
      groupDominantSide.set(groupName, 'WEST');
    }
  }

  const seenNames = new Set<string>();
  const sideCounters: Record<Side, number> = { WEST: 0, EAST: 0, NORTH: 0, SOUTH: 0 };
  const ports: PortModel[] = [];

  for (const { ast, groupName } of flatPorts) {
    if (seenNames.has(ast.name)) {
      throw new SchematicError('SCH-002', `duplicate port '${ast.name}' in module '${hostLabel}'`);
    }
    seenNames.add(ast.name);

    const width = computeWidth(ast.width);
    const explicitSide = resolveExplicitSide(ast.side);

    let side: Side;
    if (explicitSide) {
      side = explicitSide;
    } else if (groupName && groupExplicitSide.has(groupName)) {
      side = groupExplicitSide.get(groupName)!;
    } else if (groupName && groupDominantSide.has(groupName)) {
      side = groupDominantSide.get(groupName)!;
    } else if (ast.kind === 'clock' || ast.kind === 'reset') {
      side = 'SOUTH';
    } else if (ast.dir === 'in' || ast.dir === 'inout') {
      side = 'WEST';
    } else {
      side = 'EAST';
    }

    const index = sideCounters[side]++;
    ports.push({
      name: ast.name,
      dir: ast.dir as PortDir,
      width,
      kind: ast.kind,
      side,
      groupName,
      index,
      x: 0,
      y: 0,
    });
  }

  return ports;
}

/**
 * Groups declared inside a module always occupy a contiguous run of the raw
 * member list (the grammar guarantees this — a group's ports can't be
 * interrupted by anything outside the `group ... end` block). The one way to
 * violate "group members must be declared consecutively" is declaring two
 * separate `group <name> ... end` blocks with the same name inside one
 * module, which splits the group's membership into two disjoint runs.
 */
function assertGroupsNotSplit(members: ModuleMemberAst[]): void {
  const seenGroupNames = new Set<string>();
  for (const member of members) {
    if (isPortDecl(member)) {
      continue;
    }
    const group = member;
    if (seenGroupNames.has(group.name)) {
      throw new SchematicError(
        'SCH-009',
        `group '${group.name}' members must be declared consecutively`
      );
    }
    seenGroupNames.add(group.name);
  }
}

function elaborateGroups(members: ModuleMemberAst[]): {
  flatPorts: FlatPort[];
  groupOrder: { name: string; explicitSide?: Side }[];
} {
  const flatPorts: FlatPort[] = [];
  const groupOrder: { name: string; explicitSide?: Side }[] = [];
  for (const member of members) {
    if (isPortDecl(member)) {
      flatPorts.push({ ast: member });
      continue;
    }
    groupOrder.push({ name: member.name, explicitSide: resolveExplicitSide(member.side) });
    for (const port of member.ports) {
      flatPorts.push({ ast: port, groupName: member.name });
    }
  }
  return { flatPorts, groupOrder };
}

function buildGroupModels(
  ports: PortModel[],
  groupOrder: { name: string; explicitSide?: Side }[]
): GroupModel[] {
  const groups: GroupModel[] = [];
  for (const { name } of groupOrder) {
    const memberPorts = ports.filter((p) => p.groupName === name);
    if (memberPorts.length === 0) {
      continue;
    }
    // A group's members might not all share the group's own side (a member
    // can override its side individually, §4.4 rule 1). The rendered band
    // only covers members that ended up on the group's own (first member's)
    // resolved side.
    const bandSide = memberPorts[0].side;
    const onSide = memberPorts.filter((p) => p.side === bandSide);
    const indices = onSide.map((p) => p.index).sort((a, b) => a - b);
    groups.push({
      name,
      side: bandSide,
      firstIndex: indices[0],
      lastIndex: indices[indices.length - 1],
    });
  }
  return groups;
}

function elaborateModule(moduleDef: ModuleDefAst): ModuleModel {
  assertGroupsNotSplit(moduleDef.members);
  const { flatPorts, groupOrder } = elaborateGroups(moduleDef.members);
  const ports = resolvePorts(flatPorts, groupOrder, moduleDef.name);
  const groups = buildGroupModels(ports, groupOrder);
  return { name: moduleDef.name, ports, groups };
}

const INPUT_LETTERS = 'abcdefgh';

function glyphInputName(index: number): string {
  return INPUT_LETTERS[index];
}

function createGlyphPorts(minInputs: number): PortModel[] {
  const ports: PortModel[] = [];
  for (let i = 0; i < minInputs; i++) {
    ports.push({
      name: glyphInputName(i),
      dir: 'in',
      width: 1,
      side: 'WEST',
      index: i,
      x: 0,
      y: 0,
    });
  }
  ports.push({ name: 'y', dir: 'out', width: 1, side: 'EAST', index: 0, x: 0, y: 0 });
  return ports;
}

function clonePorts(ports: PortModel[]): PortModel[] {
  return ports.map((p) => ({ ...p }));
}

function portKey(nodeId: string, portName: string): string {
  return `${nodeId}.${portName}`;
}

export function elaborate(ast: SchematicAst): SchematicModel {
  // Pass 1: collect module definitions.
  const moduleDefsByName = new Map<string, ModuleDefAst>();
  for (const statement of ast.statements) {
    if (!isModuleDef(statement)) {
      continue;
    }
    if (moduleDefsByName.has(statement.name)) {
      throw new SchematicError('SCH-011', `duplicate module '${statement.name}'`);
    }
    moduleDefsByName.set(statement.name, statement);
    if (PRIMITIVES[statement.name] && statement.members.some((m) => !isPortDecl(m))) {
      throw new SchematicError(
        'SCH-002',
        `groups are not supported on primitive '${statement.name}'`
      );
    }
  }
  const moduleModels = new Map<string, ModuleModel>();
  for (const [name, def] of moduleDefsByName) {
    moduleModels.set(name, elaborateModule(def));
  }

  // Pass 2: direction, terminals, instances, connections — in source order.
  let direction: SchematicModel['direction'] = 'LR';
  const declaredNames = new Set<string>();
  const nodes: NodeModel[] = [];
  // Keyed by the raw declared name (what an Endpoint's `node` field refers
  // to) — NOT by `NodeModel.id`, which is prefixed for terminals.
  const nodesByRawName = new Map<string, NodeModel>();
  const topLevelPortAsts: PortDeclAst[] = [];
  const connections: ConnectionAst[] = [];

  for (const statement of ast.statements) {
    if (isSchDirection(statement)) {
      direction = statement.dir as SchematicModel['direction'];
    } else if (isPortDecl(statement)) {
      topLevelPortAsts.push(statement);
    } else if (isModuleDef(statement)) {
      // already handled in pass 1
    } else if (isInstance(statement)) {
      registerInstance(statement);
    } else if (isConnection(statement)) {
      connections.push(statement);
    }
  }

  for (const portAst of topLevelPortAsts) {
    registerTerminal(portAst);
  }

  function registerName(name: string): void {
    if (declaredNames.has(name)) {
      throw new SchematicError('SCH-001', `duplicate name '${name}'`);
    }
    declaredNames.add(name);
  }

  function registerTerminal(portAst: PortDeclAst): void {
    registerName(portAst.name);
    const width = computeWidth(portAst.width);
    const explicitSide = resolveExplicitSide(portAst.side);
    const flowSide: Record<SchematicModel['direction'], { in: Side; out: Side }> = {
      LR: { in: 'EAST', out: 'WEST' },
      RL: { in: 'WEST', out: 'EAST' },
      TB: { in: 'SOUTH', out: 'NORTH' },
      BT: { in: 'NORTH', out: 'SOUTH' },
    };
    const defaultSide = portAst.dir === 'in' ? flowSide[direction].in : flowSide[direction].out;
    const port: PortModel = {
      name: 'p',
      dir: portAst.dir as PortDir,
      width,
      kind: portAst.kind,
      side: explicitSide ?? defaultSide,
      index: 0,
      x: 0,
      y: 0,
    };
    const node: NodeModel = {
      id: `__term_${portAst.name}`,
      kind: 'terminal',
      type: '__terminal',
      render: 'terminal',
      label: portAst.name,
      ports: [port],
      groups: [],
      width: 0,
      height: 0,
    };
    nodes.push(node);
    nodesByRawName.set(portAst.name, node);
  }

  function registerInstance(instAst: InstanceAst): void {
    registerName(instAst.name);
    const primitive = PRIMITIVES[instAst.type];
    const moduleModel = moduleModels.get(instAst.type);
    let node: NodeModel;
    if (primitive) {
      node = {
        id: instAst.name,
        kind: 'instance',
        type: instAst.type,
        render: 'glyph',
        label: instAst.type,
        caption: instAst.name,
        ports: createGlyphPorts(primitive.minInputs),
        groups: [],
        width: 0,
        height: 0,
      };
    } else if (moduleModel) {
      node = {
        id: instAst.name,
        kind: 'instance',
        type: instAst.type,
        render: 'box',
        label: instAst.type,
        caption: instAst.name,
        ports: clonePorts(moduleModel.ports),
        groups: moduleModel.groups.map((g) => ({ ...g })),
        width: 0,
        height: 0,
      };
    } else {
      node = {
        id: instAst.name,
        kind: 'instance',
        type: instAst.type,
        render: 'box',
        label: instAst.type,
        caption: instAst.name,
        ports: [],
        groups: [],
        width: 0,
        height: 0,
      };
    }
    nodes.push(node);
    nodesByRawName.set(instAst.name, node);
  }

  // Pass 3: connections -> nets, with implicit/explicit port binding.
  const nets: NetModel[] = [];
  const boundAsTarget = new Set<string>();
  const boundAsSource = new Set<string>();
  const nextFreeWestIndex = new Map<string, number>();
  const nextFreeEastIndex = new Map<string, number>();

  function nextSideIndex(node: NodeModel, side: Side): number {
    const map = side === 'WEST' ? nextFreeWestIndex : nextFreeEastIndex;
    const current = map.get(node.id);
    if (current !== undefined) {
      map.set(node.id, current + 1);
      return current;
    }
    const existingMax = node.ports
      .filter((p) => p.side === side)
      .reduce((max, p) => Math.max(max, p.index), -1);
    map.set(node.id, existingMax + 2);
    return existingMax + 1;
  }

  function pickGlyphInput(node: NodeModel, primitive: (typeof PRIMITIVES)[string]): PortModel {
    const inputs = node.ports.filter((p) => p.name !== 'y');
    for (const p of inputs) {
      if (!boundAsTarget.has(portKey(node.id, p.name))) {
        return p;
      }
    }
    if (inputs.length >= primitive.maxInputs) {
      throw new SchematicError(
        'SCH-006',
        `'${node.id}' accepts at most ${primitive.maxInputs} inputs`
      );
    }
    const newPort: PortModel = {
      name: glyphInputName(inputs.length),
      dir: 'in',
      width: 1,
      side: 'WEST',
      index: inputs.length,
      x: 0,
      y: 0,
    };
    node.ports.splice(-1, 0, newPort);
    return newPort;
  }

  function pickBoxPort(
    node: NodeModel,
    role: 'source' | 'target',
    otherPortName: string
  ): PortModel {
    const dirs: PortDir[] = role === 'target' ? ['in', 'inout'] : ['out', 'inout'];
    const bound = role === 'target' ? boundAsTarget : boundAsSource;
    const candidates = node.ports.filter((p) => dirs.includes(p.dir));
    for (const p of candidates) {
      if (!bound.has(portKey(node.id, p.name))) {
        return p;
      }
    }
    if (node.ports.length === 0) {
      const side: Side = role === 'target' ? 'WEST' : 'EAST';
      const newPort: PortModel = {
        name: otherPortName,
        dir: role === 'target' ? 'in' : 'out',
        width: 1,
        side,
        index: nextSideIndex(node, side),
        x: 0,
        y: 0,
      };
      node.ports.push(newPort);
      return newPort;
    }
    if (candidates.length > 0) {
      // All declared ports of the matching direction are already bound;
      // reuse the first one — this will surface as SCH-005 for `in` targets.
      return candidates[0];
    }
    // No declared port of the matching direction at all: create one on demand.
    const side: Side = role === 'target' ? 'WEST' : 'EAST';
    const newPort: PortModel = {
      name: otherPortName,
      dir: role === 'target' ? 'in' : 'out',
      width: 1,
      side,
      index: nextSideIndex(node, side),
      x: 0,
      y: 0,
    };
    node.ports.push(newPort);
    return newPort;
  }

  function resolveEndpoint(
    ep: EndpointAst,
    role: 'source' | 'target',
    otherPortName: string
  ): { node: NodeModel; port: PortModel } {
    const node = nodesByRawName.get(ep.node);
    if (!node) {
      throw new SchematicError('SCH-003', `unknown node '${ep.node}'`);
    }
    if (ep.port) {
      const port = node.ports.find((p) => p.name === ep.port);
      if (!port) {
        throw new SchematicError('SCH-004', `type '${node.type}' has no port '${ep.port}'`);
      }
      return { node, port };
    }
    if (node.kind === 'terminal') {
      return { node, port: node.ports[0] };
    }
    if (node.render === 'glyph') {
      const primitive = PRIMITIVES[node.type];
      if (role === 'source') {
        return { node, port: node.ports.find((p) => p.name === 'y')! };
      }
      return { node, port: pickGlyphInput(node, primitive) };
    }
    return { node, port: pickBoxPort(node, role, otherPortName) };
  }

  let netCounter = 0;
  for (const connection of connections) {
    let currentEp: EndpointAst = connection.src;
    for (const link of connection.links) {
      if (link.arrow !== '-->') {
        throw new SchematicError('SCH-013', `arrow '${link.arrow}' is not supported yet`);
      }
      const targetEp = link.target;
      const { node: srcNode, port: srcPort } = resolveEndpoint(
        currentEp,
        'source',
        targetEp.port ?? targetEp.node
      );
      const { node: tgtNode, port: tgtPort } = resolveEndpoint(
        targetEp,
        'target',
        currentEp.port ?? currentEp.node
      );

      if (tgtPort.dir === 'in') {
        const key = portKey(tgtNode.id, tgtPort.name);
        if (boundAsTarget.has(key)) {
          throw new SchematicError(
            'SCH-005',
            `port '${tgtNode.id}.${tgtPort.name}' has multiple drivers`
          );
        }
      }
      boundAsTarget.add(portKey(tgtNode.id, tgtPort.name));
      boundAsSource.add(portKey(srcNode.id, srcPort.name));

      let width = srcPort.width;
      if (srcPort.width === 1 && tgtPort.width > 1) {
        width = tgtPort.width;
      } else if (srcPort.width > 1 && tgtPort.width > 1 && srcPort.width !== tgtPort.width) {
        warn(
          'SCH-012',
          `width mismatch on net ${srcNode.id}.${srcPort.name} -> ${tgtNode.id}.${tgtPort.name}`
        );
        width = srcPort.width;
      }

      nets.push({
        id: `net_${netCounter++}`,
        source: { node: srcNode.id, port: srcPort.name },
        target: { node: tgtNode.id, port: tgtPort.name },
        width,
      });

      currentEp = targetEp;
    }
  }

  // Pass 4: undriven-input / unconnected-output warnings (instance ports only).
  for (const node of nodes) {
    if (node.kind !== 'instance') {
      continue;
    }
    for (const port of node.ports) {
      const key = portKey(node.id, port.name);
      if (port.dir === 'in' && !boundAsTarget.has(key)) {
        warn('SCH-007', `port '${node.id}.${port.name}' is undriven`);
      } else if (port.dir === 'out' && !boundAsSource.has(key)) {
        warn('SCH-008', `port '${node.id}.${port.name}' is unconnected`);
      }
    }
  }

  return { direction, nodes, nets };
}

export class SchematicDB {
  private model: SchematicModel = { direction: 'LR', nodes: [], nets: [] };

  public getConfig(): Required<SchematicDiagramConfig> {
    return cleanAndMerge({
      ...DEFAULT_SCHEMATIC_CONFIG,
      ...commonGetConfig()['schematic-beta'],
    });
  }

  public setModel(model: SchematicModel): void {
    this.model = model;
  }

  public getModel(): SchematicModel {
    return this.model;
  }

  public clear(): void {
    commonClear();
    this.model = { direction: 'LR', nodes: [], nets: [] };
  }

  public setAccTitle = setAccTitle;
  public getAccTitle = getAccTitle;
  public setDiagramTitle = setDiagramTitle;
  public getDiagramTitle = getDiagramTitle;
  public getAccDescription = getAccDescription;
  public setAccDescription = setAccDescription;
}

export const parser: ParserDefinition = {
  // @ts-expect-error - SchematicDB is not assignable to DiagramDB
  parser: { yy: undefined },
  parse: async (input: string): Promise<void> => {
    const ast = await parse('schematic', input);
    const db = parser.parser?.yy;
    if (!(db instanceof SchematicDB)) {
      throw new Error(
        'parser.parser?.yy was not a SchematicDB. This is due to a bug within Mermaid, please report this issue at https://github.com/mermaid-js/mermaid/issues.'
      );
    }
    log.debug(ast);
    db.setModel(elaborate(ast));
  },
};
