# Migrate Engine File Watching to Chokidar - Checklist

## Pre-implementation Checks
- [x] Understand current fs.watch implementation in runtime.ts
- [x] Identify all file write methods that need markSelfWrite protection
- [x] Map file types to reload strategies (incremental vs full)
- [x] Verify chokidar is available in lockfile (transitive dep of tsup)
- [x] Confirm Studio event handling for resource.changed and project.reloaded

## Implementation Checklist

### Dependencies
- [x] `apps/engine/package.json` — chokidar added to dependencies
- [x] `apps/engine/tsup.config.ts` — chokidar added to external array
- [x] `pnpm install --ignore-scripts` completed successfully

### Type Definitions
- [x] `apps/engine/src/types.ts` — ExternalChangeEvent type added with 5 variants (flow, config, initialState, session, customNode)

### Runtime Core (`apps/engine/src/runtime.ts`)
- [x] Imports updated (chokidar imported, fs.watch removed)
- [x] Class fields updated (ChokidarWatcher type, debounceTimers removed, onExternalChange callback)
- [x] `markSelfWrite()` added to `saveConfig()`
- [x] `markSelfWrite()` added to `saveSession()`
- [x] `markSelfWrite()` added to `deleteSession()`
- [x] `markSelfWrite()` added to `deleteFlow()`
- [x] `markSelfWrite()` added to `saveCustomNodeSource()`
- [x] `reloadSession()` method implemented (handles ENOENT, validates, updates project.session)
- [x] `startWatching()` rewritten with chokidar (directory paths + depth:0, awaitWriteFinish, path routing)
- [x] `stopWatching()` changed to async (await close(), debounceTimers cleanup removed)

### Server Bridges
- [x] `apps/engine/src/server.ts` — onExternalChange switch dispatch implemented
- [x] `apps/engine/src/server.ts` — await added to stopWatching()
- [x] `apps/engine/src/studio-server.ts` — onExternalChange switch dispatch implemented
- [x] `apps/engine/src/studio-server.ts` — await added to stopWatching()

### Studio Frontend
- [x] `apps/studio/src/store/studioStore.ts` — session external change handler added (event.sessionId branch)

## Verification Checklist

### Build & Type Safety
- [x] `pnpm --filter @kal-ai/engine build` succeeds without errors
- [x] No TypeScript errors in engine or studio
- [x] chokidar properly externalized (not bundled in dist/)

### Manual Testing
- [ ] Start Studio: `kal studio` launches successfully
- [ ] Flow external edit: edit flow/*.json in VS Code → canvas reloads
- [ ] Config external edit: edit kal_config.json → Studio shows "Project reloaded" notification
- [ ] State external edit: edit initial_state.json → Studio shows "Project reloaded" notification
- [ ] Session external edit: edit session.json → session panel updates
- [ ] Self-write protection: edit flow in Studio canvas → auto-save does NOT trigger reload loop
- [ ] File deletion: delete flow/*.json externally → Studio handles gracefully
- [ ] File creation: create new flow/*.json externally → Studio detects and loads it

### Automated Tests
- [x] `pnpm --filter @kal-ai/engine test` passes all existing tests (74/75, 1 pre-existing LLM failure)
- [x] No new test failures introduced

## Post-implementation
- [ ] Commit changes with descriptive message
- [x] Update this checklist with any discovered edge cases
- [x] Document any platform-specific behavior observed (macOS vs Linux)

## Platform Notes

**macOS (fsevents):** Chokidar v4 silently ignores glob patterns (`flow/*.json`) — `getWatched()` returns `{}`. Must use directory paths with `depth: 0` and filter by extension in the handler. This is a breaking change from chokidar v3 which had built-in glob expansion via `glob-parent` + `picomatch`.
