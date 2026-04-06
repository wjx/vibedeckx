# esbuild Single-Bundle Migration

**Date:** 2026-04-06
**Status:** Approved

## Problem

Platform packages (`@vibedeckx/linux-x64`, etc.) have 30MB+ unpacked size. After CI trimming, `node_modules` alone is ~19MB of pure-JS dependencies (fastify, zod, ai SDK, clerk, undici, etc.) that could be bundled. The native modules `node-pty` and `better-sqlite3` account for only ~1-2MB after trimming but require the full `node_modules` shipping approach.

## Solution

Replace `tsc` build output with esbuild single-file bundle. All pure-JS dependencies are inlined at build time. Only native modules (`node-pty`, `better-sqlite3`) remain as external dependencies shipped in platform packages.

## Build Pipeline

### Current

```
tsc → many .js files in dist/ → ship dist/ + full node_modules in platform package
```

### New

```
esbuild → single dist/bin.js → ship dist/ in main package, only native node_modules in platform package
```

`tsc --noEmit` remains for type-checking in development and CI.

## esbuild Configuration

```
entryPoints: src/bin.ts
bundle: true
platform: node
format: esm
target: es2022
outfile: dist/bin.js
sourcemap: true
external: [node-pty, better-sqlite3, playwright-core]
banner: { js: "#!/usr/bin/env node" }
```

### Externals rationale

- **node-pty**: Native module with precompiled `.node` binaries. Also uses `createRequire(import.meta.url)` in `process-manager.ts` to resolve prebuilds/spawn-helper paths — must remain in `node_modules` for resolution to work.
- **better-sqlite3**: Native module with precompiled `.node` binary.
- **playwright-core**: Optional dependency, dynamically imported with try-catch in `browser-manager.ts`. Removed during CI trim step. Marking external prevents esbuild from failing if it's not installed.

### import.meta.url

`server.ts` uses `import.meta.url` to resolve `UI_ROOT`:

```typescript
const UI_ROOT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "./ui"
);
```

esbuild preserves `import.meta.url` in ESM output. Since the bundle outputs to `dist/bin.js` and UI files are at `dist/ui/`, the relative path `./ui` resolves correctly. No changes needed.

## Package Changes

### packages/vibedeckx/package.json

Build script changes:

```json
{
  "scripts": {
    "build": "esbuild src/bin.ts --bundle --platform=node --format=esm --target=es2022 --outfile=dist/bin.js --sourcemap --external:node-pty --external:better-sqlite3 --external:playwright-core --banner:js='#!/usr/bin/env node' && chmod +x dist/bin.js",
    "dev": "tsc -w"
  }
}
```

New devDependency: `esbuild`.

`dev` script unchanged — `tsc -w` provides type error feedback during development. esbuild is production-build only.

### Platform packages (@vibedeckx/linux-x64, etc.)

Slimmed to carry only native modules:

```json
{
  "name": "@vibedeckx/linux-x64",
  "version": "0.1.0",
  "os": ["linux"],
  "cpu": ["x64"],
  "bundleDependencies": true,
  "dependencies": {
    "node-pty": "^1.2.0-beta.12",
    "better-sqlite3": "^11.6.0"
  }
}
```

Contents after build:
- `node_modules/node-pty/` — platform-specific prebuild + JS wrappers (trimmed)
- `node_modules/better-sqlite3/` — compiled `.node` binary + `lib/` JS (trimmed)

### Main package (vibedeckx) — npm publish

The thin wrapper published to npm gains `dist/` (the bundle + UI static export). The `optionalDependencies` still point to platform packages for native modules.

## CI Workflow Changes (release.yml)

### Build step

Replace `tsc` with esbuild in the build command (handled by `pnpm build` which calls the updated script).

### Package archive (Unix/Windows)

Simplified:
1. Copy `dist/` from the built backend (now contains `bin.js` + `bin.js.map` + `ui/`)
2. Install only `node-pty` and `better-sqlite3` into `node_modules/`
3. Rebuild native modules for target platform
4. Trim native module source/deps (same as current)
5. No longer need to strip test/docs/d.ts/etc. from 100+ packages — only 2 packages to trim

### Platform npm package preparation

Same simplification — platform packages only contain the two native module directories.

### Main package npm publish

The main package now ships `dist/` containing the bundle. The rewrite step that creates a thin wrapper still works — it just needs to include `dist/` in the `files` array.

## Size Impact Estimate

| Component | Current | After esbuild |
|-----------|---------|---------------|
| Pure-JS node_modules (trimmed) | ~17MB | 0 (bundled) |
| Bundle (dist/bin.js) | N/A | ~1-3MB |
| Native modules (trimmed) | ~1-2MB | ~1-2MB |
| Static UI (dist/ui/) | ~10-15MB | ~10-15MB (unchanged) |
| **Total platform package** | **~30MB** | **~13-20MB** |

The pure-JS savings are ~14-16MB. The bundle replaces ~17MB of node_modules with ~1-3MB of tree-shaken, inlined code.

## Dev Workflow

No changes to the development experience:
- `pnpm dev:server` still runs `tsc -w` for type-checked watch mode
- `pnpm dev:all` still runs frontend + backend dev servers concurrently
- `pnpm build` switches from `tsc` to `esbuild` for production output
- Type-checking: `npx tsc --noEmit -p packages/vibedeckx/tsconfig.json` (unchanged)
