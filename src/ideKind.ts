import * as vscode from 'vscode';

export type IdeKind = 'cursor' | 'vscode' | 'unknown';

/** Detect the host editor (Cursor, VS Code, or other VS Code fork). */
export function getIdeKind(): IdeKind {
  const name = vscode.env.appName.toLowerCase();
  if (name.includes('cursor')) {
    return 'cursor';
  }
  if (name.includes('visual studio code') || name.includes('vscode')) {
    return 'vscode';
  }
  return 'unknown';
}

export function isCursor(): boolean {
  return getIdeKind() === 'cursor';
}

export function isVsCode(): boolean {
  return getIdeKind() === 'vscode';
}

/** Human-readable label for status messages and diagnostics. */
export function getIdeDisplayName(): string {
  switch (getIdeKind()) {
    case 'cursor':
      return 'Cursor';
    case 'vscode':
      return 'VS Code';
    default:
      return vscode.env.appName;
  }
}
