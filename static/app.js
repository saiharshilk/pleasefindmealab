"use strict";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// Only link to real http(s) URLs coming back from the API.
const safeUrl = (u) => (/^https?:\/\//i.test(u || "") ? u : null);
const ROLE = { senior: "senior author", corresponding: "corresponding author", first: "first author", middle: "co-author" };

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

function showResultsSection() {
  const section = $("#results-section");
  section.hidden = false;
  section.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function runSearch(ev) {
  ev?.preventDefault();
  const q = $("#q").value.trim();
  if (q.length < 3) return;
  const params = new URLSearchParams({ q, years: $("#years").value });
  if ($("#country").value) params.set("country", $("#country").value);

  const out = $("#results"), btn = $("#search-form button");
  btn.disabled = true;
  $("#detail").innerHTML = `<p class="muted">Select a professor to see their profile.</p>`;
  out.innerHTML = `<div class="results-head"><p class="label">Searching</p><h2>Reading recent papers on ${esc(q)}…</h2></div>`;
  showResultsSection();
  try {
    const d = await api(`/api/search?${params}`);
    if (!d.professors.length) {
      out.innerHTML = `<div class="results-head"><p class="label">No labs found</p>
        <h2>Nothing recent on ${esc(d.query)}.</h2>
        <p>Try broader words, or name the technique instead of the application.</p></div>`;
      return;
    }
    const where = d.country ? ` in ${esc($("#country").selectedOptions[0].text)}` : "";
    out.innerHTML =
      `<div class="results-head"><p class="label">${d.professors.length} labs${where}</p>
        <h2>Leading recent work on ${esc(d.query)}</h2>
        <p>From the ${d.matched_papers} most relevant of ${d.total_papers.toLocaleString()} papers, ${d.from_year}–${d.to_year}.</p></div>` +
      d.professors.map((p, i) => `
        <div class="prof" data-id="${esc(p.id)}">
          <div class="prof-head">
            <span class="rank">${i + 1}</span>
            <span class="name">${esc(p.name)}</span>
            <span class="inst">${esc(p.institution || "Institution unknown")}</span>
            <span class="active">active ${esc(p.latest_year)}</span>
          </div>
          <ul>${p.papers.map((x) => paperItem(x, false)).join("")}</ul>
        </div>`).join("");
  } catch (e) {
    out.innerHTML = `<div class="results-head"><p class="label">Something went wrong</p><p class="err">${esc(e.message)}</p></div>`;
  } finally {
    btn.disabled = false;
  }
}

async function openProfessor(id) {
  document.querySelectorAll(".prof.selected").forEach((el) => el.classList.remove("selected"));
  document.querySelector(`.prof[data-id="${CSS.escape(id)}"]`)?.classList.add("selected");
  const panel = $("#detail");
  panel.innerHTML = `<p class="muted">Loading…</p>`;
  try {
    const p = await api(`/api/professor/${encodeURIComponent(id)}`);
    const inst = p.institutions[0] || "";
    const google = `https://www.google.com/search?q=${encodeURIComponent(`${p.name} ${inst} faculty page email`)}`;
    panel.innerHTML = `
      <h2>${esc(p.name)}</h2>
      <div class="detail-inst">${esc(p.institutions.join(" · ") || "Institution unknown")}</div>
      <div class="tags">
        <span><b>${esc(p.recent_papers_count)}</b> papers since ${esc(p.papers_since)}</span>
        <span>h-index <b>${esc(p.h_index ?? "?")}</b></span>
        ${p.leads_lab ? `<span class="good">Leads recent work</span>` : `<span class="warn">Few recent senior-author papers</span>`}
      </div>
      <div class="links">
        <a href="${esc(google)}" target="_blank" rel="noopener">Find faculty page ↗</a>
        ${p.orcid ? `<a href="https://orcid.org/${esc(p.orcid)}" target="_blank" rel="noopener">ORCID ↗</a>` : ""}
        <a href="https://openalex.org/authors/${esc(p.id)}" target="_blank" rel="noopener">All papers ↗</a>
      </div>
      ${p.topics.length ? `<h3>Topics</h3><div class="tags">${p.topics.map((t) => `<span>${esc(t)}</span>`).join("")}</div>` : ""}
      <h3>Recent papers</h3>
      ${p.papers.length ? `<ul>${p.papers.map((x) => paperItem(x, true)).join("")}</ul>` : `<p class="muted">No recent papers found.</p>`}
      ${p.collaborators.length ? `<h3>Works often with</h3><ul>${p.collaborators.map((c) =>
        `<li><a href="#" data-prof="${esc(c.id)}">${esc(c.name)}</a> <small>${esc(c.institution || "")} · ${esc(c.n)} papers</small></li>`).join("")}</ul>` : ""}`;
    panel.scrollTop = 0;
  } catch (e) {
    panel.innerHTML = `<p class="err">${esc(e.message)}</p>`;
  }
}

$("#search-form").addEventListener("submit", runSearch);

// Clicking a topic on the brain searches it.
document.addEventListener("brain:topic", (e) => {
  $("#q").value = e.detail.topic;
  runSearch();
});

$("#nav-cta").addEventListener("click", () => setTimeout(() => $("#q").focus(), 400));

document.addEventListener("click", (e) => {
  const link = e.target.closest("[data-prof]");
  if (link) { e.preventDefault(); openProfessor(link.dataset.prof); return; }
  // Let paper links open normally; clicking anywhere else on a row opens the profile.
  if (e.target.closest("a")) return;
  const row = e.target.closest(".prof");
  if (row) openProfessor(row.dataset.id);
});
