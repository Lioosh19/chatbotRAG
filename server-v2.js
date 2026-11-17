require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const Groq = require("groq-sdk");
const fs = require("fs");
const path = require("path");
const RAGEngine = require("./lib/rag");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

// Inisialisasi Groq SDK
let groq = null;
if (process.env.GROQ_API_KEY && process.env.GROQ_API_KEY !== "isi_api_key_groq_kalian_disini") {
  groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
}

// Inisialisasi RAG Engine (otomatis deteksi data/crawling_mybasic.csv)
const ragEngine = new RAGEngine();

// Load Knowledge Base
const KNOWLEDGE_PATH = path.join(__dirname, "knowledge.json");
let knowledge = { keywords: {}, responses: {} };
function loadKnowledge() {
  try {
    if (fs.existsSync(KNOWLEDGE_PATH)) {
      knowledge = JSON.parse(fs.readFileSync(KNOWLEDGE_PATH, "utf-8"));
    }
  } catch (err) {
    console.error("Gagal membaca knowledge.json:", err);
  }
}
loadKnowledge();

// State WhatsApp Bot
let client = null;
let qrCodeData = null;
let isReady = false;
let isInitializing = false;
let isCleaning = false;

// ================= KUOTA & RATE LIMIT GROQ AI =================
let groqQuota = {
  model: process.env.GROQ_MODEL || "qwen/qwen3.8-27b",
  remainingRequests: null,
  limitRequests: null,
  remainingTokens: null,
  limitTokens: null,
  resetRequests: null,
  lastChecked: null,
  configured: Boolean(process.env.GROQ_API_KEY && process.env.GROQ_API_KEY !== "isi_api_key_groq_kalian_disini")
};

function updateGroqQuotaFromHeaders(headers, modelName) {
  if (!headers) return;
  groqQuota.model = modelName || process.env.GROQ_MODEL || "qwen/qwen3.8-27b";
  const remReq = headers.get ? headers.get("x-ratelimit-remaining-requests") : headers["x-ratelimit-remaining-requests"];
  const limReq = headers.get ? headers.get("x-ratelimit-limit-requests") : headers["x-ratelimit-limit-requests"];
  const remTok = headers.get ? headers.get("x-ratelimit-remaining-tokens") : headers["x-ratelimit-remaining-tokens"];
  const limTok = headers.get ? headers.get("x-ratelimit-limit-tokens") : headers["x-ratelimit-limit-tokens"];
  const rstReq = headers.get ? headers.get("x-ratelimit-reset-requests") : headers["x-ratelimit-reset-requests"];
  if (remReq) groqQuota.remainingRequests = Number(remReq);
  if (limReq) groqQuota.limitRequests = Number(limReq);
  if (remTok) groqQuota.remainingTokens = Number(remTok);
  if (limTok) groqQuota.limitTokens = Number(limTok);
  if (rstReq) groqQuota.resetRequests = rstReq;
  groqQuota.lastChecked = new Date().toLocaleTimeString("id-ID");
  groqQuota.configured = true;
}

async function fetchGroqQuotaFresh() {
  if (!groq) {
    if (process.env.GROQ_API_KEY && process.env.GROQ_API_KEY !== "isi_api_key_groq_kalian_disini") {
      groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    } else {
      return groqQuota;
    }
  }
  const modelToUse = process.env.GROQ_MODEL || "qwen/qwen3.8-27b";
  try {
    const { response } = await groq.chat.completions.create({
      model: modelToUse,
      messages: [{ role: "user", content: "ping" }],
      max_tokens: 1
    }).withResponse();
    updateGroqQuotaFromHeaders(response.headers, modelToUse);
  } catch (err) {
    console.warn("Gagal mengecek kuota Groq:", err.message);
  }
  return groqQuota;
}

// ================= CONVERSATION HISTORY (MULTI-TURN MEMORY) =================
const conversationHistory = new Map();
const MAX_HISTORY_MESSAGES = 6;
const SESSION_TTL_MS = 20 * 60 * 1000;

function getUserHistory(senderId) {
  if (!senderId) return [];
  const session = conversationHistory.get(senderId);
  const now = Date.now();
  if (!session) return [];
  if (now - session.lastActive > SESSION_TTL_MS) {
    conversationHistory.delete(senderId);
    return [];
  }
  return session.messages || [];
}

function appendUserHistory(senderId, userMsg, botReply) {
  if (!senderId) return;
  const now = Date.now();
  let session = conversationHistory.get(senderId);
  if (!session || (now - session.lastActive > SESSION_TTL_MS)) {
    session = { messages: [], lastActive: now };
  }
  session.messages.push({ role: "user", content: userMsg });
  session.messages.push({ role: "assistant", content: botReply });
  if (session.messages.length > MAX_HISTORY_MESSAGES) {
    session.messages = session.messages.slice(-MAX_HISTORY_MESSAGES);
  }
  session.lastActive = now;
  conversationHistory.set(senderId, session);
}

// Direktori Auth disimpan di LocalAppData / Temp agar tidak terkunci oleh sinkronisasi OneDrive
const AUTH_DIR = path.join(process.env.LOCALAPPDATA || process.env.TEMP || __dirname, "wwebjs_auth_data");

function initializeClient() {
  if (client) return client;
  client = new Client({
    authStrategy: new LocalAuth({
      clientId: "chatbot-rag",
      dataPath: AUTH_DIR
    }),
    webVersionCache: {
      type: "remote",
      remotePath: "https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html"
    },
    puppeteer: {
      executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--no-first-run",
        "--no-zygote",
        "--disable-gpu"
      ]
    }
  });

  client.on("qr", qr => {
    qrCodeData = qr;
    isInitializing = false;
    console.log("\n================ KODE QR WHATSAPP ================");
    qrcode.generate(qr, { small: true });
    console.log("Pindai QR code di atas atau melalui web dashboard.");
    console.log("==================================================\n");
  });

  client.on("authenticated", () => {
    console.log("Autentikasi WhatsApp berhasil.");
  });

  client.on("auth_failure", msg => {
    console.error("Autentikasi WhatsApp gagal:", msg);
    isInitializing = false;
  });

  client.on("ready", () => {
    isReady = true;
    isInitializing = false;
    qrCodeData = null;
    console.log("Bot WhatsApp siap digunakan!");
  });

  client.on("disconnected", reason => {
    console.log("WhatsApp terputus:", reason);
    isReady = false;
    qrCodeData = null;
    client = null;
  });

  // Tracking balasan bot untuk mencegah looping pada self-chat / chat ke nomor sendiri
  const botRecentReplies = new Set();
  const botSentMsgIds = new Set();

  // Handler Pesan WhatsApp (Mendukung pesan dari orang lain DAN pesan tes ke diri sendiri)
  client.on("message_create", async msg => {
    try {
      if (!msg.body || typeof msg.body !== "string") return;

      // Abaikan status update / stories WhatsApp
      if (msg.from?.endsWith("@status") || msg.to?.endsWith("@status") || msg.isStatus) return;

      // Abaikan obrolan grup
      if (msg.from?.endsWith("@g.us") || msg.to?.endsWith("@g.us") || msg.isGroupMsg) return;

      // Abaikan pesan jika itu adalah balasan yang baru saja dikirim oleh bot sendiri
      if (msg.id && botSentMsgIds.has(msg.id._serialized)) {
        botSentMsgIds.delete(msg.id._serialized);
        return;
      }
      if (botRecentReplies.has(msg.body.trim())) {
        return;
      }

      const myWid = client.info && client.info.wid ? client.info.wid._serialized : null;
      const myUser = client.info && client.info.wid ? client.info.wid.user : null;

      // Deteksi apakah ini chat ke nomor sendiri ("Messages to yourself" / chat ke diri sendiri)
      const isSelfChat = Boolean(
        msg.fromMe &&
        (msg.to === myWid ||
         msg.from === myWid ||
         (myUser && (msg.to?.includes(myUser) || msg.from?.includes(myUser))) ||
         msg.to === msg.from)
      );

      // Bot hanya merespon jika:
      // 1. Pesan masuk dari orang lain (!msg.fromMe)
      // 2. ATAU pesan di chat diri sendiri (isSelfChat) untuk keperluan uji coba
      if (!msg.fromMe || isSelfChat) {
        const message = msg.body.trim();
        if (!message) return;

        console.log(`[Pesan Masuk${isSelfChat ? " (Self-Chat Test)" : ""} dari ${msg.from}]: ${message}`);

        const senderKey = isSelfChat ? "self-test" : msg.from;
        const reply = await getAIResponse(senderKey, message);

        // Catat balasan bot agar tidak memicu respon berulang
        botRecentReplies.add(reply.trim());
        setTimeout(() => botRecentReplies.delete(reply.trim()), 30000);

        // Kirim balasan ke nomor pengirim / room chat terkait
        const targetChat = isSelfChat ? (msg.to || msg.from) : msg.from;
        const sentMsg = await client.sendMessage(targetChat, reply);
        if (sentMsg && sentMsg.id) {
          botSentMsgIds.add(sentMsg.id._serialized);
        }
        console.log(`[Balasan Terkirim ke ${targetChat}]: ${reply.substring(0, 60)}...`);
      }
    } catch (err) {
      console.error("Error memproses pesan WhatsApp:", err);
    }
  });

  return client;
}

// Helper Format Teks WhatsApp
function formatWhatsAppMessage(text) {
  if (!text) return "";
  let formatted = text.replace(/\*\*(.*?)\*\*/g, "*$1*");
  formatted = formatted.replace(/\n{3,}/g, "\n\n").trim();
  return formatted;
}

function isGreetingMessage(text) {
  if (!text) return false;
  const q = text.toLowerCase().trim();
  const greetings = [
    "halo", "hai", "hi", "hey", "hello", "hei", "p", "ping", "test",
    "pagi", "selamat pagi", "siang", "selamat siang", "sore", "selamat sore",
    "malam", "selamat malam", "assalamualaikum", "assalamu'alaikum",
    "assalamu alaikum", "permisi", "sampurasun"
  ];
  if (greetings.includes(q)) return true;
  if (/^(halo|hai|hi|hey|hello|selamat\s+(pagi|siang|sore|malam)|assalamu\s*alaikum|permisi)\b/i.test(q)) {
    const productKeywords = ["produk", "harga", "katalog", "jual", "beli", "kaos", "baju", "tshirt", "polo", "jaket", "hoodie", "crewneck", "celana", "chino", "cargo", "size", "warna"];
    return !productKeywords.some(pk => q.includes(pk));
  }
  return false;
}

function isGratitudeMessage(text) {
  if (!text) return false;
  const q = text.toLowerCase().trim();
  const gratitudeList = [
    "terima kasih", "terimakasih", "makasih", "makasi", "thx", "thanks", "thank you",
    "matur nuwun", "nuhun", "syukron", "terima kasih banyak", "terimakasih banyak", "makasih banyak"
  ];
  if (gratitudeList.includes(q)) return true;
  return /^(terima\s*kasih|makasih|makasi|thanks|thank\s*you|thx|matur\s*nuwun|nuhun|syukron)\b/i.test(q);
}

// Helper deteksi pertanyaan produk atau pertanyaan jamak/kompleks
function isProductOrComplexQuery(text) {
  const q = text.toLowerCase().trim();
  const indicators = [
    "kaos", "baju", "tshirt", "tee", "polo", "longsleeve", "boxy", "fitted", "oversize",
    "oversized", "singlet", "celana", "harga", "katalog", "rekomendasi", "ada apa",
    "apa saja", "apa aja", "dan", "serta", "kain", "bahan"
  ];
  return indicators.some(ind => q.includes(ind));
}

// Logika Respons AI & Basis Pengetahuan Toko MyBasic
async function getAIResponse(senderId, message) {
  const normalized = message.toLowerCase().trim();

  // 1. Template Sapaan
  if (isGreetingMessage(normalized)) {
    console.log("[Template Sapaan]: Menggunakan template sistem cepat");
    const greetingReply = "Halo! Selamat datang di *MyBasic Official Store*. \n\nAda yang bisa kami bantu seputar koleksi kaos polos, oversized tee, polo, hoodie, atau panduan bahan hari ini? 😊";
    if (senderId) appendUserHistory(senderId, message, greetingReply);
    return greetingReply;
  }

  // 2. Template Terima Kasih
  if (isGratitudeMessage(normalized)) {
    console.log("[Template Terima Kasih]: Menggunakan template sistem cepat");
    const gratitudeReply = "Sama-sama! Senang bisa membantu Anda di *MyBasic Official Store*. \n\nJika ada pertanyaan lain atau ingin memesan via Shopee/WhatsApp, silakan hubungi kami kembali ya! 😊";
    if (senderId) appendUserHistory(senderId, message, gratitudeReply);
    return gratitudeReply;
  }

  // 3. Deteksi Pertanyaan Operasional Toko (Pengiriman, Retur/Garansi, Cara Pesan, Lokasi, Jam Buka)
  const asksShipping = normalized.includes("kirim") || normalized.includes("pengiriman") || normalized.includes("ongkir") || normalized.includes("ekspedisi") || normalized.includes("sampai");
  const asksReturn = normalized.includes("retur") || normalized.includes("garansi") || normalized.includes("tukar") || normalized.includes("rusak") || normalized.includes("cacat");
  const asksOrder = normalized.includes("pesan") || normalized.includes("order") || normalized.includes("beli") || normalized.includes("checkout") || normalized.includes("cara");
  const asksStoreHours = normalized.includes("jam buka") || normalized.includes("operasional") || normalized.includes("buka jam") || normalized.includes("jadwal");
  const asksLocation = normalized.includes("alamat") || normalized.includes("lokasi") || normalized.includes("gudang") || normalized.includes("daerah");

  const productSpecificTerms = ["kaos", "baju", "tshirt", "polo", "longsleeve", "boxy", "fitted", "oversize", "oversized", "singlet", "celana", "chino", "cargo"];
  const mentionsSpecificProduct = productSpecificTerms.some(t => normalized.includes(t));

  if ((asksShipping || asksReturn || asksOrder || asksStoreHours || asksLocation) && !mentionsSpecificProduct) {
    let parts = [];
    if (asksOrder && knowledge.responses["cara pesan"]) parts.push("🛒 *Cara Pemesanan:*\n" + knowledge.responses["cara pesan"]);
    if (asksShipping && knowledge.responses["pengiriman"]) parts.push("🚚 *Ketentuan Pengiriman:*\n" + knowledge.responses["pengiriman"]);
    if (asksReturn && knowledge.responses["garansi"]) parts.push("🛡️ *Garansi & Kebijakan Retur:*\n" + knowledge.responses["garansi"]);
    if (asksStoreHours && knowledge.responses["jam buka"]) parts.push("⏰ *Jam Operasional:*\n" + knowledge.responses["jam buka"]);
    if (asksLocation && knowledge.responses["alamat"]) parts.push("📍 *Lokasi & Gudang:*\n" + knowledge.responses["alamat"]);
    
    if (parts.length > 0) {
      const reply = formatWhatsAppMessage(parts.join("\n\n"));
      if (senderId) appendUserHistory(senderId, message, reply);
      return reply;
    }
  }

  // 4. Cek respons manual knowledge.json HANYA jika bukan pertanyaan produk atau pertanyaan ganda
  if (!isProductOrComplexQuery(normalized)) {
    if (knowledge.responses && knowledge.responses[normalized]) {
      console.log("[Knowledge Match]: Menggunakan jawaban manual keyword");
      const manualReply = formatWhatsAppMessage(knowledge.responses[normalized]);
      if (senderId) appendUserHistory(senderId, message, manualReply);
      return manualReply;
    }

    if (knowledge.keywords) {
      for (const [kw, targetKey] of Object.entries(knowledge.keywords)) {
        const escapedKw = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const wordRegex = new RegExp(`(^|\\s)${escapedKw}(\\s|$)`, "i");
        if (wordRegex.test(normalized)) {
          if (knowledge.responses && knowledge.responses[targetKey]) {
            console.log(`[Knowledge Keyword Match]: Cocok dengan keyword '${kw}'`);
            const manualReply = formatWhatsAppMessage(knowledge.responses[targetKey]);
            if (senderId) appendUserHistory(senderId, message, manualReply);
            return manualReply;
          }
        }
      }
    }
  }

  // 4. Riwayat percakapan
  const history = senderId ? getUserHistory(senderId) : [];

  // 5. RAG Context dari CSV Shopee
  ragEngine.loadData();
  let ragContext = ragEngine.buildContext(message);
  if (!ragContext && history.length > 0) {
    const prevUserQueries = history
      .filter(h => h.role === "user")
      .slice(-2)
      .map(h => h.content)
      .join(" ");
    ragContext = ragEngine.buildContext(`${prevUserQueries} ${message}`);
  }

  // 6. Panggil Groq AI
  try {
    if (!groq) {
      if (process.env.GROQ_API_KEY && process.env.GROQ_API_KEY !== "isi_api_key_groq_kalian_disini") {
        groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
      } else {
        return "Halo! Terima kasih telah menghubungi kami. Saat ini sistem sedang dalam mode offline atau API Key Groq belum dikonfigurasi pada file .env.";
      }
    }

    const systemPrompt = `Anda adalah konsultan toko resmi dari "MyBasic Official Store" (lapak resmi Shopee). Jawab dalam Bahasa Indonesia yang ramah, hangat, natural, casual sopan, to the point, dan sangat informatif.

PENGETAHUAN PRODUK, BAHAN & SIZE CHART TOKO (RESMI MYBASIC):
1. Karakteristik & Jenis Bahan MyBasic:
 - Cotton Combed 20s (Heavyweight 200 GSM++): Karakter bahan tebal, kokoh, serat padat, tidak menerawang, sangat awet (digunakan pada Boxy Tee & Oversized T-Shirt).
 - Cotton Combed 24s (200 GSM): Ketebalan pas standar distro, adem menyerap keringat, nyaman untuk harian.
 - Cotton Combed 30s (Soft Touch): Lebih tipis, jatuh di badan, ekstra lembut.
 - Airy BreezeWear (Quick Dry Tech): Teknologi kain cepat kering, anti-kusut, sejuk dan ringan untuk cuaca panas atau gym.
 - Cotton Pique & Danbowl DoubleLock 300 GSM: Kain berpori elegan rajut anti melar khusus seri Polo Shirt.

2. Panduan Ukuran (Size Chart Standar MyBasic):
 - S: 48 cm x 68 cm | M: 52 cm x 70 cm | L: 56 cm x 73 cm | XL: 60 cm x 76 cm | XXL: 64 cm x 78 cm | 3XL: 68 cm x 80 cm
 *(Toleransi 1-2 cm. Untuk gaya oversized disarankan naik 1 size).*

3. Aturan Menjawab:
 - Jika ditanya "Ada kaos oversized apa saja dan harganya berapa?", WAJIB sebutkan nama produk oversized dari katalog di bawah beserta harganya! JANGAN HANYA MENJAWAB UKURAN!
 - Jika ditanya bahan DAN ukuran, jelaskan keduanya secara terstruktur.
 - Gunakan format WhatsApp: *teks tebal* dengan satu bintang.
 - Gunakan bullet point (•) untuk mendaftar produk.
 - Sertakan link Shopee jika ada.

${ragContext ? ragContext : "Konteks Katalog: (Tidak ada katalog produk spesifik yang diminta. Jawab pertanyaan seputar MyBasic secara ramah dan solutif)."}`;

    const messagesPayload = [
      { role: "system", content: systemPrompt },
      ...history,
      { role: "user", content: message }
    ];

    const candidateModels = [
      process.env.GROQ_MODEL || "qwen/qwen3.8-27b",
      "llama-3.3-70b-versatile",
      "llama-3.1-8b-instant"
    ];

    let lastError = null;
    for (const modelName of candidateModels) {
      try {
        const { data: completion, response } = await groq.chat.completions.create({
          model: modelName,
          messages: messagesPayload,
          max_tokens: Number(process.env.GROQ_MAX_TOKENS || 1500)
        }).withResponse();

        if (response && response.headers) {
          updateGroqQuotaFromHeaders(response.headers, modelName);
        }

        if (completion.choices && completion.choices[0] && completion.choices[0].message) {
          const rawAiReply = completion.choices[0].message.content;
          const aiReply = formatWhatsAppMessage(rawAiReply);
          if (senderId) {
            appendUserHistory(senderId, message, aiReply);
          }
          return aiReply;
        }
      } catch (err) {
        lastError = err;
        console.warn(`[Groq Model ${modelName}] Gagal: ${err.message}. Mencoba model alternatif...`);
      }
    }

    throw lastError || new Error("Semua model Groq gagal merespon.");
  } catch (error) {
    console.error("Error Groq API:", error.message || error);
    if (ragContext) {
      return formatWhatsAppMessage(`Halo! Berikut informasi produk dari etalase MyBasic Shopee kami:\n\n${ragContext}\n\nAda yang bisa kami bantu seputar produk di atas? 😊`);
    }
    return formatWhatsAppMessage(`Halo! Terima kasih telah menghubungi *MyBasic Official Store*.\n\nKami menyediakan berbagai koleksi kaos polos, oversized tee, polo, hoodie, dan celana. Ada yang bisa kami bantu hari ini? 😊`);
  }
}

// Masking Nomor Telepon
function maskPhoneNumber(rawNumber) {
  if (!rawNumber) return null;
  let formatted = String(rawNumber).replace(/^62/, "08");
  if (formatted.length >= 8) {
    const prefix = formatted.slice(0, 2);
    const suffix = formatted.slice(-4);
    const maskedLength = formatted.length - 6;
    return `${prefix}${"x".repeat(maskedLength)}${suffix}`;
  }
  return formatted;
}

// ================= API ENDPOINTS =================
// Web Chat API
app.post("/api/chat", async (req, res) => {
  try {
    const { message, history } = req.body;
    if (!message) return res.status(400).json({ error: "Pesan kosong" });
    const reply = await getAIResponse("web-guest", message);
    res.json({ reply });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Daftar Produk
app.get("/api/products", (req, res) => {
  ragEngine.loadData();
  res.json({ products: ragEngine.products });
});

// Status Bot
app.get("/api/bot/status", (req, res) => {
  let botNumber = null;
  let rawBotNumber = null;
  if (isReady && client && client.info && client.info.wid) {
    rawBotNumber = client.info.wid.user;
    botNumber = maskPhoneNumber(rawBotNumber);
  }
  res.json({
    isReady,
    isInitializing,
    isCleaning,
    hasQRCode: Boolean(qrCodeData),
    botNumber,
    rawBotNumber
  });
});

// Kuota Groq
app.get("/api/groq/quota", async (req, res) => {
  try {
    const isFresh = req.query.fresh === "true" || groqQuota.remainingRequests === null;
    if (isFresh) {
      await fetchGroqQuotaFresh();
    }
    res.json(groqQuota);
  } catch (err) {
    console.error("Error cek kuota Groq:", err);
    res.status(500).json({ error: err.message, ...groqQuota });
  }
});

// QR Code
app.get("/api/bot/qr", (req, res) => {
  res.json({ qr: qrCodeData });
});

// Start Bot
app.post("/api/bot/start", (req, res) => {
  try {
    if (isReady) return res.json({ success: true, message: "Bot sudah berjalan." });
    if (isInitializing) return res.json({ success: true, message: "Bot sedang proses inisialisasi..." });
    
    isInitializing = true;
    qrCodeData = null;
    const waClient = initializeClient();
    
    // Inisialisasi secara async di background (tidak memblokir HTTP response)
    waClient.initialize().catch(err => {
      isInitializing = false;
      qrCodeData = null;
      console.error("Gagal initialize WhatsApp Client:", err);
    });

    res.json({ success: true, message: "Inisialisasi bot dimulai. Menunggu QR Code..." });
  } catch (err) {
    isInitializing = false;
    console.error("Gagal memulai bot:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Stop Bot
app.post("/api/bot/stop", async (req, res) => {
  try {
    isCleaning = true;
    isReady = false;
    qrCodeData = null;
    if (client) await client.destroy();
    client = null;
    isCleaning = false;
    res.json({ success: true });
  } catch (err) {
    isCleaning = false;
    console.error("Gagal menghentikan bot:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Reset Sesi WhatsApp
app.post("/api/bot/reset", async (req, res) => {
  try {
    isCleaning = true;
    isReady = false;
    isInitializing = false;
    qrCodeData = null;
    if (client) {
      try { await client.destroy(); } catch (e) {}
      client = null;
    }
    const authDir = path.join(__dirname, ".wwebjs_auth");
    const cacheDir = path.join(__dirname, ".wwebjs_cache");
    try { if (fs.existsSync(authDir)) fs.rmSync(authDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 500 }); } catch (e) {}
    try { if (fs.existsSync(cacheDir)) fs.rmSync(cacheDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 500 }); } catch (e) {}
    try { if (fs.existsSync(AUTH_DIR)) fs.rmSync(AUTH_DIR, { recursive: true, force: true, maxRetries: 3, retryDelay: 500 }); } catch (e) {}
    conversationHistory.clear();
    isCleaning = false;
    res.json({ success: true, message: "Sesi WhatsApp berhasil dibersihkan." });
  } catch (err) {
    isCleaning = false;
    res.status(500).json({ success: false, error: err.message });
  }
});

// Basis Pengetahuan
app.get("/api/knowledge", (req, res) => {
  loadKnowledge();
  res.json(knowledge);
});

// Jalankan Server
const server = app.listen(PORT, () => {
  console.log(`Server berjalan di http://localhost:${PORT}`);
  if (process.env.AUTO_START_BOT === "true") {
    console.log("AUTO_START_BOT aktif, memulai inisialisasi bot WhatsApp...");
    isInitializing = true;
    const waClient = initializeClient();
    waClient.initialize().catch(err => {
      isInitializing = false;
      console.error("Auto start gagal:", err);
    });
  }
});

async function gracefulShutdown(signal) {
  console.log(`\nMenerima sinyal ${signal}, membersihkan proses...`);
  if (client) {
    try { await client.destroy(); } catch (e) {}
  }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000);
}

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

// Mencegah server crash jika terjadi error navigasi internal WhatsApp Web / Puppeteer
process.on("unhandledRejection", (reason) => {
  console.warn("[Bot Warning] Unhandled Rejection diabaikan:", reason?.message || reason);
});
process.on("uncaughtException", (err) => {
  console.warn("[Bot Warning] Uncaught Exception ditangkap:", err?.message || err);
});
