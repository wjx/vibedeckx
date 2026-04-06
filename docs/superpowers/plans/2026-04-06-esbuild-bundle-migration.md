# esbuild Single-Bundle Migration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `tsc` build output with esbuild single-file bundle to reduce platform package size from ~30MB to ~13-20MB by eliminating ~17MB of pure-JS node_modules.

**Architecture:** esbuild bundles all pure-JS dependencies into a single `dist/bin.js` file, with `node-pty`, `better-sqlite3`, and `playwright-core` marked as external. Platform packages keep `dist/` alongside native `node_modules/` so ESM module resolution works naturally. `tsc --noEmit` remains for type-checking.

**Tech Stack:** esbuild, Node.js ESM, pnpm workspaces

**Design refinement:** `dist/` stays in platform packages (not the main package) to avoid ESM module resolution issues with external native modules. The size savings are identical — `node_modules/` shrinks from ~19MB to ~1-2MB.

---

### Task 1: Add esbuild and update backend build script

**Files:**
- Modify: `packages/vibedeckx/package.json`

- [ ] **Step 1: Install esbuild as devDependency**

Run:
```bash
cd packages/vibedeckx && pnpm add -D esbuild
```

- [ ] **Step 2: Update build script in package.json**

In `packages/vibedeckx/package.json`, replace the `scripts` section:

```json
"scripts": {
  "build": "node esbuild.config.mjs && chmod +x ./dist/bin.js",
  "dev": "tsc -w",
  "prepublishOnly": "npm run build",
  "postinstall": "npm rebuild node-pty || echo 'node-pty rebuild failed, PTY features may not work'"
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/vibedeckx/package.json pnpm-lock.yaml
git commit -m "chore: add esbuild devDependency and update build script"
```

---

### Task 2: Create esbuild config

**Files:**
- Create: `packages/vibedeckx/esbuild.config.mjs`

- [ ] **Step 1: Create the esbuild configuration file**

Create `packages/vibedeckx/esbuild.config.mjs`:

```js
import { build } from "esbuild";

await build({
  entryPoints: ["src/bin.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "es2022",
  outfile: "dist/bin.js",
  sourcemap: true,
  external: ["node-pty", "better-sqlite3", "playwright-core"],
  banner: {
    js: "#!/usr/bin/env node",
  },
});
```

- [ ] **Step 2: Build and verify output**

Run:
```bash
cd packages/vibedeckx && pnpm build
```

Expected: `dist/bin.js` is created as a single bundled file with shebang. Verify:
```bash
head -1 dist/bin.js          # Should show: #!/usr/bin/env node
ls -lh dist/bin.js            # Should be ~1-3MB
grep -c 'from "fastify"' dist/bin.js  # Should be 0 (fastify is inlined)
grep -c 'from "node-pty"' dist/bin.js # Should be >= 1 (external)
grep -c 'from "better-sqlite3"' dist/bin.js # Should be >= 1 (external)
```

- [ ] **Step 3: Verify the full production build works**

Run from monorepo root:
```bash
pnpm build
```

This runs `build:main` (esbuild) + `build:ui` (next build) + `copy:ui` (copies UI to dist/ui/).

Verify:
```bash
ls packages/vibedeckx/dist/ui/index.html  # UI files copied
```

- [ ] **Step 4: Run the production server to smoke test**

Run:
```bash
pnpm start
```

Expected: Server starts on port 3000 without errors. Hit Ctrl+C to stop.

- [ ] **Step 5: Commit**

```bash
git add packages/vibedeckx/esbuild.config.mjs
git commit -m "feat: add esbuild config for single-file bundling"
```

---

### Task 3: Update platform package.json files

**Files:**
- Modify: `packages/vibedeckx-linux-x64/package.json`
- Modify: `packages/vibedeckx-darwin-arm64/package.json`
- Modify: `packages/vibedeckx-win32-x64/package.json`

Platform packages need `dependencies` for the native modules so that `npm install` + `npm rebuild` in CI installs only these two packages (not all deps from the main package.json).

- [ ] **Step 1: Update linux-x64 package.json**

Replace `packages/vibedeckx-linux-x64/package.json` with:

```json
{
  "name": "@vibedeckx/linux-x64",
  "version": "0.1.0",
  "description": "Vibedeckx platform binaries for Linux x64",
  "os": ["linux"],
  "cpu": ["x64"],
  "type": "module",
  "bundleDependencies": true,
  "dependencies": {
    "node-pty": "^1.2.0-beta.12",
    "better-sqlite3": "^11.6.0"
  }
}
```

- [ ] **Step 2: Update darwin-arm64 package.json**

Replace `packages/vibedeckx-darwin-arm64/package.json` with:

```json
{
  "name": "@vibedeckx/darwin-arm64",
  "version": "0.1.0",
  "description": "Vibedeckx platform binaries for macOS ARM64",
  "os": ["darwin"],
  "cpu": ["arm64"],
  "type": "module",
  "bundleDependencies": true,
  "dependencies": {
    "node-pty": "^1.2.0-beta.12",
    "better-sqlite3": "^11.6.0"
  }
}
```

- [ ] **Step 3: Update win32-x64 package.json**

Replace `packages/vibedeckx-win32-x64/package.json` with:

```json
{
  "name": "@vibedeckx/win32-x64",
  "version": "0.1.0",
  "description": "Vibedeckx platform binaries for Windows x64",
  "os": ["win32"],
  "cpu": ["x64"],
  "type": "module",
  "bundleDependencies": true,
  "dependencies": {
    "node-pty": "^1.2.0-beta.12",
    "better-sqlite3": "^11.6.0"
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add packages/vibedeckx-linux-x64/package.json packages/vibedeckx-darwin-arm64/package.json packages/vibedeckx-win32-x64/package.json
git commit -m "chore: add native module dependencies to platform packages"
```

---

### Task 4: Update CI workflow — Unix archive packaging

**Files:**
- Modify: `.github/workflows/release.yml` (lines 43-138, the "Package archive (Unix)" step)

The archive packaging step simplifies: instead of `npm install --omit=dev` (all deps) + extensive trimming of 100+ packages, it installs only native modules and trims just those two.

- [ ] **Step 1: Replace the "Package archive (Unix)" step**

Replace the entire "Package archive (Unix)" step (lines 43-138) with:

```yaml
      - name: Package archive (Unix)
        if: runner.os != 'Windows'
        run: |
          VERSION="${GITHUB_REF_NAME#v}"
          ARCHIVE_NAME="vibedeckx-${VERSION}-${{ matrix.platform }}"
          mkdir -p "staging/${ARCHIVE_NAME}"

          # Copy dist (esbuild bundle + bundled UI)
          cp -r packages/vibedeckx/dist "staging/${ARCHIVE_NAME}/"

          # Copy platform package.json (has native module dependencies)
          cp "packages/vibedeckx-${{ matrix.platform }}/package.json" "staging/${ARCHIVE_NAME}/"

          # Install only native module dependencies and rebuild for target platform
          cd "staging/${ARCHIVE_NAME}"
          npm install --ignore-scripts --legacy-peer-deps
          npm rebuild better-sqlite3 node-pty

          # Patch native module package.json files:
          # 1. Remove install scripts (already compiled, source files will be stripped)
          # 2. Remove gypfile flag and binding.gyp (prevents npm from auto-running node-gyp)
          # 3. Add build/ to files whitelist (npm publish respects each bundled package's files filter)
          node -e "
            const fs = require('fs');
            for (const pkg of ['node-pty', 'better-sqlite3']) {
              const p = 'node_modules/' + pkg + '/package.json';
              if (fs.existsSync(p)) {
                const j = JSON.parse(fs.readFileSync(p, 'utf8'));
                delete j.scripts;
                delete j.gypfile;
                if (Array.isArray(j.files)) {
                  j.files = j.files.filter(f => f !== 'binding.gyp');
                  if (!j.files.includes('build/')) j.files.push('build/');
                }
                fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n');
              }
              const gyp = 'node_modules/' + pkg + '/binding.gyp';
              if (fs.existsSync(gyp)) fs.unlinkSync(gyp);
            }
          "

          # Trim native modules
          CURRENT_PLATFORM="${{ matrix.platform }}"

          # Remove other-platform prebuilds from node-pty
          if [ -d node_modules/node-pty/prebuilds ]; then
            for dir in node_modules/node-pty/prebuilds/*/; do
              platform_dir=$(basename "$dir")
              if [ "$platform_dir" != "${CURRENT_PLATFORM%-*}-${CURRENT_PLATFORM#*-}" ]; then
                rm -rf "$dir"
              fi
            done
          fi

          # Ensure node-pty spawn-helper is executable
          find node_modules/node-pty -name "spawn-helper" -exec chmod +x {} \; 2>/dev/null || true

          # Remove node-pty build artifacts not needed at runtime
          rm -rf node_modules/node-pty/src node_modules/node-pty/deps \
                 node_modules/node-pty/third_party node_modules/node-pty/scripts \
                 node_modules/node-pty/node-addon-api

          # Remove better-sqlite3 source/deps (keep lib/ + build/Release/*.node)
          rm -rf node_modules/better-sqlite3/src node_modules/better-sqlite3/deps \
                 node_modules/better-sqlite3/build/Release/.deps \
                 node_modules/better-sqlite3/build/Release/obj.target \
                 node_modules/better-sqlite3/build/Release/obj \
                 node_modules/better-sqlite3/build/*.mk \
                 node_modules/better-sqlite3/build/*.Makefile \
                 node_modules/better-sqlite3/build/gyp-* \
                 node_modules/better-sqlite3/build/config.gypi

          # Remove unnecessary files from native modules
          find node_modules -type f \( -name "*.d.ts" -o -name "*.d.mts" -o -name "*.d.cts" \
               -o -name "*.map" -o -name "*.md" -o -name "*.flow" -o -name "*.ts" -o -name "*.mts" \
               -o -name "CHANGELOG*" -o -name "HISTORY*" -o -name "LICENSE*" \
               -o -name "Makefile" -o -name "*.gyp" \
               -o -name "*.gypi" -o -name "binding.cc" -o -name "*.c" -o -name "*.h" \) \
               -delete 2>/dev/null || true

          cd ../..

          # Create tarball
          tar -czf "${ARCHIVE_NAME}.tar.gz" -C staging "${ARCHIVE_NAME}"
```

Key changes:
- Uses platform `package.json` (with only native deps) instead of main `package.json` (all deps)
- `npm install` no longer needs `--omit=dev` since the platform package.json only has the two native deps
- Removed: playwright-core removal (not installed), test/docs directory removal (not present), bulk find/delete of node_modules junk (only 2 packages to clean)

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: simplify Unix archive packaging for esbuild bundle"
```

---

### Task 5: Update CI workflow — Windows archive packaging

**Files:**
- Modify: `.github/workflows/release.yml` (lines 140-221, the "Package archive (Windows)" step)

Same changes as Task 4, but in PowerShell syntax.

- [ ] **Step 1: Replace the "Package archive (Windows)" step**

Replace the entire "Package archive (Windows)" step (lines 140-221) with:

```yaml
      - name: Package archive (Windows)
        if: runner.os == 'Windows'
        shell: pwsh
        run: |
          $version = $env:GITHUB_REF_NAME -replace '^v',''
          $archiveName = "vibedeckx-${version}-${{ matrix.platform }}"
          New-Item -ItemType Directory -Force -Path "staging/${archiveName}"

          # Copy dist (esbuild bundle + bundled UI)
          Copy-Item -Recurse packages/vibedeckx/dist "staging/${archiveName}/"

          # Copy platform package.json (has native module dependencies)
          Copy-Item "packages/vibedeckx-${{ matrix.platform }}/package.json" "staging/${archiveName}/"

          # Install only native module dependencies and rebuild for target platform
          Set-Location "staging/${archiveName}"
          npm install --ignore-scripts --legacy-peer-deps
          npm rebuild better-sqlite3 node-pty

          # Patch native module package.json files
          node -e "
            const fs = require('fs');
            for (const pkg of ['node-pty', 'better-sqlite3']) {
              const p = 'node_modules/' + pkg + '/package.json';
              if (fs.existsSync(p)) {
                const j = JSON.parse(fs.readFileSync(p, 'utf8'));
                delete j.scripts;
                delete j.gypfile;
                if (Array.isArray(j.files)) {
                  j.files = j.files.filter(f => f !== 'binding.gyp');
                  if (!j.files.includes('build/')) j.files.push('build/');
                }
                fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n');
              }
              const gyp = 'node_modules/' + pkg + '/binding.gyp';
              if (fs.existsSync(gyp)) fs.unlinkSync(gyp);
            }
          "

          # Trim native modules
          $currentPlatform = "${{ matrix.platform }}" -split "-"
          $keepOs = $currentPlatform[0]
          $keepArch = $currentPlatform[1]
          $keepDir = "${keepOs}-${keepArch}"

          # Remove other-platform prebuilds from node-pty
          if (Test-Path "node_modules/node-pty/prebuilds") {
            Get-ChildItem "node_modules/node-pty/prebuilds" -Directory | Where-Object { $_.Name -ne $keepDir } | Remove-Item -Recurse -Force
          }

          # Remove node-pty build artifacts not needed at runtime
          foreach ($dir in @("src", "deps", "third_party", "scripts", "node-addon-api")) {
            if (Test-Path "node_modules/node-pty/$dir") { Remove-Item -Recurse -Force "node_modules/node-pty/$dir" }
          }

          # Remove better-sqlite3 source/deps
          foreach ($dir in @("src", "deps")) {
            if (Test-Path "node_modules/better-sqlite3/$dir") { Remove-Item -Recurse -Force "node_modules/better-sqlite3/$dir" }
          }

          # Remove unnecessary files from native modules
          Get-ChildItem "node_modules" -Recurse -File -Include @("*.d.ts", "*.d.mts", "*.d.cts", "*.map", "*.md", "*.flow", "*.ts", "*.mts", "LICENSE*", "Makefile", "*.gyp", "*.gypi", "binding.cc", "*.c", "*.h") -ErrorAction SilentlyContinue |
            Remove-Item -Force -ErrorAction SilentlyContinue

          Set-Location ../..

          # Create zip
          Compress-Archive -Path "staging/${archiveName}" -DestinationPath "${archiveName}.zip"
```

Key changes mirror Task 4: uses platform package.json, installs only native deps, simplified trim.

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: simplify Windows archive packaging for esbuild bundle"
```

---

### Task 6: Update CI workflow — platform npm package preparation

**Files:**
- Modify: `.github/workflows/release.yml` (lines 223-275, both "Prepare platform npm package" steps)

The platform npm packages no longer need `dist/` copied from the main build or the dependency merging from main package.json. They use the staging directory directly (which already has dist + trimmed native node_modules).

- [ ] **Step 1: Replace the "Prepare platform npm package (Unix)" step**

Replace lines 223-248 with:

```yaml
      # Prepare platform npm package from the staged build
      - name: Prepare platform npm package (Unix)
        if: runner.os != 'Windows'
        run: |
          VERSION="${GITHUB_REF_NAME#v}"
          ARCHIVE_NAME="vibedeckx-${VERSION}-${{ matrix.platform }}"
          mkdir -p npm-package

          # Copy dist (esbuild bundle + UI) and trimmed native node_modules from staging
          cp -r "staging/${ARCHIVE_NAME}/dist" npm-package/
          cp -r "staging/${ARCHIVE_NAME}/node_modules" npm-package/

          # Use platform template package.json and set version
          cp "packages/vibedeckx-${{ matrix.platform }}/package.json" npm-package/
          node -e "
            const fs = require('fs');
            const pkg = JSON.parse(fs.readFileSync('npm-package/package.json', 'utf8'));
            pkg.version = '${VERSION}';
            fs.writeFileSync('npm-package/package.json', JSON.stringify(pkg, null, 2) + '\n');
          "
```

- [ ] **Step 2: Replace the "Prepare platform npm package (Windows)" step**

Replace lines 250-275 with:

```yaml
      - name: Prepare platform npm package (Windows)
        if: runner.os == 'Windows'
        shell: pwsh
        run: |
          $version = $env:GITHUB_REF_NAME -replace '^v',''
          $archiveName = "vibedeckx-${version}-${{ matrix.platform }}"
          New-Item -ItemType Directory -Force -Path npm-package

          # Copy dist (esbuild bundle + UI) and trimmed native node_modules from staging
          Copy-Item -Recurse "staging/${archiveName}/dist" npm-package/
          Copy-Item -Recurse "staging/${archiveName}/node_modules" npm-package/

          # Use platform template package.json and set version
          Copy-Item "packages/vibedeckx-${{ matrix.platform }}/package.json" npm-package/
          node -e "
            const fs = require('fs');
            const pkg = JSON.parse(fs.readFileSync('npm-package/package.json', 'utf8'));
            pkg.version = '$version';
            fs.writeFileSync('npm-package/package.json', JSON.stringify(pkg, null, 2) + '\n');
          "
```

Key changes: No longer merges dependencies from main package.json. The platform package.json already declares its own dependencies (node-pty and better-sqlite3 from Task 3). Just sets the version.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: simplify platform npm package preparation for esbuild bundle"
```

---

### Task 7: Update CI workflow — main package publish

**Files:**
- Modify: `.github/workflows/release.yml` (lines 407-431, the "Prepare main package for npm" step)

The main package is still a thin launcher. No changes needed to what it ships — `bin/vibedeckx.mjs` resolves the platform package and spawns its `dist/bin.js`. The existing step already rewrites package.json to a wrapper with `files: ['bin']` and `optionalDependencies` pointing to platform packages.

- [ ] **Step 1: Verify no changes needed**

Read the "Prepare main package for npm" step (lines 407-431). The wrapper rewrite:
- Sets `bin: { vibedeckx: './bin/vibedeckx.mjs' }` — correct, launcher unchanged
- Sets `files: ['bin']` — correct, main package only ships the launcher
- Sets `optionalDependencies` to platform packages — correct, platform packages now carry the bundle + native deps

No changes needed to this step.

---

### Task 8: Update scripts/pack.sh

**Files:**
- Modify: `scripts/pack.sh`

The local pack script needs the same changes as the CI workflow: use platform package.json and install only native deps.

- [ ] **Step 1: Replace the platform archive section of pack.sh**

Replace lines 72-101 (the platform archive section, from `if [ "$MODE" = "all" ] || [ "$MODE" = "platform" ]; then` to the closing `fi`) with:

```bash
# ─── Platform archive ───────────────────────────────────────────────
if [ "$MODE" = "all" ] || [ "$MODE" = "platform" ]; then
  echo ""
  echo "==> Creating platform archive ($PLATFORM)..."

  ARCHIVE_NAME="vibedeckx-${VERSION}-${PLATFORM}"
  STAGING="$OUT_DIR/staging/${ARCHIVE_NAME}"

  # Clean previous staging
  rm -rf "$OUT_DIR/staging"
  mkdir -p "$STAGING"

  # Copy dist (esbuild bundle + UI)
  cp -r "$PKG_DIR/dist" "$STAGING/"

  # Copy platform package.json (has native module dependencies)
  cp "$ROOT_DIR/packages/vibedeckx-${PLATFORM}/package.json" "$STAGING/"

  # Install only native module dependencies and rebuild
  echo "    Installing native module dependencies..."
  cd "$STAGING"
  npm install --ignore-scripts --legacy-peer-deps 2>&1 | tail -3
  echo "    Rebuilding native modules (better-sqlite3, node-pty)..."
  npm rebuild better-sqlite3 node-pty 2>&1 | tail -5

  # Create tarball
  cd "$OUT_DIR/staging"
  tar -czf "$OUT_DIR/${ARCHIVE_NAME}.tar.gz" "${ARCHIVE_NAME}"

  # Cleanup staging
  rm -rf "$OUT_DIR/staging"

  echo "    Output: $OUT_DIR/${ARCHIVE_NAME}.tar.gz"
fi
```

- [ ] **Step 2: Commit**

```bash
git add scripts/pack.sh
git commit -m "chore: update pack.sh for esbuild bundle"
```

---

### Task 9: Type-check verification

**Files:** None (verification only)

- [ ] **Step 1: Run backend type-check**

```bash
npx tsc --noEmit -p packages/vibedeckx/tsconfig.json
```

Expected: No errors. tsc is now only used for type-checking, not build output.

- [ ] **Step 2: Run frontend type-check**

```bash
cd apps/vibedeckx-ui && npx tsc --noEmit
```

Expected: No errors. Frontend is unaffected by this change.

---

### Task 10: Final build + smoke test

**Files:** None (verification only)

- [ ] **Step 1: Clean dist and rebuild everything**

```bash
rm -rf packages/vibedeckx/dist
pnpm build
```

Expected: Build succeeds. `packages/vibedeckx/dist/bin.js` exists as a single bundled file.

- [ ] **Step 2: Verify bundle contents**

```bash
ls -lh packages/vibedeckx/dist/bin.js
head -1 packages/vibedeckx/dist/bin.js
ls packages/vibedeckx/dist/ui/index.html
```

Expected:
- `bin.js` is ~1-3MB
- First line is `#!/usr/bin/env node`
- `ui/index.html` exists

- [ ] **Step 3: Start the server**

```bash
pnpm start
```

Expected: Server starts without errors. Ctrl+C to stop.

- [ ] **Step 4: Final commit**

If any adjustments were needed during verification, commit them:

```bash
git add -A
git commit -m "feat: migrate backend build from tsc to esbuild single-file bundle

Reduces platform package size by ~15MB by bundling all pure-JS dependencies
into a single file. Only native modules (node-pty, better-sqlite3) remain
as external dependencies in platform packages."
```
