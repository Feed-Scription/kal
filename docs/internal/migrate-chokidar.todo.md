# Migrate Engine File Watching to Chokidar - TODO

## Phase 1: Dependencies & Types
- [x] Add `"chokidar": "^4.0.3"` to `apps/engine/package.json` dependencies
- [x] Add `'chokidar'` to external array in `apps/engine/tsup.config.ts`
- [x] Run `pnpm install --ignore-scripts`
- [x] Add `ExternalChangeEvent` discriminated union type to `apps/engine/src/types.ts`

## Phase 2: Runtime Core Rewrite
- [x] Update imports in `apps/engine/src/runtime.ts` (remove fs.watch, add chokidar)
- [x] Update class fields: change watcher type, remove debounceTimers, rename callback
- [x] Add `markSelfWrite()` call in `saveConfig()` before writeFile
- [x] Add `markSelfWrite()` call in `saveSession()` before writeFile
- [x] Add `markSelfWrite()` call in `deleteSession()` before unlink
- [x] Add `markSelfWrite()` call in `deleteFlow()` before unlink
- [x] Add `markSelfWrite()` call in `saveCustomNodeSource()` before writeFile
- [x] Implement `reloadSession()` private method (read, validate, update project.session)
- [x] Rewrite `startWatching()` with chokidar (directory paths + depth:0, route by path)
- [x] Rewrite `stopWatching()` to async (await watcher.close(), remove debounceTimers cleanup)

## Phase 3: Server Bridges
- [x] Update `apps/engine/src/server.ts` bridge: replace onExternalFlowChange with onExternalChange switch
- [x] Update `apps/engine/src/server.ts` close handler: add await to stopWatching()
- [x] Update `apps/engine/src/studio-server.ts` bridge: same onExternalChange switch
- [x] Update `apps/engine/src/studio-server.ts` close handler: add await to stopWatching()

## Phase 4: Studio Frontend
- [x] Add session external change handler in `apps/studio/src/store/studioStore.ts` (fetch session on resource.changed with sessionId)

## Phase 5: Verification
- [x] Build: `pnpm --filter @kal-ai/engine build` succeeds
- [x] Tests: `pnpm --filter @kal-ai/engine test` passes (74/75, 1 pre-existing LLM failure)
- [ ] Manual test: externally edit flow JSON → canvas reloads
- [ ] Manual test: externally edit kal_config.json → project reload notification
- [ ] Manual test: externally edit initial_state.json → project reload notification
- [ ] Manual test: externally edit session.json → session panel updates
- [ ] Manual test: edit flow in Studio → auto-save does NOT trigger reload loop

## Deviation from Plan
- `startWatching()` uses directory paths (`flow`, `node`) + `depth: 0` instead of glob patterns (`flow/*.json`, `node/*.ts`). Chokidar v4 on macOS with fsevents silently ignores globs — `getWatched()` returns `{}`. Extension filtering is done in the `handleChange` handler instead.
