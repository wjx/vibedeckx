import path from "path";
import { createHash } from "crypto";
import { execSync } from "child_process";

const WORKTREE_BASE_DIR = "/var/tmp/vibedeckx/worktrees";
const WORKTREE_LIST_TTL_MS = 5_000;

interface CachedWorktreeList {
  entries: Array<{ path: string; branch: string | null }>;
  expiresAt: number;
}

const worktreeListCache = new Map<string, CachedWorktreeList>();

/** Stable short identifier for a project path */
function getProjectIdentifier(projectPath: string): string {
  const basename = path.basename(projectPath);
  const hash = createHash("md5").update(projectPath).digest("hex").slice(0, 8);
  return `${basename}-${hash}`;
}

function readWorktreeListFromGit(projectPath: string): Array<{ path: string; branch: string | null }> {
  const output = execSync("git worktree list --porcelain", {
    cwd: projectPath,
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
  });

  const entries: Array<{ path: string; branch: string | null }> = [];
  const blocks = output.trim().split("\n\n");

  for (const block of blocks) {
    const lines = block.split("\n");
    let worktreePath = "";
    let branch: string | null = null;

    for (const line of lines) {
      if (line.startsWith("worktree ")) worktreePath = line.slice(9);
      else if (line.startsWith("branch refs/heads/")) branch = line.slice(18);
    }

    if (worktreePath) {
      entries.push({ path: worktreePath, branch });
    }
  }

  return entries;
}

/** Parse `git worktree list --porcelain`, cached per projectPath for ~5s. */
export function parseGitWorktreeList(projectPath: string): Array<{ path: string; branch: string | null }> {
  const now = Date.now();
  const cached = worktreeListCache.get(projectPath);
  if (cached && cached.expiresAt > now) {
    return cached.entries;
  }
  const entries = readWorktreeListFromGit(projectPath);
  worktreeListCache.set(projectPath, { entries, expiresAt: now + WORKTREE_LIST_TTL_MS });
  return entries;
}

/** Run `git worktree prune` and invalidate the cached list for this project.
 *  Call from list-style API handlers; not on every internal lookup. */
export function pruneWorktrees(projectPath: string): void {
  try {
    execSync("git worktree prune", {
      cwd: projectPath,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
  } finally {
    worktreeListCache.delete(projectPath);
  }
}

/** Invalidate the cached list for a project — call after add/remove succeeds. */
export function invalidateWorktreeListCache(projectPath: string): void {
  worktreeListCache.delete(projectPath);
}

/** Resolve branch to absolute filesystem path. null = main worktree. */
export function resolveWorktreePath(projectPath: string, branch: string | null): string {
  if (!branch) return projectPath;
  // Prefer git's real worktree path so worktrees created outside the
  // vibedeckx convention still resolve correctly.
  try {
    const entries = parseGitWorktreeList(projectPath);
    const match = entries.find((e) => e.branch === branch);
    if (match) return match.path;
  } catch {
    // git failed (not a repo, etc.) — fall through to convention.
  }
  const dirName = branch.replace(/\//g, "-");
  return path.join(WORKTREE_BASE_DIR, getProjectIdentifier(projectPath), dirName);
}

/** Get the base worktree directory for a project (for mkdir) */
export function getWorktreeBaseForProject(projectPath: string): string {
  return path.join(WORKTREE_BASE_DIR, getProjectIdentifier(projectPath));
}

/** Get worktree branches for a project in the API response shape */
export function getWorktreeBranches(projectPath: string): Array<{ branch: string | null }> {
  const entries = parseGitWorktreeList(projectPath);
  const worktrees: Array<{ branch: string | null }> = [{ branch: null }];

  // The first entry (index 0) is always the main worktree — skip it.
  // Add all other worktrees that have a branch name.
  for (let i = 1; i < entries.length; i++) {
    if (entries[i].branch) {
      worktrees.push({ branch: entries[i].branch });
    }
  }

  return worktrees;
}
