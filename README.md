<p align="center">
  <img src="https://img.shields.io/badge/Streamline-v0.4.0-blue?style=for-the-badge" alt="Version">
  <img src="https://img.shields.io/badge/SillyTavern-1.15.0+-green?style=for-the-badge" alt="ST Compatibility">
  <img src="https://img.shields.io/badge/License-AGPL--3.0-purple?style=for-the-badge" alt="License">
  <img src="https://img.shields.io/badge/API-Cloud%20CC-orange?style=for-the-badge" alt="Target API">
</p>

<h1 align="center">Streamline</h1>

<p align="center">
  <strong>Cut the bloat. Keep the story.</strong>
</p>

<p align="center">
  A SillyTavern extension that strips away legacy UI bloat and reframes ST for narrative roleplay.<br>
  Hide what you don't need. Neutralize what shouldn't be on. Let your system prompt do its job.
</p>

---

## The Problem

SillyTavern is powerful. It's also overwhelming. Dozens of toggles, fields, and panels exist because the platform was designed before people learned to write comprehensive system prompts. If you're using a cloud API (Gemini, Claude, GLM) for narrative RP, most of those controls are either irrelevant or actively working against you.

**Streamline fixes this.** One click to hide the clutter, neutralize the legacy settings, and get back to what matters: your system prompt and your story.

---

## Features

### GM Mode

A single toggle that shifts the AI from chatbot to narrator/game master. When enabled, Streamline injects a base GM framing prompt before your system prompt — establishing that the AI controls the world and NPCs while the player's agency is absolute.

- **Editable** — customize the GM framing to match your style
- **Non-overriding** — your system prompt layers on top and has the final word
- **Smart detection** — analyzes your system prompt and tells you if GM Mode is needed, redundant, or recommended
- **Visible in Prompt Inspector** so you can verify exactly what's being sent
- Auto-enabled by "Apply Narrative Defaults", auto-disabled by "Reset All"

### Streamline Assistant

A built-in AI assistant that helps configure SillyTavern and its extensions. Uses your connected API — no additional setup required.

- Floating chat window with drag support, accessible from any screen
- Reads your installed extensions, API connection, and active Streamline settings
- Passes through web search, reasoning, and other API features you have enabled
- Customizable chat bubble colors
- Understands Streamline's philosophy — won't suggest legacy features or contradict your workflow
- Opt-in via toggle in settings (off by default, consumes tokens)

### 17 Hide Toggles

Every toggle hides a specific piece of ST's UI. Nothing is deleted — everything is CSS `display: none` and instantly reversible.

**Core Cleanup**
| Toggle | What it hides |
|---|---|
| Hide Text Completion | TC API option + all TC settings panels |
| Hide Advanced Formatting | Entire instruct/context template drawer |
| Hide Author's Note | AN toggle + all AN blocks |
| Hide MovingUI | MovingUI checkbox, reset, presets |
| Hide Auto-fix Markdown | The auto-fix checkbox |
| Hide Advanced Samplers | freq/pres penalty, top-k/p, min-p, rep pen, logit bias (keeps temperature + max tokens) |

**Technical Cleanup** *(hard neutralized when hidden)*
| Toggle | What it hides | What it forces |
|---|---|---|
| Hide Context Template | Context template selector | Reset to default |
| Hide Instruct Mode | Instruct toggle + all settings | Disabled |
| Hide CFG Scale | CFG panel and toggle | Off |
| Hide Token Padding | Token padding setting | Set to 0 |

**Prompt Managed** *(soft neutralized when hidden)*
| Toggle | What it hides | What it clears |
|---|---|---|
| Hide NSFW / Jailbreak | Auxiliary + Post-History Instructions areas | Fields cleared |
| Hide Example Separator | Example dialogue separator field | Field cleared |
| Hide Chat Start Marker | Chat start marker field | Field cleared |
| Hide Talkativeness | Character talkativeness slider | Set to 1.0 (full) |

**UI Declutter** *(hidden only, no underlying change)*
| Toggle | What it hides |
|---|---|
| Hide AI Response Formatting | Entire formatting drawer |
| Hide Persona Position | Persona description position dropdown |
| Hide Group Chat | Group chat button + management panel |

### Neutralization System

**This is the key difference from just hiding things.** A hidden toggle that's still set to "on" still affects your AI responses. Streamline doesn't just hide — it neutralizes.

- **Hard neutralize**: Settings that are technically obsolete for cloud CC APIs (Instruct Mode, CFG Scale, Token Padding, Context Template) are forced OFF when hidden.
- **Soft neutralize**: Settings where your system prompt handles the behavior (NSFW, Jailbreak, Talkativeness, separators) are cleared to neutral defaults when hidden. Labeled *"Managed by your system prompt"* in the panel.
- **Preserve & restore**: Every original value is stored before neutralizing. Unhide a toggle and the previous value is restored with a brief notification.

### Simplified Controls

Clean wrappers around ST's raw settings, right in the Streamline panel:

- **Creativity (Temperature)**: Preset buttons — Low (0.5) / Medium (0.9) / High (1.2) / Max (1.8) — with an expandable raw slider
- **Max Response Length**: Preset buttons — Short (400) / Medium (1000) / Long (2500) / Max (8192) — with an expandable raw input
- **Context Size**: Preset buttons — 32k / 128k / 200k / 1M — with model-aware auto-detection and custom override. Persists across sessions and preset changes.

### Model-Aware Context Detection

Streamline auto-detects your connected model's context window from ST's model list metadata, with a fallback lookup table covering 25+ model families (Claude, Gemini, GPT, GLM, DeepSeek, Llama, Mistral, and more). No more hitting the 4095 wall on a fresh install.

### System Prompt Shortcut

A clean text area at the top of the Streamline panel that syncs bidirectionally with the Prompt Manager's main system prompt field. Write your prompt here without navigating the Prompt Manager maze.

### Prompt Manager Cleanup

When **Apply Narrative Defaults** is pressed, Streamline soft-disables redundant Prompt Manager fields whose job your system prompt already does:

**Disabled**: Char Description, Char Personality, Scenario, Enhance Definitions, Auxiliary Prompt, Chat Examples, Post-History Instructions

**Left enabled**: Main Prompt, Persona Description, World Info (before/after), Chat History

All previous toggle states are saved. **Reset All** restores them.

### Quick Actions

- **Apply Narrative Defaults**: One click to enable GM Mode, all hides, neutralize all settings, disable bloat PM fields, enable streaming, and auto-detect context size. Stores all previous values for restore.
- **Reset All**: One click to disable GM Mode, restore every original value, re-enable all PM fields, and unhide everything.

---

## Installation

1. Open SillyTavern
2. Go to **Extensions** panel (puzzle piece icon)
3. Click **Install Extension**
4. Paste this URL:
   ```
   https://github.com/RealDoomSlaya/SillyTavern-Streamline
   ```
5. Click **Save**
6. Reload SillyTavern

The Streamline panel appears in the **Extensions** settings drawer (second column).

---

## Quick Start

1. Open the **Streamline** drawer in Extensions settings
2. Click **Apply Narrative Defaults**
3. Write your system prompt in the text area at the top
4. Pick a Creativity preset
5. Start chatting

That's it. Your system prompt is king now.

---

## Philosophy

### Why a system prompt replaces most of ST's toggles

A modern narrative RP system prompt handles **all** of the following:

- Perspective and POV
- Tense and writing style
- Response formatting
- NSFW/explicit content rules
- NPC behavior and autonomy
- Player agency boundaries
- World dynamics and consequences
- Dialogue style
- Narrative quality and pacing

ST's scattered toggles for these things are legacy from an era when prompts were short and simple. It's 2026. A good prompt handles all of it. Streamline's job is to get those legacy controls out of the way so your prompt can work.

### Subtractive first

The biggest improvement is removing things, not adding things. Every toggle Streamline provides *hides* something. The additions — GM Mode, simplified controls, the assistant — exist to support the core workflow, not add complexity.

### Non-destructive always

Nothing is deleted from ST's core. Everything is CSS classes on `<body>` and JS wrappers around existing settings. Toggle something off → it's restored. Reset All → everything goes back to exactly how it was.

---

## Compatibility

### Tested Themes
- Moonlit Echoes
- Guinevere
- Not-A-Discord-Theme
- VoidDrift
- NoShadowDribbblish

### Tested Presets
- Marinara Universal
- Kintsugi
- Stabs EDH
- CharacterProvider

### Tested Extensions
- RPG Companion
- Tracker
- CharMemory
- Prompt Inspector
- LALib
- Guided Generations

Streamline operates at the **functionality layer** — it doesn't touch themes (appearance layer) or sampling presets (parameter layer). They coexist cleanly.

---

## Roadmap

| Version | What shipped |
|---|---|
| v0.1.0 | Basic Hide/Disable Layer — 6 hide toggles, CSS body-class pattern |
| v0.2.0 | Deep Clean & Simplification — 17 toggles, simplified controls, system prompt shortcut |
| v0.2.5 | Neutralization & PM Cleanup — three-tier neutralize, prompt manager field management |
| v0.3.0 | Model Detection & Assistant — auto context detection, context presets, Streamline Assistant |
| v0.4.0 | GM Mode — narrator/GM injection, smart prompt detection, chat color customization |

### What's next
- Knowledge base for the assistant (curated ST ecosystem info)
- First-run experience / guided setup
- Post-action summaries ("here's what Streamline just changed")

---

## Target User

Someone migrating from AIRealm, Janitor AI, DreamGen, or similar platforms who wants:
- Cloud API access (Gemini 2.5 Pro, GLM-5, Claude) with their own keys
- A system prompt and chat history — that's the core experience
- The AI acting as a narrator/game master, not a chatbot
- Their system prompt handling style, perspective, content rules — not ST's toggles
- Character cards working as detailed profiles, not restructured by the platform

---

## Contact

- **Discord**: RealDoomSlaya
- **Steam**: [RealDoomSlaya](https://steamcommunity.com/id/RealDoomSlaya)
- **GitHub Issues**: [Report a bug or request a feature](https://github.com/RealDoomSlaya/SillyTavern-Streamline/issues)

---

## Credits

Built by **Claude** (Anthropic) with design direction, testing, and creative vision by **RealDoomSlaya**. Every feature, philosophy decision, and UX choice comes from real narrative RP workflows — Claude handles the code, the human handles the "why."

---

## License

[AGPL-3.0](https://www.gnu.org/licenses/agpl-3.0.html) — matching SillyTavern's license.
