# KAL Studio Flow Editor — UI/UX 深度评审

> 日期：2026-03-18
> 对标产品：Unreal Blueprints, ComfyUI, n8n, Blender Geometry Nodes, VS Code

---

## 一、画布交互模型（Canvas Interaction）

**问题：**
- 画布空间被严重挤压——左栏 ~200px + 右栏 ~300px + 底部面板 ~120px，画布实际可用面积不到 45%
- 缺少"专注模式"（Focus Mode）——没有一键隐藏所有面板的快捷方式
- 缺少 minimap

**建议：**
- 实现三面板独立 toggle（左/右/底），快捷键绑定（Cmd+B / Cmd+I / Cmd+J）
- 添加 Zen Mode：一键隐藏所有面板，只留画布 + 浮动工具栏
- 右下角添加 minimap
- 画布支持双指缩放 + 空格拖拽平移

---

## 二、面板信息架构（Panel Information Architecture）

### 左侧导航栏

**问题：**
- 18+ 个导航项全部平铺，无视觉权重区分
- 没有搜索/过滤功能
- 每个导航项都是等宽文字，没有图标辅助识别

**建议：**
- 改为 icon rail（~48px）+ 展开面板的两级结构
- 添加搜索框，支持模糊匹配
- 为每个扩展类型设计专属图标
- 分组标题用更强的视觉处理（加粗 + 分割线 + 可折叠）

### 右侧 Inspector 面板

**问题：**
- 同时展示 4 个区块，信息过载
- 没有上下文感知——无论选中什么节点，Inspector 显示内容都一样

**建议：**
- Inspector 改为上下文感知模式（未选中→Flow 信息，选中节点→节点属性，选中连线→连线信息）
- 4 个区块改为 tab 切换
- "状态检查器"移到底部面板

---

## 三、节点卡片设计（Node Card Design）

**问题：**
- 节点颜色区分不足，几乎都是同一种灰白色调
- 节点内容密度过高，违反渐进式披露原则
- 端口标签在当前缩放下不可读
- 节点缺少状态指示

**建议：**

### 颜色系统
```
LLM/AI 节点     → 蓝色系 (#3B82F6)
数据处理节点    → 绿色系 (#10B981)
输入/触发节点   → 紫色系 (#8B5CF6)
输出/终端节点   → 橙色系 (#F59E0B)
条件/路由节点   → 黄色系 (#EAB308)
工具/函数节点   → 青色系 (#06B6D4)
```

### 节点卡片结构
```
┌─────────────────────────────┐
│ 🔵 模版指令          ▾ ··· │  ← 彩色标题栏 + 折叠按钮 + 菜单
├─────────────────────────────┤
│ ● messages    outputs ●     │  ← 端口区（左入右出，彩色圆点）
├─────────────────────────────┤
│ "你是一个冒险游戏的..."     │  ← 内容预览（截断到 2-3 行）
│ [点击展开完整内容]          │
├─────────────────────────────┤
│ ✅ 已执行 · 1.2s · 350 tok │  ← 状态栏
└─────────────────────────────┘
```

### 连线着色
- `ChatMessage[]` → 蓝色线
- `string` → 绿色线
- `number` → 橙色线
- `boolean` → 红色线
- `any` → 灰色虚线

---

## 四、Tab 栏与工具栏

**问题：**
- 9 个 tab 接近溢出，没有溢出菜单
- 操作按钮和 Tab 混在一起，视觉权重相似
- 缺少面包屑导航

**建议：**
- 操作按钮移到独立工具栏区域，用 filled button 样式
- "运行"按钮用主题色高亮
- Tab 栏添加溢出菜单
- 添加 Command Palette（Cmd+K）

---

## 五、底部面板

**问题：**
- 默认展开，占用垂直空间
- 缺少多 tab 支持

**建议：**
- 默认收起，有诊断信息时用 badge 提示
- 添加多 tab：诊断 / 运行日志 / 数据预览 / 状态检查器
- 支持拖拽调整高度

---

## 六、微交互与可发现性

**缺失的交互：**
- 右键上下文菜单
- 拖拽连线时的智能建议
- 快捷键提示（tooltip）
- Undo/Redo 可见性
- 全局节点搜索

---

## 七、优先级排序

| 优先级 | 改进项 | 影响 | 难度 | 状态 |
|--------|--------|------|------|------|
| P0 | 面板 toggle（左/右/底可收起） | 极高 | 低 | ✅ 已完成 |
| P0 | 节点颜色编码系统 | 高 | 低 | ✅ 已完成 |
| P1 | Inspector 上下文感知 | 高 | 中 | ✅ 已完成 |
| P1 | 节点内容折叠/渐进式披露 | 高 | 中 | ✅ 已完成 |
| P1 | 右键上下文菜单 + 节点搜索 | 高 | 中 | ✅ 已完成 |
| P2 | 连线按数据类型着色 | 中 | 中 | ✅ 已完成 |
| P2 | Command Palette（Cmd+K） | 中 | 中 | ✅ 已有 |
| P2 | 底部面板重构（badge + 自动展开） | 中 | 低 | ✅ 已完成 |
| P3 | 左侧栏改为 icon rail | 中 | 高 | ✅ 已完成 |
| P3 | Minimap | 中 | 中 | ✅ 已有 |
| P3 | 拖拽连线智能建议 | 中 | 高 | ✅ 已完成 |

---

## 参考资料

- [n8n Node UI Design Guidelines](https://docs.n8n.io/integrations/creating-nodes/plan/node-ui-design/)
- [n8n Color-Coding System](https://n8n.io/workflows/9500-standardized-workflow-design-pattern-with-color-coding-system-for-teams/)
- [Sidebar UX: Resizing, Density & Secondary Panels](https://magazine.ediary.site/blog/sidebar-ux-resizing-density-and)
- [Sidebar UX Best Practices 2026](https://alfdesigngroup.com/post/improve-your-sidebar-design-for-web-apps)
- [VS Code UX Guidelines - Sidebars](https://code.visualstudio.com/api/ux-guidelines/sidebars)
- [Web App UI/UX Best Practices 2025](https://cygnis.co/blog/web-app-ui-ux-best-practices-2025/)
- [awesome-node-based-uis](https://github.com/xyflow/awesome-node-based-uis)
