FROM node:20-bookworm

# 1. Install FFmpeg, ImageMagick, WebP, DAN PYTHON
RUN apt-get update && \
    apt-get install -y \
    ffmpeg \
    imagemagick \
    webp \
    python3 \
    python3-pip && \
    apt-get upgrade -y && \
    rm -rf /var/lib/apt/lists/*

# 2. Install Library Python (Pillow) untuk Steganografi
RUN pip3 install pillow --break-system-packages

# 3. Set Folder Kerja
WORKDIR /app

# 4. Copy Package JSON dulu biar cache jalan
COPY package*.json ./

# 5. Install Library Node.js
RUN npm install

# 6. Copy Semua File Bot
COPY . .

# 7. Buka Port untuk Koyeb
EXPOSE 3000

# 8. Jalankan Bot
CMD ["node", "index.js"]
