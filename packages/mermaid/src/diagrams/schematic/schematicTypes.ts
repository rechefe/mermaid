export type PortDirection = 'in' | 'out' | 'inout';

export type SchematicDirection = 'TB' | 'BT' | 'LR' | 'RL';

/** Gives `dff`-style primitives a standard glyph and, once rendering is port-aware, routes the
 * signal to the side its kind conventionally sits on. Neither primitives nor rendering use this
 * yet — it exists so a module's own port declarations can carry the same metadata phase 3's
 * primitives will need. */
export type PortKind = 'clock' | 'reset';

/** Which edge of an instance's box a port is pinned to. Parsed and validated now; not yet used
 * by rendering, which still draws every instance as a single unlabelled-port box — see
 * schematicRenderer.ts. */
export type PortSide = 'left' | 'right' | 'top' | 'bottom';

/** A top-level interface signal of the schematic itself. */
export interface SchematicPort {
  id: string;
  direction: PortDirection;
  kind?: PortKind;
}

/**
 * Pre-validation shapes the visitor hands to schematicDb.ts. `kind`/`side` are the identifier
 * text as written — schematicDb's `addModule`/`addPort` check them against `PortKind`/`PortSide`
 * and narrow them, the same way `setDirection` validates its own raw string today.
 */
export interface RawModulePort {
  id: string;
  direction: PortDirection;
  kind?: string;
  side?: string;
  group?: string;
}
export interface RawPortGroup {
  name: string;
  side?: string;
  ports: RawModulePort[];
}

/** A port on a user-defined module's interface. */
export interface ModulePort {
  id: string;
  direction: PortDirection;
  kind?: PortKind;
  /** Explicit per-port override. Wins over the port's group side, if any. */
  side?: PortSide;
  /** Name of the enclosing `group`, if this port was declared inside one. */
  group?: string;
}

/** A `group <name> @side` block: a contiguous, ordered run of one module's ports pinned to one
 * edge together, so a multi-signal channel (e.g. a ready/valid handshake) reads as one unit
 * instead of being split across sides by direction. */
export interface PortGroup {
  name: string;
  /** Undefined until a renderer resolves it from the group's member ports' dominant direction —
   * see the `group @side` design note in schematicDb.ts's `addModule`. */
  side?: PortSide;
  /** Port ids in declaration order — declaration order is pin order along that edge. */
  ports: string[];
}

/** A `module <Name> ... end` interface declaration: ports only, no internal wiring. */
export interface ModuleDef {
  name: string;
  /** All of the module's ports, in declaration order, both grouped and ungrouped. */
  ports: ModulePort[];
  groups: PortGroup[];
}

/** An instantiated block: a built-in primitive, a declared `module`, or a plain labelled box for
 * an unrecognized type — matching Mermaid's sketch-first behavior, a schematic with undeclared
 * or half-specified types still renders. */
export interface SchematicInstance {
  id: string;
  type: string;
  isPrimitive: boolean;
  /** True when `type` names a declared module — checked at `addInstance` time, so it reflects
   * whichever modules were already known then. */
  isModule: boolean;
}

/** One end of a net: a top-level port, or a named port on an instance. */
export interface SchematicEndpoint {
  id: string;
  /** Undefined for top-level ports, which carry no sub-port of their own. */
  port?: string;
}

export interface SchematicNet {
  source: SchematicEndpoint;
  target: SchematicEndpoint;
}
