import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pty from 'node-pty';
import { send } from './protocol.js';

const BACKEND_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const COMPILER_BIN = process.env.COMPILER_BIN || path.join(BACKEND_DIR, 'compiler');
// rlwrap provides readline (history, arrow keys) around the plain-stdin interpreter.
const RLWRAP_BIN = process.env.RLWRAP_BIN || 'rlwrap';

const IDLE_MS = Number(process.env.SESSION_IDLE_MS || 10 * 60 * 1000);
const RUN_MS = Number(process.env.SESSION_RUN_MS || 60 * 1000);
const MAX_OUTPUT = Number(process.env.SESSION_MAX_OUTPUT || 1024 * 1024);

export class Session {
  constructor(ws) {
    this.ws = ws;
    this.tmpDir = null;
    this.compileProc = null;
    this.ptyProc = null;
    this.bytesOut = 0;
    this.idleTimer = null;
    this.runTimer = null;
    this.generation = 0;
    this.disposed = false;
    this.touch();
  }

  send(frame) {
    send(this.ws, frame);
  }

  touch() {
    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => this.dispose('idle timeout'), IDLE_MS);
  }

  async handle(msg) {
    this.touch();
    switch (msg?.type) {
      case 'run':
        await this.run(String(msg.source ?? ''));
        break;
      case 'input':
        this.input(String(msg.data ?? ''));
        break;
      case 'resize':
        this.resize(Number(msg.cols), Number(msg.rows));
        break;
      case 'stop':
        this.stop();
        break;
      default:
        break;
    }
  }

  async run(source) {
    this.stop();
    const generation = this.generation;
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mt-'));
    if (this.disposed || generation !== this.generation) {
      await fs.rm(tmpDir, { recursive: true, force: true });
      return;
    }
    this.tmpDir = tmpDir;

    const srcPath = path.join(tmpDir, 'prog.mt');
    const tamPath = path.join(tmpDir, 'prog.tam');
    await fs.writeFile(srcPath, source);

    const result = await this.compile(srcPath, tmpDir);
    if (this.disposed || generation !== this.generation) return;

    let tam = '';
    try {
      tam = await fs.readFile(tamPath, 'utf8');
    } catch {
      // No TAM file: compilation failed before writing output.
    }

    this.send({ type: 'tam', text: tam });

    // The compiler prints type errors to stdout, then a "compiled to ..." line.
    const diagnostics = result.stdout
      .split('\n')
      .filter((line) => !line.startsWith('compiled to TAM file:'))
      .join('\n')
      .trim();

    if (diagnostics !== '') {
      this.send({ type: 'diagnostics', text: `${diagnostics}\n` });
      return;
    }

    if (result.code !== 0 && result.stderr.trim() !== '') {
      this.send({ type: 'error', message: result.stderr.trim() });
      return;
    }

    // cw2 emits no instructions when the type checker rejects the program.
    if (tam.trim() === '') {
      this.send({ type: 'error', message: 'Compilation produced no TAM output.' });
      return;
    }

    this.startInterpreter(tamPath, tmpDir);
  }

  compile(srcPath, tmpDir) {
    return new Promise((resolve) => {
      const proc = spawn(COMPILER_BIN, [srcPath], {
        cwd: tmpDir,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      this.compileProc = proc;

      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', (chunk) => {
        stdout += chunk;
      });
      proc.stderr.on('data', (chunk) => {
        stderr += chunk;
      });
      proc.on('error', (error) => {
        resolve({ code: -1, stdout, stderr: stderr + String(error) });
      });
      proc.on('close', (code) => {
        this.compileProc = null;
        resolve({ code: code ?? -1, stdout, stderr });
      });
    });
  }

  startInterpreter(tamPath, tmpDir) {
    const historyPath = path.join(tmpDir, 'history');
    const args = ['-n', '-H', historyPath, COMPILER_BIN, tamPath];
    const env = {
      ...process.env,
      TERM: 'xterm-256color',
      HOME: tmpDir,
    };

    let proc;
    try {
      proc = pty.spawn(RLWRAP_BIN, args, {
        name: 'xterm-256color',
        cols: 120,
        rows: 30,
        cwd: tmpDir,
        env,
      });
    } catch (error) {
      this.send({ type: 'error', message: `Failed to start interpreter: ${error}` });
      return;
    }
    this.ptyProc = proc;
    this.bytesOut = 0;

    this.runTimer = setTimeout(() => {
      this.send({ type: 'stderr', text: '\r\n[session timed out]\r\n' });
      this.stop();
    }, RUN_MS);

    proc.onData((text) => {
      this.bytesOut += Buffer.byteLength(text);
      if (this.bytesOut > MAX_OUTPUT) {
        this.send({ type: 'stderr', text: '\r\n[output limit reached]\r\n' });
        this.stop();
        return;
      }
      this.send({ type: 'stdout', text });
    });

    proc.onExit(({ exitCode }) => {
      clearTimeout(this.runTimer);
      this.runTimer = null;
      this.ptyProc = null;
      this.send({ type: 'exit', code: exitCode });
    });
  }

  input(data) {
    if (this.ptyProc) {
      this.ptyProc.write(data);
    }
  }

  resize(cols, rows) {
    if (!this.ptyProc || !Number.isFinite(cols) || !Number.isFinite(rows)) return;
    try {
      this.ptyProc.resize(cols, rows);
    } catch {
      // The process may have exited between the check and the resize.
    }
  }

  stop() {
    this.generation += 1;
    clearTimeout(this.runTimer);
    this.runTimer = null;

    if (this.ptyProc) {
      try {
        this.ptyProc.kill();
      } catch {
        // Already gone.
      }
      this.ptyProc = null;
    }

    if (this.compileProc) {
      try {
        this.compileProc.kill();
      } catch {
        // Already gone.
      }
      this.compileProc = null;
    }

    if (this.tmpDir) {
      const dir = this.tmpDir;
      this.tmpDir = null;
      fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }

  dispose(reason) {
    if (this.disposed) return;
    this.disposed = true;
    clearTimeout(this.idleTimer);
    this.stop();
    if (this.ws.readyState === 1) {
      try {
        this.ws.close(1000, reason || 'closed');
      } catch {
        // Already closing.
      }
    }
  }
}
