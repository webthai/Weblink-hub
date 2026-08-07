/* ============================================================
 *  LINK HUB - Frontend logic
 *  - เรียก Apps Script Web App เป็น "database" ผ่าน fetch
 *  - โหลดข้อมูลครั้งแรกด้วย action เดียว (bootstrap) เพื่อความเร็ว
 *  - login แบบ hash รหัสผ่านด้วย SHA-256 ก่อนส่งเสมอ ไม่ส่ง plaintext
 *  - รองรับ: คัดลอกลิงก์, dark mode, ปักหมุด/ลากจัดลำดับเอง (admin)
 * ============================================================ */

// ⚠️ ตั้งค่าตรงนี้ครั้งเดียว: ใส่ Web App URL ที่ได้จากการ Deploy Google Apps Script
const DEFAULT_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwIAMF5fQgpstdLaDzNit6Ixd0VZ2squ4SFwRqH6HnKkxo6-LBAM1kUNOFkkwbZn5LN/exec";

const STORAGE_KEYS = {
  scriptUrl: "linkhub_script_url",
  token: "linkhub_token",
  user: "linkhub_user",
  theme: "linkhub_theme"
};

let SCRIPT_URL = resolveScriptUrl_();
let currentToken = localStorage.getItem(STORAGE_KEYS.token) || null;
let currentUser = safeParse_(localStorage.getItem(STORAGE_KEYS.user));
let allLinks = [];
let searchQuery = "";

// ===================== INIT =====================
document.addEventListener("DOMContentLoaded", () => {
  bindStaticEvents_();
  syncThemeButton_();
  if (!SCRIPT_URL || SCRIPT_URL.indexOf("PASTE_YOUR_WEB_APP_URL_HERE") !== -1) {
    showConfigModal_();
    return;
  }
  bootstrap_();
});

function resolveScriptUrl_() {
  const saved = localStorage.getItem(STORAGE_KEYS.scriptUrl);
  if (saved) return saved;
  if (DEFAULT_SCRIPT_URL && DEFAULT_SCRIPT_URL.indexOf("PASTE_YOUR_WEB_APP_URL_HERE") === -1) {
    return DEFAULT_SCRIPT_URL;
  }
  return "";
}

function safeParse_(str) {
  try { return str ? JSON.parse(str) : null; } catch (e) { return null; }
}

// ===================== API CALL =====================
async function apiCall(action, payload) {
  const body = Object.assign({ action }, payload || {});
  if (currentToken) body.token = currentToken;

  const res = await fetch(SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error("Network error: " + res.status);
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "Unknown error");
  return data;
}

// ===================== SHA-256 (client-side hashing) =====================
async function sha256Hex(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

// ===================== BOOTSTRAP =====================
async function bootstrap_() {
  setLoading_(true);
  try {
    const data = await apiCall("bootstrap", {});
    allLinks = data.links || [];
    if (data.user) {
      currentUser = data.user;
      localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(currentUser));
    } else {
      currentUser = null;
      currentToken = null;
      localStorage.removeItem(STORAGE_KEYS.token);
      localStorage.removeItem(STORAGE_KEYS.user);
    }
    renderAll_();
  } catch (err) {
    console.error(err);
    document.getElementById("loadingState").innerHTML =
      "โหลดข้อมูลไม่สำเร็จ: " + err.message;
  } finally {
    setLoading_(false);
  }
}

function setLoading_(isLoading) {
  document.getElementById("loadingState").classList.toggle("hidden", !isLoading);
}

// ===================== THEME (dark mode) =====================
function syncThemeButton_() {
  const theme = document.documentElement.getAttribute("data-theme") || "light";
  const btn = document.getElementById("themeToggleBtn");
  if (btn) btn.textContent = theme === "dark" ? "☀️" : "🌙";
}

function toggleTheme_() {
  const current = document.documentElement.getAttribute("data-theme") || "light";
  const next = current === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem(STORAGE_KEYS.theme, next);
  syncThemeButton_();
}

// ===================== TOAST =====================
let toastTimer_ = null;
function showToast_(message) {
  let toast = document.getElementById("toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "toast";
    toast.className = "toast";
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer_);
  toastTimer_ = setTimeout(() => toast.classList.remove("show"), 1800);
}

async function copyToClipboard_(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    showToast_("คัดลอกลิงก์แล้ว ✅");
  } catch (err) {
    showToast_("คัดลอกไม่สำเร็จ ❌");
  }
}

// ===================== RENDER =====================
function renderAll_() {
  renderAuthUI_();
  renderLinks_();
}

function renderAuthUI_() {
  const loginBtn = document.getElementById("loginBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  const userBadge = document.getElementById("userBadge");
  const adminPanel = document.getElementById("adminPanel");

  if (currentUser && currentUser.role === "admin") {
    loginBtn.classList.add("hidden");
    logoutBtn.classList.remove("hidden");
    userBadge.textContent = "👤 " + currentUser.username;
    userBadge.classList.remove("hidden");
    adminPanel.classList.remove("hidden");
  } else {
    loginBtn.classList.remove("hidden");
    logoutBtn.classList.add("hidden");
    userBadge.classList.add("hidden");
    adminPanel.classList.add("hidden");
  }
}

function getFilteredLinks_() {
  if (!searchQuery) return allLinks;
  const q = searchQuery.toLowerCase();
  return allLinks.filter(link =>
    (link.title || "").toLowerCase().includes(q) ||
    (link.description || "").toLowerCase().includes(q) ||
    (link.url || "").toLowerCase().includes(q)
  );
}

function renderLinks_() {
  const pinnedSection = document.getElementById("pinnedSection");
  const pinnedGrid = document.getElementById("pinnedGrid");
  const grid = document.getElementById("linksGrid");
  const emptyState = document.getElementById("emptyState");
  const linkCount = document.getElementById("linkCount");
  const lastUpdated = document.getElementById("lastUpdated");

  pinnedGrid.innerHTML = "";
  grid.innerHTML = "";

  const filtered = getFilteredLinks_();
  const pinned = filtered.filter(l => l.pinned);
  const unpinned = filtered.filter(l => !l.pinned);

  linkCount.textContent = allLinks.length ? `${filtered.length} / ${allLinks.length} ลิงก์` : "";
  emptyState.classList.toggle("hidden", filtered.length !== 0);
  emptyState.textContent = allLinks.length === 0
    ? "ยังไม่มีลิงก์ในระบบ"
    : "ไม่พบลิงก์ที่ตรงกับคำค้นหา";

  const isAdmin = !!(currentUser && currentUser.role === "admin");

  pinnedSection.classList.toggle("hidden", pinned.length === 0);
  pinned.forEach(link => pinnedGrid.appendChild(buildLinkCard_(link, isAdmin)));
  unpinned.forEach(link => grid.appendChild(buildLinkCard_(link, isAdmin)));

  if (isAdmin) {
    enableDragAndDrop_(pinnedGrid);
    enableDragAndDrop_(grid);
  }

  let latest = null;
  allLinks.forEach(link => {
    if (!latest || new Date(link.updatedAt) > new Date(latest)) latest = link.updatedAt;
  });
  lastUpdated.textContent = latest ? formatThaiDate_(latest) : "-";
}

function getDomain_(url) {
  try { return new URL(url).hostname; } catch (e) { return ""; }
}

function openLink_(url) {
  window.open(url, "_blank", "noopener,noreferrer");
}

function buildLinkCard_(link, isAdmin) {
  const card = document.createElement("div");
  card.className = "link-card";
  card.title = "เปิด " + link.url;
  card.dataset.id = link.id;
  card.draggable = isAdmin;
  card.addEventListener("click", () => openLink_(link.url));

  if (link.pinned) {
    const badge = document.createElement("span");
    badge.className = "pin-indicator";
    badge.textContent = "📌 ปักหมุด";
    card.appendChild(badge);
  }

  const head = document.createElement("div");
  head.className = "link-card-head";

  const favicon = document.createElement("div");
  favicon.className = "link-card-favicon";
  const domain = getDomain_(link.url);
  if (domain) {
    const img = document.createElement("img");
    img.src = `https://www.google.com/s2/favicons?sz=64&domain=${domain}`;
    img.alt = "";
    img.loading = "lazy";
    img.onerror = () => { favicon.textContent = "🔗"; };
    favicon.appendChild(img);
  } else {
    favicon.textContent = "🔗";
  }
  head.appendChild(favicon);

  const titleWrap = document.createElement("div");
  titleWrap.className = "link-card-titlewrap";

  const title = document.createElement("span");
  title.className = "link-card-title";
  title.textContent = link.title;
  titleWrap.appendChild(title);

  const urlEl = document.createElement("span");
  urlEl.className = "link-card-url";
  urlEl.textContent = domain || link.url;
  titleWrap.appendChild(urlEl);

  head.appendChild(titleWrap);

  const copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.className = "link-card-iconbtn link-card-copy";
  copyBtn.title = "คัดลอกลิงก์";
  copyBtn.textContent = "📋";
  copyBtn.onclick = (e) => { e.stopPropagation(); copyToClipboard_(link.url); };
  head.appendChild(copyBtn);

  const openIcon = document.createElement("span");
  openIcon.className = "link-card-iconbtn link-card-open";
  openIcon.textContent = "↗";
  head.appendChild(openIcon);

  card.appendChild(head);

  if (link.description) {
    const desc = document.createElement("div");
    desc.className = "link-card-desc";
    desc.textContent = link.description;
    card.appendChild(desc);
  }

  const meta = document.createElement("div");
  meta.className = "link-card-meta";
  meta.textContent = "อัปเดต: " + formatThaiDate_(link.updatedAt);
  card.appendChild(meta);

  if (isAdmin) {
    const actions = document.createElement("div");
    actions.className = "link-card-admin-actions";

    const pinBtn = document.createElement("button");
    pinBtn.className = "btn-icon";
    pinBtn.textContent = link.pinned ? "📌 เลิกปักหมุด" : "📌 ปักหมุด";
    pinBtn.onclick = (e) => { e.stopPropagation(); togglePin_(link); };

    const editBtn = document.createElement("button");
    editBtn.className = "btn-icon";
    editBtn.textContent = "✏️ แก้ไข";
    editBtn.onclick = (e) => { e.stopPropagation(); startEditLink_(link); };

    const delBtn = document.createElement("button");
    delBtn.className = "btn-icon danger";
    delBtn.textContent = "🗑️ ลบ";
    delBtn.onclick = (e) => { e.stopPropagation(); deleteLink_(link); };

    actions.appendChild(pinBtn);
    actions.appendChild(editBtn);
    actions.appendChild(delBtn);
    card.appendChild(actions);
  }

  return card;
}

function formatThaiDate_(isoString) {
  if (!isoString) return "-";
  const d = new Date(isoString);
  return d.toLocaleString("th-TH", {
    timeZone: "Asia/Bangkok",
    dateStyle: "medium",
    timeStyle: "short"
  });
}

// ===================== DRAG & DROP REORDER (admin only) =====================
function enableDragAndDrop_(grid) {
  let draggedEl = null;

  grid.querySelectorAll(".link-card").forEach(card => {
    card.addEventListener("dragstart", () => {
      draggedEl = card;
      card.classList.add("dragging");
    });
    card.addEventListener("dragend", () => {
      card.classList.remove("dragging");
      draggedEl = null;
      commitOrder_(grid);
    });
    card.addEventListener("dragover", (e) => {
      e.preventDefault();
      if (!draggedEl || draggedEl === card) return;
      const cards = [...grid.children];
      const draggedIdx = cards.indexOf(draggedEl);
      const targetIdx = cards.indexOf(card);
      if (draggedIdx < targetIdx) {
        grid.insertBefore(draggedEl, card.nextSibling);
      } else {
        grid.insertBefore(draggedEl, card);
      }
    });
  });
}

async function commitOrder_(grid) {
  const ids = [...grid.children].map(c => c.dataset.id).filter(Boolean);
  if (ids.length < 2) return;
  const orderPayload = ids.map((id, idx) => ({ id, order: idx * 10 }));
  try {
    await apiCall("reorderLinks", { order: orderPayload });
    orderPayload.forEach(({ id, order }) => {
      const link = allLinks.find(l => l.id === id);
      if (link) link.order = order;
    });
  } catch (err) {
    showToast_("จัดลำดับไม่สำเร็จ ❌");
    bootstrap_();
  }
}

async function togglePin_(link) {
  try {
    await apiCall("updateLink", { id: link.id, pinned: !link.pinned, order: -Date.now() });
    showToast_(link.pinned ? "เลิกปักหมุดแล้ว" : "ปักหมุดแล้ว 📌");
    await bootstrap_();
  } catch (err) {
    showToast_("ทำรายการไม่สำเร็จ ❌");
  }
}

// ===================== EVENTS =====================
function bindStaticEvents_() {
  document.getElementById("loginBtn").addEventListener("click", () => toggleModal_("loginModal", true));
  document.getElementById("loginModalClose").addEventListener("click", () => toggleModal_("loginModal", false));
  document.getElementById("logoutBtn").addEventListener("click", logout_);
  document.getElementById("loginForm").addEventListener("submit", handleLoginSubmit_);
  document.getElementById("linkForm").addEventListener("submit", handleLinkFormSubmit_);
  document.getElementById("linkFormCancel").addEventListener("click", resetLinkForm_);
  document.getElementById("configForm").addEventListener("submit", handleConfigSubmit_);
  document.getElementById("themeToggleBtn").addEventListener("click", toggleTheme_);
  document.getElementById("searchInput").addEventListener("input", (e) => {
    searchQuery = e.target.value.trim();
    renderLinks_();
  });
}

function toggleModal_(id, show) {
  document.getElementById(id).classList.toggle("hidden", !show);
}

function showConfigModal_() {
  toggleModal_("configModal", true);
}

async function handleConfigSubmit_(e) {
  e.preventDefault();
  const url = document.getElementById("configUrl").value.trim();
  if (!url) return;
  localStorage.setItem(STORAGE_KEYS.scriptUrl, url);
  SCRIPT_URL = url;
  toggleModal_("configModal", false);
  bootstrap_();
}

async function handleLoginSubmit_(e) {
  e.preventDefault();
  const username = document.getElementById("loginUsername").value.trim();
  const password = document.getElementById("loginPassword").value;
  const errorEl = document.getElementById("loginError");
  errorEl.classList.add("hidden");

  try {
    const passwordHash = await sha256Hex(password);
    const data = await apiCall("login", { username, passwordHash });
    currentToken = data.token;
    currentUser = data.user;
    localStorage.setItem(STORAGE_KEYS.token, currentToken);
    localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(currentUser));
    toggleModal_("loginModal", false);
    document.getElementById("loginForm").reset();
    await bootstrap_();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove("hidden");
  }
}

async function logout_() {
  try { await apiCall("logout", {}); } catch (e) { /* ignore */ }
  currentToken = null;
  currentUser = null;
  localStorage.removeItem(STORAGE_KEYS.token);
  localStorage.removeItem(STORAGE_KEYS.user);
  renderAll_();
}

function startEditLink_(link) {
  document.getElementById("linkId").value = link.id;
  document.getElementById("linkTitle").value = link.title;
  document.getElementById("linkUrl").value = link.url;
  document.getElementById("linkDesc").value = link.description || "";
  document.getElementById("linkFormSubmit").textContent = "บันทึกการแก้ไข";
  document.getElementById("linkFormCancel").classList.remove("hidden");
  document.getElementById("adminPanel").scrollIntoView({ behavior: "smooth" });
}

function resetLinkForm_() {
  document.getElementById("linkId").value = "";
  document.getElementById("linkForm").reset();
  document.getElementById("linkFormSubmit").textContent = "เพิ่มลิงก์";
  document.getElementById("linkFormCancel").classList.add("hidden");
  document.getElementById("linkFormError").classList.add("hidden");
}

async function handleLinkFormSubmit_(e) {
  e.preventDefault();
  const errorEl = document.getElementById("linkFormError");
  errorEl.classList.add("hidden");

  const id = document.getElementById("linkId").value;
  const title = document.getElementById("linkTitle").value.trim();
  const url = document.getElementById("linkUrl").value.trim();
  const description = document.getElementById("linkDesc").value.trim();

  try {
    if (id) {
      await apiCall("updateLink", { id, title, url, description });
    } else {
      await apiCall("addLink", { title, url, description });
    }
    resetLinkForm_();
    await bootstrap_();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove("hidden");
  }
}

async function deleteLink_(link) {
  if (!confirm(`ลบลิงก์ "${link.title}" ใช่หรือไม่?`)) return;
  try {
    await apiCall("deleteLink", { id: link.id });
    await bootstrap_();
  } catch (err) {
    alert("ลบไม่สำเร็จ: " + err.message);
  }
}
