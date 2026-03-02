# KAL Editor

纯前端可视化编辑器，使用 File System Access API 直接读写本地 KAL 项目文件。

## ✨ 特性

- 🎨 **可视化 Flow 编辑** - 15 个节点类型，拖拽式编辑
- 💾 **直接操作本地文件** - 使用 File System Access API
- 🔄 **自动保存** - 1秒防抖，智能保存
- 📦 **纯前端应用** - 无需后端服务器
- 🌐 **完全离线工作** - 无需网络连接

## 🌐 浏览器要求

- ✅ Chrome 86+ / Edge 86+ / Opera 72+
- ❌ Firefox / Safari（暂不支持 File System Access API）

## 🚀 快速开始

```bash
# 安装依赖
pnpm install

# 启动开发服务器
pnpm dev

# 访问 http://localhost:5173
```

## 📖 使用方法

1. 访问 http://localhost:5173
2. 点击"选择项目文件夹"
3. 选择 KAL 项目（如 `examples/simple-chat`）
4. 授予文件访问权限
5. 编辑 Flow / State / 配置，更改自动保存

## 🎯 功能

### Flow 编辑
- 15 个节点类型（信号、状态、LLM、转换）
- 拖拽节点、连线
- 右键菜单添加节点
- 自动保存（1秒防抖）
- 手动保存（Ctrl+S）
- 导出 JSON
- 控制面板、小地图

### State 管理
- 查看、编辑、添加、删除状态
- 支持 5 种数据类型（string/number/boolean/array/object）
- 重置状态功能

### 项目配置
- 编辑 kal_config.json
- LLM 配置（provider, model, apiKey）
- 引擎参数（logLevel, timeout）
- 重试策略

## 🛠️ 技术栈

- React 19 + TypeScript 5.9
- Vite 7
- ReactFlow 12（流程图编辑）
- Zustand 5（状态管理）
- Tailwind CSS 4（样式）
- File System Access API（文件操作）

## 📦 构建

```bash
# 构建生产版本
pnpm build

# 产物在 dist/ 目录（~588 KB）
```

## 📊 项目统计

- 代码行数: 3,752 行
- 源文件数: 43 个
- 节点类型: 15 个
- 构建大小: 588 KB

---

**Version**: 0.2.0 | **Status**: ✅ Ready for use
