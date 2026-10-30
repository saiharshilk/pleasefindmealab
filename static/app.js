"use strict";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// Only link to real http(s) URLs coming back from the API.
const safeUrl = (u) => (/^https?:\/\//i.test(u || "") ? u : null);
const ROLE = { senior: "senior author", corresponding: "corresponding author", first: "first author", middle: "co-author" };

const COUNTRIES = [
  ["", "Anywhere"], ["US", "United States"], ["CA", "Canada"], ["GB", "United Kingdom"], ["DE", "Germany"],
  ["FR", "France"], ["NL", "Netherlands"], ["CH", "Switzerland"], ["IN", "India"], ["SG", "Singapore"], ["AU", "Australia"],
];
const YEARS = [["2", "Last 2 years"], ["3", "Last 3 years"], ["5", "Last 5 years"]];
const DEFAULTS = { country: "US", years: "3" };

for (const sel of document.querySelectorAll(".country-select")) {
  sel.innerHTML = COUNTRIES.map(([v, t]) => `<option value="${v}">${t}</option>`).join("");
  sel.value = DEFAULTS.country;
}
for (const sel of document.querySelectorAll(".years-select")) {
  sel.innerHTML = YEARS.map(([v, t]) => `<option value="${v}">${t}</option>`).join("");
  sel.value = DEFAULTS.years;
}

async function api(path) {
  const r = await fetch(path);
  const body = await r.json().catch(() => ({}));
  if (!r.ok) {
    const d = body.detail;
    throw new Error(typeof d === "string" ? d : "Something went wrong. Please try again.");
  }
  return body;
}

function paperItem(p, showRole) {
  const url = safeUrl(p.doi);
  const title = url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(p.title)}</a>` : esc(p.title);
  const bits = [p.year, p.venue, showRole ? ROLE[p.role] : null].filter(Boolean).map(esc).join(" · ");
  return `<li>${title} <small>${bits}</small></li>`;
}

// ================= Routing: "#/search?q=…" is the results screen, anything else is home =================

function goSearch(q, country, years) {
  q = q.trim();
  if (q.length < 3) return;
  const params = new URLSearchParams({ q, years });
  if (country) params.set("country", country);
  const hash = `#/search?${params}`;
  if (location.hash === hash) route();
  else location.hash = hash;
}

function route() {
  const m = location.hash.match(/^#\/search\?(.*)$/);
  const onSearch = !!m;
  $("#home").hidden = onSearch;
  $("#search-view").hidden = !onSearch;
  document.body.classList.toggle("in-search", onSearch);
  if (!onSearch) {
    document.title = "pleasefindmealab";
    if (location.hash === "#/" || location.hash === "") window.scrollTo(0, 0);
    return;
  }
  const p = new URLSearchParams(m[1]);
  runSearch(p.get("q") || "", (p.get("country") || "").toUpperCase(), p.get("years") || DEFAULTS.years);
}
window.addEventListener("hashchange", route);

// ================= Home =================

$("#search-form").addEventListener("submit", (e) => {
  e.preventDefault();
  goSearch($("#q").value, $("#country").value, $("#years").value);
});
// Clicking a topic on the brain searches it.
document.addEventListener("brain:topic", (e) => {
  $("#q").value = e.detail.topic;
  goSearch(e.detail.topic, $("#country").value, $("#years").value);
});
$("#nav-cta").addEventListener("click", (e) => {
  e.preventDefault();
  window.scrollTo({ top: 0, behavior: "smooth" });
  $("#q").focus();
});
document.querySelector('[data-scroll="how"]').addEventListener("click", (e) => {
  e.preventDefault();
  $("#how").scrollIntoView({ behavior: "smooth" });
});

// ================= Results screen =================

const S = {
  key: null,          // the search currently shown
  data: null,         // API response
  view: [],           // professors after filter + sort
  selected: null,     // selected professor id
  seq: 0,             // guards against out-of-order responses
  profileSeq: 0,
  profiles: new Map(),
};

async function runSearch(q, country, years) {
  $("#sv-q").value = q;
  $("#sv-country").value = country;
  $("#sv-years").value = years;
  // Keep the home form in sync so going back shows the same search.
  $("#q").value = q; $("#country").value = country; $("#years").value = years;

  const key = `${q}|${country}|${years}`;
  if (key === S.key && S.data) return; // e.g. coming back with the browser's Forward button
  S.key = key;
  S.data = null;
  S.selected = null;
  const my = ++S.seq;
  document.title = `${q} · pleasefindmealab`;

  $("#sv-count").textContent = "Searching";
  $("#sv-title").textContent = q;
  $("#sv-sub").textContent = "Reading the most relevant recent papers…";
  $("#sv-filter").value = "";
  $("#sv-sort").value = "match";
  $("#sv-rows").innerHTML = Array.from({ length: 8 }, () => `<li class="skeleton"><span></span><span></span></li>`).join("");
  $("#sv-profile").innerHTML = "";

  const params = new URLSearchParams({ q, years });
  if (country) params.set("country", country);
  try {
    const d = await api(`/api/search?${params}`);
    if (my !== S.seq) return;
    S.data = d;
    const where = d.country ? ` in ${COUNTRIES.find(([v]) => v === d.country)?.[1] || d.country}` : "";
    $("#sv-count").textContent = `${d.professors.length} labs${where}`;
    $("#sv-title").textContent = d.query;
    $("#sv-sub").textContent = `From the ${d.matched_papers} most relevant of ${d.total_papers.toLocaleString()} papers, ${d.from_year}–${d.to_year}.`;
    if (!d.professors.length) {
      $("#sv-count").textContent = "No labs found";
      $("#sv-rows").innerHTML = `<li class="empty">Nothing recent matched. Try broader words, or name the technique instead of the application.</li>`;
      return;
    }
    renderRows();
    select(S.view[0]?.id, { immediate: true });
  } catch (e) {
    if (my !== S.seq) return;
    S.key = null; // allow retrying the same search
    $("#sv-count").textContent = "Something went wrong";
    $("#sv-sub").textContent = "";
    $("#sv-rows").innerHTML = `<li class="empty err">${esc(e.message)}</li>`;
  }
}

function renderRows() {
  const all = S.data.professors;
  const max = Math.max(...all.map((p) => p.score)) || 1;
  const f = $("#sv-filter").value.trim().toLowerCase();
  let view = all.map((p, i) => ({ ...p, rank: i + 1 }));
  if (f) {
    view = view.filter((p) =>
      [p.name, p.institution, ...p.papers.map((x) => x.title)].some((s) => (s || "").toLowerCase().includes(f)));
  }
  const by = $("#sv-sort").value;
  if (by === "recent") view.sort((a, b) => (b.latest_year || 0) - (a.latest_year || 0) || a.rank - b.rank);
  else if (by === "name") view.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  else if (by === "inst") view.sort((a, b) => (a.institution || "~").localeCompare(b.institution || "~") || a.rank - b.rank);
  S.view = view;

  $("#sv-rows").innerHTML = view.length ? view.map((p) => `
    <li class="sv-row${p.id === S.selected ? " selected" : ""}" data-id="${esc(p.id)}">
      <span class="rank">${p.rank}</span>
      <div class="sv-row-main">
        <div class="sv-row-top">
          <span class="name">${esc(p.name)}</span>
          <span class="year">${esc(p.latest_year)}</span>
        </div>
        <div class="inst">${esc(p.institution || "Institution unknown")}</div>
        <div class="paper">${esc(p.papers[0]?.title || "")}</div>
        <div class="bar"><i style="width:${Math.max(4, (p.score / max) * 100).toFixed(0)}%"></i></div>
      </div>
    </li>`).join("")
    : `<li class="empty">No professors match “${esc(f)}”.</li>`;
}

let profileTimer = null;
function select(id, { immediate = false } = {}) {
  if (!id) return;
  S.selected = id;
  document.querySelectorAll(".sv-row.selected").forEach((el) => el.classList.remove("selected"));
  const row = document.querySelector(`.sv-row[data-id="${CSS.escape(id)}"]`);
  row?.classList.add("selected");
  row?.scrollIntoView({ block: "nearest" });
  // Short delay so holding ↓ doesn't fire a request for every row it passes.
  clearTimeout(profileTimer);
  profileTimer = setTimeout(() => showProfile(id), immediate ? 0 : 140);
}

function move(delta) {
  if (!S.view.length) return;
  const i = S.view.findIndex((p) => p.id === S.selected);
  const next = S.view[clamp(i + delta, 0, S.view.length - 1)];
  select(next.id);
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

async function showProfile(id) {
  const my = ++S.profileSeq;
  const fromSearch = S.data?.professors.find((p) => p.id === id);
  const panel = $("#sv-profile");
  const pos = S.view.findIndex((p) => p.id === id);
  if (!S.profiles.has(id)) {
    panel.innerHTML = `<div class="sv-profile-inner"><p class="label">Loading</p><h2 class="pf-name">${esc(fromSearch?.name || "")}</h2></div>`;
  }
  try {
    let p = S.profiles.get(id);
    if (!p) { p = await api(`/api/professor/${encodeURIComponent(id)}`); S.profiles.set(id, p); }
    if (my !== S.profileSeq) return;
    const inst = p.institutions[0] || "";
    const google = `https://www.google.com/search?q=${encodeURIComponent(`${p.name} ${inst} faculty page email`)}`;
    panel.innerHTML = `<div class="sv-profile-inner">
      <div class="pf-nav">
        ${pos >= 0 ? `<span class="muted">${pos + 1} of ${S.view.length}</span>
          <button type="button" data-move="-1" ${pos === 0 ? "disabled" : ""} aria-label="Previous professor">←</button>
          <button type="button" data-move="1" ${pos === S.view.length - 1 ? "disabled" : ""} aria-label="Next professor">→</button>`
          : `<button type="button" data-back aria-label="Back to the list selection">← Back to results</button>`}
      </div>
      <h2 class="pf-name">${esc(p.name)}</h2>
      <div class="detail-inst">${esc(p.institutions.join(" · ") || "Institution unknown")}</div>
      <div class="tags">
        <span><b>${esc(p.recent_papers_count)}</b> papers since ${esc(p.papers_since)}</span>
        <span>h-index <b>${esc(p.h_index ?? "?")}</b></span>
        ${p.cited_by_count != null ? `<span><b>${Number(p.cited_by_count).toLocaleString()}</b> citations</span>` : ""}
        ${p.leads_lab ? `<span class="good">Leads recent work</span>` : `<span class="warn">Few recent senior-author papers</span>`}
      </div>
      <div class="links">
        <a href="${esc(google)}" target="_blank" rel="noopener">Find faculty page ↗</a>
        ${p.orcid ? `<a href="https://orcid.org/${esc(p.orcid)}" target="_blank" rel="noopener">ORCID ↗</a>` : ""}
        <a href="https://openalex.org/authors/${esc(p.id)}" target="_blank" rel="noopener">All papers ↗</a>
      </div>
      ${fromSearch ? `<h3>Why they matched “${esc(S.data.query)}”</h3><ul>${fromSearch.papers.map((x) => paperItem(x, true)).join("")}</ul>` : ""}
      ${p.topics.length ? `<h3>Topics</h3><div class="tags">${p.topics.map((t) => `<span>${esc(t)}</span>`).join("")}</div>` : ""}
      <h3>Recent papers</h3>
      ${p.papers.length ? `<ul>${p.papers.map((x) => paperItem(x, true)).join("")}</ul>` : `<p class="muted">No recent papers found.</p>`}
      ${p.collaborators.length ? `<h3>Works often with</h3><ul>${p.collaborators.map((c) =>
        `<li><a href="#" data-prof="${esc(c.id)}">${esc(c.name)}</a> <small>${esc(c.institution || "")} · ${esc(c.n)} papers</small></li>`).join("")}</ul>` : ""}
    </div>`;
    panel.scrollTop = 0;
  } catch (e) {
    if (my !== S.profileSeq) return;
    panel.innerHTML = `<div class="sv-profile-inner"><p class="err">${esc(e.message)}</p></div>`;
  }
}

$("#sv-form").addEventListener("submit", (e) => {
  e.preventDefault();
  goSearch($("#sv-q").value, $("#sv-country").value, $("#sv-years").value);
});
$("#sv-filter").addEventListener("input", () => { if (S.data) renderRows(); });
$("#sv-sort").addEventListener("change", () => { if (S.data) { renderRows(); $("#sv-rows").scrollTop = 0; } });

$("#sv-rows").addEventListener("click", (e) => {
  const row = e.target.closest(".sv-row");
  if (row) select(row.dataset.id, { immediate: true });
});
$("#sv-profile").addEventListener("click", (e) => {
  const mv = e.target.closest("[data-move]");
  if (mv) { move(+mv.dataset.move); return; }
  if (e.target.closest("[data-back]")) { if (S.selected) showProfile(S.selected); return; }
  const link = e.target.closest("[data-prof]");
  if (link) { e.preventDefault(); showProfile(link.dataset.prof); }
});

document.addEventListener("keydown", (e) => {
  if ($("#search-view").hidden) return;
  const typing = e.target.matches("input, select, textarea");
  if (e.key === "/" && !typing) { e.preventDefault(); $("#sv-filter").focus(); return; }
  if (e.key === "Escape" && typing) { e.target.blur(); return; }
  if (typing && e.target.id !== "sv-filter") return;
  if (e.key === "ArrowDown" || (!typing && e.key === "j")) { e.preventDefault(); move(1); }
  else if (e.key === "ArrowUp" || (!typing && e.key === "k")) { e.preventDefault(); move(-1); }
});

route();
