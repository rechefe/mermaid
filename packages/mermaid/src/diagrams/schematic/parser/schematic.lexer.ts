import { Lexer } from 'chevrotain';
import { schematicTokens } from './schematic.tokens.js';

/** Singleton lexer; construction and validation happen once at module load. */
export const schematicLexer = new Lexer(schematicTokens);
