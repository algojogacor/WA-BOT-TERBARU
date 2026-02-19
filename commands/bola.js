// ================================================================
//  ⚽ SPORTSBOOK BOT — Judi Bola Profesional
//  Fitur: 1X2 | Asian Handicap | Over/Under | Mix Parlay
//  Commands:
//    !bola            — Lihat semua pertandingan aktif
//    !odds <id>       — Detail odds suatu match
//    !bet <id> <jenis> <pilihan> <jumlah>
//                     — Pasang taruhan
//                       jenis  : 1x2 | hdp | ou
//                       pilihan: h/d/a (1x2) | h/a (hdp) | o/u (ou)
//    !parlay <id> <jenis> <pilihan> — Tambah leg ke parlay slip
//    !parlaybet <jumlah>            — Pasang taruhan parlay
//    !parlaylihat                   — Lihat slip parlay sementara
//    !parlaybatal                   — Batal/kosongkan slip
//    !mybets          — Riwayat taruhan kamu
//    !topbola         — Leaderboard
//    !updatebola      — [Admin] Ambil jadwal dari API
//    !addbola         — [Admin] Tambah match manual
//    !resultbola <id> <skor>  — [Admin] Input hasil (contoh: 2-1)
//    !tutupbola <id>  — [Admin] Tutup taruhan suatu match
//    !hapusbola <id>  — [Admin] Hapus match
// ================================================================

const axios      = require('axios');
const { saveDB } = require('../helpers/database');

// ── Konfigurasi ─────────────────────────────────────────────
const API_KEY      = '895c3efd0c964d1dacb5c3e5bc2027f0';
const ADMIN_ID     = '244203384742140@lid';
const MIN_BET      = 1000;
const MAX_BET      = 50000000;
const MAX_PARLAY   = 8;   // Maksimal kaki parlay
const MIN_PARLAY   = 2;   // Minimal kaki parlay

// ── Format angka ────────────────────────────────────────────
const fmt   = (n) => Math.floor(Number(n) || 0).toLocaleString('id-ID');
const fmtOdds = (o) => Number(o).toFixed(2);

// ── Parlay slip sementara (di RAM, per user) ─────────────────
if (!global.parlaySlip) global.parlaySlip = {};

// ── Inisialisasi struktur DB ─────────────────────────────────
function initDB(db) {
    if (!db.sportsbook)          db.sportsbook          = {};
    if (!db.sportsbook.matches)  db.sportsbook.matches  = {};
    if (!db.sportsbook.bets)     db.sportsbook.bets     = {};
    if (!db.sportsbook.parlays)  db.sportsbook.parlays  = {};
}

// ── Generate ID unik ─────────────────────────────────────────
function genId() {
    return Math.random().toString(36).substr(2, 6).toUpperCase();
}

// ── Buat odds default yang realistis ─────────────────────────
function generateOdds(homeStrength = 0) {
    // homeStrength: -1 (away fav), 0 (seimbang), 1 (home fav)
    const base = {
        home: 1.85 - homeStrength * 0.25,
        draw: 3.40,
        away: 1.85 + homeStrength * 0.25,
    };
    // Tambah sedikit noise
    const noise = () => (Math.random() - 0.5) * 0.1;
    base.home = Math.max(1.10, +(base.home + noise()).toFixed(2));
    base.draw = Math.max(2.50, +(base.draw + noise()).toFixed(2));
    base.away = Math.max(1.10, +(base.away + noise()).toFixed(2));

    // HDP: tentukan siapa yang diberi voor
    const hdpLines = [-2.0, -1.5, -1.0, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1.0, 1.5, 2.0];
    const line     = hdpLines[Math.floor(Math.random() * hdpLines.length)];
    const hdp = {
        line,                              // minus = home voor
        homeOdds: +(1.85 + noise()).toFixed(2),
        awayOdds: +(1.95 + noise()).toFixed(2),
    };

    // OU
    const ouLines = [1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5];
    const ouLine  = ouLines[Math.floor(Math.random() * ouLines.length)];
    const ou = {
        line: ouLine,
        overOdds:  +(1.90 + noise()).toFixed(2),
        underOdds: +(1.90 + noise()).toFixed(2),
    };

    return { home: base.home, draw: base.draw, away: base.away, hdp, ou };
}

// ── Label HDP untuk tampilan ─────────────────────────────────
function hdpLabel(line) {
    if (line === 0)    return 'Pur-Pur';
    if (line >  0)     return `Away Voor ${line}`;
    if (line <  0)     return `Home Voor ${Math.abs(line)}`;
}

// ── Hitung hasil HDP ─────────────────────────────────────────
// pick: 'h' atau 'a', line: angka hdp, homeGoal, awayGoal
function calcHDP(pick, line, homeGoal, awayGoal) {
    // line negatif berarti home beri voor ke away
    // Adjusted home score = homeGoal + line (line sudah negatif untuk home voor)
    const adjHome = homeGoal + line;
    if (pick === 'h') {
        if (adjHome > awayGoal)  return 'win';
        if (adjHome === awayGoal) return 'draw';
        return 'lose';
    } else {
        if (awayGoal > adjHome)  return 'win';
        if (awayGoal === adjHome) return 'draw';
        return 'lose';
    }
}

// ── Hitung hasil OU ──────────────────────────────────────────
function calcOU(pick, line, homeGoal, awayGoal) {
    const total = homeGoal + awayGoal;
    if (total >  line) return pick === 'o' ? 'win' : 'lose';
    if (total <  line) return pick === 'u' ? 'win' : 'lose';
    return 'draw'; // Tepat di line (misal 3 gol di line 3.0)
}

// ── Hitung hasil 1X2 ─────────────────────────────────────────
function calc1X2(pick, homeGoal, awayGoal) {
    if (homeGoal >  awayGoal) return pick === 'h' ? 'win' : 'lose';
    if (homeGoal <  awayGoal) return pick === 'a' ? 'win' : 'lose';
    return pick === 'd' ? 'win' : 'lose';
}

// ── Payout berdasarkan hasil ─────────────────────────────────
// 'win' = stake*odds, 'draw' = stake kembali (refund), 'lose' = 0
function calcPayout(result, stake, odds) {
    if (result === 'win')  return Math.floor(stake * odds);
    if (result === 'draw') return stake; // refund
    return 0;
}

// ── Pesan slip bet ───────────────────────────────────────────
function betSlipMsg(bet, match) {
    const typeLabel = { '1x2': '1X2', 'hdp': 'Handicap', 'ou': 'Over/Under' }[bet.type] || bet.type;
    let pickLabel = bet.pick;
    if (bet.type === '1x2') pickLabel = { h: `🏠 ${match.home}`, d: '🤝 Seri', a: `✈️ ${match.away}` }[bet.pick] || bet.pick;
    if (bet.type === 'hdp') pickLabel = { h: `🏠 ${match.home} ${hdpLabel(match.odds.hdp.line)}`, a: `✈️ ${match.away} ${hdpLabel(-match.odds.hdp.line)}` }[bet.pick] || bet.pick;
    if (bet.type === 'ou')  pickLabel = { o: `Over ${match.odds.ou.line}`, u: `Under ${match.odds.ou.line}` }[bet.pick] || bet.pick;

    return `📋 *TIKET TARUHAN*\n` +
           `━━━━━━━━━━━━━━━━━━━━\n` +
           `🏟️ *${match.home} vs ${match.away}*\n` +
           `🏆 ${match.league}\n` +
           `🎯 Jenis  : *${typeLabel}*\n` +
           `✅ Pilihan: *${pickLabel}*\n` +
           `📊 Odds   : *${fmtOdds(bet.odds)}*\n` +
           `💰 Taruhan: *Rp ${fmt(bet.amount)}*\n` +
           `💵 Potensi: *Rp ${fmt(bet.potential)}*\n` +
           `🆔 Bet ID : \`${bet.id}\`\n` +
           `━━━━━━━━━━━━━━━━━━━━\n` +
           `_Status: ⏳ Menunggu Hasil_`;
}

// ── Format waktu WIB ─────────────────────────────────────────
function fmtDate(iso) {
    try {
        return new Date(iso).toLocaleString('id-ID', {
            timeZone: 'Asia/Jakarta',
            day: '2-digit', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        }) + ' WIB';
    } catch { return iso || '-'; }
}

// ================================================================
//  MAIN MODULE
// ================================================================
module.exports = async (command, args, msg, user, db, sender) => {
    initDB(db);
    const sb      = db.sportsbook;
    const senderId = msg.author || msg.key?.participant || msg.key?.remoteJid || sender;
    const isAdmin  = senderId === ADMIN_ID;
    const now      = Date.now();

    const validCmds = [
        'bola', 'odds', 'bet', 'mybets', 'topbola',
        'parlay', 'parlaybet', 'parlaylihat', 'parlaybatal',
        'updatebola', 'addbola', 'resultbola', 'tutupbola', 'hapusbola',
    ];
    if (!validCmds.includes(command)) return;

    // ══════════════════════════════════════════════════════════
    //  1. !bola — LIHAT SEMUA MATCH AKTIF
    // ══════════════════════════════════════════════════════════
    if (command === 'bola') {
        const openMatches = Object.entries(sb.matches)
            .filter(([, m]) => m.status === 'open')
            .sort(([, a], [, b]) => new Date(a.date) - new Date(b.date));

        if (openMatches.length === 0) {
            return msg.reply(
                `⚽ *SPORTSBOOK*\n\n` +
                `📭 Belum ada pertandingan tersedia.\n\n` +
                `Admin bisa tambahkan dengan:\n` +
                `• *!updatebola* — Ambil dari API\n` +
                `• *!addbola* — Tambah manual`
            );
        }

        let txt = `⚽ *SPORTSBOOK — PERTANDINGAN AKTIF*\n`;
        txt += `${'─'.repeat(30)}\n\n`;

        openMatches.forEach(([id, m]) => {
            const waktu = fmtDate(m.date);
            txt += `🆔 *${id}*\n`;
            txt += `🏟️ *${m.home} vs ${m.away}*\n`;
            txt += `🏆 ${m.league}\n`;
            txt += `📅 ${waktu}\n`;
            txt += `📊 Odds: H ${fmtOdds(m.odds.home)} | D ${fmtOdds(m.odds.draw)} | A ${fmtOdds(m.odds.away)}\n`;
            txt += `\n`;
        });

        txt += `${'─'.repeat(30)}\n`;
        txt += `💡 *Cara Taruhan:*\n`;
        txt += `• *!odds <ID>* — Lihat odds lengkap\n`;
        txt += `• *!bet <ID> 1x2 h <jumlah>* — Home menang\n`;
        txt += `• *!bet <ID> hdp h <jumlah>* — Handicap\n`;
        txt += `• *!bet <ID> ou o <jumlah>* — Over\n`;
        txt += `• *!parlay* — Panduan Mix Parlay`;

        return msg.reply(txt);
    }

    // ══════════════════════════════════════════════════════════
    //  2. !odds <id> — DETAIL ODDS SUATU MATCH
    // ══════════════════════════════════════════════════════════
    if (command === 'odds') {
        const id = (args[0] || '').toUpperCase();
        const m  = sb.matches[id];
        if (!m) return msg.reply(`❌ Match *${id}* tidak ditemukan.\nCek *!bola* untuk daftar ID.`);

        const oddsHdpHome = m.odds.hdp.line <= 0
            ? `${m.home} (Voor ${Math.abs(m.odds.hdp.line)})`
            : `${m.home} (+${m.odds.hdp.line})`;
        const oddsHdpAway = m.odds.hdp.line >= 0
            ? `${m.away} (Voor ${Math.abs(m.odds.hdp.line)})`
            : `${m.away} (+${Math.abs(m.odds.hdp.line)})`;

        let txt = `📊 *ODDS DETAIL — ${id}*\n`;
        txt += `${'─'.repeat(30)}\n`;
        txt += `🏟️ *${m.home} vs ${m.away}*\n`;
        txt += `🏆 ${m.league}\n`;
        txt += `📅 ${fmtDate(m.date)}\n`;
        txt += `${'─'.repeat(30)}\n\n`;

        txt += `🎯 *1X2 (Menang/Seri/Kalah)*\n`;
        txt += `  🏠 ${m.home} menang : *${fmtOdds(m.odds.home)}*\n`;
        txt += `  🤝 Seri             : *${fmtOdds(m.odds.draw)}*\n`;
        txt += `  ✈️ ${m.away} menang  : *${fmtOdds(m.odds.away)}*\n\n`;

        txt += `🎯 *Asian Handicap (HDP)*\n`;
        txt += `  🏠 ${oddsHdpHome} : *${fmtOdds(m.odds.hdp.homeOdds)}*\n`;
        txt += `  ✈️ ${oddsHdpAway}  : *${fmtOdds(m.odds.hdp.awayOdds)}*\n\n`;

        txt += `🎯 *Over/Under (OU ${m.odds.ou.line})*\n`;
        txt += `  📈 Over  ${m.odds.ou.line} : *${fmtOdds(m.odds.ou.overOdds)}*\n`;
        txt += `  📉 Under ${m.odds.ou.line} : *${fmtOdds(m.odds.ou.underOdds)}*\n\n`;

        txt += `${'─'.repeat(30)}\n`;
        txt += `💡 *Cara Pasang Taruhan:*\n`;
        txt += `!bet ${id} 1x2 h <jumlah>   ← Home menang\n`;
        txt += `!bet ${id} 1x2 d <jumlah>   ← Seri\n`;
        txt += `!bet ${id} 1x2 a <jumlah>   ← Away menang\n`;
        txt += `!bet ${id} hdp h <jumlah>   ← Handicap Home\n`;
        txt += `!bet ${id} hdp a <jumlah>   ← Handicap Away\n`;
        txt += `!bet ${id} ou o <jumlah>    ← Over ${m.odds.ou.line}\n`;
        txt += `!bet ${id} ou u <jumlah>    ← Under ${m.odds.ou.line}`;

        return msg.reply(txt);
    }

    // ══════════════════════════════════════════════════════════
    //  3. !bet <id> <jenis> <pilihan> <jumlah>
    // ══════════════════════════════════════════════════════════
    if (command === 'bet') {
        const id      = (args[0] || '').toUpperCase();
        const jenis   = (args[1] || '').toLowerCase();
        const pick    = (args[2] || '').toLowerCase();
        const rawJuml = args[3];

        if (!id || !jenis || !pick || !rawJuml) {
            return msg.reply(
                `❌ Format salah!\n\n` +
                `Cara:\n` +
                `• *!bet <ID> 1x2 h <jumlah>* — Home menang\n` +
                `• *!bet <ID> 1x2 d <jumlah>* — Seri\n` +
                `• *!bet <ID> 1x2 a <jumlah>* — Away menang\n` +
                `• *!bet <ID> hdp h <jumlah>* — HDP Home\n` +
                `• *!bet <ID> hdp a <jumlah>* — HDP Away\n` +
                `• *!bet <ID> ou o <jumlah>*  — Over\n` +
                `• *!bet <ID> ou u <jumlah>*  — Under\n\n` +
                `Contoh: \`!bet AB12 1x2 h 50000\``
            );
        }

        const m = sb.matches[id];
        if (!m)                    return msg.reply(`❌ Match *${id}* tidak ditemukan. Ketik *!bola* untuk daftar.`);
        if (m.status !== 'open')   return msg.reply(`❌ Match ini sudah *${m.status === 'closed' ? 'ditutup' : 'selesai'}*. Tidak bisa pasang taruhan lagi.`);
        if (new Date() >= new Date(m.date)) return msg.reply(`❌ Pertandingan sudah dimulai! Taruhan ditutup.`);

        // Validasi jenis
        if (!['1x2', 'hdp', 'ou'].includes(jenis)) {
            return msg.reply(`❌ Jenis taruhan tidak valid!\nPilih: *1x2*, *hdp*, atau *ou*`);
        }
        // Validasi pilihan
        const validPicks = { '1x2': ['h', 'd', 'a'], 'hdp': ['h', 'a'], 'ou': ['o', 'u'] };
        if (!validPicks[jenis].includes(pick)) {
            const hint = { '1x2': 'h (Home) | d (Draw) | a (Away)', 'hdp': 'h (Home) | a (Away)', 'ou': 'o (Over) | u (Under)' };
            return msg.reply(`❌ Pilihan tidak valid untuk *${jenis.toUpperCase()}*!\nPilihan valid: ${hint[jenis]}`);
        }

        // Validasi jumlah
        const jumlah = rawJuml.toLowerCase() === 'all' ? Math.floor(user.balance) : parseInt(rawJuml);
        if (isNaN(jumlah) || jumlah < MIN_BET) return msg.reply(`❌ Minimal taruhan: *Rp ${fmt(MIN_BET)}*`);
        if (jumlah > MAX_BET)                  return msg.reply(`❌ Maksimal taruhan: *Rp ${fmt(MAX_BET)}*`);
        if (user.balance < jumlah)             return msg.reply(`❌ Saldo tidak cukup!\nSaldo kamu: *Rp ${fmt(user.balance)}*`);

        // Tentukan odds berdasarkan jenis dan pilihan
        let odds = 1;
        if (jenis === '1x2') {
            odds = pick === 'h' ? m.odds.home : pick === 'd' ? m.odds.draw : m.odds.away;
        } else if (jenis === 'hdp') {
            odds = pick === 'h' ? m.odds.hdp.homeOdds : m.odds.hdp.awayOdds;
        } else if (jenis === 'ou') {
            odds = pick === 'o' ? m.odds.ou.overOdds : m.odds.ou.underOdds;
        }

        const potential = Math.floor(jumlah * odds);
        const betId     = genId();

        // Simpan taruhan
        sb.bets[betId] = {
            id:        betId,
            userId:    senderId,
            matchId:   id,
            type:      jenis,
            pick:      pick,
            odds:      odds,
            amount:    jumlah,
            potential: potential,
            status:    'pending',
            placedAt:  now,
        };

        user.balance -= jumlah;
        saveDB(db);

        return msg.reply(betSlipMsg(sb.bets[betId], m));
    }

    // ══════════════════════════════════════════════════════════
    //  4. !parlay <id> <jenis> <pilihan> — TAMBAH LEG PARLAY
    // ══════════════════════════════════════════════════════════
    if (command === 'parlay') {
        // Jika tanpa argumen, tampilkan panduan
        if (args.length === 0) {
            const slip = global.parlaySlip[senderId] || [];
            let txt = `🎰 *MIX PARLAY — PANDUAN*\n`;
            txt += `${'─'.repeat(30)}\n\n`;
            txt += `Mix Parlay: Gabungkan *${MIN_PARLAY}-${MAX_PARLAY} pertandingan*\n`;
            txt += `Semua pilihan HARUS benar untuk menang.\n`;
            txt += `Odds dikalikan semua → potensi besar!\n\n`;
            txt += `💡 *Cara Pakai:*\n`;
            txt += `1. Tambah leg: *!parlay <ID> <jenis> <pilihan>*\n`;
            txt += `   Contoh: *!parlay AB12 1x2 h*\n`;
            txt += `2. Lihat slip: *!parlaylihat*\n`;
            txt += `3. Pasang: *!parlaybet <jumlah>*\n`;
            txt += `4. Batal: *!parlaybatal*\n\n`;
            if (slip.length > 0) {
                const totalOdds = slip.reduce((acc, l) => acc * l.odds, 1);
                txt += `📋 Slip saat ini: *${slip.length} leg* | Total Odds: *${fmtOdds(totalOdds)}*\n`;
                txt += `Ketik *!parlaylihat* untuk detail.`;
            } else {
                txt += `📋 Slip kamu masih kosong. Mulai tambah leg!`;
            }
            return msg.reply(txt);
        }

        const id    = (args[0] || '').toUpperCase();
        const jenis = (args[1] || '').toLowerCase();
        const pick  = (args[2] || '').toLowerCase();

        if (!id || !jenis || !pick) {
            return msg.reply(`❌ Format: *!parlay <ID> <jenis> <pilihan>*\nContoh: *!parlay AB12 1x2 h*`);
        }

        const m = sb.matches[id];
        if (!m)                    return msg.reply(`❌ Match *${id}* tidak ditemukan.`);
        if (m.status !== 'open')   return msg.reply(`❌ Match ini sudah tidak bisa ditaruhkan.`);
        if (new Date() >= new Date(m.date)) return msg.reply(`❌ Pertandingan sudah dimulai!`);

        if (!['1x2', 'hdp', 'ou'].includes(jenis)) return msg.reply(`❌ Jenis tidak valid. Pilih: 1x2 | hdp | ou`);
        const validPicks = { '1x2': ['h', 'd', 'a'], 'hdp': ['h', 'a'], 'ou': ['o', 'u'] };
        if (!validPicks[jenis].includes(pick)) return msg.reply(`❌ Pilihan tidak valid untuk *${jenis}*.`);

        // Init slip user
        if (!global.parlaySlip[senderId]) global.parlaySlip[senderId] = [];
        const slip = global.parlaySlip[senderId];

        // Cek duplikat match
        if (slip.some(l => l.matchId === id)) {
            return msg.reply(`❌ Match *${id}* sudah ada di slip parlay kamu!\nSatu match hanya boleh masuk sekali.`);
        }
        if (slip.length >= MAX_PARLAY) {
            return msg.reply(`❌ Maksimal *${MAX_PARLAY} leg* per parlay.`);
        }

        let odds = 1;
        let pickLabel = '';
        if (jenis === '1x2') {
            odds      = pick === 'h' ? m.odds.home : pick === 'd' ? m.odds.draw : m.odds.away;
            pickLabel = pick === 'h' ? `🏠 ${m.home}` : pick === 'd' ? '🤝 Seri' : `✈️ ${m.away}`;
        } else if (jenis === 'hdp') {
            odds      = pick === 'h' ? m.odds.hdp.homeOdds : m.odds.hdp.awayOdds;
            pickLabel = pick === 'h' ? `🏠 HDP ${m.home}` : `✈️ HDP ${m.away}`;
        } else if (jenis === 'ou') {
            odds      = pick === 'o' ? m.odds.ou.overOdds : m.odds.ou.underOdds;
            pickLabel = pick === 'o' ? `📈 Over ${m.odds.ou.line}` : `📉 Under ${m.odds.ou.line}`;
        }

        slip.push({ matchId: id, type: jenis, pick, odds, pickLabel, matchName: `${m.home} vs ${m.away}` });

        const totalOdds = slip.reduce((acc, l) => acc * l.odds, 1);
        return msg.reply(
            `✅ *Leg #${slip.length} ditambahkan!*\n\n` +
            `⚽ ${m.home} vs ${m.away}\n` +
            `🎯 ${pickLabel}\n` +
            `📊 Odds: *${fmtOdds(odds)}*\n\n` +
            `📋 Total leg: *${slip.length}/${MAX_PARLAY}*\n` +
            `📊 Total Odds: *${fmtOdds(totalOdds)}*\n\n` +
            `${slip.length >= MIN_PARLAY ? `💰 Siap dipasang! Ketik *!parlaybet <jumlah>*` : `Tambah minimal ${MIN_PARLAY - slip.length} leg lagi.`}`
        );
    }

    // ══════════════════════════════════════════════════════════
    //  5. !parlaylihat — LIHAT SLIP PARLAY
    // ══════════════════════════════════════════════════════════
    if (command === 'parlaylihat') {
        const slip = global.parlaySlip[senderId] || [];
        if (slip.length === 0) return msg.reply(`📋 Slip parlay kamu kosong.\nTambah leg dengan *!parlay <ID> <jenis> <pilihan>*`);

        const totalOdds = slip.reduce((acc, l) => acc * l.odds, 1);
        let txt = `🎰 *SLIP MIX PARLAY KAMU*\n`;
        txt += `${'─'.repeat(30)}\n\n`;
        slip.forEach((l, i) => {
            txt += `*#${i + 1}* ${l.matchName}\n`;
            txt += `   🎯 ${l.pickLabel} | Odds: *${fmtOdds(l.odds)}*\n\n`;
        });
        txt += `${'─'.repeat(30)}\n`;
        txt += `📊 Total Odds Parlay: *${fmtOdds(totalOdds)}*\n`;
        txt += `📋 Total Leg: *${slip.length}*\n\n`;
        if (slip.length >= MIN_PARLAY) {
            txt += `💡 Pasang: *!parlaybet <jumlah>*\n`;
            txt += `   Misal: !parlaybet 100000\n`;
            txt += `   Potensi menang (jika Rp 100.000): *Rp ${fmt(Math.floor(100000 * totalOdds))}*`;
        } else {
            txt += `⚠️ Butuh minimal ${MIN_PARLAY - slip.length} leg lagi sebelum bisa pasang.`;
        }
        return msg.reply(txt);
    }

    // ══════════════════════════════════════════════════════════
    //  6. !parlaybet <jumlah> — PASANG TARUHAN PARLAY
    // ══════════════════════════════════════════════════════════
    if (command === 'parlaybet') {
        const slip = global.parlaySlip[senderId] || [];
        if (slip.length < MIN_PARLAY) {
            return msg.reply(`❌ Slip parlay butuh minimal *${MIN_PARLAY} leg*.\nSaat ini: *${slip.length} leg*.\nTambah dengan *!parlay <ID> <jenis> <pilihan>*`);
        }

        const rawJuml = args[0];
        const jumlah  = rawJuml?.toLowerCase() === 'all' ? Math.floor(user.balance) : parseInt(rawJuml);
        if (isNaN(jumlah) || jumlah < MIN_BET) return msg.reply(`❌ Minimal taruhan parlay: *Rp ${fmt(MIN_BET)}*`);
        if (jumlah > MAX_BET)                  return msg.reply(`❌ Maksimal taruhan parlay: *Rp ${fmt(MAX_BET)}*`);
        if (user.balance < jumlah)             return msg.reply(`❌ Saldo tidak cukup!\nSaldo kamu: *Rp ${fmt(user.balance)}*`);

        const totalOdds = slip.reduce((acc, l) => acc * l.odds, 1);
        const potential = Math.floor(jumlah * totalOdds);
        const parlayId  = genId();

        // Validasi ulang semua match masih bisa ditaruhkan
        for (const leg of slip) {
            const m = sb.matches[leg.matchId];
            if (!m || m.status !== 'open' || new Date() >= new Date(m.date)) {
                return msg.reply(`❌ Match *${leg.matchId}* (${leg.matchName}) sudah tidak bisa ditaruhkan.\nHapus slip dan buat ulang dengan *!parlaybatal*`);
            }
        }

        sb.parlays[parlayId] = {
            id:        parlayId,
            userId:    senderId,
            legs:      [...slip],
            totalOdds: +totalOdds.toFixed(4),
            amount:    jumlah,
            potential: potential,
            status:    'pending',
            placedAt:  now,
        };

        user.balance -= jumlah;
        global.parlaySlip[senderId] = []; // Reset slip
        saveDB(db);

        let txt = `🎰 *TIKET MIX PARLAY*\n`;
        txt += `${'─'.repeat(30)}\n\n`;
        slip.forEach((l, i) => {
            txt += `*#${i + 1}* ${l.matchName}\n`;
            txt += `   🎯 ${l.pickLabel} | *${fmtOdds(l.odds)}*\n\n`;
        });
        txt += `${'─'.repeat(30)}\n`;
        txt += `📊 Total Odds : *${fmtOdds(totalOdds)}*\n`;
        txt += `💰 Taruhan    : *Rp ${fmt(jumlah)}*\n`;
        txt += `💵 Potensi    : *Rp ${fmt(potential)}*\n`;
        txt += `🆔 Parlay ID  : \`${parlayId}\`\n`;
        txt += `━━━━━━━━━━━━━━━━━━━━\n`;
        txt += `_Semua leg harus benar untuk menang!_`;
        return msg.reply(txt);
    }

    // ══════════════════════════════════════════════════════════
    //  7. !parlaybatal — KOSONGKAN SLIP
    // ══════════════════════════════════════════════════════════
    if (command === 'parlaybatal') {
        global.parlaySlip[senderId] = [];
        return msg.reply(`🗑️ Slip parlay kamu sudah dikosongkan.`);
    }

    // ══════════════════════════════════════════════════════════
    //  8. !mybets — RIWAYAT TARUHAN
    // ══════════════════════════════════════════════════════════
    if (command === 'mybets') {
        const statusEmoji = { pending: '⏳', won: '✅', lost: '❌', refund: '↩️' };

        // Taruhan single
        const myBets = Object.values(sb.bets)
            .filter(b => b.userId === senderId)
            .sort((a, b) => b.placedAt - a.placedAt)
            .slice(0, 8);

        // Parlay
        const myParlays = Object.values(sb.parlays)
            .filter(p => p.userId === senderId)
            .sort((a, b) => b.placedAt - a.placedAt)
            .slice(0, 5);

        if (myBets.length === 0 && myParlays.length === 0) {
            return msg.reply(`📭 Kamu belum punya riwayat taruhan.\nKetik *!bola* untuk mulai taruhan.`);
        }

        let txt = `📋 *RIWAYAT TARUHAN KAMU*\n`;
        txt += `${'─'.repeat(30)}\n\n`;

        if (myBets.length > 0) {
            txt += `🎯 *SINGLE BET (${myBets.length} terakhir)*\n\n`;
            myBets.forEach(b => {
                const m = sb.matches[b.matchId];
                const matchName = m ? `${m.home} vs ${m.away}` : b.matchId;
                const st = statusEmoji[b.status] || '❓';
                const typeLabel = { '1x2': '1X2', 'hdp': 'HDP', 'ou': 'O/U' }[b.type] || b.type;
                txt += `${st} *${matchName}*\n`;
                txt += `   ${typeLabel} | Odds ${fmtOdds(b.odds)} | Rp ${fmt(b.amount)}\n`;
                if (b.status === 'won')    txt += `   💰 Menang: *+Rp ${fmt(b.potential - b.amount)}*\n`;
                if (b.status === 'lost')   txt += `   💸 Kalah: *-Rp ${fmt(b.amount)}*\n`;
                if (b.status === 'refund') txt += `   ↩️ Refund: *Rp ${fmt(b.amount)}*\n`;
                txt += `   ID: \`${b.id}\`\n\n`;
            });
        }

        if (myParlays.length > 0) {
            txt += `🎰 *MIX PARLAY (${myParlays.length} terakhir)*\n\n`;
            myParlays.forEach(p => {
                const st = statusEmoji[p.status] || '❓';
                txt += `${st} *${p.legs.length} Leg* | Odds ${fmtOdds(p.totalOdds)}\n`;
                txt += `   💰 Taruhan: Rp ${fmt(p.amount)} | Potensi: Rp ${fmt(p.potential)}\n`;
                if (p.status === 'won')  txt += `   🏆 Menang: *+Rp ${fmt(p.potential - p.amount)}*\n`;
                if (p.status === 'lost') txt += `   💸 Kalah: *-Rp ${fmt(p.amount)}*\n`;
                txt += `   ID: \`${p.id}\`\n\n`;
            });
        }

        // Summary statistik
        const allBets    = Object.values(sb.bets).filter(b => b.userId === senderId);
        const allParlays = Object.values(sb.parlays).filter(p => p.userId === senderId);
        const totalTaruhan = [...allBets, ...allParlays].reduce((s, b) => s + b.amount, 0);
        const totalMenang  = [
            ...allBets.filter(b => b.status === 'won').map(b => b.potential),
            ...allParlays.filter(p => p.status === 'won').map(p => p.potential),
        ].reduce((s, x) => s + x, 0);
        const profit = totalMenang - totalTaruhan;

        txt += `${'─'.repeat(30)}\n`;
        txt += `📊 *STATISTIK KAMU*\n`;
        txt += `💰 Total Taruhan : Rp ${fmt(totalTaruhan)}\n`;
        txt += `🏆 Total Menang  : Rp ${fmt(totalMenang)}\n`;
        txt += `${profit >= 0 ? '📈' : '📉'} Net P/L      : ${profit >= 0 ? '+' : ''}Rp ${fmt(profit)}`;
        return msg.reply(txt);
    }

    // ══════════════════════════════════════════════════════════
    //  9. !topbola — LEADERBOARD
    // ══════════════════════════════════════════════════════════
    if (command === 'topbola') {
        const stats = {};

        // Kumpulkan statistik dari semua bet
        for (const b of Object.values(sb.bets)) {
            if (!stats[b.userId]) stats[b.userId] = { bet: 0, won: 0, lost: 0, profit: 0 };
            stats[b.userId].bet++;
            if (b.status === 'won') {
                stats[b.userId].won++;
                stats[b.userId].profit += b.potential - b.amount;
            } else if (b.status === 'lost') {
                stats[b.userId].lost++;
                stats[b.userId].profit -= b.amount;
            }
        }
        for (const p of Object.values(sb.parlays)) {
            if (!stats[p.userId]) stats[p.userId] = { bet: 0, won: 0, lost: 0, profit: 0 };
            stats[p.userId].bet++;
            if (p.status === 'won') {
                stats[p.userId].won++;
                stats[p.userId].profit += p.potential - p.amount;
            } else if (p.status === 'lost') {
                stats[p.userId].lost++;
                stats[p.userId].profit -= p.amount;
            }
        }

        const arr = Object.entries(stats)
            .filter(([, s]) => s.bet > 0)
            .map(([id, s]) => {
                const rate = s.bet > 0 ? ((s.won / s.bet) * 100).toFixed(1) : '0.0';
                const name = db.users[id]?.name || id.split('@')[0];
                return { id, name, ...s, rate };
            })
            .sort((a, b) => b.profit - a.profit);

        if (arr.length === 0) return msg.reply(`📭 Belum ada data leaderboard.`);

        const medals = ['🥇', '🥈', '🥉'];
        let txt = `🏆 *LEADERBOARD SPORTSBOOK*\n`;
        txt += `${'─'.repeat(30)}\n\n`;
        arr.slice(0, 10).forEach((u, i) => {
            const medal = medals[i] || `${i + 1}.`;
            const profitStr = u.profit >= 0 ? `+Rp ${fmt(u.profit)}` : `-Rp ${fmt(Math.abs(u.profit))}`;
            txt += `${medal} *${u.name}*\n`;
            txt += `   📈 Win Rate: ${u.rate}% (${u.won}W/${u.lost}L)\n`;
            txt += `   💰 Net P/L: *${profitStr}*\n\n`;
        });
        return msg.reply(txt);
    }

    // ══════════════════════════════════════════════════════════
    //  10. !updatebola — [ADMIN] Ambil jadwal dari API
    // ══════════════════════════════════════════════════════════
    if (command === 'updatebola') {
        if (!isAdmin) return msg.reply(`❌ Hanya admin yang bisa menggunakan command ini.`);
        try {
            await msg.reply(`⏳ Mengambil jadwal pertandingan dari API...`);
            const res = await axios.get('https://api.football-data.org/v4/matches', {
                headers: { 'X-Auth-Token': API_KEY },
                timeout: 10000,
            });
            const matches = res.data.matches;
            if (!matches || matches.length === 0) return msg.reply(`📭 Tidak ada jadwal hari ini dari API.`);

            let count = 0;
            matches.forEach(m => {
                const id = 'M' + m.id.toString().slice(-5);
                if (sb.matches[id]) return; // Skip jika sudah ada
                const strength = m.homeTeam.tla < m.awayTeam.tla ? 0.5 : -0.5; // Heuristic
                sb.matches[id] = {
                    id,
                    home:   m.homeTeam.shortName || m.homeTeam.name,
                    away:   m.awayTeam.shortName || m.awayTeam.name,
                    league: m.competition.name,
                    date:   m.utcDate,
                    status: 'open',
                    realId: m.id,
                    odds:   generateOdds(strength),
                    bets:   {},
                };
                count++;
            });
            saveDB(db);
            return msg.reply(`✅ Berhasil menambahkan *${count}* pertandingan baru!\nKetik *!bola* untuk melihat daftar.`);
        } catch (e) {
            console.error('[bola] updatebola error:', e.message);
            return msg.reply(
                `❌ Gagal mengambil data dari API.\n\n` +
                `Kemungkinan penyebab:\n` +
                `• Limit API tercapai\n` +
                `• Koneksi bermasalah\n\n` +
                `Coba tambah manual: *!addbola*`
            );
        }
    }

    // ══════════════════════════════════════════════════════════
    //  11. !addbola — [ADMIN] Tambah match manual
    //  Format: !addbola <Home> vs <Away> | <Liga> | <tanggal> <jam>
    //  Contoh: !addbola Man City vs Arsenal | Premier League | 2025-08-20 21:00
    // ══════════════════════════════════════════════════════════
    if (command === 'addbola') {
        if (!isAdmin) return msg.reply(`❌ Hanya admin yang bisa menggunakan command ini.`);

        const fullText = args.join(' ');
        if (!fullText.includes(' vs ') || !fullText.includes('|')) {
            return msg.reply(
                `❌ Format salah!\n\n` +
                `Format: *!addbola <Home> vs <Away> | <Liga> | <Tanggal> <Jam>*\n\n` +
                `Contoh:\n` +
                `\`!addbola Man City vs Arsenal | Premier League | 2025-08-20 21:00\`\n\n` +
                `Catatan:\n` +
                `• Tanggal format: YYYY-MM-DD HH:MM (WIB)\n` +
                `• Odds akan di-generate otomatis`
            );
        }

        const parts  = fullText.split('|').map(s => s.trim());
        if (parts.length < 3) return msg.reply(`❌ Format kurang lengkap. Butuh 3 bagian dipisah |`);

        const vsPart = parts[0];
        const liga   = parts[1];
        const tanggal = parts[2];

        if (!vsPart.includes(' vs ')) return msg.reply(`❌ Format tim: *<Home> vs <Away>*`);
        const [home, away] = vsPart.split(' vs ').map(s => s.trim());
        if (!home || !away) return msg.reply(`❌ Nama tim tidak boleh kosong.`);

        // Parse tanggal (WIB ke UTC)
        let dateISO;
        try {
            // Anggap input dalam WIB (UTC+7)
            const d = new Date(tanggal.replace(' ', 'T') + ':00+07:00');
            if (isNaN(d.getTime())) throw new Error('Invalid date');
            if (d < new Date()) return msg.reply(`❌ Tanggal tidak boleh di masa lalu!`);
            dateISO = d.toISOString();
        } catch {
            return msg.reply(`❌ Format tanggal salah!\nGunakan: *YYYY-MM-DD HH:MM*\nContoh: *2025-08-20 21:00*`);
        }

        const id = genId();
        sb.matches[id] = {
            id,
            home,
            away,
            league: liga,
            date:   dateISO,
            status: 'open',
            realId: null,
            odds:   generateOdds(0),
        };
        saveDB(db);

        const m = sb.matches[id];
        return msg.reply(
            `✅ *Match berhasil ditambahkan!*\n\n` +
            `🆔 ID: *${id}*\n` +
            `🏟️ *${home} vs ${away}*\n` +
            `🏆 ${liga}\n` +
            `📅 ${fmtDate(dateISO)}\n\n` +
            `📊 *Odds yang di-generate:*\n` +
            `1X2  : H ${fmtOdds(m.odds.home)} | D ${fmtOdds(m.odds.draw)} | A ${fmtOdds(m.odds.away)}\n` +
            `HDP  : ${hdpLabel(m.odds.hdp.line)} | H ${fmtOdds(m.odds.hdp.homeOdds)} A ${fmtOdds(m.odds.hdp.awayOdds)}\n` +
            `OU   : ${m.odds.ou.line} | O ${fmtOdds(m.odds.ou.overOdds)} U ${fmtOdds(m.odds.ou.underOdds)}\n\n` +
            `💡 Gunakan *!odds ${id}* untuk cek lengkap.`
        );
    }

    // ══════════════════════════════════════════════════════════
    //  12. !resultbola <id> <skor> — [ADMIN] Input hasil
    //  Contoh: !resultbola AB12 2-1
    // ══════════════════════════════════════════════════════════
    if (command === 'resultbola') {
        if (!isAdmin) return msg.reply(`❌ Hanya admin yang bisa menggunakan command ini.`);

        const id   = (args[0] || '').toUpperCase();
        const skor = args[1] || '';

        if (!id || !skor) {
            return msg.reply(`❌ Format: *!resultbola <ID> <skor>*\nContoh: *!resultbola AB12 2-1*`);
        }

        const m = sb.matches[id];
        if (!m)                      return msg.reply(`❌ Match *${id}* tidak ditemukan.`);
        if (m.status === 'finished') return msg.reply(`❌ Match *${id}* sudah selesai diproses.`);

        const skorParts = skor.split('-');
        if (skorParts.length !== 2) return msg.reply(`❌ Format skor salah. Contoh: *2-1*`);
        const homeGoal = parseInt(skorParts[0]);
        const awayGoal = parseInt(skorParts[1]);
        if (isNaN(homeGoal) || isNaN(awayGoal)) return msg.reply(`❌ Skor harus berupa angka. Contoh: *2-1*`);

        await msg.reply(`⏳ Memproses hasil *${m.home} vs ${m.away}* (${skor})...`);

        // Proses semua single bet untuk match ini
        let totalPayout   = 0;
        let winnerCount   = 0;
        let loserCount    = 0;
        const winnerMentions = [];

        const matchBets = Object.values(sb.bets).filter(b => b.matchId === id && b.status === 'pending');
        for (const b of matchBets) {
            let result;
            if (b.type === '1x2') result = calc1X2(b.pick, homeGoal, awayGoal);
            else if (b.type === 'hdp') result = calcHDP(b.pick, m.odds.hdp.line, homeGoal, awayGoal);
            else if (b.type === 'ou')  result = calcOU(b.pick, m.odds.ou.line, homeGoal, awayGoal);
            else result = 'lose';

            const payout = calcPayout(result, b.amount, b.odds);
            b.status = result === 'win' ? 'won' : result === 'draw' ? 'refund' : 'lost';

            if (payout > 0 && db.users[b.userId]) {
                db.users[b.userId].balance = (db.users[b.userId].balance || 0) + payout;
                totalPayout += payout;
                if (result === 'win') {
                    winnerCount++;
                    winnerMentions.push(b.userId);
                }
            }
            if (result === 'lose') loserCount++;
        }

        // Proses parlay yang mengandung match ini
        const matchParlays = Object.values(sb.parlays).filter(
            p => p.status === 'pending' && p.legs.some(l => l.matchId === id)
        );
        for (const p of matchParlays) {
            // Update hasil leg ini dalam parlay
            const leg = p.legs.find(l => l.matchId === id);
            if (!leg) continue;

            let legResult;
            if (leg.type === '1x2') legResult = calc1X2(leg.pick, homeGoal, awayGoal);
            else if (leg.type === 'hdp') legResult = calcHDP(leg.pick, m.odds.hdp.line, homeGoal, awayGoal);
            else if (leg.type === 'ou')  legResult = calcOU(leg.pick, m.odds.ou.line, homeGoal, awayGoal);
            else legResult = 'lose';

            leg.result = legResult;

            // Cek apakah semua leg sudah ada hasilnya
            const doneLegs = p.legs.filter(l => l.result !== undefined);
            if (doneLegs.length === p.legs.length) {
                // Semua leg selesai — tentukan hasil parlay
                const hasLose = p.legs.some(l => l.result === 'lose');
                const hasDraw = p.legs.some(l => l.result === 'draw');

                if (hasLose) {
                    p.status = 'lost';
                } else if (hasDraw) {
                    // Recalculate odds tanpa leg draw
                    const newOdds  = p.legs.filter(l => l.result !== 'draw').reduce((acc, l) => acc * l.odds, 1);
                    const payout   = Math.floor(p.amount * (newOdds > 1 ? newOdds : 1));
                    p.status       = 'won';
                    p.actualPayout = payout;
                    if (db.users[p.userId]) db.users[p.userId].balance = (db.users[p.userId].balance || 0) + payout;
                    totalPayout += payout;
                    winnerCount++;
                    winnerMentions.push(p.userId);
                } else {
                    // Semua menang
                    const payout = p.potential;
                    p.status     = 'won';
                    p.actualPayout = payout;
                    if (db.users[p.userId]) db.users[p.userId].balance = (db.users[p.userId].balance || 0) + payout;
                    totalPayout += payout;
                    winnerCount++;
                    winnerMentions.push(p.userId);
                }
            }
        }

        // Update status match
        m.status     = 'finished';
        m.finalScore = skor;
        saveDB(db);

        const uniqueWinners = [...new Set(winnerMentions)];
        let report = `🏁 *HASIL PERTANDINGAN*\n`;
        report += `${'─'.repeat(30)}\n\n`;
        report += `🏟️ *${m.home} vs ${m.away}*\n`;
        report += `🏆 ${m.league}\n`;
        report += `⚽ Skor Akhir: *${homeGoal} - ${awayGoal}*\n\n`;
        report += `📊 *Ringkasan:*\n`;
        report += `✅ Pemenang : *${winnerCount} orang*\n`;
        report += `❌ Kalah    : *${loserCount} orang*\n`;
        report += `💰 Total Dibayar: *Rp ${fmt(totalPayout)}*\n\n`;
        if (uniqueWinners.length > 0) {
            report += `🎊 *Selamat kepada pemenang:*\n`;
            report += uniqueWinners.slice(0, 10).map(id => `@${id.split('@')[0]}`).join(', ');
        }
        return msg.reply(report, { mentions: uniqueWinners });
    }

    // ══════════════════════════════════════════════════════════
    //  13. !tutupbola <id> — [ADMIN] Tutup taruhan
    // ══════════════════════════════════════════════════════════
    if (command === 'tutupbola') {
        if (!isAdmin) return msg.reply(`❌ Hanya admin yang bisa menggunakan command ini.`);
        const id = (args[0] || '').toUpperCase();
        const m  = sb.matches[id];
        if (!m) return msg.reply(`❌ Match *${id}* tidak ditemukan.`);
        if (m.status !== 'open') return msg.reply(`❌ Match sudah *${m.status}*.`);
        m.status = 'closed';
        saveDB(db);
        return msg.reply(`🔒 Match *${id}* (${m.home} vs ${m.away}) sudah *ditutup*. Tidak bisa pasang taruhan lagi.`);
    }

    // ══════════════════════════════════════════════════════════
    //  14. !hapusbola <id> — [ADMIN] Hapus match
    // ══════════════════════════════════════════════════════════
    if (command === 'hapusbola') {
        if (!isAdmin) return msg.reply(`❌ Hanya admin yang bisa menggunakan command ini.`);
        const id = (args[0] || '').toUpperCase();
        if (!sb.matches[id]) return msg.reply(`❌ Match *${id}* tidak ditemukan.`);

        // Refund semua taruhan yang masih pending
        const pendingBets = Object.values(sb.bets).filter(b => b.matchId === id && b.status === 'pending');
        let refundCount = 0;
        for (const b of pendingBets) {
            b.status = 'refund';
            if (db.users[b.userId]) {
                db.users[b.userId].balance = (db.users[b.userId].balance || 0) + b.amount;
                refundCount++;
            }
        }

        const nama = `${sb.matches[id].home} vs ${sb.matches[id].away}`;
        delete sb.matches[id];
        saveDB(db);
        return msg.reply(
            `🗑️ Match *${id}* (${nama}) dihapus.\n` +
            `↩️ Refund ke *${refundCount}* pemain yang sudah taruhan.`
        );
    }
};
