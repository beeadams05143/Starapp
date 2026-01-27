import { rest, getSessionFromStorage } from "../restClient.js?v=2025.01.09E";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../supabaseClient.js?v=2025.01.09E";

const statusEl = document.getElementById("shareStatus");
const pinCard = document.getElementById("pinCard");
const pinInput = document.getElementById("sharePinInput");
const pinSubmit = document.getElementById("sharePinSubmit");
const pinStatus = document.getElementById("pinStatus");
const docContent = document.getElementById("docContent");
const docMeta = document.getElementById("docMeta");
const docNotes = document.getElementById("docNotes");
const docAttachment = document.getElementById("docAttachment");

const token = new URLSearchParams(window.location.search).get("token");

function ensureLoggedIn() {
  const session = getSessionFromStorage();
  if (!session?.access_token) {
    const redirect = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.href = `/login.html?redirect=${redirect}`;
    throw new Error("Login required.");
  }
  return session;
}

function escapeHtml(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDate(value) {
  if (!value) return "";
  const dt = new Date(value);
  return Number.isNaN(dt.getTime())
    ? String(value)
    : dt.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
}

function formatLink(url) {
  const safe = escapeHtml(url);
  return `<a href="${safe}" target="_blank" rel="noopener">${safe}</a>`;
}

async function hashPin(pin) {
  const data = new TextEncoder().encode(pin.trim());
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function detectPreviewType({ name = "", type = "", dataUrl = "" } = {}) {
  const file = `${name}`.toLowerCase();
  const mime = `${type}`.toLowerCase();
  if (mime.includes("pdf") || file.endsWith(".pdf") || dataUrl.startsWith("data:application/pdf")) return "pdf";
  if (mime.startsWith("image/") || file.endsWith(".jpg") || file.endsWith(".jpeg") || dataUrl.startsWith("data:image/")) return "image";
  return "";
}

async function getSignedUrl(storagePath) {
  const session = ensureLoggedIn();
  const safePath = encodeURIComponent(storagePath).replace(/%2F/g, "/");
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/documents/${safePath}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ expiresIn: 60 * 60 }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(text || "Signed URL failed");
  const data = text ? JSON.parse(text) : null;
  return data?.signedUrl || data?.signedURL || "";
}

async function fetchSharedDoc() {
  if (!token) throw new Error("Missing share token.");
  const nowIso = new Date().toISOString();
  const query = [
    "select=id,title,doc_type,content,content_json,storage_path,tags,created_at",
    `content_json->>share_token=eq.${encodeURIComponent(token)}`,
    "content_json->>share_used_at=is.null",
    `content_json->>share_expires_at=gt.${encodeURIComponent(nowIso)}`,
  ].join("&");
  const rows = await rest(`documents?${query}`);
  return rows?.[0] || null;
}

async function consumeShareToken(doc) {
  const content = { ...(doc.content_json || {}) };
  content.share_used_at = new Date().toISOString();
  content.share_token = null;
  content.share_pin_hash = null;

  await rest(`documents?id=eq.${encodeURIComponent(doc.id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ content_json: content }),
  });
}

function renderDoc(doc, attachment) {
  const meta = [];
  meta.push(`<div><strong>Title</strong><br>${escapeHtml(doc.title || "Untitled")}</div>`);
  meta.push(`<div><strong>Type</strong><br>${escapeHtml(doc.doc_type || "Document")}</div>`);
  meta.push(`<div><strong>Date</strong><br>${formatDate(doc.content_json?.document_date || doc.created_at)}</div>`);
  if (doc.tags?.length) {
    meta.push(`<div><strong>Tags</strong><br>${escapeHtml(doc.tags.join(", "))}</div>`);
  }
  docMeta.innerHTML = meta.join("");

  const notes = [];
  if (doc.content) notes.push(`<p>${escapeHtml(doc.content)}</p>`);
  const med = doc.content_json || {};
  if (med.medical_next_datetime) {
    notes.push(`<p><strong>Next Appt:</strong> ${formatDate(med.medical_next_datetime)}</p>`);
  }
  if (med.medical_next_link) {
    notes.push(`<p><strong>Meeting Link:</strong> ${formatLink(med.medical_next_link)}</p>`);
  }
  if (med.medical_notes) {
    notes.push(`<p><strong>Instructions:</strong><br>${escapeHtml(med.medical_notes)}</p>`);
  }
  docNotes.innerHTML = notes.length ? `<h3>Notes</h3>${notes.join("")}` : "";

  if (attachment?.url) {
    const type = attachment.previewType;
    const download = `<a class="btn secondary" href="${attachment.url}" target="_blank" rel="noopener" download>Download</a>`;
    const title = `<h3>Attachment</h3><div class="attachment">${download}`;
    if (type === "image") {
      docAttachment.innerHTML = `${title}<img src="${attachment.url}" alt="Attachment"></div>`;
    } else if (type === "pdf") {
      docAttachment.innerHTML = `${title}<iframe src="${attachment.url}" title="Attachment PDF"></iframe></div>`;
    } else {
      docAttachment.innerHTML = `${title}<p class="status">Preview unavailable. Use download.</p></div>`;
    }
  } else {
    docAttachment.innerHTML = `<h3>Attachment</h3><p class="status">No attachment on this document.</p>`;
  }

  docContent.hidden = false;
}

async function buildAttachment(doc) {
  const inline = doc.content_json?.inline_file;
  if (inline?.data_url) {
    return {
      url: inline.data_url,
      previewType: detectPreviewType({ name: inline.name, type: inline.type, dataUrl: inline.data_url }),
    };
  }
  if (doc.storage_path) {
    const signed = await getSignedUrl(doc.storage_path);
    return { url: signed, previewType: detectPreviewType({ name: doc.storage_path, type: doc.file_type }) };
  }
  return null;
}

async function init() {
  try {
    ensureLoggedIn();
    statusEl.textContent = "Validating link…";
    const doc = await fetchSharedDoc();
    if (!doc) {
      statusEl.innerHTML = "<span class=\"error\">Link expired or already used.</span>";
      return;
    }
    pinCard.hidden = false;
    statusEl.textContent = "Enter PIN to unlock.";

    pinSubmit.addEventListener("click", async () => {
      const pin = (pinInput.value || "").trim();
      if (!pin) {
        pinStatus.textContent = "PIN required.";
        return;
      }
      pinSubmit.disabled = true;
      pinStatus.textContent = "Checking PIN…";
      try {
        const hash = await hashPin(pin);
        if (hash !== doc.content_json?.share_pin_hash) {
          pinStatus.innerHTML = "<span class=\"error\">Incorrect PIN.</span>";
          return;
        }
        pinStatus.textContent = "Unlocking…";
        await consumeShareToken(doc);
        const attachment = await buildAttachment(doc);
        renderDoc(doc, attachment);
        pinCard.hidden = true;
        statusEl.textContent = "Shared document unlocked.";
      } catch (error) {
        console.error(error);
        pinStatus.innerHTML = "<span class=\"error\">Unable to unlock. Try again.</span>";
      } finally {
        pinSubmit.disabled = false;
      }
    });
  } catch (error) {
    console.error(error);
    statusEl.innerHTML = "<span class=\"error\">Unable to load share link.</span>";
  }
}

init();
