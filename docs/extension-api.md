# KAL Studio Extension API Reference

本文档描述 KAL Studio 第三方扩展的 API 规范。扩展通过声明式 manifest 注册能力，通过 Kernel 提供的 typed capabilities 消费平台服务。

## 扩展类型

| Kind | 说明 | 典型权限 | 风险等级 |
|------|------|----------|----------|
| `node-pack` | 自定义节点包 | `project.read` | 低 |
| `studio-extension` | Studio UI 扩展（view/panel/inspector） | `project.read`, `project.write` | 中 |
| `template-pack` | 项目模板包 | 无 | 低 |
| `starter-pack` | 项目脚手架包 | `project.write` | 低 |
| `theme-pack` | 主题包（仅 CSS 变量） | 无 | 极低 |

## Package Manifest

每个扩展包必须在根目录包含 `manifest.json`：

```json
{
  "id": "my-org.battle-nodes",
  "kind": "node-pack",
  "version": "1.0.0",
  "name": "Battle System Nodes",
  "description": "回合制战斗系统的自定义节点集合",
  "author": "my-org",
  "license": "MIT",
  "capabilities": ["project.read"],
  "host": "browser",
  "activationEvents": ["onView:kal.flow"],
  "contributes": {
    "nodes": [
      {
        "type": "battle/damage-calc",
        "label": "伤害计算",
        "category": "Battle",
        "inputs": [
          { "name": "attacker", "type": "object", "required": true },
          { "name": "defender", "type": "object", "required": true }
        ],
        "outputs": [
          { "name": "damage", "type": "number" },
          { "name": "result", "type": "object" }
        ]
      }
    ]
  }
}
```

### 必填字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | 全局唯一标识，建议 `org.package-name` 格式 |
| `kind` | `PackageKind` | 包类型 |
| `version` | `string` | 语义化版本号 |
| `name` | `string` | 显示名称 |

### 可选字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `description` | `string` | 包描述 |
| `author` | `string` | 作者 |
| `license` | `string` | 许可证 |
| `repository` | `string` | 源码仓库 URL |
| `capabilities` | `string[]` | 请求的平台能力 |
| `host` | `'browser' \| 'workspace' \| 'service'` | 运行宿主 |
| `activationEvents` | `string[]` | 激活条件 |
| `contributes` | `PackageContributions` | 贡献点声明 |
| `dependencies` | `Record<string, string>` | 依赖的其他包 |
| `main` | `string` | 入口文件路径 |
| `runtime` | `string` | 运行时代码路径 |
| `studio` | `string` | Studio 侧代码路径 |

## Capability 系统

扩展通过 `capabilities` 字段声明所需的平台能力。安装时 Studio 会向用户展示权限审批界面。

### 可用 Capabilities

| ID | 说明 | 审批策略 |
|----|------|----------|
| `project.read` | 读取项目资源 | 自动 |
| `project.write` | 写入项目资源 | 需确认 |
| `engine.execute` | 执行 flow/session run | 需确认 |
| `engine.debug` | 访问调试接口 | 需确认 |
| `trace.read` | 读取 run trace | 自动 |
| `network.fetch` | 访问外部网络 | 需确认 |
| `process.exec` | 执行本地进程 | 管理员 |
| `package.install` | 安装包 | 管理员 |
| `package.publish` | 发布包 | 管理员 |
| `comment.write` | 写入评论 | 需确认 |
| `review.accept` | 接受 review proposal | 管理员 |
| `ai.invoke` | 调用 AI 能力 | 需确认 |

### 权限降级

扩展可声明某些 capability 为可选，缺失时降级运行：

```json
{
  "capabilities": ["project.read"],
  "optionalCapabilities": ["trace.read"]
}
```

## 贡献点（Contributes）

### nodes

自定义节点，注册到 Flow Editor 的节点面板：

```json
{
  "contributes": {
    "nodes": [
      {
        "type": "my-org/custom-node",
        "label": "自定义节点",
        "category": "Custom",
        "inputs": [{ "name": "input", "type": "string" }],
        "outputs": [{ "name": "output", "type": "string" }],
        "configSchema": { "temperature": { "type": "number", "default": 0.7 } }
      }
    ]
  }
}
```

### views

注册主编辑区视图：

```json
{
  "contributes": {
    "views": [
      { "id": "my-org.analytics", "title": "数据分析", "icon": "chart" }
    ]
  }
}
```

### panels

注册底部/侧边面板：

```json
{
  "contributes": {
    "panels": [
      { "id": "my-org.metrics", "title": "性能指标", "slot": "down" }
    ]
  }
}
```

### commands

注册命令面板命令：

```json
{
  "contributes": {
    "commands": [
      { "id": "my-org.export-pdf", "title": "导出为 PDF" }
    ]
  }
}
```

### templates

注册项目模板：

```json
{
  "contributes": {
    "templates": [
      {
        "id": "battle-system",
        "name": "回合制战斗系统",
        "description": "完整的回合制战斗 flow 模板",
        "category": "Game",
        "tags": ["battle", "turn-based"],
        "flows": ["battle/main", "battle/skills"],
        "sessionRef": "battle-session",
        "stateKeys": ["hp", "mp", "turn"]
      }
    ]
  }
}
```

### themes

注册主题包：

```json
{
  "contributes": {
    "themes": [
      { "id": "dark-ocean", "name": "深海暗色" }
    ]
  }
}
```

## 激活事件（Activation Events）

| 事件 | 说明 | 示例 |
|------|------|------|
| `onView:<viewId>` | 用户打开指定视图时 | `onView:kal.flow` |
| `onCommand:<commandId>` | 用户执行指定命令时 | `onCommand:my-org.export` |
| `onEvent:<eventName>` | Kernel 事件触发时 | `onEvent:run.updated` |

## 扩展生命周期

```text
注册 → 激活 → 运行 → 停用/崩溃恢复
```

1. **注册**：Studio 启动时读取 `packages/` 目录下的 manifest
2. **激活**：满足 `activationEvents` 条件时激活扩展
3. **运行**：扩展正常提供贡献内容
4. **崩溃恢复**：扩展崩溃 3 次/5 分钟后自动禁用，用户可手动重新启用

## 信任级别

| 级别 | 说明 | 来源 |
|------|------|------|
| `official` | 官方签名 | KAL 团队发布 |
| `team` | 团队签名 | 团队 registry |
| `third-party` | 有作者信息 | 公开来源 |
| `unverified` | 未验证 | 未知来源 |

## 包目录结构

```text
my-package/
├── manifest.json      # 必须：包 manifest
├── runtime/           # 可选：运行时代码（node-pack）
├── studio/            # 可选：Studio 侧代码（studio-extension）
├── templates/         # 可选：模板文件（template-pack）
├── tests/             # 可选：测试
├── examples/          # 可选：示例
└── docs/              # 可选：文档
```

## 安装方式

### 项目本地安装

将包目录复制到项目的 `packages/` 目录：

```text
my-project/
├── packages/
│   ├── my-custom-nodes/
│   │   └── manifest.json
│   └── my-theme/
│       └── manifest.json
├── flows/
├── session.json
└── kal.config.json
```

### 团队 Registry 安装

配置 `REGISTRY_URL` 环境变量后，可通过 Package Manager 从团队 registry 搜索和安装包。

## 安全注意事项

- 扩展运行在沙箱中，不能直接访问 Kernel 私有状态
- `process.exec` 和 `package.publish` 需要管理员审批
- 未签名的包会显示安全警告
- 崩溃超过阈值的扩展会被自动禁用
