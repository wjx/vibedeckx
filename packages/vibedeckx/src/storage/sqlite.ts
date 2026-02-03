import Database from "better-sqlite3";
import type { Database as BetterSqlite3Database } from "better-sqlite3";
import { mkdir } from "fs/promises";
import path from "path";
import type { Project, Executor, ExecutorProcess, ExecutorProcessStatus, AgentSession, AgentSessionStatus, Storage } from "./types.js";

const createDatabase = (dbPath: string): BetterSqlite3Database => {
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT NOT NULL UNIQUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS executors (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      command TEXT NOT NULL,
      cwd TEXT,
      pty INTEGER DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS executor_processes (
      id TEXT PRIMARY KEY,
      executor_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'running',
      exit_code INTEGER,
      started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      finished_at TIMESTAMP,
      FOREIGN KEY (executor_id) REFERENCES executors(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS agent_sessions (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      worktree_path TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'running',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(project_id, worktree_path),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
  `);

  // Migration: add pty column to existing executors table if not present
  const tableInfo = db.prepare("PRAGMA table_info(executors)").all() as { name: string }[];
  const hasPtyColumn = tableInfo.some((col) => col.name === "pty");
  if (!hasPtyColumn) {
    db.exec("ALTER TABLE executors ADD COLUMN pty INTEGER DEFAULT 1");
  }

  // Migration: add position column to existing executors table if not present
  const hasPositionColumn = tableInfo.some((col) => col.name === "position");
  if (!hasPositionColumn) {
    db.exec("ALTER TABLE executors ADD COLUMN position INTEGER DEFAULT 0");
    // Initialize positions based on created_at order
    db.exec(`
      UPDATE executors SET position = (
        SELECT COUNT(*) FROM executors e2
        WHERE e2.project_id = executors.project_id
        AND e2.created_at <= executors.created_at
      ) - 1
    `);
  }

  return db;
};

export const createSqliteStorage = async (dbPath: string): Promise<Storage> => {
  await mkdir(path.dirname(dbPath), { recursive: true });
  const db = createDatabase(dbPath);

  return {
    projects: {
      create: ({ id, name, path: projectPath }) => {
        db.prepare(
          `INSERT INTO projects (id, name, path) VALUES (@id, @name, @path)`
        ).run({ id, name, path: projectPath });

        return db
          .prepare<{ id: string }, Project>(`SELECT * FROM projects WHERE id = @id`)
          .get({ id })!;
      },

      getAll: () => {
        return db
          .prepare<{}, Project>(`SELECT * FROM projects ORDER BY created_at DESC`)
          .all({});
      },

      getById: (id: string) => {
        return db
          .prepare<{ id: string }, Project>(`SELECT * FROM projects WHERE id = @id`)
          .get({ id });
      },

      getByPath: (projectPath: string) => {
        return db
          .prepare<{ path: string }, Project>(`SELECT * FROM projects WHERE path = @path`)
          .get({ path: projectPath });
      },

      delete: (id: string) => {
        db.prepare(`DELETE FROM projects WHERE id = @id`).run({ id });
      },
    },

    executors: {
      create: ({ id, project_id, name, command, cwd, pty }) => {
        // Get max position for this project
        const maxPos = db.prepare<{ project_id: string }, { max_pos: number | null }>(
          `SELECT MAX(position) as max_pos FROM executors WHERE project_id = @project_id`
        ).get({ project_id });
        const position = (maxPos?.max_pos ?? -1) + 1;

        db.prepare(
          `INSERT INTO executors (id, project_id, name, command, cwd, pty, position) VALUES (@id, @project_id, @name, @command, @cwd, @pty, @position)`
        ).run({ id, project_id, name, command, cwd: cwd ?? null, pty: pty !== false ? 1 : 0, position });

        const row = db
          .prepare<{ id: string }, { id: string; project_id: string; name: string; command: string; cwd: string | null; pty: number; position: number; created_at: string }>(`SELECT * FROM executors WHERE id = @id`)
          .get({ id })!;
        return { ...row, pty: row.pty === 1 };
      },

      getByProjectId: (projectId: string) => {
        const rows = db
          .prepare<{ project_id: string }, { id: string; project_id: string; name: string; command: string; cwd: string | null; pty: number; position: number; created_at: string }>(`SELECT * FROM executors WHERE project_id = @project_id ORDER BY position ASC`)
          .all({ project_id: projectId });
        return rows.map((row) => ({ ...row, pty: row.pty === 1 }));
      },

      getById: (id: string) => {
        const row = db
          .prepare<{ id: string }, { id: string; project_id: string; name: string; command: string; cwd: string | null; pty: number; position: number; created_at: string }>(`SELECT * FROM executors WHERE id = @id`)
          .get({ id });
        return row ? { ...row, pty: row.pty === 1 } : undefined;
      },

      update: (id: string, opts: { name?: string; command?: string; cwd?: string | null; pty?: boolean }) => {
        const updates: string[] = [];
        const params: Record<string, unknown> = { id };

        if (opts.name !== undefined) {
          updates.push('name = @name');
          params.name = opts.name;
        }
        if (opts.command !== undefined) {
          updates.push('command = @command');
          params.command = opts.command;
        }
        if (opts.cwd !== undefined) {
          updates.push('cwd = @cwd');
          params.cwd = opts.cwd;
        }
        if (opts.pty !== undefined) {
          updates.push('pty = @pty');
          params.pty = opts.pty ? 1 : 0;
        }

        if (updates.length === 0) {
          const row = db.prepare<{ id: string }, { id: string; project_id: string; name: string; command: string; cwd: string | null; pty: number; position: number; created_at: string }>(`SELECT * FROM executors WHERE id = @id`).get({ id });
          return row ? { ...row, pty: row.pty === 1 } : undefined;
        }

        db.prepare(`UPDATE executors SET ${updates.join(', ')} WHERE id = @id`).run(params);
        const row = db.prepare<{ id: string }, { id: string; project_id: string; name: string; command: string; cwd: string | null; pty: number; position: number; created_at: string }>(`SELECT * FROM executors WHERE id = @id`).get({ id });
        return row ? { ...row, pty: row.pty === 1 } : undefined;
      },

      delete: (id: string) => {
        db.prepare(`DELETE FROM executors WHERE id = @id`).run({ id });
      },

      reorder: (projectId: string, orderedIds: string[]) => {
        const transaction = db.transaction(() => {
          for (let i = 0; i < orderedIds.length; i++) {
            db.prepare(
              `UPDATE executors SET position = @position WHERE id = @id AND project_id = @project_id`
            ).run({ id: orderedIds[i], project_id: projectId, position: i });
          }
        });
        transaction();
      },
    },

    executorProcesses: {
      create: ({ id, executor_id }) => {
        db.prepare(
          `INSERT INTO executor_processes (id, executor_id, status) VALUES (@id, @executor_id, 'running')`
        ).run({ id, executor_id });

        return db
          .prepare<{ id: string }, ExecutorProcess>(`SELECT * FROM executor_processes WHERE id = @id`)
          .get({ id })!;
      },

      getById: (id: string) => {
        return db
          .prepare<{ id: string }, ExecutorProcess>(`SELECT * FROM executor_processes WHERE id = @id`)
          .get({ id });
      },

      getRunning: () => {
        return db
          .prepare<{}, ExecutorProcess>(`SELECT * FROM executor_processes WHERE status = 'running'`)
          .all({});
      },

      updateStatus: (id: string, status: ExecutorProcessStatus, exitCode?: number) => {
        const finishedAt = status !== 'running' ? new Date().toISOString() : null;
        db.prepare(
          `UPDATE executor_processes SET status = @status, exit_code = @exit_code, finished_at = @finished_at WHERE id = @id`
        ).run({ id, status, exit_code: exitCode ?? null, finished_at: finishedAt });
      },
    },

    agentSessions: {
      create: ({ id, project_id, worktree_path }) => {
        // Delete any existing session for this worktree (one-to-one binding)
        db.prepare(
          `DELETE FROM agent_sessions WHERE project_id = @project_id AND worktree_path = @worktree_path`
        ).run({ project_id, worktree_path });

        db.prepare(
          `INSERT INTO agent_sessions (id, project_id, worktree_path, status) VALUES (@id, @project_id, @worktree_path, 'running')`
        ).run({ id, project_id, worktree_path });

        return db
          .prepare<{ id: string }, AgentSession>(`SELECT * FROM agent_sessions WHERE id = @id`)
          .get({ id })!;
      },

      getById: (id: string) => {
        return db
          .prepare<{ id: string }, AgentSession>(`SELECT * FROM agent_sessions WHERE id = @id`)
          .get({ id });
      },

      getByProjectId: (projectId: string) => {
        return db
          .prepare<{ project_id: string }, AgentSession>(`SELECT * FROM agent_sessions WHERE project_id = @project_id ORDER BY created_at DESC`)
          .all({ project_id: projectId });
      },

      getByWorktree: (projectId: string, worktreePath: string) => {
        return db
          .prepare<{ project_id: string; worktree_path: string }, AgentSession>(
            `SELECT * FROM agent_sessions WHERE project_id = @project_id AND worktree_path = @worktree_path`
          )
          .get({ project_id: projectId, worktree_path: worktreePath });
      },

      updateStatus: (id: string, status: AgentSessionStatus) => {
        db.prepare(
          `UPDATE agent_sessions SET status = @status WHERE id = @id`
        ).run({ id, status });
      },

      delete: (id: string) => {
        db.prepare(`DELETE FROM agent_sessions WHERE id = @id`).run({ id });
      },
    },

    close: () => {
      db.close();
    },
  };
};
