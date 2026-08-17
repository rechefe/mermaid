import { describe, expect, it } from 'vitest';

import { Schematic } from '../src/language/index.js';
import { expectNoErrorsOrAlternatives, schematicParse as parse } from './test-util.js';

describe('schematic', () => {
  it('should handle a bare header', () => {
    const result = parse(`schematic-beta`);
    expectNoErrorsOrAlternatives(result);
    expect(result.value.$type).toBe(Schematic.$type);
    expect(result.value.statements).toHaveLength(0);
  });

  it.each(['LR', 'RL', 'TB', 'BT'])('should handle direction %s', (dir) => {
    const result = parse(`schematic-beta\n  direction ${dir}`);
    expectNoErrorsOrAlternatives(result);
    expect(result.value.statements).toHaveLength(1);
  });

  it.each(['in', 'out', 'inout'])('should handle a %s port declaration', (dir) => {
    const result = parse(`schematic-beta\n  ${dir} a`);
    expectNoErrorsOrAlternatives(result);
    expect(result.value.statements).toHaveLength(1);
  });

  it('should handle a width [7:0]', () => {
    const result = parse(`schematic-beta\n  in a[7:0]`);
    expectNoErrorsOrAlternatives(result);
  });

  it('should handle a width [8]', () => {
    const result = parse(`schematic-beta\n  in a[8]`);
    expectNoErrorsOrAlternatives(result);
  });

  it('should handle a port kind', () => {
    const result = parse(`schematic-beta\n  in clk : clock`);
    expectNoErrorsOrAlternatives(result);
  });

  it.each(['left', 'right', 'top', 'bottom'])('should handle side @%s', (side) => {
    const result = parse(`schematic-beta\n  in a @${side}`);
    expectNoErrorsOrAlternatives(result);
  });

  it('should handle an instance declaration', () => {
    const result = parse(`schematic-beta\n  and g1`);
    expectNoErrorsOrAlternatives(result);
  });

  it('should handle a connection', () => {
    const result = parse(`schematic-beta\n  a --> b`);
    expectNoErrorsOrAlternatives(result);
  });

  it('should handle a chained connection', () => {
    const result = parse(`schematic-beta\n  a --> b --> c`);
    expectNoErrorsOrAlternatives(result);
  });

  it('should handle a dotted endpoint', () => {
    const result = parse(`schematic-beta\n  a --> u1.b`);
    expectNoErrorsOrAlternatives(result);
  });

  it('should handle a module with three ports', () => {
    const result = parse(`schematic-beta
  module ALU
    in a
    in b
    out y
  end`);
    expectNoErrorsOrAlternatives(result);
  });

  it('should handle a group without @side', () => {
    const result = parse(`schematic-beta
  module Producer
    group m_axis
      out tvalid
      in tready
    end
  end`);
    expectNoErrorsOrAlternatives(result);
  });

  it('should handle a group with @side', () => {
    const result = parse(`schematic-beta
  module Producer
    group m_axis @right
      out tvalid
      in tready
    end
  end`);
    expectNoErrorsOrAlternatives(result);
  });

  it('should handle a %% comment on its own line', () => {
    const result = parse(`schematic-beta
  %% a comment
  in a`);
    expectNoErrorsOrAlternatives(result);
  });

  it('should handle a %% comment trailing a statement', () => {
    const result = parse(`schematic-beta
  in a %% trailing comment`);
    expectNoErrorsOrAlternatives(result);
  });

  it('should handle CRLF input', () => {
    const result = parse('schematic-beta\r\n  in a\r\n  out y');
    expectNoErrorsOrAlternatives(result);
    expect(result.value.statements).toHaveLength(2);
  });

  it('should handle blank lines between statements', () => {
    const result = parse(`schematic-beta

  in a

  out y
`);
    expectNoErrorsOrAlternatives(result);
    expect(result.value.statements).toHaveLength(2);
  });

  it('should handle leading blank lines before the header', () => {
    const result = parse(`

schematic-beta
  in a`);
    expectNoErrorsOrAlternatives(result);
    expect(result.value.statements).toHaveLength(1);
  });

  it('should tokenise ==> at the grammar level (rejected later by the DB layer with SCH-013)', () => {
    const result = parse(`schematic-beta\n  a ==> b`);
    expectNoErrorsOrAlternatives(result);
  });

  it('should reject an unclosed module', () => {
    const result = parse(`schematic-beta
  module ALU
    in a`);
    expect(result.parserErrors.length).toBeGreaterThan(0);
  });

  it('should reject a connection with no target', () => {
    const result = parse(`schematic-beta\n  a -->`);
    expect(result.parserErrors.length).toBeGreaterThan(0);
  });
});
