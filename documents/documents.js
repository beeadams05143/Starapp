// documents.js
import { rest, getSessionFromStorage, requireSession } from "../restClient.js?v=2025.01.09E";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../supabaseClient.js?v=2025.01.09E";
import { uploadJsonToBucket, downloadJsonFromBucket } from "../shared-storage.js?v=2025.01.09E";

// Inject CSS so visited links aren't purple, without breaking the active (black) tabs
(() => {
  const style = document.createElement("style");
  style.textContent = `
    /* Base: keep links tidy */
    .tabbtn, .tablink { text-decoration: none !important; }

    /* Normal + visited state: black text */
    .tabbtn:not(.active), .tabbtn:not(.active):visited,
    .tablink:not(.active), .tablink:not(.active):visited {
      color: #111 !important;
    }

    /* Active (selected) tab: white text on black pill */
    .tabbtn.active, .tablink.active,
    .active-link {
      color: #fff !important;
    }
  `;
  document.head.appendChild(style);
})();

(() => {
  const style = document.createElement("style");
  style.textContent = `
    .doc-links {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      align-items: center;
    }
    .doc-links .btn {
      font-size: 14px;
      padding: 8px 12px;
    }
    .doc-viewer-overlay {
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.66);
      z-index: 4000;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 18px;
    }
    .doc-viewer-overlay.open { display: flex; }
    .doc-viewer {
      background: #fff;
      border-radius: 16px;
      width: min(520px, 95vw);
      max-height: 92vh;
      display: flex;
      flex-direction: column;
      box-shadow: 0 30px 80px rgba(0,0,0,.45);
    }
    .doc-viewer-header {
      padding: 14px 18px;
      border-bottom: 1px solid rgba(148, 163, 184, 0.4);
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
    }
    .doc-viewer-title {
      font-size: 16px;
      font-weight: 600;
      margin: 0;
    }
    .doc-viewer-actions {
      display: flex;
      gap: 8px;
      align-items: center;
    }
    .doc-viewer-download {
      text-decoration: none;
      font-weight: 600;
      font-size: 14px;
      color: #2563eb;
    }
    .doc-viewer-close {
      border: none;
      background: #0f172a;
      color: #fff;
      border-radius: 999px;
      width: 34px;
      height: 34px;
      font-size: 20px;
      cursor: pointer;
    }
    .doc-viewer-content {
      padding: 18px;
      overflow: auto;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 220px;
      flex: 1;
      text-align: center;
    }
    .doc-viewer-status {
      font-size: 14px;
      color: #475569;
    }
    .doc-viewer-content img {
      max-width: 100%;
      height: auto;
      border-radius: 12px;
      box-shadow: 0 18px 38px rgba(0,0,0,.25);
    }
    .doc-viewer-content iframe {
      width: 100%;
      height: 70vh;
      border: none;
      border-radius: 12px;
      box-shadow: 0 18px 38px rgba(0,0,0,.18);
    }
    .doc-notes-overlay {
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.66);
      z-index: 4100;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 18px;
    }
    .doc-notes-overlay.open { display: flex; }
    .doc-notes-viewer {
      background: #fff;
      border-radius: 16px;
      width: min(720px, 96vw);
      max-height: 92vh;
      display: flex;
      flex-direction: column;
      box-shadow: 0 30px 80px rgba(0,0,0,.45);
    }
    .doc-notes-header {
      padding: 14px 18px;
      border-bottom: 1px solid rgba(148, 163, 184, 0.4);
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }
    .doc-notes-title {
      font-size: 16px;
      font-weight: 700;
      margin: 0;
    }
    .doc-notes-meta {
      font-size: 12px;
      color: #64748b;
    }
    .doc-notes-actions {
      display: flex;
      gap: 8px;
      align-items: center;
      flex-wrap: wrap;
    }
    .doc-notes-close {
      border: none;
      background: #0f172a;
      color: #fff;
      border-radius: 999px;
      width: 34px;
      height: 34px;
      font-size: 20px;
      cursor: pointer;
    }
    .doc-notes-body {
      padding: 18px;
      overflow: auto;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .doc-notes-card {
      border: 1px solid #e5e7eb;
      border-radius: 14px;
      padding: 12px;
      background: #f8fafc;
    }
    .doc-notes-card h4 {
      margin: 0 0 6px;
      font-size: 14px;
    }
    .doc-viewer-note {
      font-size: 13px;
      color: #475569;
      margin-top: 8px;
    }
    @media (max-width: 640px) {
      .doc-viewer {
        width: 100vw;
        height: 100vh;
        border-radius: 0;
      }
      .doc-viewer-content {
        min-height: unset;
      }
    }
  `;
  document.head.appendChild(style);
})();

const session = getSessionFromStorage();
const currentUser = session?.user || null;
if (!currentUser?.id) {
  alert("Please sign in to manage documents.");
  window.location.href = "/login.html";
  throw new Error("Not logged in.");
}
const USER_ID = currentUser.id;
const USER_NAME = currentUser.user_metadata?.full_name || currentUser.email || "Caregiver";

const SHARE_PIN_KEY = "star_docs_share_pin";
const SHARE_BASE_KEY = "star_docs_share_base";
const SHARE_EXPIRY_HOURS = 24;

function getStoredSharePin() {
  return (localStorage.getItem(SHARE_PIN_KEY) || "").trim();
}

function setStoredSharePin(pin) {
  localStorage.setItem(SHARE_PIN_KEY, pin.trim());
}

function getStoredShareBase() {
  return (localStorage.getItem(SHARE_BASE_KEY) || "").trim();
}

function setStoredShareBase(url) {
  localStorage.setItem(SHARE_BASE_KEY, url.trim());
}

async function hashPin(pin) {
  const data = new TextEncoder().encode(pin.trim());
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function ensureSharePin() {
  let pin = getStoredSharePin();
  if (!pin) {
    pin = (prompt("Set a share PIN (you can reuse this for your team):") || "").trim();
    if (!pin) throw new Error("Share PIN is required.");
    setStoredSharePin(pin);
  }
  const hash = await hashPin(pin);
  return { pin, hash };
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
const GROUP_KEY = "currentGroupId";
const SHARED_DOC_BUCKET = "documents";
const DOCS_PREFIX = "shared/docs";
const docsPathForGroup = (groupId) => `${DOCS_PREFIX}/${groupId}.json`;
let GROUP_ID = null;
let docsStore = { documents: [] };
let docsStoreLoaded = false;
let docsStorePromise = null;
const BUCKET_NOT_FOUND_RE = /bucket not found/i;

function readStoredGroupId() {
  try {
    return localStorage.getItem(GROUP_KEY) || null;
  } catch {
    return null;
  }
}

function writeStoredGroupId(value) {
  try {
    if (value) localStorage.setItem(GROUP_KEY, value);
  } catch { /* ignore */ }
}

function fallbackGroupId(userId) {
  return userId ? `solo-${userId}` : null;
}

function isBucketMissing(error) {
  if (!error) return false;
  if (typeof error === "string") return BUCKET_NOT_FOUND_RE.test(error);
  return BUCKET_NOT_FOUND_RE.test(error?.message || "");
}

function ensureAbsoluteUrl(url = "") {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  const base = (SUPABASE_URL || "").replace(/\/$/, "");
  const path = url.startsWith("/") ? url : `/${url}`;
  return `${base}${path}`;
}

function buildInlineFileMeta(file, dataUrl, reason = "bucket_missing") {
  if (!file || !dataUrl) return null;
  return {
    name: file.name || "attachment",
    type: file.type || "application/octet-stream",
    size: file.size || 0,
    data_url: dataUrl,
    uploaded_at: new Date().toISOString(),
    fallback_reason: reason,
  };
}

function normalizeAttachmentResult(result = {}) {
  return {
    storagePath: result.storagePath || null,
    inlineFile: result.inlineFile || null,
  };
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("File read failed"));
    reader.readAsDataURL(file);
  });
}

async function ensureGroupId(userId) {
  if (!userId) return null;
  let cached = readStoredGroupId();
  if (cached) return cached;
  try {
    const rows = await rest([
      "group_members?select=group_id",
      `user_id=eq.${encodeURIComponent(userId)}`,
      "order=joined_at.asc",
      "limit=1"
    ].join("&"));
    const gid = rows?.[0]?.group_id || null;
    if (gid) {
      writeStoredGroupId(gid);
      return gid;
    }
  } catch (error) {
    console.warn("group lookup failed", error?.message || error);
  }
  const fallback = fallbackGroupId(userId);
  if (fallback) writeStoredGroupId(fallback);
  return fallback;
}

const normalizeTags = (tags) => Array.isArray(tags) ? tags : (typeof tags === "string" ? tags.split(",").map(s => s.trim()).filter(Boolean) : []);

const normalizeCategoryValue = (value) => {
  if (value === null || value === undefined) return "";
  return String(value).trim().toLowerCase();
};

function mergeTags(a = [], b = []) {
  const seen = new Set();
  [...(a || []), ...(b || [])].forEach((tag) => {
    const t = (tag ?? "").toString().trim();
    if (t) seen.add(t);
  });
  return Array.from(seen);
}

function normalizeDoc(raw = {}, index = 0) {
  const content_json = raw.content_json && typeof raw.content_json === "object"
    ? raw.content_json
    : {};
  return {
    ...raw,
    id: raw.id
      || raw.doc_id
      || raw.uuid
      || content_json.id
      || raw.storage_path
      || `doc-${index + 1}-${raw.created_at || Date.now()}`,
    title: raw.title || "Untitled",
    doc_type: raw.doc_type || raw.type || "upload",
    content: raw.content || raw.description || "",
    content_json,
    tags: mergeTags(normalizeTags(raw.tags), normalizeTags(content_json.tags)),
    storage_path: raw.storage_path || raw.storagePath || content_json.storage_path || null,
    created_by: raw.created_by || raw.user_id || USER_ID,
    created_at: raw.created_at || raw.inserted_at || new Date().toISOString(),
  };
}

function normalizeDocList(list = []) {
  return (list || []).map((doc, idx) => normalizeDoc(doc, idx)).filter(Boolean);
}

function mergeDocRecords(base = {}, incoming = {}) {
  const mergedJson = { ...(base.content_json || {}), ...(incoming.content_json || {}) };
  const merged = {
    ...base,
    ...incoming,
    tags: mergeTags(base.tags, incoming.tags),
    content_json: mergedJson,
  };
  if (!merged.storage_path) merged.storage_path = incoming.storage_path || base.storage_path || null;
  if (!merged.created_at) merged.created_at = incoming.created_at || base.created_at || new Date().toISOString();
  if (!merged.created_by) merged.created_by = incoming.created_by || base.created_by || USER_ID;
  return merged;
}

function mergeDocLists(primary = [], secondary = []) {
  const map = new Map();
  const keyFor = (doc = {}) => doc.id || doc.storage_path || `${doc.title || "doc"}-${doc.created_at || ""}`;
  const add = (doc) => {
    const key = keyFor(doc);
    if (!key) return;
    const existing = map.get(key);
    map.set(key, existing ? mergeDocRecords(existing, doc) : doc);
  };
  primary.forEach(add);
  secondary.forEach(add);
  return Array.from(map.values()).sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
}

async function ensureDocsStore(forceReload = false) {
  if (docsStoreLoaded && !forceReload) return docsStore;
  if (docsStorePromise && !forceReload) return docsStorePromise;
  docsStorePromise = (async () => {
    GROUP_ID = GROUP_ID || await ensureGroupId(USER_ID);
    if (!GROUP_ID) throw new Error("Join a group to share documents.");
    const [bucketData, supabaseDocs] = await Promise.all([
      downloadJsonFromBucket(SHARED_DOC_BUCKET, docsPathForGroup(GROUP_ID)),
      fetchDocsFromSupabase(),
    ]);
    const bucketDocs = normalizeDocList(bucketData?.documents || []);
    const mergedDocs = mergeDocLists(bucketDocs, supabaseDocs);
    docsStore = {
      documents: mergedDocs,
      updated_at: bucketData?.updated_at || new Date().toISOString(),
    };
    docsStoreLoaded = true;
    const shouldPersist = !bucketData || (mergedDocs.length && mergedDocs.length !== bucketDocs.length);
    if (shouldPersist) {
      await persistDocsStore(docsStore.updated_at);
    }
    return docsStore;
  })();
  try {
    return await docsStorePromise;
  } finally {
    docsStorePromise = null;
  }
}

async function persistDocsStore(updatedAt = null) {
  if (!GROUP_ID) return;
  const payload = {
    group_id: GROUP_ID,
    updated_at: updatedAt || new Date().toISOString(),
    documents: docsStore.documents
  };
  try {
    await uploadJsonToBucket(SHARED_DOC_BUCKET, docsPathForGroup(GROUP_ID), payload);
  } catch (error) {
    console.warn("docs persist skipped", error?.message || error);
  }
}

async function fetchDocsFromSupabase() {
  try {
    const rows = await rest("documents?select=*&order=created_at.desc&limit=500");
    return normalizeDocList(rows || []);
  } catch (error) {
    console.warn("docs table load failed", error?.message || error);
    return [];
  }
}

const IMAGE_EXT_RE = /\.(png|jpe?g|gif|bmp|webp|svg|heic|heif|tiff)$/i;
const ALLOWED_DOC_MIME = new Set(["application/pdf", "image/jpeg"]);
const ALLOWED_DOC_EXT_RE = /\.(pdf|jpe?g)$/i;
function looksLikeImageMeta(meta = {}) {
  if (!meta) return false;
  const type = meta.type || "";
  if (type && /^image\//i.test(type)) return true;
  const source = (meta.name || meta.path || meta.url || "").split("?")[0].toLowerCase();
  if (!source) return false;
  return IMAGE_EXT_RE.test(source);
}

const PDF_EXT_RE = /\.pdf$/i;
function looksLikePdfMeta(meta = {}) {
  if (!meta) return false;
  const type = meta.type || "";
  if (type && /pdf$/i.test(type)) return true;
  const source = (meta.name || meta.path || meta.url || "").split("?")[0].toLowerCase();
  if (!source) return false;
  return PDF_EXT_RE.test(source);
}

function isAllowedDocFile(file) {
  if (!file) return true;
  if (ALLOWED_DOC_MIME.has(file.type)) return true;
  const name = file.name || "";
  return ALLOWED_DOC_EXT_RE.test(name);
}

function detectPreviewType(meta = {}) {
  if (looksLikeImageMeta(meta)) return "image";
  if (looksLikePdfMeta(meta)) return "pdf";
  return null;
}

function inferPreviewTypeFromContentType(contentType = "") {
  const ct = (contentType || "").toLowerCase();
  if (!ct) return null;
  if (ct.includes("pdf")) return "pdf";
  if (ct.startsWith("image/")) return "image";
  return null;
}

function inferPreviewTypeFromDataUrl(dataUrl = "") {
  const match = /^data:([^;]+)/i.exec(dataUrl || "");
  return match ? inferPreviewTypeFromContentType(match[1]) : null;
}

async function fetchPrivateBlob(storagePath) {
  const session = await requireSession();
  const token = session?.access_token;
  if (!token) throw new Error("Not logged in.");
  const safePath = encodeURIComponent(normalizeStoragePath(storagePath)).replace(/%2F/g, "/");
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/documents/${safePath}`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) throw new Error("Private file fetch failed");
  const blob = await res.blob();
  return { blob, type: blob.type || "" };
}

async function attachImagePreview(card, doc, docId, previewType, inlineFile) {
  if (!card || !doc) return;
  let canPreview = previewType === "image";
  const previewBtn = document.createElement("button");
  previewBtn.type = "button";
  previewBtn.className = "doc-attachment-preview doc-attachment-action";
  previewBtn.dataset.docId = docId;
  previewBtn.dataset.action = "view";
  previewBtn.dataset.previewType = canPreview ? "image" : "";
  previewBtn.setAttribute("aria-label", `View attachment for ${doc.title}`);
  previewBtn.innerHTML = `
    <span class="preview-label">Attachment preview</span>
    <span class="preview-status">Loading image…</span>
  `;

  const img = document.createElement("img");
  img.alt = `${doc.title} attachment`;
  img.loading = "lazy";
  img.decoding = "async";
  previewBtn.appendChild(img);
  card.appendChild(previewBtn);

  let url = inlineFile?.data_url || "";
  let revokeUrl = "";
  if (!url && doc.storage_path) {
    try {
      url = await getSignedUrlForDoc(doc);
    } catch (error) {
      console.warn("preview url failed", error?.message || error);
    }
  }
  if (!url && doc.storage_path) {
    try {
      const blob = await fetchPrivateBlob(doc.storage_path);
      if (blob?.blob) {
        url = URL.createObjectURL(blob.blob);
        revokeUrl = url;
        const inferred = inferPreviewTypeFromContentType(blob.type);
        if (inferred === "image") {
          canPreview = true;
          previewBtn.dataset.previewType = "image";
        }
      }
    } catch (error) {
      console.warn("preview blob failed", error?.message || error);
    }
  }
  if (!url) {
    previewBtn.querySelector(".preview-status").textContent = "Preview unavailable. Tap to open.";
    return;
  }
  img.addEventListener("load", () => {
    if (!canPreview) {
      previewBtn.querySelector(".preview-status").textContent = "Preview unavailable. Tap to open.";
    } else {
      previewBtn.classList.add("has-image");
    }
    if (revokeUrl) URL.revokeObjectURL(revokeUrl);
  });
  img.addEventListener("error", () => {
    previewBtn.querySelector(".preview-status").textContent = "Preview unavailable. Tap to open.";
    if (revokeUrl) URL.revokeObjectURL(revokeUrl);
  });
  img.src = url;
}

const attachmentViewer = (() => {
  let overlay = null;
  let blobUrl = null;
  function cleanupPreviewUrl() {
    if (blobUrl) {
      URL.revokeObjectURL(blobUrl);
      blobUrl = null;
    }
  }
  function ensure() {
    if (overlay) return overlay;
    overlay = document.createElement("div");
    overlay.className = "doc-viewer-overlay";
    overlay.innerHTML = `
      <div class="doc-viewer" role="dialog" aria-modal="true" aria-label="Attachment preview">
        <div class="doc-viewer-header">
          <p class="doc-viewer-title">Attachment</p>
          <div class="doc-viewer-actions">
            <a class="doc-viewer-download" href="#" target="_blank" rel="noopener">Download</a>
            <button type="button" class="doc-viewer-close" aria-label="Close attachment viewer">&times;</button>
          </div>
        </div>
        <div class="doc-viewer-content">
          <div class="doc-viewer-status">Loading…</div>
        </div>
        <div class="doc-viewer-note" hidden></div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay || event.target.closest(".doc-viewer-close")) {
        overlay.classList.remove("open");
        cleanupPreviewUrl();
      }
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        overlay?.classList.remove("open");
        cleanupPreviewUrl();
      }
    });
    return overlay;
  }
  function renderImage(contentEl, { title, url } = {}) {
    const status = document.createElement("div");
    status.className = "doc-viewer-status";
    status.textContent = "Loading preview…";
    contentEl.innerHTML = "";
    contentEl.appendChild(status);

    const img = document.createElement("img");
    img.alt = title || "Attachment";
    img.decoding = "async";
    img.loading = "lazy";
    let fallbackTimer = setTimeout(() => {
      showPreviewFallback(contentEl);
    }, 8000);
    img.addEventListener("load", () => {
      clearTimeout(fallbackTimer);
      contentEl.innerHTML = "";
      contentEl.appendChild(img);
    });
    img.addEventListener("error", () => {
      clearTimeout(fallbackTimer);
      showPreviewFallback(contentEl);
    });
    img.src = url;
  }
  function renderPdf(contentEl, { title, url } = {}) {
    const status = document.createElement("div");
    status.className = "doc-viewer-status";
    status.textContent = "Loading preview…";
    contentEl.innerHTML = "";
    contentEl.appendChild(status);

    const frame = document.createElement("iframe");
    frame.title = title || "Attachment";
    frame.loading = "lazy";

    const setFrameSrc = (src) => {
      frame.src = src;
      contentEl.innerHTML = "";
      contentEl.appendChild(frame);
    };

    fetch(url, { method: "GET" })
      .then((res) => {
        if (!res.ok) throw new Error("PDF fetch failed");
        return res.blob();
      })
      .then((blob) => {
        cleanupPreviewUrl();
        blobUrl = URL.createObjectURL(blob);
        setFrameSrc(blobUrl);
      })
      .catch(() => {
        setFrameSrc(url);
      });
  }
  function showPreviewFallback(contentEl) {
    const fallback = document.createElement("div");
    fallback.className = "doc-viewer-status";
    fallback.innerHTML = `
      Preview unavailable. This file type may not be supported here.
      <button type="button" class="btn secondary doc-viewer-open-tab">Open in new tab</button>
    `;
    contentEl.innerHTML = "";
    contentEl.appendChild(fallback);
  }
  function open({ title, url, downloadName, note, previewType = null } = {}) {
    if (!url) return;
    const wrap = ensure();
    wrap.classList.add("open");
    wrap.querySelector(".doc-viewer").focus?.();
    const titleEl = wrap.querySelector(".doc-viewer-title");
    const downloadEl = wrap.querySelector(".doc-viewer-download");
    const contentEl = wrap.querySelector(".doc-viewer-content");
    const noteEl = wrap.querySelector(".doc-viewer-note");
    cleanupPreviewUrl();
    if (typeof url === "string" && url.startsWith("blob:")) {
      blobUrl = url;
    }
    titleEl.textContent = title || "Attachment";
    downloadEl.href = url;
    if (downloadName) downloadEl.download = downloadName;
    else downloadEl.removeAttribute("download");
    if (previewType === "image") renderImage(contentEl, { title, url });
    else if (previewType === "pdf") renderPdf(contentEl, { title, url });
    else showPreviewFallback(contentEl);
    if (note) {
      noteEl.textContent = note;
      noteEl.hidden = false;
    } else {
      noteEl.hidden = true;
    }
    wrap.dataset.currentUrl = url;
  }
  function close() {
    overlay?.classList.remove("open");
    cleanupPreviewUrl();
  }
  function openCurrentInTab() {
    const url = overlay?.dataset?.currentUrl;
    if (!url) return;
    const opened = window.open(url, "_blank", "noopener");
    if (!opened) window.location.href = url;
  }
  document.addEventListener("click", (event) => {
    if (event.target.closest(".doc-viewer-open-tab")) {
      openCurrentInTab();
    }
  });
  return { open, close };
})();

const notesViewer = (() => {
  let overlay = null;
  let activeDocs = [];
  let activeTitle = "Notes";
  function ensure() {
    if (overlay) return overlay;
    overlay = document.createElement("div");
    overlay.className = "doc-notes-overlay";
    overlay.innerHTML = `
      <div class="doc-notes-viewer" role="dialog" aria-modal="true" aria-label="Notes viewer">
        <div class="doc-notes-header">
          <div>
            <p class="doc-notes-title">Notes</p>
            <div class="doc-notes-meta"></div>
          </div>
          <div class="doc-notes-actions">
            <button type="button" class="btn secondary doc-notes-print">Print</button>
            <button type="button" class="btn secondary doc-notes-share">Share PDF</button>
            <button type="button" class="doc-notes-close" aria-label="Close notes viewer">&times;</button>
          </div>
        </div>
        <div class="doc-notes-body"></div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay || event.target.closest(".doc-notes-close")) {
        overlay.classList.remove("open");
      }
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") overlay?.classList.remove("open");
    });
    overlay.querySelector(".doc-notes-print")?.addEventListener("click", () => {
      openNotesPrintWindow(activeDocs, activeTitle);
    });
    overlay.querySelector(".doc-notes-share")?.addEventListener("click", () => {
      openNotesPrintWindow(activeDocs, activeTitle);
    });
    return overlay;
  }
  function open({ title, meta, cardsHtml, docs }) {
    const wrap = ensure();
    wrap.classList.add("open");
    activeDocs = docs || [];
    activeTitle = title || "Notes";
    wrap.querySelector(".doc-notes-title").textContent = title || "Notes";
    const metaEl = wrap.querySelector(".doc-notes-meta");
    metaEl.textContent = meta || "";
    const body = wrap.querySelector(".doc-notes-body");
    body.innerHTML = cardsHtml || "<div class=\"doc-notes-card\">No notes yet.</div>";
  }
  return { open };
})();

function getDocNotesPayload(doc = {}) {
  const meta = doc.content_json || {};
  const sections = [];
  const summary = [];
  if (meta.medical_next_datetime) {
    summary.push(`<div><strong>Next Appt:</strong> ${formatPrintableDate(meta.medical_next_datetime)}</div>`);
  }
  if (meta.medical_next_link) {
    summary.push(`<div><strong>Meeting Link:</strong> ${formatLink(meta.medical_next_link)}</div>`);
  }
  if (summary.length) {
    sections.push({ title: "Appointment", html: summary.join("") });
  }
  if (doc.content) {
    sections.push({ title: "Notes", html: formatParagraphs(doc.content) });
  }
  if (meta.medical_notes) {
    sections.push({ title: "Instructions", html: formatParagraphs(meta.medical_notes) });
  }
  return {
    title: doc.title || "Document",
    type: doc.doc_type || "",
    date: doc.content_json?.document_date || doc.created_at || "",
    sections,
  };
}

function hasDocNotes(doc = {}) {
  const meta = doc.content_json || {};
  return Boolean((doc.content || "").trim() || (meta.medical_notes || "").trim() || meta.medical_next_datetime || meta.medical_next_link);
}

function buildNotesCards(docs = []) {
  const cards = docs.map((doc) => {
    const payload = getDocNotesPayload(doc);
    if (!payload.sections.length) return "";
    const metaLine = [
      payload.type ? escapeHtml(payload.type) : "",
      payload.date ? escapeHtml(formatPrintableDate(payload.date)) : "",
    ].filter(Boolean).join(" • ");
    const sectionsHtml = payload.sections.map((section) => `
      <div class="doc-notes-card">
        <h4>${escapeHtml(section.title)}</h4>
        ${section.html}
      </div>
    `).join("");
    return `
      <div class="doc-notes-card">
        <h4>${escapeHtml(payload.title)}</h4>
        ${metaLine ? `<div class="doc-notes-meta">${metaLine}</div>` : ""}
      </div>
      ${sectionsHtml}
    `;
  }).filter(Boolean);
  return cards.length ? cards.join("") : `<div class="doc-notes-card">No notes saved for this view.</div>`;
}

function openNotesPrintWindow(docs = [], categoryLabel = "Notes") {
  const printableStyles = getPrintableStyles() + `
    .print-card{page-break-after:always;}
    .print-card:last-child{page-break-after:auto;}
  `;
  const safeCategory = escapeHtml(categoryLabel || "Notes");
  const generatedAt = escapeHtml(new Date().toLocaleString());
  const cards = docs.map((doc) => {
    const payload = getDocNotesPayload(doc);
    if (!payload.sections.length) return "";
    const meta = [
      payload.type ? escapeHtml(payload.type) : "",
      payload.date ? escapeHtml(formatPrintableDate(payload.date)) : "",
    ].filter(Boolean).join(" • ");
    const sectionsHtml = payload.sections.map((section) => `
      <section><h3>${escapeHtml(section.title)}</h3>${section.html}</section>
    `).join("");
    return `
      <article class="print-card">
        <header>
          <p class="print-label">${escapeHtml(payload.type || "Note")}</p>
          <h2>${escapeHtml(payload.title)}</h2>
        </header>
        ${meta ? `<div class="print-meta">${meta}</div>` : ""}
        <div class="print-body">${sectionsHtml}</div>
      </article>
    `;
  }).filter(Boolean).join("");

  const bodyContent = cards || `<p class="print-empty">No notes saved yet for ${safeCategory}.</p>`;
  const html = `<!DOCTYPE html>
  <html>
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>${safeCategory} — Notes</title>
      <style>${printableStyles}</style>
      <script src="https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js"></script>
      <script src="https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js"></script>
    </head>
    <body>
      <header class="print-top">
        <div>
          <h1>${safeCategory} Notes</h1>
          <p class="print-generated">Generated ${generatedAt}</p>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="print-action" onclick="window.print()">Print</button>
          <button class="print-action secondary" id="sharePdfBtn" type="button">Share PDF</button>
        </div>
      </header>
      ${bodyContent}
      <script>
        async function sharePdf(){
          const btn = document.getElementById('sharePdfBtn');
          if (!btn) return;
          const jsPDF = window.jspdf && window.jspdf.jsPDF;
          async function waitForPdfTools(){
            const start = Date.now();
            while (Date.now() - start < 4000) {
              if (window.html2canvas && (window.jspdf && window.jspdf.jsPDF)) return true;
              await new Promise((r) => setTimeout(r, 150));
            }
            return false;
          }
          if (!window.html2canvas || !jsPDF) {
            const ready = await waitForPdfTools();
            if (!ready) {
              alert('PDF tools are still loading. Please try again in a moment.');
              return;
            }
          }
          btn.disabled = true;
          const original = btn.textContent;
          btn.textContent = 'Preparing…';
          try{
            const canvas = await window.html2canvas(document.body, { scale: 2, backgroundColor: '#ffffff' });
            const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
            const pageW = pdf.internal.pageSize.getWidth();
            const pageH = pdf.internal.pageSize.getHeight();
            const imgData = canvas.toDataURL('image/png');
            const imgW = pageW;
            const imgH = canvas.height * (imgW / canvas.width);
            let heightLeft = imgH;
            let y = 0;
            pdf.addImage(imgData, 'PNG', 0, 0, imgW, imgH);
            heightLeft -= pageH;
            while (heightLeft > 0) {
              pdf.addPage();
              y = heightLeft - imgH;
              pdf.addImage(imgData, 'PNG', 0, y, imgW, imgH);
              heightLeft -= pageH;
            }
            const blob = pdf.output('blob');
            const file = new File([blob], '${safeCategory.replace(/\\s+/g,'_')}_Notes.pdf', { type: 'application/pdf' });
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
              await navigator.share({ files: [file], title: '${safeCategory} Notes' });
            } else {
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = file.name;
              document.body.appendChild(a);
              a.click();
              a.remove();
              setTimeout(() => URL.revokeObjectURL(url), 60000);
            }
          } catch (err){
            console.error('PDF share failed', err);
            alert('Unable to create a PDF right now.');
          } finally {
            btn.disabled = false;
            btn.textContent = original;
          }
        }
        document.getElementById('sharePdfBtn')?.addEventListener('click', sharePdf);
      </script>
    </body>
  </html>`;
  openPrintHtml(html);
}


/* ------------ helpers ------------ */
export async function uploadFileToBucket({ file, bucket = SHARED_DOC_BUCKET } = {}) {
  if (!file) return { storagePath: null, inlineFile: null };
  const session = getSessionFromStorage();
  const userId = session?.user?.id;
  const token = session?.access_token;
  if (!userId || !token) throw new Error("Not logged in.");

  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const safe = file.name.replace(/\s+/g, "_");
  const path = `${userId}/${y}/${m}/${crypto.randomUUID()}_${safe}`;
  const endpoint = `${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`;

  try {
    const uploadRes = await fetch(endpoint, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
        "Content-Type": file.type || "application/octet-stream",
        "x-upsert": "false",
      },
      body: file,
    });
    if (uploadRes.status === 404) {
      const inlineData = await readFileAsDataURL(file);
      return { storagePath: null, inlineFile: buildInlineFileMeta(file, inlineData) };
    }
    if (!uploadRes.ok) {
      throw new Error((await uploadRes.text()) || "Upload failed");
    }
  } catch (error) {
    if (isBucketMissing(error)) {
      const inlineData = await readFileAsDataURL(file);
      return { storagePath: null, inlineFile: buildInlineFileMeta(file, inlineData) };
    }
    throw error;
  }
  return { storagePath: path, inlineFile: null };
}

async function getSignedUrl(storagePath) {
  const session = await requireSession();
  const token = session?.access_token;
  if (!token) throw new Error("Not logged in.");
  const safePath = encodeURIComponent(normalizeStoragePath(storagePath)).replace(/%2F/g, "/");
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/documents/${safePath}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ expiresIn: 60 * 60 }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(text || "Signed URL failed");
  const data = text ? JSON.parse(text) : null;
  const signed = data?.signedUrl || data?.signedURL;
  if (!signed) throw new Error("Signed URL missing");
  return ensureAbsoluteUrl(signed);
}

const SIGNED_URL_TTL_MS = 50 * 60 * 1000;
async function getSignedUrlForDoc(doc = {}) {
  if (!doc?.storage_path) return "";
  const cachedAt = doc._cachedSignedUrlAt || 0;
  if (doc._cachedSignedUrl && Date.now() - cachedAt < SIGNED_URL_TTL_MS) {
    return doc._cachedSignedUrl;
  }
  const url = await getSignedUrl(doc.storage_path);
  doc._cachedSignedUrl = url;
  doc._cachedSignedUrlAt = Date.now();
  return url;
}

function normalizeStoragePath(path) {
  if (!path) return "";
  let cleaned = String(path).trim();
  // Remove any query/hash fragments first.
  cleaned = cleaned.replace(/[?#].*$/, "");
  // Strip a full URL to the storage object if it was stored that way (covers sign/public/authenticated).
  cleaned = cleaned.replace(/^https?:\/\/[^/]+\/storage\/v1\/object\/(?:sign\/|public\/|authenticated\/)?documents\//i, "");
  // Strip leading bucket name if it was included.
  cleaned = cleaned.replace(/^documents\//i, "");
  // Remove leading slashes.
  cleaned = cleaned.replace(/^\/+/, "");
  try {
    // Decode once in case the path was already encoded, so we don't double-encode.
    cleaned = decodeURIComponent(cleaned);
  } catch {
    /* ignore decode errors and keep the raw string */
  }
  return cleaned;
}

function resolveShareBase() {
  const host = window.location.hostname;
  const isLocal = host === "localhost" || host === "127.0.0.1";
  if (!isLocal) return window.location.origin;
  const stored = getStoredShareBase();
  if (stored) return stored;
  const input = (prompt("Enter your live site URL for share links (e.g., https://mynorthstar.netlify.app):") || "").trim();
  if (input) {
    setStoredShareBase(input);
    return input;
  }
  return window.location.origin;
}

function buildShareUrl(token) {
  const base = resolveShareBase().replace(/\/+$/, "");
  return `${base}/documents/share.html?token=${encodeURIComponent(token)}`;
}

async function createShareLink(doc) {
  if (!doc?.id) throw new Error("Missing document ID.");
  const { hash } = await ensureSharePin();
  const now = new Date();
  const expires = new Date(now.getTime() + SHARE_EXPIRY_HOURS * 60 * 60 * 1000);
  const shareToken = crypto.randomUUID();
  const content = { ...(doc.content_json || {}) };

  content.share_token = shareToken;
  content.share_pin_hash = hash;
  content.share_expires_at = expires.toISOString();
  content.share_used_at = null;
  content.share_created_at = now.toISOString();
  content.share_created_by = USER_ID;

  await rest(`documents?id=eq.${encodeURIComponent(doc.id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ content_json: content }),
  });

  doc.content_json = content;
  await persistDocsStore(content.share_created_at);

  const url = buildShareUrl(shareToken);
  const copied = await copyToClipboard(url);
  if (!copied) {
    prompt("Copy this one-time link:", url);
  } else {
    const host = window.location.hostname;
    const isLocal = host === "localhost" || host === "127.0.0.1";
    alert(`One-time link copied. It expires in ${SHARE_EXPIRY_HOURS} hours.${isLocal ? " This link uses your live site URL if configured." : ""}`);
  }
  return url;
}

/* ------------ category tabs + deep link ------------ */
const urlParams = new URLSearchParams(location.search);
let activeCategory = urlParams.get("cat") || "Finance";
document.body.dataset.docCat = activeCategory;

const tabs = document.querySelectorAll(".tabbtn");
const catInput = document.getElementById("docCategory");
const catLabel = document.getElementById("catLabel");
const catListLabel = document.getElementById("catListLabel");
const medicalExtrasEl = document.getElementById("medicalExtras");
const formHeading = document.getElementById("formHeading");
const docSubmitBtn = document.getElementById("docSubmitBtn");
const docResetBtn = document.getElementById("docResetBtn");
const docCancelEdit = document.getElementById("docCancelEdit");
const editNotice = document.getElementById("editNotice");
let editingDocId = null;

function updateFormHeading() {
  if (formHeading?.firstChild) {
    formHeading.firstChild.nodeValue = editingDocId ? "Edit Document — " : "Add Document — ";
  }
  if (catLabel) catLabel.textContent = activeCategory;
}

function formatLocalInputValue(value) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function enterEditMode(doc) {
  if (!doc) return;
  editingDocId = doc.id;
  const meta = doc.content_json || {};
  const title = document.getElementById("docTitle");
  const when = document.getElementById("docDate");
  const docType = document.getElementById("docType");
  const desc = document.getElementById("docDescription");
  const tags = document.getElementById("docTags");
  const medNext = document.getElementById("medicalNextDate");
  const medLink = document.getElementById("medicalNextLink");
  const medNotes = document.getElementById("medicalNotes");

  if (title) title.value = doc.title || "";
  if (when) when.value = formatLocalInputValue(meta.document_date || doc.created_at);
  if (docType) docType.value = doc.doc_type || "upload";
  if (desc) desc.value = doc.content || "";
  if (tags) {
    const filtered = (doc.tags || []).filter((tag) => {
      return normalizeCategoryValue(tag) !== normalizeCategoryValue(activeCategory);
    });
    tags.value = filtered.join(", ");
  }
  if (medNext) medNext.value = formatLocalInputValue(meta.medical_next_datetime);
  if (medLink) medLink.value = meta.medical_next_link || "";
  if (medNotes) medNotes.value = meta.medical_notes || "";

  if (docSubmitBtn) docSubmitBtn.textContent = "Save Changes";
  if (docResetBtn) docResetBtn.style.display = "none";
  if (docCancelEdit) docCancelEdit.style.display = "inline-block";
  if (editNotice) editNotice.style.display = "block";
  updateFormHeading();
  updateExtrasVisibility();
  document.getElementById("doc-form-pretty")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function exitEditMode({ keepForm = false } = {}) {
  editingDocId = null;
  if (!keepForm) {
    const form = document.getElementById("doc-form-pretty");
    form?.reset();
    if (catInput) catInput.value = activeCategory;
  }
  if (docSubmitBtn) docSubmitBtn.textContent = "Save Document";
  if (docResetBtn) docResetBtn.style.display = "inline-block";
  if (docCancelEdit) docCancelEdit.style.display = "none";
  if (editNotice) editNotice.style.display = "none";
  updateFormHeading();
  updateExtrasVisibility();
}

function updateExtrasVisibility() {
  if (!medicalExtrasEl) return;
  medicalExtrasEl.style.display = (activeCategory === "Medical") ? "block" : "none";
}

// initial UI
if (catInput) catInput.value = activeCategory;
if (catLabel) catLabel.textContent = activeCategory;
if (catListLabel) catListLabel.textContent = activeCategory;
tabs.forEach(btn => btn.classList.toggle("active", btn.dataset.cat === activeCategory));
updateExtrasVisibility();
updateFormHeading();

tabs.forEach(btn => {
  btn.addEventListener("click", async () => {
    tabs.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    activeCategory = btn.dataset.cat;
    if (editingDocId) exitEditMode();

    if (catInput) catInput.value = activeCategory;
    if (catLabel) catLabel.textContent = activeCategory;
    if (catListLabel) catListLabel.textContent = activeCategory;

    const p = new URLSearchParams(location.search);
    p.set("cat", activeCategory);
    history.replaceState(null, "", `${location.pathname}?${p.toString()}`);

    updateExtrasVisibility();
    updateFormHeading();
    await loadDocuments();
  });
});

/* ------------ form submit ------------ */
const prettyForm = document.getElementById("doc-form-pretty");
if (prettyForm) {
  prettyForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const title   = document.getElementById("docTitle").value.trim();
      const when    = document.getElementById("docDate").value;
      const docType = document.getElementById("docType").value || "upload";
      const desc    = document.getElementById("docDescription").value.trim();
      const tagsStr = document.getElementById("docTags").value.trim();
      const file    = document.getElementById("docFile").files[0] || null;
      if (file && !isAllowedDocFile(file)) {
        alert("Please upload a JPG or PDF file.");
        document.getElementById("docFile").value = "";
        return;
      }

      if (!title) return alert("Please add a title.");

      // Medical fields (safe to read even if hidden)
      const medNext  = document.getElementById("medicalNextDate")?.value || null;
      const medLink  = document.getElementById("medicalNextLink")?.value?.trim() || null;
      const medNotes = document.getElementById("medicalNotes")?.value?.trim() || null;

      const session = getSessionFromStorage();
      const user = session?.user;
      if (!user?.id) throw new Error("Not logged in.");
      await ensureDocsStore();

      const extraTags = tagsStr ? tagsStr.split(",").map(s => s.trim()).filter(Boolean) : [];
      const tags = [activeCategory, ...extraTags];

      let storage_path = null;
      let inline_file = null;
      const existingDoc = editingDocId
        ? (docsStore.documents || []).find((d) => d.id === editingDocId)
        : null;
      if (editingDocId && !existingDoc) {
        throw new Error("Document not found for editing.");
      }
      if (editingDocId && existingDoc) {
        storage_path = existingDoc.storage_path || null;
        inline_file = existingDoc.content_json?.inline_file || null;
      }
      if (file) {
        const uploadResult = await uploadFileToBucket({ file });
        storage_path = uploadResult.storagePath;
        inline_file = uploadResult.inlineFile;
      }

      const content_json = {
        ...(existingDoc?.content_json || {}),
        primary_category: activeCategory,
        document_date: when || null,
      };
      if (activeCategory === "Medical") {
        content_json.medical_next_datetime = medNext;
        content_json.medical_next_link     = medLink;
        content_json.medical_notes         = medNotes;
      } else {
        delete content_json.medical_next_datetime;
        delete content_json.medical_next_link;
        delete content_json.medical_notes;
      }
      if (inline_file) content_json.inline_file = inline_file;
      else delete content_json.inline_file;
      if (file) {
        content_json.file_type = file.type || null;
        content_json.file_name = file.name || null;
      }

      if (editingDocId && existingDoc) {
        const updatedPayload = {
          title,
          doc_type: docType,
          content: desc || null,
          content_json,
          tags,
          storage_path,
          updated_at: new Date().toISOString(),
        };
        let updatedRows = [];
        try {
          updatedRows = await rest(`documents?id=eq.${encodeURIComponent(existingDoc.id)}`, {
            method: "PATCH",
            headers: { Prefer: "return=representation" },
            body: JSON.stringify(updatedPayload),
          }) || [];
        } catch (error) {
          console.warn("Update by id failed", error?.message || error);
        }
        if (!updatedRows.length && existingDoc.storage_path) {
          try {
            updatedRows = await rest([
              "documents",
              `storage_path=eq.${encodeURIComponent(existingDoc.storage_path)}`,
              `created_by=eq.${encodeURIComponent(existingDoc.created_by || user.id)}`,
            ].join("&"), {
              method: "PATCH",
              headers: { Prefer: "return=representation" },
              body: JSON.stringify(updatedPayload),
            }) || [];
          } catch (error) {
            console.warn("Update by storage_path failed", error?.message || error);
          }
        }

        const merged = mergeDocRecords(existingDoc, {
          ...updatedPayload,
          content: desc || "",
          created_at: existingDoc.created_at,
        });
        const normalized = normalizeDoc(merged);
        docsStore.documents = (docsStore.documents || []).map((doc) =>
          doc.id === editingDocId ? normalized : doc
        );
        await persistDocsStore(normalized.updated_at || new Date().toISOString());
        alert("Updated!");
        exitEditMode();
        await loadDocuments();
        return;
      }

      const record = {
        title,
        doc_type: docType,
        content: desc || null,
        content_json,
        tags,
        storage_path,
        created_by: user.id,
      };
      const inserted = await rest("documents", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify([record]),
      });

      const insertedRow = Array.isArray(inserted) ? inserted[0] : null;
      const newEntry = normalizeDoc({
        ...record,
        ...(insertedRow || {}),
        id: insertedRow?.id || crypto.randomUUID(),
        created_at: insertedRow?.created_at || new Date().toISOString(),
      });
      docsStore.documents = [newEntry, ...(docsStore.documents || [])].slice(0, 200);
      await persistDocsStore(newEntry.created_at);

      alert("Saved!");
      prettyForm.reset();
      if (catInput) catInput.value = activeCategory; // keep tab label
      updateFormHeading();
      await loadDocuments();
    } catch (err) {
      console.error(err);
      alert("Save failed: " + err.message);
    }
  });
}

if (prettyForm) {
  prettyForm.addEventListener("reset", () => {
    if (!editingDocId) {
      setTimeout(() => {
        if (catInput) catInput.value = activeCategory;
        updateFormHeading();
        updateExtrasVisibility();
      }, 0);
    }
  });
}

if (docCancelEdit) {
  docCancelEdit.addEventListener("click", () => exitEditMode());
}

/* ------------ list (filter by category) ------------ */
async function loadDocuments() {
  const list = document.getElementById("docs-list");
  if (!list) return;
  list.innerHTML = "";
  try {
    const store = await ensureDocsStore();
    await renderDocuments(list, store.documents || []);
  } catch (error) {
    console.error(error);
    const empty = document.createElement("div");
    empty.className = "card";
    empty.textContent = error?.message || "Unable to load documents.";
    list.appendChild(empty);
  }
}

export async function saveMinutesRich(payload = {}, attachment = {}) {
  const session = getSessionFromStorage();
  const user = session?.user;
  if (!user?.id) throw new Error("Not logged in.");
  await ensureDocsStore();

  const { storagePath, inlineFile } = normalizeAttachmentResult(attachment);
  const category = payload.primary_category || payload.category || "Minutes";
  const docDate = payload.datetime || payload.dateTime || null;
  const content_json = {
    primary_category: category,
    document_date: docDate,
    minutes_payload: payload,
  };
  if (inlineFile) content_json.inline_file = inlineFile;

  const tags = [category, "Minutes", payload.facilitator ? `Facilitator: ${payload.facilitator}` : null]
    .filter(Boolean);
  const record = {
    title: payload.title || "Meeting Minutes",
    doc_type: "meeting_minutes",
    content: payload.discussion || payload.notes || "",
    content_json,
    tags,
    storage_path: storagePath,
    created_by: user.id,
  };

  await rest("documents", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify([record]),
  });

  const newEntry = {
    ...record,
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
  };
  const normalized = normalizeDoc(newEntry);
  docsStore.documents = [normalized, ...(docsStore.documents || [])].slice(0, 200);
  await persistDocsStore(normalized.created_at);
  return normalized;
}

function filterDocsByCategory(docs = []) {
  const active = normalizeCategoryValue(activeCategory);
  return (docs || []).filter((d) => {
    const tags = Array.isArray(d.tags) ? d.tags.map(normalizeCategoryValue) : [];
    const jsonCat = normalizeCategoryValue(
      d.content_json?.primary_category
      || d.content_json?.primaryCategory
      || d.content_json?.category
      || d.primary_category
      || d.category
    );
    const matchesTags = active ? tags.includes(active) : false;
    const matchesJson = active ? jsonCat === active : false;
    return matchesTags || matchesJson || (!active && (!tags.length && !jsonCat));
  });
}

async function renderDocuments(list, docs) {
  const filtered = filterDocsByCategory(docs);

  list.innerHTML = "";
  for (const doc of filtered) {
    const docId = doc.id || doc.storage_path || `doc-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    if (!doc.id) doc.id = docId;

    const card = document.createElement("div");
    card.className = "card";

    const inlineFile = doc.content_json?.inline_file || null;
    const desc = doc.content
      ? `<div class="muted" style="margin-top:6px; white-space:pre-wrap">${(doc.content || "").slice(0,240)}${(doc.content || "").length>240?"…":""}</div>`
      : "";
  const dateStr = doc.content_json?.document_date
      ? new Date(doc.content_json.document_date).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })
      : new Date(doc.created_at).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });

    let medicalBlock = "";
    if (activeCategory === "Medical" && doc.content_json) {
      const nx = doc.content_json.medical_next_datetime;
      const lk = doc.content_json.medical_next_link;
      const nt = doc.content_json.medical_notes;
      const nxStr = nx ? new Date(nx).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" }) : "";
      const rows = [];
      if (nxStr) rows.push(`<div><strong>Next Appt:</strong> ${nxStr}</div>`);
      if (lk)    rows.push(`<div><strong>Link:</strong> <a href="${lk}" target="_blank" rel="noopener">${lk}</a></div>`);
      if (nt)    rows.push(`<div class="muted" style="white-space:pre-wrap"><strong>Notes:</strong> ${nt}</div>`);
      if (rows.length) medicalBlock = `<div style="margin-top:8px">${rows.join("")}</div>`;
    }

    card.innerHTML = `
      <div class="row">
        <div><strong>${doc.title}</strong> <span class="muted">(${doc.doc_type})</span></div>
        <div class="muted">${dateStr}</div>
      </div>
      ${desc}
      ${medicalBlock}
      <div class="muted" style="margin-top:6px">${(doc.tags||[]).join(" • ")}</div>
      <div class="doc-links" style="margin-top:8px"></div>
    `;
    const linksHolder = card.querySelector(".doc-links");
    const hasAttachment = Boolean(doc.storage_path || inlineFile?.data_url);
    if (hasAttachment) {
      const previewType = inlineFile
        ? (detectPreviewType({ name: inlineFile.name, type: inlineFile.type })
          || inferPreviewTypeFromDataUrl(inlineFile.data_url)
          || inferPreviewTypeFromContentType(inlineFile.type))
      : detectPreviewType({
        path: doc.storage_path || "",
        type: doc.file_type || doc.mime_type || doc.content_json?.file_type,
        name: doc.content_json?.file_name || (doc.storage_path || "").split("_").slice(1).join("_")
      });

      const viewBtn = document.createElement("button");
      viewBtn.type = "button";
      viewBtn.className = "btn secondary doc-attachment-action";
      viewBtn.dataset.docId = docId;
      viewBtn.dataset.action = "view";
      viewBtn.dataset.previewType = previewType || "";
      viewBtn.textContent = previewType === "pdf"
        ? "Preview PDF"
        : previewType === "image"
          ? "View Attachment"
          : "Open Attachment";
      viewBtn.setAttribute("aria-label", `${viewBtn.textContent} for ${doc.title}`);
      linksHolder.appendChild(viewBtn);

      const downloadBtn = document.createElement("button");
      downloadBtn.type = "button";
      downloadBtn.className = "btn secondary doc-attachment-action";
      downloadBtn.dataset.docId = docId;
      downloadBtn.dataset.action = "download";
      downloadBtn.textContent = "Download";
      downloadBtn.setAttribute("aria-label", `Download attachment for ${doc.title}`);
      linksHolder.appendChild(downloadBtn);

      if (inlineFile?.data_url && !doc.storage_path) {
        const note = document.createElement("div");
        note.className = "muted";
        note.style.fontSize = "13px";
        note.style.flexBasis = "100%";
        note.textContent = "File stored inline until storage bucket is available.";
        linksHolder.appendChild(note);
      }

      if (!previewType) {
        const note = document.createElement("div");
        note.className = "muted";
        note.style.fontSize = "13px";
        note.style.flexBasis = "100%";
        note.textContent = "Preview works for JPG or PDF. Re-upload if needed.";
        linksHolder.appendChild(note);
      }

      await attachImagePreview(card, doc, docId, previewType, inlineFile);
    }
    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "btn secondary doc-edit-action";
    editBtn.dataset.docId = docId;
    editBtn.textContent = "Edit";
    editBtn.setAttribute("aria-label", `Edit ${doc.title}`);
    linksHolder.appendChild(editBtn);

    if (hasDocNotes(doc)) {
      const notesBtn = document.createElement("button");
      notesBtn.type = "button";
      notesBtn.className = "btn secondary doc-notes-action";
      notesBtn.dataset.docId = docId;
      notesBtn.textContent = "View Notes";
      notesBtn.setAttribute("aria-label", `View notes for ${doc.title}`);
      linksHolder.appendChild(notesBtn);
    }

    const exportBtn = document.createElement("button");
    exportBtn.type = "button";
    exportBtn.className = "btn doc-export-action";
    exportBtn.dataset.docId = docId;
    exportBtn.textContent = "Export PDF";
    exportBtn.setAttribute("aria-label", `Export ${doc.title} as PDF`);
    linksHolder.appendChild(exportBtn);

    const shareBtn = document.createElement("button");
    shareBtn.type = "button";
    shareBtn.className = "btn secondary doc-share-action";
    shareBtn.dataset.docId = docId;
    shareBtn.textContent = "Share Link";
    shareBtn.setAttribute("aria-label", `Create a one-time share link for ${doc.title}`);
    linksHolder.appendChild(shareBtn);

    list.appendChild(card);
  }

  if (!filtered.length) {
    const empty = document.createElement("div");
    empty.className = "card";
    empty.textContent = "No documents yet in this category.";
    list.appendChild(empty);
  }
}
loadDocuments();
const docsPrintBtn = document.getElementById("docsPrintBtn");
if (docsPrintBtn) {
  docsPrintBtn.addEventListener("click", () => handleDocsPrintClick(docsPrintBtn));
}
const docsNotesBtn = document.getElementById("docsNotesBtn");
if (docsNotesBtn) {
  docsNotesBtn.addEventListener("click", async () => {
    const store = await ensureDocsStore();
    const docs = filterDocsByCategory(store.documents || []);
    const notesDocs = docs.filter((doc) => hasDocNotes(doc));
    if (!notesDocs.length) {
      alert("No notes saved in this category yet.");
      return;
    }
    const metaLine = `${notesDocs.length} note${notesDocs.length === 1 ? "" : "s"}`;
    notesViewer.open({
      title: `${activeCategory} Notes`,
      meta: metaLine,
      cardsHtml: buildNotesCards(notesDocs),
      docs: notesDocs,
    });
  });
}
const docsSharePinBtn = document.getElementById("docsSharePinBtn");
if (docsSharePinBtn) {
  docsSharePinBtn.addEventListener("click", () => {
    const pin = (prompt("Set or update the share PIN for secure links:") || "").trim();
    if (!pin) return;
    setStoredSharePin(pin);
    alert("Share PIN updated on this device.");
  });
}

async function handleAttachmentAction(trigger) {
  const docId = trigger.dataset.docId;
  if (!docId) return;
  const doc = (docsStore.documents || []).find((d) => d.id === docId);
  if (!doc) {
    alert("Unable to locate this document.");
    return;
  }
  const action = trigger.dataset.action || "view";
  const inlineFile = doc.content_json?.inline_file || null;
  const fileName =
    inlineFile?.name ||
    doc.content_json?.file_name ||
    (doc.storage_path ? (doc.storage_path.split("/").pop() || "") : "");
  let previewType = trigger.dataset.previewType
    || (inlineFile
      ? (detectPreviewType({ name: inlineFile.name, type: inlineFile.type })
        || inferPreviewTypeFromDataUrl(inlineFile.data_url)
        || inferPreviewTypeFromContentType(inlineFile.type))
      : detectPreviewType({
        path: doc.storage_path || "",
        type: doc.file_type || doc.mime_type || doc.content_json?.file_type,
        name: fileName || (doc.storage_path || "").split("_").slice(1).join("_")
      }));

  let url = inlineFile?.data_url || "";
  const originalText = trigger.dataset.label || trigger.textContent;
  if (!trigger.dataset.label) trigger.dataset.label = trigger.textContent;

  if (!url && action === "view" && doc.storage_path && !inlineFile?.data_url) {
    try {
      trigger.disabled = true;
      trigger.textContent = "Opening…";
      const blob = await fetchPrivateBlob(doc.storage_path);
      if (blob?.blob) {
        url = URL.createObjectURL(blob.blob);
        if (!previewType) {
          previewType = inferPreviewTypeFromContentType(blob.type)
            || detectPreviewType({ name: fileName, path: doc.storage_path });
        }
      }
    } catch (error) {
      console.warn("private preview fallback failed", error?.message || error);
    } finally {
      trigger.disabled = false;
      trigger.textContent = originalText;
    }
  }

  if (!url && doc.storage_path) {
    try {
      trigger.disabled = true;
      trigger.textContent = action === "download" ? "Preparing…" : "Opening…";
      url = await getSignedUrlForDoc(doc);
    } catch (error) {
      console.error("Attachment link failed", error);
      alert("Unable to fetch this attachment right now. Please try again.");
      return;
    } finally {
      trigger.disabled = false;
      trigger.textContent = originalText;
    }
  }

  if (!url) {
    alert("This attachment is no longer available.");
    return;
  }

  if (!previewType && action === "view") {
    previewType = inlineFile?.data_url
      ? inferPreviewTypeFromDataUrl(inlineFile.data_url)
      : inferPreviewTypeFromContentType(inlineFile?.type || "");
  }

  if (!previewType && action === "view" && url) {
    previewType = detectPreviewType({ url });
  }

  if (!previewType && action === "view") {
    try {
      const headRes = await fetch(url, { method: "HEAD" });
      const ct = headRes.headers.get("content-type") || "";
      previewType = inferPreviewTypeFromContentType(ct);
    } catch (error) {
      console.warn("preview type lookup failed", error?.message || error);
    }
  }

  if (!previewType && action === "view" && fileName) {
    previewType = detectPreviewType({ name: fileName, path: doc.storage_path || "" });
  }

  if (action === "download") {
    const fileName = inlineFile?.name
      || doc.content_json?.file_name
      || (doc.storage_path ? (doc.storage_path.split("/").pop() || "document") : "document");
    if (doc.storage_path) {
      try {
        const blob = await fetchPrivateBlob(doc.storage_path);
        const objUrl = URL.createObjectURL(blob.blob);
        const a = document.createElement("a");
        a.href = objUrl;
        a.download = fileName;
        a.style.display = "none";
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(objUrl), 60000);
        return;
      } catch (error) {
        console.warn("download blob failed", error?.message || error);
      }
    }
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener";
    if (fileName) a.download = fileName;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
    return;
  }

  if (previewType) {
    attachmentViewer.open({
      title: doc.title || "Attachment",
      url,
      downloadName: inlineFile?.name || (doc.storage_path || "").split("/").pop() || "",
      previewType,
      note: inlineFile && !doc.storage_path
        ? "Attachment stored inline until the shared bucket is reachable."
        : "",
    });
    return;
  }
  const opened = window.open(url, "_blank", "noopener");
  if (!opened) {
    window.location.href = url;
  }
}

function handleEditAction(trigger) {
  const docId = trigger.dataset.docId;
  if (!docId) return;
  const doc = (docsStore.documents || []).find((d) => d.id === docId);
  if (!doc) {
    alert("Unable to locate this document.");
    return;
  }
  enterEditMode(doc);
}

async function handleDocExport(trigger) {
  const docId = trigger.dataset.docId;
  if (!docId) return;
  const doc = (docsStore.documents || []).find((d) => d.id === docId);
  if (!doc) {
    alert("Unable to locate this document.");
    return;
  }
  // Open a placeholder window immediately so browsers don't block the final PDF window.
  const pendingWin = openPrepWindow();
  const initialLabel = trigger.textContent;
  try {
    trigger.disabled = true;
    trigger.textContent = "Preparing…";
    const inlineFile = doc.content_json?.inline_file || null;
    let attachmentUrl = "";
    let attachmentName = "";
    let attachmentNote = "";
    const previewType = inlineFile
      ? detectPreviewType({ name: inlineFile.name, type: inlineFile.type })
      : detectPreviewType({ path: doc.storage_path || "", type: doc.file_type || doc.mime_type });
    if (inlineFile?.data_url) {
      attachmentUrl = inlineFile.data_url;
      attachmentName = inlineFile.name || "attachment";
      attachmentNote = "Embedded from device upload";
    } else if (doc.storage_path) {
      attachmentName = doc.storage_path.split("/").pop() || "attachment";
      try {
        attachmentUrl = await getSignedUrlForDoc(doc);
      } catch (error) {
        console.warn("signed url for export failed", error);
        attachmentNote = "Link unavailable right now (use Download in Docs list).";
      }
    }
    const attachmentDetails = (attachmentUrl || attachmentName || attachmentNote)
      ? { url: attachmentUrl, name: attachmentName, note: attachmentNote, previewType }
      : null;
    openSingleDocPrintWindow(doc, activeCategory, attachmentDetails, pendingWin);
  } catch (error) {
    console.error("Export failed", error);
    alert("Unable to build the PDF right now. Please try again.");
    pendingWin?.close?.();
  } finally {
    trigger.disabled = false;
    trigger.textContent = initialLabel;
  }
}

async function handleDocShare(trigger) {
  const docId = trigger.dataset.docId;
  if (!docId) return;
  const doc = (docsStore.documents || []).find((d) => d.id === docId);
  if (!doc) {
    alert("Unable to locate this document.");
    return;
  }
  const initialLabel = trigger.textContent;
  try {
    trigger.disabled = true;
    trigger.textContent = "Sharing…";
    await createShareLink(doc);
  } catch (error) {
    console.error("Share link failed", error);
    alert(error?.message || "Unable to create a share link right now.");
  } finally {
    trigger.disabled = false;
    trigger.textContent = initialLabel;
  }
}

document.addEventListener("click", (event) => {
  const trigger = event.target.closest(".doc-attachment-action");
  if (trigger) {
    event.preventDefault();
    handleAttachmentAction(trigger);
  }
});

document.addEventListener("click", (event) => {
  const trigger = event.target.closest(".doc-edit-action");
  if (trigger) {
    event.preventDefault();
    handleEditAction(trigger);
  }
});

document.addEventListener("click", (event) => {
  const trigger = event.target.closest(".doc-export-action");
  if (trigger) {
    event.preventDefault();
    handleDocExport(trigger);
  }
});

document.addEventListener("click", (event) => {
  const trigger = event.target.closest(".doc-share-action");
  if (trigger) {
    event.preventDefault();
    handleDocShare(trigger);
  }
});

document.addEventListener("click", (event) => {
  const trigger = event.target.closest(".doc-notes-action");
  if (!trigger) return;
  event.preventDefault();
  const docId = trigger.dataset.docId;
  const doc = (docsStore.documents || []).find((d) => d.id === docId);
  if (!doc) {
    alert("Unable to locate this document.");
    return;
  }
  const payload = getDocNotesPayload(doc);
  if (!payload.sections.length) {
    alert("No notes saved for this document yet.");
    return;
  }
  const metaLine = [payload.type || "Notes", payload.date ? formatPrintableDate(payload.date) : ""]
    .filter(Boolean)
    .join(" • ");
  notesViewer.open({
    title: payload.title,
    meta: metaLine,
    cardsHtml: buildNotesCards([doc]),
    docs: [doc],
  });
});

async function handleDocsPrintClick(button) {
  if (!button) return;
  const pendingWin = openPrepWindow("Preparing documents…");
  const initialLabel = button.textContent;
  try {
    button.disabled = true;
    button.textContent = "Preparing…";
    const store = await ensureDocsStore();
    const docs = await preparePrintDocs(filterDocsByCategory(store.documents || []));
    openPrintableDocsWindow(docs, activeCategory, pendingWin);
  } catch (error) {
    console.error("Printable docs view failed", error);
    alert("Unable to build the printable view right now. Please try again.");
    pendingWin?.close?.();
  } finally {
    button.disabled = false;
    button.textContent = initialLabel;
  }
}

function getPrintableStyles() {
  return `
    *{box-sizing:border-box;}
    body{margin:0;padding:24px;font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial;background:#f7f7f4;color:#0f172a;}
    .print-top{display:flex;justify-content:space-between;align-items:center;gap:18px;flex-wrap:wrap;margin-bottom:18px;}
    .print-top h1{margin:0;font-size:26px;}
    .print-generated{margin:0;color:#475569;font-size:14px;}
    .print-action{border:none;background:#0f172a;color:#fff;padding:10px 20px;border-radius:999px;font-weight:600;cursor:pointer;}
    .print-action.secondary{background:#e2e8f0;color:#0f172a;}
    .print-card{background:#fff;border-radius:18px;padding:20px;margin-bottom:18px;box-shadow:0 18px 35px rgba(15,23,42,.12);}
    .print-card header{margin-bottom:12px;}
    .print-label{margin:0 0 4px;font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:#64748b;}
    .print-card h2{margin:0;font-size:20px;}
    .print-meta{display:flex;flex-wrap:wrap;gap:12px 24px;font-size:14px;color:#334155;margin-bottom:10px;}
    .print-tags{font-size:13px;color:#475569;margin-bottom:12px;}
    .print-body section{margin-bottom:14px;}
    .print-body h3,.print-body h4{margin:0 0 6px;font-size:16px;}
    .print-body p{margin:4px 0;font-size:14px;line-height:1.55;}
    .print-list ul{margin:4px 0 0 20px;padding:0;}
    .print-note{margin-top:10px;font-size:12px;color:#475569;font-style:italic;}
    .print-attach{font-size:14px;color:#334155;margin-top:10px;}
    .print-empty{font-size:16px;color:#475569;}
    .print-muted{color:#94a3b8;font-size:14px;margin:0;}
    @media print{
      body{padding:0;background:#fff;}
      .print-card{box-shadow:none;border:1px solid #e2e8f0;page-break-inside:avoid;}
      .print-action{display:none;}
    }
  `;
}

function isIOSDevice() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent || "");
}

function openPrepWindow(message = "Building PDF…") {
  if (isIOSDevice()) return null;
  const win = window.open("about:blank", "_blank", "noopener,width=900,height=700");
  if (!win) return null;
  try {
    win.document.write(`<!DOCTYPE html><html><head><title>Preparing…</title></head><body style="font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial;padding:32px;background:#f8fafc;color:#0f172a;"><p style="margin:0;font-size:16px;">${escapeHtml(message)}</p></body></html>`);
    win.document.close();
  } catch {
    /* ignore; we'll fall back to same-tab if needed */
  }
  return win;
}

function openPrintableDocsWindow(docs = [], categoryLabel = "Documents", targetWin = null) {
  const safeCategory = escapeHtml(categoryLabel || "Documents");
  const generatedAt = escapeHtml(new Date().toLocaleString());
  const printableStyles = getPrintableStyles();
  const bodyContent = (docs && docs.length)
    ? docs.map((doc) => buildPrintableDocCard(doc, categoryLabel, doc._printAttachment || null)).join("\n")
    : `<p class="print-empty">No documents saved yet for ${safeCategory}.</p>`;
  const html = `<!DOCTYPE html>
  <html>
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>${safeCategory} — Printable Docs</title>
      <style>${printableStyles}</style>
      <script src="https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js"></script>
      <script src="https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js"></script>
    </head>
    <body>
      <header class="print-top">
        <div>
          <h1>${safeCategory} Documents</h1>
          <p class="print-generated">Generated ${generatedAt}</p>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="print-action" onclick="window.print()">Print</button>
          <button class="print-action secondary" id="sharePdfBtn" type="button">Share PDF</button>
        </div>
      </header>
      ${bodyContent}
      <script>
        async function sharePdf(){
          const btn = document.getElementById('sharePdfBtn');
          if (!btn) return;
          const jsPDF = window.jspdf && window.jspdf.jsPDF;
          async function waitForPdfTools(){
            const start = Date.now();
            while (Date.now() - start < 4000) {
              if (window.html2canvas && (window.jspdf && window.jspdf.jsPDF)) return true;
              await new Promise((r) => setTimeout(r, 150));
            }
            return false;
          }
          if (!window.html2canvas || !jsPDF) {
            const ready = await waitForPdfTools();
            if (!ready) {
              alert('PDF tools are still loading. Please try again in a moment.');
              return;
            }
          }
          btn.disabled = true;
          const original = btn.textContent;
          btn.textContent = 'Preparing…';
          try{
            const canvas = await window.html2canvas(document.body, { scale: 2, backgroundColor: '#ffffff' });
            const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
            const pageW = pdf.internal.pageSize.getWidth();
            const pageH = pdf.internal.pageSize.getHeight();
            const imgData = canvas.toDataURL('image/png');
            const imgW = pageW;
            const imgH = canvas.height * (imgW / canvas.width);
            let heightLeft = imgH;
            let y = 0;
            pdf.addImage(imgData, 'PNG', 0, 0, imgW, imgH);
            heightLeft -= pageH;
            while (heightLeft > 0) {
              pdf.addPage();
              y = heightLeft - imgH;
              pdf.addImage(imgData, 'PNG', 0, y, imgW, imgH);
              heightLeft -= pageH;
            }
            const blob = pdf.output('blob');
            const file = new File([blob], '${safeCategory.replace(/\\s+/g,'_')}_Documents.pdf', { type: 'application/pdf' });
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
              await navigator.share({ files: [file], title: '${safeCategory} Documents' });
            } else {
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = file.name;
              document.body.appendChild(a);
              a.click();
              a.remove();
              setTimeout(() => URL.revokeObjectURL(url), 60000);
            }
          } catch (err){
            console.error('PDF share failed', err);
            alert('Unable to create a PDF right now.');
          } finally {
            btn.disabled = false;
            btn.textContent = original;
          }
        }
        document.getElementById('sharePdfBtn')?.addEventListener('click', sharePdf);
        window.addEventListener('load', function(){
          window.focus();
          setTimeout(function(){ window.print(); }, 350);
        });
      </script>
    </body>
  </html>`;

  openPrintHtml(html, targetWin);
}

function openSingleDocPrintWindow(doc = {}, categoryLabel = "Documents", attachment = null, targetWin = null) {
  const safeCategory = escapeHtml(categoryLabel || "Documents");
  const generatedAt = escapeHtml(new Date().toLocaleString());
  const printableStyles = getPrintableStyles();
  const bodyContent = buildPrintableDocCard(doc, categoryLabel, attachment);
  const html = `<!DOCTYPE html>
  <html>
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>${safeCategory} — Document</title>
      <style>${printableStyles}</style>
      <script src="https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js"></script>
      <script src="https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js"></script>
    </head>
    <body>
      <header class="print-top">
        <div>
          <h1>${safeCategory} Document</h1>
          <p class="print-generated">Generated ${generatedAt}</p>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="print-action" onclick="window.print()">Print / Save PDF</button>
          <button class="print-action secondary" id="sharePdfBtn" type="button">Share PDF</button>
        </div>
      </header>
      ${bodyContent}
      <script>
        async function sharePdf(){
          const btn = document.getElementById('sharePdfBtn');
          if (!btn) return;
          const jsPDF = window.jspdf && window.jspdf.jsPDF;
          async function waitForPdfTools(){
            const start = Date.now();
            while (Date.now() - start < 4000) {
              if (window.html2canvas && (window.jspdf && window.jspdf.jsPDF)) return true;
              await new Promise((r) => setTimeout(r, 150));
            }
            return false;
          }
          if (!window.html2canvas || !jsPDF) {
            const ready = await waitForPdfTools();
            if (!ready) {
              alert('PDF tools are still loading. Please try again in a moment.');
              return;
            }
          }
          btn.disabled = true;
          const original = btn.textContent;
          btn.textContent = 'Preparing…';
          try{
            const canvas = await window.html2canvas(document.body, { scale: 2, backgroundColor: '#ffffff' });
            const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
            const pageW = pdf.internal.pageSize.getWidth();
            const pageH = pdf.internal.pageSize.getHeight();
            const imgData = canvas.toDataURL('image/png');
            const imgW = pageW;
            const imgH = canvas.height * (imgW / canvas.width);
            let heightLeft = imgH;
            let y = 0;
            pdf.addImage(imgData, 'PNG', 0, 0, imgW, imgH);
            heightLeft -= pageH;
            while (heightLeft > 0) {
              pdf.addPage();
              y = heightLeft - imgH;
              pdf.addImage(imgData, 'PNG', 0, y, imgW, imgH);
              heightLeft -= pageH;
            }
            const blob = pdf.output('blob');
            const file = new File([blob], '${safeCategory.replace(/\\s+/g,'_')}_Document.pdf', { type: 'application/pdf' });
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
              await navigator.share({ files: [file], title: '${safeCategory} Document' });
            } else {
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = file.name;
              document.body.appendChild(a);
              a.click();
              a.remove();
              setTimeout(() => URL.revokeObjectURL(url), 60000);
            }
          } catch (err){
            console.error('PDF share failed', err);
            alert('Unable to create a PDF right now.');
          } finally {
            btn.disabled = false;
            btn.textContent = original;
          }
        }
        document.getElementById('sharePdfBtn')?.addEventListener('click', sharePdf);
        window.addEventListener('load', function(){
          window.focus();
          setTimeout(function(){ window.print(); }, 350);
        });
      </script>
    </body>
  </html>`;

  openPrintHtml(html, targetWin);
}

function openPrintHtml(html, targetWin = null) {
  const isIOS = isIOSDevice();
  if (isIOS) {
    try {
      window.document.open();
      window.document.write(html);
      window.document.close();
      return;
    } catch (error) {
      console.warn("inline print fallback failed", error);
    }
  }
  const writeToWindow = (win) => {
    if (!win || win.closed) return false;
    try {
      win.document.open();
      win.document.write(html);
      win.document.close();
      win.focus?.();
      return true;
    } catch (error) {
      console.warn("print window write failed", error);
      return false;
    }
  };
  if (writeToWindow(targetWin)) return;

  let popup = null;
  try {
    popup = window.open("about:blank", "_blank", "noopener,width=900,height=700");
  } catch (error) {
    console.warn("popup blocked, using same tab", error);
  }
  if (writeToWindow(popup)) return;

  const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
  window.location.href = url;
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function buildPrintableDocCard(doc = {}, categoryLabel = "", attachment = null) {
  const meta = doc.content_json || {};
  const category = escapeHtml(categoryLabel || meta.primary_category || "Documents");
  const docTitle = escapeHtml(doc.title || "Document");
  const docType = escapeHtml(doc.doc_type || "General");
  const docDate = formatPrintableDate(meta.document_date);
  const createdAt = formatPrintableDate(doc.created_at);
  const tagsLine = Array.isArray(doc.tags) && doc.tags.length
    ? `<div class="print-tags"><strong>Tags:</strong> ${doc.tags.map(escapeHtml).join(", ")}</div>`
    : "";
  const attachmentBlock = (() => {
    const att = attachment
      || doc._printAttachment
      || (meta.inline_file ? {
        url: meta.inline_file.data_url,
        name: meta.inline_file.name || "attachment",
        previewType: detectPreviewType({ name: meta.inline_file.name, type: meta.inline_file.type }),
        note: "Embedded from upload",
      } : null);
    if (!att && !doc.storage_path && !meta.inline_file) return "";
    const name = escapeHtml(
      att?.name
      || (doc.storage_path || "").split("/").pop()
      || meta.inline_file?.name
      || "Attachment"
    );
    const note = att?.note ? `<span class="print-muted">(${escapeHtml(att.note)})</span>` : "";
    if (att?.url && att.previewType === "image") {
      const safeUrl = escapeHtml(att.url);
      return `<div class="print-attach"><strong>Attachment:</strong> ${name} ${note}</div><div style="margin-top:10px;"><img src="${safeUrl}" alt="${name}" style="max-width:100%;border-radius:12px;box-shadow:0 12px 24px rgba(15,23,42,.18);"></div>`;
    }
    if (att?.url) {
      const safeUrl = escapeHtml(att.url);
      return `<div class="print-attach"><strong>Attachment:</strong> <a href="${safeUrl}" target="_blank" rel="noopener">${name}</a> ${note}</div>`;
    }
    return `<div class="print-attach"><strong>Attachment:</strong> ${name} ${note}</div>`;
  })();

  const sections = [];
  if (doc.content) {
    sections.push(`<section><h3>Notes</h3>${formatParagraphs(doc.content)}</section>`);
  }
  const medical = buildMedicalPrintable(meta);
  if (medical) sections.push(medical);
  const minutes = buildMinutesPrintable(meta.minutes_payload);
  if (minutes) sections.push(minutes);
  if (!sections.length) {
    sections.push(`<p class="print-muted">No extended notes saved for this entry.</p>`);
  }

  const attachmentNote = (doc.storage_path || meta.inline_file) && !attachment?.url
    ? `<div class="print-note">Attachments stay private. Download from the STAR Docs page to share files.</div>`
    : "";

  return `
    <article class="print-card">
      <header>
        <p class="print-label">${category}</p>
        <h2>${docTitle}</h2>
      </header>
      <div class="print-meta">
        <div><strong>Type:</strong> ${docType}</div>
        ${docDate ? `<div><strong>Document Date:</strong> ${docDate}</div>` : ""}
        ${createdAt ? `<div><strong>Saved:</strong> ${createdAt}</div>` : ""}
      </div>
      ${tagsLine}
      ${attachmentBlock}
      <div class="print-body">
        ${sections.join("")}
      </div>
      ${attachmentNote}
    </article>
  `;
}

function buildMedicalPrintable(meta = {}) {
  const rows = [];
  if (meta.medical_next_datetime) {
    rows.push(`<div><strong>Next Appointment:</strong> ${formatPrintableDate(meta.medical_next_datetime)}</div>`);
  }
  if (meta.medical_next_link) {
    rows.push(`<div><strong>Meeting Link:</strong> ${formatLink(meta.medical_next_link)}</div>`);
  }
  if (meta.medical_notes) {
    rows.push(`<div><strong>Instructions:</strong> ${formatParagraphs(meta.medical_notes)}</div>`);
  }
  if (!rows.length) return "";
  return `<section><h3>Medical Details</h3>${rows.join("")}</section>`;
}

function buildMinutesPrintable(payload = null) {
  if (!payload || typeof payload !== "object") return "";
  const sections = [];
  const summary = [];
  if (payload.datetime) {
    summary.push(`<div><strong>Date:</strong> ${formatPrintableDate(payload.datetime)}</div>`);
  }
  if (payload.location) {
    summary.push(`<div><strong>Location:</strong> ${escapeHtml(payload.location)}</div>`);
  }
  if (payload.facilitator) {
    summary.push(`<div><strong>Facilitator:</strong> ${escapeHtml(payload.facilitator)}</div>`);
  }
  if (payload.next_datetime) {
    summary.push(`<div><strong>Next Meeting:</strong> ${formatPrintableDate(payload.next_datetime)}</div>`);
  }
  if (payload.next_link) {
    summary.push(`<div><strong>Next Link:</strong> ${formatLink(payload.next_link)}</div>`);
  }
  if (summary.length) {
    sections.push(`<div class="print-meta">${summary.join("")}</div>`);
  }
  const attendeesSection = formatListSection("Attendees", payload.attendees);
  if (attendeesSection) sections.push(attendeesSection);
  const agendaSection = formatListSection("Agenda", payload.agenda);
  if (agendaSection) sections.push(agendaSection);
  if (payload.discussion) {
    sections.push(`<section><h4>Discussion</h4>${formatParagraphs(payload.discussion)}</section>`);
  }
  const decisionsSection = formatListSection("Decisions", payload.decisions);
  if (decisionsSection) sections.push(decisionsSection);
  const actionsSection = formatListSection("Action Items", payload.action_items);
  if (actionsSection) sections.push(actionsSection);
  if (!sections.length) return "";
  return `<section><h3>Meeting Minutes</h3>${sections.join("")}</section>`;
}

function formatListSection(title, items = []) {
  if (!Array.isArray(items) || !items.length) return "";
  const safeTitle = escapeHtml(title);
  const list = items.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  return `<section class="print-list"><h4>${safeTitle}</h4><ul>${list}</ul></section>`;
}

function formatParagraphs(text = "") {
  if (!text) return "";
  const safe = escapeHtml(text).replace(/\r\n/g, "\n");
  const blocks = safe.split(/\n\s*\n/);
  return blocks.map((block) => `<p>${block.replace(/\n/g, "<br>")}</p>`).join("");
}

function formatPrintableDate(value) {
  if (!value) return "";
  try {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return escapeHtml(String(value));
    return date.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
  } catch {
    return escapeHtml(String(value));
  }
}

function formatLink(url = "") {
  if (!url) return "";
  const trimmed = String(url).trim();
  const safe = escapeHtml(trimmed);
  return `<a href="${safe}" target="_blank" rel="noopener">${safe}</a>`;
}

function escapeHtml(input = "") {
  return String(input)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function preparePrintDocs(docs = []) {
  const prepared = [];
  for (const doc of docs || []) {
    const meta = doc.content_json || {};
    let attachment = null;
    if (meta.inline_file?.data_url) {
      attachment = {
        url: meta.inline_file.data_url,
        name: meta.inline_file.name || "attachment",
        previewType: detectPreviewType({ name: meta.inline_file.name, type: meta.inline_file.type }),
        note: "Embedded from upload",
      };
    } else if (doc.storage_path) {
      try {
        const blob = await fetchPrivateBlob(doc.storage_path);
        if (blob?.blob) {
          attachment = {
            url: await new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result);
              reader.onerror = () => reject(reader.error || new Error("read failed"));
              reader.readAsDataURL(blob.blob);
            }),
            name: meta.file_name || (doc.storage_path || "").split("/").pop() || "attachment",
            previewType: inferPreviewTypeFromContentType(blob.type)
              || detectPreviewType({
                path: doc.storage_path,
                type: doc.file_type || doc.mime_type || meta.file_type,
                name: meta.file_name
              }),
            note: "Embedded for printing",
          };
          prepared.push({ ...doc, _printAttachment: attachment });
          continue;
        }
      } catch (error) {
        console.warn("print blob fetch failed", error?.message || error);
      }
      attachment = {
        url: null,
        name: meta.file_name || (doc.storage_path || "").split("/").pop() || "attachment",
        previewType: detectPreviewType({
          path: doc.storage_path,
          type: doc.file_type || doc.mime_type || meta.file_type,
          name: meta.file_name
        }),
        note: "Attachments stay private. Download from the STAR Docs page to share files.",
      };
      try {
        const signed = await getSignedUrlForDoc(doc);
        attachment.url = signed;
        attachment.note = "";
        if (attachment.previewType === "image") {
          try {
            attachment.url = await fetchAsDataUrl(signed);
            attachment.note = "Embedded for printing";
          } catch (embedErr) {
            console.warn("print image embed failed", embedErr?.message || embedErr);
            // leave signed URL; image may still load remotely
            attachment.url = signed;
            attachment.note = "Attachment image could not be embedded (link only)";
          }
        }
      } catch (error) {
        console.warn("print doc signed url failed", error?.message || error, "path:", doc.storage_path);
        attachment.note = `Attachment unavailable (${error?.message || "signed URL failed"})`;
      }
    }
    prepared.push({ ...doc, _printAttachment: attachment });
  }
  return prepared;
}

async function fetchAsDataUrl(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch failed ${res.status}`);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("read failed"));
    reader.readAsDataURL(blob);
  });
}
