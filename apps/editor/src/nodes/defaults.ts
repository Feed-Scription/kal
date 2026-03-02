/**
 * Default config, inputs, and outputs for each node type.
 * Used when creating new nodes in the editor.
 */

type HandleDef = {
  name: string;
  type: string;
  required?: boolean;
  defaultValue?: unknown;
};

type NodeDefaults = {
  label: string;
  config: Record<string, unknown>;
  inputs: HandleDef[];
  outputs: HandleDef[];
};

export const NODE_DEFAULTS: Record<string, NodeDefaults> = {
  SignalIn: {
    label: "信号输入",
    config: {},
    inputs: [],
    outputs: [{ name: "data", type: "object" }],
  },
  SignalOut: {
    label: "信号输出",
    config: {},
    inputs: [{ name: "data", type: "object" }],
    outputs: [],
  },
  Timer: {
    label: "计时器",
    config: { delay: 0 },
    inputs: [],
    outputs: [{ name: "timestamp", type: "number" }],
  },
  AddState: {
    label: "添加状态",
    config: {},
    inputs: [
      { name: "key", type: "string", required: true },
      { name: "type", type: "string", required: true },
      { name: "value", type: "any", required: true },
    ],
    outputs: [{ name: "success", type: "boolean" }],
  },
  RemoveState: {
    label: "删除状态",
    config: {},
    inputs: [{ name: "key", type: "string", required: true }],
    outputs: [{ name: "success", type: "boolean" }],
  },
  ReadState: {
    label: "读取状态",
    config: {},
    inputs: [{ name: "key", type: "string", required: true }],
    outputs: [
      { name: "value", type: "any" },
      { name: "exists", type: "boolean" },
    ],
  },
  ModifyState: {
    label: "修改状态",
    config: {},
    inputs: [
      { name: "key", type: "string", required: true },
      { name: "value", type: "any", required: true },
    ],
    outputs: [{ name: "success", type: "boolean" }],
  },
  PromptBuild: {
    label: "Prompt 构建",
    config: { fragments: [] },
    inputs: [{ name: "data", type: "object" }],
    outputs: [
      { name: "text", type: "string" },
      { name: "estimatedTokens", type: "number" },
    ],
  },
  Message: {
    label: "消息组装",
    config: { system: "", user: "", format: "xml" },
    inputs: [
      { name: "system", type: "string" },
      { name: "user", type: "string" },
      { name: "history", type: "array" },
    ],
    outputs: [{ name: "messages", type: "array" }],
  },
  GenerateText: {
    label: "生成文本",
    config: { model: "", temperature: 0.7, maxTokens: 2000 },
    inputs: [{ name: "messages", type: "array", required: true }],
    outputs: [
      { name: "text", type: "string" },
      { name: "usage", type: "object" },
    ],
  },
  GenerateImage: {
    label: "生成图像",
    config: { model: "dall-e-3" },
    inputs: [{ name: "prompt", type: "string", required: true }],
    outputs: [{ name: "imageUrl", type: "object" }],
  },
  Regex: {
    label: "正则匹配",
    config: { pattern: "", flags: "g" },
    inputs: [{ name: "text", type: "string", required: true }],
    outputs: [
      { name: "matches", type: "array" },
      { name: "groups", type: "object" },
    ],
  },
  JSONParse: {
    label: "JSON 解析",
    config: {
      extractFromCodeBlock: true,
      fixCommonErrors: true,
      fixTruncated: true,
    },
    inputs: [{ name: "text", type: "string", required: true }],
    outputs: [
      { name: "data", type: "object" },
      { name: "success", type: "boolean" },
      { name: "error", type: "string" },
    ],
  },
  PostProcess: {
    label: "后处理",
    config: { processors: [] },
    inputs: [{ name: "text", type: "string", required: true }],
    outputs: [{ name: "text", type: "string" }],
  },
  SubFlow: {
    label: "子流程",
    config: { ref: "" },
    inputs: [{ name: "input", type: "object" }],
    outputs: [{ name: "output", type: "object" }],
  },
};
