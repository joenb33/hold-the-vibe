import { execFile, spawn, type ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { getConfig } from './config';

const LOOP_PID_STATE_KEY = 'elevatorMusic.holdLoopPid';

type PlaybackLog = (message: string) => void;

export class SoundPlayer {
  private loopProcess: ChildProcess | null = null;
  private loopPid: number | undefined;
  private log: PlaybackLog = (message) => console.warn(`[Elevator Music] ${message}`);

  constructor(private readonly context: vscode.ExtensionContext) {}

  setPlaybackLogger(logger: PlaybackLog): void {
    this.log = logger;
  }

  /** Kill any hold-loop process left over from a crashed or closed window. */
  cleanupOrphanedLoop(): void {
    const stored = this.context.globalState.get<number>(LOOP_PID_STATE_KEY);
    if (stored === undefined) {
      return;
    }
    console.log(`[Elevator Music] Cleaning orphaned hold loop (pid ${stored})`);
    this.killProcessTree(stored);
    void this.context.globalState.update(LOOP_PID_STATE_KEY, undefined);
  }

  resolveDingPath(): string {
    const custom = getConfig().dingPath.trim();
    if (custom && fs.existsSync(custom)) {
      return custom;
    }
    return vscode.Uri.joinPath(this.context.extensionUri, 'media', 'ding.wav').fsPath;
  }

  resolveHoldMusicPath(): string {
    const custom = getConfig().holdMusicPath.trim();
    if (custom && fs.existsSync(custom)) {
      return custom;
    }
    return vscode.Uri.joinPath(this.context.extensionUri, 'media', 'hold-music.wav').fsPath;
  }

  playDing(): void {
    const soundFile = this.resolveDingPath();
    if (!fs.existsSync(soundFile)) {
      console.warn(`[Elevator Music] Ding file not found: ${soundFile}`);
      return;
    }
    this.playOnce(soundFile);
  }

  isLoopRunning(): boolean {
    return this.loopPid !== undefined;
  }

  startHoldLoop(): void {
    if (this.loopPid !== undefined) {
      return;
    }
    const soundFile = this.resolveHoldMusicPath();
    if (!fs.existsSync(soundFile)) {
      console.warn(`[Elevator Music] Hold music file not found: ${soundFile}`);
      return;
    }

    console.log(`[Elevator Music] Starting hold loop: ${soundFile}`);

    const platform = process.platform;
    if (platform === 'win32') {
      this.startWindowsLoop(soundFile);
    } else if (platform === 'darwin') {
      this.startUnixLoop(soundFile, 'darwin');
    } else {
      this.startUnixLoop(soundFile, 'linux');
    }
  }

  stopHoldLoop(): void {
    const pid = this.loopPid;
    this.loopProcess?.removeAllListeners();
    this.loopProcess = null;
    this.loopPid = undefined;

    if (pid === undefined) {
      return;
    }

    console.log(`[Elevator Music] Stopping hold loop (pid ${pid})`);

    this.killProcessTree(pid);
    void this.context.globalState.update(LOOP_PID_STATE_KEY, undefined);
  }

  private killProcessTree(pid: number): void {
    if (process.platform === 'win32') {
      execFile('taskkill', ['/T', '/F', '/PID', String(pid)], () => undefined);
    } else {
      try {
        process.kill(-pid, 'SIGTERM');
      } catch {
        try {
          process.kill(pid, 'SIGTERM');
        } catch {
          // Process already exited.
        }
      }
    }
  }

  private playOnce(soundFile: string): void {
    if (process.platform === 'win32') {
      const scriptPath = vscode.Uri.joinPath(this.context.extensionUri, 'hooks', 'play-ding.ps1').fsPath;
      const volume = String(getConfig().volume);
      execFile(
        'powershell',
        ['-STA', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, soundFile, volume],
        (err, _stdout, stderr) => {
          if (err) {
            this.log(`Ding playback failed: ${err.message}`);
            return;
          }
          const errText = stderr?.toString().trim();
          if (errText) {
            this.log(`Ding playback stderr: ${errText}`);
          }
        },
      );
      return;
    }
    const volumePct = getConfig().volume;
    if (process.platform === 'darwin') {
      // afplay -v takes a 0..1 (and above) linear multiplier.
      const afVolume = (volumePct / 100).toFixed(2);
      execFile('afplay', ['-v', afVolume, soundFile], () => undefined);
      return;
    }
    execFile('aplay', [soundFile], (err) => {
      if (err) {
        // paplay --volume takes 0..65536 where 65536 is 100%.
        const paVolume = String(Math.round((volumePct / 100) * 65536));
        execFile('paplay', [`--volume=${paVolume}`, soundFile], () => undefined);
      }
    });
  }

  private startWindowsLoop(soundFile: string): void {
    // Detached PowerShell children exit immediately on Windows when using WPF
    // MediaPlayer (no audio, process gone in <1s). Keep the child attached to
    // this extension host and stop it explicitly via stopHoldLoop().
    const scriptPath = vscode.Uri.joinPath(this.context.extensionUri, 'hooks', 'play-loop.ps1').fsPath;
    const volume = String(getConfig().volume);
    const child = spawn(
      'powershell',
      ['-STA', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, soundFile, volume],
      { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true },
    );
    child.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString().trim();
      if (text) {
        this.log(`Hold loop stderr: ${text}`);
      }
    });
    this.trackLoopChild(child);
  }

  private startFfplayLoop(ffplay: string, soundFile: string): void {
    const volume = getConfig().volume;
    const child = spawn(
      ffplay,
      ['-nodisp', '-autoexit', '-loop', '0', '-volume', String(Math.round(volume)), soundFile],
      { detached: true, stdio: 'ignore', windowsHide: true },
    );
    this.trackLoopChild(child);
  }

  private trackLoopChild(child: ChildProcess): void {
    child.on('error', (err) => {
      this.log(`Hold loop spawn failed: ${err.message}`);
      if (this.loopProcess === child) {
        this.loopProcess = null;
        this.loopPid = undefined;
        void this.context.globalState.update(LOOP_PID_STATE_KEY, undefined);
      }
    });
    child.on('exit', (code, signal) => {
      if (this.loopProcess === child) {
        if (code !== 0 && code !== null) {
          this.log(`Hold loop exited early (code ${code}, signal ${signal ?? 'none'})`);
        }
        this.loopProcess = null;
        this.loopPid = undefined;
        void this.context.globalState.update(LOOP_PID_STATE_KEY, undefined);
      }
    });
    this.loopProcess = child;
    this.loopPid = child.pid;
    if (child.pid !== undefined) {
      void this.context.globalState.update(LOOP_PID_STATE_KEY, child.pid);
    }
  }

  private startUnixLoop(soundFile: string, platform: 'darwin' | 'linux'): void {
    const ffplay = this.findFfplay();
    if (ffplay) {
      this.startFfplayLoop(ffplay, soundFile);
      return;
    }

    const shell = '/bin/bash';
    const volumePct = getConfig().volume;
    const quoted = shellQuote(soundFile);
    const loopCmd =
      platform === 'darwin'
        ? `while true; do afplay -v ${(volumePct / 100).toFixed(2)} ${quoted}; done`
        : `while true; do aplay ${quoted} 2>/dev/null || paplay --volume=${Math.round((volumePct / 100) * 65536)} ${quoted}; done`;

    const child = spawn(shell, ['-c', loopCmd], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
    this.trackLoopChild(child);
  }

  private findFfplay(): string | null {
    const candidates =
      process.platform === 'win32'
        ? ['ffplay', 'ffplay.exe']
        : ['ffplay', '/usr/local/bin/ffplay', '/opt/homebrew/bin/ffplay'];

    for (const candidate of candidates) {
      if (path.isAbsolute(candidate) && fs.existsSync(candidate)) {
        return candidate;
      }
      if (!path.isAbsolute(candidate)) {
        const pathEnv = process.env.PATH ?? '';
        const sep = process.platform === 'win32' ? ';' : ':';
        for (const dir of pathEnv.split(sep)) {
          const full = path.join(dir, candidate);
          if (fs.existsSync(full)) {
            return full;
          }
        }
      }
    }
    return null;
  }
}

function shellQuote(value: string): string {
  if (os.platform() === 'win32') {
    return `"${value.replace(/"/g, '\\"')}"`;
  }
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
