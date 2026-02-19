const { saveDB } = require('../helpers/database');

// HELPER FORMAT ANGKA
const fmt = (num) => Math.floor(Number(num)).toLocaleString('id-ID');

// ============================================================
// ⚙️ KONFIGURASI UTAMA
// ============================================================
const BTC_PER_HASH_HOUR = 0.000155; 
const ELECTRICITY_COST = 58000; // Rp 58.000 per Hash/Jam
const MAX_OFFLINE_HOURS = 24;
// DATA HARDWARE
const HARDWARE = {
    // --- LEGAL HARDWARE ---
    // Balik modal dalam ~20 jam aktif
    'rtx4070': { name: "🟢 RTX 4070 Ti", basePrice: 4000000000, hashrate: 160, type: 'legal' }, // Rp 4 Miliar
    'rtx4090': { name: "🔵 RTX 4090 OC", basePrice: 9500000000, hashrate: 400, type: 'legal' }, // Rp 9,5 Miliar
    'dual4090': { name: "🟣 Dual 4090", basePrice: 15000000000, hashrate: 640, type: 'legal' }, // Rp 15 Miliar
    'asic': { name: "🟠 Antminer S19", basePrice: 18000000000, hashrate: 800, type: 'legal' }, // Rp 18 Miliar

    // --- ILLEGAL HARDWARE (BLACK MARKET) ---
    'usb_miner': { name: "🏴‍☠️ USB Miner Hack", basePrice: 1500000000, hashrate: 100, type: 'illegal', risk: 0.1 }, // Rp 1,5 Miliar
    'quantum_rig': { name: "🏴‍☠️ Quantum Rig", basePrice: 25000000000, hashrate: 1500, type: 'illegal', risk: 0.25 } // Rp 25 Miliar
};

// UPGRADES
const UPGRADES = {
    'cooling': { name: "❄️ Liquid Cooling", price: 5000000000, effect: "Mengurangi risiko Overheat" }, // Rp 5 Miliar
    'psu': { name: "⚡ Platinum PSU", price: 10000000000, effect: "Diskon Listrik 30%" }, // Rp 10 Miliar
    'firewall': { name: "🛡️ Anti-Hack Firewall", price: 20000000000, effect: "Kebal Hacker" } // Rp 20 Miliar
};

// ============================================================
// 🔄 FUNGSI BANTUAN
// ============================================================
const recalculateStats = (userData) => {
    let total = 0;
    let illegal = 0;
    if (userData.mining && Array.isArray(userData.mining.racks)) {
        userData.mining.racks.forEach(id => {
            if (HARDWARE[id]) {
                total += HARDWARE[id].hashrate;
                if (HARDWARE[id].type === 'illegal') illegal++;
            }
        });
    }
    userData.mining.totalHash = total;
    return { total, illegal };
};

const updateMarketPrices = (db) => {
    const now = Date.now();
    if (!db.market.miningPrices || (now - db.market.lastMiningUpdate > 1 * 60 * 60 * 1000)) {
        db.market.miningPrices = {};
        for (let [key, item] of Object.entries(HARDWARE)) {
            const fluctuation = 1 + (Math.random() * 0.3 - 0.15); 
            db.market.miningPrices[key] = Math.floor(item.basePrice * fluctuation);
        }
        db.market.lastMiningUpdate = now;
        saveDB(db);
    }
};

module.exports = async (command, args, msg, user, db, sock) => {
    const validCommands = [
        'mining', 'miner', 
        'belivga', 'buyvga', 'shopminer', 
        'claimmining', 
        'blackmarket', 'bm', 
        'upgrade', 
        'hack', 
        'topminer', 'tophash',
        'panduanminer', 'rulesminer', 'guide',
        'resetmining' // 🔥 COMMAND BARU UNTUK RESET
    ];
    
    if (!validCommands.includes(command)) return;

    const now = Date.now();
    updateMarketPrices(db);

    // 🚑 DATA REPAIR
    if (!user.mining) user.mining = { racks: [], lastClaim: now, totalHash: 0, upgrades: {} };
    if (!user.mining.upgrades) user.mining.upgrades = {}; 
    if (!user.mining.racks) user.mining.racks = [];
    if (!user.crypto) user.crypto = { btc: 0 };

    // 🔥 BUG FIX: JIKA LAST CLAIM 0 (USER LAMA), RESET KE NOW
    if (user.mining.lastClaim === 0) {
        user.mining.lastClaim = now;
        saveDB(db);
    }

    // HITUNG STATS
    const { total: totalHash, illegal: illegalCount } = recalculateStats(user);

    // ============================================================
    // 🗑️ RESET MINING (HAPUS DATA KE 0)
    // ============================================================
    if (command === 'resetmining') {
        user.mining = { 
            racks: [], 
            lastClaim: now, 
            totalHash: 0, 
            upgrades: {} 
        };
        user.crypto.btc = 0; // Reset BTC juga
        
        saveDB(db);
        return msg.reply("✅ *RESET BERHASIL!*\n\nSemua data mining (VGA, BTC, Hashrate) telah dihapus dan dimulai dari nol. Bug triliunan sudah hilang.");
    }

    // ============================================================
    // 📚 PANDUAN LENGKAP (!panduanminer)
    // ============================================================
    if (command === 'panduanminer' || command === 'rulesminer' || command === 'guide') {
        let txt = `📘 *MANUAL OPERASIONAL MINING* 📘\n`;
        txt += `_Pelajari sistem ekonomi kripto agar asetmu aman!_\n\n`;

        txt += `🛠️ *1. CARA KERJA DASAR*\n`;
        txt += `• Beli alat di \`!shopminer\` (Legal) atau \`!bm\` (Ilegal).\n`;
        txt += `• Alat memberikan **Hashrate** (Kecepatan).\n`;
        txt += `• Semakin tinggi Hashrate, semakin cepat **BTC** terkumpul.\n`;
        txt += `• Ketik \`!mining\` untuk melihat dashboard & hasil sementara.\n`;
        txt += `• Ketik \`!claimmining\` untuk memanen BTC ke dompet.\n\n`;

        txt += `⚡ *2. BIAYA LISTRIK (PLN)*\n`;
        txt += `Mining tidak gratis! Setiap alat menyedot listrik.\n`;
        txt += `• Biaya: *Rp 50 per 1 MH/s per Jam*.\n`;
        txt += `• Listrik dibayar OTOMATIS saat kamu \`!claimmining\`.\n`;
        txt += `• ⚠️ *PERINGATAN:* Jika saldo Rupiah di dompet kurang, kamu *TIDAK BISA* mengambil BTC (Rig disandera PLN).\n\n`;

        txt += `🚔 *3. RISIKO BLACK MARKET (BM)*\n`;
        txt += `Barang BM (USB Miner/Quantum) memang murah & kencang, TAPI:\n`;
        txt += `• Setiap kali ketik \`!mining\`, ada risiko *RAZIA POLISI*.\n`;
        txt += `• Jika tertangkap, *SEMUA ALAT ILEGAL AKAN DISITA*.\n`;
        txt += `• Alat Legal (RTX/ASIC) aman dari penyitaan.\n`;
        txt += `• Uang & BTC aman, hanya alat BM yang hilang.\n\n`;

        txt += `🔧 *4. SISTEM UPGRADE (!upgrade)*\n`;
        txt += `Lindungi asetmu dengan komponen tambahan:\n`;
        txt += `• ❄️ *Liquid Cooling:* Mencegah kejadian *OVERHEAT* (Reset waktu mining).\n`;
        txt += `• ⚡ *PSU Platinum:* Diskon tagihan listrik sebesar *30%*.\n`;
        txt += `• 🛡️ *Firewall:* Kebal dari serangan hacker user lain.\n\n`;

        txt += `⚔️ *5. PVP & HACKING (!hack)*\n`;
        txt += `Dunia kripto itu kejam. Kamu bisa menyerang miner lain!\n`;
        txt += `• Ketik \`!hack @user\` untuk mencoba mencuri *5% BTC* mereka.\n`;
        txt += `• Peluang sukses: *40%*.\n`;
        txt += `• Jika GAGAL: Kamu didenda *Rp 500.000* oleh Polisi Siber.\n`;
        txt += `• Target dengan *Firewall* tidak bisa di-hack.\n\n`;

        txt += `📉 *6. DINAMIKA PASAR*\n`;
        txt += `Harga VGA Legal di \`!shopminer\` berubah setiap *1 Jam*.\n`;
        txt += `• Bisa *DISKON* (📉) atau *MAHAL* (📈).\n`;
        txt += `• Pintar-pintarlah membeli saat harga sedang turun!\n\n`;

        txt += `🛑 *7. BATAS WAKTU (LIMITER)*\n`;
        txt += `Mesin memiliki kapasitas penampungan maksimal *24 Jam*.\n`;
        txt += `• Jika tidak diklaim > 24 jam, mesin *BERHENTI* menghasilkan BTC.\n`;
        txt += `• Login dan claim setiap hari agar profit maksimal!`;

        return msg.reply(txt);
    }

    // ============================================================
    // 🖥️ DASHBOARD
    // ============================================================
    if (command === 'mining' || command === 'miner') {
        // CEK RAZIA
        if (illegalCount > 0) {
            const chance = 0.05 * illegalCount; 
            if (Math.random() < chance) {
                user.mining.racks = user.mining.racks.filter(id => HARDWARE[id].type !== 'illegal');
                recalculateStats(user); 
                saveDB(db);
                return msg.reply(`🚔 *DORRR!! RAZIA POLISI!* 🚔\nAlat BM disita!`);
            }
        }

        // RANDOM EVENT
        let eventMsg = "";
        if (totalHash > 0 && Math.random() < 0.2) { 
            const ev = Math.random() < 0.5 ? 'overheat' : 'lucky';
            if (ev === 'overheat' && !user.mining.upgrades.cooling) {
                user.mining.lastClaim = now; 
                eventMsg = `🔥 *OVERHEAT!* Mesin kepanasan, waktu mining reset.`;
            } else if (ev === 'lucky') {
                const bonus = 0.00005;
                user.crypto.btc += bonus;
                eventMsg = `🍀 *LUCKY BLOCK!* Nemu bonus +${bonus} BTC.`;
            }
            if (eventMsg) saveDB(db);
        }

        // HITUNG WAKTU (DENGAN LIMITER 24 JAM)
        let diffHours = (now - user.mining.lastClaim) / (1000 * 60 * 60);
        let isFull = false;
        
        // 🔥 LOGIKA ANTI BUG TRILIUN 🔥
        if (diffHours > MAX_OFFLINE_HOURS) {
            diffHours = MAX_OFFLINE_HOURS;
            isFull = true;
        }
        if (diffHours < 0) diffHours = 0; 

        let pendingBTC = (totalHash * BTC_PER_HASH_HOUR * diffHours);
        let elecCost = totalHash * ELECTRICITY_COST * diffHours;
        if (user.mining.upgrades.psu) elecCost *= 0.7;

        const btcPrice = db.market?.forex?.usd ? (db.market.forex.usd * 63000) : 1500000000;
        const estRupiah = Math.floor(pendingBTC * btcPrice);

        let txt = `⛏️ *DASHBOARD MINING*\n`;
        txt += `👤 Miner: ${user.name || msg.pushName}\n`;
        txt += `⚡ Hashrate: ${fmt(totalHash)} MH/s\n`;
        txt += `🔌 Listrik: -Rp ${fmt(elecCost)}\n`;
        txt += `━━━━━━━━━━━━━━━━\n`;
        txt += `⏳ Durasi: ${diffHours.toFixed(2)} / 24.00 Jam\n`;
        txt += `💎 Hasil: ${pendingBTC.toFixed(8)} BTC\n`;
        txt += `💰 Estimasi: Rp ${fmt(estRupiah - elecCost)}\n`;
        
        if (isFull) txt += `\n⚠️ *PENAMPUNGAN PENUH!* Segera claim agar mesin jalan lagi!`;
        if (eventMsg) txt += `\n⚠️ ${eventMsg}`;
        
        return msg.reply(txt);
    }

    // ============================================================
    // 💰 CLAIM
    // ============================================================
    if (command === 'claimmining') {
        if (totalHash === 0) return msg.reply("❌ Gak punya alat.");
        
        // 🎉 EVENT: Rush Tambang (Admin Abuse)
        const rushAktif = db.settings?.rushTambang && Date.now() < db.settings.rushTambangUntil;

        let diffHours = (now - user.mining.lastClaim) / (1000 * 60 * 60);
        
        // 🔥 LOGIKA ANTI BUG TRILIUN DI SINI JUGA 🔥
        if (diffHours > MAX_OFFLINE_HOURS) diffHours = MAX_OFFLINE_HOURS;
        
        // Saat Rush Tambang: skip cooldown (minimal 0.01 jam tidak berlaku)
        if (!rushAktif && diffHours < 0.01) return msg.reply(`⏳ Sabar, mesin baru jalan.`);
        if (rushAktif && diffHours < 0.01) diffHours = 0.01; // minimal agar ada hasil

        let earnedBTC = (totalHash * BTC_PER_HASH_HOUR * diffHours);
        let elecBill = totalHash * ELECTRICITY_COST * diffHours;
        if (user.mining.upgrades.psu) elecBill *= 0.7;

        // 🎉 EVENT: Rush Tambang — hasil 5x, listrik gratis
        if (rushAktif) {
            earnedBTC *= 5;
            elecBill   = 0;
        }

        if (!rushAktif && user.balance < elecBill) {
            return msg.reply(`⚠️ *GAGAL KLAIM!*\nListrik: Rp ${fmt(elecBill)}\nSaldo: Rp ${fmt(user.balance)}\n\nBayar listrik dulu bos!`);
        }

        user.balance -= elecBill;
        user.crypto.btc = (user.crypto.btc || 0) + earnedBTC;
        user.mining.lastClaim = now;
        saveDB(db);

        let claimMsg = `✅ *PANEN SUKSES*\n+ ${earnedBTC.toFixed(8)} BTC\n- Rp ${fmt(elecBill)} (Listrik)`;
        if (rushAktif) claimMsg += `\n\n⛏️ *EVENT RUSH TAMBANG! Hasil 5x, Listrik Gratis!*`;
        return msg.reply(claimMsg);
    }

    // ============================================================
    // 🛒 BELI LEGAL
    // ============================================================
    if (command === 'shopminer' || command === 'belivga' || command === 'buyvga') {
        if (args[0]) {
            const itemCode = args[0].toLowerCase();
            if (!HARDWARE[itemCode] || HARDWARE[itemCode].type === 'illegal') return msg.reply("❌ Barang tidak ada.");
            
            const price = db.market.miningPrices[itemCode];
            if (user.balance < price) return msg.reply(`❌ Uang kurang!`);

            user.balance -= price;
            user.mining.racks.push(itemCode);
            recalculateStats(user); 
            
            // 🔥 FORCE RESET TIMER SAAT BELI (BIAR ADIL)
            user.mining.lastClaim = now; 
            
            saveDB(db);
            return msg.reply(`✅ Beli **${HARDWARE[itemCode].name}** sukses!\n⚠️ *Timer mining di-reset karena nambah alat baru.*`);
        }

        let txt = `🛒 *TOKO MINING RESMI*\n`;
        for (let [code, hw] of Object.entries(HARDWARE)) {
            if (hw.type === 'legal') {
                const price = db.market.miningPrices[code];
                txt += `🔹 ${hw.name} [${code}]\n   ⚡ ${hw.hashrate} MH/s | 💰 Rp ${fmt(price)}\n`;
            }
        }
        txt += `Beli: \`!belivga rtx4070\``;
        return msg.reply(txt);
    }

    // ============================================================
    // 🏴‍☠️ BLACK MARKET
    // ============================================================
    if (command === 'blackmarket' || command === 'bm') {
        if (args[0]) {
            const itemCode = args[0].toLowerCase();
            if (!HARDWARE[itemCode] || HARDWARE[itemCode].type !== 'illegal') return msg.reply("❌ Barang tidak ada.");
            
            const price = HARDWARE[itemCode].basePrice;
            if (user.balance < price) return msg.reply(`❌ Uang kurang!`);

            user.balance -= price;
            user.mining.racks.push(itemCode);
            recalculateStats(user); 
            
            // 🔥 FORCE RESET TIMER
            user.mining.lastClaim = now;

            saveDB(db);
            return msg.reply(`🤫 Transaksi sukses: **${HARDWARE[itemCode].name}**.`);
        }

        let txt = `🕵️ *BLACK MARKET*\n`;
        for (let [code, hw] of Object.entries(HARDWARE)) {
            if (hw.type === 'illegal') {
                txt += `🏴‍☠️ ${hw.name} [${code}]\n   ⚡ ${hw.hashrate} MH/s | 💰 Rp ${fmt(hw.basePrice)}\n   ⚠️ Risiko: ${(hw.risk * 100)}%\n`;
            }
        }
        txt += `Beli: \`!bm usb_miner\``;
        return msg.reply(txt);
    }

    // ============================================================
    // 🛠️ UPGRADE
    // ============================================================
    if (command === 'upgrade') {
        if (args[0]) {
            const upg = args[0].toLowerCase();
            if (!UPGRADES[upg]) return msg.reply("❌ Salah kode.");
            if (user.balance < UPGRADES[upg].price) return msg.reply("❌ Uang kurang.");

            user.balance -= UPGRADES[upg].price;
            user.mining.upgrades[upg] = true;
            saveDB(db);
            return msg.reply(`✅ Terpasang: ${UPGRADES[upg].name}`);
        }
        
        let txt = `🛠️ *UPGRADE*\n`;
        for (let [code, item] of Object.entries(UPGRADES)) {
            const st = user.mining.upgrades[code] ? "✅" : `💰 Rp ${fmt(item.price)}`;
            txt += `🔹 ${item.name} [${code}]\n   ℹ️ ${item.effect}\n   ${st}\n\n`;
        }
        return msg.reply(txt);
    }

    // ============================================================
    // ⚔️ HACK
    // ============================================================
    if (command === 'hack') {
        if (!args[0]) return msg.reply("Tag user! `!hack @user`");
        const targetNumber = args[0].replace(/[^0-9]/g, '');
        const targetId = targetNumber + "@s.whatsapp.net";
        const targetUser = db.users[targetId];

        if (!targetUser || !targetUser.mining || targetUser.mining.totalHash === 0) return msg.reply("❌ Target bukan miner.");
        if (targetUser.mining.upgrades.firewall) return msg.reply("🛡️ Gagal! Target punya Firewall.");

        if (Math.random() < 0.4) {
            const steal = (targetUser.crypto.btc || 0) * 0.05;
            if (steal <= 0) return msg.reply("❌ Wallet target kosong.");
            targetUser.crypto.btc -= steal;
            user.crypto.btc = (user.crypto.btc || 0) + steal;
            saveDB(db);
            return msg.reply(`✅ *BERHASIL!* Mencuri ${steal.toFixed(8)} BTC.`);
        } else {
            const fine = 500000;
            user.balance = Math.max(0, user.balance - fine);
            saveDB(db);
            return msg.reply(`🚨 *GAGAL!* Denda Rp ${fmt(fine)}.`);
        }
    }

    // ============================================================
    // 🏆 LEADERBOARD
    // ============================================================
    if (command === 'topminer') {
        const top = Object.values(db.users)
            .filter(u => u.crypto && u.crypto.btc > 0)
            .sort((a, b) => b.crypto.btc - a.crypto.btc)
            .slice(0, 10);
        let txt = `🏆 *TOP SALDO BITCOIN*\n`;
        top.forEach((u, i) => txt += `${i+1}. ${u.name || "Unknown"} — ₿ ${u.crypto.btc.toFixed(6)}\n`);
        return msg.reply(txt);
    }

    if (command === 'tophash') {
        const top = Object.values(db.users)
            .filter(u => u.mining && u.mining.totalHash > 0)
            .sort((a, b) => b.mining.totalHash - a.mining.totalHash)
            .slice(0, 10);
        let txt = `⚡ *TOP KEKUATAN ALAT*\n`;
        top.forEach((u, i) => txt += `${i+1}. ${u.name || "Unknown"} — ${fmt(u.mining.totalHash)} MH/s\n`);
        return msg.reply(txt);
    }
};
