# Vibedeckx

AI-powered app generator with project management support.

## Project Structure

```
vibedeckx/
├── packages/vibedeckx/     # CLI package (publishable to npm)
│   └── src/
│       ├── bin.ts          # CLI entry point
│       ├── command.ts      # CLI commands
│       ├── server.ts       # Fastify server
│       ├── dialog.ts       # Folder selection dialog
│       └── storage/        # SQLite storage layer
└── apps/vibedeckx-ui/      # Next.js frontend
    ├── app/                # Next.js app router
    ├── components/         # React components
    └── hooks/              # React hooks
```

## Development

```bash
# Install dependencies
pnpm install

# Run frontend in development mode
pnpm dev

# Run CLI in watch mode
pnpm dev:server
```

## Build

```bash
# Build everything (CLI + UI)
pnpm build

# Build individual parts
pnpm build:main    # Build CLI package
pnpm build:ui      # Build UI (static export)
pnpm copy:ui       # Copy UI to CLI dist
```

## Usage

### Run from built files

```bash
pnpm start
# or
node packages/vibedeckx/dist/bin.js
```

### Specify port

```bash
node packages/vibedeckx/dist/bin.js --port 8080
```

## Distribution

### Local Packaging

Use `scripts/pack.sh` to build distribution packages. Output is written to the `dist-out/` directory:

```bash
./scripts/pack.sh                  # Build npm package + platform archives
./scripts/pack.sh npm              # Build the main npm tarball only
./scripts/pack.sh platform         # Build platform archives only (for npx / direct download)
./scripts/pack.sh npm-platform     # Build npm platform packages (matches the npmjs release)
./scripts/pack.sh <mode> --skip-build  # Skip pnpm build (reuse the existing dist/)
```

Three kinds of packages are produced:

| Type | Example file | Description |
|------|-------------|-------------|
| Main npm package | `vibedeckx-0.1.0.tgz` | Lightweight wrapper (only `bin/vibedeckx.mjs`) |
| Platform archive | `vibedeckx-0.1.0-linux-x64.tar.gz` | Precompiled dependencies, ready to use, for GitHub Releases |
| npm platform package | `vibedeckx-linux-x64-0.1.0.tgz` | Matches `@vibedeckx/linux-x64` published on npmjs |

### Publishing to npm

Push a `v*` tag to trigger an automated CI release (see the Release section below), or publish manually:

```bash
cd packages/vibedeckx
npm publish
```

Users can then run it directly:

```bash
npx vibedeckx
```

## Features

- **Project Management**: Create and manage multiple workspace projects
- **Folder Selection**: Native OS folder picker (macOS, Windows, Linux)
- **SQLite Storage**: Project data stored in `~/.vibedeckx/data.sqlite`
- **Static UI**: Frontend bundled with CLI for easy distribution
- **Remote Projects**: Connect to remote vibedeckx servers to manage projects on remote machines

## Remote Project Support

Vibedeckx supports connecting to remote vibedeckx servers, allowing you to manage projects on remote machines through a local UI.

### Architecture

```
┌──────────────┐     ┌─────────────────────┐     ┌──────────────────┐
│  Browser UI  │◄───►│  Local vibedeckx    │◄───►│ Remote vibedeckx │
│  (Next.js)   │     │  (Management)       │     │  (Execution)     │
└──────────────┘     └─────────────────────┘     └──────────────────┘
                            │                           │
                            ▼                           ▼
                      Local SQLite                Remote Agent
                    (all project data)           (execution only)
```

**Data Storage** (managed locally, executed remotely):
- **Local SQLite**: stores all project configuration (the local database is the source of truth)
  - Project info (name, path, remote connection config)
  - Executor config (command, working directory)
  - Remote connection info (URL, API key)
- **Remote Server**: handles execution only
  - Runs agent sessions (accessing the remote filesystem)
  - Executes Executor commands
  - Browses remote directories

### Setting Up a Remote Server

1. Start vibedeckx on the remote machine with an API key:

```bash
# On the remote server
VIBEDECKX_API_KEY=your-secret-key vibedeckx start --port 5174
```

The `VIBEDECKX_API_KEY` environment variable enables API authentication. All API requests must include the `X-Vibedeckx-Api-Key` header.

2. Ensure the port is accessible from your local machine (firewall rules, SSH tunneling, etc.)

### Connecting to a Remote Server

1. In the UI, click "Create Project" and select the **Remote** tab

2. Enter the remote server details:
   - **Remote Server URL**: e.g., `http://192.168.1.100:5174`
   - **API Key**: The key set via `VIBEDECKX_API_KEY` on the remote server

3. Click **Test** to verify the connection

4. Once connected, browse the remote filesystem and select a project directory

5. Enter a project name and click **Create Project**

### How It Works

- **Connection Config**: Remote project connection details (URL, API key) are stored locally
- **Request Proxying**: All API requests for remote projects are proxied through your local vibedeckx server
- **WebSocket Proxying**: Agent session WebSocket connections are transparently proxied to the remote server
- **Data Locality**: Project files and agent processes run on the remote server; only the UI runs locally

### Security Considerations

- API keys are stored in plain text in the local SQLite database
- Use HTTPS in production environments
- Consider SSH tunneling for secure connections over untrusted networks:

```bash
# Create an SSH tunnel to the remote server
ssh -L 5174:localhost:5174 user@remote-server

# Then connect to http://localhost:5174 in the UI
```

### Remote Project Indicators

Remote projects are visually distinguished in the UI:
- A **Remote** badge appears next to the project name
- The path shows the remote URL prefix (e.g., `http://server:5174:/path/to/project`)

## Release

The project uses GitHub Actions for automated builds and releases. Pushing a tag in the `v*` format triggers a release from any branch.

```bash
# 1. Make sure all changes are committed
git add .
git commit -m "release: v0.1.0"

# 2. Create the tag
git tag v0.1.0

# 3. Push the tag to trigger the build
git push origin v0.1.0
```

Once the build completes, a Release is created automatically on the GitHub Releases page, including precompiled packages for the following platforms:

| Platform | File format |
|----------|-------------|
| Linux x64 | `.tar.gz` |
| macOS ARM (Apple Silicon) | `.tar.gz` |
| Windows x64 | `.tar.gz` |

After downloading and extracting, run with Node.js 22+:

```bash
node dist/bin.js
```

## CLI Commands

```
vibedeckx start [options]        Start the server
  --port <value>                 Port to run the server on (default: 3000)
  --auth                         Enable Clerk authentication
  --data-dir <path>              Directory for storing database file (default: ~/.vibedeckx)
vibedeckx --help                 Show help
vibedeckx --version              Show version
```

### Custom Data Directory

Use `--data-dir` to specify a custom directory for the database file:

```bash
vibedeckx --data-dir /path/to/data
# Database will be stored at /path/to/data/data.sqlite
```

## Troubleshooting

### `ENOTEMPTY` error when running with npx

If you see an error like:

```
npm error code ENOTEMPTY
npm error syscall rename
npm error path /home/user/.npm/_npx/...
npm error dest /home/user/.npm/_npx/...
npm error ENOTEMPTY: directory not empty, rename ...
```

This is caused by npm cache corruption. Fix it by clearing the npx cache:

```bash
rm -rf ~/.npm/_npx/
```

Then retry:

```bash
npx vibedeckx-0.1.0.tgz
```

## Data Storage

- **Global config**: `~/.vibedeckx/`
- **Database**: `~/.vibedeckx/data.sqlite`
