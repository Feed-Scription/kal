import { useCallback } from 'react';
import { useReactFlow } from '@xyflow/react';

/**
 * Hook for managing node configuration
 * Encapsulates config read and update logic for node components
 */
export function useNodeConfig<T = Record<string, unknown>>(nodeId: string) {
  const { setNodes } = useReactFlow();

  const updateConfig = useCallback(
    (updates: Partial<T>) => {
      setNodes((nodes) =>
        nodes.map((node) => {
          if (node.id === nodeId) {
            const prevConfig = (node.data as Record<string, unknown>).config as Record<string, unknown> | undefined;
            return {
              ...node,
              data: {
                ...node.data,
                config: {
                  ...prevConfig,
                  ...updates,
                },
              },
            };
          }
          return node;
        })
      );
    },
    [nodeId, setNodes]
  );

  return { updateConfig };
}
