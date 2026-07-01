<div align="center">

# 🎵 Hold the Vibe

### *Your AI agent is working. You might as well enjoy the ride.*

**Elevator Music** plays looping hold music while Copilot, Cursor Agent, or other coding agents work — and a satisfying **ding** when they're done.

<br />

[![CI](https://github.com/joenb33/hold-the-vibe/actions/workflows/ci.yml/badge.svg)](https://github.com/joenb33/hold-the-vibe/actions/workflows/ci.yml)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![VS Code](https://img.shields.io/badge/VS%20Code-1.96%2B-007ACC?logo=visualstudiocode&logoColor=white)](https://code.visualstudio.com/)
[![Cursor](https://img.shields.io/badge/Cursor-supported-000000?logo=cursor&logoColor=white)](https://cursor.com/)
[![Advanced Mode](https://img.shields.io/badge/hooks-VS%20Code%201.109%2B-green)](https://code.visualstudio.com/docs/agent-customization/hooks)

<br />

[Install in 60 seconds](#-install-in-60-seconds) · [How it works](#-how-it-works) · [Contributing](CONTRIBUTING.md) · [Report a bug](https://github.com/joenb33/hold-the-vibe/issues)

</div>

---

## ✨ Why this exists

You kicked off an agent. You switched tabs. You forgot. Twenty minutes later you wonder if it's still running.

**Hold the Vibe** fixes that the fun way:

| Moment | What you hear |
|--------|----------------|
| Agent **starts** working | Smooth elevator hold music |
| Agent **finishes** | A crisp completion ding |

No staring at the spinner. No polling the chat. Just vibes.

---

## 🎬 How it works

```mermaid
sequenceDiagram
    participant You
    participant Agent as AI Agent
    participant Hook as Editor Hook
    participant Bridge as Local Bridge
    participant Vibe as Elevator Music

    You->>Agent: Submit prompt
    Agent->>Hook: beforeSubmitPrompt / UserPromptSubmit
    Hook->>Bridge: POST /activity/start
    Bridge->>Vibe: ▶ Hold music
    Note over Vibe: 🎵 muzak while you wait...
    Agent->>Hook: stop / Stop
    Hook->>Bridge: POST /activity/stop
    Bridge->>Vibe: ⏹ Stop + ding
    Note over Vibe: 🔔 done!
```

**Advanced Mode** (default) uses your editor's agent hooks → a tiny localhost bridge → instant, reliable audio.

**Notify Mode** is the zero-setup fallback: LM tools + smart terminal heuristics. Best effort, no hook files.

---

## ⚡ Install in 60 seconds

### Option A — Download a release (easiest)

Grab the latest `.vsix` from **[GitHub Releases](https://github.com/joenb33/hold-the-vibe/releases)**.

**Extensions** → `⋯` → **Install from VSIX** → select the file. Reload once.

### Option B — Build from source

```bash
git clone https://github.com/joenb33/hold-the-vibe.git
cd hold-the-vibe
npm install
npm run compile
npm run package
```

Install the generated `.vsix` as above.

### Option C — Hack on it

```bash
git clone https://github.com/joenb33/hold-the-vibe.git
cd hold-the-vibe
npm install && npm run compile
```

Open the folder, press **F5**, and use the **Extension Development Host** window that opens.

> **Heads up:** While developing, run agent tasks in the *new* window — not your main editor.

---

## 🚀 Try it right now

1. Look at the **status bar** (bottom-right) → **Advanced (Cursor)** or **Advanced Mode**
2. Click it → **Test ding** 🔔 then **Test hold music (3s)** 🎵
3. Ask your agent to do something real — refactor a file, run tests, whatever
4. **Elevator Music: Show Diagnostics** to see hook hit counts (all local, nothing sent anywhere)

That's it. If you hear music when the agent starts and a ding when it stops — you're vibing.

---

## 🎛 Two modes

| | **Advanced Mode** | **Notify Mode** |
|---|:---:|:---:|
| Setup | One-time hook install (automatic) | None |
| Hold music | ✅ Guaranteed | Best effort |
| Completion ding | ✅ Guaranteed | Best effort |
| Writes hook files | Yes (`~/.cursor` or `~/.copilot`) | No |

Advanced Mode is on by default. Toggle via the status bar menu or `elevatorMusic.advancedMode` in settings.

---

## 🖥 Works where you code

| Editor | Hook support | Status |
|--------|-------------|--------|
| **Cursor** | `beforeSubmitPrompt`, `stop`, subagent events | ✅ Fully supported |
| **VS Code** + Copilot Chat | `UserPromptSubmit`, `Stop`, subagent events | ✅ Requires 1.109+ |

Both editors on one machine? Set `elevatorMusic.installHooksForAllEditors` to `true` when enabling Advanced Mode.

---

## 🔧 Settings worth knowing

| Setting | Default | What it does |
|---------|---------|--------------|
| `elevatorMusic.enabled` | `true` | Master on/off |
| `elevatorMusic.advancedMode` | `true` | Hooks + bridge vs Notify Mode |
| `elevatorMusic.volume` | `80` | Playback volume (%) |
| `elevatorMusic.dingCooldownMs` | `2500` | Anti-spam between dings |

Search **elevatorMusic** in Settings for the full list.

---

## 🎶 Sounds

Royalty-free audio, included:

| File | Source | License |
|------|--------|---------|
| Hold music | [Short Elevator Music Loop](https://freesound.org/people/BlondPanda/sounds/659889/) by BlondPanda | [CC0](https://creativecommons.org/publicdomain/zero/1.0/) |
| Ding | [CHIMES - 4](https://freesound.org/people/SamuelGremaud/sounds/517661/) by SamuelGremaud | [CC0](https://creativecommons.org/publicdomain/zero/1.0/) |

Full credits: [media/ATTRIBUTION.md](media/ATTRIBUTION.md). Swap in your own WAVs anytime via `elevatorMusic.dingPath` / `holdMusicPath`.

---

## 🛟 Troubleshooting

<details>
<summary><strong>Ding works but no hold music</strong></summary>

Large WAV files can take a moment to start on Windows. Check **Output → Log (Extension Host)** for `[Elevator Music] Starting hold loop`. Try **Test hold music (3s)** from the status bar menu.
</details>

<details>
<summary><strong>No status bar item after F5</strong></summary>

The extension loads in the **Extension Development Host** window (the second window), not the one where you pressed F5.
</details>

<details>
<summary><strong>Agent stops responding mid-turn</strong></summary>

Unrelated VS Code bug — see [microsoft/vscode#301795](https://github.com/microsoft/vscode/issues/301795). Try disabling Advanced Mode temporarily to compare.
</details>

<details>
<summary><strong>Multiple editor windows open</strong></summary>

One window owns the localhost bridge; others connect passively. Disabling Advanced Mode sends a clean shutdown to all windows.
</details>

More help? [Open an issue](https://github.com/joenb33/hold-the-vibe/issues) — we actually read them.

---

## 🤝 Contributing

Ideas, sounds, platform fixes, docs — all welcome. See [CONTRIBUTING.md](CONTRIBUTING.md). Release process: [RELEASE.md](RELEASE.md).

**Good first PRs:** alternative hold loops (CC0), macOS/Linux playback polish, README improvements.

---

## 📄 License

- **Code:** [MIT](LICENSE)
- **Bundled audio:** [CC0](media/ATTRIBUTION.md) — use freely, attribution appreciated

---

<div align="center">

**Hold the Vibe** · Made for everyone who's ever waited on an agent and thought *"please hold…"*

⭐ Star the repo if it made you smile · [github.com/joenb33/hold-the-vibe](https://github.com/joenb33/hold-the-vibe)

</div>
