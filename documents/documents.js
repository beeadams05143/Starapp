// documents.js
import { createClient } from "https://esm.sh/@supabase/supabase-js";

const supabase = createClient(
  "https://okfsobfyhpforyqogjea.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9rZnNvYmZ5aHBmb3J5cW9namVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI2MTg3NDAsImV4cCI6MjA2ODE5NDc0MH0.qtuG1_LbSPdeRtnyElo-F0agTSGclqQQyap-USHKWFw"
);

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


/* ------------ helpers ------------ */
async function uploadFileToBucket({ file }) {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) throw new Error("Not logged in.");
  const userId = userData.user.id;

  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const safe = file.name.replace(/\s+/g, "_");
  const path = `${userId}/${y}/${m}/${crypto.randomUUID()}_${safe}`;

  const { error } = await supabase.storage.from("documents").upload(path, file, { upsert: false });
  if (error) throw error;
  return path;
}

async function getSignedUrl(storagePath) {
  const { data, error } = await supabase.storage.from("documents").createSignedUrl(storagePath, 60 * 60);
  if (error) throw error;
  return data.signedUrl;
}

/* ------------ category tabs + deep link ------------ */
const urlParams = new URLSearchParams(location.search);
let activeCategory = urlParams.get("cat") || "Finance";

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
      if (file) storage_path = await uploadFileToBucket({ file });

      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) throw new Error("Not logged in.");

      const extraTags = tagsStr ? tagsStr.split(",").map(s => s.trim()).filter(Boolean) : [];
      const tags = [activeCategory, ...extraTags];

      const content_json = { primary_category: activeCategory, document_date: when || null };
      if (activeCategory === "Medical") {
        content_json.medical_next_datetime = medNext;
        content_json.medical_next_link     = medLink;
        content_json.medical_notes         = medNotes;
      }

      const { error } = await supabase.from("documents").insert([{
        title,
        doc_type: docType,
        content: desc || null,
        content_json,
        tags,
        storage_path,
        created_by: userData.user.id
      }]);
      if (error) throw error;

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

  const { data, error } = await supabase
    .from("documents")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) { console.error(error); return; }

  const filtered = (data || []).filter(d => {
    const inTags = Array.isArray(d.tags) && d.tags.includes(activeCategory);
    const inJson = d.content_json?.primary_category === activeCategory;
    return inTags || inJson;
  });

  list.innerHTML = "";
  for (const doc of filtered) {
    const card = document.createElement("div");
    card.className = "card";

    let linkHTML = "";
    if (doc.storage_path) {
      try {
        linkHTML = `<a href="${await getSignedUrl(doc.storage_path)}" target="_blank" rel="noopener">Download</a>`;
      } catch {}
    }
    const desc = doc.content
      ? `<div class="muted" style="margin-top:6px; white-space:pre-wrap">${(doc.content || "").slice(0,240)}${doc.content.length>240?"…":""}</div>`
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
      <div style="margin-top:8px">${linkHTML}</div>
    `;
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
document.addEventListener('DOMContentLoaded', () => {
  const f = document.getElementById('minutesForm');
  if (!f) return;

  f.addEventListener('submit', (e) => {
    e.preventDefault();
    const val = id => document.getElementById(id)?.value || '';
    const minutes = {
      title: val('title'),
      dateTime: val('dateTime'),
      location: val('location'),
      facilitator: val('facilitator'),
      attendees: val('attendeesField'),
      agenda: val('agenda'),
      notes: val('notes'),
      decisions: val('decisions'),
      actions: val('actions'),
      nextDate: val('nextDate'),
      nextLink: val('nextLink'),
    };
    console.log('Minutes to save:', minutes);
    // TODO: save to Supabase/localStorage as you prefer
  });
});
// keep this
document.getElementById('minutesForm')?.addEventListener('submit', (e) => {
  e.preventDefault();
  saveMinutesRich();       // whatever you call to save
});

document.getElementById('clearMinutesBtn')?.addEventListener('click', () => {
  document.getElementById('minutesForm')?.reset();
});
