// --- 1. IMPORT MODUL UTAMA (BAILEYS) ---
const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    downloadMediaMessage,
    makeCacheableSignalKeyStore,
    fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');

const pino = require('pino');
const fs = require('fs');
const { connectToDB } = require('./helpers/mongodb');
const { MongoClient } = require('mongodb');
const ffmpeg = require('ffmpeg-static');
process.env.FFMPEG_PATH = ffmpeg;

// Database Lokal
const { connectToCloud, loadDB, saveDB, addQuestProgress } = require('./helpers/database');

// --- IMPORT COMMANDS ---
const timeMachineCmd = require('./commands/timemachine');
const economyCmd = require('./commands/economy');
const jobsCmd = require('./commands/jobs');
const chartCmd = require('./commands/chart');
const propertyCmd = require('./commands/property');
const pabrikCommand = require('./commands/pabrik');
const valasCmd = require('./commands/valas');
const stocksCmd = require('./commands/stocks');
const farmingCmd = require('./commands/farming');
const ternakCmd = require('./commands/ternak');
const miningCmd = require('./commands/mining');
const devCmd = require('./commands/developer');
const cryptoCmd = require('./commands/crypto');
const bolaCmd = require('./commands/bola');
const profileCmd = require('./commands/profile');
const battleCmd = require('./commands/battle');
const ttsCmd = require('./commands/tts');
const gameTebakCmd = require('./commands/gameTebak');
const nationCmd = require('./commands/nation');
const rouletteCmd = require('./commands/roulette');
const pdfCmd = require('./commands/pdf');
const robCmd = require('./commands/rob');
const wikiKnowCmd = require('./commands/WikiKnow');
const adminCmd = require('./commands/admin');
const aiCmd = require('./commands/ai');
const slitherCmd = require('./commands/slither_bridge');
const rpgCmd = require('./commands/rpg_bridge');
const minesCmd = require('./commands/mines');
const duelCmd = require('./commands/duel');
const toolsCmd = require('./commands/tools');
const caturCmd = require('./commands/catur');
const imageCmd = require('./commands/image');

// --- 2. KONFIGURASI WHITELIST GRUP ---
const ALLOWED_GROUPS = [
    "120363310599817766@g.us",       // Grup Sodara
    "6282140693010-1590052322@g.us", // Grup Keluarga Wonoboyo
    "120363253471284606@g.us",       // Grup Ambarya
    "120363328759898377@g.us",       // Grup Testingbot
    "120363422854499629@g.us",        // Grup English Area
    "120363426746650307@g.us"
];


// SERVER WEB & API
const express = require('express');
const cors = require('cors'); // Install dulu: npm install cors
const path = require('path');
const app = express();
const port = process.env.PORT || 3000;

app.use(cors()); // Biar web bisa akses
app.use(express.json()); // Biar bisa baca data JSON
app.use(express.urlencoded({ extended: true }));

// Folder tempat menyimpan file HTML/JS Catur
app.use('/game', express.static(path.join(__dirname, 'public_catur')));

// API: Web lapor hasil game ke sini
app.post('/api/catur-finish', async (req, res) => {
    const { user, result, bet, level } = req.body;

    // 2. Validasi Database
    const db = global.db;
    if (!db || !db.users) {
        return res.status(503).json({ status: 'error', message: 'Database bot belum siap. Coba lagi.' });
    }

    // 3. Validasi User
    if (!db.users[user]) {
        return res.status(404).json({ status: 'error', message: 'User tidak ditemukan' });
    }

    const userData = db.users[user];
    const taruhan = parseInt(bet) || 0;
    const difficulty = parseInt(level) || 2;

    let prize = 0;
    let text = "";

    // 4. LOGIKA HADIAH BARU (Medium vs Hard)
    if (result === 'win') {
        let multiplier = 1.2; // Default Medium: Untung 20%
        let modeName = "Medium";

        if (difficulty === 3) {
            multiplier = 1.3; // Hard: Untung 30%
            modeName = "Hard";
        }

        // Rumus: Taruhan x Multiplier (Pakai Math.floor biar angkanya bulat)
        prize = Math.floor(taruhan * multiplier);
        const profit = prize - taruhan;

        text = `🎉 MENANG (${modeName})!\n💰 Total Dapat: ${prize}\n📈 Profit Bersih: ${profit}`;

    } else if (result === 'draw') {
        prize = taruhan; // Balik modal
        text = `🤝 Seri! Koin ${prize} dikembalikan.`;
    } else {
        text = `💀 Kamu kalah catur. Koin ${taruhan} hangus.`;
    }

    // 5. Update Database & Save
    userData.balance += prize;

    // Pastikan fungsi saveDB ada (jika pakai helper)
    if (typeof saveDB === 'function') {
        await saveDB(global.db);
    }

    // 6. Kirim respon balik ke Web
    res.json({ status: 'ok', message: text, newBalance: userData.balance });

    console.log(`[CATUR] ${user} -> ${result} (Level: ${difficulty}, Bet: ${taruhan}, Prize: ${prize})`);
});

app.get('/', (req, res) => res.send('<h1>Bot Arya is Running! 🚀</h1>'));
app.listen(port, () => console.log(`Server jalan di port ${port}`));

// --- DI LUAR FUNGSI startBot() ---
const msgRetryCounterCache = new Map();

// ---KONEKSI BAILEYS ---
async function startBot() {
    // 1. KONEKSI DATABASE
    try {
        console.log("🔄 Menghubungkan ke MongoDB Atlas...");
        await connectToCloud();
        global.db = await loadDB();
        if (!global.db.users) global.db.users = {};
        if (!global.db.groups) global.db.groups = {};
        console.log("✅ Database Terhubung!");
    } catch (err) {
        console.error("⚠️ GAGAL KONEK DB:", err.message);
        global.db = { users: {}, groups: {}, market: {}, settings: {} };
    }

    // 2. SETUP BAILEYS
    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`🤖 WA Version: v${version.join('.')} (Latest: ${isLatest})`);

    const { state, saveCreds } = await useMultiFileAuthState('auth_baileys');

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false, // Ubah TRUE jika mau scan di terminal
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
        },
        browser: ['Ubuntu', 'Chrome', '20.0.04'],
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 10000,
        retryRequestDelayMs: 5000,
        syncFullHistory: false,
        generateHighQualityLinkPreview: true,
    });

    // --- EVENT HANDLERS ---
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log('\n================================================');
            console.log('👇 KODE QR STRING (Copy ke goqr.me):');
            console.log(qr);
            console.log('================================================\n');
        }

        if (connection === 'close') {
            const reason = lastDisconnect.error?.output?.statusCode;
            console.log(`❌ Koneksi terputus. Reason: ${reason}`);

            // LOGIKA RECONNECT PINTAR
            if (reason === DisconnectReason.loggedOut) {
                console.log("⚠️ Sesi Log Out / Diblokir. Hapus folder auth...");
                if (fs.existsSync('./auth_baileys')) fs.rmSync('./auth_baileys', { recursive: true, force: true });
                startBot();
            } else if (reason === 515) {
                console.log("🔄 Restart Biasa (Stream Error). MENYAMBUNG KEMBALI TANPA HAPUS SESI...");
                setTimeout(() => startBot(), 2000);
            } else {
                console.log("🔄 Reconnecting in 5s...");
                setTimeout(() => startBot(), 5000);
            }

        } else if (connection === 'open') {
            console.log('✅ BOT SIAP! 🚀');
            console.log('🔒 Mode: Grup Whitelist');
        }
    });


    sock.ev.on('creds.update', saveCreds);

    // --- MESSAGE HANDLER ---
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        const m = messages[0];
        if (!m.message) return;

        try {
            const remoteJid = m.key.remoteJid;
            const isGroup = remoteJid.endsWith('@g.us');
            const sender = isGroup ? (m.key.participant || m.participant) : remoteJid;
            const pushName = m.pushName || "Tanpa Nama";

            const msgType = Object.keys(m.message)[0];
            const body = m.message.conversation ||
                m.message.extendedTextMessage?.text ||
                m.message.imageMessage?.caption || "";

            if (body) console.log(`📨 PESAN DARI ${pushName}: ${body.slice(0, 30)}...`);

            const hasMedia = (msgType === 'imageMessage' || msgType === 'videoMessage' || msgType === 'documentMessage');

            // --- CHAT HELPER ---
            const chat = {
                id: { _serialized: remoteJid },
                isGroup: isGroup,
                sendMessage: async (content) => {
                    if (typeof content === 'string') {
                        await sock.sendMessage(remoteJid, { text: content });
                    } else {
                        await sock.sendMessage(remoteJid, content);
                    }
                }
            };

            // --- MSG HELPER ---
            const msg = {
                body: body,
                from: remoteJid,
                author: sender,
                pushName: pushName,
                hasMedia: hasMedia,
                type: msgType,
                getChat: async () => chat,
                react: async (emoji) => await sock.sendMessage(remoteJid, { react: { text: emoji, key: m.key } }),
                reply: async (text) => await sock.sendMessage(remoteJid, { text: text + "" }, { quoted: m }),
                key: m.key,
                message: m.message,
                extendedTextMessage: m.message.extendedTextMessage
            };
            // SECURITY CHECK
            if (!chat.isGroup) return; // Hanya respon di grup
            if (msg.body === '!idgrup') return msg.reply(`🆔 *ID GRUP:* \`${chat.id._serialized}\``);
            if (!ALLOWED_GROUPS.includes(chat.id._serialized)) return;

            // ==========================================================
            //  DATABASE & LOGIKA USER
            // ==========================================================
            const db = global.db;
            if (!db.users) db.users = {};
            if (!db.market) db.market = {};

            const today = new Date().toISOString().split("T")[0];
            const defaultQuest = {
                daily: [
                    { id: "chat", name: "Ngobrol Aktif", progress: 0, target: 10, reward: 200, claimed: false },
                    { id: "game", name: "Main Casino", progress: 0, target: 3, reward: 300, claimed: false },
                    { id: "sticker", name: "Bikin Stiker", progress: 0, target: 2, reward: 150, claimed: false }
                ],
                weekly: { id: "weekly", name: "Weekly Warrior", progress: 0, target: 100, reward: 2000, claimed: false },
                lastReset: today
            };


            // A. REGISTER NEW USER (Jika user belum ada di database)
            if (!db.users[sender]) {
                const totalUsers = Object.keys(db.users).length;

                db.users[sender] = {
                    // --- DATA UTAMA ---
                    id: totalUsers + 1,
                    name: pushName || "User",
                    balance: 15000000, // Modal Awal 15 Juta
                    bank: 0,
                    debt: 0,
                    xp: 0,
                    level: 1,
                    hp: 100,
    hunger: 100,
    energy: 100,
    lastLifeUpdate: Date.now(),
    isDead: false,

                    // --- FITUR LAMA (RPG/Gacha) ---
                    inv: [],
                    buffs: {},
                    lastDaily: 0,
                    bolaWin: 0, bolaTotal: 0, bolaProfit: 0,
                    crypto: {},
                    quest: typeof defaultQuest !== 'undefined' ? JSON.parse(JSON.stringify(defaultQuest)) : { daily: [], weekly: null },

                    // --- FITUR BARU (EKONOMI & SIMULASI) ---
                    // Wajib ada supaya bot tidak crash saat command dijalankan
                    forex: { usd: 0, eur: 0, jpy: 0, emas: 0 }, // Aset Valas
                    ternak: [], // List Hewan
                    ternak_inv: { dedak: 0, pelet: 0, premium: 0, obat: 0 }, // Pakan
                    farm: { plants: [], inventory: {}, machines: [], processing: [] }, // Pertanian
                    job: null, lastWork: 0, lastSkill: 0, // Profesi
                };
                console.log(`[NEW USER] ${pushName} registered with ID ${totalUsers + 1}`);
            }

            // B. LOAD USER & SAFETY CHECK (AUTO-FIX)
            // Bagian ini menjamin USER LAMA (Legacy) mendapatkan properti baru tanpa reset data.
            const user = db.users[sender];
            if (!user) return; // Safety check

            // Update info dasar
            user.lastSeen = Date.now();
            user.name = pushName || user.name || "User";

            // --- CEK & PERBAIKI DATA LAMA ---
            if (!user.id) user.id = Object.keys(db.users).indexOf(sender) + 1;
            if (typeof user.balance === 'undefined') user.balance = 0;
            if (typeof user.bank === 'undefined') user.bank = 0;
            if (typeof user.debt === 'undefined') user.debt = 0;
            if (!user.crypto) user.crypto = {};
            if (!user.quest && typeof defaultQuest !== 'undefined') user.quest = JSON.parse(JSON.stringify(defaultQuest));

            // --- CEK & PERBAIKI FITUR BARU---
            // 1. Valas & Emas
            if (!user.forex) user.forex = { usd: 0, eur: 0, jpy: 0, emas: 0 };

            // 2. Peternakan
            if (!user.ternak) user.ternak = [];
            if (!user.ternak_inv) user.ternak_inv = { dedak: 0, pelet: 0, premium: 0, obat: 0 };

            // 3. Pertanian & Industri
            if (!user.farm) user.farm = { plants: [], inventory: {}, machines: [], processing: [] };

            // 4. Mining 
            if (!user.mining) user.mining = { racks: [], lastClaim: 0, totalHash: 0 };

            // 4. Profesi & Kriminal
            if (!user.job) user.job = null;
            if (!user.lastWork) user.lastWork = 0;

            // 5. SISTEM KEHIDUPAN (AUTO DECAY)
            const now = Date.now();
            
            // Init jika user lama belum punya status
            if (typeof user.hp === 'undefined') user.hp = 100;
            if (typeof user.hunger === 'undefined') user.hunger = 100;
            if (typeof user.energy === 'undefined') user.energy = 100;
            if (typeof user.lastLifeUpdate === 'undefined') user.lastLifeUpdate = now;
            if (typeof user.isDead === 'undefined') user.isDead = false;

            // Cek Setting Admin (Jika admin matikan status, skip)
            if (db.settings && db.settings.lifeSystem !== false && !user.isDead) {
                const diffMs = now - user.lastLifeUpdate;
                const diffMinutes = Math.floor(diffMs / 60000); // Hitung selisih menit

                if (diffMinutes > 0) {
                    // KONFIGURASI PENGURANGAN (Samakan dengan economy.js)
                    const DECAY_LAPAR = 2;   // -2% per menit
                    const DECAY_ENERGI = 1;  // -1% per menit
                    const DECAY_HP = 5;      // -5% per menit (jika kelaparan)

                    user.hunger -= diffMinutes * DECAY_LAPAR;
                    user.energy -= diffMinutes * DECAY_ENERGI;

                    // Batas Min 0
                    if (user.hunger < 0) user.hunger = 0;
                    if (user.energy < 0) user.energy = 0;

                    // Jika Lapar 0, Darah berkurang
                    if (user.hunger === 0) {
                        user.hp -= diffMinutes * DECAY_HP;
                    }

                    // Cek Kematian
                    if (user.hp <= 0) {
                        user.hp = 0;
                        user.isDead = true;
                        // Denda mati (20%)
                        user.balance = Math.floor(user.balance * 0.8);
                        chat.sendMessage(`💀 *@${sender.split('@')[0]} MATI KELAPARAN/SAKIT!*\nSaldo dipotong 20% untuk biaya pemakaman.\nKetik !rs untuk hidup kembali.`);
                    }
                    
                    user.lastLifeUpdate = now; // Simpan waktu terakhir interaksi
                }
            }

            // ANTI TOXIC
            const toxicWords = ["anjing", "kontol", "memek", "goblok", "idiot", "babi", "tolol", "ppq", "jembut"];
            if (toxicWords.some(k => body.toLowerCase().includes(k))) return msg.reply("⚠️ Jaga ketikan bro, jangan toxic!");

            // DAILY RESET & BUFF CHECK
            if (user.quest?.lastReset !== today) {
                user.quest.daily.forEach(q => { q.progress = 0; q.claimed = false; });
                user.quest.lastReset = today;

                // --- TAMBAHAN BARU: RESET HARIAN ---
                user.dailyIncome = 0; // Reset pendapatan harian jadi 0
                user.dailyUsage = 0;  // Reset limit transfer harian jadi 0
                // -----------------------------------
            }
            // Pastikan variabel ada (Init)
            if (typeof user.dailyIncome === 'undefined') user.dailyIncome = 0;
            if (user.buffs) {
                for (let key in user.buffs) {
                    if (user.buffs[key].active && Date.now() >= user.buffs[key].until) user.buffs[key].active = false;
                }
            }

            // XP & LEVELING
            let xpGain = user.buffs?.xp?.active ? 5 : 2;
            user.xp += xpGain;
            if (user.quest.weekly && !user.quest.weekly.claimed) user.quest.weekly.progress++;
            let nextLvl = Math.floor(user.xp / 100) + 1;
            if (nextLvl > user.level) {
                user.level = nextLvl;
                msg.reply(`🎊 *LEVEL UP!* Sekarang kamu Level *${user.level}*`);
            }
            addQuestProgress(user, "chat");

            // ==========================================================
            //  🕵️ TIME MACHINE LOGGER
            // ==========================================================

            // Masukkan ID Grup Khusus Time Machine disini
            const LOGGING_GROUPS = [
                "120363310599817766@g.us",       // Grup Sodara
                "6282140693010-1590052322@g.us", // Grup Keluarga Wonoboyo
                "120363253471284606@g.us",       // Grup Ambarya
                "120363328759898377@g.us",       // Grup Testingbot
            ];

            // Cek apakah grup ini dipantau, ada teks, dan bukan command
            if (LOGGING_GROUPS.includes(remoteJid) && body && !body.startsWith('!') && !body.startsWith('.')) {

                // Init Database Logs
                if (!db.chatLogs) db.chatLogs = {};
                if (!db.chatLogs[remoteJid]) db.chatLogs[remoteJid] = [];

                // REKAM PESAN (Unlimited)
                db.chatLogs[remoteJid].push({
                    t: Date.now(),
                    u: pushName,
                    m: body
                });
            }

            // PARSE COMMAND
            const isCommand = body.startsWith('!');
            const args = isCommand ? body.slice(1).trim().split(/ +/) : [];
            const command = isCommand ? args.shift().toLowerCase() : "";

            // ==========================================================
            //  COMMAND HANDLER
            // ==========================================================

            // 1. MODUL NON-PREFIX (Interaktif)
            if (command === 'id' || command === 'cekid') {
                return msg.reply(`🆔 *ID INFO*\nChat: \`${remoteJid}\`\nUser: \`${sender}\``);
            }

            if (typeof pdfCmd !== 'undefined') {
                await pdfCmd(command, args, msg, sender, sock).catch(e => console.error("Error PDF:", e.message));
            }
            await gameTebakCmd(command, args, msg, user, db, body).catch(e => console.error("Error Game:", e.message));

            // 2. MODUL PREFIX (!)
            if (!isCommand) return;

            await ternakCmd(command, args, msg, user, db).catch(e => console.error("Error Ternak:", e.message));
            await toolsCmd(command, args, msg, user, db, sock).catch(e => console.error("Error Tools:", e.message));
            await timeMachineCmd(command, args, msg, user, db, sock);
            await devCmd(command, args, msg, user, db, sock).catch(e => console.error("Error Dev:", e.message));
            await pabrikCommand(command, args, msg, user, db, sock).catch(e => console.error("Error Pabrik:", e.message));
            await economyCmd(command, args, msg, user, db).catch(e => console.error("Error Economy:", e.message));
            await chartCmd(command, args, msg, user, db, sock).catch(e => console.error("Error Chart:", e.message));
            await stocksCmd(command, args, msg, user, db, sock).catch(e => console.error("Error Stocks:", e.message));
            await cryptoCmd(command, args, msg, user, db).catch(e => console.error("Error Crypto:", e.message));
            await propertyCmd(command, args, msg, user, db).catch(e => console.error("Error Property:", e.message));
            await minesCmd(command, args, msg, user, db).catch(e => console.error("Error Mines:", e.message));
            await miningCmd(command, args, msg, user, db).catch(e => console.error("Error Mining:", e.message));
            await duelCmd(command, args, msg, user, db).catch(e => console.error("Error Duel:", e.message));
            await bolaCmd(command, args, msg, user, db, sender).catch(e => console.error("Error Bola:", e.message));
            await nationCmd(command, args, msg, user, db).catch(e => console.error("Error Nation:", e.message));
            await robCmd(command, args, msg, user, db, sock).catch(e => console.error("Error Rob:", e.message));
            await valasCmd(command, args, msg, user, db).catch(e => console.error("Error Valas:", e.message));
            await farmingCmd(command, args, msg, user, db).catch(e => console.error("Error Farming:", e.message));
            await jobsCmd(command, args, msg, user, db).catch(e => console.error("Error Jobs:", e.message));
            await rouletteCmd(command, args, msg, user, db).catch(e => console.error("Error Roulette:", e.message));
            await battleCmd(command, args, msg, user, db).catch(e => console.error("Error Battle:", e.message));
            await ttsCmd(command, args, msg).catch(e => console.error("Error TTS:", e.message));
            await wikiKnowCmd(command, args, msg).catch(e => console.error("Error WikiKnow:", e.message));
            await adminCmd(command, args, msg, user, db).catch(e => console.error("Error Admin:", e.message));
            await rpgCmd(command, args, msg, user, db).catch(e => console.error("Error RPG:", e.message));
            await slitherCmd(command, args, msg, user, db).catch(e => console.error("Error Slither:", e.message));
            await aiCmd(command, args, msg, user, db).catch(e => console.error("Error AI:", e.message));
            await caturCmd(command, args, msg, user, db, sock).catch(e => console.error("Error Catur:", e.message));
            await imageCmd(command, args, msg, user, db, sock).catch(e => console.error("Error Image:", e.message));

            if (typeof profileCmd !== 'undefined') {
                await profileCmd(command, args, msg, user, db, chat, sock).catch(e => console.error("Error Profile:", e.message));
            }

            // ==========================================================
            //  FITUR STEGANOGRAFI
            // ==========================================================

            // COMMAND: !hide <pesan> (Reply/Kirim Gambar)
            if (command === 'hide') {
                const isImage = (msgType === 'imageMessage');
                const isQuotedImage = m.message.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage;

                if (!isImage && !isQuotedImage) return msg.reply("⚠️ Kirim/Reply gambar dengan caption: !hide pesan rahasia");

                const pesanRahasia = args.join(" ");
                if (!pesanRahasia) return msg.reply("⚠️ Mana pesannya? Contoh: !hide Misi Rahasia 007");

                msg.reply("⏳ Sedang menyembunyikan pesan...");

                try {
                    let messageToDownload = m;
                    if (isQuotedImage) {
                        messageToDownload = {
                            key: m.message.extendedTextMessage.contextInfo.stanzaId,
                            message: m.message.extendedTextMessage.contextInfo.quotedMessage
                        };
                    }

                    const buffer = await downloadMediaMessage(
                        messageToDownload,
                        'buffer',
                        {},
                        { logger: pino({ level: 'silent' }) }
                    );

                    const inputPath = `./temp_input_${sender.split('@')[0]}.jpg`;
                    const outputPath = `./temp_output_${sender.split('@')[0]}.png`;

                    fs.writeFileSync(inputPath, buffer);

                    // Pakai 'python3' dan path 'commands/stegano.py'
                    const cmdPython = `python3 commands/stegano.py hide "${inputPath}" "${pesanRahasia}" "${outputPath}"`;

                    exec(cmdPython, async (error, stdout, stderr) => {
                        if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);

                        if (error) {
                            console.error("Stegano Error:", error);
                            if (error.message.includes("not found")) {
                                return msg.reply("❌ Error: Python3 tidak terinstall/terdeteksi.");
                            }
                            return msg.reply("❌ Gagal. Pastikan gambar tidak rusak.");
                        }

                        await sock.sendMessage(remoteJid, {
                            document: fs.readFileSync(outputPath),
                            mimetype: 'image/png',
                            fileName: 'RAHASIA.png',
                            caption: '✅ SUKSES! Download file ini (Document) agar pesan aman.'
                        }, { quoted: m });

                        setTimeout(() => {
                            if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
                        }, 5000);
                    });

                } catch (err) {
                    console.log(err);
                    msg.reply("Gagal mendownload gambar.");
                }
            }

            // COMMAND: !reveal (Reply Gambar/Dokumen)
            if (command === 'reveal') {
                const quotedMsg = m.message.extendedTextMessage?.contextInfo?.quotedMessage;
                const isQuotedDoc = quotedMsg?.documentMessage;
                const isQuotedImg = quotedMsg?.imageMessage;

                if (!isQuotedDoc && !isQuotedImg) {
                    return msg.reply("⚠️ Reply gambar/dokumen rahasia dengan !reveal");
                }

                msg.reply("🔍 Sedang membaca pesan...");

                try {
                    const messageToDownload = {
                        key: m.message.extendedTextMessage.contextInfo.stanzaId,
                        message: quotedMsg
                    };

                    const buffer = await downloadMediaMessage(
                        messageToDownload,
                        'buffer',
                        {},
                        { logger: pino({ level: 'silent' }) }
                    );

                    const inputPath = `./temp_reveal_${sender.split('@')[0]}.png`;
                    fs.writeFileSync(inputPath, buffer);

                    // Pakai 'python3' dan path 'commands/stegano.py'
                    const cmdPython = `python3 commands/stegano.py reveal "${inputPath}"`;

                    exec(cmdPython, (error, stdout, stderr) => {
                        if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);

                        if (error) return msg.reply("❌ Tidak ditemukan pesan rahasia di file ini (atau format salah).");

                        msg.reply(stdout);
                    });

                } catch (e) {
                    console.log(e);
                    msg.reply("Gagal mengambil media.");
                }
            }


            // MENU UTAMA
            if (command === "menu" || command === "help") {
                const menuText = `📜 *MENU BOT MULTIFUNGSI*

👤 *USER & PROFILE*
• !me | !rank | !inv | !daily | !quest
• !migrasi @akun_asli (Gabung Akun)

🏦 *BANK & KRIMINAL*
• !bank : Cek Saldo, Utang & Limit
• !depo <jml> | !tarik <jml>
• !tf @user <jml> (Pajak 5%, Limit 10M)
• !pinjam <jml> (Max 5M, Bunga 20%)
• !bayar <jml> (Lunasi Utang)
• !rob @user (Butuh Energi, Denda 10%)
• !top : Leaderboard Orang Terkaya

❤️ *LIFE & SURVIVAL*
_Jaga nyawa! Mati = Saldo lenyap 20%_
• !me : Cek HP, Lapar & Energi
• !makan : Bayar 50 Juta
• !tidur <jam> : Tidur 1-10 jam (Isi Energi)
• !bangun : Bangun paksa sebelum waktu habis
• !rs : Berobat (Bayar 500 Juta)
• !matistatus : Mode AFK (Anti Mati)
• !nyalastatus : Aktifkan status kembali

🚀 *CRYPTO & MINING*
• !market | !pf | !topcrypto
• !buycrypto <koin> <jml>
• !sellcrypto <koin> <jml>
• !margin | !paydebt

📈 *PASAR SAHAM BEI*
• !saham        : Cek harga saham Real-time
• !belisaham <kode> <jml> : Beli saham
• !jualsaham <kode> <jml> : Jual saham
• !pf/!porto           : Cek Portofolio Saham & Aset
• !chart <Coin> : Melihat  grafik

🏢 *BISNIS & PROPERTI*
• !properti     : Cek katalog & aset kamu
• !beliusaha <id> <jml> : Beli bisnis baru
• !collect      : Panen uang dari bisnis

🏭 *FARMING & INDUSTRI*
• !farming : Panduan Bertani
• !tanam <nama> : Mulai menanam (Sawit/Kopi/dll)
• !ladang : Cek kebun & panen
• !toko : Beli Mesin Pabrik (Gilingan/Roaster/dll)
• !olah <mesin> <jml> : Masukkan bahan ke pabrik
• !pabrik : Cek status & ambil hasil olahan
• !jual <nama> : Jual hasil tani/pabrik

🤠 *PETERNAKAN (RANCH)*
• !ternak : Panduan Ternak
• !kandang : Cek kondisi hewan (Lapar/Sakit)
• !belihewan <jenis> : Investasi Sapi/Unta/dll
• !tokopakan : Beli Pakan & Obat
• !pakan <no> <jenis> : Beri makan biar gemuk
• !jualhewan <no> : Panen hewan (Jual daging)


🏭 *Sixteen Industri* 🏭
_Ubah hasil ternak jadi produk premium!_

👑 *KHUSUS BOS (OWNER)*
• 🏭 !pabrik : Cek status pabrik & mesin
• 🏗️ !bangunpabrik <tipe> : Beli mesin produksi
• 🤝 !rekrut @tag : Pekerjakan member grup
• 👢 !pecat @tag : Pecat karyawan
• 📦 !gudang : Cek stok bahan & produk
• 💰 !jualproduk <kode> : Jual barang ke pasar
• 🔧 !service : Perbaiki mesin rusak
• 💹 !cekpasar : Cek harga jual live

👷 *KHUSUS KARYAWAN (BURUH)*
• 🪪 !pabrik : Cek stamina & majikan
• ⚙️ !olah <bahan> <jumlah> : Proses produksi
• 🚪 !resign : Keluar dari pabrik
📚 *PANDUAN*
•  📖 !pabrik help : Lihat resep & harga mesin

💼 *PEKERJAAN (JOBS)*
• !jobs (List Lowongan)
• !lamar <nama> (Join Job)
• !kerja (Ambil Gaji)
• !skill (Kekuatan Khusus)
• !resign (Keluar)

💱 *INVESTASI VALAS*
• !kurs       : Cek harga Emas/USD/JPY (Live)
• !aset       : Cek portofolio tabungan valas
• !beliemas <gram> : Beli Emas (Safe Haven)
• !jualemas <gram> : Jual Emas ke Rupiah
• !beliusd <jml>   : Beli Dollar Amerika
• !belijpy <jml>   : Beli Yen Jepang
• !jualusd | !jualjpy : Jual mata uang asing

🎮 *GAMES*
• !gacha (Jackpot 10k!)
• !casino <jml> | !slot <jml> | !tembok (Tebak Hal di Belakang Tembok)
• !tebakgambar | !asahotak | !susunkata
• !duel @user (Russian Roullete) <bet>
• !bom <bet> !stop (Minesweeper)
• !rolet <pilihan> <bet>
• !catur <bet>
• !rpg (Turn-based Game) | !claim <kode>
• !slither | !claimslither <kode>

⚽ *SPORT BETTING*
• !updatebola | !bola | !topbola | !resultbola

🧠 *AI SUPER TIERS*
• !ai0 <tanya> (Terbaik namun terbatas)
• !ai1 <tanya> (Flagship/Smart)
• !ai2 <tanya> (Roleplay/Asik)
• !ai3 <tanya> (Speed/Cepat)
• !ask <tanya> (Auto-Pilot)
• !sharechat (Buat Link History) 

⛏️ *MINING*
• !mining : Dashboard, Status Rig & Listrik
• !panduanminer : 📘 *BACA DULU BIAR GA RUGI!*
• !claimmining : Panen BTC (Otomatis bayar listrik)
• !shopminer : Toko VGA Legal (Harga Naik-Turun)
• !bm : *Black Market* (Alat Ilegal & Kencang)
• !upgrade : Beli Cooling, PSU & Firewall
• !hack @user : Curi BTC Orang (PvP)
• !topminer : Ranking Pemilik Bitcoin

🏳️ *NEGARA (WAR)*
• !negara : Cek status & infrastruktur
• !buatnegara <nama> : Bikin Negara (Biaya 5 Miliar)
• !bangun <tipe> : Bank(10M)/Benteng(25M)/RS(5M)
• !rekrut <jml> : Beli Tentara (50 Juta/orang)
• !serang @target : Perang Buta (Blind War)
• !pajaknegara : Tarik pajak dari rakyat
• !subsidi <jml> : Transfer Uang Pribadi -> Kas
• !korupsi <jml> : Maling Uang Kas (Awas Kudeta!)
• !topnegara (Leaderboard)

📸 *EDITOR & MEDIA*
• !sticker !toimg (Buat Stiker WA)
• !topdf (Ubah Gambar ke PDF)
• !scan (Gambar B&W) 
• !pdfdone (Selesai & Buat PDF)
• !tts (text to speech)
• !img (Image generator)
• !hide <pesan> (Reply/Kirim Gambar) | !reveal: Munculkan pesan

🕰️ *TIME MACHINE*
• !timemachine : Lihat arsip chat random masa lalu
• !timemachine <kode> : Navigasi waktu (Maju/Mundur 1 Jam)
• !flashback : Kenangan harian pada jam ini


🛠️ *TOOLS & ADMIN*
• !id (Cek ID Lengkap)
• !idgrup (Cek ID Grup)`;
                return msg.reply(menuText);
            }

        } catch (e) {
            console.error("Critical Error di Index.js:", e.message);
        }
    });

    // AUTO SAVE (60 Detik)
    setInterval(() => {
        if (global.db) saveDB(global.db);
    }, 60000);
}

startBot();

// ==========================================================
//  PENANGANAN SHUTDOWN (Agar Data Tidak Hilang)
// ==========================================================

async function handleExit(signal) {
    console.log(`🛑 Menerima sinyal ${signal}. Mematikan bot...`);

    // 1. Simpan Database Terakhir (PENTING)
    if (global.db && typeof saveDB === 'function') {
        console.log("💾 Menyimpan database sebelum keluar...");
        await saveDB(global.db);
    }

    // 2. Tutup Koneksi Socket (Baileys) jika ada
    // (Opsional, karena process.exit akan mematikan socket juga)

    console.log("✅ Shutdown selesai. Bye!");
    process.exit(0);
}

// Tangkap sinyal mematikan dari Koyeb/Terminal
process.on('SIGINT', () => handleExit('SIGINT'));
process.on('SIGTERM', () => handleExit('SIGTERM'));










