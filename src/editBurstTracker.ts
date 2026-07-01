import * as vscode from 'vscode';
import { getConfig } from './config';

interface EditEvent {
  at: number;
  uri: string;
}

export class EditBurstTracker {
  private events: EditEvent[] = [];

  constructor(private readonly disposables: vscode.Disposable[]) {
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.document.uri.scheme !== 'file') {
          return;
        }
        const count = event.contentChanges.length;
        if (count === 0) {
          return;
        }
        const now = Date.now();
        const uri = event.document.uri.toString();
        for (let i = 0; i < count; i++) {
          this.events.push({ at: now, uri });
        }
        this.prune(now);
      }),
    );
  }

  hasRecentBurst(): boolean {
    const now = Date.now();
    this.prune(now);
    const config = getConfig();
    const windowStart = now - config.editBurstWindowMs;
    const inWindow = this.events.filter((e) => e.at >= windowStart);

    const distinctUris = new Set(inWindow.map((e) => e.uri));
    if (distinctUris.size >= config.editBurstMinDocuments) {
      return true;
    }
    return inWindow.length >= config.editBurstMinEvents;
  }

  private prune(now: number): void {
    const config = getConfig();
    const windowStart = now - config.editBurstWindowMs;
    this.events = this.events.filter((e) => e.at >= windowStart);
  }
}
