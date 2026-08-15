import type {
  DiagramDetector,
  DiagramLoader,
  ExternalDiagramDefinition,
} from '../../diagram-api/types.js';

const id = 'schematic';

const detector: DiagramDetector = (txt) => {
  return /^\s*schematic-beta(?:\s|$)/.test(txt);
};

const loader: DiagramLoader = async () => {
  const { diagram } = await import('./schematicDiagram.js');
  return { id, diagram };
};

export const schematic: ExternalDiagramDefinition = {
  id,
  detector,
  loader,
};
