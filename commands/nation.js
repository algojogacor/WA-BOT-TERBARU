const { saveDB } = require('../helpers/database');

// --- KONFIGURASI HARGA (SULTAN TIER) ---
const CONFIG = {
    FOUNDING_COST: 5_000_000_000, // 5 Miliar
    SOLDIER_COST: 50_000_000,     // 50 Juta per kepala
    BASE_TAX: 100_000,            // Pajak dasar
    
    // Gedung & Efeknya
    BUILDINGS: {
        'bank':   { name: "Bank Sentral", cost: 10_000_000_000, desc: "Pajak +10%" },
        'benteng':{ name: "Benteng Pertahanan", cost: 25_000_000_000, desc: "Defense +20%" },
        'rs':     { name: "Rumah Sakit", cost: 5_000_000_000, desc: "Populasi tumbuh cepat" }
    }
};

module.exports = async (command, args, msg, user, db) => {
    const validCommands = ['negara', 'nation', 'buatnegara', 'bangun', 'build', 'rekrut', 'pajaknegara', 'korupsi', 'subsidi', 'serang', 'war', 'topnegara', 'listnegara'];
    if (!validCommands.includes(command)) return;

    if (!db.nations) db.nations = {};
    const senderId = msg.author || msg.key.participant || msg.key.remoteJid;

    // --- HELPER: AUTO MIGRATE DATA LAMA ---
    if (db.nations[senderId]) {
        const n = db.nations[senderId];
        if (!n.buildings) n.buildings = { bank: 0, benteng: 0, rs: 0 };
        if (typeof n.stability === 'undefined') n.stability = 100;
        if (typeof n.treasury === 'undefined') n.treasury = 0;
    }

    // 1. DASHBOARD NEGARA (!negara)
    if (command === 'negara' || command === 'nation') {
        const nation = db.nations[senderId];

        if (!nation) {
            let txt = `🏳️ *SISTEM NEGARA SULTAN* 🏳️\n\n`;
            txt += `Jadilah Presiden dan kuasai grup ini!\n`;
            txt += `💸 Syarat: Rp ${CONFIG.FOUNDING_COST.toLocaleString()}\n\n`;
            txt += `Ketik: \`!buatnegara <nama_negara>\`\n`;
            txt += `Cek Global: \`!topnegara\``;
            return msg.reply(txt);
        }

        // --- HITUNG STATISTIK ---
        const taxBonus = (nation.buildings.bank * 10);
        const defBonus = (nation.buildings.benteng * 20);
        
        // Estimasi Power Rating
        const rawPower = nation.defense * (1 + (nation.buildings.benteng * 0.2));
        const powerRating = Math.floor(rawPower);

        let status = "🟢 Stabil";
        if (nation.stability < 50) status = "⚠️ Rusuh";
        if (nation.stability < 20) status = "🔥 ANARKI";

        let txt = `🏳️ *REPUBLIK ${nation.name.toUpperCase()}* 🏳️\n`;
        txt += `👤 Presiden: ${msg.pushName}\n`;
        txt += `🛡️ *POWER RATING: ${powerRating.toLocaleString()}* ⭐\n`;
        txt += `📊 Stabilitas: ${nation.stability}% (${status})\n`;
        txt += `👥 Penduduk: ${nation.population.toLocaleString()} Jiwa\n`;
        txt += `💰 Kas Negara: Rp ${nation.treasury.toLocaleString()}\n\n`;

        txt += `⚔️ *MILITER:*\n`;
        txt += `• Pasukan: ${nation.defense.toLocaleString()} Personil\n`;
        txt += `• Bonus Def: +${defBonus}% (Dari Benteng)\n\n`;

        txt += `🏗️ *INFRASTRUKTUR:*\n`;
        txt += `• 🏦 Bank (Lv.${nation.buildings.bank}): Pajak +${taxBonus}%\n`;
        txt += `• 🏰 Benteng (Lv.${nation.buildings.benteng}): Def +${defBonus}%\n`;
        txt += `• 🏥 RS (Lv.${nation.buildings.rs}): Growth ++\n\n`;

        txt += `💡 *OPSI:*\n`;
        txt += `\`!rekrut\` \`!bangun\` \`!pajaknegara\` \`!serang\` \`!subsidi\` \`!korupsi\``;

        return msg.reply(txt);
    }

    // 2. BUAT NEGARA (!buatnegara)
    if (command === 'buatnegara') {
        if (db.nations[senderId]) return msg.reply("❌ Anda sudah menjabat Presiden.");
        if (user.balance < CONFIG.FOUNDING_COST) return msg.reply(`❌ Modal kurang! Butuh Rp ${CONFIG.FOUNDING_COST.toLocaleString()}.`);
        
        const name = args.join(" ");
        if (!name) return msg.reply("❌ Nama negaranya apa? Contoh: `!buatnegara Wakanda`");

        user.balance -= CONFIG.FOUNDING_COST;
        db.nations[senderId] = {
            name: name,
            population: 1000, 
            defense: 50,      
            treasury: 1_000_000_000, // Modal awal Kas 1M
            stability: 100,
            lastTax: 0,
            buildings: { bank: 0, benteng: 0, rs: 0 }
        };
        saveDB(db);

        let txt = `🎉 *DEKLARASI KEMERDEKAAN BERHASIL!* 🎉\n\n`;
        txt += `Selamat Presiden ${msg.pushName}! Negara *${name}* telah berdiri.\n`;
        txt += `Uang Rp ${CONFIG.FOUNDING_COST.toLocaleString()} telah dibayarkan.\n\n`;
        txt += `📋 *LANGKAH SELANJUTNYA:*\n`;
        txt += `1️⃣ *Isi Kas Negara:* Pindahkan uang pribadi pakai \`!subsidi 1000000000\`.\n`;
        txt += `2️⃣ *Bangun Ekonomi:* Gunakan Kas untuk \`!bangun bank\`.\n`;
        txt += `3️⃣ *Perkuat Militer:* Beli tentara pakai \`!rekrut 100\`.\n`;
        txt += `4️⃣ *Perang:* Cek musuh pakai \`!topnegara\` lalu \`!serang @target\`.`;

        return msg.reply(txt);
    }

    // 3. TOP NEGARA (!topnegara)
    if (command === 'topnegara' || command === 'listnegara') {
        const list = Object.entries(db.nations).map(([id, data]) => {
            // Hitung Power Rating untuk sorting
            const power = Math.floor(data.defense * (1 + (data.buildings.benteng * 0.2)));
            return { id, ...data, power };
        });

        // Urutkan dari Power tertinggi
        list.sort((a, b) => b.power - a.power);

        let txt = `🌍 *PETA KEKUATAN DUNIA* 🌍\n`;
        txt += `_Siapa yang pantas diserang?_\n\n`;

        list.slice(0, 10).forEach((n, index) => {
            let medal = "";
            if (index === 0) medal = "🥇";
            else if (index === 1) medal = "🥈";
            else if (index === 2) medal = "🥉";
            else medal = `${index + 1}.`;

            const cleanName = n.id.split('@')[0]; // Ambil nomor WA
            txt += `${medal} *${n.name}* (@${cleanName})\n`;
            txt += `   ⚔️ Power: ${n.power.toLocaleString()} | 🏰 Benteng Lv.${n.buildings.benteng}\n`;
        });

        txt += `\n💡 Serang pakai: \`!serang @user\``;
        return msg.reply(txt, null, { mentions: list.map(n => n.id) });
    }

    // 4. BANGUN (!bangun)
    if (command === 'bangun' || command === 'build') {
        const nation = db.nations[senderId];
        if (!nation) return msg.reply("❌ Belum punya negara.");
        
        const type = args[0]?.toLowerCase();
        const building = CONFIG.BUILDINGS[type];

        if (!building) {
            let txt = `🏗️ *KATALOG KONTRAKTOR* 🏗️\n`;
            txt += `Kas Negara: Rp ${nation.treasury.toLocaleString()}\n\n`;
            txt += `1. *Bank Sentral* (Kode: \`bank\`)\n`;
            txt += `   💰 Harga: Rp ${CONFIG.BUILDINGS.bank.cost.toLocaleString()}\n`;
            txt += `   📈 Efek: Pendapatan Pajak +10%\n\n`;
            txt += `2. *Benteng* (Kode: \`benteng\`)\n`;
            txt += `   💰 Harga: Rp ${CONFIG.BUILDINGS.benteng.cost.toLocaleString()}\n`;
            txt += `   🛡️ Efek: Pertahanan Tentara +20%\n\n`;
            txt += `3. *Rumah Sakit* (Kode: \`rs\`)\n`;
            txt += `   💰 Harga: Rp ${CONFIG.BUILDINGS.rs.cost.toLocaleString()}\n`;
            txt += `   👥 Efek: Percepat kelahiran rakyat\n\n`;
            txt += `Cara beli: \`!bangun bank\``;
            return msg.reply(txt);
        }

        if (nation.treasury < building.cost) return msg.reply(`❌ Kas Negara kurang! Butuh Rp ${building.cost.toLocaleString()}.`);

        nation.treasury -= building.cost;
        nation.buildings[type] += 1;
        saveDB(db);

        return msg.reply(`🏗️ *PEMBANGUNAN SELESAI*\n${building.name} sekarang Level ${nation.buildings[type]}.\nEfek aktif: ${building.desc}`);
    }

    // 5. KEUANGAN: SUBSIDI & KORUPSI
    if (command === 'subsidi') { 
        const nation = db.nations[senderId];
        if (!nation) return msg.reply("❌ Belum punya negara.");

        let amount = parseInt(args[0]);
        if (args[0] === 'all') amount = user.balance;
        if (isNaN(amount) || amount < 1000) return msg.reply("❌ Nominal salah.");
        if (user.balance < amount) return msg.reply("❌ Uang pribadi kurang.");

        user.balance -= amount;
        nation.treasury += amount;
        
        // Subsidi memulihkan stabilitas
        if (nation.stability < 100) nation.stability += 5;
        if (nation.stability > 100) nation.stability = 100;

        saveDB(db);
        return msg.reply(`💸 *SUBSIDI NEGARA*\nKamu menyumbang Rp ${amount.toLocaleString()} ke Kas Negara.\nStabilitas Rakyat: ${nation.stability}%`);
    }

    if (command === 'korupsi') { 
        const nation = db.nations[senderId];
        if (!nation) return msg.reply("❌ Belum punya negara.");

        let amount = parseInt(args[0]);
        if (args[0] === 'all') amount = nation.treasury;
        if (isNaN(amount) || amount < 1000) return msg.reply("❌ Nominal salah.");
        if (nation.treasury < amount) return msg.reply("❌ Kas negara kosong.");

        nation.treasury -= amount;
        user.balance += amount;

        const drop = Math.floor(Math.random() * 10) + 5; 
        nation.stability -= drop;

        saveDB(db);
        
        let txt = `😈 *KORUPSI BERHASIL*\nKamu mencuri Rp ${amount.toLocaleString()} dari rakyat.\n📉 Stabilitas: -${drop}% (Sisa: ${nation.stability}%)\n`;
        
        if (nation.stability <= 0) {
            delete db.nations[senderId]; // Hapus negara
            txt += `\n🔥 *REVOLUSI RAKYAT PECAH!* 🔥\nRakyat menggulingkan pemerintahanmu. Negara hancur, kamu melarikan diri sebagai rakyat jelata.`;
        }
        return msg.reply(txt);
    }

    // 6. PAJAK & REKRUT
    if (command === 'pajaknegara') {
        const nation = db.nations[senderId];
        if (!nation) return msg.reply("❌ Belum punya negara.");

        const now = Date.now();
        const cooldown = 60 * 60 * 1000; 
        if (now - nation.lastTax < cooldown) return msg.reply("⏳ Sabar, rakyat baru bayar pajak.");

        // Hitung Pajak
        const baseIncome = nation.population * CONFIG.BASE_TAX;
        const multiplier = 1 + (nation.buildings.bank * 0.1); 
        const totalIncome = Math.floor(baseIncome * multiplier);

        // Hitung Populasi
        const growthRate = 0.05 + (nation.buildings.rs * 0.02); 
        const newPop = Math.floor(nation.population * growthRate);

        nation.treasury += totalIncome;
        nation.population += newPop;
        nation.lastTax = now;
        saveDB(db);

        return msg.reply(`💰 *PENDAPATAN NEGARA*\nPajak Terkumpul: Rp ${totalIncome.toLocaleString()}\nBonus Bank: x${multiplier.toFixed(1)}\nPopulasi Baru: +${newPop} Jiwa`);
    }

    if (command === 'rekrut') {
        const nation = db.nations[senderId];
        if (!nation) return msg.reply("❌ Belum punya negara.");

        const qty = parseInt(args[0]);
        if (isNaN(qty) || qty < 1) return msg.reply("❌ Jumlah salah.");
        
        const cost = qty * CONFIG.SOLDIER_COST;
        if (nation.treasury < cost) return msg.reply(`❌ Kas kurang Rp ${cost.toLocaleString()}.\n(Harga: 50 Juta per tentara)`);

        nation.treasury -= cost;
        nation.defense += qty;
        saveDB(db);
        return msg.reply(`🛡️ Merekrut ${qty} Pasukan. Total: ${nation.defense.toLocaleString()}`);
    }

    // 7. PERANG / WAR
    if (command === 'serang' || command === 'war') {
        const nation = db.nations[senderId];
        if (!nation) return msg.reply("❌ Belum punya negara.");

        const mentions = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
        const targetId = mentions[0];

        if (!targetId) return msg.reply("❌ Tag negara yang mau diserang!");
        if (targetId === senderId) return msg.reply("❌ Stress?");

        const enemy = db.nations[targetId];
        if (!enemy) return msg.reply("❌ Target tidak punya negara.");

        // HITUNG KEKUATAN (BLIND WAR)
        // Power = (Tentara * Bonus Benteng) * Faktor Random (0.8 - 1.2)
        const myBonus = 1 + (nation.buildings.benteng * 0.2); 
        const myPower = (nation.defense * myBonus) * (Math.random() * 0.4 + 0.8);

        const enemyDefBonus = 1 + (enemy.buildings.benteng * 0.5); // Benteng musuh sangat kuat efeknya
        const enemyPower = (enemy.defense * enemyDefBonus) * (Math.random() * 0.4 + 0.8);

        let txt = `⚔️ *WAR REPORT* ⚔️\n`;
        txt += `🚩 ${nation.name} vs 🏴 ${enemy.name}\n`;
        txt += `_(Intelijen tidak tersedia, ini serangan buta!)_\n\n`;

        if (myPower > enemyPower) {
            // MENANG
            const loot = Math.floor(enemy.treasury * 0.5); 
            const kill = Math.floor(enemy.population * 0.15); 
            
            enemy.treasury -= loot;
            nation.treasury += loot;
            enemy.population -= kill;
            
            // Hancurkan Infrastruktur Musuh (Peluang 30%)
            if (Math.random() < 0.3 && enemy.buildings.bank > 0) {
                enemy.buildings.bank -= 1;
                txt += `💣 *BOOM!* Rudal kita menghancurkan 1 level Bank musuh!\n`;
            }

            enemy.stability -= 20;

            const myLoss = Math.floor(nation.defense * 0.1);
            const enemyLoss = Math.floor(enemy.defense * 0.4);
            nation.defense -= myLoss;
            enemy.defense -= enemyLoss;

            txt += `🏆 *KEMENANGAN TELAK!*\n`;
            txt += `💰 Menjarah: Rp ${loot.toLocaleString()}\n`;
            txt += `💀 Membunuh: ${kill} Rakyat\n`;
            txt += `📉 Musuh kehilangan ${enemyLoss} Tentara.\n`;

        } else {
            // KALAH
            const loss = Math.floor(nation.treasury * 0.1); 
            nation.treasury -= loss;
            
            const myLoss = Math.floor(nation.defense * 0.4); // Rugi banyak karena nabrak tembok
            const enemyLoss = Math.floor(enemy.defense * 0.1);
            nation.defense -= myLoss;
            enemy.defense -= enemyLoss;
            
            nation.stability -= 10;

            txt += `🏳️ *SERANGAN GAGAL!*\n`;
            txt += `Pertahanan musuh terlalu kuat!\n`;
            txt += `📉 Kita kehilangan ${myLoss} Tentara.\n`;
            txt += `💸 Rugi Logistik: Rp ${loss.toLocaleString()}`;
        }
        
        // Validasi minus
        if (enemy.stability < 0) enemy.stability = 0;
        if (nation.stability < 0) nation.stability = 0;
        if (nation.defense < 0) nation.defense = 0;
        if (enemy.defense < 0) enemy.defense = 0;

        saveDB(db);
        return msg.reply(txt, null, { mentions: [targetId] });
    }
};
