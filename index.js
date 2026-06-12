// index.js
//
// Immersion Engine (MVP) — SillyTavern Extension
//
// Implements per the v2 architecture doc, MVP-reduced scope:
//   - Core extension framework (enable/disable, settings persistence)
//   - Per-character state persistence
//   - Time Awareness
//   - Activity Simulation (hardcoded schedule templates)
//   - Location Simulation (derived from schedule)
//   - Activity Duration
//   - Prompt Injection (compact "[Immersion Context]" block)
//   - Live State Preview Panel
//
// Explicitly NOT implemented in this MVP (see spec sections 5.3-5.5, 6):
//   Sleep System, Energy, Financial State, Social Battery, Life Events,
//   Probability Engine, Weather, Relationship State, Outfit Persistence.

// --- SillyTavern core imports -------------------------------------------
// These paths are relative to:
//   public/scripts/extensions/third-party/immersion-engine/index.js
import { extension_settings, getContext } from '../../../extensions.js';
import { saveSettingsDebounced } from '../../../../script.js';

import { SCHEDULE_TEMPLATES } from './schedules.js';

// --- Constants -------------------------------------------------------------

const MODULE_NAME = 'immersionEngine';
const EXTENSION_PROMPT_KEY = 'immersion_engine_injection';

// The folder name this extension is installed under (must match the
// GitHub repo name when installed via "Install Extension from Git URL").
// Used only for fetching static assets like settings.html.
const EXTENSION_FOLDER_NAME = 'immersion-engine';

// Position/depth for setExtensionPrompt.
// extension_prompt_types.IN_PROMPT = 1 (injected into the main prompt as
// a system-style message). Depth 4 places it a few messages back from the
// most recent, so it reads as "current context" rather than "latest message".
const INJECTION_POSITION = 1; // extension_prompt_types.IN_PROMPT
const INJECTION_DEPTH = 4;

// Day names matching the keys used in schedules.js
const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

// --- Default settings -------------------------------------------------------

const defaultSettings = {
  enabled: true,
  // Per-character state, keyed by character avatar filename (stable ID).
  // Shape per character:
  // {
  //   scheduleTemplate: 'officeWorker' | 'universityStudent' | 'streamer',
  //   activity: { currentActivity, currentLocation, activityStartTime }
  // }
  characters: {},
};

/**
 * Ensures extension_settings[MODULE_NAME] exists and has all default keys.
 * Called once on load. Safe to call multiple times.
 */
function initSettings() {
  if (!extension_settings[MODULE_NAME]) {
    extension_settings[MODULE_NAME] = structuredClone(defaultSettings);
  }
  // Backfill any missing top-level keys (handles upgrades from older configs).
  for (const key of Object.keys(defaultSettings)) {
    if (extension_settings[MODULE_NAME][key] === undefined) {
      extension_settings[MODULE_NAME][key] = structuredClone(defaultSettings[key]);
    }
  }
}

// --- Per-character state helpers --------------------------------------------

/**
 * Returns a stable identifier for the currently selected character.
 * Uses the avatar filename, which is unique per character in SillyTavern.
 * Returns null if no character is selected (e.g. on a group chat or
 * the welcome screen).
 */
function getCurrentCharacterId() {
  const context = getContext();
  const character = context.characters?.[context.characterId];
  return character?.avatar ?? null;
}

/**
 * Retrieves (and lazily initializes) the persisted state object for a
 * given character ID. All per-character data lives under
 * extension_settings.immersionEngine.characters[characterId].
 */
function getCharacterState(characterId) {
  const store = extension_settings[MODULE_NAME].characters;

    if (!store[characterId]) {
    store[characterId] = {
      // Default to the Office Worker template; user can change later.
      scheduleTemplate: 'officeWorker',
      activity: {
        currentActivity: null,
        currentLocation: null,
        // ISO timestamp marking when the current activity began.
        activityStartTime: null,
      },
    };
  }

  return store[characterId];
}

/**
 * Persists the entire extension_settings object to disk (debounced).
 * Call after any mutation to character state.
 */
function persist() {
  saveSettingsDebounced();
}

// --- Schedule lookup ----------------------------------------------------------

/**
 * Given a schedule template ID and a Date, returns the matching slot
 * { start, end, activity, location } for that moment, or null if the
 * template/day has no slots (shouldn't happen with our templates, but
 * guarded defensively).
 */
function findScheduleSlot(templateId, date) {
  const template = SCHEDULE_TEMPLATES[templateId];
  if (!template) return null;

  const dayName = DAY_NAMES[date.getDay()];
  const daySlots = template.week[dayName];
  if (!daySlots || daySlots.length === 0) return null;

  const minutesNow = date.getHours() * 60 + date.getMinutes();

  for (const slot of daySlots) {
    const startMin = timeToMinutes(slot.start);
    const endMin = timeToMinutes(slot.end);

    // Handle slots that cross midnight (e.g. 23:00-24:00 represented as
    // end="24:00", or a slot like 23:00-08:00). We treat "24:00" as 1440.
    if (endMin > startMin) {
      if (minutesNow >= startMin && minutesNow < endMin) return slot;
    } else {
      // Wrapping slot (end <= start means it crosses midnight)
      if (minutesNow >= startMin || minutesNow < endMin) return slot;
    }
  }

  return null;
}

function timeToMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Derives a human-readable "Time" label (Morning/Afternoon/Evening/Night)
 * from the current hour. This is the "Time Awareness" module.
 */
function getTimeOfDayLabel(date) {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return 'Morning';
  if (hour >= 12 && hour < 17) return 'Afternoon';
  if (hour >= 17 && hour < 21) return 'Evening';
  return 'Night';
}

// --- Activity / Location / Duration update (time-delta logic) ---------------

/**
 * Recomputes the character's current activity and location based on the
 * schedule template and the current time, and updates activityStartTime
 * if the activity has changed since the last check.
 *
 * This is the "lazy simulation" approach described in spec 3.3: rather
 * than running background timers, we recompute on-demand (here, right
 * before prompt injection).
 */
function updateActivityState(characterId) {
  const state = getCharacterState(characterId);
  const now = new Date();

  const slot = findScheduleSlot(state.scheduleTemplate, now);

  // Fallback if no slot matches (shouldn't occur with full-day templates).
  const newActivity = slot?.activity ?? 'Idle';
  const newLocation = slot?.location ?? 'Unknown';

  const activity = state.activity;

  if (activity.currentActivity !== newActivity) {
    // Activity changed since we last checked -> reset the duration timer.
    activity.currentActivity = newActivity;
    activity.activityStartTime = now.toISOString();
  }

  if (activity.currentActivity === null) {
    // First-ever initialization.
    activity.activityStartTime = now.toISOString();
  }

  activity.currentLocation = newLocation;

  persist();

  return { now, activity: newActivity, location: newLocation };
}

/**
 * Formats the duration between activityStartTime and now as a compact
 * human-readable string, e.g. "45m", "2h", "2h 15m".
 */
function formatActivityDuration(characterId, now) {
  const state = getCharacterState(characterId);
  const start = state.activity.activityStartTime;
  if (!start) return '0m';

  const elapsedMs = now.getTime() - new Date(start).getTime();
  const totalMinutes = Math.max(0, Math.floor(elapsedMs / 60000));

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

// --- Prompt Injection ---------------------------------------------------------

/**
 * Builds the compact injection block and registers it with SillyTavern's
 * extension prompt system via setExtensionPrompt(). This is the core
 * integration point: SillyTavern automatically includes registered
 * extension prompts in the assembled context sent to the LLM.
 *
 * Per spec section 9, this string is kept small (~20-30 tokens here),
 * well under the 60-token ceiling.
 */
function injectCurrentState() {
  const context = getContext();

  // If the extension is disabled, clear any existing injection and stop.
  if (!extension_settings[MODULE_NAME].enabled) {
    context.setExtensionPrompt(EXTENSION_PROMPT_KEY, '', INJECTION_POSITION, INJECTION_DEPTH);
    return;
  }

  const characterId = getCurrentCharacterId();
  if (!characterId) {
    // No character selected (e.g. group chat) — nothing to inject.
    context.setExtensionPrompt(EXTENSION_PROMPT_KEY, '', INJECTION_POSITION, INJECTION_DEPTH);
    return;
  }

  const { now, activity, location } = updateActivityState(characterId);
  const timeOfDay = getTimeOfDayLabel(now);
  const duration = formatActivityDuration(characterId, now);

  const injection =
    `[Immersion Context]\n` +
    `Time=${timeOfDay}\n` +
    `Location=${location}\n` +
    `Activity=${activity}\n` +
    `ActivityDuration=${duration}\n` +
    `[/Immersion Context]`;

  // setExtensionPrompt(key, value, position, depth, scan, role)
  // - key: unique identifier so we can update/clear our own injection
  // - value: the text block to inject
  // - position: 1 = IN_PROMPT (inserted into the prompt at `depth`)
  // - depth: how many messages back from the end to insert
  context.setExtensionPrompt(EXTENSION_PROMPT_KEY, injection, INJECTION_POSITION, INJECTION_DEPTH);

  // Refresh the live preview panel to reflect the just-computed state.
  refreshPreviewPanel({ timeOfDay, location, activity, duration });
}

// --- Live State Preview Panel --------------------------------------------------

/**
 * Updates the DOM elements in the settings panel with the latest computed
 * state. Called every time injectCurrentState() runs (i.e. before each
 * generation) and on character switch / manual refresh.
 */
function refreshPreviewPanel(stateOverride = null) {
  const panel = document.getElementById('immersion_preview_content');
  if (!panel) return; // Settings panel not rendered/open.

  let display = stateOverride;

  if (!display) {
    // Manual refresh: recompute without triggering a generation.
    const characterId = getCurrentCharacterId();
    if (!characterId) {
      panel.innerHTML = '<i>No character selected.</i>';
      return;
    }
    const { now, activity, location } = updateActivityState(characterId);
    display = {
      timeOfDay: getTimeOfDayLabel(now),
      location,
      activity,
      duration: formatActivityDuration(characterId, now),
    };
  }

  panel.innerHTML = `
    <div class="immersion-preview-row"><b>Time:</b> ${display.timeOfDay}</div>
    <div class="immersion-preview-row"><b>Location:</b> ${display.location}</div>
    <div class="immersion-preview-row"><b>Activity:</b> ${display.activity}</div>
    <div class="immersion-preview-row"><b>Duration:</b> ${display.duration}</div>
  `;
}

// --- Settings UI ----------------------------------------------------------------

/**
 * Loads settings.html into the extensions settings panel and wires up
 * event handlers (enable toggle, schedule template selector, refresh button).
 */
async function loadSettingsUI() {
  const response = await fetch(
    `/scripts/extensions/third-party/${EXTENSION_FOLDER_NAME}/settings.html`,
  );
  const html = await response.text();

  // SillyTavern provides a container with id="extensions_settings"
  // (and "extensions_settings2") for third-party extension panels.
  $('#extensions_settings2').append(html);

  // --- Enable/disable toggle ---
  const enabledCheckbox = document.getElementById('immersion_enabled');
  enabledCheckbox.checked = extension_settings[MODULE_NAME].enabled;
  enabledCheckbox.addEventListener('change', (e) => {
    extension_settings[MODULE_NAME].enabled = e.target.checked;
    persist();
    // Immediately clear or re-add the injection to reflect the new state.
    injectCurrentState();
  });

  // --- Schedule template selector ---
  const templateSelect = document.getElementById('immersion_template');
  for (const [id, template] of Object.entries(SCHEDULE_TEMPLATES)) {
    const option = document.createElement('option');
    option.value = id;
    option.textContent = template.label;
    templateSelect.appendChild(option);
  }

  templateSelect.addEventListener('change', (e) => {
    const characterId = getCurrentCharacterId();
    if (!characterId) return;
    const state = getCharacterState(characterId);
    state.scheduleTemplate = e.target.value;
    persist();
    refreshPreviewPanel(); // recompute with new template
  });

  // Sync the dropdown to the current character's saved template whenever
  // the active character changes.
  function syncTemplateSelector() {
    const characterId = getCurrentCharacterId();
    if (!characterId) return;
    const state = getCharacterState(characterId);
    templateSelect.value = state.scheduleTemplate;
  }

  // --- Manual refresh button ---
  document.getElementById('immersion_refresh').addEventListener('click', () => {
    refreshPreviewPanel();
  });

  // --- React to character switches ---
  const context = getContext();
  context.eventSource.on(context.eventTypes.CHAT_CHANGED, () => {
    syncTemplateSelector();
    refreshPreviewPanel();
  });

  // Initial sync for whichever character is loaded at startup.
  syncTemplateSelector();
  refreshPreviewPanel();
}

// --- Extension entry point ------------------------------------------------------

jQuery(async () => {
  initSettings();
  await loadSettingsUI();

  const context = getContext();

  // Core integration point: recompute and inject state right before each
  // generation. GENERATION_STARTED fires after the user sends a message
  // but before the prompt is assembled and sent to the LLM, which lets
  // setExtensionPrompt() take effect for this generation.
  context.eventSource.on(context.eventTypes.GENERATION_STARTED, () => {
    injectCurrentState();
  });

  // Also refresh on character switch so the preview panel and injected
  // state are correct immediately, without waiting for a generation.
  context.eventSource.on(context.eventTypes.CHAT_CHANGED, () => {
    injectCurrentState();
  });
});
