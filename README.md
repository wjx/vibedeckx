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

### Option 1: Publish to npm

```bash
cd packages/vibedeckx
npm publish
```

Users can then run:

```bash
npx vibedeckx
```

### Option 2: Local tgz package

Create a local package file:

```bash
cd packages/vibedeckx
npm pack
```

This creates `vibedeckx-0.1.0.tgz`. Users can run it via:

```bash
# Run directly with npx
npx /path/to/vibedeckx-0.1.0.tgz

# Or install globally first
npm install -g /path/to/vibedeckx-0.1.0.tgz
vibedeckx
```

### Option 3: Install from local path

```bash
npm install -g /path/to/vibedeckx/packages/vibedeckx
vibedeckx
```

## Features

- **Project Management**: Create and manage multiple workspace projects
- **Folder Selection**: Native OS folder picker (macOS, Windows, Linux)
- **SQLite Storage**: Project data stored in `~/.vibedeckx/data.sqlite`
- **Static UI**: Frontend bundled with CLI for easy distribution

## CLI Commands

```
vibedeckx start [--port value]   Start the server (default port: 3000)
vibedeckx --help                 Show help
vibedeckx --version              Show version
```

## Data Storage

- **Global config**: `~/.vibedeckx/`
- **Database**: `~/.vibedeckx/data.sqlite`
- **Project config**: `<project-path>/.vibedeckx/config.json`
