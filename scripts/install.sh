#!/bin/bash

# KAL-AI 安装脚本

set -e

echo "🚀 开始安装 KAL-AI..."

# 检查 Node.js 版本
if ! command -v node &> /dev/null; then
    echo "❌ 错误: 未找到 Node.js，请先安装 Node.js >= 18"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ 错误: Node.js 版本过低 (当前: $(node -v))，需要 >= 18"
    exit 1
fi

# 检查 pnpm
if ! command -v pnpm &> /dev/null; then
    echo "📦 安装 pnpm..."
    npm install -g pnpm
fi

# 设置 pnpm 全局目录
echo "🔧 配置 pnpm..."
pnpm setup

# 安装依赖
echo "📥 安装项目依赖..."
pnpm install

# 构建项目
echo "🔨 构建项目..."
pnpm --filter @kal-ai/engine build

# 全局链接
echo "🔗 创建全局命令链接..."
cd apps/engine
pnpm link --global
cd ../..

echo "✅ 安装完成！"
echo ""
echo "现在你可以使用以下命令："
echo "  kal --help          # 查看帮助"
echo "  kal play <project>  # 运行游戏"
echo "  kal serve <project> # 启动服务"
echo ""
echo "⚠️  注意: 运行游戏前需要设置 OpenAI API 密钥:"
echo "  export OPENAI_API_KEY=your_api_key"
echo "  export OPENAI_BASE_URL=https://your-endpoint (可选)"