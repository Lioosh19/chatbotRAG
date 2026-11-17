const fs = require("fs");
const path = require("path");

function parseCSVLine(line) {
  const result = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      result.push(cur.trim());
      cur = "";
    } else {
      cur += char;
    }
  }
  result.push(cur.trim());
  return result;
}

class RAGEngine {
  constructor(csvPath, options = {}) {
    const defaultCrawling = path.join(__dirname, "../data/crawling_mybasic.csv");
    const defaultProducts = path.join(__dirname, "../data/products.csv");
    
    if (csvPath && fs.existsSync(csvPath)) {
      this.csvPath = csvPath;
    } else if (fs.existsSync(defaultCrawling)) {
      this.csvPath = defaultCrawling;
    } else if (fs.existsSync(defaultProducts)) {
      this.csvPath = defaultProducts;
    } else {
      this.csvPath = defaultCrawling;
    }

    this.topK = options.topK || Number(process.env.RAG_TOP_K || 8);
    this.products = [];
    this.loadData();
  }

  loadData() {
    try {
      if (!fs.existsSync(this.csvPath)) {
        const altPath = path.join(__dirname, "../data/crawling_mybasic.csv");
        if (fs.existsSync(altPath)) {
          this.csvPath = altPath;
        } else {
          console.warn(`[RAG] File CSV tidak ditemukan di: ${this.csvPath}`);
          this.products = [];
          return;
        }
      }

      const content = fs.readFileSync(this.csvPath, "utf-8");
      const lines = content.trim().split(/\r?\n/);
      if (lines.length < 2) {
        this.products = [];
        return;
      }

      const headerRow = parseCSVLine(lines[0]).map(h => h.replace(/^"|"$/g, "").toLowerCase().trim());
      const isCrawlingFormat = headerRow.includes("whitespace-normal") || headerRow.includes("contents href");

      if (isCrawlingFormat) {
        const urlIdx = headerRow.findIndex(h => h.includes("contents href"));
        const imgIdx = headerRow.findIndex(h => h.includes("image"));
        const nameIdx = headerRow.findIndex(h => h.includes("whitespace-normal"));
        const priceIdx = headerRow.findIndex(h => h.includes("font-medium"));
        const desc1Idx = headerRow.findIndex(h => h === "min-w-0");
        const desc2Idx = headerRow.findIndex(h => h === "min-w-0 2");
        const ratingIdx = headerRow.findIndex(h => h.includes("inline-block"));
        const soldIdx = headerRow.findIndex(h => h.includes("truncate"));
        const discountIdx = headerRow.findIndex(h => h.includes("h-4"));

        this.products = lines.slice(1).filter(l => l.trim().length > 0).map(line => {
          const cols = parseCSVLine(line).map(c => c.replace(/^"|"$/g, "").trim());
          const nama = cols[nameIdx] || "";
          if (!nama) return null;

          const rawPrice = cols[priceIdx] || "0";
          const cleanNum = rawPrice.replace(/\./g, "").replace(/[^\d]/g, "");
          const hargaNum = parseInt(cleanNum, 10) || 0;

          const nLower = nama.toLowerCase();
          let kategori = "Kaos";
          if (nLower.includes("polo")) kategori = "Polo";
          else if (nLower.includes("longsleeve") || nLower.includes("lengan panjang")) kategori = "Longsleeve";
          else if (nLower.includes("sleeveless") || nLower.includes("singlet") || nLower.includes("tank top")) kategori = "Singlet";
          else if (nLower.includes("hoodie") || nLower.includes("crewneck") || nLower.includes("sweater")) kategori = "Jaket & Hoodie";
          else if (nLower.includes("celana") || nLower.includes("chino") || nLower.includes("cargo") || nLower.includes("pants")) kategori = "Celana";
          else if (nLower.includes("boxy")) kategori = "Boxy Tee";
          else if (nLower.includes("oversize") || nLower.includes("oversized")) kategori = "Oversized";
          else if (nLower.includes("fitted")) kategori = "Fitted Tee";

          const descParts = [cols[desc1Idx], cols[desc2Idx], cols[soldIdx]].filter(Boolean);
          const deskripsi = descParts.length > 0 ? descParts.join(" • ") : "Produk resmi MyBasic bahan katun berkualitas tinggi";

          return {
            nama,
            kategori,
            harga: hargaNum,
            deskripsi,
            shopee_url: cols[urlIdx] || "https://shopee.co.id/mybasic",
            image_url: cols[imgIdx] || "",
            rating: cols[ratingIdx] || "4.9",
            terjual: cols[soldIdx] || "",
            diskon: cols[discountIdx] || ""
          };
        }).filter(Boolean);
      } else {
        this.products = lines.slice(1).filter(line => line.trim().length > 0).map(line => {
          const cols = parseCSVLine(line).map(c => c.replace(/^"|"$/g, "").trim());
          const row = {};
          headerRow.forEach((h, idx) => {
            row[h] = cols[idx] || "";
          });
          row.harga = parseInt(String(row.harga).replace(/\./g, "").replace(/[^\d]/g, ""), 10) || 0;
          return row;
        });
      }

      console.log(`[RAG] Berhasil memuat ${this.products.length} produk MyBasic dari CSV`);
    } catch (err) {
      console.error("[RAG] Gagal memuat data CSV:", err);
      this.products = [];
    }
  }

  formatCurrency(numStr) {
    const num = Number(numStr);
    if (isNaN(num)) return numStr;
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0
    }).format(num);
  }

  isGreetingQuery(query) {
    if (!query) return false;
    const q = query.toLowerCase().trim();
    const greetings = [
      "halo", "hai", "hi", "hey", "hello", "p", "ping", "test",
      "pagi", "selamat pagi", "siang", "selamat siang", "sore", "selamat sore",
      "malam", "selamat malam", "assalamualaikum", "assalamu'alaikum",
      "assalamu alaikum", "permisi"
    ];
    if (greetings.includes(q)) return true;

    if (/^(halo|hai|hi|hey|hello|selamat\s+(pagi|siang|sore|malam)|assalamu\s*alaikum)\b/i.test(q)) {
      const productKeywords = ["produk", "harga", "katalog", "jual", "beli", "kaos", "baju", "tshirt", "polo", "longsleeve", "hoodie", "celana", "fitted", "boxy", "oversize", "size", "bahan"];
      return !productKeywords.some(pk => q.includes(pk));
    }
    return false;
  }

  isAllProductsQuery(query) {
    if (!query) return false;
    const q = query.toLowerCase().trim();

    const specificTerms = ["kaos", "baju", "polo", "longsleeve", "boxy", "fitted", "oversize", "singlet", "harga", "ukuran", "size", "bahan", "promo", "rekomendasi"];
    if (specificTerms.some(term => q.includes(term))) {
      return false;
    }

    const allPatterns = [
      /^semua(\s+produk(nya)?)?$/,
      /^(apa|ada)\s+(aja|saja)(\s+produk(nya)?)?$/,
      /^produk\s+(apa|ada)\s+(aja|saja)$/,
      /^katalog(\s+produk)?$/,
      /^daftar\s+produk$/,
      /^list\s+produk$/,
      /^koleksi(\s+lengkap)?$/,
      /^semuanya$/,
      /^jelasin\s+produk(nya)?$/,
      /^daftar\s+harga$/
    ];
    return allPatterns.some(pattern => pattern.test(q)) || q === "semua produk" || q === "katalog lengkap";
  }

  // Cari produk relevan berdasarkan kata kunci
  search(query, k = this.topK) {
    if (!query || this.products.length === 0) return [];
    const normalized = query.toLowerCase().trim();

    if (this.isGreetingQuery(normalized)) {
      return [];
    }

    // Jika pengguna hanya menanyakan operasional (pengiriman, cara pesan, retur, garansi, dsb.) TANPA menyebut produk pakaian
    const operationalTerms = ["pengiriman", "kirim", "ongkir", "retur", "garansi", "tukar", "cara pesan", "cara order", "cara beli", "alamat", "lokasi", "jam buka", "kontak", "admin"];
    const productSpecificTerms = ["kaos", "baju", "tshirt", "polo", "longsleeve", "boxy", "fitted", "oversize", "oversized", "singlet", "celana", "chino", "cargo", "waffle", "crop", "ringer"];
    
    const asksOperation = operationalTerms.some(t => normalized.includes(t));
    const asksProduct = productSpecificTerms.some(t => normalized.includes(t));

    // Jika murni menanyakan operasional/pengiriman/retur, JANGAN tampilkan katalog produk!
    if (asksOperation && !asksProduct) {
      return [];
    }

    if (this.isAllProductsQuery(normalized)) {
      return this.products.slice(0, 10);
    }

    const categoryAliases = {
      polo: ["polo", "kerah"],
      longsleeve: ["longsleeve", "lengan panjang"],
      "boxy tee": ["boxy", "crop"],
      oversized: ["oversize", "oversized"],
      "fitted tee": ["fitted", "ringer"],
      singlet: ["singlet", "sleeveless", "tank top", "gym"],
      kaos: ["kaos", "tshirt", "t-shirt", "baju", "tee", "henley", "waffle", "reguler", "regular"]
    };

    let matchedCategory = null;
    for (const [catName, aliases] of Object.entries(categoryAliases)) {
      if (aliases.some(alias => normalized.includes(alias))) {
        matchedCategory = catName;
        break;
      }
    }

    // Stopwords umum bahasa Indonesia yang tidak boleh dianggap sebagai pencarian produk
    const stopWords = new Set([
      "dan", "yang", "untuk", "dari", "pada", "dengan", "apa", "ada", "bisa", "berapa",
      "bagaimana", "atau", "saya", "kami", "kamu", "anda", "katalog", "daftar", "list",
      "semua", "koleksi", "produk", "jual", "beli", "pesan", "order", "kirim", "pengiriman",
      "retur", "garansi", "tukar", "size", "ukuran", "alamat", "lokasi", "kontak", "admin", "toko",
      "lama", "pengirimannya", "kapan", "sampai", "apakah", "gimana", "mohon", "tolong", "ready", "stok"
    ]);

    const queryTokens = normalized
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter(t => t.length > 2 && !stopWords.has(t));

    // PENTING: Jika tidak ada kategori yang cocok DAN tidak ada token kata kunci produk, kembalikan KOSONG!
    if (!matchedCategory && queryTokens.length === 0) {
      return [];
    }

    let candidateProducts = this.products;
    if (matchedCategory) {
      candidateProducts = this.products.filter(p => p.kategori && p.kategori.toLowerCase().includes(matchedCategory));
    }

    if (queryTokens.length === 0) {
      return candidateProducts.slice(0, k);
    }

    const scored = candidateProducts.map(p => {
      let score = 0;
      const searchableText = `${p.nama} ${p.kategori} ${p.deskripsi} ${p.harga}`.toLowerCase();
      for (const token of queryTokens) {
        if (p.nama && p.nama.toLowerCase().includes(token)) score += 8;
        if (p.kategori && p.kategori.toLowerCase().includes(token)) score += 5;
        if (p.deskripsi && p.deskripsi.toLowerCase().includes(token)) score += 3;
        if (searchableText.includes(token)) score += 1;
      }
      return { product: p, score };
    })
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score);

    if (scored.length > 0) {
      return scored.slice(0, k).map(item => item.product);
    }

    if (matchedCategory && candidateProducts.length > 0) {
      return candidateProducts.slice(0, k);
    }

    return [];
  }

  buildContext(query) {
    const relevantProducts = this.search(query);
    if (!relevantProducts || relevantProducts.length === 0) return "";

    const grouped = {};
    for (const p of relevantProducts) {
      const cat = p.kategori || "Lainnya";
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(p);
    }

    let output = "Daftar Katalog Produk Resmi Lapak MyBasic Shopee:\n";
    for (const [category, items] of Object.entries(grouped)) {
      output += `\n[Kategori: ${category}]\n`;
      items.forEach(p => {
        const hargaFmt = this.formatCurrency(p.harga);
        output += `• ${p.nama} - Harga: ${hargaFmt}\n  Deskripsi/Spesifikasi: ${p.deskripsi}\n`;
        if (p.shopee_url) {
          output += `  Link Produk Shopee: ${p.shopee_url}\n`;
        }
      });
    }
    return output.trim();
  }
}

module.exports = RAGEngine;
