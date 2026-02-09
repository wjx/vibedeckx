import path from "path";
import { createHash } from "crypto";

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
