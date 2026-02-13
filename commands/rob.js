const { saveDB } = require('../helpers/database');

module.exports = async (command, args, msg, user, db) => {
    // =================================================================
    // 0. INIT & VALIDASI DASAR 
    // =================================================================
    if (typeof user.bank === 'undefined' || isNaN(user.bank)) user.bank = 0;
    if (typeof user.balance === 'undefined' || isNaN(user.balance)) user.balance = 0; 
    if (typeof user.debt === 'undefined' || isNaN(user.debt)) user.debt = 0;
    
    // Init Sistem Limit Harian
    const todayStr = new Date().toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta' });
    if (user.lastLimitDate !== todayStr) {
        user.dailyUsage = 0;      // Reset penggunaan hari ini
        user.lastLimitDate = todayStr; // Update tanggal hari ini
        saveDB(db);
    }
    if (isNaN(user.dailyUsage)) user.dailyUsage = 0;

    const now = Date.now();
    
    // =================================================================
    // KONFIGURASI (LIMIT 5 MILIAR)
    // =================================================================
    const BANK_COOLDOWN = 10 * 60 * 1000;  // 10 Menit
    const ROB_COOLDOWN = 30 * 60 * 1000;   // 30 Menit
    
    const LIMIT_HARIAN = 10000000000;       // 10 MILIAR (Limit Transaksi Harian)
    const MAX_LOAN = 5000000000;           // 5 MILIAR (Maksimal Pinjaman)
    const INTEREST_RATE = 0.2;             // Bunga 20%
    const TRANSFER_TAX = 0.02;             // Pajak 2%

    // =================================================================
    // 1. COMMAND CEK BANK (!bank / !atm)
    // =================================================================
    if (command === 'bank' || command === 'atm' || command === 'dompet') {
        let txt = `🏦 *BANK ARYA* 🏦\n\n`;
        txt += `👤 Nasabah: ${msg.author ? `@${msg.author.split('@')[0]}` : 'Kamu'}\n`;
        txt += `💳 Saldo Bank: 💰${Math.floor(user.bank).toLocaleString()}\n`;
        txt += `👛 Dompet: 💰${Math.floor(user.balance).toLocaleString()}\n`;
        
        if (user.debt > 0) {
            txt += `📉 *Utang:* 💰${Math.floor(user.debt).toLocaleString()} (Bunga berjalan)\n`;
        }

        txt += `\n📊 *Limit Harian (5M):*\n`;
        txt += `Terpakai: 💰${user.dailyUsage.toLocaleString()} / ${LIMIT_HARIAN.toLocaleString()}\n`;

        txt += `\n_Menu Transaksi:_\n`;
        txt += `• *!depo/!tarik* [jumlah]\n`;
        txt += `• *!transfer* @tag [jumlah]\n`;
        txt += `• *!pinjam* [jumlah] (Max 5M)\n`;
        txt += `• *!bayar* [jumlah] (Lunasi utang)`;
        
        return msg.reply(txt, null, { mentions: [msg.author] });
    }

    // =================================================================
    // 2. COMMAND DEPOSIT (!depo)
    // =================================================================
    if (command === 'depo' || command === 'deposit') {
        const lastBank = user.lastBank || 0;
        if (now - lastBank < BANK_COOLDOWN) {
            const sisa = Math.ceil((BANK_COOLDOWN - (now - lastBank)) / 60000);
            return msg.reply(`⏳ *ANTRIAN PENUH!* Tunggu ${sisa} menit lagi.`);
        }

        if (!args[0]) return msg.reply("❌ Contoh: `!depo 1000` atau `!depo all`");

        let amount = 0;
        if (args[0].toLowerCase() === 'all') {
            amount = Math.floor(user.balance); 
        } else {
            amount = parseInt(args[0].replace(/[^0-9]/g, '')); // Hapus titik/koma jika user ngetik "5.000"
        }

        if (isNaN(amount) || amount <= 0) return msg.reply("❌ Nominal tidak valid.");
        if (user.balance < amount) return msg.reply("❌ Uang di dompet kurang!");

        user.balance -= amount;
        user.bank += amount;
        user.lastBank = now;
        saveDB(db);
        
        return msg.reply(`✅ Sukses setor 💰${amount.toLocaleString()} ke Bank.`);
    }

    // =================================================================
    // 3. COMMAND TARIK (!tarik)
    // =================================================================
    if (command === 'tarik' || command === 'withdraw') {
        const lastBank = user.lastBank || 0;
        if (now - lastBank < BANK_COOLDOWN) {
            const sisa = Math.ceil((BANK_COOLDOWN - (now - lastBank)) / 60000);
            return msg.reply(`⏳ *ANTRIAN PENUH!* Tunggu ${sisa} menit lagi.`);
        }

        if (!args[0]) return msg.reply("❌ Contoh: `!tarik 1000` atau `!tarik all`");

        let amount = 0;
        if (args[0].toLowerCase() === 'all') {
            amount = Math.floor(user.bank); 
        } else {
            amount = parseInt(args[0].replace(/[^0-9]/g, ''));
        }

        if (isNaN(amount) || amount <= 0) return msg.reply("❌ Nominal tidak valid.");
        if (user.bank < amount) return msg.reply("❌ Saldo Bank kurang!");

        user.bank -= amount;
        user.balance += amount;
        user.lastBank = now;
        saveDB(db);

        return msg.reply(`✅ Sukses tarik 💰${amount.toLocaleString()} ke Dompet.`);
    }

    // =================================================================
    // 4. COMMAND TRANSFER (!transfer / !tf) - DENGAN LIMIT HARIAN
    // =================================================================
    if (command === 'transfer' || command === 'tf') {
        const mentions = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || msg.mentionedIds || [];
        const targetId = mentions[0];

        if (!targetId || !args[1]) {
            return msg.reply("❌ Format salah!\nContoh: `!transfer @user 1000`");
        }

        if (targetId === msg.author) return msg.reply("❌ Gak bisa transfer ke diri sendiri.");

        let amount = parseInt(args[1].replace(/[^0-9]/g, ''));
        if (isNaN(amount) || amount <= 0) return msg.reply("❌ Nominal tidak valid.");

        // CEK LIMIT HARIAN
        if ((user.dailyUsage + amount) > LIMIT_HARIAN) {
            const sisaLimit = LIMIT_HARIAN - user.dailyUsage;
            return msg.reply(`❌ *LIMIT HABIS!*\nKamu sudah pakai 💰${user.dailyUsage.toLocaleString()} hari ini.\nSisa limit hari ini: 💰${sisaLimit.toLocaleString()}`);
        }
        
        // Hitung Pajak
        const tax = Math.floor(amount * TRANSFER_TAX);
        const totalDeduct = amount + tax;

        if (user.balance < totalDeduct) {
            return msg.reply(`❌ Uang kurang! Kamu butuh 💰${totalDeduct.toLocaleString()} (Termasuk pajak 5%).`);
        }

        // Cek/Buat User Target
        if (!db.users[targetId]) {
            db.users[targetId] = { balance: 0, bank: 0, debt: 0, xp: 0, level: 1 };
        }
        let targetUser = db.users[targetId];

        // Eksekusi
        user.balance -= totalDeduct;
        user.dailyUsage += amount; // Tambah ke penggunaan harian
        targetUser.balance = (targetUser.balance || 0) + amount;
        saveDB(db);

        return msg.reply(`✅ *TRANSFER SUKSES*\n\n📤 Pengirim: @${msg.author.split('@')[0]}\n📥 Penerima: @${targetId.split('@')[0]}\n💰 Nominal: ${amount.toLocaleString()}\n📉 Sisa Limit Harian: ${(LIMIT_HARIAN - user.dailyUsage).toLocaleString()}`, null, { mentions: [msg.author, targetId] });
    }

    // =================================================================
    // 5. COMMAND PINJAM (!pinjam / !loan) - DENGAN LIMIT 5M
    // =================================================================
    if (command === 'pinjam' || command === 'loan') {
        if (user.debt > 0) {
            return msg.reply(`❌ *DITOLAK!* Kamu masih punya utang 💰${user.debt.toLocaleString()}. Lunasi dulu pakai !bayar`);
        }

        if (!args[0]) return msg.reply(`❌ Contoh: \`!pinjam 1000000\`\nMaksimal pinjaman: 💰${MAX_LOAN.toLocaleString()}`);

        let amount = parseInt(args[0].replace(/[^0-9]/g, ''));
        if (isNaN(amount) || amount <= 0) return msg.reply("❌ Nominal tidak valid.");
        
        // Cek Limit Pinjaman
        if (amount > MAX_LOAN) return msg.reply(`❌ Maksimal pinjaman hanya 💰${MAX_LOAN.toLocaleString()}!`);

        // Kalkulasi Bunga
        const totalDebt = Math.floor(amount * (1 + INTEREST_RATE));
        
        user.balance += amount;
        user.debt = totalDebt;
        saveDB(db);

        return msg.reply(`🤝 *PINJAMAN DISETUJUI*\n\n💰 Diterima: ${amount.toLocaleString()}\n📉 Total Utang: ${totalDebt.toLocaleString()} (Bunga 20%)\n📊 Limit Harian Terpakai: ${user.dailyUsage.toLocaleString()}`);
    }

    // =================================================================
    // 6. COMMAND BAYAR UTANG (!bayar / !pay)
    // =================================================================
    if (command === 'bayar' || command === 'pay') {
        if (user.debt <= 0) return msg.reply("✅ Kamu tidak punya utang.");

        if (!args[0]) return msg.reply(`❌ Tagihan Utang: 💰${user.debt.toLocaleString()}\nContoh: \`!bayar 1000\` atau \`!bayar all\``);

        let amount = 0;
        if (args[0].toLowerCase() === 'all') {
            amount = user.debt;
        } else {
            amount = parseInt(args[0].replace(/[^0-9]/g, ''));
        }

        if (isNaN(amount) || amount <= 0) return msg.reply("❌ Nominal tidak valid.");
        if (user.balance < amount) return msg.reply(`❌ Uang dompet kurang! Kamu butuh 💰${amount.toLocaleString()}`);

        if (amount > user.debt) amount = user.debt;

        user.balance -= amount;
        user.debt -= amount;
        saveDB(db);

        let sisaMsg = user.debt > 0 ? `Sisa utang: 💰${user.debt.toLocaleString()}` : "🎉 *LUNAS!* Selamat anda bebas finansial.";
        return msg.reply(`💸 *PEMBAYARAN DITERIMA*\nNominal: 💰${amount.toLocaleString()}\n${sisaMsg}`);
    }

    // =================================================================
    // 7. COMMAND TOP GLOBAL (!top)
    // =================================================================
    if (command === 'top' || command === 'leaderboard') {
        const sortedUsers = Object.entries(db.users)
            .map(([id, data]) => ({
                id: id,
                netWorth: (data.bank || 0) + (data.balance || 0),
            }))
            .sort((a, b) => b.netWorth - a.netWorth)
            .slice(0, 10);

        let txt = `🏆 *TOP 10 SULTAN* 🏆\n\n`;
        let rank = 1;

        for (let u of sortedUsers) {
            let medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}.`;
            txt += `${medal} @${u.id.split('@')[0]}\n`;
            txt += `   💰 Total: ${u.netWorth.toLocaleString()}\n`;
            rank++;
        }
        return msg.reply(txt, null, { mentions: sortedUsers.map(u => u.id) });
    }

    // =================================================================
    // 8. COMMAND MALING (!rob)
    // =================================================================
    if (command === 'rob' || command === 'maling') {
        const lastRob = user.lastRob || 0;
        if (now - lastRob < ROB_COOLDOWN) {
            const sisa = Math.ceil((ROB_COOLDOWN - (now - lastRob)) / 60000);
            return msg.reply(`👮 Polisi lagi patroli! Tunggu ${sisa} menit lagi.`);
        }

        const mentions = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || msg.mentionedIds || [];
        const targetId = mentions[0];

        if (!targetId || targetId === msg.author) return msg.reply("❌ Tag korban yang valid!");

        let targetUser = db.users[targetId];
        if (!targetUser) return msg.reply("❌ Target belum terdaftar di database.");

        const targetWallet = Math.floor(targetUser.balance || 0);
        if (targetWallet < 1000) return msg.reply("❌ Target terlalu miskin.");

        const chance = Math.random();
        if (chance < 0.4) {
            // Sukses Maling
            const stolen = Math.floor(targetWallet * 0.2); // 20% dari dompet
            targetUser.balance -= stolen;
            user.balance += stolen;
            user.lastRob = now;
            saveDB(db);
            return msg.reply(`🥷 *SUKSES!* Dapat 💰${stolen.toLocaleString()} dari @${targetId.split('@')[0]}`, null, {mentions: [targetId]});
        } else {
            
            // Gagal (Denda 10% dari dompet)
const finePercentage = 0.10; // 10%
const fine = Math.floor(user.balance * finePercentage);

user.balance -= fine;
user.lastRob = now;
saveDB(db);
return msg.reply(`👮 *TERTANGKAP!* Polisi menyita 10% saldo dompetmu.\n💸 Denda: 💰${fine.toLocaleString()}`);
        }
    }
};
