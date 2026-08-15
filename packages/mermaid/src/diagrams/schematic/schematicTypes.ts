export type PortDirection = 'in' | 'out' | 'inout';

export type SchematicDirection = 'TB' | 'BT' | 'LR' | 'RL';

/** A top-level interface signal of the schematic itself. */
export interface SchematicPort {
  id: string;
  direction: PortDirection;
}

/** An instantiated block: a built-in primitive, or a plain labelled box for unknown types. */
export interface SchematicInstance {
  id: string;
  type: string;
  /** False when `type` is not a built-in, which renders as a plain labelled box. */
  isPrimitive: boolean;
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
