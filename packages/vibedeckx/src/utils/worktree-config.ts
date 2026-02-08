import path from "path";
import { mkdir, readFile, writeFile } from "fs/promises";

export interface WorktreeConfig {
  worktrees: Array<{ path: string; branch: string }>;
}

export async function readWorktreeConfig(projectPath: string): Promise<WorktreeConfig> {
  const configPath = path.join(projectPath, ".vibedeckx", "worktrees.json");
  try {
    const content = await readFile(configPath, "utf-8");
    return JSON.parse(content);
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
