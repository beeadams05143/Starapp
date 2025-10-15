// caregiver-report-supabase.js — PRODUCTION SAFE (client-side filtering)
import { supabase } from './supabaseClient.js?v=2025.10.15c';

/* ---------- tiny utils ---------- */
const toDayISO = d =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString().slice(0, 10);

const normTs = r => new Date(r?.timestamp || r?.created_at || r?.submitted_at || Date.now());

/* ---------- summaries for KPIs ---------- */
function summarize(entries){
  const yesNo = k => {
    const vals = entries.map(e=>e[k]).filter(v=>v===true || v===false);
    const y = vals.filter(Boolean).length;
    return vals.length ? Math.round((100*y)/vals.length) : 0;
  };
  const sum = k => entries.reduce((a,b)=>a + (Number(b[k]||0)), 0);
  const promptVals = entries.map(e=>Number(e.new_skill_score)).filter(Number.isFinite);
  const promptAvg = promptVals.length
    ? +(promptVals.reduce((a,b)=>a+b,0)/promptVals.length).toFixed(2)
    : null;

  return {
    counts: { entries: entries.length },
    percents: {
      hygiene_yes: yesNo('hygiene'),
      food_prep_yes: yesNo('food_prep'),
      cleanup_yes: yesNo('cleanup')
    },
    totals: {
      vocational_minutes: sum('vocational_time'),
      community_minutes : sum('community_time')
    },
    averages: { new_skill_score: promptAvg }
  };
}

/* ---------- chart series (monthly) ---------- */
function buildSeries(entries){
  const byMonth = new Map();
  for (const e of entries){
    const ts = normTs(e);
    const key = ts.toISOString().slice(0,7); // YYYY-MM
    const agg = byMonth.get(key) || {h:0,f:0,c:0, prompts:[], cnt:0};
    agg.cnt++;
    if (e.hygiene===true)   agg.h++;
    if (e.food_prep===true) agg.f++;
    if (e.cleanup===true)   agg.c++;
    const p = Number(e.new_skill_score);
    if (Number.isFinite(p)) agg.prompts.push(p);
    byMonth.set(key, agg);
  }
  const months = Array.from(byMonth.keys()).sort();
  const monthly = months.map(m => {
    const a = byMonth.get(m);
    const avgP = a.prompts.length
      ? +(a.prompts.reduce((s,v)=>s+v,0)/a.prompts.length).toFixed(2)
      : null;
    return { x: m, hygiene_yes: a.h, food_prep_yes: a.f, cleanup_yes: a.c, avg_new_skill_score: avgP };
  });
  return { daily: [], monthly };
}

/* ---------- main loader (safe) ---------- */
export async function loadCaregiverCheckins(userId, { range='all' } = {}){
  // Resolve user id if not passed
  let uid = userId || null;
  if (!uid) {
    try {
      const { data } = await supabase.auth.getSession();
      uid = data?.session?.user?.id || null;
    } catch {}
  }

  // Compute client-side date window
  const now = new Date();
  let start = new Date(0);
  if (range === 'day')     { start = new Date(now); start.setHours(0,0,0,0); }
  if (range === 'month')   { start = new Date(now.getFullYear(), now.getMonth(), 1); }
  if (range === 'year')    { start = new Date(now.getFullYear(), 0, 1); }
  if (range === '6months') { start = new Date(now); start.setDate(start.getDate()-183); }

  // SAFEST query: no server-side filters/order that might reference missing columns
  let q = supabase.from('caregiver_checkins').select('*');
  if (uid) q = q.eq('user_id', uid);

  const { data, error } = await q;
  if (error) {
    console.error('Supabase caregiver_checkins error:', error);
    return {
      entries: [],
      summary: summarize([]),
      charts: buildSeries([]),
      range_label: (range==='all' ? 'All time' : range)
    };
  }

  // Normalize & filter client-side
  const all = (data || []).map(r => ({
    ...r,
    // unify for downstream UI:
    timestamp: r.timestamp || r.created_at || r.submitted_at
  }));

  const filtered = all.filter(r => {
    const ts = normTs(r);
    return ts >= start && ts <= now;
  });

  // Sort newest → oldest
  filtered.sort((a,b) => normTs(b) - normTs(a));

  return {
    entries: filtered,
    summary: summarize(filtered),
    charts: buildSeries(filtered),
    range_label: (range==='all' ? 'All time' : range)
  };
}

/* ---------- row formatter for simple tables ---------- */
export function formatEntryForList(e){
  const ts = e.timestamp || e.created_at || e.submitted_at || Date.now();
  const dt = new Date(ts).toLocaleString('en-US', { hour12: true });
  const yn = v => v===true ? 'Yes' : v===false ? 'No' : '—';
  return {
    dateTime: dt,
    hygiene: yn(e.hygiene),
    food_prep: yn(e.food_prep),
    cleanup: yn(e.cleanup),
    vocational_time: e.vocational_time ?? '—',
    community_time : e.community_time ?? '—',
    new_skill_score: e.new_skill_score ?? '—',
    notes: e.caregiver_notes || '',
    file_url: e.file_url || ''
  };
}
