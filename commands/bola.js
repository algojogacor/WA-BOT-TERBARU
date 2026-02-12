const axios = require('axios');
const { saveDB } = require('../helpers/database'); // Perbaikan path: ../ artinya keluar dari folder commands

const API_KEY = '895c3efd0c964d1dacb5c3e5bc2027f0'; 

module.exports = async (command, args, msg, user, db, sender) => {
    db.matches = db.matches || {};

    // Helper untuk menentukan Gelar
    const getGelar = (win) => {
        if (win >= 16) return "🏆 Dewa Judi";
        if (win >= 6) return "⚽ Pengamat Bola";
        if (win >= 1) return "👟 Amatir";
        return "🥚 Pemula";
    };

    // 1. UPDATE MATCH (!updatebola)
    if (command === "updatebola") {
        try {
            await msg.reply("⏳ Sedang mengambil jadwal pertandingan dunia...");
            const response = await axios.get('https://api.football-data.org/v4/matches', {
                headers: { 'X-Auth-Token': API_KEY }
            });

            const matches = response.data.matches;
            if (!matches || matches.length === 0) return msg.reply("📭 Tidak ada jadwal hari ini.");

            let count = 0;
            matches.forEach(m => {
                const id = m.id.toString().slice(-4);
                if (!db.matches[id]) {
                    db.matches[id] = {
                        name: `${m.homeTeam.shortName} vs ${m.awayTeam.shortName}`,
                        league: m.competition.name,
                        status: "open",
                        players: {}, 
                        date: m.utcDate,
                        realId: m.id 
                    };
                    count++;
                }
            });

            saveDB(db);
            return msg.reply(`✅ Berhasil memperbarui *${count}* pertandingan baru!`);
        } catch (error) {
            return msg.reply("❌ Gagal mengambil data. Limit API tercapai.");
        }
    }

    // 2. LIHAT JADWAL (!bola)
    if (command === "bola") {
        let txt = "⚽ *JADWAL BOLA & TARUHAN*\n\n";
        let found = false;
        for (let id in db.matches) {
            const match = db.matches[id];
            if (match.status === "open" && new Date() < new Date(match.date)) {
                const waktu = new Date(match.date).toLocaleString('id-ID', { 
                    timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' 
                });
                txt += `🆔 ID: *${id}*\n🥊 *${match.name}*\n⏰ ${waktu} WIB\n\n`;
                found = true;
            }
        }
        if (!found) return msg.reply("📭 Tidak ada match aktif.");
        return msg.reply(txt + "💡 Format: *!tebak <ID> <skor> <bet>*\nContoh: *!tebak 1234 2-1 1000*");
    }

    // 3. PASANG TEBAKAN (!tebak)
    if (command === "tebak") {
        const matchId = args[0];
        const skor = args[1];
        const bet = parseInt(args[2]);

        if (!db.matches[matchId]) return msg.reply("❌ ID Match salah.");
        if (new Date() >= new Date(db.matches[matchId].date)) return msg.reply("❌ Match sudah dimulai!");
        if (isNaN(bet) || bet < 100) return msg.reply("❌ Minimal taruhan 100 koin.");
        if (user.balance < bet) return msg.reply("❌ Saldo koin tidak cukup.");
        if (!skor || !skor.includes("-")) return msg.reply("❌ Format skor salah (Contoh: 2-1).");

        // Proses Taruhan
        user.balance -= bet;
        user.bolaTotal = (user.bolaTotal || 0) + 1; // Hitung total partisipasi
        db.matches[matchId].players[sender] = { skor: skor.trim(), bet: bet };
        
        saveDB(db);
        return msg.reply(`✅ Taruhan Berhasil!\n🥊 Match: *${db.matches[matchId].name}*\n💰 Bet: *${bet}* koin\n📝 Tebakan: *${skor}*`);
    }

    // 4. HASIL & HADIAH (!resultbola)
    if (command === "resultbola") {
        try {
            await msg.reply("⏳ Memproses hasil pertandingan...");
            const response = await axios.get('https://api.football-data.org/v4/matches', {
                headers: { 'X-Auth-Token': API_KEY }
            });

            const realMatches = response.data.matches;
            let report = "📝 *LAPORAN HASIL TEBAK SKOR*\n\n";
            let anyAwarded = false;

            for (let id in db.matches) {
                const localMatch = db.matches[id];
                if (localMatch.status !== "finished") {
                    const matchData = realMatches.find(m => m.id === localMatch.realId);
                    
                    if (matchData && matchData.status === "FINISHED") {
                        const finalSkor = `${matchData.score.fullTime.home}-${matchData.score.fullTime.away}`;
                        let winners = [];

                        for (let pId in localMatch.players) {
                            const pData = localMatch.players[pId];
                            if (pData.skor === finalSkor) {
                                const reward = pData.bet * 5; // Hadiah 5x lipat
                                if (db.users[pId]) {
                                    db.users[pId].balance += reward;
                                    db.users[pId].bolaWin = (db.users[pId].bolaWin || 0) + 1;
                                    db.users[pId].bolaProfit = (db.users[pId].bolaProfit || 0) + (reward - pData.bet);
                                    winners.push(`@${pId.split('@')[0]}`);
                                }
                            }
                        }

                        report += `🏁 *${localMatch.name}*\n⚽ Skor: *${finalSkor}*\n`;
                        report += winners.length > 0 ? `🎉 Menang: ${winners.join(", ")}\n\n` : `💀 Tidak ada pemenang.\n\n`;
                        
                        localMatch.status = "finished";
                        anyAwarded = true;
                    }
                }
            }

            if (!anyAwarded) return msg.reply("📭 Belum ada pertandingan baru yang selesai.");
            saveDB(db);
            return msg.reply(report, null, { mentions: Object.keys(db.users) });
        } catch (e) { return msg.reply("❌ Gagal cek hasil."); }
    }

    // 5. LEADERBOARD BOLA (!topbola)
    if (command === "topbola") {
        let arr = [];
        for (let id in db.users) {
            const u = db.users[id];
            if (u.bolaWin > 0 || u.bolaTotal > 0) {
                const rate = u.bolaTotal > 0 ? ((u.bolaWin / u.bolaTotal) * 100).toFixed(1) : 0;
                arr.push({ id, win: u.bolaWin || 0, profit: u.bolaProfit || 0, rate, gelar: getGelar(u.bolaWin || 0) });
            }
        }

        arr.sort((a, b) => b.win - a.win);
        let list = "🏆 *LEADERBOARD DEWA JUDI BOLA*\n\n";
        arr.slice(0, 10).forEach((u, i) => {
            list += `${i + 1}. @${u.id.split('@')[0]}\n   🎖️ *${u.gelar}*\n   📈 Win Rate: ${u.rate}% (${u.win} Win)\n   💰 Profit: +${u.profit}\n\n`;
        });

        return msg.reply(list || "📭 Belum ada data.", null, { mentions: arr.map(x => x.id) });
    }
};