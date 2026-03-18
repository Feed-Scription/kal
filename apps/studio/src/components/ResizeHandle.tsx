import { PanelResizeHandle } from 'react-resizable-panels';

export function ResizeHandle({ direction }: { direction: 'horizontal' | 'vertical' }) {
  const isHorizontal = direction === 'horizontal';

  return (
    <PanelResizeHandle
      className={`group relative flex items-center justify-center ${
        isHorizontal ? 'h-px' : 'w-px'
      } bg-border transition-colors data-[resize-handle-active]:bg-primary hover:bg-primary/50`}
    >
      <div
        className={`absolute z-10 ${
          isHorizontal
            ? 'inset-x-0 -top-1 -bottom-1 cursor-row-resize'
            : 'inset-y-0 -right-1 -left-1 cursor-col-resize'
        }`}
      />
    </PanelResizeHandle>
  );
}
