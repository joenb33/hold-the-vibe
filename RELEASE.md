# Releasing Hold the Vibe

This project uses GitHub Actions for build, release, and (optional) marketplace publish.

## Pipelines

| Workflow | When | What it does |
|----------|------|----------------|
| **CI** | Every push/PR to `main` | Compile, test, package VSIX. On **main** push, also tags `v{package.json version}` and creates a GitHub Release when that release does not exist yet. |
| **Release** | Push a tag `v*` manually (e.g. from your machine) | Same checks + GitHub Release — used when you tag locally instead of relying on CI |
| **Publish to Marketplace** | GitHub Release published, or manual | Publishes VSIX to VS Marketplace + Open VSX (if secrets set) |

## Ship a new version

### 1. Bump version locally

Edit `version` in `package.json` (semver: `0.1.0` → `0.1.1`).

```bash
npm run compile   # sanity check
git add package.json
git commit -m "chore: bump version to 0.1.1"
git push origin main
```

### 2. Push to main (tag + release are automatic)

```bash
git push origin main
```

CI on `main` runs tests and, if green, creates tag `v{version}` and a GitHub Release when that release does not exist yet (including attaching `elevator-music-{version}.vsix`).

To tag manually instead:

```bash
git tag v0.1.3
git push origin v0.1.3
```

### 3. Marketplace publish (when ready)

**One-time setup:**

1. Create publisher at [Visual Studio Marketplace](https://marketplace.visualstudio.com/manage) (`joenberg` in `package.json`).
2. Create an [Azure DevOps PAT](https://dev.azure.com) with **Marketplace → Manage**.
3. Add GitHub repo secret: `VSCE_PAT` = that PAT.
4. (Optional) [Open VSX](https://open-vsx.org/) account + `OVSX_PAT` for Cursor/VSCodium registry installs.

**Publish:**

- Automatic: happens when the GitHub Release is published (if `VSCE_PAT` is set).
- Manual: **Actions** → **Publish to Marketplace** → Run workflow → enter version.

## Version rules

- Tag **must** match `package.json`: tag `v0.1.0` ↔ `"version": "0.1.0"`.
- CI auto-tags on `main` when the version in `package.json` has no matching `v*` tag yet — you still bump semver intentionally in `package.json`.
- Pre-release tags (`v0.2.0-beta.1`) mark GitHub releases as pre-release.

## Why not auto-bump the version number on every push?

Automatic version bumps on every commit create noisy releases and make semver meaningless. You still control the version in `package.json`; CI only creates the matching tag and release once that version lands on `main`.

## Badges

CI status appears on the README after the first workflow run on `main`.
