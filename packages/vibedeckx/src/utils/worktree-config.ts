import path from "path";
import { mkdir, readFile, writeFile } from "fs/promises";

export interface WorktreeConfig {
  worktrees: Array<{ branch: string }>;
}

export async function readWorktreeConfig(projectPath: string): Promise<WorktreeConfig> {
  const configPath = path.join(projectPath, ".vibedeckx", "worktrees.json");
  try {
    const content = await readFile(configPath, "utf-8");
    const raw = JSON.parse(content) as { worktrees: Array<{ path?: string; branch?: string }> };
    // Normalize: old format had { path, branch }, new format only { branch }
    const worktrees = raw.worktrees.map((entry) => ({
      branch: entry.branch ?? "",
    })).filter((entry) => entry.branch);
    return { worktrees };
  } catch {
    return { worktrees: [] };
  }
}

export async function writeWorktreeConfig(projectPath: string, config: WorktreeConfig): Promise<void> {
  const configDir = path.join(projectPath, ".vibedeckx");
  const configPath = path.join(configDir, "worktrees.json");
  await mkdir(configDir, { recursive: true });
  await writeFile(configPath, JSON.stringify(config, null, 2) + "\n");
}
