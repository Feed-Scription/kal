import { memo, useEffect, useState } from "react";
import { Position, type NodeProps } from "@xyflow/react";
import {
  BaseNode,
  BaseNodeContent,
  BaseNodeHeader,
  BaseNodeHeaderTitle,
} from "@/components/base-node";
import { LabeledHandle } from "@/components/labeled-handle";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  PromptBuildFragmentsField,
  StringListField,
  WriteStateOperationsField,
  WriteStateConstraintsField,
  WriteStateDeduplicateByField,
} from "@/components/node-config-editors";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useNodeConfig } from "@/hooks/use-node-config";
import { useFlowResource } from "@/kernel/hooks";
import { overlayClassName } from "@/hooks/use-node-overlay";
import { NodeOverlayBadge } from "@/components/NodeOverlayBadge";
import { Code, List, Plus, Radio, Sparkles, Zap, Shuffle, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { NodeOverlayState } from "@/hooks/use-node-overlay";
import type { NodeManifest } from "@/types/project";

type Schema = {
  type?: string;
  enum?: string[];
  properties?: Record<string, Schema>;
  required?: string[];
};

function labelFor(key: string) {
  return key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
}

function categoryIcon(category?: string) {
  switch (category) {
    case "signal":
      return <Radio className="size-4 text-sky-600" />;
    case "state":
      return <Sparkles className="size-4 text-emerald-600" />;
    case "llm":
      return <Zap className="size-4 text-amber-600" />;
    case "transform":
      return <Shuffle className="size-4 text-fuchsia-600" />;
    default:
      return null;
  }
}

function categoryClass(category?: string) {
  switch (category) {
    case "signal":
      return "rounded-lg border-sky-200 bg-sky-50/60 dark:border-sky-800 dark:bg-sky-950/40";
    case "state":
      return "rounded-lg border-emerald-200 bg-emerald-50/60 dark:border-emerald-800 dark:bg-emerald-950/40";
    case "llm":
      return "rounded-lg border-amber-200 bg-amber-50/60 dark:border-amber-800 dark:bg-amber-950/40";
    case "transform":
      return "rounded-lg border-fuchsia-200 bg-fuchsia-50/60 dark:border-fuchsia-800 dark:bg-fuchsia-950/40";
    default:
      return "border-border";
  }
}

const JsonField = memo(function JsonField({
  name,
  value,
  required,
  onCommit,
}: {
  name: string;
  value: unknown;
  required: boolean;
  onCommit: (value: unknown) => void;
}) {
  const { t } = useTranslation('flow');
  const isArray = Array.isArray(value) || (!value && name.endsWith("s"));
  const [rawMode, setRawMode] = useState(false);
  const [text, setText] = useState(() => JSON.stringify(value ?? (isArray ? [] : {}), null, 2));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setText(JSON.stringify(value ?? (isArray ? [] : {}), null, 2));
    setError(null);
  }, [name, value, isArray]);

  const items = Array.isArray(value) ? value : [];

  // 结构化 array 编辑模式
  if (isArray && !rawMode) {
    return (
      <div>
        <div className="flex items-center justify-between">
          <label className="text-xs text-muted-foreground">
            {labelFor(name)} {required ? "*" : ""} ({items.length})
          </label>
          <button
            type="button"
            onClick={() => setRawMode(true)}
            className="text-muted-foreground transition-colors hover:text-foreground"
            title={t('switchToJson')}
          >
            <Code className="size-3" />
          </button>
        </div>
        <div className="mt-1 space-y-1">
          {items.map((item, i) => (
            <div key={i} className="flex items-start gap-1">
              <Input
                className="flex-1 font-mono text-xs"
                value={typeof item === "string" ? item : JSON.stringify(item)}
                onChange={(e) => {
                  const next = [...items];
                  try {
                    next[i] = JSON.parse(e.target.value);
                  } catch {
                    next[i] = e.target.value;
                  }
                  onCommit(next);
                }}
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={() => onCommit(items.filter((_, idx) => idx !== i))}
              >
                <X className="size-3" />
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => onCommit([...items, ""])}
          >
            <Plus className="mr-1 size-3" />
            {t('add')}
          </Button>
        </div>
      </div>
    );
  }

  // JSON 原始编辑模式
  return (
    <div>
      <div className="flex items-center justify-between">
        <label className="text-xs text-muted-foreground">
          {labelFor(name)} {required ? "*" : ""}
        </label>
        {isArray && (
          <button
            type="button"
            onClick={() => setRawMode(false)}
            className="text-muted-foreground transition-colors hover:text-foreground"
            title={t('switchToList')}
          >
            <List className="size-3" />
          </button>
        )}
      </div>
      <Textarea
        className="mt-1 font-mono text-xs"
        rows={4}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setError(null);
        }}
        onBlur={() => {
          try {
            onCommit(JSON.parse(text));
            setError(null);
          } catch {
            setError(t('jsonFormatError'));
          }
        }}
      />
      {error ? <p className="mt-1 text-xs text-destructive">{error}</p> : null}
    </div>
  );
});

function ConfigField({
  nodeId,
  nodeType,
  name,
  schema,
  required,
  value,
  flowNames,
  fullConfig,
}: {
  nodeId: string;
  nodeType?: string;
  name: string;
  schema: Schema;
  required: boolean;
  value: unknown;
  flowNames: string[];
  fullConfig: Record<string, unknown>;
}) {
  const { updateConfig } = useNodeConfig(nodeId);
  const { t } = useTranslation('flow');
  const setValue = (next: unknown) => updateConfig({ [name]: next } as Record<string, unknown>);
  const label = labelFor(name);

  if (nodeType === "PromptBuild" && name === "fragments") {
    return (
      <PromptBuildFragmentsField
        label={label}
        required={required}
        value={value}
        onCommit={setValue}
      />
    );
  }

  if (nodeType === "WriteState" && name === "allowedKeys") {
    return (
      <StringListField
        label={label}
        required={required}
        value={value}
        placeholder="state key"
        addLabel={t('addKey')}
        onCommit={setValue}
      />
    );
  }

  if (nodeType === "WriteState" && name === "operations") {
    const allowedKeys = Array.isArray(fullConfig.allowedKeys) ? (fullConfig.allowedKeys as string[]) : [];
    return (
      <WriteStateOperationsField
        label={label}
        required={required}
        value={value}
        allowedKeys={allowedKeys}
        onCommit={setValue}
      />
    );
  }

  if (nodeType === "WriteState" && name === "constraints") {
    const allowedKeys = Array.isArray(fullConfig.allowedKeys) ? (fullConfig.allowedKeys as string[]) : [];
    return (
      <WriteStateConstraintsField
        label={label}
        required={required}
        value={value}
        allowedKeys={allowedKeys}
        onCommit={setValue}
      />
    );
  }

  if (nodeType === "WriteState" && name === "deduplicateBy") {
    const allowedKeys = Array.isArray(fullConfig.allowedKeys) ? (fullConfig.allowedKeys as string[]) : [];
    const operations = (fullConfig.operations && typeof fullConfig.operations === "object" && !Array.isArray(fullConfig.operations))
      ? (fullConfig.operations as Record<string, string>)
      : {};
    return (
      <WriteStateDeduplicateByField
        label={label}
        required={required}
        value={value}
        allowedKeys={allowedKeys}
        operations={operations}
        onCommit={setValue}
      />
    );
  }

  // ── Constant.value: type-aware editor based on sibling `type` field ──
  if (nodeType === "Constant" && name === "value") {
    const constType = String(fullConfig.type ?? "string");
    if (constType === "boolean") {
      return (
        <div className="flex items-center gap-2">
          <Checkbox
            id={`${nodeId}-${name}`}
            checked={Boolean(value)}
            onCheckedChange={(checked) => setValue(Boolean(checked))}
          />
          <label htmlFor={`${nodeId}-${name}`} className="text-xs text-muted-foreground">
            {label} {required ? "*" : ""}
          </label>
        </div>
      );
    }
    if (constType === "number") {
      return (
        <div>
          <label className="text-xs text-muted-foreground">{label} {required ? "*" : ""}</label>
          <Input type="number" className="mt-1" value={value === undefined ? "" : String(value)} onChange={(e) => setValue(e.target.value === "" ? undefined : Number(e.target.value))} />
        </div>
      );
    }
    if (constType === "string") {
      return (
        <div>
          <label className="text-xs text-muted-foreground">{label} {required ? "*" : ""}</label>
          <Input className="mt-1" value={String(value ?? "")} onChange={(e) => setValue(e.target.value)} />
        </div>
      );
    }
    // object / array → fall through to JsonField below
  }

  // ── ComputeState: inline editors for operand / trueValue / falseValue ──
  if (nodeType === "ComputeState" && (name === "trueValue" || name === "falseValue")) {
    return (
      <div>
        <label className="text-xs text-muted-foreground">{label} {required ? "*" : ""}</label>
        <Input className="mt-1" value={value === undefined ? "" : String(value)} onChange={(e) => {
          const raw = e.target.value;
          if (raw === "true") setValue(true);
          else if (raw === "false") setValue(false);
          else if (raw !== "" && !isNaN(Number(raw))) setValue(Number(raw));
          else setValue(raw);
        }} />
      </div>
    );
  }

  if (nodeType === "ComputeState" && name === "operand") {
    const op = String(fullConfig.operation ?? "increment");
    if (op === "lookup") {
      // lookup needs an object → fall through to JsonField
    } else {
      return (
        <div>
          <label className="text-xs text-muted-foreground">{label} {required ? "*" : ""}</label>
          <Input type="number" className="mt-1" value={value === undefined ? "" : String(value)} onChange={(e) => setValue(e.target.value === "" ? undefined : Number(e.target.value))} />
        </div>
      );
    }
  }

  // ── GenerateText.historyPolicy: inline maxMessages ──
  if (nodeType === "GenerateText" && name === "historyPolicy") {
    const policy = (value && typeof value === "object" && !Array.isArray(value)) ? value as Record<string, unknown> : {};
    return (
      <div>
        <label className="text-xs text-muted-foreground">{label} {required ? "*" : ""}</label>
        <div className="mt-1 flex items-center gap-2">
          <span className="text-xs text-muted-foreground">maxMessages</span>
          <Input
            type="number"
            className="w-24"
            value={policy.maxMessages === undefined ? "" : String(policy.maxMessages)}
            min={0}
            onChange={(e) => {
              const v = e.target.value;
              setValue(v === "" ? {} : { maxMessages: Number(v) });
            }}
          />
        </div>
      </div>
    );
  }

  if (name === "ref" && flowNames.length > 0) {
    return (
      <div>
        <label className="text-xs text-muted-foreground">
          {label} {required ? "*" : ""}
        </label>
        <Select value={String(value ?? "")} onValueChange={(next) => setValue(next)}>
          <SelectTrigger className="mt-1">
            <SelectValue placeholder={t('selectFlow')} />
          </SelectTrigger>
          <SelectContent>
            {flowNames.map((flowName) => (
              <SelectItem key={flowName} value={flowName}>
                {flowName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  if (schema.enum?.length) {
    return (
      <div>
        <label className="text-xs text-muted-foreground">
          {label} {required ? "*" : ""}
        </label>
        <Select value={String(value ?? "")} onValueChange={(next) => setValue(next)}>
          <SelectTrigger className="mt-1">
            <SelectValue placeholder={t('selectField', { field: labelFor(name) })} />
          </SelectTrigger>
          <SelectContent>
            {schema.enum.map((item) => (
              <SelectItem key={item} value={item}>
                {item}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  if (schema.type === "boolean") {
    return (
      <div className="flex items-center gap-2">
        <Checkbox
          id={`${nodeId}-${name}`}
          checked={Boolean(value)}
          onCheckedChange={(checked) => setValue(Boolean(checked))}
        />
        <label htmlFor={`${nodeId}-${name}`} className="text-xs text-muted-foreground">
          {label} {required ? "*" : ""}
        </label>
      </div>
    );
  }

  if (schema.type === "number" || schema.type === "integer") {
    return (
      <div>
        <label className="text-xs text-muted-foreground">
          {label} {required ? "*" : ""}
        </label>
        <Input
          type="number"
          className="mt-1"
          value={value === undefined ? "" : String(value)}
          onChange={(e) => {
            const next = e.target.value;
            setValue(next === "" ? undefined : Number(next));
          }}
        />
      </div>
    );
  }

  if (schema.type === "array" || schema.type === "object") {
    return (
      <JsonField
        name={name}
        value={value}
        required={required}
        onCommit={setValue}
      />
    );
  }

  return (
    <div>
      <label className="text-xs text-muted-foreground">
        {label} {required ? "*" : ""}
      </label>
      <Input
        className="mt-1"
        value={value === undefined ? "" : String(value)}
        onChange={(e) => setValue(e.target.value)}
      />
    </div>
  );
}

export const ManifestNode = memo(({ id, data, selected }: NodeProps) => {
  const { t } = useTranslation('flow');
  const nodeData = data as {
    label?: string;
    config?: Record<string, unknown>;
    inputs?: Array<{ name: string; type: string }>;
    outputs?: Array<{ name: string; type: string }>;
    manifest?: NodeManifest;
    overlay?: NodeOverlayState;
  };
  const manifest = nodeData.manifest;
  const overlay = nodeData.overlay;
  const config = nodeData.config || {};
  const { flowNames } = useFlowResource();
  const properties = ((manifest?.configSchema as Schema | undefined)?.properties || {}) as Record<string, Schema>;
  const required = new Set((manifest?.configSchema as Schema | undefined)?.required || []);
  const fieldCount = Object.keys(properties).length;
  const widthClass = fieldCount <= 1 ? 'w-64' : fieldCount <= 3 ? 'w-80' : 'w-96';

  return (
    <BaseNode className={`${widthClass} ${selected ? "ring-2 ring-primary" : ""} ${categoryClass(manifest?.category)} ${overlayClassName(overlay)}`}>
      <NodeOverlayBadge overlay={overlay} />
      <BaseNodeHeader className="border-b">
        {categoryIcon(manifest?.category)}
        <BaseNodeHeaderTitle>{nodeData.label || manifest?.label || "Node"}</BaseNodeHeaderTitle>
        {manifest?.category && (
          <span className="ml-auto text-[10px] uppercase text-muted-foreground">{manifest.category}</span>
        )}
      </BaseNodeHeader>
      <BaseNodeContent>
        {Object.keys(properties).length > 0 ? (
          <div className="space-y-2">
            {Object.entries(properties).map(([name, schema]) => (
              <ConfigField
                key={name}
                nodeId={id}
                nodeType={manifest?.type}
                name={name}
                schema={schema}
                required={required.has(name)}
                value={config[name]}
                flowNames={flowNames}
                fullConfig={config}
              />
            ))}
          </div>
        ) : (
          <div className="text-xs text-muted-foreground">
            {t('noEditableConfig')}
          </div>
        )}
      </BaseNodeContent>
      {(nodeData.inputs || []).map((input) => (
        <LabeledHandle
          key={`in-${input.name}`}
          id={input.name}
          title={`${input.name}${input.type ? ` (${input.type})` : ''}`}
          type="target"
          position={Position.Left}
        />
      ))}
      {(nodeData.outputs || []).map((output) => (
        <LabeledHandle
          key={`out-${output.name}`}
          id={output.name}
          title={`${output.name}${output.type ? ` (${output.type})` : ''}`}
          type="source"
          position={Position.Right}
          labelClassName="flex-1 text-right"
        />
      ))}
    </BaseNode>
  );
});

ManifestNode.displayName = "ManifestNode";
