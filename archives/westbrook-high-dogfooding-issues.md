# Westbrook High Dogfooding 测试问题清单

测试日期：2026-03-13
测试方法：使用 `kal debug` 命令实际运行游戏，对比设计文档检查一致性

## 已发现的问题

### 1. 配置系统问题 ✅ 已修复

**问题描述：**
- ConfigManager 只在 `process.cwd()` 查找 `.kal` 目录
- 在子目录（如 `examples/westbrook-high`）运行时无法加载根目录的配置
- 导致加密的 API key 无法被解密和使用

**影响：**
- 无法在项目子目录运行游戏
- 每个子目录需要单独配置 API key

**修复方案：**
- 修改 `ConfigManager.constructor()` 添加 `findConfigDir()` 方法
- 向上查找包含 `config.env` 的 `.kal` 目录
- 如果找不到，回退到当前目录

**文件：** `packages/core/src/config/ConfigManager.ts:55-88`

**状态：** ✅ 已修复并测试通过

---

### 2. 手机系统解锁时机错误 ❌ 未修复

**问题描述：**
- 设计文档 `rules.md:120` 规定：
  - Day 2 解锁社交媒体
  - Day 4 解锁私信
  - Day 7 解锁匿名论坛
- 实际实现：Day 1 晚上就可以浏览社交媒体

**影响：**
- 破坏游戏节奏设计
- 玩家过早获得信息，降低探索感
- 与设计文档的渐进式解锁机制不符

**定位：**
- `flow/night-action.json` 没有检查 `phoneUnlocked_social` 状态
- `flow/day-end.json` 应该在特定天数解锁手机功能，但可能未正确实现

**修复方案：**
- 在 `night-action.json` 中添加手机功能解锁检查
- 在 `day-end.json` 中根据天数自动解锁功能
- 当玩家选择未解锁的功能时，显示提示信息

---

### 3. ApplyState 类型不匹配错误 ❌ 未修复

**问题描述：**
从日志中看到多个类型错误：
```
[apply-state] ApplyState: changes input is not an object undefined
[apply-state] ApplyState: failed to set key {
  key: 'todayWorldEvents',
  error: 'Value type mismatch: expected array, got string'
}
```

**影响：**
- 状态更新失败，导致游戏状态不一致
- `todayWorldEvents` 应该是 array 类型，但 LLM 生成的是 string

**定位：**
- `flow/world-tick.json:294` 的 `allowedKeys` 包含 `todayWorldEvents`
- `initial_state.json:78` 定义 `todayWorldEvents` 为 `array` 类型
- LLM prompt 可能没有明确要求输出 array 格式

**修复方案：**
1. 检查 `initial_state.json` 中 `todayWorldEvents` 的类型定义
2. 修改 `world-tick.json` 的 prompt，明确要求输出 array
3. 或者修改状态定义，将 `todayWorldEvents` 改为 string 类型

---

### 4. 状态查询返回 null 值 ❌ 未修复

**问题描述：**
使用 `kal debug --state` 查询状态时，所有字段都返回 `null`：
```json
{
  "day": null,
  "phase": null,
  "ap": 3,
  "phoneUnlocked_social": null,
  ...
}
```

**影响：**
- 无法通过 debug 命令查看当前游戏状态
- 难以调试和验证状态变化

**定位：**
- 可能是 `--state` 命令的实现问题
- 或者是状态序列化/反序列化的问题

**修复方案：**
- 检查 `apps/engine/src/commands/debug.ts` 中的状态查询逻辑
- 确认状态是否正确保存到 session 文件

---

### 5. 设计文档一致性问题（待验证）

以下问题需要继续测试验证：

#### 5.1 NPC 初始状态
- **设计文档：** `content.md:19-24` 定义了 Lily 的初始信任值应该是 10
- **实际状态：** 需要验证 `initial_state.json` 是否匹配

#### 5.2 行动点消耗
- **设计文档：** `rules.md:15-22` 定义了各种行动的 AP 消耗
- **实际实现：** 需要测试各种行动是否正确扣除 AP

#### 5.3 对质系统
- **设计文档：** `rules.md:66-84` 定义了对质系统的说服力计算公式
- **实际实现：** 需要触发对质场景测试

#### 5.4 派系系统
- **设计文档：** `rules.md:87-100` 定义了 4 个派系和信任度机制
- **实际实现：** 需要测试参加社团活动是否正确更新派系信任

#### 5.5 关键日事件
- **设计文档：** `content.md:149-164` 定义了关键日事件列表
- **实际实现：** 需要测试 Day 5, Day 8, Day 12 等关键日是否触发正确事件

---

## 测试进度

- [x] Day 1 intro 场景
- [x] Day 1 夜间社交媒体（发现解锁时机问题）
- [x] Day 1 -> Day 2 转换
- [ ] Day 2 日间探索
- [ ] Day 2 NPC 对话
- [ ] 地点探索系统
- [ ] 手机系统（私信、匿名论坛）
- [ ] 潜入系统
- [ ] 窃听系统
- [ ] 派系活动
- [ ] 对质系统
- [ ] 证据收集
- [ ] NPC 弧线推进
- [ ] 关键日事件
- [ ] 结局系统

---

## 下一步行动

1. **修复手机解锁时机问题**（优先级：高）
   - 修改 `flow/day-end.json` 添加手机功能解锁逻辑
   - 修改 `flow/night-action.json` 添加功能检查

2. **修复 ApplyState 类型错误**（优先级：高）
   - 检查 `todayWorldEvents` 的类型定义
   - 修改相关 prompt 确保输出正确类型

3. **修复状态查询问题**（优先级：中）
   - 调试 `--state` 命令实现

4. **继续 dogfooding 测试**（优先级：中）
   - 测试 Day 2 的各种行动
   - 验证 NPC 互动和状态变化
   - 测试地点探索和证据收集

5. **创建自动化测试**（优先级：低）
   - 编写测试脚本验证核心机制
   - 确保后续修改不破坏已有功能
