import { parse } from '@mermaid-js/parser';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { elaborate } from './schematicDb.js';

async function elaborateSource(src: string) {
  const ast = await parse('schematic', src);
  return elaborate(ast);
}

async function expectCode(src: string, code: string) {
  const ast = await parse('schematic', src);
  try {
    elaborate(ast);
    throw new Error(`expected ${code} to be thrown`);
  } catch (e) {
    expect((e as Error).message).toContain(code);
  }
}

describe('schematicDb elaboration', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  it('defaults direction to LR', async () => {
    const model = await elaborateSource(`schematic-beta\n  in a`);
    expect(model.direction).toBe('LR');
  });

  it('resolves an explicit direction', async () => {
    const model = await elaborateSource(`schematic-beta\n  direction TB\n  in a`);
    expect(model.direction).toBe('TB');
  });

  it('elaborates fixture A (primitives)', async () => {
    const model = await elaborateSource(`schematic-beta
  in a
  in b
  out y

  and g1
  a  --> g1
  b  --> g1
  g1 --> y
`);
    expect(model.nodes).toHaveLength(4);
    expect(model.nets).toHaveLength(3);
    const g1 = model.nodes.find((n) => n.id === 'g1')!;
    expect(g1.render).toBe('glyph');
    expect(g1.ports.map((p) => p.name)).toEqual(['a', 'b', 'y']);

    const termA = model.nodes.find((n) => n.id === '__term_a')!;
    expect(termA.ports[0].side).toBe('EAST'); // in terminal, LR direction
    const termY = model.nodes.find((n) => n.id === '__term_y')!;
    expect(termY.ports[0].side).toBe('WEST'); // out terminal, LR direction
  });

  it('elaborates fixture B (modules and sides)', async () => {
    const model = await elaborateSource(`schematic-beta
  direction LR

  in  clk : clock
  in  a
  in  b
  out q

  module ALU
    in  a
    in  b
    out y
  end

  module Reg8
    in  clk : clock
    in  d
    out q
  end

  ALU  u_alu
  Reg8 u_q

  a --> u_alu.a
  b --> u_alu.b
  u_alu.y --> u_q.d
  clk --> u_q.clk
  u_q.q --> q
`);
    expect(model.nodes).toHaveLength(6);
    expect(model.nets).toHaveLength(5);
    const uAlu = model.nodes.find((n) => n.id === 'u_alu')!;
    expect(uAlu.render).toBe('box');
    expect(uAlu.ports.map((p) => p.name)).toEqual(['a', 'b', 'y']);
    const uq = model.nodes.find((n) => n.id === 'u_q')!;
    const clkPort = uq.ports.find((p) => p.name === 'clk')!;
    expect(clkPort.side).toBe('SOUTH'); // kind: clock
  });

  it('elaborates fixture C (groups)', async () => {
    const model = await elaborateSource(`schematic-beta
  direction LR

  module Producer
    group m_axis @right
      out tvalid
      in  tready
      out tdata
    end
  end

  module Consumer
    group s_axis @left
      in  tvalid
      out tready
      in  tdata
    end
  end

  Producer u_src
  Consumer u_sink

  u_src.tvalid  --> u_sink.tvalid
  u_sink.tready --> u_src.tready
  u_src.tdata   --> u_sink.tdata
`);
    const uSrc = model.nodes.find((n) => n.id === 'u_src')!;
    expect(uSrc.groups).toHaveLength(1);
    expect(uSrc.groups[0]).toMatchObject({
      name: 'm_axis',
      side: 'EAST',
      firstIndex: 0,
      lastIndex: 2,
    });
  });

  it('elaborates fixture D (widths)', async () => {
    const model = await elaborateSource(`schematic-beta
  in  a[7:0]
  out y[7:0]

  module Buf8
    in  d[7:0]
    out q[7:0]
  end

  Buf8 u0
  a --> u0.d
  u0.q --> y
`);
    expect(model.nets.every((n) => n.width === 8)).toBe(true);
  });

  it('SCH-001: duplicate name', async () => {
    await expectCode(`schematic-beta\n  in a\n  in a`, 'SCH-001');
  });

  it('SCH-002: duplicate port name in a module', async () => {
    await expectCode(`schematic-beta\n  module M\n    in a\n    in a\n  end`, 'SCH-002');
  });

  it('SCH-002: groups are not supported on a primitive-named module', async () => {
    await expectCode(
      `schematic-beta\n  module and\n    group g\n      in a\n    end\n  end`,
      'SCH-002'
    );
  });

  it('SCH-003: unknown node', async () => {
    await expectCode(`schematic-beta\n  in a\n  a --> nonexistent`, 'SCH-003');
  });

  it('SCH-004: explicit port not present on a resolved type', async () => {
    await expectCode(
      `schematic-beta\n  in a\n  module M\n    in x\n  end\n  M u1\n  a --> u1.zzz`,
      'SCH-004'
    );
  });

  it('SCH-005: two nets drive the same in port', async () => {
    await expectCode(
      `schematic-beta
  in a
  in b
  module M
    in x
    out y
  end
  M u1
  a --> u1.x
  b --> u1.x`,
      'SCH-005'
    );
  });

  it('SCH-006: implicit inputs exhausted on a glyph', async () => {
    await expectCode(
      `schematic-beta
  in a
  in b
  in c
  in d
  in e
  in f
  in g
  in h
  in i
  and g1
  a --> g1
  b --> g1
  c --> g1
  d --> g1
  e --> g1
  f --> g1
  g --> g1
  h --> g1
  i --> g1`,
      'SCH-006'
    );
  });

  it('SCH-007: declared in port with no driver (warning)', async () => {
    const model = await elaborateSource(`schematic-beta
  module M
    in a
    out b
  end
  M u1`);
    expect(model.nodes.find((n) => n.id === 'u1')).toBeDefined();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('SCH-007'));
  });

  it('SCH-008: declared out port unused (warning)', async () => {
    await elaborateSource(`schematic-beta
  module M
    in a
    out b
  end
  M u1`);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('SCH-008'));
  });

  it('SCH-009: group members must be declared consecutively', async () => {
    await expectCode(
      `schematic-beta
  module M
    group g
      out a
    end
    group g
      out b
    end
  end`,
      'SCH-009'
    );
  });

  it('SCH-010: invalid width (msb < lsb)', async () => {
    await expectCode(`schematic-beta\n  in a[3:7]`, 'SCH-010');
  });

  it('SCH-011: duplicate module', async () => {
    await expectCode(
      `schematic-beta\n  module M\n    in a\n  end\n  module M\n    in b\n  end`,
      'SCH-011'
    );
  });

  it('SCH-012: width mismatch (warning, renders using source width)', async () => {
    const model = await elaborateSource(`schematic-beta
  in a[7:0]
  module M
    in x[3:0]
  end
  M u1
  a --> u1.x`);
    expect(model.nets[0].width).toBe(8);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('SCH-012'));
  });

  it('SCH-013: unsupported arrow', async () => {
    await expectCode(`schematic-beta\n  in a\n  in b\n  a ==> b`, 'SCH-013');
  });
});
