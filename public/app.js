// Konfigurasi WhatsApp Toko (Dinamis: Mengikuti Nomor yang Scan QR Bot)
let STORE_WA_NUMBER = "6285779479672"; // Default fallback
const STORE_NAME = "MyBasic Official";

// Elemen DOM Katalog & Chat
const productGrid = document.getElementById("productGrid");
const filterBtns = document.querySelectorAll(".filter-btn");
const chatToggleBtn = document.getElementById("chatToggleBtn");
const chatBox = document.getElementById("chatBox");
const closeChatBtn = document.getElementById("closeChatBtn");
const openChatBtn = document.getElementById("openChatBtn");
const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");
const chatMessages = document.getElementById("chatMessages");
const heroWaBtn = document.getElementById("heroWaBtn");
const footerWaLink = document.getElementById("footerWaLink");
const quickTags = document.querySelectorAll(".quick-tag");

// Elemen DOM Gateway WhatsApp Lokal
const gatewayBanner = document.getElementById("gatewayBanner");
const statusDot = document.getElementById("statusDot");
const statusText = document.getElementById("statusText");
const botNumberBadge = document.getElementById("botNumberBadge");
const botNumberText = document.getElementById("botNumberText");
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const resetBtn = document.getElementById("resetBtn");
const qrSection = document.getElementById("qrSection");
const qrcodeContainer = document.getElementById("qrcode");
const closeQrBtn = document.getElementById("closeQrBtn");

// Elemen DOM Scroll Template Pertanyaan
const tagNavLeft = document.getElementById("tagNavLeft");
const tagNavRight = document.getElementById("tagNavRight");
const quickTagsTrack = document.getElementById("quickTagsTrack");

if (tagNavLeft && quickTagsTrack) {
  tagNavLeft.onclick = () => {
    quickTagsTrack.scrollBy({ left: -150, behavior: "smooth" });
  };
}
if (tagNavRight && quickTagsTrack) {
  tagNavRight.onclick = () => {
    quickTagsTrack.scrollBy({ left: 150, behavior: "smooth" });
  };
}
if (closeQrBtn && qrSection) {
  closeQrBtn.onclick = () => {
    qrSection.classList.add("hidden");
  };
}

let allProducts = [];
let chatHistory = [];
let currentQRCode = null;

// Format mata uang Rupiah
function formatIDR(val) {
  const num = Number(val);
  if (isNaN(num)) return val;
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0
  }).format(num);
}

// Icon emoji per kategori
function getCategoryEmoji(category) {
  const cat = (category || "").toLowerCase();
  if (cat.includes("polo")) return "👔";
  if (cat.includes("longsleeve")) return "🧥";
  if (cat.includes("singlet") || cat.includes("sleeveless")) return "🎽";
  if (cat.includes("boxy") || cat.includes("oversize")) return "👕";
  if (cat.includes("fitted")) return "👕";
  return "👕";
}

// Inisialisasi Tautan WhatsApp Global (wa.me)
function setupGlobalWaLinks() {
  const defaultText = `Halo admin ${STORE_NAME}, saya ingin konsultasi produk apparel dan menanyakan ketersediaan stok di Shopee.`;
  const waUrl = `https://wa.me/${STORE_WA_NUMBER}?text=${encodeURIComponent(defaultText)}`;
  if (heroWaBtn) heroWaBtn.href = waUrl;
  if (footerWaLink) footerWaLink.href = waUrl;
}

// Render Kartu Produk
function renderProducts(products) {
  if (!productGrid) return;
  if (!products || products.length === 0) {
    productGrid.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: #64748b;">Tidak ada produk ditemukan untuk kategori ini.</div>`;
    return;
  }

  productGrid.innerHTML = products.map(p => {
    // Tautan wa.me dengan template pesan per kategori sesuai Halaman 38
    const waMessage = `Halo ${STORE_NAME}, saya tertarik dengan produk ${p.nama} (${p.kategori}) seharga ${formatIDR(p.harga)}. Apakah produk ini masih ready di etalase Shopee?`;
    const waLink = `https://wa.me/${STORE_WA_NUMBER}?text=${encodeURIComponent(waMessage)}`;
    const shopeeLink = p.shopee_url || "https://shopee.co.id/mybasic";

    const thumbHtml = p.image_url
      ? `<img src="${p.image_url}" alt="${p.nama}" class="product-img" loading="lazy" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" /><div class="product-thumb-fallback" style="display:none; font-size:40px;">${getCategoryEmoji(p.kategori)}</div>`
      : `<div class="product-thumb-fallback" style="font-size:40px;">${getCategoryEmoji(p.kategori)}</div>`;

    const metaRow = (p.rating || p.terjual)
      ? `<div class="product-meta-row">
          ${p.rating ? `<span class="product-rating">⭐ ${p.rating}</span>` : ""}
          ${p.terjual ? `<span class="product-sold">• ${p.terjual}</span>` : ""}
          ${p.diskon ? `<span style="color:#ef4444; font-weight:700; margin-left:auto;">${p.diskon}</span>` : ""}
        </div>`
      : "";

    return `
      <div class="product-card">
        <div class="product-thumb">
          <span class="category-badge">${p.kategori || "Apparel"}</span>
          ${thumbHtml}
        </div>
        <div class="product-body">
          ${metaRow}
          <h3 class="product-name" title="${p.nama}">${p.nama}</h3>
          <div class="product-price">${formatIDR(p.harga)}</div>
          <p class="product-desc">${p.deskripsi || ""}</p>
          <div class="product-actions">
            <a href="${waLink}" target="_blank" class="btn-card-wa">
              <span>💬</span> Tanya WA
            </a>
            <a href="${shopeeLink}" target="_blank" class="btn-card-shopee">
              Beli di Shopee ↗
            </a>
          </div>
        </div>
      </div>
    `;
  }).join("");
}

// Ambil Data Produk dari API Backend / Serverless
async function fetchProducts() {
  try {
    const res = await fetch("/api/products");
    if (!res.ok) throw new Error("Gagal mengambil data produk");
    const data = await res.json();
    allProducts = data.products || [];
    renderProducts(allProducts);
  } catch (err) {
    console.warn("Gagal fetch dari API, memuat fallback:", err);
  }
}

// Filter Kategori
filterBtns.forEach(btn => {
  btn.addEventListener("click", () => {
    filterBtns.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    const cat = btn.getAttribute("data-category");
    if (cat === "all") {
      renderProducts(allProducts);
    } else {
      const filtered = allProducts.filter(p => (p.kategori || "").toLowerCase().includes(cat.toLowerCase()));
      renderProducts(filtered);
    }
  });
});

// Toggle Chat Widget
function toggleChat() {
  const wrapper = document.querySelector(".chat-widget-wrapper");
  chatBox.classList.toggle("hidden");
  wrapper.classList.toggle("active");
  if (!chatBox.classList.contains("hidden")) {
    chatInput.focus();
  }
}

chatToggleBtn.addEventListener("click", toggleChat);
closeChatBtn.addEventListener("click", toggleChat);
if (openChatBtn) openChatBtn.addEventListener("click", () => {
  if (chatBox.classList.contains("hidden")) toggleChat();
});

// Tambah Bubble Chat ke UI
function appendChatMessage(sender, text) {
  const msgEl = document.createElement("div");
  msgEl.className = `msg msg-${sender}`;
  const htmlFormatted = text.replace(/\*(.*?)\*/g, "<strong>$1</strong>");
  msgEl.innerHTML = `<div class="msg-bubble">${htmlFormatted}</div>`;
  chatMessages.appendChild(msgEl);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Kirim Pesan Chat ke API RAG (/api/chat)
async function sendChatMessage(userText) {
  if (!userText || !userText.trim()) return;
  const message = userText.trim();

  appendChatMessage("user", message);
  chatInput.value = "";

  const loadingId = "bot-loading-" + Date.now();
  const loadingEl = document.createElement("div");
  loadingEl.id = loadingId;
  loadingEl.className = "msg msg-bot";
  loadingEl.innerHTML = `<div class="msg-bubble" style="color:#888;"><em>Sedang membaca katalog MyBasic & menyusun jawaban...</em></div>`;
  chatMessages.appendChild(loadingEl);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        history: chatHistory
      })
    });

    const data = await res.json();
    const botReply = data.reply || "Maaf, tidak dapat mengambil respon saat ini.";

    const loadItem = document.getElementById(loadingId);
    if (loadItem) loadItem.remove();

    appendChatMessage("bot", botReply);

    chatHistory.push({ role: "user", content: message });
    chatHistory.push({ role: "assistant", content: botReply });
    if (chatHistory.length > 6) {
      chatHistory = chatHistory.slice(-6);
    }
  } catch (err) {
    console.error("Chat error:", err);
    const loadItem = document.getElementById(loadingId);
    if (loadItem) loadItem.remove();
    appendChatMessage("bot", "Maaf, terjadi gangguan koneksi ke server. Silakan coba kembali.");
  }
}

chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  sendChatMessage(chatInput.value);
});

// Quick Tags
quickTags.forEach(tag => {
  tag.addEventListener("click", () => {
    const msg = tag.getAttribute("data-msg");
    if (msg) sendChatMessage(msg);
  });
});

// ================= KONTROL GATEWAY WHATSAPP LOKAL =================
async function checkBotStatus() {
  try {
    const res = await fetch("/api/bot/status");
    if (!res.ok) return;
    const data = await res.json();

    if (gatewayBanner) gatewayBanner.classList.remove("hidden");

    if (data.isReady) {
      statusText.textContent = "WhatsApp Bot Aktif";
      statusDot.className = "status-dot ready";
      if (data.rawBotNumber && data.rawBotNumber !== STORE_WA_NUMBER) {
        STORE_WA_NUMBER = data.rawBotNumber;
        setupGlobalWaLinks();
        if (allProducts && allProducts.length > 0) {
          renderProducts(allProducts);
        }
      }
      if (data.botNumber) {
        botNumberText.textContent = data.botNumber;
        botNumberBadge.classList.remove("hidden");
      }
      startBtn.classList.add("hidden");
      stopBtn.classList.remove("hidden");
      qrSection.classList.add("hidden");
      currentQRCode = null;
    } else if (data.hasQRCode) {
      statusText.textContent = "Menunggu Scan QR WhatsApp...";
      statusDot.className = "status-dot waiting";
      startBtn.classList.add("hidden");
      stopBtn.classList.remove("hidden");
      qrSection.classList.remove("hidden");
      loadQRCode();
    } else if (data.isInitializing) {
      statusText.textContent = "Sedang Menyiapkan QR Code WhatsApp...";
      statusDot.className = "status-dot waiting";
      startBtn.classList.add("hidden");
      stopBtn.classList.remove("hidden");
      qrSection.classList.remove("hidden");
    } else {
      statusText.textContent = "WhatsApp Bot Offline (Siap Dijalankan)";
      statusDot.className = "status-dot";
      startBtn.classList.remove("hidden");
      stopBtn.classList.add("hidden");
      botNumberBadge.classList.add("hidden");
      currentQRCode = null;
    }
  } catch (e) {
    // Abaikan jika di Vercel
  }
}

async function loadQRCode() {
  try {
    const res = await fetch("/api/bot/qr");
    const data = await res.json();
    if (data.qr && data.qr !== currentQRCode) {
      currentQRCode = data.qr;
      if (qrcodeContainer) {
        qrcodeContainer.innerHTML = `
          <div style="background:white; padding:12px; border-radius:12px; display:inline-block; border:1px solid #e2e8f0; box-shadow:0 4px 12px rgba(0,0,0,0.06);">
            <img width="240" height="240" alt="QR Code WhatsApp" src="https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(data.qr)}">
          </div>
          <p style="font-size:12px; color:#16a34a; font-weight:700; margin-top:8px;">✓ QR Code Siap Discan! Arahkan kamera WhatsApp sekarang</p>
        `;
      }
    }
  } catch (err) {
    console.error("Gagal load QR:", err);
  }
}

if (startBtn) {
  startBtn.onclick = async () => {
    try {
      startBtn.disabled = true;
      startBtn.textContent = "Menyiapkan...";

      // Langsung buka section QR dengan indikator loading agar pengguna tahu proses sedang berjalan
      if (qrSection) qrSection.classList.remove("hidden");
      if (qrcodeContainer) {
        qrcodeContainer.innerHTML = `
          <div style="padding:24px 16px; color:#64748b; font-size:13px; background:#f8fafc; border-radius:8px; border:1px dashed #cbd5e1;">
            <div class="qr-spinner" style="margin: 0 auto 12px auto;"></div>
            <strong style="color:#0f172a; display:block; margin-bottom:4px;">Sedang Membuka Engine WhatsApp...</strong>
            <em>Menyiapkan QR Code sesi bot. Siapapun yang scan akan menjadi bot aktif. Mohon tunggu 15–30 detik ya!</em>
          </div>
        `;
      }

      await fetch("/api/bot/start", { method: "POST" });
    } catch (err) {
      alert("Gagal mengirim perintah start: " + err.message);
    } finally {
      startBtn.disabled = false;
      startBtn.textContent = "Mulai Bot & Scan QR";
      checkBotStatus();
    }
  };
}

if (stopBtn) {
  stopBtn.onclick = async () => {
    try {
      stopBtn.disabled = true;
      stopBtn.textContent = "Menghentikan...";
      await fetch("/api/bot/stop", { method: "POST" });
    } catch (err) {
      alert("Gagal menghentikan bot.");
    } finally {
      stopBtn.disabled = false;
      stopBtn.textContent = "Hentikan Bot";
      checkBotStatus();
    }
  };
}

if (resetBtn) {
  resetBtn.onclick = async () => {
    if (!confirm("Hapus sesi WhatsApp? Anda harus scan QR ulang.")) return;
    try {
      resetBtn.disabled = true;
      resetBtn.textContent = "Mereset...";
      const res = await fetch("/api/bot/reset", { method: "POST" });
      const data = await res.json();
      alert(data.message || "Sesi berhasil dibersihkan!");
    } catch (err) {
      alert("Gagal mereset sesi.");
    } finally {
      resetBtn.disabled = false;
      resetBtn.textContent = "Reset Sesi";
      checkBotStatus();
    }
  };
}

// Inisialisasi awal
setupGlobalWaLinks();
fetchProducts();
checkBotStatus();
setInterval(checkBotStatus, 4000);
