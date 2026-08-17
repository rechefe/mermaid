import type { DiagramDefinition } from '../../diagram-api/types.js';
import { SchematicDB, parser } from './schematicDb.js';
import { renderer } from './schematicRenderer.js';
import { styles } from './styles.js';

export const diagram: DiagramDefinition = {
  parser,
  get db() {
    return new SchematicDB();
  },
  renderer,
  styles,
};
