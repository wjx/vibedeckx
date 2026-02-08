import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { readWorktreeConfig, writeWorktreeConfig } from "../utils/worktree-config.js";
import { proxyToRemote } from "../utils/remote-proxy.js";
import "../server-types.js";

const routes: FastifyPluginAsync = async (fastify) => {
  // ==================== Path-based worktree API ====================

  // Get worktrees for a path
  fastify.get<{
    Querystring: { path: string };
  }>("/api/path/worktrees", async (req, reply) => {
    const projectPath = req.query.path;
    if (!projectPath) {
      return reply.code(400).send({ error: "Path is required" });
    }

    const config = await readWorktreeConfig(projectPath);
    const validWorktrees = config.worktrees.filter((wt) => {
      const absolutePath = path.join(projectPath, wt.path);
      return existsSync(absolutePath);
    });

    const worktrees: Array<{ path: string; branch: string | null }> = [
      { path: ".", branch: null },
    ];
    for (const wt of validWorktrees) {
      worktrees.push({ path: wt.path, branch: wt.branch });
    }

    return reply.code(200).send({ worktrees });
  });

  // Create worktree at a path
  fastify.post<{
    Body: { path: string; branchName: string };
  }>("/api/path/worktrees", async (req, reply) => {
    const { path: projectPath, branchName } = req.body;
    if (!projectPath || !branchName) {
      return reply.code(400).send({ error: "Path and branchName are required" });
    }

    const trimmedBranch = branchName.trim();
    if (!/^[a-zA-Z0-9]/.test(trimmedBranch) || /[^a-zA-Z0-9/_-]/.test(trimmedBranch)) {
      return reply.code(400).send({ error: "Invalid branch name format" });
    }

    try {
      const { execSync } = await import("child_process");

      try {
        execSync(`git rev-parse --verify refs/heads/${trimmedBranch}`, {
          cwd: projectPath,
          encoding: "utf-8",
          stdio: ["pipe", "pipe", "pipe"],
        });
        return reply.code(409).send({ error: `Branch '${trimmedBranch}' already exists` });
      } catch {
        // Branch doesn't exist, continue
      }

      const worktreeDirName = trimmedBranch.replace(/\//g, "-");
      const worktreeRelativePath = `.worktrees/${worktreeDirName}`;
      const worktreeAbsolutePath = path.join(projectPath, worktreeRelativePath);

      await mkdir(path.join(projectPath, ".worktrees"), { recursive: true });

      execSync(`git worktree add -b "${trimmedBranch}" "${worktreeAbsolutePath}" main`, {
        cwd: projectPath,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });

      const config = await readWorktreeConfig(projectPath);
      config.worktrees.push({ path: worktreeRelativePath, branch: trimmedBranch });
      await writeWorktreeConfig(projectPath, config);

      return reply.code(201).send({
        worktree: { path: worktreeRelativePath, branch: trimmedBranch },
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      return reply.code(500).send({ error: `Failed to create worktree: ${errorMessage}` });
    }
  });

  // Delete worktree at a path
  fastify.delete<{
    Body: { path: string; worktreePath: string };
  }>("/api/path/worktrees", async (req, reply) => {
    const { path: projectPath, worktreePath } = req.body;
    if (!projectPath || !worktreePath) {
      return reply.code(400).send({ error: "Path and worktreePath are required" });
    }

    if (worktreePath === ".") {
      return reply.code(400).send({ error: "Cannot delete main worktree" });
    }

    try {
      const { execSync } = await import("child_process");
      const worktreeAbsPath = path.resolve(projectPath, worktreePath);

      try {
        const statusOutput = execSync("git status --porcelain", {
          cwd: worktreeAbsPath,
          encoding: "utf-8",
          stdio: ["pipe", "pipe", "pipe"],
        });
        if (statusOutput.trim() !== "") {
          return reply.code(409).send({
            error: "Worktree has uncommitted changes",
          });
        }
      } catch {
        // Continue with deletion
      }

      let branchToDelete: string | null = null;
      try {
        const worktreeListOutput = execSync("git worktree list --porcelain", {
          cwd: projectPath,
          encoding: "utf-8",
        });
        const blocks = worktreeListOutput.trim().split("\n\n");
        for (const block of blocks) {
          const lines = block.split("\n");
          let currentPath = "";
          let currentBranch: string | null = null;
          for (const line of lines) {
            if (line.startsWith("worktree ")) currentPath = line.slice(9);
            else if (line.startsWith("branch refs/heads/")) currentBranch = line.slice(18);
          }
          if (currentPath === worktreeAbsPath) {
            branchToDelete = currentBranch;
            break;
          }
        }
      } catch {
        // Continue without branch deletion
      }

      execSync(`git worktree remove "${worktreeAbsPath}"`, {
        cwd: projectPath,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });

      if (branchToDelete) {
        try {
          execSync(`git branch -d "${branchToDelete}"`, {
            cwd: projectPath,
            encoding: "utf-8",
            stdio: ["pipe", "pipe", "pipe"],
          });
        } catch {
          // Branch deletion failed, not critical
        }
      }

      const config = await readWorktreeConfig(projectPath);
      config.worktrees = config.worktrees.filter((wt) => wt.path !== worktreePath);
      await writeWorktreeConfig(projectPath, config);

      return reply.code(200).send({ success: true });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      return reply.code(500).send({ error: `Failed to delete worktree: ${errorMessage}` });
    }
  });

  // ==================== Project-based worktree API ====================

  // 获取项目的 worktrees
  fastify.get<{ Params: { id: string } }>("/api/projects/:id/worktrees", async (req, reply) => {
    const project = fastify.storage.projects.getById(req.params.id);
    if (!project) {
      return reply.code(404).send({ error: "Project not found" });
    }

    // Proxy to remote if this is a remote-only project
    if (!project.path && project.remote_url && project.remote_api_key && project.remote_path) {
      const result = await proxyToRemote(
        project.remote_url,
        project.remote_api_key,
        "GET",
        `/api/path/worktrees?path=${encodeURIComponent(project.remote_path)}`
      );
      return reply.code(result.status || 200).send(result.data);
    }

    if (!project.path) {
      return reply.code(400).send({ error: "Project has no local path" });
    }

    const projectPath = project.path;
    const config = await readWorktreeConfig(projectPath);

    const validWorktrees = config.worktrees.filter((wt) => {
      const absolutePath = path.join(projectPath, wt.path);
      return existsSync(absolutePath);
    });

    const worktrees: Array<{ path: string; branch: string | null }> = [
      { path: ".", branch: null },
    ];

    for (const wt of validWorktrees) {
      worktrees.push({ path: wt.path, branch: wt.branch });
    }

    return reply.code(200).send({ worktrees });
  });

  // 删除 git worktree
  fastify.delete<{
    Params: { id: string };
    Body: { worktreePath: string };
  }>("/api/projects/:id/worktrees", async (req, reply) => {
    const project = fastify.storage.projects.getById(req.params.id);
    if (!project) {
      return reply.code(404).send({ error: "Project not found" });
    }

    const { worktreePath } = req.body;

    if (!worktreePath || typeof worktreePath !== "string" || worktreePath.trim() === "") {
      return reply.code(400).send({ error: "Worktree path is required" });
    }

    if (worktreePath === ".") {
      return reply.code(400).send({ error: "Cannot delete main worktree" });
    }

    const hasLocal = !!project.path;
    const hasRemote = !!(project.remote_url && project.remote_api_key && project.remote_path);

    // Remote-only project: proxy to remote
    if (!hasLocal && hasRemote) {
      const result = await proxyToRemote(
        project.remote_url!,
        project.remote_api_key!,
        "DELETE",
        `/api/path/worktrees`,
        { path: project.remote_path, worktreePath }
      );
      return reply.code(result.status || 200).send(result.data);
    }

    if (!hasLocal) {
      return reply.code(400).send({ error: "Project has no local path" });
    }

    // Local deletion helper
    const deleteLocal = async () => {
      const { execSync } = await import("child_process");
      const worktreeAbsPath = path.resolve(project.path!, worktreePath);

      try {
        const statusOutput = execSync("git status --porcelain", {
          cwd: worktreeAbsPath,
          encoding: "utf-8",
          stdio: ["pipe", "pipe", "pipe"],
        });

        if (statusOutput.trim() !== "") {
          throw new Error("Worktree has uncommitted changes. Please commit or discard changes before deleting.");
        }
      } catch (err) {
        if (err instanceof Error && err.message.includes("uncommitted changes")) throw err;
        // If git status fails for other reasons, continue with deletion attempt
      }

      let branchToDelete: string | null = null;
      try {
        const worktreeListOutput = execSync("git worktree list --porcelain", {
          cwd: project.path!,
          encoding: "utf-8",
        });

        const blocks = worktreeListOutput.trim().split("\n\n");
        for (const block of blocks) {
          const lines = block.split("\n");
          let currentWorktreePath = "";
          let currentBranch: string | null = null;

          for (const line of lines) {
            if (line.startsWith("worktree ")) {
              currentWorktreePath = line.slice(9);
            } else if (line.startsWith("branch refs/heads/")) {
              currentBranch = line.slice(18);
            }
          }

          if (currentWorktreePath === worktreeAbsPath) {
            branchToDelete = currentBranch;
            break;
          }
        }
      } catch {
        // Failed to get branch info, continue without deleting branch
      }

      execSync(`git worktree remove "${worktreeAbsPath}"`, {
        cwd: project.path!,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });

      if (branchToDelete) {
        try {
          execSync(`git branch -d "${branchToDelete}"`, {
            cwd: project.path!,
            encoding: "utf-8",
            stdio: ["pipe", "pipe", "pipe"],
          });
        } catch {
          // Branch deletion failed, not critical
        }
      }

      const config = await readWorktreeConfig(project.path!);
      config.worktrees = config.worktrees.filter((wt) => wt.path !== worktreePath);
      await writeWorktreeConfig(project.path!, config);
    };

    // Local-only project
    if (!hasRemote) {
      try {
        await deleteLocal();
        return reply.code(200).send({ success: true });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        if (errorMessage.includes("uncommitted changes")) {
          return reply.code(409).send({ error: errorMessage });
        }
        return reply.code(500).send({ error: `Failed to delete worktree: ${errorMessage}` });
      }
    }

    // Hybrid project: delete from both local and remote
    const results: Record<string, { success: boolean; error?: string }> = {};

    // Delete local first
    try {
      await deleteLocal();
      results.local = { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      // Local failure: return error immediately, don't attempt remote
      return reply.code(500).send({ error: `Failed to delete local worktree: ${errorMessage}` });
    }

    // Delete remote
    try {
      const remoteResult = await proxyToRemote(
        project.remote_url!,
        project.remote_api_key!,
        "DELETE",
        `/api/path/worktrees`,
        { path: project.remote_path, worktreePath }
      );
      if (remoteResult.ok) {
        results.remote = { success: true };
      } else {
        const remoteData = remoteResult.data as { error?: string };
        results.remote = { success: false, error: remoteData.error || "Remote deletion failed" };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      results.remote = { success: false, error: errorMessage };
    }

    if (!results.remote?.success) {
      return reply.code(207).send({ success: true, results });
    }

    return reply.code(200).send({ success: true, results });
  });

  // 创建新的 git worktree
  fastify.post<{
    Params: { id: string };
    Body: { branchName: string; targets?: ("local" | "remote")[] };
  }>("/api/projects/:id/worktrees", async (req, reply) => {
    const project = fastify.storage.projects.getById(req.params.id);
    if (!project) {
      return reply.code(404).send({ error: "Project not found" });
    }

    const { branchName } = req.body;

    if (!branchName || typeof branchName !== "string" || branchName.trim() === "") {
      return reply.code(400).send({ error: "Branch name is required" });
    }

    const trimmedBranch = branchName.trim();
    if (!/^[a-zA-Z0-9]/.test(trimmedBranch) || /[^a-zA-Z0-9/_-]/.test(trimmedBranch)) {
      return reply.code(400).send({ error: "Invalid branch name format" });
    }

    // Determine targets
    const hasLocal = !!project.path;
    const hasRemote = !!(project.remote_url && project.remote_api_key && project.remote_path);
    let targets: ("local" | "remote")[];

    if (req.body.targets && req.body.targets.length > 0) {
      targets = req.body.targets;
    } else if (!hasLocal && hasRemote) {
      targets = ["remote"];
    } else {
      targets = ["local"];
    }

    // Validate targets against project capabilities
    if (targets.includes("local") && !hasLocal) {
      return reply.code(400).send({ error: "Project has no local path" });
    }
    if (targets.includes("remote") && !hasRemote) {
      return reply.code(400).send({ error: "Project has no remote configuration" });
    }

    // Single-target: remote only (backward-compatible path)
    if (targets.length === 1 && targets[0] === "remote") {
      const result = await proxyToRemote(
        project.remote_url!,
        project.remote_api_key!,
        "POST",
        `/api/path/worktrees`,
        { path: project.remote_path, branchName: trimmedBranch }
      );
      return reply.code(result.status || 201).send(result.data);
    }

    // Local creation helper
    const createLocal = async () => {
      const { execSync } = await import("child_process");

      try {
        execSync(`git rev-parse --verify refs/heads/${trimmedBranch}`, {
          cwd: project.path!,
          encoding: "utf-8",
          stdio: ["pipe", "pipe", "pipe"],
        });
        throw new Error(`Branch '${trimmedBranch}' already exists`);
      } catch (err) {
        // If it's our own "already exists" error, rethrow
        if (err instanceof Error && err.message.includes("already exists")) throw err;
        // Otherwise branch doesn't exist, which is what we want
      }

      const worktreeDirName = trimmedBranch.replace(/\//g, "-");
      const worktreeRelativePath = `.worktrees/${worktreeDirName}`;
      const worktreeAbsolutePath = path.join(project.path!, worktreeRelativePath);

      await mkdir(path.join(project.path!, ".worktrees"), { recursive: true });

      execSync(`git worktree add -b "${trimmedBranch}" "${worktreeAbsolutePath}" main`, {
        cwd: project.path!,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });

      const gitdirFile = path.join(project.path!, ".git", "worktrees", worktreeDirName, "gitdir");
      const worktreeDotGit = path.join(worktreeAbsolutePath, ".git");
      await writeFile(gitdirFile, worktreeDotGit + "\n");

      const gitWorktreeMetaDir = path.join(project.path!, ".git", "worktrees", worktreeDirName);
      const relativeToMain = path.relative(worktreeAbsolutePath, gitWorktreeMetaDir);
      await writeFile(worktreeDotGit, "gitdir: " + relativeToMain + "\n");

      const config = await readWorktreeConfig(project.path!);
      config.worktrees.push({ path: worktreeRelativePath, branch: trimmedBranch });
      await writeWorktreeConfig(project.path!, config);

      return { path: worktreeRelativePath, branch: trimmedBranch };
    };

    // Single-target: local only (backward-compatible path)
    if (targets.length === 1 && targets[0] === "local") {
      try {
        const worktree = await createLocal();
        return reply.code(201).send({ worktree });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        if (errorMessage.includes("already exists")) {
          return reply.code(409).send({ error: errorMessage });
        }
        return reply.code(500).send({ error: `Failed to create worktree: ${errorMessage}` });
      }
    }

    // Multi-target: local + remote
    const results: Record<string, { success: boolean; worktree?: { path: string; branch: string }; error?: string }> = {};

    // Local first
    let localWorktree: { path: string; branch: string } | undefined;
    try {
      localWorktree = await createLocal();
      results.local = { success: true, worktree: localWorktree };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      // Local failure: return error immediately, don't attempt remote
      return reply.code(500).send({ error: `Failed to create local worktree: ${errorMessage}` });
    }

    // Remote second
    try {
      const remoteResult = await proxyToRemote(
        project.remote_url!,
        project.remote_api_key!,
        "POST",
        `/api/path/worktrees`,
        { path: project.remote_path, branchName: trimmedBranch }
      );
      if (remoteResult.ok) {
        const remoteData = remoteResult.data as { worktree?: { path: string; branch: string } };
        results.remote = { success: true, worktree: remoteData.worktree };
      } else {
        const remoteData = remoteResult.data as { error?: string };
        results.remote = { success: false, error: remoteData.error || "Remote creation failed" };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      results.remote = { success: false, error: errorMessage };
    }

    // If remote failed, return 207 partial success
    if (!results.remote?.success) {
      return reply.code(207).send({
        worktree: localWorktree,
        results,
      });
    }

    return reply.code(201).send({
      worktree: localWorktree,
      results,
    });
  });
};

export default fp(routes, { name: "worktree-routes" });
