# Contributing

Thanks for helping improve Elevator Music. This project is intentionally small — focused PRs are easiest to review.

## Good first contributions

- **Sounds** — alternative hold loops or dings (CC0 or compatible license; update `media/ATTRIBUTION.md`)
- **Platform playback** — macOS/Linux hold-loop reliability, volume control on Windows
- **Editor support** — hook event names or paths for new VS Code forks
- **Docs** — clearer setup steps, troubleshooting, translations
- **Bug fixes** — with a short note on how you reproduced the issue

## Development setup

```bash
npm install
npm run compile
```

Press **F5** in VS Code or Cursor to open an Extension Development Host. Run agent tasks in **that** window (not your main editor) while debugging.

Use **Elevator Music: Show Diagnostics** to verify hook hit rates during testing.

## Pull requests

1. Fork the repo and create a branch from `main`.
2. Keep changes scoped to one concern.
3. Run `npm run compile` before opening the PR.
4. Describe what you tested (editor, OS, Advanced vs Notify Mode).

## Feedback and bug reports

You can reach us in several ways:

| Channel | Best for |
|---------|----------|
| [GitHub Issues](https://github.com/joenb33/hold-the-vibe/issues) | Confirmed bugs with repro steps |
| [GitHub Discussions](https://github.com/joenb33/hold-the-vibe/discussions) | Questions, ideas, or if issue creation is unavailable |
| [Marketplace Q&A](https://marketplace.visualstudio.com/items?itemName=joenberg.elevator-music&ssr=false#qna) | Install and playback problems |

**Repo maintainers:** to let anyone open issues, check **Settings → General → Issues** and ensure issue creation is not limited to collaborators only.

## Code style

- Match existing TypeScript patterns in `src/`.
- Prefer small, readable diffs over large refactors.
- Use exhaustive `switch` with a `never` check for discriminated unions.

## Audio licensing

Do not commit copyrighted audio. CC0 or similarly permissive assets only, with attribution recorded in `media/ATTRIBUTION.md`.
