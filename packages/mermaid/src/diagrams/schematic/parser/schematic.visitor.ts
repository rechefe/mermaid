import type { CstNode, IToken } from 'chevrotain';
import { db } from '../schematicDb.js';
import type {
  PortDirection,
  RawModulePort,
  RawPortGroup,
  SchematicEndpoint,
} from '../schematicTypes.js';
import { schematicParser } from './schematic.parser.js';

type Ctx = Record<string, (CstNode | IToken)[] | undefined>;

interface PortDeclaration {
  kind: 'port';
  id: string;
  direction: PortDirection;
  portKind?: string;
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
interface ModuleDeclaration {
  kind: 'module';
  name: string;
  ports: RawModulePort[];
  groups: RawPortGroup[];
}
type Declaration =
  | PortDeclaration
  | InstanceDeclaration
  | NetDeclaration
  | ModuleDeclaration
  | undefined;

/** A bare port line or a whole group block, as found directly inside a `module ... end` body. */
type ModuleMember = { kind: 'port'; port: RawModulePort } | { kind: 'group'; group: RawPortGroup };

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

  private direction(ctx: Ctx): PortDirection {
    const found = (['IN', 'OUT', 'INOUT'] as const).find((name) => this.tokens(ctx, name).length);
    return found!.toLowerCase() as PortDirection;
  }

  /**
   * Declarations are applied in dependency order — modules, then ports, then instances, then
   * nets — rather than in source order, so an instance may reference a module declared further
   * down the diagram, and a net may reference a name declared further down still.
   */
  start(ctx: Ctx): void {
    const declarations = this.nodes(ctx, 'line')
      .map((line) => this.visit(line) as Declaration)
      .filter((declaration): declaration is NonNullable<Declaration> => declaration !== undefined);

    for (const declaration of declarations) {
      if (declaration.kind === 'module') {
        db.addModule(declaration.name, declaration.ports, declaration.groups);
      }
    }
    for (const declaration of declarations) {
      if (declaration.kind === 'port') {
        db.addPort(declaration.id, declaration.direction, declaration.portKind);
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
        'moduleStatement',
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
    const kindNode = this.nodes(ctx, 'kindClause')[0];
    return {
      kind: 'port',
      id: this.tokens(ctx, 'IDENTIFIER')[0].image,
      direction: this.direction(ctx),
      portKind: kindNode ? (this.visit(kindNode) as string) : undefined,
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

  moduleStatement(ctx: Ctx): ModuleDeclaration {
    const name = this.tokens(ctx, 'IDENTIFIER')[0].image;
    const ports: RawModulePort[] = [];
    const groups: RawPortGroup[] = [];

    for (const memberNode of this.nodes(ctx, 'moduleLine')) {
      const member = this.visit(memberNode) as ModuleMember | undefined;
      if (!member) {
        continue;
      }
      if (member.kind === 'port') {
        ports.push(member.port);
      } else {
        groups.push(member.group);
        ports.push(...member.group.ports.map((port) => ({ ...port, group: member.group.name })));
      }
    }

    return { kind: 'module', name, ports, groups };
  }

  moduleLine(ctx: Ctx): ModuleMember | undefined {
    const node = this.nodes(ctx, 'blankLine')[0] ?? this.nodes(ctx, 'commentLine')[0];
    if (node) {
      return undefined;
    }
    const groupNode = this.nodes(ctx, 'groupStatement')[0];
    if (groupNode) {
      return { kind: 'group', group: this.visit(groupNode) as RawPortGroup };
    }
    return {
      kind: 'port',
      port: this.visit(this.firstNode(ctx, 'modulePortStatement')) as RawModulePort,
    };
  }

  groupStatement(ctx: Ctx): RawPortGroup {
    const sideNode = this.nodes(ctx, 'sideClause')[0];
    return {
      name: this.tokens(ctx, 'IDENTIFIER')[0].image,
      side: sideNode ? (this.visit(sideNode) as string) : undefined,
      ports: this.nodes(ctx, 'groupLine')
        .map((line) => this.visit(line) as RawModulePort | undefined)
        .filter((port): port is RawModulePort => port !== undefined),
    };
  }

  groupLine(ctx: Ctx): RawModulePort | undefined {
    const node = this.nodes(ctx, 'blankLine')[0] ?? this.nodes(ctx, 'commentLine')[0];
    return node
      ? undefined
      : (this.visit(this.firstNode(ctx, 'modulePortStatement')) as RawModulePort);
  }

  modulePortStatement(ctx: Ctx): RawModulePort {
    const kindNode = this.nodes(ctx, 'kindClause')[0];
    const sideNode = this.nodes(ctx, 'sideClause')[0];
    return {
      id: this.tokens(ctx, 'IDENTIFIER')[0].image,
      direction: this.direction(ctx),
      kind: kindNode ? (this.visit(kindNode) as string) : undefined,
      side: sideNode ? (this.visit(sideNode) as string) : undefined,
    };
  }

  kindClause(ctx: Ctx): string {
    return this.tokens(ctx, 'IDENTIFIER')[0].image;
  }

  sideClause(ctx: Ctx): string {
    return this.tokens(ctx, 'IDENTIFIER')[0].image;
  }
}

export const schematicVisitor = new SchematicVisitor();
