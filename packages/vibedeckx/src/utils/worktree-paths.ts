import path from "path";
import { createHash } from "crypto";

const WORKTREE_BASE_DIR = "/var/tmp/vibedeckx/worktrees";

/** Stable short identifier for a project path */
function getProjectIdentifier(projectPath: string): string {
  const basename = path.basename(projectPath);
  const hash = createHash("md5").update(projectPath).digest("hex").slice(0, 8);
  return `${basename}-${hash}`;
}

/** Resolve abstract worktree path (e.g. ".worktrees/feature-x") to absolute filesystem path */
export function resolveWorktreePath(projectPath: string, worktreePath: string): string {
  if (!worktreePath || worktreePath === ".") return projectPath;
  const dirName = worktreePath.replace(/^\.worktrees\//, "");
  return path.join(WORKTREE_BASE_DIR, getProjectIdentifier(projectPath), dirName);
}

/** Get the base worktree directory for a project (for mkdir) */
export function getWorktreeBaseForProject(projectPath: string): string {
  return path.join(WORKTREE_BASE_DIR, getProjectIdentifier(projectPath));
}
