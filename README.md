# Immersion Engine

A lightweight SillyTavern extension that gives characters a persistent,
ongoing "life" — tracking time of day, location, and current activity even
while you're away — and quietly injects that state into the prompt so the
LLM can react to it naturally.

> **Status: MVP / Proof of Concept**
> This release validates the core concept (state injection, not dialogue
> generation) with a minimal feature set. See [ROADMAP.md](ROADMAP.md) for
> what's planned next.

## What it does

- **Time Awareness** — Morning / Afternoon / Evening / Night, based on real time.
- **Activity Simulation** — Characters follow a daily schedule (e.g. Working, Sleeping, Gaming, Studying).
- **Location Simulation** — Derived automatically from the schedule (Home, Office, Gym, Campus, etc.).
- **Activity Duration** — Tracks how long the character has been doing their current activity (`2h 15m`).
- **Per-character persistence** — Each character has their own schedule template and activity state, saved across sessions.
- **Live State Preview** — A panel in the extension settings shows the character's current state in real time.
- **Prompt Injection** — A compact `[Immersion Context]` block (~20-30 tokens) is injected automatically before each generation. The extension never writes dialogue — it only provides state for the LLM to react to.

## Schedule Templates

Three hardcoded templates are included:

| Template | Description |
|---|---|
| **Office Worker** | Standard 9-5 schedule with commute, gym, and evening downtime. |
| **University Student** | Classes, study sessions, and weekend socializing. |
| **Streamer** | Inverted schedule — sleeps during the day, streams at night. |

Each character can be assigned a different template via the extension settings.

## Installation

### Recommended: Install from Git URL

1. In SillyTavern, open the **Extensions** panel.
2. Click **Install Extension**.
3. Paste this repository's URL:
   ```
   https://github.com/gadzzella/immersion-engine
   ```
4. Click **Install**, then restart SillyTavern or reload the page.

### Manual Installation

1. Download or clone this repository.
2. Copy the entire folder into:
   ```
   SillyTavern/public/scripts/extensions/third-party/immersion-engine/
   ```
   The folder name **must** be `immersion-engine`.
3. Restart SillyTavern (or reload the page).

## Usage

1. Open **Extensions** → find **Immersion Engine** in the list.
2. Check **Enable Immersion Engine** (global toggle — affects all characters).
3. Select a character in SillyTavern as normal.
4. In the Immersion Engine panel, choose a **Schedule Template** for that character.
5. Click **Refresh** to see the **Live State Preview** update.
6. Send a message — the current state (Time, Location, Activity, Duration) is automatically injected into the prompt for that generation.

## How it works

- **State, not dialogue.** The extension never generates or rewrites messages. It only provides contextual state (time, location, activity) that the LLM can choose to incorporate naturally.
- **Lazy simulation.** Activity and location are recomputed from the schedule and the current time whenever a generation starts — no background timers or polling.
- **Per-character storage.** State is stored in SillyTavern's extension settings, keyed by each character's avatar filename, so every character has an independent schedule and activity timer.
- **Minimal token footprint.** The injected block is small by design (well under SillyTavern's typical context budgets).

## Repository Structure

```
immersion-engine/
├── index.js          # Core extension logic (state, scheduling, injection, UI wiring)
├── schedules.js       # Hardcoded schedule templates (Office Worker, Student, Streamer)
├── settings.html      # Extension settings panel markup
├── style.css          # Settings panel styling
├── manifest.json       # SillyTavern extension manifest
├── LICENSE
├── README.md
├── CHANGELOG.md
├── ROADMAP.md
└── .gitignore
```

## Compatibility

- Requires a recent version of SillyTavern with the third-party extensions API (`extension_settings`, `getContext`, `setExtensionPrompt`).
- Works with any character card and any LLM backend — the extension only modifies the prompt, not the model.

## Contributing

Issues and pull requests are welcome. Please see [ROADMAP.md](ROADMAP.md) for planned features before proposing large additions — this project intentionally ships in small, validated increments.

## License

MIT — see [LICENSE](LICENSE).
