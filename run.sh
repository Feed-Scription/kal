: "${OPENAI_API_KEY:?Please set OPENAI_API_KEY before running this script}"
: "${OPENAI_BASE_URL:=https://aiping.cn/api/v1}"

# 先 build
pnpm --filter @kal-ai/core build && pnpm --filter @kal-ai/engine build

# 启动engine
node apps/engine/dist/bin.js serve examples/dnd-adventure
# node apps/engine/dist/bin.js play examples/dnd-adventure
