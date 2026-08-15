// cspell:ignore nand xnor

import { describe, expect, it } from 'vitest';
import { parser } from './parser/schematic.chevrotain.js';
import { db } from './schematicDb.js';

const parse = async (input: string) => {
  await parser.parse(input);
  return db;
};

describe('schematic parser', () => {
  it('parses the hello world diagram', async () => {
    await parse(`schematic-beta
  in a
  in b
  out y
  and g1
  a --> g1
  b --> g1
  g1 --> y
`);

    expect(db.getPorts()).toEqual([
      { id: 'a', direction: 'in' },
      { id: 'b', direction: 'in' },
      { id: 'y', direction: 'out' },
    ]);
    expect(db.getInstances()).toEqual([{ id: 'g1', type: 'and', isPrimitive: true }]);
  });

  it('auto-assigns gate inputs in source order and resolves the output', async () => {
    await parse(`schematic-beta
  in a
  in b
  out y
  and g1
  a --> g1
  b --> g1
  g1 --> y
`);

    expect(db.getNets()).toEqual([
      { source: { id: 'a' }, target: { id: 'g1', port: 'a' } },
      { source: { id: 'b' }, target: { id: 'g1', port: 'b' } },
      { source: { id: 'g1', port: 'y' }, target: { id: 'y' } },
    ]);
  });

  it('honours explicit port references', async () => {
    await parse(`schematic-beta
  in a
  and g1
  a --> g1.b
`);

    expect(db.getNets()).toEqual([{ source: { id: 'a' }, target: { id: 'g1', port: 'b' } }]);
  });

  it('extends variadic gates past their declared inputs', async () => {
    await parse(`schematic-beta
  in a
  in b
  in c
  and g1
  a --> g1
  b --> g1
  c --> g1
`);

    expect(db.getNets().map((net) => net.target.port)).toEqual(['a', 'b', 'c']);
  });

  it('resolves names declared after they are used', async () => {
    await parse(`schematic-beta
  a --> g1
  in a
  and g1
`);

    expect(db.getNets()).toEqual([{ source: { id: 'a' }, target: { id: 'g1', port: 'a' } }]);
  });

  it('treats an unknown type as a plain labelled box', async () => {
    await parse(`schematic-beta
  in a
  ALU u_alu
  a --> u_alu.a
`);

    expect(db.getInstances()).toEqual([{ id: 'u_alu', type: 'ALU', isPrimitive: false }]);
    expect(db.getNets()).toEqual([{ source: { id: 'a' }, target: { id: 'u_alu', port: 'a' } }]);
  });

  it('reads direction, comments and accessibility metadata', async () => {
    await parse(`schematic-beta
  direction TB
  %% a comment
  accTitle: Half adder
  accDescr: Sum and carry
  in a
`);

    expect(db.getDirection()).toBe('TB');
    expect(db.getAccTitle()).toBe('Half adder');
    expect(db.getAccDescription()).toBe('Sum and carry');
  });

  it('defaults to LR and accepts TD as top-down', async () => {
    await parse('schematic-beta\n  in a\n');
    expect(db.getDirection()).toBe('LR');

    await parse('schematic-beta\n  direction TD\n  in a\n');
    expect(db.getDirection()).toBe('TB');
  });

  it('lexes names that merely begin with a keyword', async () => {
    await parse(`schematic-beta
  in input
  out output
  buf b1
  input --> b1
  b1 --> output
`);

    expect(db.getPorts().map((port) => port.id)).toEqual(['input', 'output']);
  });

  describe('errors', () => {
    it.each([
      ['an unknown name', 'schematic-beta\n  in a\n  a --> missing\n', /Unknown name 'missing'/],
      [
        'a duplicate name',
        'schematic-beta\n  in a\n  and a\n',
        /Duplicate name 'a'.*port with that name/,
      ],
      [
        'overflowing a fixed-arity primitive',
        'schematic-beta\n  in a\n  in b\n  not n1\n  a --> n1\n  b --> n1\n',
        /'not' instance 'n1' takes 1 input/,
      ],
      [
        'an unknown port on a primitive',
        'schematic-beta\n  in a\n  not n1\n  n1.q --> a\n',
        /'not' instance 'n1' has no output 'q'/,
      ],
      [
        'a sub-port on a top-level port',
        'schematic-beta\n  in a\n  out y\n  a.x --> y\n',
        /'a' is a top-level port and has no sub-port 'x'/,
      ],
      ['an unknown direction', 'schematic-beta\n  direction XY\n', /Unknown direction 'XY'/],
      ['a reserved word as a name', 'schematic-beta\n  in module\n', /Error parsing schematic/],
      ['a missing header', 'in a\n', /Error parsing schematic/],
    ])('rejects %s', async (_name, input, expected) => {
      await expect(parser.parse(input)).rejects.toThrow(expected);
    });

    it('leaves the db empty after a failed parse', async () => {
      await expect(parser.parse('schematic-beta\n  a --> missing\n')).rejects.toThrow();
      expect(db.getPorts()).toEqual([]);
      expect(db.getInstances()).toEqual([]);
      expect(db.getNets()).toEqual([]);
    });
  });
});
