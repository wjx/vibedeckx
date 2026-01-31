import Database from "better-sqlite3";
import type { Database as BetterSqlite3Database } from "better-sqlite3";
import { mkdir } from "fs/promises";
import path from "path";
import type { Project, Executor, ExecutorProcess, ExecutorProcessStatus, Storage } from "./types.js";

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
  `);
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
      create: ({ id, project_id, name, command, cwd }) => {
        db.prepare(
          `INSERT INTO executors (id, project_id, name, command, cwd) VALUES (@id, @project_id, @name, @command, @cwd)`
        ).run({ id, project_id, name, command, cwd: cwd ?? null });

        return db
          .prepare<{ id: string }, Executor>(`SELECT * FROM executors WHERE id = @id`)
          .get({ id })!;
      },

      getByProjectId: (projectId: string) => {
        return db
          .prepare<{ project_id: string }, Executor>(`SELECT * FROM executors WHERE project_id = @project_id ORDER BY created_at ASC`)
          .all({ project_id: projectId });
      },

      getById: (id: string) => {
        return db
          .prepare<{ id: string }, Executor>(`SELECT * FROM executors WHERE id = @id`)
          .get({ id });
      },

      update: (id: string, opts: { name?: string; command?: string; cwd?: string | null }) => {
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

        if (updates.length === 0) {
          return db.prepare<{ id: string }, Executor>(`SELECT * FROM executors WHERE id = @id`).get({ id });
        }

        db.prepare(`UPDATE executors SET ${updates.join(', ')} WHERE id = @id`).run(params);
        return db.prepare<{ id: string }, Executor>(`SELECT * FROM executors WHERE id = @id`).get({ id });
      },

      delete: (id: string) => {
        db.prepare(`DELETE FROM executors WHERE id = @id`).run({ id });
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

    close: () => {
      db.close();
    },
  };
};
