import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { getConfig } from './config';
import { getBridgeDiscoveryPath } from './hookInstaller';
import type { MusicController } from './musicController';

const LEGACY_BRIDGE_PATH = path.join(os.homedir(), '.copilot', 'elevator-music-bridge.json');

function resolveBridgeDiscoveryPaths(): string[] {
  return [getBridgeDiscoveryPath(), LEGACY_BRIDGE_PATH];
}

export interface BridgeDiscoveryFile {
  port: number;
  pid: number;
  startedAt: string;
}

export class HookBridge {
  private server: http.Server | null = null;
  private isOwner = false;
  private remoteBridge = false;
  private boundPort = 0;

  constructor(
    private readonly musicController: MusicController,
    private readonly context: vscode.ExtensionContext,
  ) {}

  get running(): boolean {
    return this.server !== null;
  }

  get owner(): boolean {
    return this.isOwner;
  }

  /** True when this window owns the bridge or a remote bridge answered /health. */
  get connected(): boolean {
    return this.server !== null || this.remoteBridge;
  }

  /**
   * Re-check bridge health and become owner if the previous window closed.
   * Safe to call periodically from Advanced Mode windows.
   */
  async ensureAvailable(): Promise<void> {
    if (this.server) {
      return;
    }

    const config = getConfig();
    if (await this.healthCheck(config.port)) {
      this.remoteBridge = true;
      return;
    }

    if (await this.tryConnectExisting(config.port)) {
      this.remoteBridge = true;
      return;
    }

    this.remoteBridge = false;
    await this.bindServer(config.port);
  }
  async start(): Promise<void> {
    if (this.server) {
      return;
    }

    const config = getConfig();
    if (await this.tryConnectExisting(config.port)) {
      this.remoteBridge = true;
      return;
    }

    this.remoteBridge = false;
    await this.bindServer(config.port);
  }

  /**
   * Local-only teardown, used by extension deactivation. A passive window
   * never owned a server, so this is a safe no-op for it — closing an
   * unrelated window must never reach across and kill another window's
   * bridge. Only the window that actually bound the port stops anything.
   */
  async stop(): Promise<void> {
    if (this.server && this.isOwner) {
      await this.stopLocal();
    }
  }

  /**
   * Explicit "turn Advanced Mode off everywhere" action, used only by the
   * Disable Advanced Mode command (and settings-driven reconciliation). If
   * this window owns the server, shut it down locally. Otherwise, ask the
   * owning window (via the discovery file) to shut itself down so a passive
   * client can disable Advanced Mode without leaking the owner's port binding.
   */
  async disableEverywhere(): Promise<void> {
    if (this.server && this.isOwner) {
      await this.stopLocal();
      return;
    }
    await this.requestRemoteShutdown();
  }

  private async stopLocal(): Promise<void> {
    if (!this.server) {
      return;
    }
    await new Promise<void>((resolve) => {
      this.server?.close(() => resolve());
    });
    this.server = null;
    this.isOwner = false;
    this.remoteBridge = false;
    this.boundPort = 0;
    this.removeDiscoveryFile();
  }

  private async requestRemoteShutdown(): Promise<void> {
    let targetPort = getConfig().port;
    for (const filePath of resolveBridgeDiscoveryPaths()) {
      if (!fs.existsSync(filePath)) {
        continue;
      }
      try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8')) as BridgeDiscoveryFile;
        if (data.port) {
          targetPort = data.port;
          break;
        }
      } catch {
        // Try next path.
      }
    }
    await this.postShutdown(targetPort);
  }

  private postShutdown(port: number): Promise<void> {
    return new Promise((resolve) => {
      const req = http.request(
        { host: '127.0.0.1', port, path: '/shutdown', method: 'POST', timeout: 1000 },
        (res) => {
          res.resume();
          resolve();
        },
      );
      req.on('error', () => resolve());
      req.on('timeout', () => {
        req.destroy();
        resolve();
      });
      req.end();
    });
  }

  private discoveryFilePath(): string {
    return getBridgeDiscoveryPath();
  }

  private writeDiscoveryFile(port: number): void {
    const dir = path.dirname(this.discoveryFilePath());
    fs.mkdirSync(dir, { recursive: true });
    const payload: BridgeDiscoveryFile = {
      port,
      pid: process.pid,
      startedAt: new Date().toISOString(),
    };
    fs.writeFileSync(this.discoveryFilePath(), JSON.stringify(payload, null, 2), 'utf8');
  }

  private removeDiscoveryFile(): void {
    const filePath = this.discoveryFilePath();
    if (!fs.existsSync(filePath)) {
      return;
    }
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      const data = JSON.parse(raw) as BridgeDiscoveryFile;
      if (data.pid === process.pid) {
        fs.unlinkSync(filePath);
      }
    } catch {
      // Ignore corrupt discovery file.
    }
  }

  private async tryConnectExisting(port: number): Promise<boolean> {
    let targetPort = port;
    for (const filePath of resolveBridgeDiscoveryPaths()) {
      if (!fs.existsSync(filePath)) {
        continue;
      }
      try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8')) as BridgeDiscoveryFile;
        if (data.port) {
          targetPort = data.port;
          break;
        }
      } catch {
        // Try next path.
      }
    }

    return this.healthCheck(targetPort);
  }

  private healthCheck(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const req = http.get(`http://127.0.0.1:${port}/health`, (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      });
      req.on('error', () => resolve(false));
      req.setTimeout(500, () => {
        req.destroy();
        resolve(false);
      });
    });
  }

  private bindServer(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => {
        this.handleRequest(req, res);
      });

      server.on('error', reject);
      server.listen(port, '127.0.0.1', () => {
        this.server = server;
        this.isOwner = true;
        this.boundPort = port;
        this.writeDiscoveryFile(port);
        resolve();
      });
    });
  }

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const url = req.url ?? '/';
    if (req.method === 'GET' && url === '/health') {
      this.json(res, { status: 'ok', version: this.context.extension.packageJSON.version, port: this.boundPort || getConfig().port, ownerPid: process.pid });
      return;
    }

    if (req.method === 'GET' && url === '/status') {
      this.json(res, {
        playing: this.musicController.isPlaying(),
        refCount: this.musicController.getRefCount(),
        enabled: getConfig().enabled,
      });
      return;
    }

    if (req.method === 'POST' && url === '/activity/start') {
      this.musicController.requestActivityStart('hook');
      this.json(res, { ok: true });
      return;
    }

    if (req.method === 'POST' && (url === '/activity/stop' || url.startsWith('/activity/stop?'))) {
      const force = url.includes('force=1');
      if (force) {
        this.musicController.requestActivityForceStop('hook');
      } else {
        this.musicController.requestActivityStop('hook');
      }
      this.json(res, { ok: true });
      return;
    }

    if (req.method === 'POST' && url === '/shutdown') {
      this.json(res, { ok: true });
      // Shut down after responding so the requester's call resolves cleanly.
      setImmediate(() => {
        void this.stopLocal();
      });
      return;
    }

    this.json(res, { error: 'not found' }, 404);
  }

  private json(res: http.ServerResponse, body: unknown, status = 200): void {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  }
}
