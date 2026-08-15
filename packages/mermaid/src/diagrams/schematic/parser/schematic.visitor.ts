import type { CstNode, IToken } from 'chevrotain';
import { db } from '../schematicDb.js';
import type { PortDirection, SchematicEndpoint } from '../schematicTypes.js';
import { schematicParser } from './schematic.parser.js';

type Ctx = Record<string, (CstNode | IToken)[] | undefined>;

interface PortDeclaration {
  kind: 'port';
  id: string;
  direction: PortDirection;
}
interface InstanceDeclaration {
  kind: 'instance';
  id: string;
  type: string;
}
interface NetDeclaration {
  kind: 'net';
  source: SchematicEndpoint;
  target: SchematicEndpoint;
}
type Declaration = PortDeclaration | InstanceDeclaration | NetDeclaration | undefined;

const BaseVisitor = schematicParser.getBaseCstVisitorConstructor();

class SchematicVisitor extends BaseVisitor {
  constructor() {
    super();
    this.validateVisitor();
  }

  build(cst: CstNode): void {
    this.visit(cst);
  }

  private tokens(ctx: Ctx, name: string): IToken[] {
    return (ctx[name] ?? []) as IToken[];
  }

  private nodes(ctx: Ctx, name: string): CstNode[] {
    return (ctx[name] ?? []) as CstNode[];
  }

  private firstNode(ctx: Ctx, ...names: string[]): CstNode {
    for (const name of names) {
      const node = this.nodes(ctx, name)[0];
      if (node) {
        return node;
      }
    }
    throw new Error(`Unexpected schematic statement: expected one of ${names.join(', ')}.`);
  }

  /**
   * Declarations are applied in dependency order — ports, then instances, then nets — rather
   * than in source order, so a net may reference a name declared further down the diagram.
   */
  start(ctx: Ctx): void {
    const declarations = this.nodes(ctx, 'line')
      .map((line) => this.visit(line) as Declaration)
      .filter((declaration): declaration is NonNullable<Declaration> => declaration !== undefined);

    for (const declaration of declarations) {
      if (declaration.kind === 'port') {
        db.addPort(declaration.id, declaration.direction);
      }
    }
    for (const declaration of declarations) {
      if (declaration.kind === 'instance') {
        db.addInstance(declaration.id, declaration.type);
      }
    }
    for (const declaration of declarations) {
      if (declaration.kind === 'net') {
        db.addNet(declaration.source, declaration.target);
      }
    }
  }

  line(ctx: Ctx): Declaration {
    return this.visit(this.firstNode(ctx, 'blankLine', 'commentLine', 'statement')) as Declaration;
  }

  statement(ctx: Ctx): Declaration {
    return this.visit(
      this.firstNode(
        ctx,
        'accTitleStatement',
        'accDescrStatement',
        'directionStatement',
        'portStatement',
        'instanceStatement',
        'connectionStatement'
      )
    ) as Declaration;
  }

  lineEnd(_ctx: Ctx): undefined {
    return undefined;
  }

  blankLine(_ctx: Ctx): undefined {
    return undefined;
  }

  commentLine(_ctx: Ctx): undefined {
    return undefined;
  }

  accTitleStatement(ctx: Ctx): undefined {
    const { image } = this.tokens(ctx, 'ACC_TITLE_LINE')[0];
    db.setAccTitle(image.slice(image.indexOf(':') + 1).trim());
    return undefined;
  }

  accDescrStatement(ctx: Ctx): undefined {
    const line = this.tokens(ctx, 'ACC_DESCR_LINE')[0];
    const block = this.tokens(ctx, 'ACC_DESCR_BLOCK')[0];
    const description = line
      ? line.image.slice(line.image.indexOf(':') + 1).trim()
      : block.image.slice(block.image.indexOf('{') + 1, block.image.lastIndexOf('}')).trim();
    db.setAccDescription(description);
    return undefined;
  }

  directionStatement(ctx: Ctx): undefined {
    db.setDirection(this.tokens(ctx, 'IDENTIFIER')[0].image);
    return undefined;
  }

  portStatement(ctx: Ctx): PortDeclaration {
    const direction = (['IN', 'OUT', 'INOUT'] as const).find(
      (name) => this.tokens(ctx, name).length > 0
    );
    return {
      kind: 'port',
      id: this.tokens(ctx, 'IDENTIFIER')[0].image,
      direction: direction!.toLowerCase() as PortDirection,
    };
  }

  instanceStatement(ctx: Ctx): InstanceDeclaration {
    const [type, id] = this.tokens(ctx, 'IDENTIFIER');
    return { kind: 'instance', id: id.image, type: type.image };
  }

  connectionStatement(ctx: Ctx): NetDeclaration {
    const [source, target] = this.nodes(ctx, 'endpoint').map(
      (node) => this.visit(node) as SchematicEndpoint
    );
    return { kind: 'net', source, target };
  }

  endpoint(ctx: Ctx): SchematicEndpoint {
    const [id, port] = this.tokens(ctx, 'IDENTIFIER');
    return port ? { id: id.image, port: port.image } : { id: id.image };
  }
}

export const schematicVisitor = new SchematicVisitor();
