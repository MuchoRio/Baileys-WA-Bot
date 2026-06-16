# Baileys WhatsApp Bot (AI Integrated)

An ultra-lightweight, high-performance, and modular WhatsApp Bot built with Node.js using [WhiskeySockets/Baileys](https://github.com/WhiskeySockets/Baileys) and integrated with Large Language Models (LLMs) for intelligent natural conversations.

Unlike heavy Puppeteer-based wrappers, this bot connects directly to WhatsApp Web's WebSocket protocol, saving significant memory (<100MB RAM) and providing fast, direct message handling.

## Features
- ⚡ **Lightweight & Fast**: Pure WebSocket-based connection (no Chromium/browser overhead).
- 🧠 **Multi-LLM Capable**: Architected to be easily connectable to various AI backends (such as Google Gemini, OpenAI ChatGPT, Anthropic Claude, DeepSeek, Qwen, Mistral, and local models).
- 🛡️ **Owner JID/LID Filtering**: Only replies to the configured owner in personal chats (supports traditional phone JIDs and new WhatsApp LID masking).
- 👥 **Group Mentions**: Automatically detects group tags and replies dynamically when mentioned or called.
- 🔁 **Self-Healing API Retries**: Built-in exponential backoff retry mechanism for handling temporary AI API overloads (503 Service Unavailable).
- 🔒 **Session Persistence**: Autologin using local file authentication state (`auth_info_baileys`).

## Prerequisites
- **Node.js** (v18 or higher recommended)
- **NPM** (Node Package Manager)
- A WhatsApp account to act as the bot (paired via QR code)
- An API Key from your preferred AI provider (e.g., Google Gemini, OpenAI, Claude, etc.)

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/MuchoRio/Baileys-WA-Bot.git
   cd Baileys-WA-Bot
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Setup environment variables:
   Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
   Open the `.env` file and fill in your values:
   ```env
   # API Key from your AI provider (e.g. Gemini, OpenAI, Claude)
   GEMINI_API_KEY=your_api_key_here
   
   # WhatsApp Owner JIDs (comma-separated list of allowed JIDs/LIDs)
   OWNER_JID=your_whatsapp_jid@s.whatsapp.net,your_lid_jid@lid
   
   # Personalization contact map
   CONTACTS_MAP={"6281234567890":"Rio"}
   ```
   *Note: The default index.js script is configured for the Google Gemini API. If you wish to switch to Claude, ChatGPT, or DeepSeek, simply install their respective SDKs and update the API call block in index.js.*

## Running the Bot

Start the bot with:
```bash
npm start
```

On first startup, a QR Code will be printed in the terminal. Open WhatsApp on the phone acting as the bot, go to **Linked Devices** (Perangkat Tertaut), and scan the code.

Once connected, it will automatically save the session in `auth_info_baileys/` and will not ask for a scan on subsequent restarts.

## License
[MIT License](LICENSE)
