# Fix "Reinventing the Wheel" — TODO

## Phase 1: @kal-ai/core 零依赖修复

### 1.5 LRU Cache 修复
- [ ] 在 `cache.ts` 的 `get()` 方法中，TTL 检查通过后添加 `delete + set` 提升到 Map 末尾
- [ ] 新增测试：验证访问过的 entry 在淘汰时被保留

### 1.1 AES-256-GCM 加密
- [ ] 实现 `encryptWithKey()` 使用 `crypto.createCipheriv('aes-256-gcm')`
- [ ] 实现 `decryptWithKey()` 使用 `crypto.createDecipheriv('aes-256-gcm')`
- [ ] 新版本前缀改为 `v3:`
- [ ] 在 `loadConfig()` 中添加 v2 → v3 自动迁移逻辑
- [ ] 新增 encrypt/decrypt round-trip 测试
- [ ] 新增 v2→v3 迁移测试
- [ ] 新增 GCM 篡改检测测试

### 1.2 修复 isEncrypted() 误判
- [ ] 将 `isEncrypted()` 改为只检查 `v3:` 和 `v2:` 前缀
- [ ] 新增测试：含冒号的普通 URL 不被误判

### 1.3 Deep Clone → structuredClone
- [ ] `state-store.ts`：删除 `deepCopy()` 方法，所有调用改为 `structuredClone()`
- [ ] `session-runner.ts`：去掉 `typeof structuredClone` 守卫和 JSON fallback
- [ ] `prompt-eval/executor.ts`：`JSON.parse(JSON.stringify())` → `structuredClone()`
- [ ] `ConfigManager.ts` L483：`JSON.parse(JSON.stringify())` → `structuredClone()`
- [ ] 新增 Date 对象 clone 测试

### 1.4 Deep Merge 统一
- [ ] 新建 `packages/core/src/utils/deep-merge.ts`
- [ ] 从 `index.ts` 导出 `deepMerge`
- [ ] `ConfigManager.ts`：删除两个私有 deepMerge 方法，改用导入
- [ ] 新建 `__tests__/utils/deep-merge.test.ts`

### 1.6 Token 估算改进
- [ ] 重写 `estimateTokens()` 区分 CJK/ASCII 字符
- [ ] 新增纯 ASCII、纯 CJK、中英混排测试

### 1.7 Retry 增加 AbortSignal
- [ ] `retry()` 新增可选 `signal?: AbortSignal` 参数
- [ ] `sleep()` 中 race timeout 与 signal
- [ ] 新增 abort mid-retry 测试

## Phase 2: @kal-ai/core 引入极小依赖

### 2.1 ID 生成 → nanoid
- [ ] 添加 `nanoid` 到 `packages/core/package.json`
- [ ] 新建 `packages/core/src/utils/id.ts`
- [ ] 从 `index.ts` 导出 `createId`
- [ ] `flow-executor.ts` L73：替换 `Math.random().toString(36)`
- [ ] 新建 `__tests__/utils/id.test.ts`

### 2.2 JSON Repair → jsonrepair
- [ ] 添加 `jsonrepair` 到 `packages/core/package.json`
- [ ] 重写 `json-repair.ts` 为薄包装（保留 `extractFromCodeBlock`）
- [ ] 删除 `removeComments`、`fixSingleQuotes`、`fixTrailingCommas`、`fixTruncated_`
- [ ] 简化 `JsonRepairOptions`
- [ ] 验证现有测试通过
- [ ] 新增嵌套转义和 Unicode 边界测试

### 2.3 Schema 验证 → valibot
- [ ] 添加 `valibot` 到 `packages/core/package.json`
- [ ] 定义 `kalConfigSchema` valibot schema
- [ ] 重写 `ConfigLoader.parse()` 使用 `v.parse()`
- [ ] 删除 `validateRequired()`、`validateConstraints()`、`fillDefaults()`
- [ ] 验证现有 `config-loader.test.ts` 通过

## Phase 3: @kal-ai/engine

### 3.1 CLI → citty
- [ ] 添加 `citty` 到 `apps/engine/package.json`
- [ ] 用 `defineCommand` 重写 10 个子命令
- [ ] 删除 `parseCommandArgs()` 和 if/else 分发
- [ ] 保留 `CliDependencies` 注入模式
- [ ] 验证现有 `cli.test.ts` 通过
- [ ] 新增短标志和 `--flag=value` 测试

### 3.2 Engine deepMerge → 导入 Core
- [ ] `runtime.ts`：删除 standalone `deepMerge` (L526-541)
- [ ] 添加 `import { deepMerge } from '@kal-ai/core'`

### 3.3 HTTP 路由 → Hono
- [ ] 添加 `hono` 到 `apps/engine/package.json`
- [ ] 新建 `apps/engine/src/routes/` 目录，拆分 9 个路由模块
- [ ] 新建 `apps/engine/src/app.ts` 组装 Hono app
- [ ] 更新 `startEngineServer` 使用 Hono Node adapter
- [ ] 更新 `startStudioServer` 使用 Hono app
- [ ] 迁移 CORS、body parsing、SSE 到 Hono 中间件
- [ ] 保持 `EngineEventBus`、`RunManager`、`TerminalSessionManager` 不变
- [ ] 适配 `server.test.ts` (27 tests)
- [ ] 适配 `dogfooding.test.ts` (35 tests)
- [ ] 验证全部测试通过

## Phase 4: @kal-ai/studio（可并行）

### 4.1 Studio Deep Clone → structuredClone
- [ ] `studioStore.ts`：删除 `cloneValue()`，7 处调用改为 `structuredClone()`
- [ ] `ConfigEditor.tsx` L19：改为 `structuredClone()`

### 4.2 Studio ID → nanoid
- [ ] 添加 `nanoid` 到 `apps/studio/package.json`
- [ ] `studioStore.ts`：`createId()` 改用 `nanoid(12)`
- [ ] `Flow.tsx` L656：改用 `nanoid(10)`

### 4.3 键盘快捷键 → hotkeys-js
- [ ] 添加 `hotkeys-js` 到 `apps/studio/package.json`
- [ ] 删除 `lib/keyboard.ts` 中的 `matchShortcut()` 函数（保留 `isEditableTarget()`）
- [ ] 重写 `hooks/use-global-shortcuts.ts`：用 `hotkeys()` 替代手动 keydown 监听
- [ ] 命令注册表 shortcut 字符串 toLowerCase 适配 hotkeys-js 格式
- [ ] 验证所有现有快捷键正常工作（Ctrl+Z, Ctrl+Shift+Z, Ctrl+S, Ctrl+K 等）
