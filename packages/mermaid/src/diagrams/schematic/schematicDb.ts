import {
  setAccTitle,
  getAccTitle,
  setDiagramTitle,
  getDiagramTitle,
  getAccDescription,
  setAccDescription,
  clear as commonClear,
} from '../common/commonDb.js';
import { getConfig as getGlobalConfig } from '../../diagram-api/diagramAPI.js';
import type { Edge, LayoutData, Node } from '../../rendering-util/types.js';
import { sanitizeText } from '../common/common.js';
import { getAutoAssignedInput, getPrimitive, type PrimitiveSpec } from './primitives.js';
import type {
  ModuleDef,
  ModulePort,
  PortDirection,
  PortGroup,
  PortKind,
  PortSide,
  RawModulePort,
  RawPortGroup,
  SchematicDirection,
  SchematicEndpoint,
  SchematicInstance,
  SchematicNet,
  SchematicPort,
} from './schematicTypes.js';

export const DEFAULT_DIRECTION: SchematicDirection = 'LR';

const DIRECTIONS: Record<string, SchematicDirection> = {
  TB: 'TB',
  // `TD` is the flowchart spelling of top-down; accepted so muscle memory carries over.
  TD: 'TB',
  BT: 'BT',
  LR: 'LR',
  RL: 'RL',
};

interface SchematicModel {
  direction: SchematicDirection;
  ports: Map<string, SchematicPort>;
  instances: Map<string, SchematicInstance>;
  /** Module names are types, kept separate from the port/instance value namespace. */
  modules: Map<string, ModuleDef>;
  nets: SchematicNet[];
  /** Inputs already taken on each instance, so a bare `--> g1` lands on the next free one. */
  assignedInputs: Map<string, number>;
}

const createModel = (): SchematicModel => ({
  direction: DEFAULT_DIRECTION,
  ports: new Map(),
  instances: new Map(),
  modules: new Map(),
  nets: [],
  assignedInputs: new Map(),
});

let model: SchematicModel = createModel();

const assertNameIsFree = (id: string): void => {
  if (model.ports.has(id)) {
    throw new Error(`Duplicate name '${id}': a port with that name is already declared.`);
  }
  if (model.instances.has(id)) {
    throw new Error(`Duplicate name '${id}': an instance with that name is already declared.`);
  }
};

const PORT_KINDS: readonly PortKind[] = ['clock', 'reset'];
const PORT_SIDES: readonly PortSide[] = ['left', 'right', 'top', 'bottom'];

const validatePortKind = (raw: string | undefined, context: string): PortKind | undefined => {
  if (raw === undefined) {
    return undefined;
  }
  if (!(PORT_KINDS as readonly string[]).includes(raw)) {
    throw new Error(
      `Unknown port kind '${raw}' on ${context}. Expected one of: ${PORT_KINDS.join(', ')}.`
    );
  }
  return raw as PortKind;
};

const validatePortSide = (raw: string | undefined, context: string): PortSide | undefined => {
  if (raw === undefined) {
    return undefined;
  }
  if (!(PORT_SIDES as readonly string[]).includes(raw)) {
    throw new Error(
      `Unknown side '${raw}' on ${context}. Expected one of: ${PORT_SIDES.join(', ')}.`
    );
  }
  return raw as PortSide;
};

/** Adapts a module's interface to the same shape primitives.ts uses, so `resolveEndpoint`'s
 * auto-assign and dotted-port-ref validation work identically for both. Modules have fixed
 * arity — `inout` ports count as both an input and an output, but there is no variadic case. */
const moduleAsSpec = (def: ModuleDef): PrimitiveSpec => ({
  inputs: def.ports.filter((port) => port.direction !== 'out').map((port) => port.id),
  outputs: def.ports.filter((port) => port.direction !== 'in').map((port) => port.id),
  variadicInputs: false,
});

/**
 * Resolves one end of a net to a concrete port.
 *
 * A top-level port resolves to itself. An instance resolves either to the explicitly written
 * port, or — when the name was written bare — to its output (as a source) or its next free
 * input (as a target).
 *
 * @param endpoint - the endpoint as written
 * @param role - which side of the arrow it sits on
 * @returns the resolved endpoint
 */
const resolveEndpoint = (
  endpoint: SchematicEndpoint,
  role: 'source' | 'target'
): SchematicEndpoint => {
  const { id, port } = endpoint;

  if (model.ports.has(id)) {
    if (port !== undefined) {
      throw new Error(`'${id}' is a top-level port and has no sub-port '${port}'.`);
    }
    return { id };
  }

  const instance = model.instances.get(id);
  if (!instance) {
    throw new Error(`Unknown name '${id}'. Declare it as a port or instantiate it first.`);
  }

  const moduleDef = model.modules.get(instance.type);
  const spec = getPrimitive(instance.type) ?? (moduleDef ? moduleAsSpec(moduleDef) : undefined);
  if (!spec) {
    // An unknown type is a plain labelled box, so its ports cannot be checked or inferred.
    return port === undefined ? { id } : { id, port };
  }

  if (port !== undefined) {
    const known = role === 'source' ? spec.outputs : spec.inputs;
    if (!known.includes(port) && !(role === 'target' && spec.variadicInputs)) {
      throw new Error(
        `'${instance.type}' instance '${id}' has no ${role === 'source' ? 'output' : 'input'} '${port}'. Expected one of: ${known.join(', ')}.`
      );
    }
    return { id, port };
  }

  if (role === 'source') {
    return { id, port: spec.outputs[0] };
  }

  const used = model.assignedInputs.get(id) ?? 0;
  const next = getAutoAssignedInput(spec, used);
  if (next === undefined) {
    throw new Error(
      `'${instance.type}' instance '${id}' takes ${spec.inputs.length} input(s); there is no free input left to connect to.`
    );
  }
  model.assignedInputs.set(id, used + 1);
  return { id, port: next };
};

export const db = {
  clear: (): void => {
    model = createModel();
    commonClear();
  },

  setDirection: (direction: string): void => {
    const resolved = DIRECTIONS[direction];
    if (!resolved) {
      throw new Error(
        `Unknown direction '${direction}'. Expected one of: ${Object.keys(DIRECTIONS).join(', ')}.`
      );
    }
    model.direction = resolved;
  },
  getDirection: (): SchematicDirection => model.direction,

  addPort: (id: string, direction: PortDirection, rawKind?: string): void => {
    assertNameIsFree(id);
    model.ports.set(id, { id, direction, kind: validatePortKind(rawKind, `port '${id}'`) });
  },
  getPorts: (): SchematicPort[] => [...model.ports.values()],

  addModule: (name: string, rawPorts: RawModulePort[], rawGroups: RawPortGroup[]): void => {
    if (getPrimitive(name)) {
      throw new Error(`Module name '${name}' conflicts with the built-in primitive '${name}'.`);
    }
    if (model.modules.has(name)) {
      throw new Error(`Duplicate module '${name}': a module with that name is already declared.`);
    }

    const seenPortNames = new Set<string>();
    for (const port of rawPorts) {
      if (seenPortNames.has(port.id)) {
        throw new Error(`Duplicate port '${port.id}' in module '${name}'.`);
      }
      seenPortNames.add(port.id);
    }

    const seenGroupNames = new Set<string>();
    for (const group of rawGroups) {
      if (seenGroupNames.has(group.name)) {
        throw new Error(`Duplicate group '${group.name}' in module '${name}'.`);
      }
      seenGroupNames.add(group.name);
    }

    const ports: ModulePort[] = rawPorts.map((port) => ({
      id: port.id,
      direction: port.direction,
      kind: validatePortKind(port.kind, `port '${port.id}' in module '${name}'`),
      side: validatePortSide(port.side, `port '${port.id}' in module '${name}'`),
      ...(port.group ? { group: port.group } : {}),
    }));
    const groups: PortGroup[] = rawGroups.map((group) => ({
      name: group.name,
      side: validatePortSide(group.side, `group '${group.name}' in module '${name}'`),
      ports: group.ports.map((port) => port.id),
    }));

    model.modules.set(name, { name, ports, groups });
  },
  getModules: (): ModuleDef[] => [...model.modules.values()],

  addInstance: (id: string, type: string): void => {
    assertNameIsFree(id);
    model.instances.set(id, {
      id,
      type,
      isPrimitive: getPrimitive(type) !== undefined,
      isModule: model.modules.has(type),
    });
  },
  getInstances: (): SchematicInstance[] => [...model.instances.values()],

  addNet: (source: SchematicEndpoint, target: SchematicEndpoint): void => {
    // Resolve the source first so auto-assigned input indices follow source order.
    const resolvedSource = resolveEndpoint(source, 'source');
    const resolvedTarget = resolveEndpoint(target, 'target');
    model.nets.push({ source: resolvedSource, target: resolvedTarget });
  },
  getNets: (): SchematicNet[] => [...model.nets],

  setAccTitle,
  getAccTitle,
  setDiagramTitle,
  getDiagramTitle,
  setAccDescription,
  getAccDescription,

  getData: (): LayoutData => {
    const config = getGlobalConfig();
    const look = config.look;
    const schematicConfig = config.schematic;

    // The default arrowhead marker is a fixed 8x8 user-space square. Below this size it starts
    // to dominate a box's silhouette instead of sitting on its border, so nodes get a floor
    // several times larger — `width`/`height` are a minimum drawRect grows from, not a fixed size.
    const PORT_MIN_WIDTH = 56;
    const PORT_MIN_HEIGHT = 32;
    const INSTANCE_MIN_WIDTH = 72;
    const INSTANCE_MIN_HEIGHT = 44;

    const nodes: Node[] = [
      ...[...model.ports.values()].map(
        (port): Node => ({
          id: port.id,
          label: sanitizeText(port.id, config),
          shape: 'stadium',
          isGroup: false,
          padding: 8,
          width: PORT_MIN_WIDTH,
          height: PORT_MIN_HEIGHT,
          look,
          cssClasses: `default schematic-port schematic-port-${port.direction}`,
          cssStyles: [],
          cssCompiledStyles: [],
        })
      ),
      ...[...model.instances.values()].map(
        (instance): Node => ({
          id: instance.id,
          // The instance name is what nets reference, so it is the label. The type is carried by
          // the css class today and by the gate glyph once those land.
          label: sanitizeText(instance.id, config),
          shape: 'rect',
          isGroup: false,
          padding: 8,
          width: INSTANCE_MIN_WIDTH,
          height: INSTANCE_MIN_HEIGHT,
          look,
          cssClasses: `default schematic-instance schematic-instance-${instance.type}`,
          cssStyles: [],
          cssCompiledStyles: [],
        })
      ),
    ];

    const edges: Edge[] = model.nets.map((net, index) => ({
      id: `schematic-net-${index}`,
      start: net.source.id,
      end: net.target.id,
      type: 'normal',
      arrowTypeEnd: 'arrow_point',
      thickness: 'normal',
      // Wires read as right-angle runs, not smooth splines. schematicRenderer.ts picks the
      // actual curve type once it knows which layout algorithm resolved — ELK's own waypoints
      // are already orthogonal and obstacle-aware, dagre's aren't.
      look,
      classes: 'schematic-net',
    }));

    return {
      nodes,
      edges,
      config,
      direction: model.direction,
      markers: ['point'],
      diagramId: 'schematic',
      // Read directly off data4Layout by the dagre layout algorithm, ahead of config.flowchart's
      // spacing — see rendering-util/layout-algorithms/dagre/index.js.
      nodeSpacing: schematicConfig?.nodeSpacing,
      rankSpacing: schematicConfig?.rankSpacing,
    };
  },
};

export type SchematicDB = typeof db;
