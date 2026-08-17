import { describe, expect, it } from 'vitest';
import { addDiagrams } from '../../diagram-api/diagram-orchestration.js';
import mermaidAPI from '../../mermaidAPI.js';
import {
  getRegisteredLayoutAlgorithm,
  registerLayoutLoaders,
} from '../../rendering-util/render.js';
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

  jsdomIt('renders a module instance like any other box', async () => {
    // Placed ahead of the elk-registration tests below: schematicRenderer.ts always prefers
    // 'elk' once something registers it, and the fake loader those tests register is a no-op.
    const { svg } = await mermaidAPI.render(
      'schematic-module-render',
      `schematic-beta
  module ALU
    in a
    in b
    out y
  end
  in x
  in w
  out z
  ALU u_alu
  x --> u_alu
  w --> u_alu
  u_alu --> z
`
    );

    expect(svg).toContain('<svg');
    for (const label of ['x', 'w', 'z', 'u_alu']) {
      expect(svg, `label ${label}`).toContain(`>${label}<`);
    }
  });

  describe('layout algorithm selection', () => {
    // schematicRenderer.ts always requests 'elk' first, falling back to dagre — this is the
    // exact registry mechanism it depends on. Pulling in the real @mermaid-js/layout-elk
    // package here would make packages/mermaid depend on the very package that depends on it
    // (it imports `mermaid`), which broke the separate types-generation build; a minimal fake
    // loader that only satisfies the registry's shape tests the same contract without that.
    // Order matters: the registry in rendering-util/render.js only grows for the life of the
    // module, so the "nothing registered yet" case has to run before anything registers 'elk'.
    it('falls back to dagre when nothing has registered an "elk" layout', () => {
      expect(getRegisteredLayoutAlgorithm('elk', { fallback: 'dagre' })).toBe('dagre');
    });

    it('prefers elk once a layout named "elk" is registered', () => {
      const fakeElkLayout = { render: () => Promise.resolve() };
      registerLayoutLoaders([{ name: 'elk', loader: () => Promise.resolve(fakeElkLayout) }]);

      expect(getRegisteredLayoutAlgorithm('elk', { fallback: 'dagre' })).toBe('elk');
    });
  });
});
