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

// Cached at init time once we've read the real enums from context.
let resolvedInjectionPosition = null;
let resolvedInjectionRole = null;

/**
 * Resolves the correct extension_prompt_types / extension_prompt_roles
 * values from the live SillyTavern context.
 * Uses IN_CHAT with depth 0 and SYSTEM role for reliable injection.
 */
function resolveInjectionConfig(context) {
  const types = context.extension_prompt_types;
  const roles = context.extension_prompt_roles;

  console.log('[Immersion Engine] Raw extension_prompt_types from context:', types);
  console.log('[Immersion Engine] Raw extension_prompt_roles from context:', roles);

  // Always use IN_CHAT (1) with depth 0 for reliable injection
  if (types && typeof types.IN_CHAT !== 'undefined') {
    resolvedInjectionPosition = types.IN_CHAT;
    console.log('[Immersion Engine] Using extension_prompt_types.IN_CHAT =', resolvedInjectionPosition);
  } else {
    resolvedInjectionPosition = 1; // fallback to known value
    console.warn('[Immersion Engine] IN_CHAT not found — defaulting position to 1');
  }

  if (roles && typeof roles.SYSTEM !== 'undefined') {
    resolvedInjectionRole = roles.SYSTEM;
    console.log('[Immersion Engine] Using extension_prompt_roles.SYSTEM =', resolvedInjectionRole);
  } else {
    resolvedInjectionRole = 0; // fallback to known value
    console.warn('[Immersion Engine] extension_prompt_roles.SYSTEM not found — defaulting role to 0');
  }
}

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
 * Returns the exact time in 12-hour format with am/pm, e.g. "2:47 am".
 */
function getExactTimeLabel(date) {
  let hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? 'pm' : 'am';
  hours = hours % 12 || 12;
  const minutesStr = minutes.toString().padStart(2, '0');
  return `${hours}:${minutesStr} ${ampm}`;
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
    console.log('[Immersion Engine] Extension disabled — clearing injection.');
    if (resolvedInjectionPosition !== null) {
      context.setExtensionPrompt(EXTENSION_PROMPT_KEY, '', resolvedInjectionPosition, 0, false, resolvedInjectionRole);
    }
    return;
  }

  const characterId = getCurrentCharacterId();
  if (!characterId) {
    // No character selected (e.g. group chat) — nothing to inject.
    console.log('[Immersion Engine] No character selected — clearing injection.');
    if (resolvedInjectionPosition !== null) {
      context.setExtensionPrompt(EXTENSION_PROMPT_KEY, '', resolvedInjectionPosition, 0, false, resolvedInjectionRole);
    }
    return;
  }

  const { now, activity, location } = updateActivityState(characterId);
  const timeString = getExactTimeLabel(now);
  const duration = formatActivityDuration(characterId, now);

  const injection =
    `[Immersion Context]\n` +
    `Time=${timeString}\n` +
    `Location=${location}\n` +
    `Activity=${activity}\n` +
    `ActivityDuration=${duration}\n` +
    `[/Immersion Context]`;

  console.log('[Immersion Engine] Character:', characterId);
  console.log('[Immersion Engine] Computed state:', { timeString, location, activity, duration });
  console.log('[Immersion Engine] Generated immersion text:\n' + injection);

  if (resolvedInjectionPosition === null) {
    // Defensive: resolveInjectionConfig() should always have run by now,
    // but if it somehow hasn't, do it now rather than calling
    // setExtensionPrompt with null.
    console.warn('[Immersion Engine] resolveInjectionConfig() had not run yet — running now.');
    resolveInjectionConfig(context);
  }

  console.log('[Immersion Engine] Calling setExtensionPrompt with:');
  console.log('  key:', EXTENSION_PROMPT_KEY);
  console.log('  position:', resolvedInjectionPosition);
  console.log('  depth:', 0);
  console.log('  role:', resolvedInjectionRole);

  // setExtensionPrompt(key, value, position, depth, scan, role)
  // - position: IN_CHAT, depth 0 -> inserted just before the user's current message
  // - role: SYSTEM
  const setExtensionPromptResult = context.setExtensionPrompt(
    EXTENSION_PROMPT_KEY,
    injection,
    resolvedInjectionPosition,
    0,
    false,
    resolvedInjectionRole,
  );

  console.log('[Immersion Engine] setExtensionPrompt() returned:', setExtensionPromptResult);

  // Verify the registration actually stuck, if the API exposes a way to check.
  if (context.extensionPrompts) {
    console.log('[Immersion Engine] Full extensionPrompts registry:', context.extensionPrompts);
    console.log('[Immersion Engine] Our registry entry:', context.extensionPrompts[EXTENSION_PROMPT_KEY]);
  } else {
    console.log('[Immersion Engine] context.extensionPrompts not available to verify registration.');
  }

  // Refresh the live preview panel to reflect the just-computed state.
  refreshPreviewPanel({ timeString, location, activity, duration });
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
      timeString: getExactTimeLabel(now),
      location,
      activity,
      duration: formatActivityDuration(characterId, now),
    };
  }

  panel.innerHTML = `
    <div class="immersion-preview-row"><b>Time:</b> ${display.timeString}</div>
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
  console.log('[Immersion Engine] Extension initializing...');

  initSettings();
  await loadSettingsUI();

  const context = getContext();

  // Resolve the real extension_prompt_types / extension_prompt_roles enum
  // values for THIS SillyTavern build. Logged in full for verification.
  resolveInjectionConfig(context);

  // Log all available GENERATION_* event types so we can confirm exactly
  // what's available in this build, rather than assuming.
  const generationEvents = Object.keys(context.eventTypes || {}).filter((k) => k.includes('GENERATION'));
  console.log('[Immersion Engine] Available GENERATION_* event types:', generationEvents);

  // --- Earliest hook: MESSAGE_SENT ---------------------------------------------
  // Per SillyTavern docs: "the message is sent by the user and recorded
  // into the chat object but not yet rendered in the UI." This fires
  // strictly BEFORE any GENERATION_* event, making it the earliest point
  // we can register/refresh the extension prompt before prompt assembly
  // begins. Registered in addition to (not instead of) the GENERATION_*
  // hooks below, since calling injectCurrentState() multiple times is
  // harmless (idempotent re-registration via setExtensionPrompt).
  if (context.eventTypes.MESSAGE_SENT) {
    console.log('[Immersion Engine] Registering handler for MESSAGE_SENT');
    context.eventSource.on(context.eventTypes.MESSAGE_SENT, () => {
      console.log('[Immersion Engine] Event fired: MESSAGE_SENT');
      injectCurrentState();
    });
  } else {
    console.warn('[Immersion Engine] MESSAGE_SENT not found in eventTypes.');
  }

  // --- Primary hook: GENERATION_AFTER_COMMANDS --------------------------------
  // Per SillyTavern docs, this fires "about to start after processing slash
  // commands" — i.e. before prompt assembly proceeds, making it the
  // earliest documented point where setExtensionPrompt() is guaranteed to
  // affect the CURRENT generation. We register here as the primary hook.
  if (context.eventTypes.GENERATION_AFTER_COMMANDS) {
    console.log('[Immersion Engine] Registering handler for GENERATION_AFTER_COMMANDS');
    context.eventSource.on(context.eventTypes.GENERATION_AFTER_COMMANDS, () => {
      console.log('[Immersion Engine] Event fired: GENERATION_AFTER_COMMANDS');
      injectCurrentState();
    });
  } else {
    console.warn('[Immersion Engine] GENERATION_AFTER_COMMANDS not found in eventTypes — primary hook NOT registered!');
  }

  // --- Secondary hook: GENERATION_STARTED -------------------------------------
  // Kept as a fallback/redundant hook. May fire too late to affect the
  // CURRENT generation in some ST versions, but is harmless to also call —
  // it ensures state is fresh for the *next* generation at minimum, and the
  // preview panel stays accurate.
  console.log('[Immersion Engine] Registering handler for GENERATION_STARTED');
  context.eventSource.on(context.eventTypes.GENERATION_STARTED, () => {
    console.log('[Immersion Engine] Event fired: GENERATION_STARTED');
    injectCurrentState();
  });

  // Also refresh on character switch so the preview panel and injected
  // state are correct immediately, without waiting for a generation.
  console.log('[Immersion Engine] Registering handler for CHAT_CHANGED');
  context.eventSource.on(context.eventTypes.CHAT_CHANGED, () => {
    console.log('[Immersion Engine] Event fired: CHAT_CHANGED');
    injectCurrentState();
  });

  console.log('[Immersion Engine] Initialization complete.');
});