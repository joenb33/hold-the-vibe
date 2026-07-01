# Releasing Hold the Vibe

This project uses GitHub Actions for build, release, and (optional) marketplace publish.

## Pipelines

| Workflow | When | What it does |
|----------|------|----------------|
| **CI** | Every push/PR to `main` | `npm ci` → compile → verify VSIX packages |
| **Release** | Push a tag `v*` (e.g. `v0.1.0`) | Verifies tag = `package.json` version → builds VSIX → GitHub Release |
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

### 2. Tag and release

```bash
git tag v0.1.1
git push origin v0.1.1
```

The **Release** workflow creates a GitHub Release and attaches `elevator-music-0.1.1.vsix`.

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
- CI does **not** auto-bump versions — you control semver on purpose.
- Pre-release tags (`v0.2.0-beta.1`) mark GitHub releases as pre-release.

## Why not auto-bump every push?

Automatic version bumps on every commit create noisy releases and make semver meaningless. The tag-driven flow keeps:

- `main` always buildable (CI)
- releases intentional (tags)
- marketplace in sync with GitHub releases

## Badges

CI status appears on the README after the first workflow run on `main`.
