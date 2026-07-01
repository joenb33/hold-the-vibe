import * as vscode from 'vscode';

export interface ElevatorMusicConfig {
  enabled: boolean;
  advancedMode: boolean;
  installHooksForAllEditors: boolean;
  terminalFallback: boolean;
  dingCooldownMs: number;
  editBurstWindowMs: number;
  editBurstMinDocuments: number;
  editBurstMinEvents: number;
  port: number;
  volume: number;
  dingPath: string;
  holdMusicPath: string;
  playOnSubagents: boolean;
}

export function getConfig(): ElevatorMusicConfig {
  const c = vscode.workspace.getConfiguration('elevatorMusic');
  return {
    enabled: c.get<boolean>('enabled', true),
    advancedMode: c.get<boolean>('advancedMode', true),
    installHooksForAllEditors: c.get<boolean>('installHooksForAllEditors', false),
    terminalFallback: c.get<boolean>('terminalFallback', true),
    dingCooldownMs: c.get<number>('dingCooldownMs', 2500),
    editBurstWindowMs: c.get<number>('editBurstWindowMs', 5000),
    editBurstMinDocuments: c.get<number>('editBurstMinDocuments', 2),
    editBurstMinEvents: c.get<number>('editBurstMinEvents', 4),
    port: c.get<number>('port', 17351),
    volume: c.get<number>('volume', 80),
    dingPath: c.get<string>('dingPath', ''),
    holdMusicPath: c.get<string>('holdMusicPath', ''),
    playOnSubagents: c.get<boolean>('playOnSubagents', true),
  };
}

export function shouldGateNotifySource(advancedMode: boolean, source: import('./types').SignalSource): boolean {
  return advancedMode && source !== 'hook';
}
