import { AbstractMermaidTokenBuilder } from '../common/index.js';

export class SchematicTokenBuilder extends AbstractMermaidTokenBuilder {
  public constructor() {
    super(['schematic-beta']);
  }
}
