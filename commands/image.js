// 🔥 FITUR AI IMAGE GENERATOR (GRATIS) 

const axios = require('axios');

module.exports = async (command, args, msg, user, db, sock) => {
    // 1. Validasi Command
    const validCommands = ['img', 'image', 'gambar', 'lukis'];
    if (!validCommands.includes(command)) return;

    // 2. Cek Input Prompt
    const prompt = args.join(' ');
    if (!prompt) {
        return msg.reply(`🎨 *AI IMAGE GENERATOR*\n\nFormat salah! Masukkan deskripsi gambar.\n\nContoh:\n✅ \`!img kucing cyberpunk naik motor di tokyo malam hari\`\n✅ \`!lukis pemandangan gunung fuji gaya anime ghibli\``);
    }

    // Beri reaksi loading
    await sock.sendMessage(msg.from, { react: { text: '🎨', key: msg.key } });
    await msg.reply("⏳ *Algojo sedang melukis...* Tunggu sebentar yah sayang, jangan spam!");

    try {
        const enhancedPrompt = `${prompt}, high quality, detailed, 4k, masterpiece`;
        const encodedPrompt = encodeURIComponent(enhancedPrompt);

        const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?nologo=true`;

        await sock.sendMessage(msg.from, {
            image: { url: imageUrl },
            caption: `🎨 *AI Art by Algojo*\n\nPrompt: _"${prompt}"_`,
            viewOnce: false
        }, { quoted: msg });

        // Reaksi sukses
        await sock.sendMessage(msg.from, { react: { text: '✅', key: msg.key } });

    } catch (e) {
        console.error("Error AI Image:", e);
        // Reaksi gagal
        await sock.sendMessage(msg.from, { react: { text: '❌', key: msg.key } });
        
        let errorMessage = "❌ Gagal membuat gambar.";
        if (e.message.includes('timeout') || e.message.includes('network')) {
            errorMessage += " Server AI sedang sibuk atau koneksi lambat. Coba lagi nanti.";
        } else {
            errorMessage += " Coba ganti prompt kamu dengan kata-kata yang lebih sederhana (lebih baik pakai bahasa Inggris).";
        }
        await msg.reply(errorMessage);
    }
};
