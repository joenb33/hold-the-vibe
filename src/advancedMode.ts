import * as vscode from 'vscode';
import { isCursor } from './ideKind';
import { MIN_VSCODE_VERSION_ADVANCED } from './types';

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da > db) {
      return 1;
    }
    if (da < db) {
      return -1;
    }
  }
  return 0;
}

export function isAdvancedModeSupported(): boolean {
  // Cursor ships its own agent hooks; no VS Code 1.109 floor applies.
  if (isCursor()) {
    return true;
  }
  return compareVersions(vscode.version, MIN_VSCODE_VERSION_ADVANCED) >= 0;
}

export async function ensureAdvancedModeSupported(): Promise<boolean> {
  if (isAdvancedModeSupported()) {
    return true;
  }
  await vscode.window.showErrorMessage(
    `Advanced Mode requires VS Code ${MIN_VSCODE_VERSION_ADVANCED} or newer (or Cursor). You are on ${vscode.env.appName} ${vscode.version}.`,
  );
  return false;
}
