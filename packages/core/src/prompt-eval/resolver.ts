/**
 * Prompt resolver — instantiate fragments + state → rendered text
 */

import type { Fragment } from '../prompt/fragments';
import type { StateValue } from '../types/types';
import { compose } from '../prompt/compose';
import type { PromptScope } from '../prompt/compose';
import { evaluateCondition } from '../session/condition-evaluator';
import type { RenderResult, RenderedFragment } from './types';

/**
 * Create a PromptScope from a state record
 */
function createScope(
  state: Record<string, StateValue>,
  data: Record<string, any> = {},
): PromptScope {
  return {
    data,
    state: {
      get(key: string) {
        return state[key];
      },
    },
  };
}

/**
 * Resolve a single fragment to rendered text (for reporting)
 */
function renderSingleFragment(
  fragment: Fragment,
  scope: PromptScope,
): { active: boolean; rendered: string } {
  const text = compose([fragment], scope);
  return { active: text.length > 0, rendered: text };
}

/**
 * Check if a when condition is active, using the condition evaluator
 * for expressions like "state.round >= 9", falling back to compose for simple paths.
 */
function isWhenActive(
  condition: string,
  state: Record<string, StateValue>,
  scope: PromptScope,
): boolean {
  // Try expression evaluation first (handles state.key op literal)
  try {
    return evaluateCondition(condition, state);
  } catch {
    // Fall back to compose-style path lookup (truthy check)
    const text = compose([{ type: 'when', id: '_probe', condition, fragments: [{ type: 'base', id: '_', content: '1' }] }], scope);
    return text.length > 0;
  }
}

/**
 * Render a PromptBuild node's fragments with given state
 */
export function renderPrompt(
  nodeId: string,
  fragments: Fragment[],
  state: Record<string, StateValue>,
  data: Record<string, any> = {},
): RenderResult {
  const scope = createScope(state, data);
  const renderedText = compose(fragments, scope);

  const renderedFragments: RenderedFragment[] = fragments.map((fragment) => {
    const { active, rendered } = renderSingleFragment(fragment, scope);
    const result: RenderedFragment = {
      id: 'id' in fragment ? (fragment.id ?? '') : '',
      type: fragment.type,
      active,
      rendered,
    };
    if (fragment.type === 'when') {
      result.condition = fragment.condition;
      // Use condition evaluator for accurate activation status
      result.active = isWhenActive(fragment.condition, state, scope);
    }
    return result;
  });

  // Simplify state for output
  const simplifiedState: Record<string, any> = {};
  for (const [key, sv] of Object.entries(state)) {
    simplifiedState[key] = sv.value;
  }

  return {
    nodeId,
    renderedText,
    fragments: renderedFragments,
    state: simplifiedState,
  };
}
