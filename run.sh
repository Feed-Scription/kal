export OPENAI_API_KEY=QC-d50cbd80b836dcfb9fb700755a9e5fdc-6a1bb2558405e01b7f37e4d6ce1e50d4
export OPENAI_BASE_URL=https://aiping.cn/api/v1

# 先 build
pnpm --filter @kal-ai/core build && pnpm --filter @kal-ai/engine build

# 启动engine
# node apps/engine/dist/bin.js serve examples/dnd-adventure
node apps/engine/dist/bin.js play examples/dnd-adventure