import express from 'express';
import fs from 'fs';
import pino from 'pino';
import { makeWASocket, useMultiFileAuthState, delay, fetchLatestBaileysVersion, makeCacheableSignalKeyStore, Browsers, jidNormalizedUser } from '@whiskeysockets/baileys';

const router = express.Router();

// Ensure the session directory exists
function removeFile(FilePath) {
    try {
        if (!fs.existsSync(FilePath)) return false;
        fs.rmSync(FilePath, { recursive: true, force: true });
    } catch (e) {
        console.error('Error removing file:', e);
    }
}

router.get('/', async (req, res) => {
    let num = req.query.number;
    let dirs = './' + (num || `session`);

    // Remove existing session if present
    await removeFile(dirs);

    let retryCount = 0;
    const MAX_RETRIES = 5;
    let pairedNumberJid = null;

    // Enhanced session initialization function
    async function initiateSession() {
        const { version } = await fetchLatestBaileysVersion();
        const { state, saveCreds } = await useMultiFileAuthState(dirs);
        
        try {
            const Um4r719 = makeWASocket({
                printQRInTerminal: false,
                version,
                logger: pino({
                    level: 'silent',
                }),
                browser: ['Ubuntu', 'Chrome', '20.0.04'],
                auth: state,
            });

            if (!Um4r719.authState.creds.registered) {
                await delay(2000);
                num = num.replace(/[^0-9]/g, '');
                const code = await Um4r719.requestPairingCode(num);
                if (!res.headersSent) {
                    console.log({ num, code });
                    await res.send({ code });
                }
            }

            Um4r719.ev.on('creds.update', saveCreds);

            Um4r719.ev.on("connection.update", async (s) => {
                const { connection, lastDisconnect } = s;

                if (connection === "open") {
                    // Store the paired number's JID
                    pairedNumberJid = jidNormalizedUser(num.includes('@s.whatsapp.net') ? num : num + '@s.whatsapp.net');
                    
                    await Um4r719.sendMessage(pairedNumberJid, { text: `Generating your session wait a moment`});
                    console.log("Connection opened successfully");
                    await delay(10000);
                    
                    // Read the session file and get the raw JSON string
                    const sessionData = fs.readFileSync(dirs + '/creds.json', 'utf8');
                    
                    // Send the exact JSON without any formatting
                    await Um4r719.sendMessage(pairedNumberJid, { 
                        text: sessionData
                    });

                    // Send confirmation message
                    await Um4r719.sendMessage(pairedNumberJid, { 
                        text: '*𝐐𝐔𝐄𝐄𝐍 𝐃𝐀𝐍𝐈 𝐕7 connected.*\n\n🌚 *JOIN:*\n•https://whatsapp.com/channel/0029VazHPYwBqbr9HjXrc50m\n•𝐐𝐔𝐄𝐄𝐍 𝐃𝐀𝐍𝐈 𝐕7\n•The ultimate. \n\n🔧 *For free deployment!*\nContact: https://wa.me/2348054671458?text=free deployment.*' 
                    });

                    // Clean up session after use
                    await delay(100);
                    removeFile(dirs);
                    process.exit(0);
                } else if (connection === 'close' && lastDisconnect && lastDisconnect.error && lastDisconnect.error.output.statusCode !== 401) {
                    console.log('Connection closed unexpectedly:', lastDisconnect.error);
                    retryCount++;

                    if (retryCount < MAX_RETRIES) {
                        console.log(`Retrying connection... Attempt ${retryCount}/${MAX_RETRIES}`);
                        await delay(10000);
                        initiateSession();
                    } else {
                        console.log('Max retries reached, stopping reconnection attempts.');
                        if (!res.headersSent) {
                            await res.status(500).send({ message: 'Unable to reconnect after multiple attempts.' });
                        }
                    }
                }
            });
        } catch (err) {
            console.error('Error initializing session:', err);
            if (!res.headersSent) {
                res.status(503).send({ code: 'Service Unavailable' });
            }
        }
    }

    await initiateSession();
});

// Ensure session cleanup on exit or uncaught exceptions
process.on('exit', () => {
    removeFile(dirs);
    console.log('Session file removed.');
});

// Catch uncaught errors and handle session cleanup
process.on('uncaughtException', (err) => {
    console.error('Uncaught exception:', err);
    removeFile(dirs);
    process.exit(1);  // Ensure the process exits with error
});

export default router;