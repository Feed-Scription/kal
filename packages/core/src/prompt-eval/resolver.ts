/**
 * Prompt resolver — instantiate fragments + state → rendered text
 */

import type { Fragment } from '../prompt/fragments';
import type { StateValue } from '../types/types';
import { compose } from '../prompt/compose';
import type { PromptScope } from '../prompt/compose';
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
      // compose() now handles comparison operators in resolveWhen(),
      // so active status from renderSingleFragment is already accurate
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
