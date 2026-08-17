import { describe, expect, it } from 'vitest';
import { parser } from './parser/schematic.chevrotain.js';
import { db } from './schematicDb.js';

const parse = async (input: string) => {
  await parser.parse(input);
  return db;
};

describe('schematic modules', () => {
  it('declares a module interface without wiring', async () => {
    await parse(`schematic-beta
  module ALU
    in  a
    in  b
    in  op
    out y
    out zero
  end
`);

    expect(db.getModules()).toEqual([
      {
        name: 'ALU',
        ports: [
          { id: 'a', direction: 'in' },
          { id: 'b', direction: 'in' },
          { id: 'op', direction: 'in' },
          { id: 'y', direction: 'out' },
          { id: 'zero', direction: 'out' },
        ],
        groups: [],
      },
    ]);
  });

  it('instantiates a module and marks it as such', async () => {
    await parse(`schematic-beta
  module ALU
    in a
    out y
  end
  ALU u_alu
`);

    expect(db.getInstances()).toEqual([
      { id: 'u_alu', type: 'ALU', isPrimitive: false, isModule: true },
    ]);
  });

  it('resolves a module declared after it is instantiated', async () => {
    await parse(`schematic-beta
  ALU u_alu
  module ALU
    in a
    out y
  end
`);

    expect(db.getInstances()).toEqual([
      { id: 'u_alu', type: 'ALU', isPrimitive: false, isModule: true },
    ]);
  });

  it('auto-assigns into a module instance’s declared input ports, in order', async () => {
    await parse(`schematic-beta
  module ALU
    in a
    in b
    in op
    out y
  end
  in x
  in w
  in o
  out y
  ALU u_alu
  x --> u_alu
  w --> u_alu
  o --> u_alu
  u_alu --> y
`);

    expect(db.getNets()).toEqual([
      { source: { id: 'x' }, target: { id: 'u_alu', port: 'a' } },
      { source: { id: 'w' }, target: { id: 'u_alu', port: 'b' } },
      { source: { id: 'o' }, target: { id: 'u_alu', port: 'op' } },
      { source: { id: 'u_alu', port: 'y' }, target: { id: 'y' } },
    ]);
  });

  it('honours explicit dotted port references on a module instance', async () => {
    await parse(`schematic-beta
  module ALU
    in a
    in b
    out y
  end
  in x
  ALU u_alu
  x --> u_alu.b
`);

    expect(db.getNets()).toEqual([{ source: { id: 'x' }, target: { id: 'u_alu', port: 'b' } }]);
  });

  it('treats inout ports as both an input and an output for resolution', async () => {
    await parse(`schematic-beta
  module Pad
    inout pin
  end
  Pad u_pad
  u_pad --> u_pad
`);

    expect(db.getNets()).toEqual([
      { source: { id: 'u_pad', port: 'pin' }, target: { id: 'u_pad', port: 'pin' } },
    ]);
  });

  it('parses groups, tagging their member ports in declaration order', async () => {
    await parse(`schematic-beta
  module Consumer
    in clk
    group s_axis @left
      in  tvalid
      out tready
      in  tdata
    end
    out done
  end
`);

    expect(db.getModules()).toEqual([
      {
        name: 'Consumer',
        ports: [
          { id: 'clk', direction: 'in' },
          { id: 'tvalid', direction: 'in', group: 's_axis' },
          { id: 'tready', direction: 'out', group: 's_axis' },
          { id: 'tdata', direction: 'in', group: 's_axis' },
          { id: 'done', direction: 'out' },
        ],
        groups: [{ name: 's_axis', side: 'left', ports: ['tvalid', 'tready', 'tdata'] }],
      },
    ]);
  });

  it('leaves an ungrouped port’s side undefined, and a sideless group’s side undefined', async () => {
    await parse(`schematic-beta
  module M
    in a @top
    in b
    group g
      in c
    end
  end
`);

    const [m] = db.getModules();
    expect(m.ports.find((p) => p.id === 'a')?.side).toBe('top');
    expect(m.ports.find((p) => p.id === 'b')?.side).toBeUndefined();
    expect(m.groups[0].side).toBeUndefined();
  });

  it('parses port kind on both top-level and module ports', async () => {
    await parse(`schematic-beta
  in clk : clock
  module Reg8
    in clk : clock
    in rst_n : reset
    in d
    out q
  end
`);

    expect(db.getPorts()).toEqual([{ id: 'clk', direction: 'in', kind: 'clock' }]);
    const [reg] = db.getModules();
    expect(reg.ports[0]).toEqual({ id: 'clk', direction: 'in', kind: 'clock' });
    expect(reg.ports[1]).toEqual({ id: 'rst_n', direction: 'in', kind: 'reset' });
  });

  describe('errors', () => {
    it.each([
      [
        'a module name colliding with a primitive',
        'schematic-beta\n  module and\n    in a\n  end\n',
        /Module name 'and' conflicts with the built-in primitive/,
      ],
      [
        'a duplicate module name',
        'schematic-beta\n  module M\n    in a\n  end\n  module M\n    in b\n  end\n',
        /Duplicate module 'M'/,
      ],
      [
        'a duplicate port name within a module',
        'schematic-beta\n  module M\n    in a\n    out a\n  end\n',
        /Duplicate port 'a' in module 'M'/,
      ],
      [
        'a duplicate group name within a module',
        'schematic-beta\n  module M\n    group g\n      in a\n    end\n    group g\n      in b\n    end\n  end\n',
        /Duplicate group 'g' in module 'M'/,
      ],
      [
        'an unknown port kind',
        'schematic-beta\n  module M\n    in a : weird\n  end\n',
        /Unknown port kind 'weird'/,
      ],
      [
        'an unknown side',
        'schematic-beta\n  module M\n    in a @sideways\n  end\n',
        /Unknown side 'sideways'/,
      ],
      [
        'an unknown port on a module instance',
        'schematic-beta\n  module M\n    in a\n  end\n  in x\n  M u1\n  x --> u1.nope\n',
        /'M' instance 'u1' has no input 'nope'. Expected one of: a/,
      ],
      [
        'overflowing a module instance’s fixed arity',
        'schematic-beta\n  module M\n    in a\n  end\n  in x\n  in y\n  M u1\n  x --> u1\n  y --> u1\n',
        /'M' instance 'u1' takes 1 input/,
      ],
    ])('rejects %s', async (_name, input, expected) => {
      await expect(parser.parse(input)).rejects.toThrow(expected);
    });

    it('leaves the db empty after a failed module parse', async () => {
      await expect(
        parser.parse('schematic-beta\n  module and\n    in a\n  end\n')
      ).rejects.toThrow();
      expect(db.getModules()).toEqual([]);
    });
  });
});
