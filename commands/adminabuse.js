// ============================================================
//  🎉 ADMIN ABUSE EVENT SYSTEM  v2.0
//  - Otomatis aktif di SEMUA grup whitelist sekaligus
//  - Hanya admin grup ATAU owner bot yang bisa trigger
//  - Trigger: !adminabuseon / !adminabuseoff
//  - Duration: 30 menit, ganti event tiap 5 menit otomatis
//  - 12 Event Random: Ekonomi, Mining, Farming, Game, Kompetisi
// ============================================================

const { saveDB } = require('../helpers/database');
const fmt = (num) => Math.floor(Number(num) || 0).toLocaleString('id-ID');

// ============================================================
//  KONFIGURASI — sesuaikan dengan milikmu
// ============================================================

// Semua grup whitelist (sama persis dengan ALLOWED_GROUPS di index.js)
const ALL_GROUPS = [
    '120363310599817766@g.us',
    '6282140693010-1590052322@g.us',
    '120363253471284606@g.us',
    '120363328759898377@g.us',
    '120363422854499629@g.us',
    '120363426746650307@g.us',
];

// Owner bot — selalu boleh pakai command ini meski bukan admin grup
const OWNER_ID = '244203384742140@lid';

const EVENT_DURATION = 30 * 60 * 1000;  // 30 menit
const INTERVAL       =  5 * 60 * 1000;  // rotasi tiap 5 menit

// ============================================================
//  STATE GLOBAL
// ============================================================
if (!global.abuseState) {
    global.abuseState = {
        active:       false,
        currentEvent: null,
        eventData:    {},
        mainTimer:    null,
        intervalRef:  null,
        sock:         null,
        db:           null,
        eventQueue:   [],
        eventIndex:   0,
        startTime:    null,
    };
}

// ============================================================
//  HELPER: Broadcast pesan ke SEMUA grup whitelist
// ============================================================
async function broadcast(text, mentions = []) {
    const sock = global.abuseState.sock;
    if (!sock) return;
    for (const gid of ALL_GROUPS) {
        try {
            await sock.sendMessage(gid, { text, mentions });
        } catch (e) {
            console.error(`[AdminAbuse] Gagal kirim ke ${gid}:`, e.message);
        }
    }
}

// ============================================================
//  HELPER: Cek apakah sender adalah admin di suatu grup
// ============================================================
async function isGroupAdmin(sock, groupId, senderJid) {
    // Owner selalu lolos
    if (senderJid === OWNER_ID) return true;

    try {
        const meta = await sock.groupMetadata(groupId);
        const admins = meta.participants
            .filter(p => p.admin === 'admin' || p.admin === 'superadmin')
            .map(p => p.id);
        return admins.includes(senderJid);
    } catch (e) {
        console.error('[AdminAbuse] Gagal cek admin:', e.message);
        return false;
    }
}

// ============================================================
//  HELPER: Acak urutan 12 event
// ============================================================
const EVENT_LIST = [
    'hujan_uang', 'jackpot_bersama', 'borong_pasar', 'meteor_langka',
    'musim_panen', 'rush_tambang', 'winrate_gila', 'duel_berhadiah',
    'tebak_berhadiah', 'balapan_klik', 'lomba_aktif', 'boss_raid',
];

function shuffleEvents() {
    const arr = [...EVENT_LIST];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// ============================================================
//  HP BAR HELPER
// ============================================================
function hpBar(hp, maxHp) {
    const fill = Math.round((hp / maxHp) * 10);
    return '█'.repeat(Math.max(0, fill)) + '░'.repeat(Math.max(0, 10 - fill));
}

// ============================================================
//  MULAI EVENT BERIKUTNYA (broadcast ke semua grup)
// ============================================================
async function startNextEvent() {
    const state = global.abuseState;
    if (!state.active) return;

    const db        = state.db;
    const eventName = state.eventQueue[state.eventIndex % state.eventQueue.length];
    state.eventIndex++;
    state.currentEvent = eventName;
    state.eventData    = {};

    const sisaMenit = Math.ceil((EVENT_DURATION - (Date.now() - state.startTime)) / 60000);
    console.log(`[AdminAbuse] 🎲 Event: ${eventName}`);

    switch (eventName) {

        // ── 1. HUJAN UANG ────────────────────────────────────
        case 'hujan_uang': {
            let bonus   = 0;
            let topList = [];
            for (const jid in db.users) {
                const reward = Math.floor(Math.random() * 2000000) + 500000;
                db.users[jid].balance = (db.users[jid].balance || 0) + reward;
                bonus += reward;
                topList.push({ jid, reward });
            }
            saveDB(db);
            const tampil = topList
                .sort((a, b) => b.reward - a.reward)
                .slice(0, 8)
                .map(x => `• @${x.jid.split('@')[0]}: +💰${fmt(x.reward)}`)
                .join('\n');
            await broadcast(
                `🌧️ *EVENT: HUJAN UANG!* 🌧️\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `Koin berjatuhan dari langit!\n` +
                `Semua member aktif mendapat bonus!\n\n` +
                `${tampil}${topList.length > 8 ? `\n...dan ${topList.length - 8} lainnya` : ''}\n\n` +
                `💰 Total hujan: *${fmt(bonus)} koin!*\n` +
                `⏱️ Sisa event: *${sisaMenit} menit*`,
                topList.slice(0, 8).map(x => x.jid)
            );
            break;
        }

        // ── 2. JACKPOT BERSAMA ───────────────────────────────
        case 'jackpot_bersama': {
            const kontribusi = 50000;
            let pot = 0, peserta = [];
            for (const jid in db.users) {
                if ((db.users[jid].balance || 0) >= kontribusi) {
                    db.users[jid].balance -= kontribusi;
                    pot += kontribusi;
                    peserta.push(jid);
                }
            }
            if (peserta.length === 0) {
                await broadcast(`🎰 *JACKPOT BERSAMA* — Tidak ada yang cukup saldo. Event dilewati!`);
                break;
            }
            const winnerJid = peserta[Math.floor(Math.random() * peserta.length)];
            db.users[winnerJid].balance += pot;
            saveDB(db);
            await broadcast(
                `🎰 *EVENT: JACKPOT BERSAMA!* 🎰\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `Semua member taruh 💰${fmt(kontribusi)} ke dalam pot!\n\n` +
                `👥 Peserta: *${peserta.length} orang*\n` +
                `💰 Total Pot: *${fmt(pot)} koin*\n\n` +
                `🎊 *PEMENANG: @${winnerJid.split('@')[0]}*\n` +
                `🏆 Menang: *${fmt(pot)} koin!*\n\n` +
                `⏱️ Sisa event: *${sisaMenit} menit*`,
                [winnerJid]
            );
            break;
        }

        // ── 3. BORONG PASAR ──────────────────────────────────
        case 'borong_pasar': {
            if (!db.settings) db.settings = {};
            db.settings.borongPasar       = true;
            db.settings.borongPasarUntil  = Date.now() + INTERVAL;
            db.settings.borongPasarDiskon = 50;
            saveDB(db);
            state.eventData.borongPasar = true;
            await broadcast(
                `🛒 *EVENT: BORONG PASAR!* 🛒\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `DISKON BESAR-BESARAN SELAMA 5 MENIT!\n\n` +
                `💥 Semua item toko: *DISKON 50%*\n` +
                `🌾 Bibit pertanian: *DISKON 50%*\n` +
                `🐄 Hewan ternak: *DISKON 50%*\n` +
                `⛏️ Hardware mining: *DISKON 50%*\n\n` +
                `⚠️ Stok terbatas! Belanja sekarang!\n` +
                `⏱️ Berakhir dalam 5 menit!`
            );
            break;
        }

        // ── 4. METEOR LANGKA ─────────────────────────────────
        case 'meteor_langka': {
            const rewards = [
                { nama: '💎 Diamond',       nilai: 5000000  },
                { nama: '🏅 Gold Ore',      nilai: 3000000  },
                { nama: '⚡ Energy Crystal', nilai: 7000000  },
                { nama: '🔮 Magic Shard',   nilai: 10000000 },
                { nama: '🌑 Dark Matter',   nilai: 15000000 },
            ];
            const pilihan = rewards[Math.floor(Math.random() * rewards.length)];
            state.eventData.meteorActive  = true;
            state.eventData.meteorReward  = pilihan;
            state.eventData.meteorKlaim   = false;
            state.eventData.meteorKeyword = 'KLAIM';
            await broadcast(
                `☄️ *EVENT: METEOR LANGKA JATUH!* ☄️\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `Sebuah meteor langka baru saja jatuh!\n\n` +
                `💰 Isi: *${pilihan.nama}*\n` +
                `💵 Nilai: *${fmt(pilihan.nilai)} koin*\n\n` +
                `⚡ Siapa CEPAT dia dapat!\n` +
                `🏃 Ketik *KLAIM* sekarang juga!\n` +
                `(Hanya 1 orang pertama di tiap grup)\n\n` +
                `⏱️ Berakhir dalam 5 menit!`
            );
            break;
        }

        // ── 5. MUSIM PANEN ───────────────────────────────────
        case 'musim_panen': {
            if (!db.settings) db.settings = {};
            db.settings.musimPanen      = true;
            db.settings.musimPanenUntil = Date.now() + INTERVAL;
            db.settings.musimPanenMult  = 3;
            saveDB(db);
            state.eventData.musimPanen = true;
            await broadcast(
                `🌾 *EVENT: MUSIM PANEN RAYA!* 🌾\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `Alam sedang berbaik hati!\n\n` +
                `🐔 Hasil ternak: *3x LIPAT*\n` +
                `🌱 Hasil farming: *3x LIPAT*\n` +
                `🐟 Jual ikan: *3x LIPAT*\n\n` +
                `🏃 Segera panen sekarang!\n` +
                `Ketik *!panen* atau *!jualternak*\n\n` +
                `⏱️ Berlaku selama 5 menit!`
            );
            break;
        }

        // ── 6. RUSH TAMBANG ──────────────────────────────────
        case 'rush_tambang': {
            if (!db.settings) db.settings = {};
            db.settings.rushTambang      = true;
            db.settings.rushTambangUntil = Date.now() + INTERVAL;
            saveDB(db);
            state.eventData.rushTambang = true;
            await broadcast(
                `⛏️ *EVENT: RUSH TAMBANG!* ⛏️\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `Urat mineral langka terdeteksi!\n\n` +
                `🔥 *COOLDOWN MINING = 0!*\n` +
                `🔥 *HASIL MINING = 5x LIPAT!*\n` +
                `🔥 *Listrik GRATIS!*\n\n` +
                `Ketik *!claimmining* terus-terusan!\n\n` +
                `⏱️ Berlaku selama 5 menit!`
            );
            break;
        }

        // ── 7. WINRATE GILA ──────────────────────────────────
        case 'winrate_gila': {
            if (!db.settings) db.settings = {};
            db.settings.winrateGila      = true;
            db.settings.winrateGilaUntil = Date.now() + INTERVAL;
            db.settings.winrateGilaRate  = 85;
            saveDB(db);
            state.eventData.winrateGila = true;
            await broadcast(
                `🎲 *EVENT: WINRATE GILA!* 🎲\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `Kasino RUSAK! Sistem error!\n\n` +
                `🍀 *WINRATE CASINO = 85%!*\n` +
                `🍀 *WINRATE SLOT = 85%!*\n` +
                `🍀 *WINRATE ROULETTE = 85%!*\n\n` +
                `Coba: *!casino*, *!slot*, *!rolet*\n\n` +
                `⏱️ Berlaku selama 5 menit saja!`
            );
            break;
        }

        // ── 8. DUEL BERHADIAH ────────────────────────────────
        case 'duel_berhadiah': {
            const bonusDuel = 2000000;
            if (!db.settings) db.settings = {};
            db.settings.duelBonus      = bonusDuel;
            db.settings.duelBonusUntil = Date.now() + INTERVAL;
            saveDB(db);
            state.eventData.duelBonus = bonusDuel;
            await broadcast(
                `⚔️ *EVENT: DUEL BERHADIAH!* ⚔️\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `Arena duel dibuka spesial!\n\n` +
                `🏆 Setiap menang duel:\n` +
                `💰 *+${fmt(bonusDuel)} KOIN BONUS*\n` +
                `(Di luar hadiah duel normal)\n\n` +
                `🤺 Ketik *!duel @user <taruhan>*\n\n` +
                `⏱️ Berlaku selama 5 menit!`
            );
            break;
        }

        // ── 9. TEBAK BERHADIAH ───────────────────────────────
        case 'tebak_berhadiah': {
            const soalList = [
                { soal: 'Ibukota Indonesia?',                           jawaban: 'jakarta',     alt: [] },
                { soal: 'Berapa 25 x 4?',                              jawaban: '100',          alt: [] },
                { soal: 'Hewan darat terbesar di dunia?',              jawaban: 'gajah',        alt: ['elephant'] },
                { soal: 'Planet terdekat dengan Matahari?',            jawaban: 'merkurius',    alt: ['merkuri'] },
                { soal: 'Simbol kimia untuk emas?',                    jawaban: 'au',           alt: ['gold'] },
                { soal: 'Berapa 2 pangkat 10?',                        jawaban: '1024',         alt: [] },
                { soal: 'Siapa penemu lampu bohlam?',                  jawaban: 'edison',       alt: ['thomas edison'] },
                { soal: 'Warna campuran merah + biru?',                jawaban: 'ungu',         alt: ['purple', 'violet'] },
                { soal: 'Berapa sisi pada segitiga?',                  jawaban: '3',            alt: ['tiga'] },
                { soal: 'Negara mana yang punya menara Eiffel?',       jawaban: 'prancis',      alt: ['paris', 'france'] },
                { soal: 'Mata uang negara Jepang?',                    jawaban: 'yen',          alt: ['jen'] },
                { soal: 'Berapa 100 dibagi 4?',                        jawaban: '25',           alt: ['dua puluh lima'] },
                { soal: 'Bahasa pemrograman buatan Guido van Rossum?', jawaban: 'python',       alt: [] },
                { soal: 'Jumlah pemain bola dalam 1 tim?',             jawaban: '11',           alt: ['sebelas'] },
                { soal: 'Apa nama bulan ke-8?',                        jawaban: 'agustus',      alt: ['august'] },
                { soal: 'Berapa 15 x 15?',                             jawaban: '225',          alt: [] },
                { soal: 'Bahasa resmi Brazil?',                        jawaban: 'portugis',     alt: ['portuguese'] },
                { soal: 'Siapa pencipta teori relativitas?',           jawaban: 'einstein',     alt: ['albert einstein'] },
            ];
            const pilih  = soalList[Math.floor(Math.random() * soalList.length)];
            const hadiah = Math.floor(Math.random() * 4000000) + 2000000;
            state.eventData.tebakActive  = true;
            state.eventData.tebakJawaban = pilih.jawaban;
            state.eventData.tebakAlt     = pilih.alt || [];
            state.eventData.tebakHadiah  = hadiah;
            // Per-grup tracking: { groupId: sudahDijawab }
            state.eventData.tebakSudah   = {};
            await broadcast(
                `🧠 *EVENT: TEBAK BERHADIAH!* 🧠\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `Pertanyaan muncul! Jawab dengan benar!\n\n` +
                `❓ *SOAL:* ${pilih.soal}\n\n` +
                `💰 Hadiah per grup: *${fmt(hadiah)} koin!*\n` +
                `🏆 1 pemenang per grup!\n\n` +
                `💡 Langsung ketik jawabanmu!`
            );
            break;
        }

        // ── 10. BALAPAN KLIK ─────────────────────────────────
        case 'balapan_klik': {
            const kataList = [
                'GASKEUN', 'SULTAN', 'CUAN', 'JACKPOT', 'MANTAP',
                'GACOR', 'JEPE', 'TRENDING', 'BOSS', 'FOMO',
                'CRYPTO', 'DIAMOND', 'LEGEND', 'MAXWIN', 'WIBU',
            ];
            const kata   = kataList[Math.floor(Math.random() * kataList.length)];
            const hadiah = Math.floor(Math.random() * 5000000) + 3000000;
            state.eventData.balapanActive = true;
            state.eventData.balapanKata   = kata;
            state.eventData.balapanHadiah = hadiah;
            state.eventData.balapanSudah  = {}; // per grup: { groupId: true }
            await broadcast(
                `⚡ *EVENT: BALAPAN KLIK!* ⚡\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `SIAPA PALING CEPAT DIA MENANG!\n\n` +
                `⌨️ *Ketik kata ini SEKARANG:*\n` +
                `╔══════════════╗\n` +
                `║   *${kata}*   ║\n` +
                `╚══════════════╝\n\n` +
                `💰 Hadiah per grup: *${fmt(hadiah)} koin!*\n` +
                `🔥 Harus PERSIS dan HURUF KAPITAL!\n` +
                `⚠️ 1 pemenang per grup!`
            );
            break;
        }

        // ── 11. LOMBA AKTIF ──────────────────────────────────
        case 'lomba_aktif': {
            const hadiah = Math.floor(Math.random() * 8000000) + 5000000;
            state.eventData.lombaActive   = true;
            state.eventData.lombaSkor     = {}; // { jid: count }
            state.eventData.lombaHadiah   = hadiah;
            await broadcast(
                `📊 *EVENT: LOMBA AKTIF!* 📊\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `Siapa yang paling banyak ngobrol menang!\n\n` +
                `💬 Kirim pesan sebanyak-banyaknya!\n` +
                `⏱️ Durasi: *5 menit*\n\n` +
                `🏆 Hadiah pemenang per grup:\n` +
                `💰 *${fmt(hadiah)} koin!*\n\n` +
                `🏃 MULAI SEKARANG!`
            );
            break;
        }

        // ── 12. BOSS RAID ────────────────────────────────────
        case 'boss_raid': {
            const bossList = [
                { nama: '🐉 Naga Api Kuno', maxHp: 50000, reward: 15000000 },
                { nama: '👹 Demon King',    maxHp: 80000, reward: 25000000 },
                { nama: '🦄 Dark Unicorn',  maxHp: 30000, reward: 10000000 },
                { nama: '🤖 Robot Raksasa', maxHp: 60000, reward: 20000000 },
                { nama: '🌊 Kraken Laut',   maxHp: 45000, reward: 18000000 },
            ];
            const boss = bossList[Math.floor(Math.random() * bossList.length)];
            // Tiap grup punya instance boss sendiri
            state.eventData.bossActive  = true;
            state.eventData.bossNama    = boss.nama;
            state.eventData.bossMaxHp   = boss.maxHp;
            state.eventData.bossReward  = boss.reward;
            // Per-grup state: { groupId: { hp, dmg: { jid: dmg } } }
            state.eventData.bossPerGrup = {};
            for (const gid of ALL_GROUPS) {
                state.eventData.bossPerGrup[gid] = {
                    hp:  boss.maxHp,
                    dmg: {},
                };
            }
            await broadcast(
                `👾 *EVENT: BOSS RAID!* 👾\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `${boss.nama} muncul mengancam semua grup!\n\n` +
                `❤️ HP Boss: *${fmt(boss.maxHp)}*\n` +
                `💰 Reward Pool: *${fmt(boss.reward)} koin per grup*\n\n` +
                `⚔️ Ketik *!serang* untuk menyerang!\n` +
                `💥 Damage: 1.000 - 5.000 per serangan\n\n` +
                `🏆 Reward dibagi berdasarkan % damage!\n` +
                `⏱️ Boss mati jika HP = 0 atau 5 menit habis!`
            );
            break;
        }
    }
}

// ============================================================
//  RESOLVE LOMBA AKTIF SEBELUM GANTI EVENT
// ============================================================
async function resolveLombaAktif() {
    const state  = global.abuseState;
    const db     = state.db;
    const skor   = state.eventData.lombaSkor || {};
    const keys   = Object.keys(skor);
    if (keys.length === 0) {
        await broadcast(`🏁 *LOMBA AKTIF — SELESAI!*\n\nTidak ada yang kirim pesan. Tidak ada pemenang.`);
        return;
    }
    const winJid  = keys.reduce((a, b) => skor[a] > skor[b] ? a : b);
    const hadiah  = state.eventData.lombaHadiah;
    if (db.users[winJid]) db.users[winJid].balance = (db.users[winJid].balance || 0) + hadiah;
    saveDB(db);
    await broadcast(
        `🏁 *LOMBA AKTIF — SELESAI!*\n\n` +
        `🏆 Pemenang: @${winJid.split('@')[0]}\n` +
        `💬 Total chat: *${skor[winJid]} pesan*\n` +
        `💰 Hadiah: *${fmt(hadiah)} koin!*`,
        [winJid]
    );
}

// ============================================================
//  RESOLVE BOSS RAID PER GRUP SEBELUM GANTI EVENT
// ============================================================
async function resolveBossRaid(partial = false) {
    const state     = global.abuseState;
    const db        = state.db;
    const bossPerGrup = state.eventData.bossPerGrup || {};
    const pool      = state.eventData.bossReward;
    const sock      = state.sock;

    for (const gid of ALL_GROUPS) {
        const g    = bossPerGrup[gid];
        if (!g) continue;
        const dmgMap = g.dmg;
        const total  = Object.values(dmgMap).reduce((s, x) => s + x, 0);
        if (total === 0) continue;

        const mult = partial ? 0.5 : 1;
        let txt = partial
            ? `💀 *BOSS MELARIKAN DIRI!*\n📊 Reward 50% tetap dibagi:\n`
            : `🔥 *BOSS RAID SELESAI!*\n📊 Distribusi reward:\n`;

        const attackers = Object.keys(dmgMap).sort((a, b) => dmgMap[b] - dmgMap[a]).slice(0, 10);
        const mentions  = [];
        for (const jid of attackers) {
            const pct    = dmgMap[jid] / total;
            const reward = Math.floor(pool * pct * mult);
            if (db.users[jid]) db.users[jid].balance = (db.users[jid].balance || 0) + reward;
            txt += `• @${jid.split('@')[0]}: ${fmt(dmgMap[jid])} dmg → +${fmt(reward)} koin\n`;
            mentions.push(jid);
        }
        saveDB(db);
        try { await sock.sendMessage(gid, { text: txt, mentions }); } catch(e) {}
    }
}

// ============================================================
//  STOP SEMUA EVENT (cleanup)
// ============================================================
async function stopEvent(reason = 'auto') {
    const state = global.abuseState;
    if (!state.active) return;

    const db = state.db;

    // Resolve event yang sedang berjalan
    if (state.currentEvent === 'lomba_aktif' && state.eventData.lombaActive) {
        await resolveLombaAktif();
    }
    if (state.currentEvent === 'boss_raid' && state.eventData.bossActive) {
        await resolveBossRaid(true);
    }

    // Bersihkan flags di db.settings
    if (db && db.settings) {
        const flags = [
            'borongPasar','borongPasarUntil','borongPasarDiskon',
            'musimPanen','musimPanenUntil','musimPanenMult',
            'rushTambang','rushTambangUntil',
            'winrateGila','winrateGilaUntil','winrateGilaRate',
            'duelBonus','duelBonusUntil',
        ];
        flags.forEach(f => delete db.settings[f]);
        saveDB(db);
    }

    // Reset state
    state.active       = false;
    state.currentEvent = null;
    state.eventData    = {};
    state.eventIndex   = 0;
    state.eventQueue   = [];
    state.startTime    = null;
    state.sock         = null;
    state.db           = null;

    const alasan = reason === 'manual' ? 'Dihentikan oleh admin.' : 'Waktu 30 menit telah habis.';
    await broadcast(
        `🔴 *ADMIN ABUSE EVENT — SELESAI!* 🔴\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `${alasan}\n\n` +
        `Semua event telah berakhir.\n` +
        `Terima kasih sudah berpartisipasi! 🎉`
    );
}

// ============================================================
//  HANDLER PESAN INTERAKTIF
//  Dipanggil dari messages.upsert di index.js
//  untuk SETIAP pesan yang masuk dari grup whitelist
// ============================================================
module.exports.handleInteractive = async (body, sender, groupId, db) => {
    if (!ALL_GROUPS.includes(groupId)) return;
    const state = global.abuseState;
    if (!state.active || !state.currentEvent) return;

    const txtLower = (body || '').toLowerCase().trim();
    const data     = state.eventData;

    // ── METEOR: ketik KLAIM ───────────────────────────────
    if (state.currentEvent === 'meteor_langka' && data.meteorActive) {
        if (!data.meteorKlaim) {
            if (txtLower === 'klaim') {
                // Tandai grup ini sudah ada pemenang meteor (per grup)
                if (!data.meteorWinners) data.meteorWinners = {};
                if (data.meteorWinners[groupId]) return; // sudah ada yang klaim di grup ini
                data.meteorWinners[groupId] = sender;
                const nilai = data.meteorReward.nilai;
                if (db.users[sender]) db.users[sender].balance = (db.users[sender].balance || 0) + nilai;
                saveDB(db);
                try {
                    await state.sock.sendMessage(groupId, {
                        text: `☄️ *METEOR DIKLAIM!*\n\n` +
                              `@${sender.split('@')[0]} berhasil klaim meteor!\n` +
                              `${data.meteorReward.nama} senilai *${fmt(nilai)} koin*!`,
                        mentions: [sender]
                    });
                } catch(e) {}
            }
        }
        return;
    }

    // ── TEBAK BERHADIAH ───────────────────────────────────
    if (state.currentEvent === 'tebak_berhadiah' && data.tebakActive) {
        if (data.tebakSudah[groupId]) return; // grup ini sudah ada pemenang
        const corrects = [data.tebakJawaban, ...(data.tebakAlt || [])];
        if (corrects.includes(txtLower)) {
            data.tebakSudah[groupId] = true;
            const hadiah = data.tebakHadiah;
            if (db.users[sender]) db.users[sender].balance = (db.users[sender].balance || 0) + hadiah;
            saveDB(db);
            try {
                await state.sock.sendMessage(groupId, {
                    text: `🧠 *JAWABAN BENAR!*\n\n` +
                          `🏆 @${sender.split('@')[0]} jawab benar!\n` +
                          `💰 Menang: *${fmt(hadiah)} koin!*`,
                    mentions: [sender]
                });
            } catch(e) {}
        }
        return;
    }

    // ── BALAPAN KLIK ─────────────────────────────────────
    if (state.currentEvent === 'balapan_klik' && data.balapanActive) {
        if (data.balapanSudah[groupId]) return; // grup ini sudah ada pemenang
        if (body.trim() === data.balapanKata) {
            data.balapanSudah[groupId] = true;
            const hadiah = data.balapanHadiah;
            if (db.users[sender]) db.users[sender].balance = (db.users[sender].balance || 0) + hadiah;
            saveDB(db);
            try {
                await state.sock.sendMessage(groupId, {
                    text: `⚡ *PALING CEPAT!*\n\n` +
                          `⚡ @${sender.split('@')[0]} paling cepat!\n` +
                          `💰 Menang: *${fmt(hadiah)} koin!*`,
                    mentions: [sender]
                });
            } catch(e) {}
        }
        return;
    }

    // ── LOMBA AKTIF: hitung chat ──────────────────────────
    if (state.currentEvent === 'lomba_aktif' && data.lombaActive) {
        if (!data.lombaSkor[sender]) data.lombaSkor[sender] = 0;
        data.lombaSkor[sender]++;
        return;
    }

    // ── BOSS RAID: !serang ────────────────────────────────
    if (state.currentEvent === 'boss_raid' && data.bossActive) {
        if (txtLower === '!serang') {
            const g = data.bossPerGrup[groupId];
            if (!g || g.hp <= 0) return;

            const dmg = Math.floor(Math.random() * 4000) + 1000;
            g.hp = Math.max(0, g.hp - dmg);
            g.dmg[sender] = (g.dmg[sender] || 0) + dmg;

            const bar    = hpBar(g.hp, data.bossMaxHp);
            const isDead = g.hp <= 0;

            try {
                await state.sock.sendMessage(groupId, {
                    text: `⚔️ @${sender.split('@')[0]} menyerang!\n` +
                          `💥 Damage: *${fmt(dmg)}*\n` +
                          `❤️ HP Boss: ${bar} (${fmt(g.hp)}/${fmt(data.bossMaxHp)})\n` +
                          (isDead ? `\n💀 *BOSS MATI! RAID BERHASIL DI GRUP INI!*` : ''),
                    mentions: [sender]
                });
            } catch(e) {}

            if (isDead) {
                // Resolve reward untuk grup ini saja
                const total   = Object.values(g.dmg).reduce((s, x) => s + x, 0) || 1;
                const pool    = data.bossReward;
                let txt       = `🏆 *DISTRIBUSI REWARD BOSS RAID:*\n`;
                const attackers = Object.keys(g.dmg).sort((a, b) => g.dmg[b] - g.dmg[a]);
                const mentions  = [];
                for (const jid of attackers) {
                    const pct    = g.dmg[jid] / total;
                    const reward = Math.floor(pool * pct);
                    if (db.users[jid]) db.users[jid].balance = (db.users[jid].balance || 0) + reward;
                    txt += `• @${jid.split('@')[0]}: ${fmt(g.dmg[jid])} dmg → +${fmt(reward)} koin\n`;
                    mentions.push(jid);
                }
                saveDB(db);
                try { await state.sock.sendMessage(groupId, { text: txt, mentions }); } catch(e) {}
                // Tandai boss grup ini sudah mati
                g.hp = 0;
            }
        }
        return;
    }
};

// ============================================================
//  COMMAND HANDLER UTAMA
//  Dipanggil dari index.js: await adminAbuseCmd(...)
// ============================================================
module.exports = async (command, args, msg, user, db, sock) => {
    const validCommands = ['adminabuseon', 'adminabuseoff', 'abuseinfo'];
    if (!validCommands.includes(command)) return;

    const groupId = msg.from;
    const sender  = msg.author || msg.key?.participant || msg.key?.remoteJid;

    // ── Cek apakah sender adalah admin grup atau owner ────
    const boleh = await isGroupAdmin(sock, groupId, sender);
    if (!boleh) {
        return msg.reply(
            `❌ *Akses Ditolak!*\n\n` +
            `Hanya *admin grup* yang bisa menggunakan command ini.`
        );
    }

    // ── !adminabuseon ─────────────────────────────────────
    if (command === 'adminabuseon') {
        if (global.abuseState.active) {
            const sisaMs  = EVENT_DURATION - (Date.now() - global.abuseState.startTime);
            const sisaMnt = Math.ceil(sisaMs / 60000);
            return msg.reply(`⚠️ Event sudah aktif! Sisa waktu: *${sisaMnt} menit*`);
        }

        // Set state
        global.abuseState.active     = true;
        global.abuseState.sock       = sock;
        global.abuseState.db         = db;
        global.abuseState.eventQueue = shuffleEvents();
        global.abuseState.eventIndex = 0;
        global.abuseState.startTime  = Date.now();

        // Umumkan ke semua grup
        await broadcast(
            `🎉 *ADMIN ABUSE EVENT DIMULAI!* 🎉\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `Event spesial berlangsung selama *30 menit*!\n\n` +
            `⏱️ Setiap *5 menit* event berganti otomatis\n` +
            `🎲 Total *12 event* berbeda akan muncul!\n\n` +
            `💰 Ekonomi  ⛏️ Mining  🌾 Farming\n` +
            `🎲 Casino  ⚔️ Duel  🧠 Tebak\n` +
            `⚡ Balapan  📊 Lomba  👾 Boss Raid\n\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `🚀 *EVENT PERTAMA DIMULAI DALAM 3 DETIK...*`
        );

        // Mulai event pertama setelah 3 detik
        setTimeout(() => startNextEvent(), 3000);

        // Rotasi event tiap 5 menit
        global.abuseState.intervalRef = setInterval(async () => {
            if (!global.abuseState.active) return;

            // Resolve event sebelumnya
            const cur = global.abuseState.currentEvent;
            if (cur === 'lomba_aktif' && global.abuseState.eventData.lombaActive) {
                await resolveLombaAktif();
            }
            if (cur === 'boss_raid' && global.abuseState.eventData.bossActive) {
                await resolveBossRaid(true); // partial reward karena waktu habis
            }

            await broadcast(`⏩ *Event berganti! Event berikutnya dimulai...*`);
            await startNextEvent();

        }, INTERVAL);

        // Mati otomatis setelah 30 menit
        global.abuseState.mainTimer = setTimeout(async () => {
            clearInterval(global.abuseState.intervalRef);
            await stopEvent('auto');
        }, EVENT_DURATION);

        return;
    }

    // ── !adminabuseoff ────────────────────────────────────
    if (command === 'adminabuseoff') {
        if (!global.abuseState.active) {
            return msg.reply(`❌ Tidak ada event yang sedang berjalan.`);
        }
        clearTimeout(global.abuseState.mainTimer);
        clearInterval(global.abuseState.intervalRef);
        await stopEvent('manual');
        return;
    }

    // ── !abuseinfo ────────────────────────────────────────
    if (command === 'abuseinfo') {
        if (!global.abuseState.active) {
            return msg.reply(
                `ℹ️ *ADMIN ABUSE EVENT*\n\n` +
                `Status: 🔴 Tidak Aktif\n\n` +
                `Ketik *!adminabuseon* untuk mulai.`
            );
        }
        const sisaMs  = EVENT_DURATION - (Date.now() - global.abuseState.startTime);
        const sisaMnt = Math.ceil(sisaMs / 60000);
        const cur     = (global.abuseState.currentEvent || '-').replace(/_/g, ' ').toUpperCase();
        return msg.reply(
            `ℹ️ *ADMIN ABUSE EVENT*\n\n` +
            `Status: 🟢 Aktif di *${ALL_GROUPS.length} Grup*\n` +
            `Event sekarang: *${cur}*\n` +
            `Sisa waktu: *${sisaMnt} menit*\n\n` +
            `Matikan: *!adminabuseoff*`
        );
    }
};
