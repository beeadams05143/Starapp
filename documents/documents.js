// documents.js
import { rest, getSessionFromStorage, requireSession } from "../restClient.js?v=2025.10.16d";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../supabaseClient.js?v=2025.10.16d";
import { uploadJsonToBucket, downloadJsonFromBucket } from "../shared-storage.js?v=2025.10.16d";

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

function detectPreviewType(meta = {}) {
  if (looksLikeImageMeta(meta)) return "image";
  if (looksLikePdfMeta(meta)) return "pdf";
  return null;
}

const attachmentViewer = (() => {
  let overlay = null;
  function cleanupPreviewUrl() {
    // reserved for future object URLs; no-op now
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
      }
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") overlay?.classList.remove("open");
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
    const frame = document.createElement("iframe");
    frame.title = title || "Attachment";
    frame.src = url;
    frame.loading = "lazy";
    contentEl.innerHTML = "";
    contentEl.appendChild(frame);
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
      ? new Date(doc.content_json.document_date).toLocaleString()
      : new Date(doc.created_at).toLocaleString();

    let medicalBlock = "";
    if (activeCategory === "Medical" && doc.content_json) {
      const nx = doc.content_json.medical_next_datetime;
      const lk = doc.content_json.medical_next_link;
      const nt = doc.content_json.medical_notes;
      const nxStr = nx ? new Date(nx).toLocaleString() : "";
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
        ? detectPreviewType({ name: inlineFile.name, type: inlineFile.type })
        : detectPreviewType({ path: doc.storage_path || "", type: doc.file_type || doc.mime_type });

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
    }
    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "btn secondary doc-edit-action";
    editBtn.dataset.docId = docId;
    editBtn.textContent = "Edit";
    editBtn.setAttribute("aria-label", `Edit ${doc.title}`);
    linksHolder.appendChild(editBtn);

    const exportBtn = document.createElement("button");
    exportBtn.type = "button";
    exportBtn.className = "btn doc-export-action";
    exportBtn.dataset.docId = docId;
    exportBtn.textContent = "Export PDF";
    exportBtn.setAttribute("aria-label", `Export ${doc.title} as PDF`);
    linksHolder.appendChild(exportBtn);

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
  const previewType = trigger.dataset.previewType
    || (inlineFile
      ? detectPreviewType({ name: inlineFile.name, type: inlineFile.type })
      : detectPreviewType({ path: doc.storage_path || "", type: doc.file_type || doc.mime_type }));

  let url = inlineFile?.data_url || "";
  const originalText = trigger.dataset.label || trigger.textContent;
  if (!trigger.dataset.label) trigger.dataset.label = trigger.textContent;

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

  if (action === "download") {
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener";
    if (inlineFile?.name) {
      a.download = inlineFile.name;
    } else if (doc.storage_path) {
      a.download = doc.storage_path.split("/").pop() || "document";
    }
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
  if (!pendingWin) return;
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

function openPrepWindow(message = "Building PDF…") {
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

function openPrintableDocsWindow(docs = [], categoryLabel = "Documents") {
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
      <title>${safeCategory} — Printable Docs</title>
      <style>${printableStyles}</style>
    </head>
    <body>
      <header class="print-top">
        <div>
          <h1>${safeCategory} Documents</h1>
          <p class="print-generated">Generated ${generatedAt}</p>
        </div>
        <button class="print-action" onclick="window.print()">Print</button>
      </header>
      ${bodyContent}
      <script>
        window.addEventListener('load', function(){
          window.focus();
          setTimeout(function(){ window.print(); }, 350);
        });
      </script>
    </body>
  </html>`;

  openPrintHtml(html);
}

function openSingleDocPrintWindow(doc = {}, categoryLabel = "Documents", attachment = null) {
  const safeCategory = escapeHtml(categoryLabel || "Documents");
  const generatedAt = escapeHtml(new Date().toLocaleString());
  const printableStyles = getPrintableStyles();
  const bodyContent = buildPrintableDocCard(doc, categoryLabel, attachment);
  const html = `<!DOCTYPE html>
  <html>
    <head>
      <meta charset="UTF-8" />
      <title>${safeCategory} — Document</title>
      <style>${printableStyles}</style>
    </head>
    <body>
      <header class="print-top">
        <div>
          <h1>${safeCategory} Document</h1>
          <p class="print-generated">Generated ${generatedAt}</p>
        </div>
        <button class="print-action" onclick="window.print()">Print / Save PDF</button>
      </header>
      ${bodyContent}
      <script>
        window.addEventListener('load', function(){
          window.focus();
          setTimeout(function(){ window.print(); }, 350);
        });
      </script>
    </body>
  </html>`;

  openPrintHtml(html);
}

function openPrintHtml(html) {
  const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
  let popup = null;
  try {
    popup = window.open(url, "_blank", "noopener,width=900,height=700");
  } catch (error) {
    console.warn("popup blocked, using same tab", error);
  }
  if (!popup) {
    window.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return;
  }
  // If browser opens about:blank first, ensure it navigates to the blob URL shortly after.
  setTimeout(() => {
    try {
      if (!popup.location || popup.location.href === "about:blank") {
        popup.location.href = url;
      }
    } catch {
      // ignore cross-window access issues; user will still see the popup
    }
  }, 150);
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
    return date.toLocaleString();
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
      attachment = {
        url: null,
        name: (doc.storage_path || "").split("/").pop() || "attachment",
        previewType: detectPreviewType({ path: doc.storage_path, type: doc.file_type || doc.mime_type }),
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
