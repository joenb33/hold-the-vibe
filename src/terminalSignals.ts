import * as vscode from 'vscode';
import { getConfig } from './config';
import type { Diagnostics } from './diagnostics';
import type { EditBurstTracker } from './editBurstTracker';
import type { MusicController } from './musicController';

const TERMINAL_END_DEBOUNCE_MS = 2000;

export class TerminalSignals {
  private pendingEndTimer: ReturnType<typeof setTimeout> | undefined;
  private activeExecutions = 0;

  constructor(
    private readonly musicController: MusicController,
    private readonly editBurstTracker: EditBurstTracker,
    private readonly diagnostics: Diagnostics,
    disposables: vscode.Disposable[],
  ) {
    const onStart = vscode.window.onDidStartTerminalShellExecution;
    const onEnd = vscode.window.onDidEndTerminalShellExecution;
    if (typeof onStart !== 'function' || typeof onEnd !== 'function') {
      console.warn(
        '[Elevator Music] Terminal shell execution API not available in this editor version; terminal fallback disabled.',
      );
      return;
    }

    disposables.push(
      // Terminal-start is intentionally NOT used to start hold music: a manual
      // command (e.g. `git status`) would start a loop that never reliably stops.
      // Terminal events are used only as an end-of-turn ding heuristic, gated by
      // the edit-burst check. Hold music in Notify Mode comes solely from the
      // notifyTaskStarting LM tool.
      onStart(() => {
        this.activeExecutions++;
        if (this.pendingEndTimer) {
          clearTimeout(this.pendingEndTimer);
          this.pendingEndTimer = undefined;
        }
      }),
      onEnd(() => {
        this.activeExecutions = Math.max(0, this.activeExecutions - 1);
        if (this.pendingEndTimer) {
          clearTimeout(this.pendingEndTimer);
        }
        this.pendingEndTimer = setTimeout(() => {
          this.pendingEndTimer = undefined;
          if (this.activeExecutions > 0) {
            return;
          }
          this.onTerminalExecutionSettled();
        }, TERMINAL_END_DEBOUNCE_MS);
      }),
    );
  }

  private onTerminalExecutionSettled(): void {
    const config = getConfig();
    if (!config.enabled || !config.terminalFallback) {
      return;
    }

    if (!this.editBurstTracker.hasRecentBurst()) {
      this.diagnostics.recordTerminalRejectedByEditBurst();
      return;
    }

    this.musicController.requestActivityStop('terminal');
  }

  dispose(): void {
    if (this.pendingEndTimer) {
      clearTimeout(this.pendingEndTimer);
      this.pendingEndTimer = undefined;
    }
  }
}
