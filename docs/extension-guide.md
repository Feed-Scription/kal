# KAL Studio 扩展开发指南

本指南通过三个示例，演示如何从零开发 KAL Studio 扩展。

## 快速开始

### 1. 创建包目录

在项目的 `packages/` 下创建目录并添加 `manifest.json`：

```bash
mkdir -p packages/my-extension
```

### 2. 编写 manifest.json

```json
{
  "id": "my-org.my-extension",
  "kind": "node-pack",
  "version": "0.1.0",
  "name": "My Extension"
}
```

### 3. 在 Studio 中刷新

打开 Package Manager 视图，点击"刷新"即可看到新包。

---

## 示例 1：Node Pack（自定义节点）

最常见的扩展类型。为 Flow Editor 添加自定义节点。

### 目录结构

```text
packages/battle-nodes/
├── manifest.json
├── runtime/
│   └── damage-calc.js    # 节点运行时逻辑
└── examples/
    └── battle-flow.json  # 使用示例
```

### manifest.json

```json
{
  "id": "my-org.battle-nodes",
  "kind": "node-pack",
  "version": "1.0.0",
  "name": "Battle System Nodes",
  "description": "回合制战斗系统节点：伤害计算、技能判定、状态效果",
  "author": "my-org",
  "capabilities": ["project.read"],
  "contributes": {
    "nodes": [
      {
        "type": "battle/damage-calc",
        "label": "伤害计算",
        "category": "Battle",
        "inputs": [
          { "name": "attacker_atk", "type": "number", "required": true },
          { "name": "defender_def", "type": "number", "required": true },
          { "name": "skill_multiplier", "type": "number", "defaultValue": 1.0 }
        ],
        "outputs": [
          { "name": "damage", "type": "number" },
          { "name": "is_critical", "type": "boolean" }
        ],
        "configSchema": {
          "criticalRate": { "type": "number", "default": 0.1 },
          "minDamage": { "type": "number", "default": 1 }
        }
      },
      {
        "type": "battle/status-effect",
        "label": "状态效果",
        "category": "Battle",
        "inputs": [
          { "name": "target", "type": "object", "required": true },
          { "name": "effect_type", "type": "string", "required": true }
        ],
        "outputs": [
          { "name": "modified_target", "type": "object" },
          { "name": "effect_applied", "type": "boolean" }
        ]
      }
    ]
  }
}
```

### 要点

- `type` 建议用 `namespace/name` 格式避免冲突
- `category` 决定节点在面板中的分组
- `configSchema` 为节点提供 Inspector 中的配置表单
- 只需 `project.read` 权限，安装时自动授权

---

## 示例 2：Template Pack（项目模板）

为 Template Browser 提供可复用的项目模板。

### 目录结构

```text
packages/rpg-templates/
├── manifest.json
├── templates/
│   ├── turn-based-battle/
│   │   ├── flows/
│   │   │   ├── battle-main.json
│   │   │   └── battle-skills.json
│   │   ├── session.json
│   │   └── initial_state.json
│   └── branching-narrative/
│       ├── flows/
│       │   ├── story-main.json
│       │   └── story-endings.json
│       └── session.json
└── docs/
    └── README.md
```

### manifest.json

```json
{
  "id": "my-org.rpg-templates",
  "kind": "template-pack",
  "version": "1.0.0",
  "name": "RPG Game Templates",
  "description": "RPG 游戏常用模板：回合制战斗、分支叙事",
  "author": "my-org",
  "contributes": {
    "templates": [
      {
        "id": "turn-based-battle",
        "name": "回合制战斗系统",
        "description": "完整的回合制战斗 flow，包含技能、物品、逃跑分支",
        "category": "Game",
        "tags": ["battle", "turn-based", "rpg"],
        "flows": ["battle-main", "battle-skills"],
        "sessionRef": "battle-session",
        "stateKeys": ["player_hp", "enemy_hp", "turn_count", "battle_log"]
      },
      {
        "id": "branching-narrative",
        "name": "分支叙事",
        "description": "选择驱动的故事模板，支持多结局",
        "category": "Game",
        "tags": ["narrative", "choice", "story"],
        "flows": ["story-main", "story-endings"],
        "stateKeys": ["chapter", "choices_made", "relationship"]
      }
    ]
  }
}
```

### 要点

- template-pack 不需要任何 capability，风险极低
- `tags` 用于 Template Browser 中的搜索和过滤
- `stateKeys` 帮助用户了解模板会引入哪些状态
- 模板文件放在 `templates/<template-id>/` 子目录下

---

## 示例 3：Theme Pack（主题包）

最简单的扩展类型，仅提供 CSS 变量覆盖。

### 目录结构

```text
packages/dark-ocean-theme/
├── manifest.json
└── studio/
    └── theme.css
```

### manifest.json

```json
{
  "id": "my-org.dark-ocean",
  "kind": "theme-pack",
  "version": "1.0.0",
  "name": "Dark Ocean Theme",
  "description": "深海暗色主题",
  "author": "my-org",
  "contributes": {
    "themes": [
      { "id": "dark-ocean", "name": "深海暗色" }
    ]
  }
}
```

### studio/theme.css

```css
[data-theme="dark-ocean"] {
  --background: 222 47% 8%;
  --foreground: 210 40% 92%;
  --card: 222 47% 11%;
  --primary: 199 89% 48%;
  --primary-foreground: 0 0% 100%;
  --muted: 217 33% 17%;
  --muted-foreground: 215 20% 55%;
  --border: 217 33% 17%;
  --accent: 199 89% 48%;
}
```

### 要点

- theme-pack 不需要任何 capability，零风险
- 仅通过 CSS 变量覆盖，不执行任何代码
- 是第三方扩展开放的第一优先级类型

---

## 开发流程

```text
1. 创建 packages/<name>/manifest.json
2. 在 Studio 的 Package Manager 中刷新
3. 确认包被正确识别
4. 根据 kind 添加对应内容（nodes/templates/themes）
5. 测试功能
6. 可选：添加签名和 provenance
```

## 调试技巧

- 在 Studio 的 Event Log 面板中查看扩展激活和错误事件
- 如果扩展被自动禁用（崩溃 3 次），在 Package Manager 中手动重新启用
- 使用 `kal lint` 验证 node-pack 中的节点定义是否正确

## 发布到团队 Registry

```bash
# 配置 registry
export REGISTRY_URL=https://registry.my-team.com
export REGISTRY_TOKEN=your-token

# 发布（未来支持）
# kal package publish packages/my-extension
```

## 参考

- [Extension API Reference](./extension-api.md) — 完整 API 规范
- [Studio Architecture](./internal/v5/studio.md) — Studio 总体设计
