import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight, Loader2, Lock } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PromptBuildFragmentsField } from '@/components/node-config-editors';
import {
  type PromptFragment,
  type PromptFragmentType,
  fragmentBadgeClass,
  fragmentPreview,
  isSupportedPromptFragmentType,
} from '@/utils/prompt-fragments';

export function EvalVariantPanel({
  slot,
  label,
  readOnly = false,
  fragments,
  model,
  defaultModel,
  loading,
  progress,
  onRun,
  onFragmentsChange,
  onModelChange,
}: {
  slot: 'a' | 'b';
  label: string;
  readOnly?: boolean;
  fragments: PromptFragment[];
  model: string;
  defaultModel: string;
  loading: boolean;
  progress?: { completed: number; total: number } | null;
  onRun: () => void;
  onFragmentsChange?: (fragments: PromptFragment[]) => void;
  onModelChange: (model: string) => void;
}) {
  const { t } = useTranslation('eval');

  return (
    <Card className={`flex flex-col ${readOnly ? 'border-muted bg-muted/20' : ''}`}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          {readOnly && <Lock className="size-3 text-muted-foreground" />}
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col space-y-3">
        {/* Model */}
        <div className="space-y-1">
          <Label className="text-xs">{t('variant.model')}</Label>
          {readOnly ? (
            <div className="flex h-9 items-center gap-2 rounded-md bg-muted/50 px-3 text-sm">
              <span className="text-muted-foreground">{defaultModel || '—'}</span>
              <Badge variant="outline" className="text-[10px]">{t('variant.modelDefault')}</Badge>
            </div>
          ) : (
            <Input
              value={model}
              onChange={(e) => onModelChange(e.target.value)}
              placeholder={defaultModel || t('modelPlaceholder')}
            />
          )}
        </div>

        {/* Fragments */}
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">
            {readOnly ? t('variant.currentFragments') : t('variant.editableFragments')}
            {' '}({fragments.length})
          </div>
          {readOnly ? (
            <ReadOnlyFragmentList fragments={fragments} />
          ) : (
            <PromptBuildFragmentsField
              label=""
              required={false}
              value={fragments}
              onCommit={(val) => onFragmentsChange?.(val as PromptFragment[])}
            />
          )}
        </div>

        {/* Run button — pinned to bottom */}
        <div className="mt-auto space-y-2 pt-1">
          <Button
            className="w-full gap-2"
            variant={slot === 'a' ? 'default' : 'outline'}
            disabled={loading}
            onClick={onRun}
          >
            {loading && <Loader2 className="size-4 animate-spin" />}
            {t('variant.run')} {slot.toUpperCase()}
          </Button>

          {/* Progress bar */}
          {loading && progress && progress.total > 0 && (
            <div className="space-y-1">
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>{progress.completed}/{progress.total}</span>
                <span>{Math.round((progress.completed / progress.total) * 100)}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-300"
                  style={{ width: `${(progress.completed / progress.total) * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ReadOnlyFragmentList({ fragments }: { fragments: PromptFragment[] }) {
  const [expandedSet, setExpandedSet] = useState<Set<number>>(new Set());

  const toggle = (i: number) => {
    setExpandedSet((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  if (fragments.length === 0) {
    return <p className="text-xs text-muted-foreground">—</p>;
  }

  return (
    <div className="overflow-hidden rounded-lg border">
      {fragments.map((f, i) => {
        const type = (isSupportedPromptFragmentType(f.type) ? f.type : 'base') as PromptFragmentType;
        const isExpanded = expandedSet.has(i);
        const preview = fragmentPreview(f, type);
        return (
          <div key={`${f.id || 'frag'}-${i}`} className={`bg-background/70${i > 0 ? ' border-t' : ''}`}>
            <button
              type="button"
              className="flex w-full items-center gap-1.5 px-2 py-1 text-left"
              onClick={() => toggle(i)}
            >
              {isExpanded
                ? <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
                : <ChevronRight className="size-3 shrink-0 text-muted-foreground" />}
              <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${fragmentBadgeClass(type)}`}>
                {type}
              </span>
              <span className="min-w-0 truncate text-xs font-medium text-foreground/80">
                {f.id || `fragment-${i + 1}`}
              </span>
              {!isExpanded && preview && (
                <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground/60 italic">
                  {preview.length > 50 ? preview.slice(0, 50) + '…' : preview}
                </span>
              )}
            </button>
            {isExpanded && (
              <div className="border-t px-3 pb-2 pt-1.5">
                <pre className="whitespace-pre-wrap text-xs text-muted-foreground">
                  {f.content ?? JSON.stringify(f, null, 2)}
                </pre>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
