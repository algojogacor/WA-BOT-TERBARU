const { saveDB } = require('../helpers/database');
const axios = require('axios'); // Pastikan sudah: npm install axios

// HELPER FORMAT ANGKA
const fmt = (num) => Math.floor(Number(num)).toLocaleString('id-ID');

module.exports = async (command, args, msg, user, db) => {
    const validCommands = ['valas', 'kurs', 'forex', 'beliemas', 'jualemas', 'beliusd', 'jualusd', 'belijpy', 'jualjpy', 'belivalas', 'jualvalas', 'aset'];
    if (!validCommands.includes(command)) return;

    // INIT DATABASE USER
    // Tambahkan 'jpy' ke inventory user
    if (!user.forex) user.forex = { usd: 0, eur: 0, jpy: 0, emas: 0 };
    
    // INIT DATABASE PASAR
    // Fallback price: USD 16.200, EUR 17.500, JPY 110, Emas 1.350.000
    if (!db.market.forex) db.market.forex = { usd: 16200, eur: 17500, jpy: 110, emas: 1350000 }; 
    if (!db.market.lastForexUpdate) db.market.lastForexUpdate = 0;

    const now = Date.now();
    const UPDATE_INTERVAL = 15 * 60 * 1000; // Update tiap 15 Menit

    // ============================================================
    // 🌐 FETCH REAL DATA (CoinGecko API)
    // ============================================================
    if (now - db.market.lastForexUpdate > UPDATE_INTERVAL) {
        try {
            // IDs CoinGecko:
            // tether = USD
            // euro-coin = EUR
            // gyen = JPY (Stablecoin Yen)
            // pax-gold = EMAS
            const url = 'https://api.coingecko.com/api/v3/simple/price?ids=tether,euro-coin,gyen,pax-gold&vs_currencies=idr';
            
            const response = await axios.get(url);
            const data = response.data;

            if (data.tether && data['euro-coin'] && data['gyen'] && data['pax-gold']) {
                // 1. USD
                db.market.forex.usd = Math.floor(data.tether.idr);

                // 2. EUR
                db.market.forex.eur = Math.floor(data['euro-coin'].idr);

                // 3. JPY (NEW!)
                db.market.forex.jpy = Math.floor(data.gyen.idr);

                // 4. EMAS
                const pricePerOunce = data['pax-gold'].idr;
                const pricePerGram = Math.floor(pricePerOunce / 31.1035);
                db.market.forex.emas = pricePerGram;

                db.market.lastForexUpdate = now;
                saveDB(db);
                console.log("✅ Valas Updated (Real-Time):", db.market.forex);
            }
        } catch (err) {
            console.error("⚠️ Gagal update valas (Pakai harga lama):", err.message);
        }
    }

    // ============================================================
    // 📉 CEK KURS REAL-TIME (!kurs)
    // ============================================================
    if (command === 'valas' || command === 'kurs' || command === 'forex') {
        let txt = `📉 *BURSA VALAS REAL-TIME* 📈\n`;
        txt += `_Data asli via CoinGecko (Update 15 mnt)_ \n\n`;

        const m = db.market.forex;
        
        txt += `🇺🇸 *USD (US Dollar)*\n   💰 Rp ${fmt(m.usd)} / lembar\n\n`;
        txt += `🇪🇺 *EUR (Euro)*\n   💰 Rp ${fmt(m.eur)} / lembar\n\n`;
        txt += `🇯🇵 *JPY (Japanese Yen)*\n   💰 Rp ${fmt(m.jpy)} / yen\n\n`;
        txt += `🥇 *XAU (Emas Murni)*\n   💰 Rp ${fmt(m.emas)} / gram\n\n`;

        txt += `💡 Ketik \`!belijpy 1000\` atau \`!beliemas 1\``;
        
        const lastUp = Math.floor((now - db.market.lastForexUpdate) / 60000);
        txt += `\n\n_Updated: ${lastUp} menit yang lalu_`;
        
        return msg.reply(txt);
    }

    // ============================================================
    // 💼 CEK ASET (!aset)
    // ============================================================
    if (command === 'aset' || command === 'dompetvalas') {
        let txt = `💼 *PORTOFOLIO INVESTASI* 💼\n`;
        txt += `👤 Investor: ${user.name}\n\n`;

        let totalValuation = 0;
        const prices = db.market.forex;

        // USD
        if (user.forex.usd > 0) {
            let val = user.forex.usd * prices.usd;
            txt += `🇺🇸 USD: $${fmt(user.forex.usd)} (Rp ${fmt(val)})\n`;
            totalValuation += val;
        }
        // EUR
        if (user.forex.eur > 0) {
            let val = user.forex.eur * prices.eur;
            txt += `🇪🇺 EUR: €${fmt(user.forex.eur)} (Rp ${fmt(val)})\n`;
            totalValuation += val;
        }
        // JPY (NEW)
        if (user.forex.jpy > 0) {
            let val = user.forex.jpy * prices.jpy;
            txt += `🇯🇵 JPY: ¥${fmt(user.forex.jpy)} (Rp ${fmt(val)})\n`;
            totalValuation += val;
        }
        // EMAS
        if (user.forex.emas > 0) {
            let val = user.forex.emas * prices.emas;
            txt += `🥇 Emas: ${fmt(user.forex.emas)} gram (Rp ${fmt(val)})\n`;
            totalValuation += val;
        }

        if (totalValuation === 0) txt += "_Kamu belum punya investasi._\n";
        
        txt += `\n💰 *Total Aset: Rp ${fmt(totalValuation)}*`;
        return msg.reply(txt);
    }

    // ============================================================
    // 🛒 BELI ASET (!belivalas <code> <jumlah>)
    // ============================================================
    if (command === 'beliemas') { command = 'belivalas'; args = ['emas', args[0]]; }
    if (command === 'beliusd') { command = 'belivalas'; args = ['usd', args[0]]; }
    if (command === 'belieur') { command = 'belivalas'; args = ['eur', args[0]]; }
    if (command === 'belijpy') { command = 'belivalas'; args = ['jpy', args[0]]; }

    if (command === 'belivalas') {
        const code = args[0]?.toLowerCase();
        const qty = parseFloat(args[1]); 

        if (!code || !db.market.forex[code]) return msg.reply("❌ Aset tidak valid. Cek `!kurs`");
        if (isNaN(qty) || qty <= 0) return msg.reply("❌ Masukkan jumlah yang valid.");

        const price = db.market.forex[code];
        const totalCost = Math.floor(price * qty);

        if (user.balance < totalCost) return msg.reply(`❌ Uang kurang! Butuh Rp ${fmt(totalCost)}.`);

        user.balance -= totalCost;
        // Init jika belum ada
        if (!user.forex) user.forex = {}; 
        user.forex[code] = (user.forex[code] || 0) + qty;
        
        saveDB(db);
        const unit = code === 'emas' ? 'gram' : (code === 'jpy' ? 'yen' : 'lembar');
        return msg.reply(`✅ *INVESTASI SUKSES*\nMembeli ${qty} ${unit} ${code.toUpperCase()}.\n💸 Harga Beli: Rp ${fmt(price)}\n💰 Total: Rp ${fmt(totalCost)}`);
    }

    // ============================================================
    // 💵 JUAL ASET (!jualvalas <code> <jumlah>)
    // ============================================================
    if (command === 'jualemas') { command = 'jualvalas'; args = ['emas', args[0]]; }
    if (command === 'jualusd') { command = 'jualvalas'; args = ['usd', args[0]]; }
    if (command === 'jualeur') { command = 'jualvalas'; args = ['eur', args[0]]; }
    if (command === 'jualjpy') { command = 'jualvalas'; args = ['jpy', args[0]]; }

    if (command === 'jualvalas') {
        const code = args[0]?.toLowerCase();
        let qty = args[1]; 

        if (!code || !db.market.forex[code]) return msg.reply("❌ Aset tidak valid.");
        // Init jika belum ada
        if (!user.forex) user.forex = {};
        if (!user.forex[code] || user.forex[code] <= 0) return msg.reply("❌ Kamu tidak punya aset ini.");

        if (qty === 'all') {
            qty = user.forex[code];
        } else {
            qty = parseFloat(qty);
        }

        if (isNaN(qty) || qty <= 0) return msg.reply("❌ Jumlah tidak valid.");
        if (user.forex[code] < qty) return msg.reply(`❌ Stok kurang! Kamu cuma punya ${user.forex[code]}.`);

        const price = db.market.forex[code];
        const totalReceive = Math.floor(price * qty);

        user.forex[code] -= qty;
        user.balance += totalReceive;

        saveDB(db);
        const unit = code === 'emas' ? 'gram' : (code === 'jpy' ? 'yen' : 'lembar');
        return msg.reply(`📉 *PENJUALAN SUKSES*\nMenjual ${qty} ${unit} ${code.toUpperCase()}.\n💵 Harga Jual: Rp ${fmt(price)}\n💰 Diterima: Rp ${fmt(totalReceive)}`);
    }
};
