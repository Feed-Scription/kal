# Fix "Reinventing the Wheel" — Checklist

每个 Phase 完成后逐项勾选验证。

---

## Phase 1: @kal-ai/core 零依赖修复

### 构建 & 测试
- [ ] `cd packages/core && pnpm test` 全部通过
- [ ] `cd packages/core && pnpm typecheck` 无错误
- [ ] 无新增 runtime 依赖（`package.json` dependencies 仍只有 `esbuild`）

### 1.5 LRU Cache
- [ ] `cache.ts` 的 `get()` 在 TTL 通过后执行 delete+set
- [ ] 测试验证：频繁访问的 key 不会被淘汰（真 LRU 语义）

### 1.1 + 1.2 加密 & isEncrypted
- [ ] `encryptWithKey` 使用 `aes-256-gcm`，输出含 IV + authTag
- [ ] `decryptWithKey` 使用 `aes-256-gcm`，验证 authTag
- [ ] 新加密值前缀为 `v3:`
- [ ] `v2:` 旧值在 `loadConfig()` 时自动迁移为 `v3:`
- [ ] `isEncrypted()` 只匹配 `v3:` 和 `v2:` 前缀
- [ ] `https://api.openai.com` 不被 `isEncrypted()` 误判
- [ ] 篡改密文后解密抛错（GCM 认证）

### 1.3 Deep Clone
- [ ] `state-store.ts` 中 `deepCopy` 方法已删除
- [ ] `session-runner.ts` 中无 `typeof structuredClone` 守卫
- [ ] `prompt-eval/executor.ts` 中无 `JSON.parse(JSON.stringify())`
- [ ] `ConfigManager.ts` `exportConfig()` 中无 `JSON.parse(JSON.stringify())`
- [ ] 所有替换点使用 `structuredClone()`

### 1.4 Deep Merge
- [ ] `packages/core/src/utils/deep-merge.ts` 存在且导出 `deepMerge`
- [ ] `index.ts` 导出 `deepMerge`
- [ ] `ConfigManager.ts` 中无私有 `deepMerge` / `deepMergeConfig` 方法
- [ ] 新测试覆盖：嵌套对象合并、数组替换、undefined 处理

### 1.6 Token 估算
- [ ] `estimateTokens()` 对纯中文文本返回值 > `text.length / 4`（旧公式）
- [ ] 函数签名未变（公开 API 兼容）
- [ ] 测试覆盖纯 ASCII、纯 CJK、混排三种场景

### 1.7 Retry AbortSignal
- [ ] `retry()` 接受可选 `signal?: AbortSignal`
- [ ] abort 后不再发起新尝试
- [ ] 测试验证 abort mid-retry 抛出 AbortError

---

## Phase 2: @kal-ai/core 引入极小依赖

### 构建 & 测试
- [ ] `cd packages/core && pnpm test` 全部通过
- [ ] `cd packages/core && pnpm typecheck` 无错误
- [ ] `package.json` 新增依赖仅为 `nanoid`、`jsonrepair`、`valibot`

### 2.1 nanoid
- [ ] `packages/core/src/utils/id.ts` 存在且导出 `createId`
- [ ] `index.ts` 导出 `createId`
- [ ] `flow-executor.ts` 中无 `Math.random().toString(36)`
- [ ] 生成的 ID 长度和格式符合预期

### 2.2 jsonrepair
- [ ] `json-repair.ts` 行数 < 40（薄包装）
- [ ] `removeComments`、`fixSingleQuotes`、`fixTrailingCommas`、`fixTruncated_` 已删除
- [ ] 现有 `json-repair.test.ts` 全部通过
- [ ] 新增测试覆盖嵌套转义和 Unicode

### 2.3 valibot
- [ ] `config-loader.ts` 中无手写 `validateRequired` / `validateConstraints` / `fillDefaults`
- [ ] 使用 valibot schema 声明替代
- [ ] 现有 `config-loader.test.ts` 全部通过
- [ ] 错误消息仍为 `ConfigError` 类型

---

## Phase 3: @kal-ai/engine

### 构建 & 测试
- [ ] `cd apps/engine && pnpm test` 全部通过
- [ ] `cd apps/engine && pnpm typecheck` 无错误
- [ ] `package.json` 新增依赖仅为 `citty`、`hono`

### 3.1 citty CLI
- [ ] `cli.ts` 中无手写 `parseCommandArgs` 函数
- [ ] 10 个子命令均使用 citty `defineCommand`
- [ ] 支持短标志（如 `-p 3000`）
- [ ] 支持布尔标志（如 `--force-new` 无需跟值）
- [ ] 支持 `--flag=value` 语法
- [ ] `CliDependencies` 注入模式保留
- [ ] 现有 `cli.test.ts` 全部通过

### 3.2 Engine deepMerge
- [ ] `runtime.ts` 中无 standalone `deepMerge` 函数
- [ ] 使用 `import { deepMerge } from '@kal-ai/core'`

### 3.3 Hono HTTP 路由
- [ ] `apps/engine/src/routes/` 目录存在，含 ≥8 个路由模块
- [ ] `apps/engine/src/app.ts` 存在，组装 Hono app
- [ ] `server.ts` 中无 if/else 路由链
- [ ] CORS 通过 Hono 中间件处理
- [ ] SSE 端点正常工作（`/api/events`、`/api/runs/:id/stream`）
- [ ] `EngineEventBus` 类保持不变
- [ ] `RunManager` 类保持不变
- [ ] `TerminalSessionManager` 类保持不变
- [ ] `server.test.ts` 全部通过（27 tests）
- [ ] `dogfooding.test.ts` 全部通过（35 tests）

### 手动验证
- [ ] `kal studio` 启动正常，Studio UI 可访问
- [ ] `kal serve` 启动正常，API 可调用
- [ ] `kal lint` 正常执行
- [ ] `kal smoke --dry-run` 正常执行
- [ ] `kal config set-key openai test-key-123` 写入 v3 加密值
- [ ] `kal config list` 正确显示（解密后）

---

## Phase 4: @kal-ai/studio

### 构建
- [ ] `cd apps/studio && pnpm typecheck` 无错误
- [ ] `package.json` 新增依赖仅为 `nanoid`、`hotkeys-js`

### 4.1 structuredClone
- [ ] `studioStore.ts` 中无 `cloneValue` 函数
- [ ] `ConfigEditor.tsx` 中无 `JSON.parse(JSON.stringify())`
- [ ] 所有替换点使用 `structuredClone()`

### 4.2 nanoid
- [ ] `studioStore.ts` 中 `createId()` 使用 `nanoid`
- [ ] `Flow.tsx` 中节点复制 ID 使用 `nanoid`
- [ ] 无 `Math.random().toString(36)` 残留

### 4.3 hotkeys-js
- [ ] `lib/keyboard.ts` 中无 `matchShortcut` 函数
- [ ] `hooks/use-global-shortcuts.ts` 使用 `hotkeys()` 注册快捷键
- [ ] 所有现有快捷键正常工作（Ctrl+Z, Ctrl+Shift+Z, Ctrl+S, Ctrl+K 等）
- [ ] 可编辑元素中快捷键不误触发

---

## 全量验证

- [ ] `pnpm test`（monorepo 全量测试通过）
- [ ] `pnpm typecheck`（monorepo 全量类型检查通过）
- [ ] `pnpm --filter @kal-ai/engine build`（engine 构建成功）
- [ ] `pnpm --filter @kal-ai/core build`（core 构建成功）
- [ ] 代码中无 `Math.random().toString(36)` 残留（`grep -r` 验证）
- [ ] 代码中无 `JSON.parse(JSON.stringify(` 残留（`grep -r` 验证，排除测试文件）
- [ ] 代码中无手写 `deepCopy` / `deepClone` 方法残留
