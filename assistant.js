/**
 * Streamline Assistant — AI-powered configuration help
 * Uses the user's connected API to answer questions about ST and its extensions.
 *
 * This module is self-contained and only activated when the user explicitly
 * enables the assistant toggle in Streamline's settings.
 */

import { getRequestHeaders } from '../../../../script.js';
import { model_list, getChatCompletionModel, chat_completion_sources } from '../../../openai.js';
import { getContext } from '../../../st-context.js';

// =====================================================================
// System Prompt
// =====================================================================

const ASSISTANT_SYSTEM_PROMPT = `You are the Streamline Assistant, a helpful AI built into the Streamline extension for SillyTavern (ST). Your primary role is helping users configure SillyTavern and its extensions.

## What you know:
- SillyTavern is a platform for AI-powered roleplay and chat, connecting to cloud APIs (Claude, Gemini, GPT, GLM, DeepSeek, etc.)
- You are running inside SillyTavern right now, using the user's connected API
- Streamline is an extension that simplifies ST by hiding legacy bloat and providing clean controls
- You have access to information about the user's current setup (installed extensions, API connection, settings)

## How to help:
- Explain what ST settings and toggles do in plain language
- Help configure extensions based on what they're trying to accomplish
- Answer questions about API connections, presets, prompt management, and character cards
- Give advice on system prompts, lorebooks, and narrative RP workflows
- If you can see an extension's settings panel, explain each field and recommend values

## Style:
- Be concise and direct — users want answers, not essays
- Use bullet points for multi-step instructions
- If you don't know something specific, say so rather than guessing
- You can help with general RP questions too, but your expertise is ST configuration`;

// =====================================================================
// Context Gathering
// =====================================================================

/**
 * Gather current ST state for the assistant's context.
 */
function gatherContext() {
    const parts = [];

    // 1. Current API connection
    try {
        const ctx = getContext();
        const settings = ctx.chatCompletionSettings;
        const source = settings?.chat_completion_source || 'unknown';
        const model = getChatCompletionModel() || 'unknown';
        parts.push(`## Current API Connection\n- Source: ${source}\n- Model: ${model}`);
    } catch {
        parts.push('## Current API Connection\n- Unable to detect');
    }

    // 2. Installed extensions (read from DOM)
    try {
        const extensions = [];
        $('#extensions_settings2 .inline-drawer-header b, #extensions_settings .inline-drawer-header b').each(function () {
            const name = $(this).text().trim();
            if (name && name !== 'Streamline') {
                extensions.push(name);
            }
        });
        if (extensions.length > 0) {
            parts.push(`## Installed Extensions\n${extensions.map(e => `- ${e}`).join('\n')}`);
        }
    } catch {
        // Silent fail
    }

    // 3. Streamline settings state
    try {
        const ctx = getContext();
        const streamlineSettings = ctx.extensionSettings?.streamline;
        if (streamlineSettings) {
            const activeHides = Object.entries(streamlineSettings)
                .filter(([k, v]) => !k.startsWith('_') && v === true)
                .map(([k]) => k.replace('hide_', '').replace(/_/g, ' '));
            if (activeHides.length > 0) {
                parts.push(`## Active Streamline Hides\n${activeHides.map(h => `- ${h}`).join('\n')}`);
            } else {
                parts.push('## Streamline State\nNo hides currently active');
            }
        }
    } catch {
        // Silent fail
    }

    return parts.join('\n\n');
}

/**
 * Read a specific extension's settings panel HTML for the assistant to analyze.
 * @param {string} extensionName - The display name of the extension
 * @returns {string|null} Simplified representation of the extension's settings
 */
function readExtensionPanel(extensionName) {
    let found = null;

    $('#extensions_settings2 .inline-drawer, #extensions_settings .inline-drawer').each(function () {
        const $header = $(this).find('.inline-drawer-header b').first();
        if ($header.text().trim().toLowerCase() === extensionName.toLowerCase()) {
            const $content = $(this).find('.inline-drawer-content').first();
            if ($content.length) {
                // Extract a simplified representation: labels, inputs, checkboxes, selects
                const fields = [];
                $content.find('label, .checkbox_label').each(function () {
                    const text = $(this).text().trim().replace(/\s+/g, ' ');
                    if (text) fields.push(`- ${text}`);
                });
                $content.find('select').each(function () {
                    const id = $(this).attr('id') || '';
                    const val = $(this).val() || '';
                    fields.push(`- [Dropdown: ${id}] Current: ${val}`);
                });
                $content.find('input[type="range"]').each(function () {
                    const id = $(this).attr('id') || '';
                    const val = $(this).val() || '';
                    fields.push(`- [Slider: ${id}] Value: ${val}`);
                });
                $content.find('textarea').each(function () {
                    const id = $(this).attr('id') || '';
                    const val = ($(this).val() || '').substring(0, 100);
                    fields.push(`- [Text area: ${id}] ${val ? `"${val}..."` : '(empty)'}`);
                });

                if (fields.length > 0) {
                    found = `## ${extensionName} Settings Panel\n${fields.join('\n')}`;
                }
            }
        }
    });

    return found;
}

// =====================================================================
// API Communication
// =====================================================================

/**
 * Send a message to the user's connected API via ST's backend proxy.
 * @param {Array} messages - OpenAI-format messages array
 * @param {AbortSignal} signal - Abort signal for cancellation
 * @param {function} onChunk - Callback for streaming chunks
 * @returns {Promise<string>} Full response text
 */
async function sendToAPI(messages, signal, onChunk) {
    const ctx = getContext();
    const settings = ctx.chatCompletionSettings;
    const source = settings?.chat_completion_source || 'openai';
    const model = getChatCompletionModel() || '';

    const requestData = {
        stream: true,
        messages,
        model,
        chat_completion_source: source,
        max_tokens: 2000,
        temperature: 0.7,
        type: 'quiet', // 'quiet' type doesn't affect the main chat
    };

    const response = await fetch('/api/backends/chat-completions/generate', {
        method: 'POST',
        headers: getRequestHeaders(),
        cache: 'no-cache',
        body: JSON.stringify(requestData),
        signal,
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API error (${response.status}): ${errorText.substring(0, 200)}`);
    }

    // Parse streaming response
    let fullText = '';
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('data:')) continue;

            const data = trimmed.slice(5).trim();
            if (data === '[DONE]') continue;

            try {
                const parsed = JSON.parse(data);
                const delta = parsed?.choices?.[0]?.delta?.content || '';
                if (delta) {
                    fullText += delta;
                    if (onChunk) onChunk(fullText);
                }
            } catch {
                // Skip unparseable chunks
            }
        }
    }

    return fullText;
}

// =====================================================================
// Chat UI
// =====================================================================

let chatHistory = [];
let currentAbortController = null;

function createAssistantUI() {
    // Floating button (only visible when assistant is enabled)
    const buttonHtml = `
        <div id="streamline_assistant_btn" class="streamline-assistant-fab" title="Streamline Assistant" style="display: none;">
            <i class="fa-solid fa-robot"></i>
        </div>
    `;

    // Floating modal
    const modalHtml = `
        <div id="streamline_assistant_modal" class="streamline-assistant-modal" style="display: none;">
            <div class="streamline-assistant-header">
                <span class="streamline-assistant-title">
                    <i class="fa-solid fa-robot"></i> Streamline Assistant
                </span>
                <div class="streamline-assistant-header-actions">
                    <span id="streamline_assistant_clear" class="streamline-assistant-header-btn" title="Clear chat">
                        <i class="fa-solid fa-trash-can"></i>
                    </span>
                    <span id="streamline_assistant_close" class="streamline-assistant-header-btn" title="Close">
                        <i class="fa-solid fa-xmark"></i>
                    </span>
                </div>
            </div>
            <div id="streamline_assistant_messages" class="streamline-assistant-messages">
                <div class="streamline-assistant-msg streamline-assistant-msg-ai">
                    Hi! I'm the Streamline Assistant. I can help you configure SillyTavern and its extensions. What do you need help with?
                </div>
            </div>
            <div class="streamline-assistant-input-row">
                <textarea id="streamline_assistant_input" class="streamline-assistant-input" placeholder="Ask about ST configuration..." rows="1"></textarea>
                <button id="streamline_assistant_send" class="streamline-assistant-send-btn" title="Send">
                    <i class="fa-solid fa-paper-plane"></i>
                </button>
            </div>
        </div>
    `;

    $('body').append(buttonHtml);
    $('body').append(modalHtml);
}

function initAssistantUI() {
    createAssistantUI();

    // Toggle modal visibility
    $('#streamline_assistant_btn').on('click', () => {
        const $modal = $('#streamline_assistant_modal');
        $modal.toggle();
        if ($modal.is(':visible')) {
            $('#streamline_assistant_input').focus();
        }
    });

    // Close button
    $('#streamline_assistant_close').on('click', () => {
        $('#streamline_assistant_modal').hide();
    });

    // Clear chat
    $('#streamline_assistant_clear').on('click', () => {
        chatHistory = [];
        const $messages = $('#streamline_assistant_messages');
        $messages.html(`
            <div class="streamline-assistant-msg streamline-assistant-msg-ai">
                Chat cleared. What do you need help with?
            </div>
        `);
    });

    // Send message
    $('#streamline_assistant_send').on('click', sendUserMessage);
    $('#streamline_assistant_input').on('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendUserMessage();
        }
    });

    // Auto-resize textarea
    $('#streamline_assistant_input').on('input', function () {
        this.style.height = 'auto';
        this.style.height = Math.min(this.scrollHeight, 120) + 'px';
    });

    // Make modal draggable via header
    makeModalDraggable();
}

async function sendUserMessage() {
    const $input = $('#streamline_assistant_input');
    const text = $input.val().trim();
    if (!text) return;

    $input.val('').trigger('input');
    $input.css('height', 'auto');

    const $messages = $('#streamline_assistant_messages');

    // Add user message
    $messages.append(`<div class="streamline-assistant-msg streamline-assistant-msg-user">${escapeHtml(text)}</div>`);

    // Add pending AI message
    const $aiMsg = $(`<div class="streamline-assistant-msg streamline-assistant-msg-ai streamline-assistant-msg-pending"><i class="fa-solid fa-spinner fa-spin"></i> Thinking...</div>`);
    $messages.append($aiMsg);
    scrollToBottom($messages);

    // Build messages array with context
    const contextStr = gatherContext();

    // Check if user is asking about a specific extension
    let extensionContext = '';
    const extensionMatch = text.match(/(?:configure|setup|set up|help with|explain|about)\s+(?:the\s+)?([A-Za-z\s]+?)(?:\s+extension|\s+settings|\?|$)/i);
    if (extensionMatch) {
        const panelData = readExtensionPanel(extensionMatch[1].trim());
        if (panelData) {
            extensionContext = '\n\n' + panelData;
        }
    }

    const systemMsg = ASSISTANT_SYSTEM_PROMPT + '\n\n## Current Setup\n' + contextStr + extensionContext;

    chatHistory.push({ role: 'user', content: text });

    const messages = [
        { role: 'system', content: systemMsg },
        ...chatHistory,
    ];

    // Disable input during generation
    $input.prop('disabled', true);
    $('#streamline_assistant_send').prop('disabled', true);

    try {
        // Abort previous request if any
        if (currentAbortController) {
            currentAbortController.abort();
        }
        currentAbortController = new AbortController();

        const response = await sendToAPI(messages, currentAbortController.signal, (partialText) => {
            // Streaming update
            $aiMsg.removeClass('streamline-assistant-msg-pending').html(formatResponse(partialText));
            scrollToBottom($messages);
        });

        // Final update
        $aiMsg.removeClass('streamline-assistant-msg-pending').html(formatResponse(response));
        chatHistory.push({ role: 'assistant', content: response });

        // Keep history manageable (last 20 messages)
        if (chatHistory.length > 20) {
            chatHistory = chatHistory.slice(-20);
        }
    } catch (error) {
        if (error.name === 'AbortError') {
            $aiMsg.html('<em>Cancelled</em>');
        } else {
            console.error('[Streamline Assistant] API error:', error);
            $aiMsg.removeClass('streamline-assistant-msg-pending')
                .html(`<span style="color: var(--SmartThemeQuoteColor, #e74c3c);">Error: ${escapeHtml(error.message)}</span>`);
        }
    } finally {
        $input.prop('disabled', false);
        $('#streamline_assistant_send').prop('disabled', false);
        $input.focus();
        currentAbortController = null;
    }
}

function formatResponse(text) {
    // Basic markdown-ish formatting
    return escapeHtml(text)
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/^- (.+)$/gm, '<li>$1</li>')
        .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
        .replace(/\n/g, '<br>');
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function scrollToBottom($container) {
    $container.scrollTop($container[0].scrollHeight);
}

function makeModalDraggable() {
    const $modal = $('#streamline_assistant_modal');
    const $header = $modal.find('.streamline-assistant-header');
    let isDragging = false;
    let startX, startY, startLeft, startTop;

    $header.on('mousedown', (e) => {
        if ($(e.target).closest('.streamline-assistant-header-btn').length) return;
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        const rect = $modal[0].getBoundingClientRect();
        startLeft = rect.left;
        startTop = rect.top;
        $header.css('cursor', 'grabbing');
        e.preventDefault();
    });

    $(document).on('mousemove', (e) => {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        $modal.css({
            left: startLeft + dx + 'px',
            top: startTop + dy + 'px',
            right: 'auto',
            bottom: 'auto',
        });
    });

    $(document).on('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            $header.css('cursor', 'grab');
        }
    });
}

// =====================================================================
// Public API
// =====================================================================

/**
 * Show or hide the assistant FAB button.
 * @param {boolean} enabled
 */
export function setAssistantEnabled(enabled) {
    const $btn = $('#streamline_assistant_btn');
    if (enabled) {
        $btn.show();
    } else {
        $btn.hide();
        $('#streamline_assistant_modal').hide();
    }
}

/**
 * Initialize the assistant UI (call once on extension load).
 */
export function initAssistant() {
    initAssistantUI();
}
