import type { CustomPatternMatcherFunc } from 'chevrotain';

/**
 * Builds the `RegExpExecArray` shape Chevrotain expects back from a custom matcher.
 *
 * @param text - full lexer input
 * @param offset - offset the match starts at
 * @param image - the matched text
 * @returns a match array positioned at `offset`
 */
export function customMatch(text: string, offset: number, image: string): RegExpExecArray {
  const match = [image] as unknown as RegExpExecArray;
  match.index = offset;
  match.input = text;
  return match;
}

/**
 * Reports whether `offset` is the first non-whitespace position on its line, so line-anchored
 * tokens (comments, accessibility directives) do not match mid-statement.
 *
 * @param text - full lexer input
 * @param offset - offset to test
 * @returns true when only spaces or tabs precede `offset` on this line
 */
export function isIndentedLineStart(text: string, offset: number): boolean {
  for (let index = offset - 1; index >= 0; index--) {
    const character = text[index];
    if (character === '\n' || character === '\r') {
      return true;
    }
    if (character !== ' ' && character !== '\t') {
      return false;
    }
  }
  return true;
}

/**
 * Matches a `%%` comment that runs to the end of its line. Only matches at a line start so
 * that a literal `%%` inside a label is left alone.
 */
export const matchComment: CustomPatternMatcherFunc = (text, offset) => {
  if (text[offset] !== '%' || text[offset + 1] !== '%') {
    return null;
  }
  if (!isIndentedLineStart(text, offset)) {
    return null;
  }
  let end = offset + 2;
  while (end < text.length && text[end] !== '\n' && text[end] !== '\r') {
    end++;
  }
  return customMatch(text, offset, text.slice(offset, end));
};

/**
 * Builds a matcher for a single-line accessibility directive such as `accTitle: ...`.
 *
 * @param pattern - anchored pattern matching the whole directive line
 * @returns a Chevrotain custom matcher restricted to line starts
 */
export function createAccessibilityLineMatcher(pattern: RegExp): CustomPatternMatcherFunc {
  return (text, offset) => {
    if (!isIndentedLineStart(text, offset)) {
      return null;
    }
    const match = pattern.exec(text.slice(offset));
    return match ? customMatch(text, offset, match[0]) : null;
  };
}

/** Matches a braced `accDescr { ... }` block, including its closing brace. */
export const matchAccDescrBlock: CustomPatternMatcherFunc = (text, offset) => {
  if (!isIndentedLineStart(text, offset)) {
    return null;
  }
  const opening = /^accDescr[\t ]*{/.exec(text.slice(offset));
  if (!opening) {
    return null;
  }
  const end = text.indexOf('}', offset + opening[0].length);
  return end === -1 ? null : customMatch(text, offset, text.slice(offset, end + 1));
};
