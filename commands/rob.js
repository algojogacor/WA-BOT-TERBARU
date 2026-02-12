const { saveDB } = require('../helpers/database');

module.exports = async (command, args, msg, user, db) => {
    // 0. INIT & VALIDASI DASAR (AUTO-HEAL DB)
    if (typeof user.bank === 'undefined' || isNaN(user.bank)) user.bank = 0;
    if (isNaN(user.balance)) user.balance = 0; 

    const now = Date.now();
    
    // KONFIGURASI COOLDOWN
    const BANK_COOLDOWN = 10 * 60 * 1000; // 10 Menit
    const ROB_COOLDOWN = 30 * 60 * 1000;  // 30 Menit

    // --- 1. COMMAND CEK BANK (!bank / !atm) ---
    if (command === 'bank' || command === 'atm') {
        let txt = `🏦 *BANK ARYA* 🏦\n\n`;
        txt += `👤 Nasabah: ${msg.author ? `@${msg.author.split('@')[0]}` : 'Kamu'}\n`;
        txt += `💳 Saldo Bank: 💰${Math.floor(user.bank).toLocaleString()}\n`;
        txt += `👛 Dompet: 💰${Math.floor(user.balance).toLocaleString()}\n\n`;
        txt += `_Ketik !depo all atau !tarik all untuk transaksi cepat._`;
        return msg.reply(txt, null, { mentions: [msg.author] });
    }

    // --- 2. COMMAND DEPOSIT (!depo) ---
    if (command === 'depo' || command === 'deposit') {
        const lastBank = user.lastBank || 0;
        if (now - lastBank < BANK_COOLDOWN) {
            const sisa = Math.ceil((BANK_COOLDOWN - (now - lastBank)) / 60000);
            return msg.reply(`⏳ *ANTRIAN PENUH!* Tunggu ${sisa} menit lagi.`);
        }

        if (!args[0]) return msg.reply("❌ Contoh: `!depo 1000` atau `!depo all`");

        let amount = 0;
        // Logic All vs Angka
        if (args[0].toLowerCase() === 'all') {
            amount = Math.floor(user.balance); 
        } else {
            amount = parseInt(args[0]);
        }

        // Validasi Ketat Anti-NaN
        if (isNaN(amount) || amount <= 0) return msg.reply("❌ Nominal tidak valid.");
        if (user.balance < amount) return msg.reply("❌ Uang di dompet kurang!");

        // Transaksi
        user.balance -= amount;
        user.bank += amount;
        user.lastBank = now;
        saveDB(db);
        
        return msg.reply(`✅ Sukses setor 💰${amount.toLocaleString()} ke Bank.`);
    }

    // --- 3. COMMAND TARIK (!tarik) ---
    if (command === 'tarik' || command === 'withdraw') {
        const lastBank = user.lastBank || 0;
        if (now - lastBank < BANK_COOLDOWN) {
            const sisa = Math.ceil((BANK_COOLDOWN - (now - lastBank)) / 60000);
            return msg.reply(`⏳ *ANTRIAN PENUH!* Tunggu ${sisa} menit lagi.`);
        }

        if (!args[0]) return msg.reply("❌ Contoh: `!tarik 1000` atau `!tarik all`");

        let amount = 0;
        // Logic All vs Angka
        if (args[0].toLowerCase() === 'all') {
            amount = Math.floor(user.bank); 
        } else {
            amount = parseInt(args[0]);
        }

        // Validasi Ketat Anti-NaN
        if (isNaN(amount) || amount <= 0) return msg.reply("❌ Nominal tidak valid.");
        if (user.bank < amount) return msg.reply("❌ Saldo Bank kurang!");

        // Transaksi
        user.bank -= amount;
        user.balance += amount;
        user.lastBank = now;
        saveDB(db);

        return msg.reply(`✅ Sukses tarik 💰${amount.toLocaleString()} ke Dompet.`);
    }

    // --- 4. COMMAND MALING (!rob) ---
    if (command === 'rob' || command === 'maling') {
        const lastRob = user.lastRob || 0;
        if (now - lastRob < ROB_COOLDOWN) {
            const sisa = Math.ceil((ROB_COOLDOWN - (now - lastRob)) / 60000);
            return msg.reply(`👮 Polisi lagi patroli! Tunggu ${sisa} menit lagi.`);
        }

        // Ambil mention
        const mentions = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || msg.mentionedIds || [];
        const targetId = mentions[0];

        if (!targetId) {
            return msg.reply("❌ Tag korban! Contoh: `!rob @user`");
        }

        if (targetId === msg.author) return msg.reply("❌ Gak bisa maling diri sendiri!");

        // Auto-Register Target (Biar gak error reading 'balance')
        let targetUser = db.users[targetId];
        if (!targetUser) {
            db.users[targetId] = {
                balance: 1000, xp: 0, level: 1, inv: [], buffs: {}, lastDaily: 0,
                crypto: {}, debt: 0, bank: 0, 
                quest: { daily: [], weekly: { id: "weekly", progress: 0, target: 100 }, lastReset: "" }
            };
            saveDB(db);
            targetUser = db.users[targetId];
        }

        // Pastikan Target Valid
        if (isNaN(targetUser.balance)) targetUser.balance = 0;
        const targetWallet = Math.floor(targetUser.balance);
        
        if (targetWallet < 100) {
            return msg.reply("❌ Target terlalu miskin (Saldo < 100). Gak tega...");
        }

        // Logika Gacha (40% Sukses)
        const chance = Math.random();
        
        if (chance < 0.4) {
            // Sukses Maling (10-30% dari dompet target)
            const percentage = 0.1 + Math.random() * 0.2; 
            const stolen = Math.floor(targetWallet * percentage);

            targetUser.balance -= stolen;
            user.balance += stolen;
            user.lastRob = now;
            saveDB(db);

            return msg.reply(`🥷 *BERHASIL MALING!*\nKamu mencuri 💰${stolen.toLocaleString()} dari @${targetId.split('@')[0]}!`, null, { mentions: [targetId] });
        } else {
            // --- BAGIAN INI YANG DIUBAH ---
            // Gagal (Denda 5% dari Saldo Pencuri)
            
            const fine = Math.floor(user.balance * 0.05); // Hitung 5%
            user.balance -= fine; // Kurangi saldo
            user.lastRob = now;
            saveDB(db);

            return msg.reply(`👮 *TERTANGKAP POLISI!*\nAksi gagal. Kamu didenda 💰${fine.toLocaleString()} (5% dari saldo dompetmu).`);
        }
    }
};
