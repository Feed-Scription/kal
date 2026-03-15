/**
 * Expression module barrel export
 */

export type { ValueReader } from './reader';
export { readerFromStateRecord, readerFromStore, resolvePath, interpolateTemplate } from './reader';

export type { ConditionSpec, ParsedAtom, EvaluateOptions } from './predicate';
export {
  evaluateCondition,
  parseLiteral,
  parseAtom,
  compareValues,
  evaluateValueCondition,
  validateConditionSpec,
} from './predicate';
