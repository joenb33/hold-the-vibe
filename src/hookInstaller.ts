import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { getConfig } from './config';
import { isCursor, isVsCode } from './ideKind';

const VS_CODE_HOOK_FILE = 'elevator-music.json';
/** VS Code only loads user hook JSON from paths registered in chat.hookFilesLocations. */
const VS_CODE_HOOK_DIR_SETTING = '~/.copilot/hooks';
const CURSOR_HOOKS_DIR = 'elevator-music';
const HOOK_COMMAND_MARKER = 'elevator-music/notify-agent';
const BRIDGE_DIR = '.elevator-music';
const BRIDGE_FILE = 'bridge.json';

/** Shared bridge discovery file (works in VS Code, Cursor, and other forks). */
export function getBridgeDiscoveryPath(): string {
  return path.join(os.homedir(), BRIDGE_DIR, BRIDGE_FILE);
}

export function getVsCodeHookFilePath(): string {
  return path.join(os.homedir(), '.copilot', 'hooks', VS_CODE_HOOK_FILE);
}

export function getCursorHooksJsonPath(): string {
  return path.join(os.homedir(), '.cursor', 'hooks.json');
}

export function getCursorHookScriptsDir(): string {
  return path.join(os.homedir(), '.cursor', 'hooks', CURSOR_HOOKS_DIR);
}

export interface HookInstallStatus {
  vsCode: boolean;
  cursor: boolean;
}

export type HookTarget = 'vscode' | 'cursor';

export interface HookInstallResult {
  /** Which editor hook paths were written this call. */
  installedTargets: HookTarget[];
  status: HookInstallStatus;
}

/** Editors whose hook files installHooks will touch for this session. */
export function resolveHookInstallTargets(): HookTarget[] {
  if (getConfig().installHooksForAllEditors) {
    return ['vscode', 'cursor'];
  }
  if (isCursor()) {
    return ['cursor'];
  }
  if (isVsCode()) {
    return ['vscode'];
  }
  // Unknown VS Code fork — Copilot-style hooks only.
  return ['vscode'];
}

/**
 * Editors whose hook files uninstallHooks removes. Mirrors
 * resolveHookInstallTargets so installHooksForAllEditors is symmetric —
 * otherwise turning it on writes hooks to both editors but turning Advanced
 * Mode off again only cleans up the current one, leaving the other editor's
 * hook file and copied scripts pointing at a bridge that's no longer running.
 */
export function resolveHookUninstallTargets(): HookTarget[] {
  return resolveHookInstallTargets();
}

interface VsCodeHookEntry {
  type: string;
  command: string;
  windows?: string;
  osx?: string;
  linux?: string;
  timeout: number;
}

interface CursorHooksFile {
  version?: number;
  hooks?: Record<string, Array<{ command?: string; type?: string; timeout?: number }>>;
}

/**
 * Packaging (git checkout, vsix zip, etc. — especially when built on Windows,
 * which has no Unix executable bit at all) can silently drop the +x bit on
 * .sh files. Both hook paths invoke the script directly (not via `bash`), so
 * a missing +x bit means every hook call fails with EACCES on macOS/Linux —
 * and that failure is swallowed by the hook runner, so it fails silently.
 * Force it on every install rather than trusting the shipped artifact.
 */
function ensureExecutable(filePath: string): void {
  if (process.platform === 'win32') {
    return;
  }
  try {
    fs.chmodSync(filePath, 0o755);
  } catch {
    // Best effort — if this fails, the hook invocation will surface it.
  }
}

function copyHookScripts(targetDir: string, extensionPath: string): void {
  fs.mkdirSync(targetDir, { recursive: true });
  for (const file of ['notify-agent.ps1', 'notify-agent.sh']) {
    const dest = path.join(targetDir, file);
    fs.copyFileSync(path.join(extensionPath, 'hooks', file), dest);
    if (file.endsWith('.sh')) {
      ensureExecutable(dest);
    }
  }
}

function buildVsCodeHookEntry(extensionPath: string, action: string): VsCodeHookEntry {
  const psScript = path.join(extensionPath, 'hooks', 'notify-agent.ps1');
  const shScript = path.join(extensionPath, 'hooks', 'notify-agent.sh');
  const psCmd = `powershell -NoProfile -ExecutionPolicy Bypass -File "${psScript}" ${action}`;
  return {
    type: 'command',
    command: psCmd,
    windows: psCmd,
    osx: `"${shScript}" ${action}`,
    linux: `"${shScript}" ${action}`,
    timeout: 5,
  };
}

export interface VsCodeHooksFile {
  version: number;
  hooks: Record<string, ReturnType<typeof buildVsCodeHookEntry>[]>;
}

/** Build the VS Code / Copilot hook JSON written to ~/.copilot/hooks/. */
export function buildVsCodeHooksFile(extensionPath: string): VsCodeHooksFile {
  const hookEntry = (action: string) => buildVsCodeHookEntry(extensionPath, action);
  const playOnSubagents = getConfig().playOnSubagents;

  const hooks: VsCodeHooksFile['hooks'] = {
    UserPromptSubmit: [hookEntry('start')],
    Stop: [hookEntry('stop-force')],
  };
  if (playOnSubagents) {
    hooks.SubagentStart = [hookEntry('start')];
    hooks.SubagentStop = [hookEntry('stop')];
  }

  return { version: 1, hooks };
}

/**
 * VS Code does not load ~/.copilot/hooks unless that folder is enabled in
 * chat.hookFilesLocations (see microsoft/vscode#296793). Register it when we
 * install user-level hooks so agent events actually reach the bridge.
 */
export async function ensureVsCodeHookDiscovery(): Promise<boolean> {
  const chatConfig = vscode.workspace.getConfiguration('chat');
  const locations = chatConfig.get<Record<string, boolean>>('hookFilesLocations') ?? {};
  if (locations[VS_CODE_HOOK_DIR_SETTING]) {
    return false;
  }

  await chatConfig.update(
    'hookFilesLocations',
    { ...locations, [VS_CODE_HOOK_DIR_SETTING]: true },
    vscode.ConfigurationTarget.Global,
  );
  return true;
}

function buildCursorHookCommand(action: string): string {
  const scriptDir = getCursorHookScriptsDir();
  if (process.platform === 'win32') {
    const psScript = path.join(scriptDir, 'notify-agent.ps1');
    return `powershell -NoProfile -ExecutionPolicy Bypass -File "${psScript}" ${action}`;
  }
  const shScript = path.join(scriptDir, 'notify-agent.sh').replace(/\\/g, '/');
  return `"${shScript}" ${action}`;
}

function buildCursorHookEntry(action: string): { command: string; timeout: number } {
  return { command: buildCursorHookCommand(action), timeout: 5 };
}

export function isElevatorMusicHook(command: string | undefined): boolean {
  if (typeof command !== 'string') {
    return false;
  }
  // Windows hook commands use backslashes; normalize before matching.
  const normalized = command.replace(/\\/g, '/');
  return normalized.includes(HOOK_COMMAND_MARKER);
}

function readCursorHooksFile(): CursorHooksFile {
  const filePath = getCursorHooksJsonPath();
  if (!fs.existsSync(filePath)) {
    return { version: 1, hooks: {} };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as CursorHooksFile;
    if (!parsed.hooks || typeof parsed.hooks !== 'object') {
      return { version: parsed.version ?? 1, hooks: {} };
    }
    return parsed;
  } catch {
    return { version: 1, hooks: {} };
  }
}

function removeElevatorMusicFromCursorHooks(config: CursorHooksFile): CursorHooksFile {
  const hooks = config.hooks ?? {};
  const next: CursorHooksFile['hooks'] = {};
  for (const [event, entries] of Object.entries(hooks)) {
    const filtered = (entries ?? []).filter((e) => !isElevatorMusicHook(e.command));
    if (filtered.length > 0) {
      next[event] = filtered;
    }
  }
  return { version: config.version ?? 1, hooks: next };
}

function appendUniqueHook(
  hooks: CursorHooksFile['hooks'],
  event: string,
  entry: { command: string; timeout: number },
): void {
  if (!hooks) {
    return;
  }
  const list = hooks[event] ?? [];
  if (list.some((e) => e.command === entry.command)) {
    return;
  }
  list.push(entry);
  hooks[event] = list;
}

export async function installVsCodeHooks(extensionPath: string): Promise<void> {
  await ensureVsCodeHookDiscovery();

  const hooksDir = path.dirname(getVsCodeHookFilePath());
  fs.mkdirSync(hooksDir, { recursive: true });

  // This path references the extension's own bundled script in place (no
  // copy), so make sure that copy is executable too.
  ensureExecutable(path.join(extensionPath, 'hooks', 'notify-agent.sh'));

  const config = buildVsCodeHooksFile(extensionPath);

  fs.writeFileSync(getVsCodeHookFilePath(), JSON.stringify(config, null, 2), 'utf8');
}

export function installCursorHooks(extensionPath: string): void {
  copyHookScripts(getCursorHookScriptsDir(), extensionPath);

  const config = readCursorHooksFile();
  const cleaned = removeElevatorMusicFromCursorHooks(config);
  const hooks = cleaned.hooks ?? {};
  const playOnSubagents = getConfig().playOnSubagents;

  // Cursor event names (see Cursor hooks docs).
  appendUniqueHook(hooks, 'beforeSubmitPrompt', buildCursorHookEntry('start'));
  appendUniqueHook(hooks, 'stop', buildCursorHookEntry('stop-force'));
  if (playOnSubagents) {
    appendUniqueHook(hooks, 'subagentStart', buildCursorHookEntry('start'));
    appendUniqueHook(hooks, 'subagentStop', buildCursorHookEntry('stop'));
  }

  const out: CursorHooksFile = { version: cleaned.version ?? 1, hooks };
  fs.mkdirSync(path.dirname(getCursorHooksJsonPath()), { recursive: true });
  fs.writeFileSync(getCursorHooksJsonPath(), JSON.stringify(out, null, 2), 'utf8');
}

/** Install hooks for the current editor, or both if installHooksForAllEditors is set. */
export async function installHooks(extensionPath: string): Promise<HookInstallResult> {
  const targets = resolveHookInstallTargets();
  if (targets.includes('vscode')) {
    await installVsCodeHooks(extensionPath);
  }
  if (targets.includes('cursor')) {
    installCursorHooks(extensionPath);
  }
  return { installedTargets: targets, status: getHookInstallStatus() };
}

export function uninstallHooksForTargets(targets: HookTarget[]): void {
  if (targets.includes('vscode')) {
    uninstallVsCodeHooks();
  }
  if (targets.includes('cursor')) {
    uninstallCursorHooks();
  }
}

/** Remove hooks for the current editor only — never touches the other IDE's files. */
export function uninstallHooks(): void {
  uninstallHooksForTargets(resolveHookUninstallTargets());
}

export function uninstallVsCodeHooks(): void {
  const filePath = getVsCodeHookFilePath();
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

export function uninstallCursorHooks(): void {
  const filePath = getCursorHooksJsonPath();
  if (!fs.existsSync(filePath)) {
    return;
  }
  const config = readCursorHooksFile();
  const cleaned = removeElevatorMusicFromCursorHooks(config);
  const hasHooks = cleaned.hooks && Object.keys(cleaned.hooks).length > 0;
  if (hasHooks) {
    fs.writeFileSync(getCursorHooksJsonPath(), JSON.stringify(cleaned, null, 2), 'utf8');
  } else {
    fs.unlinkSync(filePath);
  }
  const scriptsDir = getCursorHookScriptsDir();
  if (fs.existsSync(scriptsDir)) {
    fs.rmSync(scriptsDir, { recursive: true, force: true });
  }
}

export function getHookInstallStatus(): HookInstallStatus {
  return {
    vsCode: fs.existsSync(getVsCodeHookFilePath()),
    cursor: cursorHooksInstalled(),
  };
}

function cursorHooksInstalled(): boolean {
  if (!fs.existsSync(getCursorHooksJsonPath())) {
    return false;
  }
  try {
    const config = readCursorHooksFile();
    for (const entries of Object.values(config.hooks ?? {})) {
      if ((entries ?? []).some((e) => isElevatorMusicHook(e.command))) {
        return true;
      }
    }
  } catch {
    return false;
  }
  return false;
}

/** True if hooks are installed for the current IDE, or any target if both missing context. */
export function hooksInstalledForCurrentIde(): boolean {
  const status = getHookInstallStatus();
  if (isCursor()) {
    return status.cursor;
  }
  if (isVsCode()) {
    return status.vsCode;
  }
  return status.vsCode || status.cursor;
}

/** @deprecated Use hooksInstalledForCurrentIde or getHookInstallStatus */
export function hooksInstalled(): boolean {
  return hooksInstalledForCurrentIde();
}

/** Refresh hook scripts and action mappings when the extension updates. */
export async function refreshInstalledHooks(extensionPath: string): Promise<void> {
  const status = getHookInstallStatus();
  if (status.vsCode) {
    await installVsCodeHooks(extensionPath);
  }
  if (status.cursor) {
    installCursorHooks(extensionPath);
  }
}

/** @deprecated Use refreshInstalledHooks */
export function syncCursorHookScripts(extensionPath: string): void {
  refreshInstalledHooks(extensionPath);
}

export async function setAdvancedModeEnabled(enabled: boolean): Promise<void> {
  const config = vscode.workspace.getConfiguration('elevatorMusic');
  await config.update('advancedMode', enabled, vscode.ConfigurationTarget.Global);
}

export function formatHookInstallSummary(result: HookInstallResult): string {
  const labels: Record<HookTarget, string> = {
    vscode: 'VS Code (~/.copilot/hooks/)',
    cursor: 'Cursor (~/.cursor/hooks.json)',
  };
  if (result.installedTargets.length === 0) {
    return 'none';
  }
  return result.installedTargets.map((t) => labels[t]).join(' and ');
}

export function formatHookTargetLabel(target: HookTarget): string {
  switch (target) {
    case 'vscode':
      return 'VS Code';
    case 'cursor':
      return 'Cursor';
    default: {
      const _exhaustive: never = target;
      return _exhaustive;
    }
  }
}
