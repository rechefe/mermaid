import type { DiagramDefinition } from '../../diagram-api/types.js';
import { parser } from './parser/schematic.chevrotain.js';
import { db } from './schematicDb.js';
import { renderer } from './schematicRenderer.js';
import styles from './styles.js';

export const diagram: DiagramDefinition = {
  parser,
  db,
  renderer,
  styles,
};
