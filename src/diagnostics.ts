import * as vscode from 'vscode';

export interface DiagnosticsSnapshot {
  dingsFromTool: number;
  dingsFromTerminal: number;
  dingsFromHook: number;
  dingsSuppressedByCooldown: number;
  dingsSuppressedByModeGate: number;
  dingsSuppressedDisabled: number;
  holdStartsFromTool: number;
  holdStartsFromTerminal: number;
  holdStartsFromHook: number;
  holdStopsFromTool: number;
  holdStopsFromTerminal: number;
  holdStopsFromHook: number;
  terminalSignalsRejectedByEditBurst: number;
  missedTurns: number;
  agentTurnsObserved: number;
}

function emptySnapshot(): DiagnosticsSnapshot {
  return {
    dingsFromTool: 0,
    dingsFromTerminal: 0,
    dingsFromHook: 0,
    dingsSuppressedByCooldown: 0,
    dingsSuppressedByModeGate: 0,
    dingsSuppressedDisabled: 0,
    holdStartsFromTool: 0,
    holdStartsFromTerminal: 0,
    holdStartsFromHook: 0,
    holdStopsFromTool: 0,
    holdStopsFromTerminal: 0,
    holdStopsFromHook: 0,
    terminalSignalsRejectedByEditBurst: 0,
    missedTurns: 0,
    agentTurnsObserved: 0,
  };
}

export interface EnvironmentSnapshot {
  ideName: string;
  ideVersion: string;
  advancedMode: boolean;
  vsCodeHooksInstalled: boolean;
  cursorHooksInstalled: boolean;
  bridgeOwner: boolean;
  bridgeRunning: boolean;
}

export class Diagnostics {
  private snapshot: DiagnosticsSnapshot = emptySnapshot();

  reset(): void {
    this.snapshot = emptySnapshot();
  }

  getSnapshot(): DiagnosticsSnapshot {
    return { ...this.snapshot };
  }

  recordDingPlayed(source: 'tool' | 'terminal' | 'hook'): void {
    switch (source) {
      case 'tool':
        this.snapshot.dingsFromTool++;
        break;
      case 'terminal':
        this.snapshot.dingsFromTerminal++;
        break;
      case 'hook':
        this.snapshot.dingsFromHook++;
        break;
      default: {
        const _exhaustive: never = source;
        return _exhaustive;
      }
    }
    this.snapshot.agentTurnsObserved++;
  }

  recordDingSuppressed(reason: 'cooldown' | 'gated' | 'disabled'): void {
    switch (reason) {
      case 'cooldown':
        this.snapshot.dingsSuppressedByCooldown++;
        break;
      case 'gated':
        this.snapshot.dingsSuppressedByModeGate++;
        break;
      case 'disabled':
        this.snapshot.dingsSuppressedDisabled++;
        break;
      default: {
        const _exhaustive: never = reason;
        return _exhaustive;
      }
    }
  }

  recordHoldStart(source: 'tool' | 'terminal' | 'hook'): void {
    switch (source) {
      case 'tool':
        this.snapshot.holdStartsFromTool++;
        break;
      case 'terminal':
        this.snapshot.holdStartsFromTerminal++;
        break;
      case 'hook':
        this.snapshot.holdStartsFromHook++;
        break;
      default: {
        const _exhaustive: never = source;
        return _exhaustive;
      }
    }
    this.snapshot.agentTurnsObserved++;
  }

  recordHoldStop(source: 'tool' | 'terminal' | 'hook'): void {
    switch (source) {
      case 'tool':
        this.snapshot.holdStopsFromTool++;
        break;
      case 'terminal':
        this.snapshot.holdStopsFromTerminal++;
        break;
      case 'hook':
        this.snapshot.holdStopsFromHook++;
        break;
      default: {
        const _exhaustive: never = source;
        return _exhaustive;
      }
    }
  }

  recordTerminalRejectedByEditBurst(): void {
    this.snapshot.terminalSignalsRejectedByEditBurst++;
  }

  recordMissedTurn(): void {
    this.snapshot.missedTurns++;
  }

  formatReport(env?: EnvironmentSnapshot): string {
    const s = this.snapshot;
    const totalDings = s.dingsFromTool + s.dingsFromTerminal + s.dingsFromHook;
    const missRate =
      s.agentTurnsObserved > 0
        ? ((s.missedTurns / s.agentTurnsObserved) * 100).toFixed(1)
        : 'n/a';

    const envLines = env
      ? [
          'Environment:',
          `  IDE:              ${env.ideName} ${env.ideVersion}`,
          `  advancedMode:     ${env.advancedMode}`,
          `  VS Code hooks:    ${env.vsCodeHooksInstalled ? 'installed' : 'not installed'}`,
          `  Cursor hooks:     ${env.cursorHooksInstalled ? 'installed' : 'not installed'}`,
          `  Bridge:           ${env.bridgeOwner ? 'owner' : env.bridgeRunning ? 'running' : 'not running here'}`,
          '',
        ]
      : [];

    return [
      'Elevator Music — Session Diagnostics (local only)',
      '',
      ...envLines,
      'Dings played:',
      `  from tool:     ${s.dingsFromTool}`,
      `  from terminal: ${s.dingsFromTerminal}`,
      `  from hook:     ${s.dingsFromHook}`,
      `  total:         ${totalDings}`,
      '',
      'Dings suppressed:',
      `  cooldown:   ${s.dingsSuppressedByCooldown}`,
      `  mode gate:  ${s.dingsSuppressedByModeGate}`,
      `  disabled:   ${s.dingsSuppressedDisabled}`,
      '',
      'Hold music starts:',
      `  from tool:     ${s.holdStartsFromTool}`,
      `  from terminal: ${s.holdStartsFromTerminal}`,
      `  from hook:     ${s.holdStartsFromHook}`,
      '',
      'Hold music stops:',
      `  from tool:     ${s.holdStopsFromTool}`,
      `  from terminal: ${s.holdStopsFromTerminal}`,
      `  from hook:     ${s.holdStopsFromHook}`,
      '',
      'Terminal heuristic:',
      `  rejected (no edit burst): ${s.terminalSignalsRejectedByEditBurst}`,
      '',
      'Turn coverage:',
      `  agent turns observed: ${s.agentTurnsObserved}`,
      `  missed (manual mark): ${s.missedTurns}`,
      `  miss rate:            ${missRate}%`,
    ].join('\n');
  }

  async showReport(env?: EnvironmentSnapshot): Promise<void> {
    const doc = await vscode.workspace.openTextDocument({
      content: this.formatReport(env),
      language: 'plaintext',
    });
    await vscode.window.showTextDocument(doc, { preview: true });
  }
}
