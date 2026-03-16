/**
 * Streamline Assistant Knowledge Base
 *
 * Curated reference document injected into the assistant's context.
 * This is the assistant's actual expertise — without it, the assistant
 * is just a generic chatbot with a system prompt that says "you know things."
 *
 * Maintainability: Update this file when Streamline features change,
 * when ST updates break things, or when common user questions reveal
 * knowledge gaps. Keep it factual and concise — every token here costs
 * the user money on every assistant message.
 */

export const KNOWLEDGE_BASE = `
## Streamline Feature Reference

### Quick Actions
- **Apply Narrative Defaults**: Enables all 17 hides, neutralizes settings, disables redundant Prompt Manager fields, enables GM Mode, enables streaming, auto-detects context size. One click to go from fresh install to clean narrative RP setup. All previous values are preserved and can be restored.
- **Reset All**: Reverses everything Apply Narrative Defaults did. Restores all hidden elements, re-enables PM fields, disables GM Mode, restores all neutralized settings to their previous values.

### Hide Toggles (17 total)
Each toggle hides a specific piece of ST's UI using CSS. Nothing is deleted — toggling something back on restores it instantly.

**Phase 1 — Core Cleanup:**
- Hide Text Completion: Removes the TC option from API selector and all TC settings panels. Cloud API users use Chat Completion, not Text Completion.
- Hide Advanced Formatting: Hides the entire instruct mode / context template drawer. Irrelevant for cloud CC APIs.
- Hide Author's Note: Hides the AN toggle button and all AN blocks. The system prompt handles tone and pacing better.
- Hide MovingUI: Hides the MovingUI checkbox, reset button, and presets. A layout feature most users never use.
- Hide Auto-fix Markdown: Hides that checkbox. Usually does more harm than good with narrative responses.
- Hide Advanced Samplers: Hides freq penalty, presence penalty, top-k, top-p, min-p, rep pen, logit bias. Keeps temperature and max tokens visible — those are the only two most users need.

**Phase 2 — Deep Clean (with neutralization):**
- Hide Context Template: Hides context template selector. HARD neutralized — reset to default when hidden. Irrelevant for cloud CC APIs.
- Hide Instruct Mode: Hides instruct toggle and all settings. HARD neutralized — disabled when hidden. Instruct mode is for local models with chat templates, not cloud APIs.
- Hide CFG Scale: Hides CFG panel and toggle. HARD neutralized — set to off. Not supported by most cloud APIs.
- Hide Token Padding: Hides token padding setting. HARD neutralized — set to 0. A legacy buffer setting.
- Hide NSFW / Jailbreak: Hides Auxiliary + Post-History Instructions areas. SOFT neutralized — fields cleared. Your system prompt should define content rules, not these fields.
- Hide Example Separator: Hides example dialogue separator field. SOFT neutralized — field cleared.
- Hide Chat Start Marker: Hides chat start marker field. SOFT neutralized — field cleared.
- Hide Talkativeness: Hides character talkativeness slider. SOFT neutralized — set to 1.0 (full). Your system prompt controls NPC behavior.
- Hide AI Response Formatting: Hides the entire formatting drawer. Your system prompt defines formatting.
- Hide Persona Position: Hides persona description position dropdown. Unnecessary complexity.
- Hide Group Chat: Hides group chat button and management panel. GM Mode means the AI handles all NPCs — ST's multi-bot group system is a different paradigm.

### Neutralization System
Hiding something doesn't always stop it from affecting your prompts. Streamline neutralizes hidden settings:
- **Hard neutralize**: Forces settings OFF that are technically obsolete for cloud CC APIs (Instruct Mode, CFG Scale, Token Padding, Context Template).
- **Soft neutralize**: Clears settings to neutral defaults where the system prompt handles the behavior instead (NSFW, Jailbreak, Talkativeness, separators). Labeled "Managed by your system prompt."
- **Preserve & restore**: Every original value is saved before neutralizing. Unhide a toggle and the previous value is restored with a notification.

### GM Mode
A toggle that injects a Game Master / narrator framing prompt BEFORE the user's system prompt. This establishes the AI as a world controller and narrator rather than a chatbot.
- The injection goes before the system prompt, so the user's system prompt has the final word on everything.
- Editable — users can customize the GM framing text.
- Smart detection — analyzes the user's system prompt and shows a hint if GM Mode is needed, redundant, or conflicting.
- Power users who already have GM framing in their system prompt don't need GM Mode. The smart detection will tell them this.
- New users with no system prompt benefit the most from GM Mode — it gives the AI a foundation to work from.
- Visible in Prompt Inspector (the extension) so users can verify what's being injected.

### Simplified Controls
Clean wrappers around ST's raw settings, shown in the Streamline panel:
- **Creativity (Temperature)**: Preset buttons — Low (0.5) / Medium (0.9) / High (1.2) / Max (1.8). Has an expandable raw slider for fine-tuning. Syncs bidirectionally with ST's temperature setting.
- **Max Response Length**: Preset buttons — Short (400 tokens) / Medium (1000) / Long (2500) / Max (8192). Has an expandable raw input. Syncs with ST's max_tokens setting.
- **Context Size**: Preset buttons — 32k / 128k / 200k / 1M. Auto-detects from connected model. Has custom override. Persists across preset changes and reloads (ST's presets normally reset context to 4095).

### Model-Aware Context Detection
Streamline auto-detects the connected model's context window from ST's model list metadata, with a fallback lookup table covering 25+ model families. This prevents the common "Mandatory prompts exceed context size" error that happens when context is stuck at 4095 on a fresh install.

### System Prompt Shortcut
A text area at the top of the Streamline panel that syncs bidirectionally with the Prompt Manager's main system prompt field. Edit your prompt here instead of navigating through the Prompt Manager UI.

### Prompt Manager Cleanup
When Apply Narrative Defaults is pressed, Streamline soft-disables PM fields whose job your system prompt already does:
- **Disabled**: Char Description, Char Personality, Scenario, Enhance Definitions, Auxiliary Prompt (NSFW), Chat Examples, Post-History Instructions (Jailbreak)
- **Left enabled**: Main Prompt, Persona Description, World Info (before/after), Chat History
All previous toggle states are saved. Reset All restores them.

### Streamline Assistant (that's you)
- Opt-in via toggle (off by default, consumes tokens)
- Uses the user's connected API — no separate setup
- Passes through web search, reasoning, and other API features
- Chat bubble colors are customizable
- Floating draggable window

---

## SillyTavern Architecture (What Users Need To Know)

### API Types
- **Chat Completion (CC)**: The modern API format. Used by Claude, Gemini, GPT, GLM, DeepSeek, and all major cloud providers. Messages are structured as system/user/assistant turns. This is what Streamline is built for.
- **Text Completion (TC)**: The legacy format. A single text blob. Used by some local models and NovelAI. Streamline hides this because cloud API users don't need it.

### The Prompt Stack (Chat Completion)
Understanding what gets sent to the API, in order:
1. Extension injections marked BEFORE_PROMPT (like GM Mode)
2. Main System Prompt (the most important thing — this is what users should focus on)
3. Persona Description (who the user is playing as)
4. Character Description, Personality, Scenario (if enabled in PM)
5. World Info / Lorebook entries (contextual information triggered by keywords)
6. Example Dialogue (if enabled)
7. Chat History (the actual conversation)
8. Extension injections at various depths
9. Author's Note (if enabled — Streamline recommends against this)
10. Post-History Instructions / Jailbreak (if enabled — Streamline clears these)

The Prompt Manager controls which of these sections are enabled and in what order. Streamline's "Apply Narrative Defaults" disables the redundant ones.

### Presets
ST has several types of presets that can confuse users:
- **API/Sampling Presets** (e.g., Marinara, Kintsugi, Stabs EDH): Control temperature, penalties, samplers. Loading one can overwrite many settings. Streamline's context persistence specifically guards against presets resetting context size.
- **Context Template Presets**: Control how the prompt is structured for Text Completion and Instruct Mode. Irrelevant for cloud CC APIs — Streamline hides this.
- **Instruct Presets**: Chat template formats for local models. Irrelevant for cloud CC — Streamline hides this.
- **System Prompt Presets**: Pre-written system prompts. These can be useful starting points.

### Prompt Inspector
A third-party extension (not built-in) that shows exactly what gets sent to the API. Extremely useful for debugging. If the user has it installed, recommend checking it to verify GM Mode injection, system prompt content, or troubleshoot unexpected AI behavior.

---

## Common User Problems and Solutions

### "The AI is acting like a chatbot, not a narrator"
- Enable GM Mode in Streamline (or write GM framing in your system prompt)
- Make sure your system prompt establishes the AI as a narrator/GM, not an assistant
- Check if Post-History Instructions (Jailbreak field) has chatbot-style text — Streamline's "Hide NSFW/Jailbreak" clears this

### "My responses are getting cut off"
- Check Max Response Length — increase it (Medium: 1000, Long: 2500)
- Check Context Size — if it's at 4095, Streamline's context detection didn't run or the model wasn't detected. Set it manually based on your model.
- Some APIs have their own output token limits — this is API-side, not ST's fault

### "Mandatory prompts exceed the context size"
- Context size is too low. Use Streamline's context presets or auto-detection.
- If you just loaded a preset, it may have reset context to 4095. Streamline guards against this but it can happen during initial setup.

### "Loading a preset broke everything"
- Some presets (especially Stabs EDH) overwrite the entire Prompt Manager when imported. This is the preset's behavior, not ST's or Streamline's.
- After loading a preset, re-click "Apply Narrative Defaults" to re-apply Streamline's cleanup.
- Streamline persists context size specifically because presets reset it.

### "I don't know what to put in my system prompt"
- Start with the basics: perspective (second person / third person), tense (present / past), and the AI's role (narrator, GM).
- Add content rules: what's allowed, what's not, how explicit scenes should be handled.
- Add formatting rules: dialogue style, response length, paragraph structure.
- Add world rules: how NPCs behave, player agency, consequences.
- GM Mode can serve as a foundation while you build your prompt.

### "What's the difference between Character Card fields and the System Prompt?"
- System Prompt: Defines HOW the AI behaves — its role, rules, formatting, style.
- Character Card (Description, Personality, Scenario): Defines WHO/WHAT — character details, world setup, relationships.
- Don't put system instructions in character cards. Don't put character details in the system prompt (unless they're universal rules about how characters should behave).

### "Instruct Mode is on and things look weird"
- Turn it off. Instruct Mode adds chat template formatting (like [INST] tags) that cloud APIs don't need and actively misinterpret.
- Streamline's "Hide Instruct Mode" forces it off when hidden. If the user is using Streamline, it's probably already off.

### "Context Template is doing something weird"
- For cloud CC APIs, the context template should be the default. Streamline resets it to default when "Hide Context Template" is enabled.
- Custom context templates are only useful for local models with specific prompt formats.

---

## Popular Extensions Reference

### Recommended Third-Party Extensions
- **Prompt Inspector**: Shows the exact prompt sent to the API. Essential for debugging. No configuration needed — just install and click the icon.
- **RPG Companion**: Adds game mechanics, stats, dice rolling, inventory. For users who want D&D-style systems. Streamline does NOT add game mechanics — that's RPG Companion's domain.
- **LALib (Lorebook Assist Library)**: Helper functions for lorebook entries. Advanced — for users building complex world info setups.
- **Guided Generations**: Helps steer AI responses by injecting structured instructions. Useful for maintaining consistency.
- **EchoChamber**: Chat logging and analysis.
- **MemoryBooks**: Persistent memory management across chats.
- **Pathweaver**: Narrative branching — lets users explore different story paths.
- **Moonlit Echoes Theme**: A visual theme. Streamline works alongside it — Streamline is functionality layer, themes are appearance layer.

### Built-In Extensions (Use With Caveats)
- **Summarize**: Auto-summarizes old messages when context fills up. Can lose important details. Not recommended as primary memory solution — better to manage context manually or use third-party memory extensions.
- **Vector Storage**: Stores past messages as embeddings for retrieval. Token-expensive and hit-or-miss. Third-party alternatives are generally better.
- **Image Generation**: Connects to image gen APIs. Works fine, unrelated to Streamline.
- **TTS / STT**: Text-to-speech and speech-to-text. Works fine, unrelated to Streamline.

### Extension Compatibility
Streamline operates at the functionality layer — it hides UI and neutralizes settings. It doesn't touch:
- Visual themes (Moonlit Echoes, Guinevere, VoidDrift, etc.)
- Sampling presets (Marinara, Kintsugi, Stabs EDH)
- Other functional extensions (they all coexist)

If an extension depends on a setting Streamline has neutralized (e.g., an extension that uses Instruct Mode), unhiding that setting in Streamline restores it.

---

## Writing System Prompts (Advice for Users)

### The Basics
A good narrative RP system prompt handles ALL of these — making most of ST's toggles unnecessary:
- AI's role (narrator, GM, storyteller)
- Perspective (second person, third person limited, third person omniscient)
- Tense (past, present)
- Formatting (paragraph style, dialogue formatting, response length)
- Content rules (explicit content handling, violence, romance)
- Player agency (what the AI can/can't control about the player's character)
- NPC behavior (autonomy, knowledge limits, motivations)
- World dynamics (time passes, consequences matter, the world doesn't wait)

### Common Mistakes
- Putting system instructions in character cards instead of the system prompt
- Using Jailbreak/Post-History Instructions instead of putting content rules in the system prompt
- Writing the prompt as a list of "don'ts" — positive instructions work better than prohibitions
- Making the prompt too long — 200-500 words is usually the sweet spot. Over 1000 words and you're probably being redundant.
- Not specifying perspective/tense — the AI will be inconsistent without explicit direction
`;
