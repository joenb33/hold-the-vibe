import * as vscode from 'vscode';
import { ensureAdvancedModeSupported, isAdvancedModeSupported } from './advancedMode';
import { getConfig } from './config';
import { Diagnostics } from './diagnostics';
import { DingCoordinator } from './dingCoordinator';
import { EditBurstTracker } from './editBurstTracker';
import { HookBridge } from './hookBridge';
import {
  formatHookInstallSummary,
  formatHookTargetLabel,
  getHookInstallStatus,
  hooksInstalledForCurrentIde,
  installHooks,
  resolveHookUninstallTargets,
  setAdvancedModeEnabled,
  syncCursorHookScripts,
  uninstallHooks,
} from './hookInstaller';
import { getIdeDisplayName, isCursor } from './ideKind';
import { MusicController } from './musicController';
import { registerNotifyTools } from './notifyTools';
import { SoundPlayer } from './soundPlayer';
import { TerminalSignals } from './terminalSignals';

let statusBarItem: vscode.StatusBarItem | undefined;
let terminalSignals: TerminalSignals | undefined;
let hookBridge: HookBridge | undefined;
let soundPlayer: SoundPlayer | undefined;
let statusPollTimer: ReturnType<typeof setInterval> | undefined;
let outputChannel: vscode.OutputChannel | undefined;

async function reconcileAdvancedMode(context: vscode.ExtensionContext): Promise<void> {
  const config = getConfig();
  if (!config.advancedMode || !isAdvancedModeSupported()) {
    return;
  }

  const alreadyInstalled = hooksInstalledForCurrentIde();
  if (!alreadyInstalled) {
    const result = installHooks(context.extensionPath);
    outputChannel?.appendLine(`Installed hooks: ${formatHookInstallSummary(result)}`);
  } else {
    syncCursorHookScripts(context.extensionPath);
  }

  if (hookBridge) {
    await hookBridge.start().catch((err) => {
      outputChannel?.appendLine(`Bridge start failed: ${String(err)}`);
      console.warn('[Elevator Music] Failed to start hook bridge:', err);
    });
  }

  const reloadPromptKey = 'elevatorMusic.advancedModeReloadPrompted';
  const needsReloadPrompt =
    !alreadyInstalled && hooksInstalledForCurrentIde() && !context.globalState.get<boolean>(reloadPromptKey);

  if (needsReloadPrompt) {
    await context.globalState.update(reloadPromptKey, true);
    const choice = await vscode.window.showInformationMessage(
      'Elevator Music: Advanced Mode hooks installed. Reload this window once so Cursor picks them up.',
      'Reload now',
      'Later',
    );
    if (choice === 'Reload now') {
      await vscode.commands.executeCommand('workbench.action.reloadWindow');
    }
  }
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  outputChannel = vscode.window.createOutputChannel('Elevator Music');
  context.subscriptions.push(outputChannel);
  outputChannel.appendLine(
    `Activating in ${getIdeDisplayName()} ${vscode.version} (mode: ${context.extensionMode === vscode.ExtensionMode.Development ? 'development' : 'installed'})`,
  );

  const disposables: vscode.Disposable[] = [];
  context.subscriptions.push({ dispose: () => disposables.forEach((d) => d.dispose()) });

  const diagnostics = new Diagnostics();
  soundPlayer = new SoundPlayer(context);
  const dingCoordinator = new DingCoordinator(soundPlayer, diagnostics);
  const musicController = new MusicController(soundPlayer, dingCoordinator, diagnostics);

  const editBurstTracker = new EditBurstTracker(disposables);
  terminalSignals = new TerminalSignals(musicController, editBurstTracker, diagnostics, disposables);
  registerNotifyTools(musicController, disposables);

  hookBridge = new HookBridge(musicController, context);
  await reconcileAdvancedMode(context);

  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 1000);
  statusBarItem.command = 'elevatorMusic.statusBarMenu';
  disposables.push(statusBarItem);

  const refreshStatusBar = (): void => {
    if (!statusBarItem) {
      return;
    }
    const config = getConfig();
    if (!config.enabled) {
      statusBarItem.text = '$(mute) Elevator Music';
      statusBarItem.tooltip = 'Elevator Music is disabled. Click to open menu.';
    } else if (config.advancedMode) {
      if (musicController.isPlaying()) {
        statusBarItem.text = '$(music) Agent working…';
      } else if (!hooksInstalledForCurrentIde()) {
        statusBarItem.text = '$(warning) Advanced (no hooks)';
      } else if (hookBridge && !hookBridge.owner && !hookBridge.running) {
        statusBarItem.text = '$(warning) Bridge unreachable';
      } else {
        statusBarItem.text = isCursor() ? '$(music) Advanced (Cursor)' : '$(music) Advanced Mode';
      }
      statusBarItem.tooltip = `Advanced Mode in ${getIdeDisplayName()} — guaranteed hold music via agent hooks.`;
    } else {
      statusBarItem.text = '$(bell) Notify Mode';
      statusBarItem.tooltip = 'Notify Mode — best-effort ding and hold music.';
    }
    statusBarItem.show();
  };

  refreshStatusBar();
  statusPollTimer = setInterval(refreshStatusBar, 2000);
  disposables.push({ dispose: () => clearInterval(statusPollTimer) });

  if (context.extensionMode === vscode.ExtensionMode.Development) {
    outputChannel.appendLine(
      `Ready. Advanced Mode: ${getConfig().advancedMode}. Hooks: ${hooksInstalledForCurrentIde() ? 'installed' : 'missing'}. Look for the status bar item on the bottom-right.`,
    );
  }

  disposables.push(
    vscode.workspace.onDidChangeConfiguration(async (e) => {
      if (!e.affectsConfiguration('elevatorMusic')) {
        return;
      }
      // Reconcile the bridge if advancedMode was toggled directly in settings.json
      // (rather than via the Enable/Disable commands), so detection recovers.
      if (e.affectsConfiguration('elevatorMusic.advancedMode') && hookBridge) {
        const advancedNow = getConfig().advancedMode;
        if (advancedNow && !hookBridge.running) {
          if (isAdvancedModeSupported()) {
            if (!hooksInstalledForCurrentIde()) {
              installHooks(context.extensionPath);
            } else {
              syncCursorHookScripts(context.extensionPath);
            }
            await hookBridge.start().catch((err) =>
              console.warn('[Elevator Music] Failed to start bridge on config change:', err),
            );
          }
        } else if (!advancedNow) {
          await hookBridge.disableEverywhere().catch(() => undefined);
        }
      }
      refreshStatusBar();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('elevatorMusic.statusBarMenu', async () => {
      const config = getConfig();
      type MenuId = 'toggle' | 'ding' | 'hold' | 'diag' | 'advanced' | 'settings';
      const pick = await vscode.window.showQuickPick<{ label: string; id: MenuId }>(
        [
          { label: config.enabled ? '$(mute) Disable sounds' : '$(unmute) Enable sounds', id: 'toggle' as const },
          { label: '$(bell) Test ding', id: 'ding' as const },
          { label: '$(music) Test hold music (3s)', id: 'hold' as const },
          { label: '$(graph) Show diagnostics', id: 'diag' as const },
          {
            label: config.advancedMode ? '$(arrow-left) Disable Advanced Mode' : '$(sparkle) Enable Advanced Mode',
            id: 'advanced' as const,
          },
          { label: '$(settings-gear) Open settings', id: 'settings' as const },
        ],
        { placeHolder: 'Elevator Music' },
      );
      if (!pick) {
        return;
      }
      switch (pick.id) {
        case 'toggle':
          await vscode.commands.executeCommand('elevatorMusic.toggleEnabled');
          break;
        case 'ding':
          await vscode.commands.executeCommand('elevatorMusic.testDing');
          break;
        case 'hold':
          await vscode.commands.executeCommand('elevatorMusic.testHoldMusic');
          break;
        case 'diag':
          await vscode.commands.executeCommand('elevatorMusic.showDiagnostics');
          break;
        case 'advanced':
          if (config.advancedMode) {
            await vscode.commands.executeCommand('elevatorMusic.disableAdvancedMode');
          } else {
            await vscode.commands.executeCommand('elevatorMusic.enableAdvancedMode');
          }
          break;
        case 'settings':
          await vscode.commands.executeCommand('elevatorMusic.openSettings');
          break;
        default: {
          const _exhaustive: never = pick.id;
          return _exhaustive;
        }
      }
      refreshStatusBar();
    }),

    vscode.commands.registerCommand('elevatorMusic.toggleEnabled', async () => {
      const config = vscode.workspace.getConfiguration('elevatorMusic');
      const current = config.get<boolean>('enabled', true);
      await config.update('enabled', !current, vscode.ConfigurationTarget.Global);
      refreshStatusBar();
    }),

    vscode.commands.registerCommand('elevatorMusic.testDing', () => {
      soundPlayer?.playDing();
    }),

    vscode.commands.registerCommand('elevatorMusic.testHoldMusic', () => {
      soundPlayer?.startHoldLoop();
      setTimeout(() => soundPlayer?.stopHoldLoop(), 3000);
    }),

    vscode.commands.registerCommand('elevatorMusic.showDiagnostics', () => {
      const status = getHookInstallStatus();
      return diagnostics.showReport({
        ideName: getIdeDisplayName(),
        ideVersion: vscode.version,
        advancedMode: getConfig().advancedMode,
        vsCodeHooksInstalled: status.vsCode,
        cursorHooksInstalled: status.cursor,
        bridgeOwner: hookBridge?.owner ?? false,
        bridgeRunning: hookBridge?.running ?? false,
      });
    }),

    vscode.commands.registerCommand('elevatorMusic.resetDiagnostics', () => {
      diagnostics.reset();
      void vscode.window.showInformationMessage('Elevator Music diagnostics reset.');
    }),

    vscode.commands.registerCommand('elevatorMusic.markLastTurnMissed', () => {
      diagnostics.recordMissedTurn();
      void vscode.window.showInformationMessage('Marked last turn as missed in diagnostics.');
    }),

    vscode.commands.registerCommand('elevatorMusic.openSettings', () => {
      void vscode.commands.executeCommand('workbench.action.openSettings', 'elevatorMusic');
    }),

    vscode.commands.registerCommand('elevatorMusic.enableAdvancedMode', async () => {
      if (!(await ensureAdvancedModeSupported())) {
        return;
      }
      const status = installHooks(context.extensionPath);
      await setAdvancedModeEnabled(true);
      await hookBridge?.start();
      void vscode.window.showInformationMessage(
        `Advanced Mode enabled in ${getIdeDisplayName()}. Reload the window, then run an agent task. Hooks: ${formatHookInstallSummary(status)}.`,
      );
      refreshStatusBar();
    }),

    vscode.commands.registerCommand('elevatorMusic.disableAdvancedMode', async () => {
      const removed = resolveHookUninstallTargets().map(formatHookTargetLabel).join(' and ');
      uninstallHooks();
      await setAdvancedModeEnabled(false);
      await hookBridge?.disableEverywhere();
      void vscode.window.showInformationMessage(
        `Advanced Mode disabled. Removed hooks for ${removed} only. Notify Mode is active.`,
      );
      refreshStatusBar();
    }),
  );
}

export async function deactivate(): Promise<void> {
  if (statusPollTimer) {
    clearInterval(statusPollTimer);
    statusPollTimer = undefined;
  }
  terminalSignals?.dispose();
  // The hold-loop child process is detached + unref'd specifically so it survives
  // the extension host restarting mid-loop, but that means nothing else will ever
  // stop it if we don't do it here — otherwise it's an orphaned process looping
  // forever every time the window closes or reloads while music is playing.
  soundPlayer?.stopHoldLoop();
  await hookBridge?.stop();
}
