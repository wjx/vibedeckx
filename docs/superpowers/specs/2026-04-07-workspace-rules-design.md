# Workspace Rules

Replace the ProjectCard in the workspace left panel with a rules list. Rules are natural language instructions that guide the main chat AI's behavior per workspace (project + branch). Multiple rules per workspace. Stored in SQLite, injected into the chat AI's system prompt.

## Data Model

New `rules` table:

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PRIMARY KEY | UUID |
| project_id | TEXT NOT NULL | FK to projects |
| branch | TEXT | Nullable (null = default workspace) |
| name | TEXT NOT NULL | User-given label |
| content | TEXT NOT NULL | Natural language rule text |
| enabled | INTEGER NOT NULL DEFAULT 1 | 0/1 toggle |
| position | INTEGER NOT NULL DEFAULT 0 | Display ordering |
| created_at | TEXT NOT NULL | ISO timestamp |
| updated_at | TEXT NOT NULL | ISO timestamp |

## Backend

### Storage Interface

Add `rules` to the `Storage` interface in `packages/vibedeckx/src/storage/types.ts`:

```typescript
rules: {
  create: (opts: { id: string; project_id: string; branch: string | null; name: string; content: string; enabled?: boolean }) => Rule;
  getByWorkspace: (projectId: string, branch: string | null) => Rule[];
  getById: (id: string) => Rule | undefined;
  update: (id: string, opts: { name?: string; content?: string; enabled?: boolean; position?: number }) => Rule | undefined;
  delete: (id: string) => void;
  reorder: (projectId: string, branch: string | null, orderedIds: string[]) => void;
};
```

### SQLite Implementation

Add to `packages/vibedeckx/src/storage/sqlite.ts`:
- Table creation in schema init
- CRUD methods matching the interface above

### REST Routes

New file `packages/vibedeckx/src/routes/rule-routes.ts`:

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/projects/:projectId/rules?branch=X` | List rules for workspace |
| POST | `/api/projects/:projectId/rules` | Create rule |
| PUT | `/api/rules/:id` | Update rule |
| DELETE | `/api/rules/:id` | Delete rule |
| PUT | `/api/rules/reorder` | Reorder rules |

### System Prompt Injection

In `chat-session-manager.ts`, modify `getSystemPrompt()`:
- Fetch all enabled rules for the current project + branch via `storage.rules.getByWorkspace()`
- Append as a numbered list under a `## Workspace Rules` heading
- Fetched fresh on each `sendMessage()` call (no caching)

Format:
```
## Workspace Rules
The user has configured the following rules for this workspace. Follow them:
1. [Rule Name]: rule content here
2. [Rule Name]: rule content here
```

## Frontend

### Remove ProjectCard from Workspace

In `apps/vibedeckx-ui/app/page.tsx`, replace the `ProjectCard` block in the workspace left panel with the new `RulesList` component.

### RulesList Component

New file: `apps/vibedeckx-ui/components/rules/rules-list.tsx`

- Header: "Rules" title + "+" add button (Plus icon)
- Each rule row: name (truncated), enable/disable toggle switch
- Click row to open edit dialog
- Empty state: "No rules yet" message with add button
- Scrollable if many rules, constrained height so it doesn't eat into chat space

### Add/Edit Rule Dialog

New file: `apps/vibedeckx-ui/components/rules/rule-dialog.tsx`

Popup dialog with:
- Name field (text input)
- Content field (textarea)
- Enabled toggle
- Save / Cancel buttons
- Delete button (edit mode only)

### useRules Hook

New file: `apps/vibedeckx-ui/hooks/use-rules.ts`

- Fetches rules for current project + branch
- Provides `createRule`, `updateRule`, `deleteRule` mutations
- Refetches on branch change

### API Layer

Add to `apps/vibedeckx-ui/lib/api.ts`:
- `Rule` interface
- `api.getRules(projectId, branch)`
- `api.createRule(projectId, data)`
- `api.updateRule(id, data)`
- `api.deleteRule(id)`

## Files Changed

### Backend (new)
- `packages/vibedeckx/src/routes/rule-routes.ts` — REST routes

### Backend (modified)
- `packages/vibedeckx/src/storage/types.ts` — Rule type + storage interface
- `packages/vibedeckx/src/storage/sqlite.ts` — SQLite implementation
- `packages/vibedeckx/src/server.ts` — Register rule routes
- `packages/vibedeckx/src/chat-session-manager.ts` — Inject rules into system prompt

### Frontend (new)
- `apps/vibedeckx-ui/components/rules/rules-list.tsx` — Rules list component
- `apps/vibedeckx-ui/components/rules/rule-dialog.tsx` — Add/edit dialog
- `apps/vibedeckx-ui/hooks/use-rules.ts` — Rules data hook

### Frontend (modified)
- `apps/vibedeckx-ui/app/page.tsx` — Replace ProjectCard with RulesList
- `apps/vibedeckx-ui/lib/api.ts` — Rule interface + API methods
