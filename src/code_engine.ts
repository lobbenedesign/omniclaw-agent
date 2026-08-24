/**
 * ⚡ Smolagents-Style Code Execution Engine
 * Empowers the AI agent to "Think in Executable Code".
 * Instead of slow, multi-step JSON tool calls, the agent writes and evaluates
 * sandboxed TypeScript, Python, and Shell snippets directly.
 */

import { spawn } from "child_process";
import { writeFileSync, unlinkSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

export interface CodeExecutionResult {
  language: "typescript" | "python" | "shell";
  code: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  executionTimeMs: number;
  success: boolean;
}

export class OmniCodeEngine {
  private timeoutMs: number;
  private workingDir: string;

  constructor(workingDir: string = process.cwd(), timeoutMs = 25000) {
    this.workingDir = workingDir;
    this.timeoutMs = timeoutMs;
  }

  public setWorkingDir(dir: string): void {
    this.workingDir = dir;
  }

  public async execute(code: string, language: "typescript" | "python" | "shell" = "typescript"): Promise<CodeExecutionResult> {
    const startTime = Date.now();

    if (language === "shell") {
      return this.executeShell(code, startTime);
    } else if (language === "python") {
      return this.executePython(code, startTime);
    } else {
      return this.executeTypeScript(code, startTime);
    }
  }

  private executeShell(code: string, startTime: number): Promise<CodeExecutionResult> {
    return new Promise((resolve) => {
      const proc = spawn(code, {
        shell: true,
        cwd: this.workingDir,
        env: { ...process.env, PAGER: "cat" }
      });

      let stdout = "";
      let stderr = "";

      proc.stdout.on("data", (d) => { stdout += d.toString(); });
      proc.stderr.on("data", (d) => { stderr += d.toString(); });

      const timer = setTimeout(() => {
        try { proc.kill("SIGKILL"); } catch {}
        stderr += `\n[Timeout Error]: Execution exceeded ${this.timeoutMs}ms`;
      }, this.timeoutMs);

      proc.on("close", (exitCode) => {
        clearTimeout(timer);
        resolve({
          language: "shell",
          code,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          exitCode: exitCode ?? 0,
          executionTimeMs: Date.now() - startTime,
          success: (exitCode === 0)
        });
      });

      proc.on("error", (err) => {
        clearTimeout(timer);
        resolve({
          language: "shell",
          code,
          stdout: "",
          stderr: err.message,
          exitCode: 1,
          executionTimeMs: Date.now() - startTime,
          success: false
        });
      });
    });
  }

  private executePython(code: string, startTime: number): Promise<CodeExecutionResult> {
    return new Promise((resolve) => {
      const tempFile = join(tmpdir(), `omniclaw_${Date.now()}.py`);
      try {
        writeFileSync(tempFile, code, "utf-8");
      } catch (e: any) {
        return resolve({
          language: "python",
          code,
          stdout: "",
          stderr: `Failed to write temp script: ${e.message}`,
          exitCode: 1,
          executionTimeMs: Date.now() - startTime,
          success: false
        });
      }

      const proc = spawn("python3", [tempFile], {
        cwd: this.workingDir,
        env: { ...process.env, PYTHONUNBUFFERED: "1" }
      });

      let stdout = "";
      let stderr = "";

      proc.stdout.on("data", (d) => { stdout += d.toString(); });
      proc.stderr.on("data", (d) => { stderr += d.toString(); });

      const timer = setTimeout(() => {
        try { proc.kill("SIGKILL"); } catch {}
        stderr += `\n[Timeout Error]: Execution exceeded ${this.timeoutMs}ms`;
      }, this.timeoutMs);

      proc.on("close", (exitCode) => {
        clearTimeout(timer);
        try { unlinkSync(tempFile); } catch {}
        resolve({
          language: "python",
          code,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          exitCode: exitCode ?? 0,
          executionTimeMs: Date.now() - startTime,
          success: (exitCode === 0)
        });
      });

      proc.on("error", (err) => {
        clearTimeout(timer);
        try { unlinkSync(tempFile); } catch {}
        resolve({
          language: "python",
          code,
          stdout: "",
          stderr: err.message,
          exitCode: 1,
          executionTimeMs: Date.now() - startTime,
          success: false
        });
      });
    });
  }

  private executeTypeScript(code: string, startTime: number): Promise<CodeExecutionResult> {
    return new Promise((resolve) => {
      const tempFile = join(tmpdir(), `omniclaw_${Date.now()}.ts`);
      try {
        writeFileSync(tempFile, code, "utf-8");
      } catch (e: any) {
        return resolve({
          language: "typescript",
          code,
          stdout: "",
          stderr: `Failed to write temp script: ${e.message}`,
          exitCode: 1,
          executionTimeMs: Date.now() - startTime,
          success: false
        });
      }

      const proc = spawn("bun", [tempFile], {
        cwd: this.workingDir,
        env: { ...process.env }
      });

      let stdout = "";
      let stderr = "";

      proc.stdout.on("data", (d) => { stdout += d.toString(); });
      proc.stderr.on("data", (d) => { stderr += d.toString(); });

      const timer = setTimeout(() => {
        try { proc.kill("SIGKILL"); } catch {}
        stderr += `\n[Timeout Error]: Execution exceeded ${this.timeoutMs}ms`;
      }, this.timeoutMs);

      proc.on("close", (exitCode) => {
        clearTimeout(timer);
        try { unlinkSync(tempFile); } catch {}
        resolve({
          language: "typescript",
          code,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          exitCode: exitCode ?? 0,
          executionTimeMs: Date.now() - startTime,
          success: (exitCode === 0)
        });
      });

      proc.on("error", (err) => {
        clearTimeout(timer);
        try { unlinkSync(tempFile); } catch {}
        resolve({
          language: "typescript",
          code,
          stdout: "",
          stderr: err.message,
          exitCode: 1,
          executionTimeMs: Date.now() - startTime,
          success: false
        });
      });
    });
  }
}
