import path from "path";
import { createHash } from "crypto";
import { execSync } from "child_process";

const WORKTREE_BASE_DIR = "/var/tmp/vibedeckx/worktrees";

/** Stable short identifier for a project path */
function getProjectIdentifier(projectPath: string): string {
  const basename = path.basename(projectPath);
  const hash = createHash("md5").update(projectPath).digest("hex").slice(0, 8);
  return `${basename}-${hash}`;
}

/** Resolve branch to absolute filesystem path. null = main worktree. */
export function resolveWorktreePath(projectPath: string, branch: string | null): string {
  if (!branch) return projectPath;
  const dirName = branch.replace(/\//g, "-");
  return path.join(WORKTREE_BASE_DIR, getProjectIdentifier(projectPath), dirName);
}

/** Get the base worktree directory for a project (for mkdir) */
export function getWorktreeBaseForProject(projectPath: string): string {
  return path.join(WORKTREE_BASE_DIR, getProjectIdentifier(projectPath));
}

/** Parse `git worktree list --porcelain` output into structured entries */
export function parseGitWorktreeList(projectPath: string): Array<{ path: string; branch: string | null }> {
  execSync("git worktree prune", {
    cwd: projectPath,
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
  });

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

/** Get worktree branches for a project in the API response shape */
export function getWorktreeBranches(projectPath: string): Array<{ branch: string | null }> {
  const entries = parseGitWorktreeList(projectPath);
  const worktrees: Array<{ branch: string | null }> = [{ branch: null }];

  // The first entry is the main worktree (projectPath itself) — skip it.
  // Add all other worktrees that have a branch name.
  for (const entry of entries) {
    if (entry.path !== projectPath && entry.branch) {
      worktrees.push({ branch: entry.branch });
    }
  }

  return worktrees;
}
