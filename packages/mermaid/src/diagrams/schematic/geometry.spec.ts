import { describe, expect, it } from 'vitest';
import {
  computeBoxGeometry,
  computeGlyphGeometry,
  computeGroupBand,
  measureText,
} from './geometry.js';
import type { GroupModel, NodeModel, PortModel } from './schematicTypes.js';

// §5.2: unit tests use the fallback measurer (`w = text.length * size * 0.6`)
// so expected numbers are stable — jsdom (this repo's test DOM) does not
// implement `SVGElement.getBBox()`, so `measureText` falls back automatically.

function port(overrides: Partial<PortModel>): PortModel {
  return {
    name: 'p',
    dir: 'in',
    width: 1,
    side: 'WEST',
    index: 0,
    x: 0,
    y: 0,
    ...overrides,
  };
}

describe('geometry: glyph bodies (§5.3)', () => {
  it('and gate, 2 inputs', () => {
    const g = computeGlyphGeometry('and', false, 2);
    expect(g.glyphH).toBe(48);
    expect(g.nodeW).toBe(52);
    expect(g.nodeH).toBe(68);
    expect(g.inputs.map((p) => p.y)).toEqual([12, 36]);
    expect(g.output).toMatchObject({ x: 52, y: 24 });
  });

  it('nand, 2 inputs', () => {
    const g = computeGlyphGeometry('and', true, 2);
    expect(g.nodeW).toBe(62);
    expect(g.output.x).toBe(62);
  });

  it('and, 3 inputs', () => {
    const g = computeGlyphGeometry('and', false, 3);
    expect(g.glyphH).toBe(72);
    expect(g.inputs.map((p) => p.y)).toEqual([12, 36, 60]);
  });

  it('xor, 2 inputs', () => {
    const g = computeGlyphGeometry('xor', false, 2);
    expect(g.nodeW).toBe(62);
    expect(g.inputs.every((p) => p.x === 6)).toBe(true);
  });

  it('not', () => {
    const g = computeGlyphGeometry('buf', true, 1);
    expect(g.glyphH).toBe(48);
    expect(g.nodeW).toBe(50);
    expect(g.inputs).toHaveLength(1);
    expect(g.inputs[0].y).toBe(24);
  });
});

describe('geometry: box bodies (§5.4)', () => {
  it('box, no ports, type ALU, instance u_alu', () => {
    const node: NodeModel = {
      id: 'u_alu',
      kind: 'instance',
      type: 'ALU',
      render: 'box',
      label: 'ALU',
      caption: 'u_alu',
      ports: [],
      groups: [],
      width: 0,
      height: 0,
    };
    computeBoxGeometry(node, measureText);
    expect(node.width).toBe(96);
    expect(node.height).toBe(56);
  });

  it('box, 3 WEST ports, 1 EAST port', () => {
    const node: NodeModel = {
      id: 'u1',
      kind: 'instance',
      type: 'M',
      render: 'box',
      label: 'M',
      caption: 'u1',
      ports: [
        port({ name: 'a', side: 'WEST', index: 0 }),
        port({ name: 'b', side: 'WEST', index: 1 }),
        port({ name: 'c', side: 'WEST', index: 2 }),
        port({ name: 'y', dir: 'out', side: 'EAST', index: 0 }),
      ],
      groups: [],
      width: 0,
      height: 0,
    };
    computeBoxGeometry(node, measureText);
    expect(node.height).toBe(84);
  });

  it('box, 2 WEST + 1 EAST ports with wide labels', () => {
    const node: NodeModel = {
      id: 'u1',
      kind: 'instance',
      type: 'M',
      render: 'box',
      label: 'M',
      caption: 'u1',
      ports: [
        port({ name: 'a', width: 8, side: 'WEST', index: 0 }),
        port({ name: 'b', width: 8, side: 'WEST', index: 1 }),
        port({ name: 'y', dir: 'out', width: 8, side: 'EAST', index: 0 }),
      ],
      groups: [],
      width: 0,
      height: 0,
    };
    computeBoxGeometry(node, measureText);
    const titleW = Math.max('M'.length * 14 * 0.6, 'u1'.length * 11 * 0.6);
    const expected = Math.ceil(8 + 39.6 + 8 + 39.6 + titleW + 32);
    expect(node.width).toBe(expected);
  });
});

describe('geometry: group bands (§5.6)', () => {
  it('group of 3 on WEST, pitch 24, node height 108', () => {
    const node: NodeModel = {
      id: 'u1',
      kind: 'instance',
      type: 'M',
      render: 'box',
      label: 'M',
      caption: 'u1',
      ports: [
        port({ name: 'a', side: 'WEST', index: 0, groupName: 'g', y: 30 }),
        port({ name: 'b', side: 'WEST', index: 1, groupName: 'g', y: 54 }),
        port({ name: 'c', side: 'WEST', index: 2, groupName: 'g', y: 78 }),
      ],
      groups: [],
      width: 96,
      height: 108,
    };
    const group: GroupModel = { name: 'g', side: 'WEST', firstIndex: 0, lastIndex: 2 };
    const band = computeGroupBand(group, node);
    expect(band.y).toBe(30 - 12);
    expect(band.h).toBe(72);
  });
});
