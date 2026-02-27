# Monorepo 工程配置

## Context

KAL-AI 采用 bun workspace monorepo 管理三个包：`@kal-ai/core`、`@kal-ai/orchestrate`、`@kal-ai/devkit`。本文档定义仓库结构、依赖关系、构建配置和开发流程，确保团队成员能快速搭建开发环境并行开发。

技术选型：bun workspace、TypeScript 5.x 严格模式、tsup 构建（ESM + CJS 双格式）、vitest 测试、changesets 版本管理。

## 零、版本兼容性

| 运行环境 | 最低版本 | 说明 |
|---------|---------|------|
| Node.js | 18.0 | 需要内置 `fetch`（18+）和 `crypto.subtle` |
| Bun | 1.1 | workspace 依赖解析 |
| TypeScript | 5.0 | `const` type parameters、`satisfies` 等语法 |
| 浏览器 | Chrome 90 / Firefox 88 / Safari 15 | 需要 `fetch`、`crypto.subtle`、`ReadableStream` |

**浏览器不可用的功能：**
- MCP stdio transport（依赖 `child_process`）— 浏览器只支持 SSE/HTTP transport
- `@kal-ai/devkit` 的 `FlowRunner`（依赖文件系统读取 Flow JSON）
- Storage L2 的 fs 实现（需开发者注入 `localStorage`/`IndexedDB` 适配器）

**运行时平台检测：**
```typescript
// core 内部使用，不对外暴露
const isBrowser = typeof window !== 'undefined'
const isNode = typeof process !== 'undefined' && process.versions?.node != null
```

## 一、仓库顶层结构

```
kal-ai/
├── package.json                # 根 package（private，定义 workspace 脚本）
├── bunfig.toml                 # bun 配置 + workspace 声明
├── tsconfig.base.json          # 共享 TS 配置
├── tsconfig.json               # 根 project references
├── .gitignore
├── .changeset/                 # changesets 版本管理
│   └── config.json
├── packages/
│   ├── core/                   # @kal-ai/core
│   ├── orchestrate/            # @kal-ai/orchestrate
│   └── devkit/                 # @kal-ai/devkit
├── examples/                   # 示例项目（独立 repo 规划，暂放此处）
│   └── simple-text-rpg/
└── docs/                       # 设计文档
```

## 二、包间依赖关系

```
@kal-ai/core          ← 无内部依赖（基础层）
@kal-ai/orchestrate   ← 依赖 @kal-ai/core
@kal-ai/devkit        ← 依赖 @kal-ai/core + @kal-ai/orchestrate
```

依赖方向严格单向，不允许反向或循环依赖。

### 典型集成模式

**Module 模式（core + orchestrate）**

```typescript
import { createKalCore } from '@kal-ai/core'
import { createFlowExecutor } from '@kal-ai/orchestrate'
import { base, field, compose, formatXML } from '@kal-ai/core'

const core = createKalCore({
  models: { default: { modelId: 'deepseek-chat', baseUrl: '...', apiKey: '...' } },
  state: { initialState: { player: { hp: 100 }, scene: { narrative: '' } } },
})

const executor = createFlowExecutor({ core })
executor.load(myFlowDefinition)
await executor.start()

// 等待 interact 节点，提交用户输入
executor.submit('wait-action', { action: 'attack' })

const result = await executor.wait()
console.log(core.state.get('scene.narrative'))
```

**开发测试模式（core + orchestrate + devkit）**

```typescript
import { createKalCore } from '@kal-ai/core'
import { createSimulator, assert } from '@kal-ai/devkit'

const core = createKalCore({
  models: {
    default: {
      modelId: 'deepseek-chat',
      baseUrl: 'https://api.deepseek.com/v1',
      apiKey: process.env.DEEPSEEK_API_KEY!,
    }
  },
  state: { initialState: { player: { hp: 100 } } },
})
const simulator = createSimulator()

const result = await simulator.run({
  core,
  flow: myFlowDefinition,
  strategy: createLLMPlayerStrategy({ core, systemPrompt: '你是一个测试玩家' }),
  maxRounds: 10,
  assertions: [
    assert.stateRange('player.hp', 0, 100),
    assert.outputContains('narrative', ['勇者']),
    assert.maxLatency(5000),
  ],
})

console.log(`通过率: ${result.assertionResults?.filter(r => r.passed).length}/${result.assertionResults?.length}`)
```

## 三、关键配置文件

### 3.1 bunfig.toml

```toml
[workspace]
packages = ["packages/*", "examples/*"]
```

### 3.2 根 package.json

```json
{
  "name": "kal-ai",
  "private": true,
  "type": "module",
  "workspaces": ["packages/*", "examples/*"],
  "scripts": {
    "build": "bun --filter './packages/*' run build",
    "build:core": "bun --filter @kal-ai/core run build",
    "build:orchestrate": "bun --filter @kal-ai/orchestrate run build",
    "build:devkit": "bun --filter @kal-ai/devkit run build",
    "test": "bun --filter './packages/*' run test",
    "test:core": "bun --filter @kal-ai/core run test",
    "test:orchestrate": "bun --filter @kal-ai/orchestrate run test",
    "test:devkit": "bun --filter @kal-ai/devkit run test",
    "lint": "bun --filter './packages/*' run lint",
    "typecheck": "bun --filter './packages/*' run typecheck",
    "clean": "bun --filter './packages/*' run clean",
    "changeset": "changeset",
    "version": "changeset version",
    "release": "bun run build && changeset publish"
  },
  "devDependencies": {
    "@changesets/cli": "^2.27.0",
    "typescript": "^5.6.0"
  }
}
```

### 3.3 bunfig.toml 补充配置

```toml
[install]
peer = true
```

> bun 默认严格隔离依赖，无需 `.npmrc`。`peer = true` 等价于 pnpm 的 `auto-install-peers`。

### 3.4 tsconfig.base.json（共享 TS 配置）

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "exactOptionalPropertyTypes": false
  }
}
```

### 3.5 根 tsconfig.json（Project References）

```json
{
  "files": [],
  "references": [
    { "path": "packages/core" },
    { "path": "packages/orchestrate" },
    { "path": "packages/devkit" }
  ]
}
```

## 四、各包配置模板

以 `@kal-ai/core` 为例，其他包结构相同，仅依赖不同。

### 4.1 packages/core/package.json

```json
{
  "name": "@kal-ai/core",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/cjs/index.cjs",
  "module": "./dist/esm/index.js",
  "types": "./dist/types/index.d.ts",
  "exports": {
    ".": {
      "import": {
        "types": "./dist/types/index.d.ts",
        "default": "./dist/esm/index.js"
      },
      "require": {
        "types": "./dist/types/index.d.cts",
        "default": "./dist/cjs/index.cjs"
      }
    }
  },
  "sideEffects": false,
  "files": ["dist"],
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src/",
    "clean": "rm -rf dist"
  },
  "devDependencies": {
    "tsup": "^8.0.0",
    "vitest": "^2.0.0",
    "@vitest/coverage-v8": "^2.0.0",
    "typescript": "^5.6.0"
  }
}
```

### 4.2 packages/core/tsconfig.json

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist/types",
    "rootDir": "./src",
    "composite": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["**/__tests__/**", "dist"]
}
```

### 4.3 packages/core/tsup.config.ts

```typescript
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  outDir: 'dist',
  outExtension({ format }) {
    return {
      js: format === 'cjs' ? '.cjs' : '.js',
    }
  },
})
```

### 4.4 packages/orchestrate/package.json（依赖差异部分）

```json
{
  "name": "@kal-ai/orchestrate",
  "version": "0.1.0",
  "dependencies": {
    "@kal-ai/core": "workspace:*"
  }
}
```

其余字段（exports、scripts、devDependencies）与 core 相同。

### 4.5 packages/orchestrate/tsconfig.json

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist/types",
    "rootDir": "./src",
    "composite": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["**/__tests__/**", "dist"],
  "references": [
    { "path": "../core" }
  ]
}
```

### 4.6 packages/devkit/package.json（依赖差异部分）

```json
{
  "name": "@kal-ai/devkit",
  "version": "0.1.0",
  "dependencies": {
    "@kal-ai/core": "workspace:*",
    "@kal-ai/orchestrate": "workspace:*"
  }
}
```

### 4.7 packages/devkit/tsconfig.json

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist/types",
    "rootDir": "./src",
    "composite": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["**/__tests__/**", "dist"],
  "references": [
    { "path": "../core" },
    { "path": "../orchestrate" }
  ]
}
```

## 五、浏览器 + Node.js 双端兼容策略

| 能力 | Node.js | 浏览器 | 策略 |
|------|---------|--------|------|
| HTTP 请求 | 内置 fetch | fetch API | 统一用 `fetch`（Node 18+） |
| MCP stdio | child_process | 不可用 | 运行时检测，浏览器仅支持 SSE/HTTP |
| Storage L2 | fs | localStorage/IndexedDB | 通过 `Storage` 接口抽象 |
| crypto | crypto.createHash | SubtleCrypto | 统一 hash 工具函数 |
| Timer | setTimeout/setInterval | 同 | 无差异 |
| WebSocket | ws 库 | 原生 WebSocket | 条件导入或统一接口 |

核心原则：`src/` 中不直接 import Node.js 内置模块，平台特定能力通过接口注入。

## 六、开发流程

### 6.1 环境搭建

```bash
# 克隆仓库
git clone <repo-url> && cd kal-ai

# 安装依赖（bun 自动 link workspace 包）
bun install

# 全量构建（按依赖顺序：core → orchestrate → devkit）
bun run build

# 类型检查
bun run typecheck

# 全量测试
bun run test
```

### 6.2 日常开发

```bash
# 只开发 core
bun run build:core
bun run test:core

# 开发 orchestrate（需先构建 core）
bun run build:core && bun run build:orchestrate

# watch 模式（单包内）
cd packages/core && bun run dev
```

### 6.3 新增依赖

```bash
# 给 core 加外部依赖
bun add --filter @kal-ai/core some-package

# 给 core 加开发依赖
bun add --filter @kal-ai/core -D some-dev-package

# workspace 内部依赖已在 package.json 中声明，无需手动 add
```

### 6.4 版本发布（changesets）

```bash
# 1. 创建 changeset（描述本次变更）
bunx changeset

# 2. 更新版本号
bunx changeset version

# 3. 构建 + 发布
bun run release
```

## 七、构建顺序与 CI

bun workspace 的 `--filter` 命令会自动按依赖拓扑排序执行，构建顺序为：

```
core → orchestrate → devkit
```

### CI 流水线（GitHub Actions 示例）

```yaml
name: CI
on: [push, pull_request]

jobs:
  build-and-test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        bun-version: [1.1, 1.2]
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: ${{ matrix.bun-version }}
      - run: bun install --frozen-lockfile
      - run: bun run typecheck
      - run: bun run build
      - run: bun run test
```

## 八、.gitignore

```gitignore
node_modules/
dist/
*.tsbuildinfo
.turbo/
coverage/
.DS_Store
*.local
.env
.env.*
```

## 九、搭建检查清单

- [ ] bunfig.toml 创建
- [ ] 根 package.json + tsconfig.base.json + tsconfig.json 创建
- [ ] packages/core 骨架（package.json + tsconfig.json + tsup.config.ts + src/index.ts）
- [ ] packages/orchestrate 骨架（同上 + 依赖 core）
- [ ] packages/devkit 骨架（同上 + 依赖 core + orchestrate）
- [ ] `bun install` 成功
- [ ] `bun run typecheck` 通过（空 index.ts 即可）
- [ ] `bun run build` 三个包均输出 dist/
- [ ] `bun run test` 通过（空测试文件即可）
