import { CstParser, EOF } from 'chevrotain';
import type { CstNode } from 'chevrotain';
import {
  AccDescrBlock,
  AccDescrLine,
  AccTitleLine,
  Arrow,
  At,
  Colon,
  Comment,
  Direction,
  Dot,
  End,
  Group,
  Identifier,
  In,
  Inout,
  Module,
  NewLine,
  Out,
  SchematicBeta,
  schematicTokens,
} from './schematic.tokens.js';

class SchematicParser extends CstParser {
  declare start: () => CstNode;
  declare line: () => CstNode;
  declare statement: () => CstNode;
  declare lineEnd: () => CstNode;
  declare blankLine: () => CstNode;
  declare commentLine: () => CstNode;
  declare accTitleStatement: () => CstNode;
  declare accDescrStatement: () => CstNode;
  declare directionStatement: () => CstNode;
  declare portStatement: () => CstNode;
  declare instanceStatement: () => CstNode;
  declare connectionStatement: () => CstNode;
  declare endpoint: () => CstNode;
  declare moduleStatement: () => CstNode;
  declare moduleLine: () => CstNode;
  declare groupStatement: () => CstNode;
  declare groupLine: () => CstNode;
  declare modulePortStatement: () => CstNode;
  declare kindClause: () => CstNode;
  declare sideClause: () => CstNode;

  constructor() {
    super(schematicTokens);

    this.RULE('start', () => {
      this.CONSUME(SchematicBeta);
      this.SUBRULE(this.lineEnd);
      this.MANY(() => this.SUBRULE(this.line));
    });

    this.RULE('line', () => {
      this.OR([
        { ALT: () => this.SUBRULE(this.blankLine) },
        { ALT: () => this.SUBRULE(this.commentLine) },
        { ALT: () => this.SUBRULE(this.statement) },
      ]);
    });

    this.RULE('statement', () => {
      this.OR([
        { ALT: () => this.SUBRULE(this.accTitleStatement) },
        { ALT: () => this.SUBRULE(this.accDescrStatement) },
        { ALT: () => this.SUBRULE(this.directionStatement) },
        { ALT: () => this.SUBRULE(this.moduleStatement) },
        { ALT: () => this.SUBRULE(this.portStatement) },
        {
          // `and g1` and `a --> g1` both open with a name; the token after it decides which.
          GATE: () => this.isInstantiation(),
          ALT: () => this.SUBRULE(this.instanceStatement),
        },
        { ALT: () => this.SUBRULE(this.connectionStatement) },
      ]);
    });

    this.RULE('lineEnd', () => {
      this.OR([{ ALT: () => this.CONSUME(NewLine) }, { ALT: () => this.CONSUME(EOF) }]);
    });

    this.RULE('blankLine', () => {
      this.CONSUME(NewLine);
    });

    this.RULE('commentLine', () => {
      this.CONSUME(Comment);
      this.SUBRULE(this.lineEnd);
    });

    this.RULE('accTitleStatement', () => {
      this.CONSUME(AccTitleLine);
      this.SUBRULE(this.lineEnd);
    });

    this.RULE('accDescrStatement', () => {
      this.OR([
        { ALT: () => this.CONSUME(AccDescrLine) },
        { ALT: () => this.CONSUME(AccDescrBlock) },
      ]);
      this.SUBRULE(this.lineEnd);
    });

    this.RULE('directionStatement', () => {
      this.CONSUME(Direction);
      this.CONSUME(Identifier);
      this.SUBRULE(this.lineEnd);
    });

    this.RULE('portStatement', () => {
      this.OR([
        { ALT: () => this.CONSUME(In) },
        { ALT: () => this.CONSUME(Out) },
        { ALT: () => this.CONSUME(Inout) },
      ]);
      this.CONSUME(Identifier);
      this.OPTION(() => this.SUBRULE(this.kindClause));
      this.SUBRULE(this.lineEnd);
    });

    this.RULE('instanceStatement', () => {
      this.CONSUME(Identifier);
      this.CONSUME2(Identifier);
      this.SUBRULE(this.lineEnd);
    });

    this.RULE('connectionStatement', () => {
      this.SUBRULE(this.endpoint);
      this.CONSUME(Arrow);
      this.SUBRULE2(this.endpoint);
      this.SUBRULE(this.lineEnd);
    });

    this.RULE('endpoint', () => {
      this.CONSUME(Identifier);
      this.OPTION(() => {
        this.CONSUME(Dot);
        this.CONSUME2(Identifier);
      });
    });

    this.RULE('moduleStatement', () => {
      this.CONSUME(Module);
      this.CONSUME(Identifier);
      this.SUBRULE(this.lineEnd);
      this.MANY(() => this.SUBRULE(this.moduleLine));
      this.CONSUME(End);
      this.SUBRULE2(this.lineEnd);
    });

    this.RULE('moduleLine', () => {
      this.OR([
        { ALT: () => this.SUBRULE(this.blankLine) },
        { ALT: () => this.SUBRULE(this.commentLine) },
        { ALT: () => this.SUBRULE(this.groupStatement) },
        { ALT: () => this.SUBRULE(this.modulePortStatement) },
      ]);
    });

    this.RULE('groupStatement', () => {
      this.CONSUME(Group);
      this.CONSUME(Identifier);
      this.OPTION(() => this.SUBRULE(this.sideClause));
      this.SUBRULE(this.lineEnd);
      this.MANY(() => this.SUBRULE(this.groupLine));
      this.CONSUME(End);
      this.SUBRULE2(this.lineEnd);
    });

    this.RULE('groupLine', () => {
      this.OR([
        { ALT: () => this.SUBRULE(this.blankLine) },
        { ALT: () => this.SUBRULE(this.commentLine) },
        { ALT: () => this.SUBRULE(this.modulePortStatement) },
      ]);
    });

    this.RULE('modulePortStatement', () => {
      this.OR([
        { ALT: () => this.CONSUME(In) },
        { ALT: () => this.CONSUME(Out) },
        { ALT: () => this.CONSUME(Inout) },
      ]);
      this.CONSUME(Identifier);
      this.OPTION(() => this.SUBRULE(this.kindClause));
      this.OPTION2(() => this.SUBRULE(this.sideClause));
      this.SUBRULE(this.lineEnd);
    });

    this.RULE('kindClause', () => {
      this.CONSUME(Colon);
      this.CONSUME(Identifier);
    });

    this.RULE('sideClause', () => {
      this.CONSUME(At);
      this.CONSUME(Identifier);
    });

    this.performSelfAnalysis();
  }

  /** True when the upcoming tokens are `<Type> <name>` rather than the start of a connection. */
  private isInstantiation(): boolean {
    return this.LA(1).tokenType === Identifier && this.LA(2).tokenType === Identifier;
  }
}

export const schematicParser = new SchematicParser();
