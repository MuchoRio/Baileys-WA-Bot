import makeWASocket, { DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import qrcode from 'qrcode-terminal';
import fs from 'fs';

// Load environment variables
dotenv.config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const OWNER_JID = process.env.OWNER_JID; // e.g. 6281234567890@s.whatsapp.net

if (!GEMINI_API_KEY) {
    console.error('ERROR: GEMINI_API_KEY is not defined in .env file!');
    process.exit(1);
}

// Initialize Gemini client
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

// Contact list mapping phone numbers and LIDs to their names
// Contact list mapping phone numbers and LIDs to their names
const CONTACTS = {};
if (process.env.CONTACTS_MAP) {
    try {
        Object.assign(CONTACTS, JSON.parse(process.env.CONTACTS_MAP));
    } catch (e) {
        console.error('Failed to parse CONTACTS_MAP from environment:', e);
    }
}


// Load System Instruction dynamically (fallback to generic if file is missing)
let SYSTEM_INSTRUCTION = 'You are a helpful and friendly AI assistant.';
try {
    if (fs.existsSync('system_instruction.txt')) {
        SYSTEM_INSTRUCTION = fs.readFileSync('system_instruction.txt', 'utf8');
    } else if (fs.existsSync('system_instruction.example.txt')) {
        SYSTEM_INSTRUCTION = fs.readFileSync('system_instruction.example.txt', 'utf8');
    }
} catch (err) {
    console.error('Failed to read system_instruction file, using default:', err);
}

async function connectToWhatsApp() {
    // Load auth state to persist the session
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    // Fetch the latest WhatsApp Web version to avoid 405 WebSocket handshake issues
    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`Using WhatsApp Web version v${version.join('.')}, isLatest: ${isLatest}`);

    // Create WhatsApp socket connection with silent logs to avoid terminal clutter
    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' })
    });

    // Save credentials whenever updated
    sock.ev.on('creds.update', saveCreds);

    // Monitor connection events
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log('\n--- QR CODE GENERATED ---');
            console.log('Scan this QR code with your phone via WhatsApp -> Linked Devices:');
            qrcode.generate(qr, { small: true });
            console.log('-------------------------\n');
        }

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            console.log(`Connection closed (status: ${statusCode}). Reconnecting: ${shouldReconnect}`);
            
            if (shouldReconnect) {
                connectToWhatsApp();
            } else {
                console.log('Logged out of WhatsApp. Run the program again to scan new QR code.');
            }
        } else if (connection === 'open') {
            console.log('\n=======================================');
            console.log('Kaela WhatsApp Bot is successfully connected!');
            console.log('=======================================\n');
        }
    });

    // Helper to get clean JID (phone number digits only)
    const cleanJid = (jid) => jid ? jid.split('@')[0].split(':')[0] : '';

    // Helper to extract text content from WhatsApp message structure
    const getMessageText = (message) => {
        if (!message) return '';
        if (message.conversation) return message.conversation;
        if (message.extendedTextMessage?.text) return message.extendedTextMessage.text;
        if (message.imageMessage?.caption) return message.imageMessage.caption;
        if (message.videoMessage?.caption) return message.videoMessage.caption;
        if (message.buttonsResponseMessage?.selectedButtonId) return message.buttonsResponseMessage.selectedButtonId;
        if (message.templateButtonReplyMessage?.selectedId) return message.templateButtonReplyMessage.selectedId;
        if (message.ephemeralMessage?.message) return getMessageText(message.ephemeralMessage.message);
        if (message.viewOnceMessage?.message) return getMessageText(message.viewOnceMessage.message);
        return '';
    };

    // Handle incoming messages
    sock.ev.on('messages.upsert', async (chatUpdate) => {
        try {
            const type = chatUpdate.type;
            const messages = chatUpdate.messages;
            
            console.log(`[messages.upsert] Event received! type: ${type}, messages count: ${messages?.length}`);

            if (!messages || messages.length === 0) return;

            const msg = messages[0];
            const remoteJid = msg.key.remoteJid;
            const sender = msg.key.participant || remoteJid;
            const fromMe = msg.key.fromMe;
            
            console.log(` -> Msg keys: ${Object.keys(msg)}, fromMe: ${fromMe}, remoteJid: ${remoteJid}`);

            // Skip if no message structure exists
            if (!msg.message) {
                console.log(` -> Skipped: msg.message is empty (likely a protocol or status update)`);
                return;
            }

            // Extract text content
            const textContent = getMessageText(msg.message);
            console.log(` -> Extracted Text: "${textContent}"`);

            if (fromMe) {
                console.log(` -> Skipped: message sent by bot itself (fromMe is true)`);
                return;
            }
            if (!textContent) {
                console.log(` -> Skipped: empty text content`);
                return;
            }

            const isGroup = remoteJid.endsWith('@g.us');
            let shouldReply = false;

            if (isGroup) {
                // In group, reply if bot is mentioned or if name is called
                const botJid = sock.user?.id ? sock.user.id.split(':')[0] + '@s.whatsapp.net' : '';
                const botLid = cleanJid(sock.user?.lid);
                const botPhone = cleanJid(sock.user?.id);
                
                const mentionedJids = msg.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
                const isMentioned = mentionedJids.some(jid => {
                    const cleanMention = cleanJid(jid);
                    return cleanMention === botPhone || (botLid && cleanMention === botLid);
                });
                
                const nameCalled = textContent.toLowerCase().includes('la') || 
                                   textContent.toLowerCase().includes('kaela') ||
                                   (botPhone && textContent.includes(botPhone)) ||
                                   (botLid && textContent.includes(botLid));
                
                console.log(` -> Group message. botJid: ${botJid}, botLid: ${botLid}, botPhone: ${botPhone}, isMentioned: ${isMentioned}, nameCalled: ${nameCalled}`);
                if (isMentioned || nameCalled) {
                    shouldReply = true;
                }
            } else {
                // In personal chat, reply if it's from one of the allowed owners
                const allowedOwners = OWNER_JID ? OWNER_JID.split(',').map(jid => cleanJid(jid.trim())) : [];
                const senderClean = cleanJid(remoteJid);
                console.log(` -> Personal message. Allowed owners: [${allowedOwners.join(', ')}], senderClean: ${senderClean}`);
                
                if (allowedOwners.includes(senderClean)) {
                    shouldReply = true;
                } else if (allowedOwners.length === 0) {
                    console.log(` -> No OWNER_JID configured, allowing message`);
                    shouldReply = true;
                } else {
                    console.log(` -> Ignored: sender is not in the allowed owners list`);
                }
            }

            if (shouldReply) {
                const senderClean = cleanJid(sender);
                const senderName = CONTACTS[senderClean] || msg.pushName || 'Teman Kaela';
                
                console.log(`[Processing AI Response] for ${senderName} (${sender}): "${textContent}"`);

                // Create a context envelope specifying who is talking
                const contextMessage = `[Context: Sender is "${senderName}" (Number ID: ${senderClean}). Chat Type: ${isGroup ? 'Group Chat' : 'Personal Chat'}.]\nUser Message: ${textContent}`;

                // Generate content using Gemini with automatic retry for 503 overloads
                let response;
                let retries = 3;
                let delay = 2000;

                while (retries > 0) {
                    try {
                        response = await ai.models.generateContent({
                            model: 'gemini-2.5-flash',
                            contents: contextMessage,
                            config: {
                                systemInstruction: SYSTEM_INSTRUCTION
                            }
                        });
                        break; // Success! Exit loop
                    } catch (apiErr) {
                        retries--;
                        if (retries === 0) throw apiErr; // Out of retries, throw the error
                        
                        console.warn(`[Warning] Gemini API overloaded (503). Retrying in ${delay}ms... (Retries left: ${retries})`);
                        await new Promise(resolve => setTimeout(resolve, delay));
                        delay *= 1.5; // Exponential backoff
                    }
                }

                const replyText = response.text || 'Duh, otakkku lagi nge-blank bentar... 🥺 Coba lagi yaa.';

                // Send reply back via WhatsApp JID (group or personal)
                await sock.sendMessage(remoteJid, { text: replyText }, { quoted: msg });
                console.log(`[Success] Sent reply to ${remoteJid}: "${replyText.substring(0, 50)}..."`);
            }
        } catch (err) {
            console.error('!!! Error inside messages.upsert handler:', err);
        }
    });
}

connectToWhatsApp().catch(err => {
    console.error('Critical initialization error:', err);
});
