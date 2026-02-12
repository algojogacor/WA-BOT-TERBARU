module.exports = async (command, args, msg, user, db, sock) => {
    // Command trigger: !timemachine, !flashback, !dejavu
    if (command !== 'timemachine' && command !== 'flashback' && command !== 'dejavu') return;

    const chatId = msg.key.remoteJid;

    // Cek apakah database chatlog ada isinya
    if (!db.chatLogs || !db.chatLogs[chatId] || db.chatLogs[chatId].length === 0) {
        return msg.reply("❌ Bot belum punya ingatan masa lalu di grup ini.\nBot baru mulai merekam sekarang...");
    }

    const logs = db.chatLogs[chatId];
    const now = new Date();
    
    // Konversi jam sekarang ke total menit (0 - 1439)
    // Contoh: 21:24 = (21 * 60) + 24 = 1284 menit
    const currentMins = (now.getHours() * 60) + now.getMinutes();
    const RENTANG = 30; // Rentang +/- 30 Menit

    // === FILTER PESAN YANG COCOK ===
    const candidates = logs.filter(log => {
        const logDate = new Date(log.t);
        const diffTime = now - logDate;
        const oneDay = 24 * 60 * 60 * 1000;

        // SYARAT 1: Harus chat dari masa lalu (minimal beda 20 jam dari sekarang)
        // Biar chat tadi pagi gak dianggap "masa lalu"
        if (diffTime < (oneDay - (4 * 60 * 60 * 1000))) return false;

        // SYARAT 2: Jamnya harus mirip (Range +/- 30 menit)
        const logMins = (logDate.getHours() * 60) + logDate.getMinutes();
        const diff = Math.abs(currentMins - logMins);

        // Logika Matematika Rentang Waktu (Support Cross Midnight)
        // Jika bedanya <= 30 menit ATAU bedanya >= 1410 menit (misal jam 23:55 vs 00:05)
        const isMatch = diff <= RENTANG || diff >= (1440 - RENTANG);

        return isMatch;
    });

    if (candidates.length === 0) {
        return msg.reply("🕰️ *Time Machine Kosong*\nPada jam segini di masa lalu, grup ini sepi (tidak ada chat).");
    }

    // === TAMPILKAN HASIL ===
    // Ambil 1 pesan secara acak dari hasil filter
    const memory = candidates[Math.floor(Math.random() * candidates.length)];
    const memDate = new Date(memory.t);
    
    // Format Tampilan Tanggal & Jam
    const dateStr = memDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
    const timeStr = memDate.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

    // Hitung berapa hari yang lalu
    const daysAgo = Math.floor((now - memDate) / (1000 * 60 * 60 * 24));
    
    let timeAgoStr;
    if (daysAgo === 0) timeAgoStr = "Kemarin";
    else if (daysAgo === 1) timeAgoStr = "Kemarin"; // Jaga-jaga hitungan jam
    else timeAgoStr = `${daysAgo} Hari yang lalu`;

    let txt = `🕰️ *TIME MACHINE* 🕰️\n`;
    txt += `_Membuka arsip ${timeAgoStr} (Sekitar pukul ${timeStr})..._\n\n`;
    txt += `🗣️ *${memory.u}:*\n`;
    txt += `"${memory.m}"\n`;
    txt += `\n━━━━━━━━━━━━━━━━━━━\n`;
    txt += `_Ketik command lagi untuk lihat memori lain_`;

    return msg.reply(txt);
};
