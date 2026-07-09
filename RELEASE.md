# Releasing Hold the Vibe

This project uses GitHub Actions for build, release, and (optional) marketplace publish.

## Pipelines

| Workflow | When | What it does |
|----------|------|----------------|
| **CI** | Every push/PR to `main` | Compile, test, package VSIX. On **main** push, also tags `v{package.json version}` and creates a GitHub Release when that release does not exist yet. |
| **Release** | Push a tag `v*` manually (e.g. from your machine) | Same checks + GitHub Release — used when you tag locally instead of relying on CI |
| **Publish to Marketplace** | GitHub Release published, or manual | Publishes VSIX to VS Marketplace + Open VSX (if secrets set) |

## Ship a new version

Push to `main`. CI handles the rest:

1. If `package.json`'s version **already has** a `v*` tag (the last release), CI auto-bumps the **patch** version (`0.1.3` → `0.1.4`) and pushes that commit.
2. The next CI run (triggered by the bump commit) builds, tests, packages the VSIX, tags `v{version}`, and creates a GitHub Release when one does not exist yet.

You only need to bump **minor** or **major** yourself when you want a bigger semver step.

### Manual version bump (optional)

Edit `version` in `package.json` when you want a minor/major release:

```bash
npm run compile   # sanity check
git add package.json package-lock.json
git commit -m "chore: bump version to 0.2.0"
git push origin main
```

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
- CI auto-bumps the **patch** on `main` when that version is already tagged, then the follow-up run tags and releases.
- Bump **minor** or **major** manually in `package.json` when you want a deliberate semver jump.
- Pre-release tags (`v0.2.0-beta.1`) mark GitHub releases as pre-release.

## Why patch auto-bump?

Patch auto-bump keeps every `main` push releasable without remembering to edit `package.json`. You still control minor/major semver intentionally; CI only handles the patch step when the current version is already shipped.

## Badges

CI status appears on the README after the first workflow run on `main`.
