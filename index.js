import { extension_settings, renderExtensionTemplateAsync } from '../../../extensions.js';
import { eventSource, event_types, saveSettingsDebounced } from '../../../../script.js';
import { promptManager, model_list, getChatCompletionModel } from '../../../openai.js';
import { initAssistant, setAssistantEnabled } from './assistant.js';

const MODULE_NAME = 'third-party/Streamline';
const SETTINGS_KEY = 'streamline';
const VERSION = '0.3.0';

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
};

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
    extension_settings[SETTINGS_KEY][key] = value;

    if (ALL_NEUTRALIZE_KEYS.has(key)) {
        if (value) {
            preserveValue(key);
            neutralize(key);
        } else {
            const restored = restoreValue(key);
            if (restored) {
                showRestoreNote(key);
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
    });

    // When ST's quick-edit textarea changes (user edited it directly),
    // pull into our field
    $(document).on('input', '#main_prompt_quick_edit_textarea', function () {
        $streamlinePrompt.val(this.value);
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
        console.log(`[Streamline] Re-applying persisted context: ${saved} (was reset to ${current})`);
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
                    console.log(`[Streamline] Detected context size from model_list: ${modelId} → ${ctx}`);
                    return ctx;
                }
            }
        }

        // Fallback: match against known model families
        const modelLower = modelId.toLowerCase();
        for (const [pattern, ctx] of Object.entries(MODEL_CONTEXT_FALLBACKS)) {
            if (modelLower.includes(pattern.toLowerCase())) {
                console.log(`[Streamline] Matched context size from fallback: ${modelId} → ${ctx} (pattern: ${pattern})`);
                return ctx;
            }
        }

        console.log(`[Streamline] No context size detected for model: ${modelId}`);
        return null;
    } catch (e) {
        console.warn('[Streamline] Error detecting model context:', e.message);
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
        console.log(`[Streamline] Auto-set context to ${detected} for ${modelName}`);

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
    });

    // Quick action: Reset All
    $('#streamline_reset_all').on('click', () => {
        setAllToggles(false);
        restorePMFields();
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

    // ---- Event-driven hooks (replace all setTimeout hacks) ----

    // SETTINGS_LOADED: ST has finished loading all settings.
    // Re-apply neutralizations that may have been overwritten by ST's load.
    eventSource.on(event_types.SETTINGS_LOADED, () => {
        console.log('[Streamline] SETTINGS_LOADED — re-applying active neutralizations');
        reapplyActiveNeutralizations();
    });

    // OAI_PRESET_CHANGED_AFTER: A preset was loaded, which may have
    // re-enabled instruct mode, changed context template, etc.
    eventSource.on(event_types.OAI_PRESET_CHANGED_AFTER, () => {
        console.log('[Streamline] OAI_PRESET_CHANGED_AFTER — re-applying active neutralizations');
        reapplyActiveNeutralizations();
    });

    // APP_READY: The app is fully initialized. Apply one-time defaults.
    eventSource.on(event_types.APP_READY, () => {
        console.log('[Streamline] APP_READY — applying one-time defaults');
        ensureStreamingDefault();
        // Do an initial sync of simplified controls now that DOM is fully ready
        syncCreativityFromST();
        syncResponseLengthFromST();
        updateContextDisplay();
        syncSystemPromptFromPM();
        // Try to detect model context on startup (model_list may already be populated)
        autoApplyModelContext();
    });

    // Model-aware auto-configuration: when user changes model or API source,
    // detect the new model's context window and auto-apply if needed.
    eventSource.on(event_types.CHATCOMPLETION_MODEL_CHANGED, (newModel) => {
        console.log(`[Streamline] Model changed to: ${newModel}`);
        // Small delay to let model_list update
        setTimeout(() => autoApplyModelContext(), 500);
    });

    eventSource.on(event_types.CHATCOMPLETION_SOURCE_CHANGED, (newSource) => {
        console.log(`[Streamline] CC source changed to: ${newSource}`);
        // Source change may clear model_list; context will update when model is selected
        updateModelInfoDisplay(null, null);
    });

    console.log('[Streamline] Extension initialized, waiting for ST events.');
});

export { MODULE_NAME };
