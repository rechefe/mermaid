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
  const { layout, securityLevel } = getConfig();

  const schematicDb = diag.db as SchematicDB;
  const data4Layout = schematicDb.getData();
  data4Layout.layoutAlgorithm = getRegisteredLayoutAlgorithm(layout);
  data4Layout.diagramId = id;

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
