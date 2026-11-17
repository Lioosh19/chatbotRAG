# Proyek Tugas Chatbot RAG Shopee & Gateway WhatsApp

Proyek ini dibangun berdasarkan modul praktikum **Artificial Intelligence and Its Application** (Bab 4: Penugasan). 

Arsitektur sistem dibagi menjadi 2 bagian sesuai karakteristik teknisnya:
1. **Website Toko Shopee + Chatbot RAG (Vercel Serverless Ready)**: Dapat diakses publik secara online, menampilkan katalog produk lapak Shopee, memiliki widget interaktif AI Chatbot berbasis RAG, dan tombol pemesanan WhatsApp otomatis (`wa.me`).
2. **WhatsApp Gateway (Lokal)**: Berjalan di komputer lokal menggunakan `whatsapp-web.js` untuk mengontrol sesi WhatsApp Web dan merespons pesan pelanggan dengan data katalog yang sama.

---

## 📁 Struktur Folder Proyek

```text
chatbot-rag/
├── api/                     # Serverless API untuk deployment Vercel
│   ├── chat.js              # Endpoint Chatbot AI RAG di website (/api/chat)
│   └── products.js          # Endpoint data produk katalog (/api/products)
├── data/
│   └── products.csv         # Basis data katalog hasil scraping Shopee
├── lib/
│   └── rag.js               # Mesin RAG: Keyword scoring & Context Builder
├── public/                  # Frontend antarmuka website & dashboard
│   ├── index.html           # Website etalase lapak + floating chat widget
│   ├── style.css            # Desain responsif modern
│   └── app.js               # Logika filter katalog, chat AI, & tombol wa.me
├── scripts/
│   └── scrape-shopee.js     # Helper export & scraping data Shopee ke CSV
├── knowledge.json           # FAQ manual (Jam buka, pengiriman, garansi, link toko)
├── nodemon.json             # Konfigurasi ignore file watcher
├── package.json             # Manifest dependensi & scripts
├── server-v2.js             # Backend Express & WhatsApp Gateway lokal
├── vercel.json              # Konfigurasi routing deploy ke Vercel
└── .env.example             # Contoh template konfigurasi environment
```

---

## 🚀 Cara Menjalankan di Komputer Lokal

### 1. Salin File Konfigurasi `.env`
Salin `.env.example` menjadi `.env`:
```bash
copy .env.example .env
```
Isi variabel berikut di `.env`:
- `GROQ_API_KEY`: API Key Groq Anda (dari [console.groq.com/keys](https://console.groq.com/keys))
- `STORE_WA_NUMBER`: Nomor WhatsApp yang digunakan untuk menerima chat (format internasional: `628xxxxxxxxxx`)

### 2. Install Dependensi
```bash
npm install
```

### 3. Jalankan Server Lokal
```bash
npm run dev
```
Buka browser di `http://localhost:3001`:
- Anda dapat mencoba website etalase dan mengobrol langsung dengan **Chatbot RAG di web**.
- Anda juga dapat menyalakan bot WhatsApp dengan mengklik tombol **Mulai Bot** lalu scan QR Code dari WhatsApp di HP Anda.

---

## 🌐 Cara Deploy Website ke Vercel (Tugas)

Sesuai instruksi Halaman 38 pada modul:
1. **Push folder project ke GitHub:**
   ```bash
   git init
   git add .
   git commit -m "feat: Chatbot RAG Shopee Store"
   git branch -M main
   git remote add origin https://github.com/USERNAME/NAMA-REPO.git
   git push -u origin main
   ```
2. Buka [https://vercel.com](https://vercel.com) dan login dengan akun GitHub Anda.
3. Klik **Add New...** -> **Project**.
4. Import repository GitHub Anda.
5. Pada bagian **Environment Variables**, tambahkan:
   - `GROQ_API_KEY`: API Key Groq Anda
   - `GROQ_MODEL`: `qwen/qwen3.8-27b`
   - `STORE_NAME`: Nama lapak Shopee Anda
6. Klik **Deploy**.
7. Setelah selesai, salin URL publik Vercel Anda (contoh: `https://shopee-rag-chatbot.vercel.app`).

---

## 📝 Kelengkapan untuk Laporan Praktikum

Di dalam laporan praktikum, Anda diminta menyertakan:
1. **Link Vercel**: URL website hasil deploy.
2. **Link Lapak Shopee**: URL lapak Shopee asli yang dipilih sebagai sumber data.
3. **Uji Verifikasi Percakapan**:
   - Screenshot pertanyaan produk (misal: "Berapa harga gelang emas veeline?").
   - Screenshot jawaban AI yang sesuai dengan produk lapak.
   - Screenshot tombol WhatsApp dan chat otomatis yang terbuka di WhatsApp.
