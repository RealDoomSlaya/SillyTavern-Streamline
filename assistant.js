/**
 * Streamline Assistant — AI-powered configuration help
 * Uses the user's connected API to answer questions about ST and its extensions.
 *
 * This module is self-contained and only activated when the user explicitly
 * enables the assistant toggle in Streamline's settings.
 */

import { getRequestHeaders } from '../../../../script.js';
import { extension_settings } from '../../../extensions.js';
import { model_list, getChatCompletionModel, chat_completion_sources } from '../../../openai.js';
import { getContext } from '../../../st-context.js';
import { KNOWLEDGE_BASE } from './knowledge.js';

const ALOG_PREFIX = '[Streamline Assistant]';
const alog = {
    info:  (...args) => console.log(ALOG_PREFIX, ...args),
    warn:  (...args) => console.warn(ALOG_PREFIX, ...args),
    error: (...args) => console.error(ALOG_PREFIX, ...args),
    debug: (...args) => {
        if (extension_settings?.streamline?._debug) console.debug(ALOG_PREFIX, '[DEBUG]', ...args);
    },
};

// =====================================================================
// System Prompt
// =====================================================================

const ASSISTANT_SYSTEM_PROMPT = `You are the Streamline Assistant, built into the Streamline extension for SillyTavern (ST). You help users configure SillyTavern, its extensions, and their narrative RP workflows.

You are running inside SillyTavern right now, using the user's connected API. You have a detailed knowledge base about Streamline's features, ST architecture, common problems, and popular extensions — reference it when answering.

## Rules:
- The system prompt is king. Always recommend putting behavior rules in the system prompt rather than scattered toggles.
- If Streamline has hidden something, don't suggest unhiding it unless the user specifically asks. Those features are hidden for a reason.
- Never suggest Instruct Mode or Context Templates for cloud CC API users — they're irrelevant.
- Character cards are for CHARACTER details (who they are), not system instructions (how the AI behaves).
- Prefer third-party extensions over legacy built-ins (Summarize, Vector Storage) — mention caveats if recommending built-ins.
- If web search is enabled in your context, use it for current info, recent updates, or things beyond your training data.

## Style:
- Concise and direct — answers, not essays
- Bullet points for multi-step instructions
- If you don't know, say so rather than guessing
- No markdown tables — they don't render in this chat. Use bullets or short descriptions.
- Keep formatting tight — single line breaks, not double.`;

// =====================================================================
// Context Gathering
// =====================================================================

/**
 * Gather current ST state for the assistant's context.
 */
function gatherContext() {
    const parts = [];

    // 1. Current API connection + enabled features
    try {
        const ctx = getContext();
        const settings = ctx.chatCompletionSettings;
        const source = settings?.chat_completion_source || 'unknown';
        const model = getChatCompletionModel() || 'unknown';
        const features = [];
        if (settings?.enable_web_search) features.push('Web Search');
        if (settings?.show_thoughts) features.push('Show Thoughts/Reasoning');
        const featureStr = features.length > 0 ? `\n- Enabled features: ${features.join(', ')}` : '';
        parts.push(`## Current API Connection\n- Source: ${source}\n- Model: ${model}${featureStr}`);
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
            const stateLines = [];

            // GM Mode
            stateLines.push(`- GM Mode: ${streamlineSettings._gmEnabled ? 'ON' : 'OFF'}`);

            // Active hides
            const activeHides = Object.entries(streamlineSettings)
                .filter(([k, v]) => !k.startsWith('_') && v === true)
                .map(([k]) => k.replace('hide_', '').replace(/_/g, ' '));
            if (activeHides.length > 0) {
                stateLines.push(`- Active hides (${activeHides.length}/17): ${activeHides.join(', ')}`);
            } else {
                stateLines.push('- No hides active');
            }

            // PM fields state
            if (streamlineSettings._pmFieldsDisabled) {
                stateLines.push('- PM fields: narrative defaults applied (redundant fields disabled)');
            }

            // Context persistence
            if (streamlineSettings._contextSize) {
                stateLines.push(`- Persisted context size: ${streamlineSettings._contextSize}`);
            }

            parts.push(`## Streamline State\n${stateLines.join('\n')}`);
        }
    } catch {
        // Silent fail
    }

    // 4. User's system prompt (first 500 chars — enough for the assistant to give targeted advice)
    try {
        const $prompt = $('#streamline_system_prompt');
        const promptText = $prompt.length ? ($prompt.val() || '').trim() : '';
        if (promptText) {
            const excerpt = promptText.length > 500 ? promptText.substring(0, 500) + '...' : promptText;
            parts.push(`## User's System Prompt (excerpt)\n${excerpt}`);
        } else {
            parts.push('## User\'s System Prompt\n(empty — no system prompt set)');
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

    // Pass through API features the user has enabled in ST settings
    if (settings?.enable_web_search) {
        requestData.enable_web_search = true;
    }
    if (settings?.show_thoughts) {
        requestData.include_reasoning = true;
    }
    if (settings?.reasoning_effort) {
        requestData.reasoning_effort = settings.reasoning_effort;
    }

    alog.debug(`Sending to API — source: ${source}, model: ${model}, features:`, {
        web_search: !!requestData.enable_web_search,
        reasoning: !!requestData.include_reasoning,
    });

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

/**
 * Save chat history to extension settings so it survives module reloads
 * (e.g., when enabling/disabling another extension triggers a reload).
 */
function persistChatHistory() {
    try {
        const settings = extension_settings?.streamline;
        if (settings) {
            settings._assistantHistory = chatHistory.slice(-20); // Keep last 20 messages
        }
    } catch { /* Silent fail — non-critical */ }
}

/**
 * Restore chat history from extension settings after a module reload.
 */
function restoreChatHistory() {
    try {
        const saved = extension_settings?.streamline?._assistantHistory;
        if (Array.isArray(saved) && saved.length > 0) {
            chatHistory = saved;
            return true;
        }
    } catch { /* Silent fail */ }
    return false;
}

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

    // Restore chat history from previous session / module reload
    if (restoreChatHistory()) {
        const $messages = $('#streamline_assistant_messages');
        $messages.empty();
        // Re-render saved messages
        for (const msg of chatHistory) {
            if (msg.role === 'user') {
                const userHtml = escapeHtml(msg.content).replace(/\n/g, '<br>');
                $messages.append(`<div class="streamline-assistant-msg streamline-assistant-msg-user">${userHtml}</div>`);
            } else if (msg.role === 'assistant') {
                $messages.append(`<div class="streamline-assistant-msg streamline-assistant-msg-ai">${formatResponse(msg.content)}</div>`);
            }
        }
        alog.info('Restored chat history from settings');
    }

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
        persistChatHistory();
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

    // Add user message (preserve line breaks)
    const userHtml = escapeHtml(text).replace(/\n/g, '<br>');
    $messages.append(`<div class="streamline-assistant-msg streamline-assistant-msg-user">${userHtml}</div>`);

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

    const systemMsg = ASSISTANT_SYSTEM_PROMPT + '\n\n' + KNOWLEDGE_BASE + '\n\n## Current Setup\n' + contextStr + extensionContext;

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
        persistChatHistory();
    } catch (error) {
        if (error.name === 'AbortError') {
            $aiMsg.html('<em>Cancelled</em>');
        } else {
            alog.error('API error:', error);
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
    let html = escapeHtml(text);

    // Headers: ## Header → bold text on its own line
    html = html.replace(/^#{1,3}\s+(.+)$/gm, '<strong>$1</strong>');

    // Bold, italic, and inline code
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Horizontal rules
    html = html.replace(/^---+$/gm, '<hr style="border:0;border-top:1px solid var(--SmartThemeBorderColor,#444);margin:4px 0;">');

    // Strip markdown table rows (pipe-delimited) — convert to simple lines
    // Header separator rows like |---|---|---| → remove entirely
    html = html.replace(/^\|[-\s|:]+\|$/gm, '');
    // Table rows like | cell | cell | → "cell — cell"
    html = html.replace(/^\|(.+)\|$/gm, (_, row) => {
        const cells = row.split('|').map(c => c.trim()).filter(c => c);
        return cells.join(' — ');
    });

    // Numbered lists: "1. text" → <li> with numbers preserved
    html = html.replace(/^(\d+)\.\s+(.+)$/gm, '<li><strong>$1.</strong> $2</li>');

    // Unordered list items: "- text" → <li>
    html = html.replace(/^- (.+)$/gm, '<li>$1</li>');

    // Wrap consecutive <li> blocks in <ul>
    html = html.replace(/((?:<li>.*?<\/li>\n?)+)/g, '<ul style="margin:2px 0;padding-left:18px;list-style:none;">$1</ul>');

    // Collapse 3+ newlines → 2, then 2 newlines → single <br> (paragraph break)
    html = html.replace(/\n{3,}/g, '\n\n');
    html = html.replace(/\n\n/g, '<br>');
    // Single newlines within a paragraph → space (not a line break)
    html = html.replace(/\n/g, ' ');

    // Clean up any <br> right after/before block elements
    html = html.replace(/<br>\s*(<ul|<\/ul>|<hr)/g, '$1');
    html = html.replace(/(<\/ul>|<hr[^>]*>)\s*<br>/g, '$1');

    return html;
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
        const modalRect = $modal[0].getBoundingClientRect();
        // Clamp so at least 40px of the header stays visible on each edge
        const minLeft = 40 - modalRect.width;
        const maxLeft = window.innerWidth - 40;
        const minTop = 0; // Don't let top go above viewport
        const maxTop = window.innerHeight - 40;
        const newLeft = Math.max(minLeft, Math.min(maxLeft, startLeft + dx));
        const newTop = Math.max(minTop, Math.min(maxTop, startTop + dy));
        $modal.css({
            left: newLeft + 'px',
            top: newTop + 'px',
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
