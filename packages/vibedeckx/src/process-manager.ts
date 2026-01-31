import { spawn, type ChildProcess } from "child_process";
import type { Executor, ExecutorProcessStatus, Storage } from "./storage/types.js";

export type LogMessage =
  | { type: "stdout"; data: string }
  | { type: "stderr"; data: string }
  | { type: "finished"; exitCode: number };

type LogSubscriber = (msg: LogMessage) => void;

interface RunningProcess {
  childProcess: ChildProcess;
  logs: LogMessage[];
  subscribers: Set<LogSubscriber>;
  executorId: string;
  projectPath: string;
}

const LOG_RETENTION_MS = 5 * 60 * 1000; // 5 minutes

export class ProcessManager {
  private processes: Map<string, RunningProcess> = new Map();
  private storage: Storage;

  constructor(storage: Storage) {
    this.storage = storage;
  }

  /**
   * Start a new process for the given executor
   * Returns the process ID
   */
  start(executor: Executor, projectPath: string): string {
    const processId = crypto.randomUUID();

    // Create process record in database
    this.storage.executorProcesses.create({
      id: processId,
      executor_id: executor.id,
    });

    // Determine working directory
    const cwd = executor.cwd || projectPath;

    console.log(`[ProcessManager] Starting process ${processId}`);
    console.log(`[ProcessManager] Command: ${executor.command}`);
    console.log(`[ProcessManager] CWD: ${cwd}`);

    // Spawn the child process
    const childProcess = spawn(executor.command, {
      shell: true,
      cwd,
      env: { ...process.env, FORCE_COLOR: "1" },
    });

    const runningProcess: RunningProcess = {
      childProcess,
      logs: [],
      subscribers: new Set(),
      executorId: executor.id,
      projectPath,
    };

    this.processes.set(processId, runningProcess);
    console.log(`[ProcessManager] Process ${processId} added to map, PID: ${childProcess.pid}`);

    // Handle stdout
    childProcess.stdout?.on("data", (data: Buffer) => {
      const msg: LogMessage = { type: "stdout", data: data.toString() };
      runningProcess.logs.push(msg);
      this.broadcast(processId, msg);
    });

    // Handle stderr
    childProcess.stderr?.on("data", (data: Buffer) => {
      const msg: LogMessage = { type: "stderr", data: data.toString() };
      runningProcess.logs.push(msg);
      this.broadcast(processId, msg);
    });

    // Handle process exit
    childProcess.on("close", (code) => {
      const exitCode = code ?? 0;
      const status: ExecutorProcessStatus = exitCode === 0 ? "completed" : "failed";

      console.log(`[ProcessManager] Process ${processId} exited with code ${exitCode}`);

      this.storage.executorProcesses.updateStatus(processId, status, exitCode);

      const msg: LogMessage = { type: "finished", exitCode };
      runningProcess.logs.push(msg);
      this.broadcast(processId, msg);

      // Schedule cleanup after retention period
      setTimeout(() => {
        console.log(`[ProcessManager] Cleaning up process ${processId}`);
        this.processes.delete(processId);
      }, LOG_RETENTION_MS);
    });

    // Handle spawn errors
    childProcess.on("error", (error) => {
      const msg: LogMessage = { type: "stderr", data: `Error: ${error.message}` };
      runningProcess.logs.push(msg);
      this.broadcast(processId, msg);

      this.storage.executorProcesses.updateStatus(processId, "failed", 1);

      const finishMsg: LogMessage = { type: "finished", exitCode: 1 };
      runningProcess.logs.push(finishMsg);
      this.broadcast(processId, finishMsg);
    });

    return processId;
  }

  /**
   * Stop a running process
   */
  stop(processId: string): boolean {
    const runningProcess = this.processes.get(processId);
    if (!runningProcess) {
      return false;
    }

    // Try graceful termination first (SIGTERM), then force kill (SIGKILL)
    const killed = runningProcess.childProcess.kill("SIGTERM");

    if (killed) {
      this.storage.executorProcesses.updateStatus(processId, "killed");
    }

    return killed;
  }

  /**
   * Subscribe to log updates for a process
   * Returns an unsubscribe function
   */
  subscribe(processId: string, callback: LogSubscriber): (() => void) | null {
    const runningProcess = this.processes.get(processId);
    if (!runningProcess) {
      return null;
    }

    runningProcess.subscribers.add(callback);

    return () => {
      runningProcess.subscribers.delete(callback);
    };
  }

  /**
   * Get all historical logs for a process
   */
  getLogs(processId: string): LogMessage[] {
    const runningProcess = this.processes.get(processId);
    return runningProcess?.logs ?? [];
  }

  /**
   * Check if a process is still running
   */
  isRunning(processId: string): boolean {
    const runningProcess = this.processes.get(processId);
    if (!runningProcess) {
      return false;
    }
    return !runningProcess.childProcess.killed && runningProcess.childProcess.exitCode === null;
  }

  /**
   * Get all running process IDs
   */
  getRunningProcessIds(): string[] {
    return Array.from(this.processes.entries())
      .filter(([_, proc]) => !proc.childProcess.killed && proc.childProcess.exitCode === null)
      .map(([id]) => id);
  }

  /**
   * Broadcast a message to all subscribers of a process
   */
  private broadcast(processId: string, msg: LogMessage): void {
    const runningProcess = this.processes.get(processId);
    if (!runningProcess) return;

    for (const subscriber of runningProcess.subscribers) {
      try {
        subscriber(msg);
      } catch (error) {
        console.error("Error in log subscriber:", error);
      }
    }
  }
}
