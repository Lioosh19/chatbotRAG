const Groq = require("groq-sdk");
const path = require("path");
const fs = require("fs");
const RAGEngine = require("../lib/rag");

// Load Knowledge Base
let knowledge = { keywords: {}, responses: {} };
try {
  const KNOWLEDGE_PATH = path.join(process.cwd(), "knowledge.json");
  if (fs.existsSync(KNOWLEDGE_PATH)) {
    knowledge = JSON.parse(fs.readFileSync(KNOWLEDGE_PATH, "utf-8"));
  }
} catch (e) {
  console.error("Gagal load knowledge.json:", e);
}

// Inisialisasi RAGEngine
const ragEngine = new RAGEngine();

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
    const productKeywords = ["produk", "harga", "katalog", "jual", "beli", "kaos", "baju", "tshirt", "polo", "longsleeve", "boxy", "fitted", "oversize", "oversized", "size", "bahan"];
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

// Deteksi apakah pertanyaan menanyakan produk atau pertanyaan kompleks
function isProductOrComplexQuery(text) {
  const q = text.toLowerCase().trim();
  // Kata kunci produk atau indikator pertanyaan jamak
  const indicators = [
    "kaos", "baju", "tshirt", "tee", "polo", "longsleeve", "boxy", "fitted", "oversize",
    "oversized", "singlet", "celana", "harga", "katalog", "rekomendasi", "ada apa",
    "apa saja", "apa aja", "dan", "serta", "kain", "bahan"
  ];
  return indicators.some(ind => q.includes(ind));
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Credentials", true);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS,PATCH,DELETE,POST,PUT");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version"
  );

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  const { message, history = [] } = req.body || {};
  if (!message) {
    return res.status(400).json({ error: "Pesan tidak boleh kosong." });
  }

  const normalized = message.toLowerCase().trim();

  // 1. Template Sapaan Murni
  if (isGreetingMessage(normalized)) {
    return res.json({
      reply: "Halo! Selamat datang di *MyBasic Official Store* di Shopee. \n\nAda yang bisa kami bantu seputar koleksi kaos polos, boxy tee, oversized, polo shirt, atau info bahan hari ini? 😊",
      source: "template_greeting"
    });
  }

  // 2. Template Terima Kasih
  if (isGratitudeMessage(normalized)) {
    return res.json({
      reply: "Sama-sama! Senang bisa membantu Anda di *MyBasic Official Store*. \n\nSilakan kunjungi etalase Shopee kami untuk klaim voucher gratis ongkir atau chat admin via WhatsApp jika butuh bantuan order ya!",
      source: "template_gratitude"
    });
  }

  // 3. Deteksi Pertanyaan Operasional Toko (Cara Pesan, Pengiriman, Retur/Garansi, Lokasi, Jam Buka, Kontak)
  const asksShipping = normalized.includes("kirim") || normalized.includes("pengiriman") || normalized.includes("ongkir") || normalized.includes("ekspedisi") || normalized.includes("sampai");
  const asksReturn = normalized.includes("retur") || normalized.includes("garansi") || normalized.includes("tukar") || normalized.includes("rusak") || normalized.includes("cacat");
  const asksOrder = normalized.includes("pesan") || normalized.includes("order") || normalized.includes("beli") || normalized.includes("checkout") || normalized.includes("cara");
  const asksStoreHours = normalized.includes("jam buka") || normalized.includes("operasional") || normalized.includes("buka jam") || normalized.includes("jadwal");
  const asksLocation = normalized.includes("alamat") || normalized.includes("lokasi") || normalized.includes("gudang") || normalized.includes("daerah");

  const productSpecificTerms = ["kaos", "baju", "tshirt", "polo", "longsleeve", "boxy", "fitted", "oversize", "oversized", "singlet", "celana", "chino", "cargo"];
  const mentionsSpecificProduct = productSpecificTerms.some(t => normalized.includes(t));

  // Jika menanyakan operasional secara langsung dan tidak menyebut produk spesifik
  if ((asksShipping || asksReturn || asksOrder || asksStoreHours || asksLocation) && !mentionsSpecificProduct) {
    let parts = [];
    if (asksOrder && knowledge.responses["cara pesan"]) parts.push("🛒 *Cara Pemesanan:*\n" + knowledge.responses["cara pesan"]);
    if (asksShipping && knowledge.responses["pengiriman"]) parts.push("🚚 *Ketentuan Pengiriman:*\n" + knowledge.responses["pengiriman"]);
    if (asksReturn && knowledge.responses["garansi"]) parts.push("🛡️ *Garansi & Kebijakan Retur:*\n" + knowledge.responses["garansi"]);
    if (asksStoreHours && knowledge.responses["jam buka"]) parts.push("⏰ *Jam Operasional:*\n" + knowledge.responses["jam buka"]);
    if (asksLocation && knowledge.responses["alamat"]) parts.push("📍 *Lokasi & Gudang:*\n" + knowledge.responses["alamat"]);
    
    if (parts.length > 0) {
      return res.json({
        reply: formatWhatsAppMessage(parts.join("\n\n")),
        source: "knowledge_operational"
      });
    }
  }

  // 4. Cek FAQ statis HANYA jika pertanyaan BUKAN menanyakan produk atau pertanyaan ganda/kompleks
  if (!isProductOrComplexQuery(normalized)) {
    if (knowledge.responses && knowledge.responses[normalized]) {
      return res.json({
        reply: formatWhatsAppMessage(knowledge.responses[normalized]),
        source: "knowledge_faq"
      });
    }

    if (knowledge.keywords) {
      for (const [kw, targetKey] of Object.entries(knowledge.keywords)) {
        const escapedKw = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const wordRegex = new RegExp(`(^|\\s)${escapedKw}(\\s|$)`, "i");
        if (wordRegex.test(normalized)) {
          if (knowledge.responses && knowledge.responses[targetKey]) {
            return res.json({
              reply: formatWhatsAppMessage(knowledge.responses[targetKey]),
              source: "knowledge_keyword"
            });
          }
        }
      }
    }
  }

  // 4. RAG Context dari data crawling Shopee
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

  // 5. Groq LLM Response
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey || apiKey === "isi_api_key_groq_kalian_disini") {
    if (ragContext) {
      return res.json({
        reply: formatWhatsAppMessage(`Halo! Berikut informasi produk dari katalog resmi MyBasic Shopee:\n\n${ragContext}\n\nAda yang ingin ditanyakan lagi seputar produk di atas?`),
        source: "rag_fallback_offline"
      });
    }
    const waContact = process.env.STORE_WA_NUMBER ? `(${process.env.STORE_WA_NUMBER})` : "";
    return res.json({
      reply: `Halo! Saat ini sistem chatbot sedang dalam mode offline. Silakan hubungi admin via WhatsApp ${waContact} atau kunjungi etalase Shopee kami: https://shopee.co.id/mybasic`,
      source: "offline"
    });
  }

  try {
    const groq = new Groq({ apiKey });
    const storeName = process.env.STORE_NAME || "MyBasic Official Store";

    const systemPrompt = `Anda adalah asisten konsultan resmi dari "${storeName}" di platform Shopee. Jawab dalam Bahasa Indonesia yang ramah, hangat, gaul sopan (casual friendly), to-the-point, informatif, dan sangat rapi.

PENGETAHUAN PRODUK, BAHAN & SIZE CHART TOKO (RESMI MYBASIC):
1. Karakteristik & Jenis Bahan MyBasic:
 - Cotton Combed 20s (Heavyweight 200 GSM++): Karakter bahan tebal, kokoh, serat padat, tidak menerawang, sangat awet (digunakan pada Boxy Tee & Oversized T-Shirt).
 - Cotton Combed 24s (200 GSM): Ketebalan pas standar distro, adem menyerap keringat, nyaman untuk penggunaan harian.
 - Cotton Combed 30s (Soft Touch): Bahan katun lebih tipis, jatuh di badan, ekstra lembut di kulit.
 - Airy BreezeWear (Quick Dry Tech): Teknologi kain cepat kering, anti-kusut, sejuk dan ringan untuk cuaca panas atau olahraga gym.
 - Cotton Pique & Danbowl DoubleLock 300 GSM: Kain berpori halus rajut anti melar khusus seri Polo Shirt premium.

2. Panduan Ukuran (Size Chart Standar MyBasic):
 - S: Lebar 48 cm, Panjang 68 cm
 - M: Lebar 52 cm, Panjang 70 cm
 - L: Lebar 56 cm, Panjang 73 cm
 - XL: Lebar 60 cm, Panjang 76 cm
 - XXL: Lebar 64 cm, Panjang 78 cm
 - 3XL: Lebar 68 cm, Panjang 80 cm
 *(Toleransi 1-2 cm. Untuk gaya santai/oversized disarankan naik 1 size).*

3. Menjawab Pertanyaan Pengguna:
 - Jika pengguna menanyakan "Ada kaos oversized apa saja dan berapa harganya?", SEBUTKAN daftar produk oversized/boxy dari Konteks Katalog di bawah lengkap dengan harga dan deskripsinya. JANGAN MENJAWAB HANYA SIZE CHART!
 - Jika pengguna menanyakan bahan DAN ukuran sekaligus, JELASKAN KEDUANYA secara lengkap dan terstruktur.
 - Gunakan format WhatsApp: cetak tebal dengan satu bintang (*teks tebal*).
 - Gunakan bullet point (•) untuk mendaftar produk atau poin spesifikasi.
 - Jangan pernah menyebut istilah internal sistem seperti "file CSV", "prompt", atau "hasil crawling".
 - Arahkan untuk checkout di Shopee atau chat WhatsApp ke admin toko.

${ragContext ? ragContext : "Konteks Katalog: (Tidak ada katalog spesifik yang diminta. Jawab pertanyaan pengguna mengenai MyBasic dengan lengkap, ramah, dan solutif)."}`;

    const formattedHistory = history.slice(-6);
    const messagesPayload = [
      { role: "system", content: systemPrompt },
      ...formattedHistory,
      { role: "user", content: message }
    ];

    const candidateModels = [
      process.env.GROQ_MODEL || "qwen/qwen3.8-27b",
      "llama-3.3-70b-versatile",
      "llama-3.1-8b-instant"
    ];

    let aiReply = null;
    let lastErr = null;
    for (const model of candidateModels) {
      try {
        const completion = await groq.chat.completions.create({
          model,
          messages: messagesPayload,
          max_tokens: Number(process.env.GROQ_MAX_TOKENS || 1500)
        });
        if (completion.choices && completion.choices[0] && completion.choices[0].message) {
          aiReply = formatWhatsAppMessage(completion.choices[0].message.content);
          break;
        }
      } catch (err) {
        lastErr = err;
      }
    }

    if (!aiReply) {
      throw lastErr || new Error("Semua model Groq gagal.");
    }

    return res.json({ reply: aiReply, source: "groq_rag" });
  } catch (err) {
    console.error("Groq error:", err);
    if (ragContext) {
      return res.json({
        reply: formatWhatsAppMessage(`Halo! Berikut informasi produk dari etalase MyBasic Shopee:\n\n${ragContext}\n\nAda yang ingin ditanyakan lagi?`),
        source: "rag_fallback_on_error"
      });
    }
    return res.status(500).json({
      error: "Gagal memproses AI.",
      reply: "Mohon maaf, sistem AI kami sedang sibuk. Silakan coba kembali sesaat lagi atau hubungi via WhatsApp admin toko."
    });
  }
};
