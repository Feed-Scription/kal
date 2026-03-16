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

function categoryClass(category?: string) {
  switch (category) {
    case "signal":
      return "border-sky-200 bg-sky-50/60";
    case "state":
      return "border-emerald-200 bg-emerald-50/60";
    case "llm":
      return "border-amber-200 bg-amber-50/60";
    case "transform":
      return "border-fuchsia-200 bg-fuchsia-50/60";
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
  const [text, setText] = useState(() => JSON.stringify(value ?? (name.endsWith("s") ? [] : {}), null, 2));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setText(JSON.stringify(value ?? (name.endsWith("s") ? [] : {}), null, 2));
    setError(null);
  }, [name, value]);

  return (
    <div>
      <label className="text-xs text-muted-foreground">
        {labelFor(name)} {required ? "*" : ""}
      </label>
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
            setError("JSON 格式错误");
          }
        }}
      />
      {error ? <p className="mt-1 text-xs text-destructive">{error}</p> : null}
    </div>
  );
});

function ConfigField({
  nodeId,
  name,
  schema,
  required,
  value,
  flowNames,
}: {
  nodeId: string;
  name: string;
  schema: Schema;
  required: boolean;
  value: unknown;
  flowNames: string[];
}) {
  const { updateConfig } = useNodeConfig(nodeId);
  const setValue = (next: unknown) => updateConfig({ [name]: next } as Record<string, unknown>);

  if (name === "ref" && flowNames.length > 0) {
    return (
      <div>
        <label className="text-xs text-muted-foreground">
          {labelFor(name)} {required ? "*" : ""}
        </label>
        <Select value={String(value ?? "")} onValueChange={(next) => setValue(next)}>
          <SelectTrigger className="mt-1">
            <SelectValue placeholder="选择 Flow" />
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
          {labelFor(name)} {required ? "*" : ""}
        </label>
        <Select value={String(value ?? "")} onValueChange={(next) => setValue(next)}>
          <SelectTrigger className="mt-1">
            <SelectValue placeholder={`选择 ${labelFor(name)}`} />
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
          {labelFor(name)} {required ? "*" : ""}
        </label>
      </div>
    );
  }

  if (schema.type === "number" || schema.type === "integer") {
    return (
      <div>
        <label className="text-xs text-muted-foreground">
          {labelFor(name)} {required ? "*" : ""}
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
        {labelFor(name)} {required ? "*" : ""}
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
  const nodeData = data as {
    label?: string;
    config?: Record<string, unknown>;
    inputs?: Array<{ name: string; type: string }>;
    outputs?: Array<{ name: string; type: string }>;
    manifest?: NodeManifest;
  };
  const manifest = nodeData.manifest;
  const config = nodeData.config || {};
  const { flowNames } = useFlowResource();
  const properties = ((manifest?.configSchema as Schema | undefined)?.properties || {}) as Record<string, Schema>;
  const required = new Set((manifest?.configSchema as Schema | undefined)?.required || []);

  return (
    <BaseNode className={`w-96 ${selected ? "ring-2 ring-primary" : ""} ${categoryClass(manifest?.category)}`}>
      <BaseNodeHeader className="border-b">
        <BaseNodeHeaderTitle>{nodeData.label || manifest?.label || "Node"}</BaseNodeHeaderTitle>
      </BaseNodeHeader>
      <BaseNodeContent>
        {Object.keys(properties).length > 0 ? (
          <div className="space-y-2">
            {Object.entries(properties).map(([name, schema]) => (
              <ConfigField
                key={name}
                nodeId={id}
                name={name}
                schema={schema}
                required={required.has(name)}
                value={config[name]}
                flowNames={flowNames}
              />
            ))}
          </div>
        ) : (
          <div className="text-xs text-muted-foreground">
            该节点没有可编辑配置。
          </div>
        )}
      </BaseNodeContent>
      {(nodeData.inputs || []).map((input) => (
        <LabeledHandle
          key={`in-${input.name}`}
          id={input.name}
          title={input.name}
          type="target"
          position={Position.Left}
        />
      ))}
      {(nodeData.outputs || []).map((output) => (
        <LabeledHandle
          key={`out-${output.name}`}
          id={output.name}
          title={output.name}
          type="source"
          position={Position.Right}
          labelClassName="flex-1 text-right"
        />
      ))}
    </BaseNode>
  );
});

ManifestNode.displayName = "ManifestNode";
