import { describe, expect } from 'vitest';
import { addDiagrams } from '../../diagram-api/diagram-orchestration.js';
import mermaidAPI from '../../mermaidAPI.js';
import { jsdomIt } from '../../tests/util.js';

addDiagrams();

const HELLO_WORLD = `schematic-beta
  in a
  in b
  out y
  and g1
  a --> g1
  b --> g1
  g1 --> y
`;

describe('schematic renderer', () => {
  jsdomIt('renders a schematic to svg', async () => {
    const { svg } = await mermaidAPI.render('schematic-render', HELLO_WORLD);

    expect(svg).toContain('<svg');
    expect(svg).toContain('aria-roledescription="schematic"');
  });

  jsdomIt('renders every declared port and instance', async () => {
    const { svg } = await mermaidAPI.render('schematic-nodes', HELLO_WORLD);

    for (const label of ['a', 'b', 'y', 'g1']) {
      expect(svg, `label ${label}`).toContain(`>${label}<`);
    }
  });

  jsdomIt('carries accessibility metadata through to the svg', async () => {
    const { svg } = await mermaidAPI.render(
      'schematic-a11y',
      `schematic-beta
  accTitle: AND gate
  accDescr: Two inputs feeding one AND gate
  in a
  and g1
  a --> g1
`
    );

    expect(svg).toContain('AND gate');
    expect(svg).toContain('Two inputs feeding one AND gate');
  });
});
