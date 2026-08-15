// cspell:ignore nand xnor

/** A built-in instance type, described by its port interface. */
export interface PrimitiveSpec {
  /** Ordered default input port names. */
  inputs: string[];
  /** Ordered output port names. */
  outputs: string[];
  /**
   * Whether extra inputs beyond `inputs` may be auto-assigned. Logic gates accept any fan-in,
   * so a third `--> g1` extends the gate rather than being an error.
   */
  variadicInputs: boolean;
}

const logicGate = (inputs: string[], variadicInputs: boolean): PrimitiveSpec => ({
  inputs,
  outputs: ['y'],
  variadicInputs,
});

/**
 * Phase 1 ships the logic row only. Select, sequential and arithmetic primitives need clock
 * ports and glyphs of their own, so they arrive with the phases that introduce those.
 */
export const primitives: Record<string, PrimitiveSpec> = {
  and: logicGate(['a', 'b'], true),
  or: logicGate(['a', 'b'], true),
  xor: logicGate(['a', 'b'], true),
  nand: logicGate(['a', 'b'], true),
  nor: logicGate(['a', 'b'], true),
  xnor: logicGate(['a', 'b'], true),
  not: logicGate(['a'], false),
  buf: logicGate(['a'], false),
};

/**
 * Looks up a built-in type.
 *
 * @param type - the instantiated type name
 * @returns its spec, or undefined when the type is not built in
 */
export const getPrimitive = (type: string): PrimitiveSpec | undefined => primitives[type];

/**
 * Names the input port an auto-assigned connection should land on.
 *
 * @param spec - the instance's primitive spec
 * @param index - how many inputs have already been assigned
 * @returns the port name, or undefined when the instance is full
 */
export const getAutoAssignedInput = (spec: PrimitiveSpec, index: number): string | undefined => {
  if (index < spec.inputs.length) {
    return spec.inputs[index];
  }
  if (!spec.variadicInputs) {
    return undefined;
  }
  // Continue the a, b, c… sequence the declared inputs started.
  return String.fromCodePoint('a'.codePointAt(0)! + index);
};
