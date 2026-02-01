# Security Notes

This document tracks security considerations for future hardening if the application is exposed beyond local development use.

## Path Traversal in Executor Start Endpoint

**Location:** `packages/vibedeckx/src/server.ts` - `/api/executors/:id/start` endpoint

**Current Behavior:** The `worktreePath` parameter is resolved relative to the project path without validation that the result stays within the project directory.

**Risk Level:** Low for current use case (local development tool with trusted users).

**Why Acceptable Now:**
- This is a local development tool running on the user's machine
- The user controls both the projects and git worktrees
- worktreePath values come from `git worktree list` output, not arbitrary user input
- The user already has full filesystem access

**Future Hardening (if exposing to untrusted input):**

```typescript
// Add after resolving worktreePath:
if (worktreePath && worktreePath !== ".") {
  const resolvedPath = path.resolve(project.path, worktreePath);
  // Security: Ensure resolved path is within project directory or parent
  const projectParent = path.dirname(project.path);
  if (!resolvedPath.startsWith(projectParent + path.sep)) {
    return reply.code(400).send({ error: "Invalid worktree path" });
  }
  basePath = resolvedPath;
}
```

Note: We check `projectParent` rather than `project.path` because git worktrees are typically created in sibling directories (e.g., `../.worktrees/feature-x`).
