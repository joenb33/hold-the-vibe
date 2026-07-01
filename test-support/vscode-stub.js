'use strict';

// Minimal stand-in for the `vscode` module so the pure-logic pieces of the
// extension (config resolution, IDE detection, version gating, hook target
// selection) can run under plain Node in unit tests, without spinning up a
// real Extension Host. Only implements the surface those modules touch.

let config = {};
let appName = 'Visual Studio Code';
let version = '1.111.0';

function getConfiguration() {
  return {
    get(key, defaultValue) {
      return Object.prototype.hasOwnProperty.call(config, key) ? config[key] : defaultValue;
    },
    update() {
      return Promise.resolve();
    },
  };
}

module.exports = {
  workspace: { getConfiguration },
  get env() {
    return { appName };
  },
  get version() {
    return version;
  },
  ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 },

  // Test-only controls (not part of the real vscode API).
  __setConfig(overrides) {
    config = { ...overrides };
  },
  __setAppName(name) {
    appName = name;
  },
  __setVersion(v) {
    version = v;
  },
  __reset() {
    config = {};
    appName = 'Visual Studio Code';
    version = '1.111.0';
  },
};
