// documents.js
import { rest, getSessionFromStorage } from "../restClient.js?v=2025.10.16d";
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
  let cached = null;
  try { cached = localStorage.getItem(GROUP_KEY); } catch { cached = null; }
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
      try { localStorage.setItem(GROUP_KEY, gid); } catch {}
    }
    return gid;
  } catch (error) {
    console.warn("group lookup failed", error?.message || error);
    return null;
  }
}

const normalizeTags = (tags) => Array.isArray(tags) ? tags : (typeof tags === "string" ? tags.split(",").map(s => s.trim()).filter(Boolean) : []);

function mapDocRow(row) {
  if (!row) return null;
  return {
    id: row.id || crypto.randomUUID(),
    title: row.title || "Untitled",
    doc_type: row.doc_type || "upload",
    content: row.content || "",
    content_json: row.content_json || {},
    tags: normalizeTags(row.tags),
    storage_path: row.storage_path || null,
    created_by: row.created_by || USER_ID,
    created_at: row.created_at || new Date().toISOString()
  };
}

async function ensureDocsStore(forceReload = false) {
  if (docsStoreLoaded && !forceReload) return docsStore;
  if (docsStorePromise && !forceReload) return docsStorePromise;
  docsStorePromise = (async () => {
    GROUP_ID = GROUP_ID || await ensureGroupId(USER_ID);
    if (!GROUP_ID) throw new Error("Join a group to share documents.");
    let data = await downloadJsonFromBucket(SHARED_DOC_BUCKET, docsPathForGroup(GROUP_ID));
    if (!data || typeof data !== "object") {
      data = await seedDocsFromSupabase();
    }
    docsStore = {
      documents: Array.isArray(data?.documents) ? data.documents : [],
      updated_at: data?.updated_at || null,
    };
    docsStoreLoaded = true;
    return docsStore;
  })();
  try {
    return await docsStorePromise;
  } finally {
    docsStorePromise = null;
  }
}

async function seedDocsFromSupabase() {
  let rows = [];
  try {
    rows = await rest("documents?select=*&order=created_at.desc");
  } catch (error) {
    console.warn("docs legacy load failed", error?.message || error);
    return { documents: [], updated_at: null };
  }
  if (!Array.isArray(rows) || !rows.length) {
    return { documents: [], updated_at: null };
  }
  const normalized = rows.map(mapDocRow).filter(Boolean);
  const payload = {
    documents: normalized,
    migrated_from: "documents",
    updated_at: new Date().toISOString(),
  };
  try {
    await uploadJsonToBucket(SHARED_DOC_BUCKET, docsPathForGroup(GROUP_ID), payload);
  } catch (error) {
    console.warn("docs cache store skipped", error?.message || error);
  }
  return payload;
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

const IMAGE_EXT_RE = /\.(png|jpe?g|gif|bmp|webp|svg|heic|heif|tiff)$/i;
function looksLikeImageMeta(meta = {}) {
  if (!meta) return false;
  const type = meta.type || "";
  if (type && /^image\//i.test(type)) return true;
  const source = (meta.name || meta.path || meta.url || "").split("?")[0].toLowerCase();
  if (!source) return false;
  return IMAGE_EXT_RE.test(source);
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
  function open({ title, url, downloadName, note, previewable = true } = {}) {
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
    if (previewable) {
      renderImage(contentEl, { title, url });
    } else {
      showPreviewFallback(contentEl);
    }
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
  const session = getSessionFromStorage();
  const token = session?.access_token;
  if (!token) throw new Error("Not logged in.");
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/documents/${storagePath}`, {
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

/* ------------ category tabs + deep link ------------ */
const urlParams = new URLSearchParams(location.search);
let activeCategory = urlParams.get("cat") || "Finance";
document.body.dataset.docCat = activeCategory;

const tabs = document.querySelectorAll(".tabbtn");
const catInput = document.getElementById("docCategory");
const catLabel = document.getElementById("catLabel");
const catListLabel = document.getElementById("catListLabel");
const medicalExtrasEl = document.getElementById("medicalExtras");

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

tabs.forEach(btn => {
  btn.addEventListener("click", async () => {
    tabs.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    activeCategory = btn.dataset.cat;

    if (catInput) catInput.value = activeCategory;
    if (catLabel) catLabel.textContent = activeCategory;
    if (catListLabel) catListLabel.textContent = activeCategory;

    const p = new URLSearchParams(location.search);
    p.set("cat", activeCategory);
    history.replaceState(null, "", `${location.pathname}?${p.toString()}`);

    updateExtrasVisibility();
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

      let storage_path = null;
      let inline_file = null;
      if (file) {
        const uploadResult = await uploadFileToBucket({ file });
        storage_path = uploadResult.storagePath;
        inline_file = uploadResult.inlineFile;
      }

      const session = getSessionFromStorage();
      const user = session?.user;
      if (!user?.id) throw new Error("Not logged in.");
      await ensureDocsStore();

      const extraTags = tagsStr ? tagsStr.split(",").map(s => s.trim()).filter(Boolean) : [];
      const tags = [activeCategory, ...extraTags];

      const content_json = { primary_category: activeCategory, document_date: when || null };
      if (activeCategory === "Medical") {
        content_json.medical_next_datetime = medNext;
        content_json.medical_next_link     = medLink;
        content_json.medical_notes         = medNotes;
      }
      if (inline_file) {
        content_json.inline_file = inline_file;
      }

      await rest("documents", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify([{
        title,
        doc_type: docType,
        content: desc || null,
        content_json,
        tags,
        storage_path,
        created_by: user.id
      }]),
      });

      const newEntry = {
        id: crypto.randomUUID(),
        title,
        doc_type: docType,
        content: desc || "",
        content_json,
        tags,
        storage_path,
        created_by: user.id,
        created_at: new Date().toISOString()
      };
      if (inline_file) newEntry.content_json.inline_file = inline_file;
      docsStore.documents = [newEntry, ...(docsStore.documents || [])].slice(0, 200);
      await persistDocsStore(newEntry.created_at);

      alert("Saved!");
      prettyForm.reset();
      if (catInput) catInput.value = activeCategory; // keep tab label
      await loadDocuments();
    } catch (err) {
      console.error(err);
      alert("Save failed: " + err.message);
    }
  });
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
  docsStore.documents = [newEntry, ...(docsStore.documents || [])].slice(0, 200);
  await persistDocsStore(newEntry.created_at);
  return newEntry;
}

async function renderDocuments(list, docs) {
  const filtered = (docs || []).filter(d => {
    const inTags = Array.isArray(d.tags) && d.tags.includes(activeCategory);
    const inJson = d.content_json?.primary_category === activeCategory;
    return inTags || inJson;
  });

  list.innerHTML = "";
  for (const doc of filtered) {
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
      const canPreview = inlineFile
        ? looksLikeImageMeta({ name: inlineFile.name, type: inlineFile.type })
        : looksLikeImageMeta({ path: doc.storage_path || "" });

      const viewBtn = document.createElement("button");
      viewBtn.type = "button";
      viewBtn.className = "btn secondary doc-attachment-action";
      viewBtn.dataset.docId = doc.id;
      viewBtn.dataset.action = "view";
      viewBtn.dataset.previewable = canPreview ? "1" : "";
      viewBtn.textContent = canPreview ? "View Attachment" : "Open Attachment";
      linksHolder.appendChild(viewBtn);

      const downloadBtn = document.createElement("button");
      downloadBtn.type = "button";
      downloadBtn.className = "btn secondary doc-attachment-action";
      downloadBtn.dataset.docId = doc.id;
      downloadBtn.dataset.action = "download";
      downloadBtn.textContent = "Download";
      linksHolder.appendChild(downloadBtn);

      if (inlineFile?.data_url && !doc.storage_path) {
        const note = document.createElement("div");
        note.className = "muted";
        note.style.fontSize = "13px";
        note.style.flexBasis = "100%";
        note.textContent = "File stored inline until storage bucket is available.";
        linksHolder.appendChild(note);
      }
    } else {
      linksHolder.textContent = "";
    }

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
  const canPreview = trigger.dataset.previewable === "1"
    || (inlineFile
      ? looksLikeImageMeta({ name: inlineFile.name, type: inlineFile.type })
      : looksLikeImageMeta({ path: doc.storage_path || "" }));

  let url = inlineFile?.data_url || doc._cachedSignedUrl || "";
  const originalText = trigger.dataset.label || trigger.textContent;
  if (!trigger.dataset.label) trigger.dataset.label = trigger.textContent;

  if (!url && doc.storage_path) {
    try {
      trigger.disabled = true;
      trigger.textContent = action === "download" ? "Preparing…" : "Opening…";
      url = await getSignedUrl(doc.storage_path);
      doc._cachedSignedUrl = url;
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

  if (canPreview) {
    attachmentViewer.open({
      title: doc.title || "Attachment",
      url,
      downloadName: inlineFile?.name || (doc.storage_path || "").split("/").pop() || "",
      previewable: true,
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

document.addEventListener("click", (event) => {
  const trigger = event.target.closest(".doc-attachment-action");
  if (trigger) {
    event.preventDefault();
    handleAttachmentAction(trigger);
  }
});
