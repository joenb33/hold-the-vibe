import * as vscode from 'vscode';
import type { MusicController } from './musicController';
import { TOOL_NOTIFY_COMPLETE, TOOL_NOTIFY_STARTING } from './types';

class NotifyTaskCompleteTool implements vscode.LanguageModelTool<Record<string, never>> {
  constructor(private readonly musicController: MusicController) {}

  async prepareInvocation(): Promise<vscode.PreparedToolInvocation> {
    return {
      invocationMessage: 'Playing completion ding…',
      confirmationMessages: {
        title: 'Elevator Music',
        message: 'Play a short completion sound? This tool only plays audio — no files or settings are changed.',
      },
    };
  }

  async invoke(
    _options: vscode.LanguageModelToolInvocationOptions<Record<string, never>>,
    _token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    this.musicController.requestActivityStop('tool');
    return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart('Completion ding played.')]);
  }
}

class NotifyTaskStartingTool implements vscode.LanguageModelTool<Record<string, never>> {
  constructor(private readonly musicController: MusicController) {}

  async prepareInvocation(): Promise<vscode.PreparedToolInvocation> {
    return {
      invocationMessage: 'Starting hold music…',
      confirmationMessages: {
        title: 'Elevator Music',
        message: 'Start hold music while work is in progress? This tool only plays audio.',
      },
    };
  }

  async invoke(
    _options: vscode.LanguageModelToolInvocationOptions<Record<string, never>>,
    _token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    this.musicController.requestActivityStart('tool');
    return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart('Hold music started.')]);
  }
}

export function registerNotifyTools(
  musicController: MusicController,
  disposables: vscode.Disposable[],
): void {
  if (!vscode.lm?.registerTool) {
    console.warn('[Elevator Music] Language Model Tool API not available in this VS Code version.');
    return;
  }

  disposables.push(
    vscode.lm.registerTool(TOOL_NOTIFY_COMPLETE, new NotifyTaskCompleteTool(musicController)),
    vscode.lm.registerTool(TOOL_NOTIFY_STARTING, new NotifyTaskStartingTool(musicController)),
  );
}
