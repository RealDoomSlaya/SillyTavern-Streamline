import { extension_settings, renderExtensionTemplateAsync } from '../../../extensions.js';
import { eventSource, event_types, saveSettingsDebounced, setExtensionPrompt, extension_prompt_types, extension_prompt_roles } from '../../../../script.js';
import { promptManager, model_list, getChatCompletionModel } from '../../../openai.js';
import { initAssistant, setAssistantEnabled } from './assistant.js';

const MODULE_NAME = 'third-party/Streamline';
const SETTINGS_KEY = 'streamline';
const GM_INJECTION_KEY = 'streamline_gm_mode';
const VERSION = '0.4.0';

// =====================================================================
// Logging
// =====================================================================

const LOG_PREFIX = `[Streamline v${VERSION}]`;
const log = {
    info:  (...args) => console.log(LOG_PREFIX, ...args),
    warn:  (...args) => console.warn(LOG_PREFIX, ...args),
    error: (...args) => console.error(LOG_PREFIX, ...args),
    debug: (...args) => {
        if (extension_settings[SETTINGS_KEY]?._debug) console.debug(LOG_PREFIX, '[DEBUG]', ...args);
    },
    /** Log a state change — key/value pairs for what changed */
    state: (action, details) => console.log(LOG_PREFIX, `[${action}]`, details),
};

// =====================================================================
// Default Settings
// =====================================================================

const defaultSettings = {
    // Phase 1 — Basic Hide/Disable
    hide_text_completion: false,
    hide_advanced_formatting: false,
    hide_authors_note: false,
    hide_movingui: false,
    hide_autofix_markdown: false,
    hide_advanced_samplers: false,

    // Phase 2 — Deep Clean
    hide_nsfw_jailbreak: false,
    hide_example_separator: false,
    hide_chat_start_marker: false,
    hide_context_template: false,
    hide_instruct_mode: false,
    hide_cfg_scale: false,
    hide_token_padding: false,
    hide_response_formatting: false,
    hide_talkativeness: false,
    hide_persona_position: false,
    hide_group_chat: false,

    // Phase 2.5 — Preserved values (backup store for neutralized settings)
    _preserved: {},
    // Phase 2.5 — Preserved prompt manager toggle states
    _pmPreserved: {},
    // Phase 2.5 — Whether PM fields have been soft-disabled
    _pmFieldsDisabled: false,
    // Persisted context size — survives preset changes and reloads
    _contextSize: null,
    // Assistant — opt-in, OFF by default
    _assistantEnabled: false,
    // Assistant bubble colors (null = use CSS defaults)
    _userBubbleColor: null,
    _aiBubbleColor: null,
    // GM Mode
    _gmEnabled: false,
    _gmPrompt: null, // null = use default
    // Debug logging (verbose output to browser console)
    _debug: false,
};

// =====================================================================
// GM Mode — Default Injection Prompt
// =====================================================================

const DEFAULT_GM_PROMPT = `You are the Game Master and narrator of this story. You control the world, all non-player characters, the environment, and the consequences of actions. You do not control the player's character — their actions, thoughts, and decisions belong entirely to them.

Narrate the world's response to the player's actions. NPCs act autonomously with their own motivations, knowledge, and limitations — they do not know things they haven't witnessed or been told. The world is dynamic and does not wait for the player.`;

// Keys that are toggle-type (checkbox) settings
const TOGGLE_KEYS = Object.keys(defaultSettings).filter(k => !k.startsWith('_'));

// Maps setting keys to body CSS classes
const TOGGLE_MAP = {
    // Phase 1
    hide_text_completion: 'streamline--hide-text-completion',
    hide_advanced_formatting: 'streamline--hide-advanced-formatting',
    hide_authors_note: 'streamline--hide-authors-note',
    hide_movingui: 'streamline--hide-movingui',
    hide_autofix_markdown: 'streamline--hide-autofix-markdown',
    hide_advanced_samplers: 'streamline--hide-advanced-samplers',

    // Phase 2
    hide_nsfw_jailbreak: 'streamline--hide-nsfw-jailbreak',
    hide_example_separator: 'streamline--hide-example-separator',
    hide_chat_start_marker: 'streamline--hide-chat-start-marker',
    hide_context_template: 'streamline--hide-context-template',
    hide_instruct_mode: 'streamline--hide-instruct-mode',
    hide_cfg_scale: 'streamline--hide-cfg-scale',
    hide_token_padding: 'streamline--hide-token-padding',
    hide_response_formatting: 'streamline--hide-response-formatting',
    hide_talkativeness: 'streamline--hide-talkativeness',
    hide_persona_position: 'streamline--hide-persona-position',
    hide_group_chat: 'streamline--hide-group-chat',
};

// =====================================================================
// Phase 2.5 — Neutralization Definitions
// =====================================================================

/**
 * HARD neutralize — settings that are technically obsolete for cloud CC
 * narrative RP. When hidden, force these OFF unconditionally.
 */
const HARD_NEUTRALIZE = {
    hide_instruct_mode: {
        label: 'Disabled — irrelevant for cloud CC APIs',
        save() {
            const $el = $('#instruct_enabled');
            return $el.length ? $el.prop('checked') : null;
        },
        apply() {
            const $el = $('#instruct_enabled');
            if ($el.length && $el.prop('checked')) {
                $el.prop('checked', false).trigger('input');
            }
        },
        restore(saved) {
            if (saved === null || saved === undefined) return;
            const $el = $('#instruct_enabled');
            if ($el.length) {
                $el.prop('checked', saved).trigger('input');
            }
        },
    },
    hide_cfg_scale: {
        label: 'Disabled — irrelevant for cloud APIs',
        save() {
            const $el = $('#cfg_block_ooba input[type="range"]');
            return $el.length ? parseFloat($el.val()) : null;
        },
        apply() {
            const $el = $('#cfg_block_ooba input[type="range"]');
            if ($el.length) {
                $el.val(1).trigger('input');
            }
        },
        restore(saved) {
            if (saved === null || saved === undefined) return;
            const $el = $('#cfg_block_ooba input[type="range"]');
            if ($el.length) {
                $el.val(saved).trigger('input');
            }
        },
    },
    hide_token_padding: {
        label: 'Set to 0 — irrelevant for cloud APIs',
        save() {
            const $el = $('#token_padding');
            return $el.length ? parseInt($el.val()) : null;
        },
        apply() {
            const $el = $('#token_padding');
            if ($el.length) {
                $el.val(0).trigger('input');
            }
        },
        restore(saved) {
            if (saved === null || saved === undefined) return;
            const $el = $('#token_padding');
            if ($el.length) {
                $el.val(saved).trigger('input');
            }
        },
    },
    hide_context_template: {
        label: 'Reset to default — irrelevant for cloud CC APIs',
        save() {
            const $el = $('#context_presets');
            return $el.length ? $el.val() : null;
        },
        apply() {
            const $el = $('#context_presets');
            if ($el.length) {
                const $defaultOpt = $el.find('option').first();
                if ($defaultOpt.length) {
                    $el.val($defaultOpt.val()).trigger('change');
                }
            }
        },
        restore(saved) {
            if (saved === null || saved === undefined) return;
            const $el = $('#context_presets');
            if ($el.length) {
                $el.val(saved).trigger('change');
            }
        },
    },
};

/**
 * SOFT neutralize — settings where the user's system prompt handles
 * the behavior instead. When hidden, set to a neutral default.
 */
const SOFT_NEUTRALIZE = {
    hide_nsfw_jailbreak: {
        label: 'Managed by your system prompt',
        save() {
            // Read from prompt manager data model if available, fall back to textarea
            if (promptManager) {
                const nsfwPrompt = promptManager.getPromptById('nsfw');
                const jbPrompt = promptManager.getPromptById('jailbreak');
                return {
                    nsfw: nsfwPrompt ? nsfwPrompt.content : '',
                    jailbreak: jbPrompt ? jbPrompt.content : '',
                };
            }
            const nsfw = $('#nsfw_prompt_quick_edit_textarea').val() || '';
            const jailbreak = $('#jailbreak_prompt_quick_edit_textarea').val() || '';
            return { nsfw, jailbreak };
        },
        apply() {
            // Write to prompt manager data model + sync textarea
            if (promptManager) {
                const nsfwPrompt = promptManager.getPromptById('nsfw');
                const jbPrompt = promptManager.getPromptById('jailbreak');
                if (nsfwPrompt) nsfwPrompt.content = '';
                if (jbPrompt) jbPrompt.content = '';
                promptManager.saveServiceSettings();
            }
            const $nsfw = $('#nsfw_prompt_quick_edit_textarea');
            const $jb = $('#jailbreak_prompt_quick_edit_textarea');
            if ($nsfw.length) $nsfw.val('').trigger('input');
            if ($jb.length) $jb.val('').trigger('input');
        },
        restore(saved) {
            if (!saved) return;
            if (promptManager) {
                const nsfwPrompt = promptManager.getPromptById('nsfw');
                const jbPrompt = promptManager.getPromptById('jailbreak');
                if (nsfwPrompt && saved.nsfw) nsfwPrompt.content = saved.nsfw;
                if (jbPrompt && saved.jailbreak) jbPrompt.content = saved.jailbreak;
                promptManager.saveServiceSettings();
            }
            const $nsfw = $('#nsfw_prompt_quick_edit_textarea');
            const $jb = $('#jailbreak_prompt_quick_edit_textarea');
            if ($nsfw.length && saved.nsfw) $nsfw.val(saved.nsfw).trigger('input');
            if ($jb.length && saved.jailbreak) $jb.val(saved.jailbreak).trigger('input');
        },
    },
    hide_talkativeness: {
        label: 'Managed by your system prompt',
        save() {
            const $el = $('#talkativeness_slider');
            return $el.length ? parseFloat($el.val()) : null;
        },
        apply() {
            // Set value WITHOUT triggering 'input' — ST's input handler on
            // #talkativeness_slider calls saveCharacterDebounced() which can
            // throw errors if no character is loaded or image is invalid.
            const $el = $('#talkativeness_slider');
            if ($el.length) {
                $el.val(1.0);
            }
        },
        restore(saved) {
            if (saved === null || saved === undefined) return;
            const $el = $('#talkativeness_slider');
            if ($el.length) {
                $el.val(saved);
            }
        },
    },
    hide_example_separator: {
        label: 'Managed by your system prompt',
        save() {
            const $el = $('#context_example_separator');
            return $el.length ? $el.val() : null;
        },
        apply() {
            const $el = $('#context_example_separator');
            if ($el.length) $el.val('').trigger('input');
        },
        restore(saved) {
            if (saved === null || saved === undefined) return;
            const $el = $('#context_example_separator');
            if ($el.length) $el.val(saved).trigger('input');
        },
    },
    hide_chat_start_marker: {
        label: 'Managed by your system prompt',
        save() {
            const $el = $('#context_chat_start');
            return $el.length ? $el.val() : null;
        },
        apply() {
            const $el = $('#context_chat_start');
            if ($el.length) $el.val('').trigger('input');
        },
        restore(saved) {
            if (saved === null || saved === undefined) return;
            const $el = $('#context_chat_start');
            if ($el.length) $el.val(saved).trigger('input');
        },
    },
};

// All neutralizable keys
const ALL_NEUTRALIZE_KEYS = new Set([
    ...Object.keys(HARD_NEUTRALIZE),
    ...Object.keys(SOFT_NEUTRALIZE),
]);

// =====================================================================
// Phase 2.5 — Prompt Manager Field Toggling
// =====================================================================

const PM_FIELDS_TO_DISABLE = [
    'charDescription',
    'charPersonality',
    'scenario',
    'enhanceDefinitions',
    'nsfw',
    'dialogueExamples',
    'jailbreak',
];

const PM_FIELDS_TO_KEEP = [
    'main',
    'personaDescription',
    'worldInfoBefore',
    'worldInfoAfter',
    'chatHistory',
];

function getPMActiveCharacter() {
    if (!promptManager) return null;
    return promptManager.activeCharacter || null;
}

function readPMFieldStates() {
    const character = getPMActiveCharacter();
    if (!character || !promptManager) return {};

    const states = {};
    for (const id of [...PM_FIELDS_TO_DISABLE, ...PM_FIELDS_TO_KEEP]) {
        const entry = promptManager.getPromptOrderEntry(character, id);
        if (entry) {
            states[id] = entry.enabled;
        }
    }
    return states;
}

function setPMFieldStates(stateMap) {
    const character = getPMActiveCharacter();
    if (!character || !promptManager) return;

    let changed = false;
    for (const [id, enabled] of Object.entries(stateMap)) {
        const entry = promptManager.getPromptOrderEntry(character, id);
        if (entry && entry.enabled !== enabled) {
            entry.enabled = enabled;
            changed = true;
        }
    }

    if (changed) {
        promptManager.saveServiceSettings();
        // Note: We intentionally skip promptManager.render() here.
        // Calling render() can cascade into ST's character save logic
        // and trigger errors. saveServiceSettings() is sufficient to persist
        // the changes — the PM UI will update on next natural render cycle.
    }
}

function disablePMFields() {
    const settings = extension_settings[SETTINGS_KEY];

    // Only preserve if we haven't already (idempotent — safe to click multiple times)
    if (!settings._pmFieldsDisabled) {
        const currentStates = readPMFieldStates();
        if (Object.keys(currentStates).length > 0) {
            settings._pmPreserved = currentStates;
        }
    }

    const newStates = {};
    for (const id of PM_FIELDS_TO_DISABLE) {
        newStates[id] = false;
    }
    setPMFieldStates(newStates);

    settings._pmFieldsDisabled = true;
    saveSettingsDebounced();
}

function restorePMFields() {
    const settings = extension_settings[SETTINGS_KEY];

    if (settings._pmPreserved && Object.keys(settings._pmPreserved).length > 0) {
        setPMFieldStates(settings._pmPreserved);
        settings._pmPreserved = {};
    }

    settings._pmFieldsDisabled = false;
    saveSettingsDebounced();
}

// =====================================================================
// Phase 2.5 — Neutralize / Restore Logic
// =====================================================================

function preserveValue(key) {
    const settings = extension_settings[SETTINGS_KEY];
    if (!settings._preserved) settings._preserved = {};

    const def = HARD_NEUTRALIZE[key] || SOFT_NEUTRALIZE[key];
    if (def && settings._preserved[key] === undefined) {
        settings._preserved[key] = def.save();
    }
}

function neutralize(key) {
    const def = HARD_NEUTRALIZE[key] || SOFT_NEUTRALIZE[key];
    if (def) def.apply();
}

function restoreValue(key) {
    const settings = extension_settings[SETTINGS_KEY];
    if (!settings._preserved) return false;

    const saved = settings._preserved[key];
    if (saved === undefined) return false;

    const def = HARD_NEUTRALIZE[key] || SOFT_NEUTRALIZE[key];
    if (def) def.restore(saved);

    delete settings._preserved[key];
    saveSettingsDebounced();
    return true;
}

/**
 * Re-apply all active neutralizations.
 * Called on SETTINGS_LOADED and OAI_PRESET_CHANGED_AFTER to ensure
 * ST hasn't reverted our neutralized values during its own load/preset cycle.
 */
function reapplyActiveNeutralizations() {
    const settings = extension_settings[SETTINGS_KEY];
    if (!settings) return;

    const activeKeys = [...ALL_NEUTRALIZE_KEYS].filter(k => settings[k]);
    log.debug('Re-applying neutralizations:', activeKeys);

    for (const key of ALL_NEUTRALIZE_KEYS) {
        if (settings[key]) {
            neutralize(key);
        }
    }

    // Re-apply PM field disabling if it was active
    if (settings._pmFieldsDisabled) {
        const newStates = {};
        for (const id of PM_FIELDS_TO_DISABLE) {
            newStates[id] = false;
        }
        setPMFieldStates(newStates);
    }

    // Re-apply GM Mode injection
    applyGMMode();
}

function showRestoreNote(key) {
    const $label = $(`#streamline_${key}`).closest('.checkbox_label');
    const $existing = $label.find('.streamline-restore-note');
    if ($existing.length) return;

    const $note = $('<span class="streamline-restore-note">Restored previous value</span>');
    $label.append($note);

    setTimeout(() => {
        $note.fadeOut(500, () => $note.remove());
    }, 3000);
}

function updateManagedLabels() {
    const settings = extension_settings[SETTINGS_KEY];

    for (const [key, def] of Object.entries({ ...SOFT_NEUTRALIZE, ...HARD_NEUTRALIZE })) {
        const $label = $(`#streamline_${key}`).closest('.checkbox_label');
        const $managed = $label.find('.streamline-managed-label');
        const isActive = !!settings[key];

        if (isActive && $managed.length === 0) {
            $label.append(`<span class="streamline-managed-label">${def.label}</span>`);
        } else if (!isActive && $managed.length > 0) {
            $managed.remove();
        }
    }
}

// =====================================================================
// Hide Class Management
// =====================================================================

function applyHideClasses() {
    const settings = extension_settings[SETTINGS_KEY];
    for (const [key, className] of Object.entries(TOGGLE_MAP)) {
        document.body.classList.toggle(className, !!settings[key]);
    }
}

// =====================================================================
// Settings Persistence
// =====================================================================

function loadSettings() {
    if (!extension_settings[SETTINGS_KEY]) {
        extension_settings[SETTINGS_KEY] = {};
    }

    for (const [key, value] of Object.entries(defaultSettings)) {
        if (extension_settings[SETTINGS_KEY][key] === undefined) {
            extension_settings[SETTINGS_KEY][key] = value;
        }
    }

    for (const key of TOGGLE_KEYS) {
        $(`#streamline_${key}`).prop('checked', extension_settings[SETTINGS_KEY][key]);
    }

    applyHideClasses();
    updateManagedLabels();
}

function onToggleChange(key, value) {
    log.state('Toggle', `${key} → ${value ? 'ON' : 'OFF'}`);
    extension_settings[SETTINGS_KEY][key] = value;

    if (ALL_NEUTRALIZE_KEYS.has(key)) {
        if (value) {
            preserveValue(key);
            neutralize(key);
            log.debug(`Neutralized: ${key}`);
        } else {
            const restored = restoreValue(key);
            if (restored) {
                showRestoreNote(key);
                log.debug(`Restored: ${key}`);
            }
        }
    }

    applyHideClasses();
    updateManagedLabels();
    saveSettingsDebounced();
}

function setAllToggles(value) {
    const settings = extension_settings[SETTINGS_KEY];

    if (value) {
        for (const key of ALL_NEUTRALIZE_KEYS) {
            preserveValue(key);
        }
    }

    for (const key of TOGGLE_KEYS) {
        settings[key] = value;
        $(`#streamline_${key}`).prop('checked', value);
    }

    if (value) {
        for (const key of ALL_NEUTRALIZE_KEYS) {
            neutralize(key);
        }
    } else {
        for (const key of ALL_NEUTRALIZE_KEYS) {
            restoreValue(key);
        }
    }

    applyHideClasses();
    updateManagedLabels();
    saveSettingsDebounced();
}

// =====================================================================
// System Prompt Shortcut — uses promptManager data model
// =====================================================================

/**
 * Read the main system prompt content from the prompt manager's data model.
 * Falls back to the quick-edit textarea if promptManager isn't ready.
 * @returns {string}
 */
function readMainPromptContent() {
    if (promptManager) {
        const mainPrompt = promptManager.getPromptById('main');
        if (mainPrompt) {
            return mainPrompt.content || '';
        }
    }
    // Fallback: read from textarea if PM not initialized yet
    const $textarea = $('#main_prompt_quick_edit_textarea');
    return $textarea.length ? ($textarea.val() || '') : '';
}

/**
 * Write content to the main system prompt via the prompt manager's data model.
 * Also syncs the quick-edit textarea if it exists.
 * @param {string} content
 */
function writeMainPromptContent(content) {
    if (promptManager) {
        const mainPrompt = promptManager.getPromptById('main');
        if (mainPrompt) {
            mainPrompt.content = content;
            promptManager.saveServiceSettings();
            // Sync the quick-edit textarea if it's rendered
            const $textarea = $('#main_prompt_quick_edit_textarea');
            if ($textarea.length) {
                $textarea.val(content);
            }
            return;
        }
    }
    // Fallback: write to textarea directly
    const $textarea = $('#main_prompt_quick_edit_textarea');
    if ($textarea.length) {
        $textarea.val(content).trigger('input');
    }
}

/**
 * Sync Streamline's prompt textarea FROM the prompt manager.
 */
function syncSystemPromptFromPM() {
    const content = readMainPromptContent();
    $('#streamline_system_prompt').val(content);
}

function initSystemPromptShortcut() {
    const $streamlinePrompt = $('#streamline_system_prompt');

    // When user types in Streamline's field, push to PM data model
    $streamlinePrompt.on('input', function () {
        writeMainPromptContent(this.value);
        updateGMHint();
    });

    // When ST's quick-edit textarea changes (user edited it directly),
    // pull into our field
    $(document).on('input', '#main_prompt_quick_edit_textarea', function () {
        $streamlinePrompt.val(this.value);
        updateGMHint();
    });

    // Sync when the Streamline drawer is opened
    $(document).on('click', '#streamline_settings .inline-drawer-toggle', function () {
        // Small delay to let the drawer animation complete
        setTimeout(syncSystemPromptFromPM, 100);
    });

    // Event-driven sync: re-sync when chat changes (different character = different prompt)
    eventSource.on(event_types.CHAT_CHANGED, () => {
        syncSystemPromptFromPM();
    });

    // Event-driven sync: re-sync when settings are fully loaded
    eventSource.on(event_types.SETTINGS_LOADED, () => {
        syncSystemPromptFromPM();
    });

    // Event-driven sync: re-sync when OAI preset changes (may replace prompt content)
    eventSource.on(event_types.OAI_PRESET_CHANGED_AFTER, () => {
        syncSystemPromptFromPM();
    });
}

// =====================================================================
// Simplified Controls — Temperature (Creativity)
// =====================================================================

function readSTTemperature() {
    const $slider = $('#temp_openai');
    return $slider.length ? (parseFloat($slider.val()) || 1.0) : 1.0;
}

function writeSTTemperature(value) {
    const $slider = $('#temp_openai');
    const $counter = $('#temp_counter_openai');
    if ($slider.length) $slider.val(value).trigger('input');
    if ($counter.length) $counter.val(value).trigger('input');
}

function updateCreativityHighlight(value) {
    const valStr = String(value);
    $('#streamline_creativity_presets .streamline-preset-btn').each(function () {
        $(this).toggleClass('active', $(this).data('value').toString() === valStr);
    });
}

function syncCreativityFromST() {
    const temp = readSTTemperature();
    $('#streamline_temp_slider').val(temp);
    $('#streamline_temp_value').val(temp);
    updateCreativityHighlight(temp);
}

function initCreativityControls() {
    $('#streamline_creativity_presets').on('click', '.streamline-preset-btn', function () {
        const value = parseFloat($(this).data('value'));
        writeSTTemperature(value);
        $('#streamline_temp_slider').val(value);
        $('#streamline_temp_value').val(value);
        updateCreativityHighlight(value);
    });

    $('#streamline_temp_slider').on('input', function () {
        const value = parseFloat(this.value);
        writeSTTemperature(value);
        $('#streamline_temp_value').val(value);
        updateCreativityHighlight(value);
    });

    $('#streamline_temp_value').on('input', function () {
        const value = parseFloat(this.value);
        if (!isNaN(value) && value >= 0 && value <= 2) {
            writeSTTemperature(value);
            $('#streamline_temp_slider').val(value);
            updateCreativityHighlight(value);
        }
    });

    $('#streamline_creativity_advanced_toggle').on('click', function () {
        $('#streamline_creativity_advanced').toggle();
    });

    // Bidirectional sync when ST's slider changes externally
    $(document).on('input', '#temp_openai, #temp_counter_openai', syncCreativityFromST);

    // Event-driven sync instead of setTimeout
    eventSource.on(event_types.SETTINGS_LOADED, syncCreativityFromST);
    eventSource.on(event_types.OAI_PRESET_CHANGED_AFTER, syncCreativityFromST);
}

// =====================================================================
// Simplified Controls — Max Response Length
// =====================================================================

function readSTMaxTokens() {
    const $input = $('#openai_max_tokens');
    return $input.length ? (parseInt($input.val()) || 600) : 600;
}

function writeSTMaxTokens(value) {
    const $input = $('#openai_max_tokens');
    if ($input.length) $input.val(value).trigger('input');
}

function updateResponseLengthHighlight(value) {
    const valStr = String(value);
    $('#streamline_response_length_presets .streamline-preset-btn').each(function () {
        $(this).toggleClass('active', $(this).data('value').toString() === valStr);
    });
}

function syncResponseLengthFromST() {
    const tokens = readSTMaxTokens();
    $('#streamline_max_tokens_value').val(tokens);
    updateResponseLengthHighlight(tokens);
}

function initResponseLengthControls() {
    $('#streamline_response_length_presets').on('click', '.streamline-preset-btn', function () {
        const value = parseInt($(this).data('value'));
        writeSTMaxTokens(value);
        $('#streamline_max_tokens_value').val(value);
        updateResponseLengthHighlight(value);
    });

    $('#streamline_max_tokens_value').on('input', function () {
        const value = parseInt(this.value);
        if (!isNaN(value) && value >= 1) {
            writeSTMaxTokens(value);
            updateResponseLengthHighlight(value);
        }
    });

    $('#streamline_response_length_advanced_toggle').on('click', function () {
        $('#streamline_response_length_advanced').toggle();
    });

    $(document).on('input', '#openai_max_tokens', syncResponseLengthFromST);

    // Event-driven sync
    eventSource.on(event_types.SETTINGS_LOADED, syncResponseLengthFromST);
    eventSource.on(event_types.OAI_PRESET_CHANGED_AFTER, syncResponseLengthFromST);
}

// =====================================================================
// Simplified Controls — Context Size
// =====================================================================

function readSTContextSize() {
    const $slider = $('#openai_max_context');
    return $slider.length ? (parseInt($slider.val()) || 4096) : 4096;
}

function writeSTContextSize(value) {
    const $slider = $('#openai_max_context');
    const $counter = $('#openai_max_context_counter');
    if ($slider.length) {
        const $unlock = $('#oai_max_context_unlocked');
        if ($unlock.length && !$unlock.prop('checked') && value > 4095) {
            $unlock.prop('checked', true).trigger('change');
        }
        $slider.attr('max', Math.max(value, parseInt($slider.attr('max')) || 4095));
        $slider.val(value).trigger('input');
    }
    if ($counter.length) {
        $counter.val(value).trigger('input');
    }

    // Persist the user's context choice so it survives preset changes and reloads
    const settings = extension_settings[SETTINGS_KEY];
    if (settings) {
        settings._contextSize = value;
        saveSettingsDebounced();
    }
}

function formatContextSize(size) {
    if (size >= 1000000) {
        return `${(size / 1000000).toFixed(size % 1000000 === 0 ? 0 : 1)}M`;
    }
    if (size >= 1000) {
        return `${(size / 1000).toFixed(size % 1000 === 0 ? 0 : 1)}k`;
    }
    return String(size);
}

function updateContextDisplay() {
    const size = readSTContextSize();
    $('#streamline_context_display').text(formatContextSize(size));
    $('#streamline_context_value').val(size);
    updateContextHighlight(size);
}

function updateContextHighlight(value) {
    const valStr = String(value);
    $('#streamline_context_presets .streamline-preset-btn').each(function () {
        $(this).toggleClass('active', $(this).data('value').toString() === valStr);
    });
}

function initContextControls() {
    // Preset buttons
    $('#streamline_context_presets').on('click', '.streamline-preset-btn', function () {
        const value = parseInt($(this).data('value'));
        writeSTContextSize(value);
        updateContextDisplay();
    });

    $('#streamline_context_apply').on('click', function () {
        const value = parseInt($('#streamline_context_value').val());
        if (!isNaN(value) && value >= 512) {
            writeSTContextSize(value);
            updateContextDisplay();
        }
    });

    $('#streamline_context_advanced_toggle').on('click', function () {
        $('#streamline_context_advanced').toggle();
    });

    $(document).on('input', '#openai_max_context, #openai_max_context_counter', updateContextDisplay);

    // Event-driven sync
    eventSource.on(event_types.SETTINGS_LOADED, () => {
        reapplyPersistedContext();
        updateContextDisplay();
    });
    eventSource.on(event_types.OAI_PRESET_CHANGED_AFTER, () => {
        // Preset may have reset context to a low value — re-apply our persisted choice
        reapplyPersistedContext();
        updateContextDisplay();
    });
}

/**
 * Re-apply the user's persisted context size if a preset or reload
 * has reset it to a low value.
 */
function reapplyPersistedContext() {
    const settings = extension_settings[SETTINGS_KEY];
    if (!settings?._contextSize) return;

    const current = readSTContextSize();
    const saved = settings._contextSize;

    // Only re-apply if preset/reload reverted to a low default
    if (current <= 4096 && saved > 4096) {
        log.info(`Re-applying persisted context: ${saved} (was reset to ${current})`);
        writeSTContextSize(saved);
    }
}

// =====================================================================
// Model-Aware Auto-Configuration
// =====================================================================

/**
 * Fallback context sizes for known model families when model_list
 * metadata doesn't include context_length. Keyed by partial model ID match.
 */
const MODEL_CONTEXT_FALLBACKS = {
    // Claude family
    'claude-3-5-sonnet': 200000,
    'claude-3-5-haiku': 200000,
    'claude-3-opus': 200000,
    'claude-3-sonnet': 200000,
    'claude-3-haiku': 200000,
    'claude-4': 200000,
    // Gemini family
    'gemini-2.5-pro': 1000000,
    'gemini-2.5-flash': 1000000,
    'gemini-2.0': 1000000,
    'gemini-1.5-pro': 1000000,
    'gemini-1.5-flash': 1000000,
    // GLM family
    'glm-5': 128000,
    'glm-4': 128000,
    // GPT family
    'gpt-4o': 128000,
    'gpt-4-turbo': 128000,
    'gpt-4-1': 1000000,
    'o1': 200000,
    'o3': 200000,
    'o4-mini': 200000,
    // DeepSeek
    'deepseek-chat': 128000,
    'deepseek-r1': 128000,
    // Mistral
    'mistral-large': 128000,
    'mistral-medium': 32000,
    // Llama
    'llama-3.3': 128000,
    'llama-3.1': 128000,
    'llama-3': 8000,
    // Qwen
    'qwen-2.5': 128000,
    'qwen-3': 128000,
};

/**
 * Detect the context window size for the currently selected model.
 * Checks model_list metadata first, falls back to known model families.
 * @returns {number|null} Context size in tokens, or null if unknown
 */
function detectModelContextSize() {
    try {
        const modelId = getChatCompletionModel();
        if (!modelId) return null;

        // Check model_list metadata (populated after API connection)
        if (Array.isArray(model_list) && model_list.length > 0) {
            const modelInfo = model_list.find(m => m.id === modelId);
            if (modelInfo) {
                const ctx = modelInfo.context_length
                    || modelInfo.context_window
                    || modelInfo.max_context_length
                    || modelInfo.max_model_len;
                if (ctx && ctx > 0) {
                    log.debug(`Context from model_list: ${modelId} → ${ctx}`);
                    return ctx;
                }
            }
        }

        // Fallback: match against known model families
        const modelLower = modelId.toLowerCase();
        for (const [pattern, ctx] of Object.entries(MODEL_CONTEXT_FALLBACKS)) {
            if (modelLower.includes(pattern.toLowerCase())) {
                log.debug(`Context from fallback: ${modelId} → ${ctx} (pattern: ${pattern})`);
                return ctx;
            }
        }

        log.debug(`No context size detected for model: ${modelId}`);
        return null;
    } catch (e) {
        log.warn('Error detecting model context:', e.message);
        return null;
    }
}

/**
 * Get a human-readable model name for display.
 * @returns {string|null}
 */
function getModelDisplayName() {
    try {
        const modelId = getChatCompletionModel();
        if (!modelId) return null;

        // Check model_list for a friendly name
        if (Array.isArray(model_list) && model_list.length > 0) {
            const modelInfo = model_list.find(m => m.id === modelId);
            if (modelInfo?.name) return modelInfo.name;
        }

        return modelId;
    } catch {
        return null;
    }
}

/**
 * Auto-apply detected context size to ST's settings.
 * Only applies if the detected size differs significantly from current.
 * Shows a notification in the context display area.
 */
function autoApplyModelContext() {
    const detected = detectModelContextSize();
    if (!detected) return;

    const current = readSTContextSize();
    const modelName = getModelDisplayName();

    // Only auto-apply if current context is suspiciously low (default preset value)
    // or if the user hasn't manually set something
    if (current <= 4096) {
        writeSTContextSize(detected);
        updateContextDisplay();
        log.info(`Auto-set context to ${detected} for ${modelName}`);

        // Show brief notification
        const $display = $('#streamline_context_display');
        const originalText = $display.text();
        $display.text(`${originalText} ✓`);
        setTimeout(() => updateContextDisplay(), 2000);
    }

    // Always update the model info display
    updateModelInfoDisplay(modelName, detected);
}

/**
 * Update the model info line in the context section.
 */
function updateModelInfoDisplay(modelName, contextSize) {
    const $info = $('#streamline_model_info');
    if (modelName && contextSize) {
        $info.text(`${modelName} — ${formatContextSize(contextSize)} max`).show();
    } else if (modelName) {
        $info.text(`${modelName}`).show();
    } else {
        $info.hide();
    }
}

// =====================================================================
// Self-Managed Defaults — Streaming
// =====================================================================

/**
 * Apply a custom bubble color to the assistant chat via CSS custom properties.
 * @param {'user'|'ai'} who - Which bubble to style
 * @param {string|null} hexColor - Hex color or null to reset
 */
// =====================================================================
// GM Mode — Injection Logic
// =====================================================================

/**
 * Get the current GM prompt text (user-customized or default).
 * @returns {string}
 */
function getGMPrompt() {
    const settings = extension_settings[SETTINGS_KEY];
    return settings?._gmPrompt || DEFAULT_GM_PROMPT;
}

/**
 * Apply or remove the GM Mode injection based on current state.
 * Uses setExtensionPrompt with BEFORE_PROMPT position so it layers
 * underneath the user's system prompt (user prompt has the final word).
 */
function applyGMMode() {
    const settings = extension_settings[SETTINGS_KEY];
    const enabled = !!settings?._gmEnabled;

    if (enabled) {
        const prompt = getGMPrompt();
        setExtensionPrompt(
            GM_INJECTION_KEY,
            prompt,
            extension_prompt_types.BEFORE_PROMPT,
            0,          // depth (not used for BEFORE_PROMPT)
            false,      // scan (don't include in world info scan)
            extension_prompt_roles.SYSTEM,
        );
        log.state('GM Mode', 'ON — injection active');
    } else {
        // Clear the injection by setting empty value
        setExtensionPrompt(
            GM_INJECTION_KEY,
            '',
            extension_prompt_types.NONE,
            0,
        );
        log.state('GM Mode', 'OFF — injection cleared');
    }
}

/**
 * Analyze the user's system prompt and update the GM Mode hint.
 * Shows contextual guidance:
 * - Empty prompt → suggest enabling GM Mode
 * - Chatbot-style prompt → suggest GM Mode to reframe
 * - Already has GM/narrator framing → note GM Mode is redundant
 */
function updateGMHint() {
    const $hint = $('#streamline_gm_detection_hint');
    if (!$hint.length) return;

    const prompt = readMainPromptContent().toLowerCase();
    const gmEnabled = !!extension_settings[SETTINGS_KEY]?._gmEnabled;

    // Keywords that indicate GM/narrator framing already exists
    const gmKeywords = ['game master', 'narrator', 'narrate', 'dungeon master', 'you control the world',
        'you are the gm', 'you are the dm', 'npc', 'player character', 'player\'s character',
        'player agency', 'non-player character'];

    // Keywords that suggest chatbot-style usage
    const chatbotKeywords = ['you are a helpful', 'you are an ai', 'as an assistant',
        'you are a chatbot', 'respond to the user', 'answer questions'];

    const hasGMFraming = gmKeywords.some(kw => prompt.includes(kw));
    const hasChatbotFraming = chatbotKeywords.some(kw => prompt.includes(kw));
    const isEmpty = prompt.trim().length < 20;

    if (isEmpty && !gmEnabled) {
        $hint.html('<i class="fa-solid fa-lightbulb"></i> No system prompt detected. GM Mode will give the AI a foundation to work from — recommended for narrative RP.').show();
    } else if (hasChatbotFraming && !gmEnabled) {
        $hint.html('<i class="fa-solid fa-triangle-exclamation"></i> Your system prompt looks chatbot-oriented. Enable GM Mode to reframe the AI as a narrator/game master instead.').show();
    } else if (hasGMFraming && gmEnabled) {
        $hint.html('<i class="fa-solid fa-circle-check"></i> Your system prompt already has GM/narrator framing. GM Mode is active but redundant — you can disable it to save tokens.').show();
    } else if (hasGMFraming && !gmEnabled) {
        $hint.html('<i class="fa-solid fa-circle-check"></i> Your system prompt already establishes a GM/narrator role. GM Mode not needed.').show();
    } else {
        $hint.hide();
    }
}

function applyBubbleColor(who, hexColor) {
    const root = document.documentElement;
    if (who === 'user') {
        if (hexColor) {
            root.style.setProperty('--streamline-user-bubble-bg', hexColor + '40'); // 25% opacity
            root.style.setProperty('--streamline-user-bubble-border', hexColor + '66'); // 40% opacity
            root.style.setProperty('--streamline-user-bubble-text', '');
        } else {
            root.style.removeProperty('--streamline-user-bubble-bg');
            root.style.removeProperty('--streamline-user-bubble-border');
            root.style.removeProperty('--streamline-user-bubble-text');
        }
    } else {
        if (hexColor) {
            root.style.setProperty('--streamline-ai-bubble-bg', hexColor + '20'); // 12% opacity
            root.style.setProperty('--streamline-ai-bubble-text', '');
        } else {
            root.style.removeProperty('--streamline-ai-bubble-bg');
            root.style.removeProperty('--streamline-ai-bubble-text');
        }
    }
}

function ensureStreamingDefault() {
    const settings = extension_settings[SETTINGS_KEY];

    if (settings._streamingDefaultApplied) return;

    const $streamToggle = $('#stream_toggle');
    if ($streamToggle.length && !$streamToggle.prop('checked')) {
        $streamToggle.prop('checked', true).trigger('input');
    }

    settings._streamingDefaultApplied = true;
    saveSettingsDebounced();
}

// =====================================================================
// Initialization
// =====================================================================

jQuery(async function () {
    // Render and inject settings panel
    const settingsHtml = await renderExtensionTemplateAsync(
        'third-party/Streamline',
        'settings',
    );
    $('#extensions_settings2').append(settingsHtml);

    // Bind all toggle checkboxes
    for (const key of TOGGLE_KEYS) {
        $(`#streamline_${key}`).on('change', function () {
            onToggleChange(key, !!this.checked);
        });
    }

    // Quick action: Apply Narrative Defaults
    $('#streamline_apply_narrative_defaults').on('click', () => {
        log.state('Quick Action', 'Apply Narrative Defaults');
        setAllToggles(true);
        disablePMFields();

        // Enable streaming
        const $streamToggle = $('#stream_toggle');
        if ($streamToggle.length && !$streamToggle.prop('checked')) {
            $streamToggle.prop('checked', true).trigger('input');
        }

        // Set context size using model detection, fallback to 128k
        // This prevents "Mandatory prompts exceed the context size" errors
        const currentContext = readSTContextSize();
        if (currentContext <= 4096) {
            const detected = detectModelContextSize();
            writeSTContextSize(detected || 128000);
            updateContextDisplay();
        }

        // Enable GM Mode
        extension_settings[SETTINGS_KEY]._gmEnabled = true;
        $('#streamline_gm_enabled').prop('checked', true);
        $('#streamline_gm_prompt_section').show();
        applyGMMode();
    });

    // Quick action: Reset All
    $('#streamline_reset_all').on('click', () => {
        log.state('Quick Action', 'Reset All');
        setAllToggles(false);
        restorePMFields();

        // Disable GM Mode
        extension_settings[SETTINGS_KEY]._gmEnabled = false;
        $('#streamline_gm_enabled').prop('checked', false);
        $('#streamline_gm_prompt_section').hide();
        applyGMMode();
    });

    // Load saved settings and apply hide classes immediately
    // (CSS classes don't depend on ST's settings being loaded)
    loadSettings();

    // Display version in the drawer header
    $('#streamline_version').text(`v${VERSION}`);

    // Initialize all simplified controls and system prompt shortcut
    // (these register event listeners that will fire when ST is ready)
    initSystemPromptShortcut();
    initCreativityControls();
    initResponseLengthControls();
    initContextControls();

    // Initialize assistant (creates UI elements, stays hidden until enabled)
    initAssistant();
    const assistantEnabled = !!extension_settings[SETTINGS_KEY]._assistantEnabled;
    $('#streamline_assistant_enabled').prop('checked', assistantEnabled);
    setAssistantEnabled(assistantEnabled);

    $('#streamline_assistant_enabled').on('change', function () {
        const enabled = !!this.checked;
        extension_settings[SETTINGS_KEY]._assistantEnabled = enabled;
        setAssistantEnabled(enabled);
        saveSettingsDebounced();
    });

    // Assistant color customization
    $('#streamline_assistant_colors_toggle').on('click', function () {
        $('#streamline_assistant_colors').toggle();
    });

    // Load saved colors
    const savedUserColor = extension_settings[SETTINGS_KEY]._userBubbleColor;
    const savedAiColor = extension_settings[SETTINGS_KEY]._aiBubbleColor;
    if (savedUserColor) {
        $('#streamline_user_bubble_color').val(savedUserColor);
        applyBubbleColor('user', savedUserColor);
    }
    if (savedAiColor) {
        $('#streamline_ai_bubble_color').val(savedAiColor);
        applyBubbleColor('ai', savedAiColor);
    }

    $('#streamline_user_bubble_color').on('input', function () {
        const color = $(this).val();
        extension_settings[SETTINGS_KEY]._userBubbleColor = color;
        applyBubbleColor('user', color);
        saveSettingsDebounced();
    });

    $('#streamline_ai_bubble_color').on('input', function () {
        const color = $(this).val();
        extension_settings[SETTINGS_KEY]._aiBubbleColor = color;
        applyBubbleColor('ai', color);
        saveSettingsDebounced();
    });

    $('#streamline_user_bubble_reset').on('click', function () {
        delete extension_settings[SETTINGS_KEY]._userBubbleColor;
        $('#streamline_user_bubble_color').val('#5a8fd4');
        applyBubbleColor('user', null);
        saveSettingsDebounced();
    });

    $('#streamline_ai_bubble_reset').on('click', function () {
        delete extension_settings[SETTINGS_KEY]._aiBubbleColor;
        $('#streamline_ai_bubble_color').val('#888888');
        applyBubbleColor('ai', null);
        saveSettingsDebounced();
    });

    // ---- Debug Logging ----
    $('#streamline_debug').prop('checked', !!extension_settings[SETTINGS_KEY]._debug);
    $('#streamline_debug').on('change', function () {
        extension_settings[SETTINGS_KEY]._debug = !!this.checked;
        saveSettingsDebounced();
        log.info(`Debug logging ${this.checked ? 'enabled' : 'disabled'}`);
    });

    // ---- GM Mode ----

    const gmEnabled = !!extension_settings[SETTINGS_KEY]._gmEnabled;
    $('#streamline_gm_enabled').prop('checked', gmEnabled);
    if (gmEnabled) {
        $('#streamline_gm_prompt_section').show();
    }

    // Load custom GM prompt or show default
    const gmPromptText = extension_settings[SETTINGS_KEY]._gmPrompt || DEFAULT_GM_PROMPT;
    $('#streamline_gm_prompt').val(gmPromptText);

    // Apply GM mode on load (will inject or clear based on state)
    applyGMMode();

    $('#streamline_gm_enabled').on('change', function () {
        const enabled = !!this.checked;
        extension_settings[SETTINGS_KEY]._gmEnabled = enabled;
        $('#streamline_gm_prompt_section').toggle(enabled);
        applyGMMode();
        updateGMHint();
        saveSettingsDebounced();
    });

    $('#streamline_gm_prompt').on('input', function () {
        const text = $(this).val().trim();
        // Store custom prompt, or null if it matches the default
        if (text === DEFAULT_GM_PROMPT || text === '') {
            extension_settings[SETTINGS_KEY]._gmPrompt = null;
        } else {
            extension_settings[SETTINGS_KEY]._gmPrompt = text;
        }
        // Re-apply injection with new text
        if (extension_settings[SETTINGS_KEY]._gmEnabled) {
            applyGMMode();
        }
        saveSettingsDebounced();
    });

    $('#streamline_gm_reset_prompt').on('click', function () {
        extension_settings[SETTINGS_KEY]._gmPrompt = null;
        $('#streamline_gm_prompt').val(DEFAULT_GM_PROMPT);
        if (extension_settings[SETTINGS_KEY]._gmEnabled) {
            applyGMMode();
        }
        saveSettingsDebounced();
    });

    // ---- Event-driven hooks (replace all setTimeout hacks) ----

    // SETTINGS_LOADED: ST has finished loading all settings.
    // Re-apply neutralizations that may have been overwritten by ST's load.
    eventSource.on(event_types.SETTINGS_LOADED, () => {
        log.info('SETTINGS_LOADED — re-applying active neutralizations');
        reapplyActiveNeutralizations();
    });

    // OAI_PRESET_CHANGED_AFTER: A preset was loaded, which may have
    // re-enabled instruct mode, changed context template, etc.
    eventSource.on(event_types.OAI_PRESET_CHANGED_AFTER, () => {
        log.info('OAI_PRESET_CHANGED_AFTER — re-applying active neutralizations');
        reapplyActiveNeutralizations();
    });

    // APP_READY: The app is fully initialized. Apply one-time defaults.
    eventSource.on(event_types.APP_READY, () => {
        log.info('APP_READY — applying one-time defaults');
        ensureStreamingDefault();
        // Do an initial sync of simplified controls now that DOM is fully ready
        syncCreativityFromST();
        syncResponseLengthFromST();
        updateContextDisplay();
        syncSystemPromptFromPM();
        // Update GM Mode hint now that prompt is loaded
        updateGMHint();
        // Try to detect model context on startup (model_list may already be populated)
        autoApplyModelContext();
    });

    // Model-aware auto-configuration: when user changes model or API source,
    // detect the new model's context window and auto-apply if needed.
    eventSource.on(event_types.CHATCOMPLETION_MODEL_CHANGED, (newModel) => {
        log.info(`Model changed to: ${newModel}`);
        // Small delay to let model_list update
        setTimeout(() => autoApplyModelContext(), 500);
    });

    eventSource.on(event_types.CHATCOMPLETION_SOURCE_CHANGED, (newSource) => {
        log.info(`CC source changed to: ${newSource}`);
        // Source change may clear model_list; context will update when model is selected
        updateModelInfoDisplay(null, null);
    });

    log.info('Extension initialized, waiting for ST events.');
});

export { MODULE_NAME };
