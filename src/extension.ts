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
  refreshInstalledHooks,
  uninstallHooks,
} from './hookInstaller';
import { getIdeDisplayName, isCursor } from './ideKind';
import { MIN_VSCODE_VERSION_ADVANCED } from './types';
import { MusicController } from './musicController';
import { registerNotifyTools } from './notifyTools';
import { SoundPlayer } from './soundPlayer';
import { TerminalSignals } from './terminalSignals';

let statusBarItem: vscode.StatusBarItem | undefined;
let terminalSignals: TerminalSignals | undefined;
let hookBridge: HookBridge | undefined;
let soundPlayer: SoundPlayer | undefined;
let statusPollTimer: ReturnType<typeof setInterval> | undefined;
let musicController: MusicController | undefined;
let outputChannel: vscode.OutputChannel | undefined;

async function reconcileUnsupportedAdvancedMode(context: vscode.ExtensionContext): Promise<void> {
  const config = getConfig();
  if (!config.advancedMode || isAdvancedModeSupported()) {
    return;
  }

  await setAdvancedModeEnabled(false);
  const warnedKey = 'elevatorMusic.unsupportedAdvancedModeNotified';
  if (context.globalState.get<boolean>(warnedKey)) {
    return;
  }
  await context.globalState.update(warnedKey, true);

  const choice = await vscode.window.showWarningMessage(
    `Elevator Music: Advanced Mode needs VS Code ${MIN_VSCODE_VERSION_ADVANCED}+ (you have ${vscode.version}). Switched to Notify Mode until you upgrade.`,
    'Open settings',
    'OK',
  );
  if (choice === 'Open settings') {
    await vscode.commands.executeCommand('workbench.action.openSettings', 'elevatorMusic.advancedMode');
  }
}

async function promptReloadIfNeeded(
  context: vscode.ExtensionContext,
  reason: 'first-install' | 'hook-discovery',
): Promise<void> {
  const reloadPromptKey = 'elevatorMusic.advancedModeReloadPrompted';
  if (context.globalState.get<boolean>(reloadPromptKey)) {
    return;
  }
  await context.globalState.update(reloadPromptKey, true);

  const detail =
    reason === 'hook-discovery'
      ? 'VS Code needs a reload to load ~/.copilot/hooks.'
      : `${getIdeDisplayName()} needs a reload to pick up the new hooks.`;
  const choice = await vscode.window.showInformationMessage(
    `Elevator Music: Advanced Mode hooks updated. Reload this window once. ${detail}`,
    'Reload now',
    'Later',
  );
  if (choice === 'Reload now') {
    await vscode.commands.executeCommand('workbench.action.reloadWindow');
  }
}

async function reconcileAdvancedMode(context: vscode.ExtensionContext): Promise<void> {
  await reconcileUnsupportedAdvancedMode(context);

  const config = getConfig();
  if (!config.advancedMode || !isAdvancedModeSupported()) {
    return;
  }

  const alreadyInstalled = hooksInstalledForCurrentIde();
  let vsCodeDiscoveryRegistered = false;
  if (!alreadyInstalled) {
    const result = await installHooks(context.extensionPath);
    outputChannel?.appendLine(`Installed hooks: ${formatHookInstallSummary(result)}`);
    vsCodeDiscoveryRegistered = result.vsCodeDiscoveryRegistered;
  } else {
    vsCodeDiscoveryRegistered = await refreshInstalledHooks(context.extensionPath);
  }

  if (hookBridge) {
    await hookBridge.start().catch((err) => {
      outputChannel?.appendLine(`Bridge start failed: ${String(err)}`);
      console.warn('[Elevator Music] Failed to start hook bridge:', err);
    });
  }

  if (!hooksInstalledForCurrentIde()) {
    return;
  }
  if (!alreadyInstalled) {
    await promptReloadIfNeeded(context, 'first-install');
  } else if (vsCodeDiscoveryRegistered) {
    await promptReloadIfNeeded(context, 'hook-discovery');
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
  soundPlayer.cleanupOrphanedLoop();
  const dingCoordinator = new DingCoordinator(soundPlayer, diagnostics);
  musicController = new MusicController(soundPlayer, dingCoordinator, diagnostics);

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
    if (musicController?.isPlaying()) {
      statusBarItem.text = '$(debug-stop) Hold music…';
      statusBarItem.tooltip =
        'Hold music is playing. Click for menu — choose Stop hold music, or run "Elevator Music: Stop Hold Music" from the Command Palette.';
    } else if (!config.enabled) {
      statusBarItem.text = '$(mute) Elevator Music';
      statusBarItem.tooltip = 'Elevator Music is disabled. Click to open menu.';
    } else if (config.advancedMode) {
      if (!hooksInstalledForCurrentIde()) {
        statusBarItem.text = '$(warning) Advanced (no hooks)';
      } else if (hookBridge && !hookBridge.connected) {
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

  const runHoldWatchdog = (): void => {
    if (musicController?.checkHoldWatchdog()) {
      const maxMin = getConfig().maxHoldMinutes;
      outputChannel?.appendLine(`Auto-stopped hold music after ${maxMin} minutes (maxHoldMinutes).`);
      void vscode.window.showWarningMessage(
        `Elevator Music stopped automatically after ${maxMin} minutes.`,
      );
      refreshStatusBar();
    }
  };

  refreshStatusBar();
  statusPollTimer = setInterval(() => {
    runHoldWatchdog();
    const config = getConfig();
    if (config.advancedMode && config.enabled && hookBridge && hooksInstalledForCurrentIde()) {
      void hookBridge.ensureAvailable().catch(() => undefined);
    }
    refreshStatusBar();
  }, 2000);
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

      if (e.affectsConfiguration('elevatorMusic.advancedMode')) {
        await reconcileUnsupportedAdvancedMode(context);
        if (hookBridge) {
          const advancedNow = getConfig().advancedMode;
          if (advancedNow && isAdvancedModeSupported()) {
            if (!hooksInstalledForCurrentIde()) {
              await installHooks(context.extensionPath);
            } else {
              await refreshInstalledHooks(context.extensionPath);
            }
            await hookBridge.start().catch((err) =>
              console.warn('[Elevator Music] Failed to start bridge on config change:', err),
            );
          } else if (!advancedNow) {
            await hookBridge.disableEverywhere().catch(() => undefined);
          }
        }
      } else if (
        getConfig().advancedMode &&
        isAdvancedModeSupported() &&
        (e.affectsConfiguration('elevatorMusic.playOnSubagents') ||
          e.affectsConfiguration('elevatorMusic.installHooksForAllEditors'))
      ) {
        await refreshInstalledHooks(context.extensionPath);
      }

      if (e.affectsConfiguration('elevatorMusic.enabled') && !getConfig().enabled) {
        musicController?.emergencyStop();
      }
      refreshStatusBar();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('elevatorMusic.statusBarMenu', async () => {
      const config = getConfig();
      type MenuId = 'stopMusic' | 'toggle' | 'ding' | 'hold' | 'diag' | 'advanced' | 'settings';
      const items: Array<{ label: string; id: MenuId }> = [];
      if (musicController?.isPlaying()) {
        items.push({ label: '$(debug-stop) Stop hold music now', id: 'stopMusic' });
      }
      items.push(
        { label: config.enabled ? '$(mute) Disable sounds' : '$(unmute) Enable sounds', id: 'toggle' },
        { label: '$(bell) Test ding', id: 'ding' },
        { label: '$(music) Test hold music (3s)', id: 'hold' },
        { label: '$(graph) Show diagnostics', id: 'diag' },
        {
          label: config.advancedMode ? '$(arrow-left) Disable Advanced Mode' : '$(sparkle) Enable Advanced Mode',
          id: 'advanced',
        },
        { label: '$(settings-gear) Open settings', id: 'settings' },
      );
      const pick = await vscode.window.showQuickPick(items, { placeHolder: 'Elevator Music' });
      if (!pick) {
        return;
      }
      switch (pick.id) {
        case 'stopMusic':
          await vscode.commands.executeCommand('elevatorMusic.stopMusic');
          break;
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
        bridgeRunning: hookBridge?.connected ?? false,
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

    vscode.commands.registerCommand('elevatorMusic.stopMusic', () => {
      const stopped = musicController?.emergencyStop() ?? false;
      outputChannel?.appendLine(stopped ? 'Hold music stopped manually (failsafe).' : 'Stop hold music: nothing was playing.');
      void vscode.window.showInformationMessage(
        stopped ? 'Elevator Music: hold music stopped.' : 'Elevator Music: no hold music was playing.',
      );
      refreshStatusBar();
    }),

    vscode.commands.registerCommand('elevatorMusic.openSettings', () => {
      void vscode.commands.executeCommand('workbench.action.openSettings', 'elevatorMusic');
    }),

    vscode.commands.registerCommand('elevatorMusic.enableAdvancedMode', async () => {
      if (!(await ensureAdvancedModeSupported())) {
        return;
      }
      const status = await installHooks(context.extensionPath);
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
  musicController?.forceStopAll();
  await hookBridge?.stop();
}
