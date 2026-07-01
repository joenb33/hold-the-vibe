// There is no real `vscode` package in node_modules — VS Code injects it via a
// special require hook only inside the actual Extension Host. Outside of that
// (i.e. running compiled modules under plain Node for unit tests), `require('vscode')`
// would otherwise fail with MODULE_NOT_FOUND. This materializes a tiny stub
// package pointing at test-support/vscode-stub.js so those requires resolve
// normally. (The stub lives outside test/ on purpose — Node's test runner
// treats every file inside a folder literally named "test" as a test file.)
//
// Runs as `pretest` since node_modules is wiped/reinstalled by `npm ci` in CI.
const fs = require('fs');
const path = require('path');

const stubDir = path.join(__dirname, '..', 'node_modules', 'vscode');
fs.mkdirSync(stubDir, { recursive: true });

fs.writeFileSync(
  path.join(stubDir, 'package.json'),
  JSON.stringify({ name: 'vscode', version: '0.0.0-stub', main: 'index.js' }, null, 2),
);

fs.writeFileSync(
  path.join(stubDir, 'index.js'),
  "module.exports = require('../../test-support/vscode-stub.js');\n",
);

console.log('vscode test stub linked into node_modules/vscode');
