# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project follows [Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-06-12

### Added
- Initial MVP / proof-of-concept release.
- Core extension framework with global enable/disable toggle.
- Per-character state persistence (schedule template, current activity, location, activity start time).
- Time Awareness module (Morning / Afternoon / Evening / Night).
- Activity Simulation driven by hardcoded schedule templates: Office Worker, University Student, Streamer.
- Location Simulation derived from the active schedule slot.
- Activity Duration tracking and human-readable formatting (e.g. `2h 15m`).
- Compact `[Immersion Context]` prompt injection via `setExtensionPrompt`.
- Live State Preview panel in the extension settings UI with manual refresh.

### Not yet implemented
See [ROADMAP.md](ROADMAP.md) for planned modules (Sleep System, Energy, Financial State, Social Battery, Life Events, Probability Engine, Weather, and more).
