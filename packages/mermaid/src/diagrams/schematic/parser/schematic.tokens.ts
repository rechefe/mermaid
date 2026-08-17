// cspell:ignore inout nand xnor

import { createToken, Lexer } from 'chevrotain';
import type { TokenType } from 'chevrotain';
import {
  createAccessibilityLineMatcher,
  matchAccDescrBlock,
  matchComment,
} from '../../common/parser/chevrotainPatterns.js';

/**
 * Instance and signal names follow HDL conventions (`u_alu`, `rst_n`, `g1`), so unlike the
 * generic `\w+` ids other diagrams use, a name may not start with a digit. Keeping this strict
 * leaves the digit-leading space free for the bit widths and slices phase 3 introduces.
 */
export const Identifier = createToken({
  name: 'IDENTIFIER',
  pattern: /[A-Z_a-z]\w*/,
});

/**
 * Declares a keyword that loses to a longer identifier, so `in` is a keyword but `input`
 * lexes as a plain name.
 *
 * @param name - Chevrotain token name
 * @param word - the exact keyword text
 * @returns the keyword token type
 */
const createKeyword = (name: string, word: string): TokenType =>
  createToken({
    name,
    pattern: new RegExp(word),
    longer_alt: Identifier,
  });

export const SchematicBeta = createToken({
  name: 'SCHEMATIC_BETA',
  pattern: /schematic-beta/,
  longer_alt: Identifier,
});

export const Direction = createKeyword('DIRECTION', 'direction');
export const In = createKeyword('IN', 'in');
export const Out = createKeyword('OUT', 'out');
export const Inout = createKeyword('INOUT', 'inout');

/**
 * `bus` is reserved ahead of use — phase 3 gives it meaning. Reserving it now means a phase 1/2
 * diagram that uses it as a name fails today rather than silently changing meaning later.
 */
export const Module = createKeyword('MODULE', 'module');
export const End = createKeyword('END', 'end');
export const Group = createKeyword('GROUP', 'group');
export const Bus = createKeyword('BUS', 'bus');

export const Arrow = createToken({ name: 'ARROW', pattern: /-->/ });
export const Dot = createToken({ name: 'DOT', pattern: /\./ });
export const Colon = createToken({ name: 'COLON', pattern: /:/ });
export const At = createToken({ name: 'AT', pattern: /@/ });

export const WhiteSpace = createToken({
  name: 'HWS',
  pattern: /[\t ]+/,
  group: Lexer.SKIPPED,
});
export const Comment = createToken({
  name: 'COMMENT',
  pattern: matchComment,
  start_chars_hint: ['%'],
  line_breaks: false,
});
export const NewLine = createToken({
  name: 'NEWLINE',
  pattern: /\r\n|\n|\r/,
  line_breaks: true,
});

export const AccDescrBlock = createToken({
  name: 'ACC_DESCR_BLOCK',
  pattern: matchAccDescrBlock,
  start_chars_hint: ['a'],
  line_breaks: true,
});
export const AccTitleLine = createToken({
  name: 'ACC_TITLE_LINE',
  pattern: createAccessibilityLineMatcher(/^accTitle[\t ]*:[^\n\r]*/),
  start_chars_hint: ['a'],
  line_breaks: false,
});
export const AccDescrLine = createToken({
  name: 'ACC_DESCR_LINE',
  pattern: createAccessibilityLineMatcher(/^accDescr[\t ]*:[^\n\r]*/),
  start_chars_hint: ['a'],
  line_breaks: false,
});

/**
 * Order is significant: Chevrotain tries these in sequence, so the accessibility directives and
 * every keyword must precede IDENTIFIER, and `inout` must precede `in`.
 */
export const schematicTokens: TokenType[] = [
  Comment,
  NewLine,
  WhiteSpace,
  AccDescrBlock,
  AccTitleLine,
  AccDescrLine,
  SchematicBeta,
  Direction,
  Inout,
  In,
  Out,
  Module,
  End,
  Group,
  Bus,
  Arrow,
  Dot,
  Colon,
  At,
  Identifier,
];
