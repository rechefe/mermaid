import { getConfig } from '../../diagram-api/diagramAPI.js';
import type { DrawDefinition } from '../../diagram-api/types.js';
import { log } from '../../logger.js';
import { getDiagramElement } from '../../rendering-util/insertElementsForSize.js';
import { getRegisteredLayoutAlgorithm, render } from '../../rendering-util/render.js';
import { setupViewPortForSVG } from '../../rendering-util/setupViewPortForSVG.js';
import utils from '../../utils.js';
import type { SchematicDB } from './schematicDb.js';

const draw: DrawDefinition = async (_text, id, _version, diag) => {
  log.info('Drawing schematic diagram', id);
  const { securityLevel } = getConfig();

  const schematicDb = diag.db as SchematicDB;
  const data4Layout = schematicDb.getData();
  // A netlist needs obstacle-aware orthogonal routing, not dagre's spline waypoints, so this
  // always prefers elk over whatever the document's global `layout` config says — that setting
  // is meant for the user's other diagrams, not this one. Falls back to dagre (with a console
  // warning from getRegisteredLayoutAlgorithm) if the consuming app hasn't registered
  // @mermaid-js/layout-elk; detecting that ahead of time isn't possible; a per-diagram config
  // mutation during detection was tried and doesn't work — mermaidAPI.render() snapshots
  // getConfig() before running detection, so a detector's config.layout mutation lands on a
  // clone that's already discarded by the time this renderer runs.
  data4Layout.layoutAlgorithm = getRegisteredLayoutAlgorithm('elk', { fallback: 'dagre' });
  data4Layout.diagramId = id;

  // ELK's own layered-algorithm default already routes edges as obstacle-aware right angles
  // (verified directly against elkjs), so its waypoints just need straight segments between
  // them. The dagre fallback has no such awareness, so 'step' is still what turns its smooth
  // spline waypoints into a right-angle read — see the schematicDb net-thickness/routing fix.
  const usingElk = data4Layout.layoutAlgorithm === 'elk';
  for (const edge of data4Layout.edges) {
    edge.curve = usingElk ? 'linear' : 'step';
  }

  const svg = getDiagramElement(id, securityLevel);
  await render(data4Layout, svg);

  const schematicConfig = data4Layout.config.schematic;
  utils.insertTitle(svg, 'schematicTitleText', 0, schematicDb.getDiagramTitle());
  setupViewPortForSVG(
    svg,
    schematicConfig?.diagramPadding ?? 8,
    'schematicDiagram',
    schematicConfig?.useMaxWidth ?? true
  );
};

export const renderer = { draw };
