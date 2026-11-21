// App shell: routing, tool forms built from each tool's field list, results, saved cases and the calc record.
import { TOOLS, toolById, defaults, normalize, run, fingerprint, ENGINE_VERSION } from "../engine/index.js";
import { FITTINGS, K_ENTRANCE, K_EXIT, MATERIALS } from "../engine/pipe-flow.js";
import { store } from "./store.js";
import { fmt, cell, resultValue, esc, today } from "./format.js";
import { buildRecord, recordHTML, recordCSV, copyRecord, download } from "./record.js";
import { drawFlowChart, drawLineChart } from "./chart.js";
import { openFeedback } from "./feedback.js";
import { SITE_NAME } from "./config.js";
import { renderGuide as guideHTML } from "./guide.js";
import { EQ_METHOD } from "../engine/fluid-equivalence.js";

const $ = (id) => document.getElementById(id);
const view = $("view");

// Working state for each tool: current inputs and the saved case they came from.
const drafts = {};
function draft(toolId) {
  const t = toolById(toolId);
  return (drafts[toolId] ||= { inputs: defaults(t), caseId: null, caseName: "", dirty: false });
}
let currentTool = TOOLS[0].id;
let last = null; // last run for the record view

// ---------------------------------------------------------------- shell
$("ver").textContent = `Free · engine v${ENGINE_VERSION}`;
$("brand").textContent = SITE_NAME;

// feedback: header and footer buttons open the same dialog with the current page's context
function feedbackContext() {
  const h = location.hash.replace(/^#\/?/, "") || currentTool;
  const t = toolById(h === "record" ? currentTool : h);
  if (!t) return { page: h, engineVersion: ENGINE_VERSION };
  const d = draft(t.id), r = run(t, d.inputs).result, hd = r.headline?.[0];
  return { page: location.hash || "#/", tool: t.title, toolVersion: t.version, engineVersion: ENGINE_VERSION, inputs: d.inputs,
    headline: hd ? `${hd.label}: ${resultValue(hd)} ${hd.unit} · ${r.status.text}` : r.status.text };
}
$("feedback").addEventListener("click", () => openFeedback(feedbackContext()));
$("feedback-foot").addEventListener("click", () => openFeedback(feedbackContext()));

function toast(msg) {
  const el = document.createElement("div");
  el.className = "toast"; el.textContent = msg; el.setAttribute("role", "status");
  document.body.appendChild(el); setTimeout(() => el.remove(), 2600);
}

function renderShell() {
  $("tools").innerHTML = TOOLS.map((t) => `<a class="tool" href="#/${t.id}" data-tool="${t.id}">${esc(t.short)}</a>`).join("")
    + `<a class="tool guide" href="#/guide" data-tool="guide">Guide, limits &amp; terms</a>`;
  $("proj").innerHTML = store.projects.map((p) => `<option value="${p.id}"${p.id === store.project.id ? " selected" : ""}>${esc(p.number ? p.number + " · " + p.name : p.name)}</option>`).join("");
  const cases = [...store.project.cases].sort((a, b) => (b.updated || "").localeCompare(a.updated || ""));
  $("cases").innerHTML = cases.length
    ? cases.map((c) => `<button class="case" data-case="${c.id}" aria-current="${drafts[currentTool]?.caseId === c.id ? "true" : "false"}">${esc(c.name || "Untitled case")}<small>${esc(toolById(c.toolId)?.short || c.toolId)} · ${esc((c.updated || "").slice(0, 10))}</small></button>`).join("")
    : `<div class="empty">No saved cases yet. Run a tool and choose Save case.</div>`;
  $("storage-note").textContent = store.persisted() ? "Saved in this browser. Back up to move between devices." : "This browser is not keeping data; back up before closing.";
  document.querySelectorAll(".tool").forEach((a) => a.toggleAttribute("aria-current", false));
  const on = document.querySelector(`.tool[data-tool="${currentTool}"]`);
  if (on && !location.hash.startsWith("#/record") && !location.hash.startsWith("#/guide")) on.setAttribute("aria-current", "page");
  if (location.hash.startsWith("#/guide")) document.querySelector(".tool.guide")?.setAttribute("aria-current", "page");
}

$("cases").addEventListener("click", (e) => {
  const b = e.target.closest("[data-case]"); if (!b) return;
  openCase(b.dataset.case);
});
$("proj").addEventListener("change", (e) => { store.selectProject(e.target.value); renderShell(); });

function openCase(id) {
  const found = store.findCase(id); if (!found) return;
  const { c } = found, t = toolById(c.toolId);
  drafts[c.toolId] = { inputs: normalize(t, c.inputs), caseId: c.id, caseName: c.name, dirty: false };
  if (location.hash === `#/${c.toolId}`) route(); else location.hash = `#/${c.toolId}`;
}

// project dialog
const dlg = $("proj-dlg");
let dlgMode = "edit";
function openProjectDialog(mode) {
  dlgMode = mode;
  const f = dlg.querySelector("form"), p = mode === "edit" ? store.project : { name: "", number: "", client: "" };
  $("proj-dlg-h").textContent = mode === "edit" ? "Edit project" : "New project";
  f.name.value = p.name; f.number.value = p.number; f.client.value = p.client; f.preparer.value = store.user.name || "";
  $("proj-del").hidden = mode !== "edit";
  dlg.showModal();
}
$("proj-edit").addEventListener("click", () => openProjectDialog("edit"));
$("proj-new").addEventListener("click", () => openProjectDialog("new"));
dlg.addEventListener("close", () => {
  const f = dlg.querySelector("form"), v = dlg.returnValue;
  if (v === "save") {
    const fields = { name: f.name.value.trim(), number: f.number.value.trim(), client: f.client.value.trim() };
    if (dlgMode === "edit") store.updateProject(fields); else store.addProject(fields);
    store.setUser({ name: f.preparer.value.trim() });
  } else if (v === "delete") {
    const p = store.project;
    if (confirm(`Delete project “${p.name}” and its ${p.cases.length} saved case(s) from this browser? This cannot be undone unless you have a backup.`)) store.deleteProject(p.id);
  }
  renderShell(); route();
});

// backup / restore
$("backup").addEventListener("click", () => download(`flowline-backup-${today()}.json`, store.exportJSON(), "application/json"));
$("restore").addEventListener("click", () => $("restore-file").click());
$("restore-file").addEventListener("change", async (e) => {
  const file = e.target.files[0]; if (!file) return;
  try { const n = store.importJSON(await file.text()); toast(`Restored ${n} project(s)`); renderShell(); }
  catch (err) { toast(`Could not restore: ${err.message}`); }
  e.target.value = "";
});

// ---------------------------------------------------------------- tool view
const labelOf = (f, v) => (typeof f.label === "function" ? f.label(v) : f.label);

function fieldHTML(f, v) {
  const id = `f-${f.key}`;
  const label = labelOf(f, v);
  if (f.type === "select") {
    return `<div class="field${f.full ? " full" : ""}" data-field="${f.key}"><label for="${id}">${esc(label)}</label>
      <div class="ctl"><select id="${id}" data-key="${f.key}">${f.options.map((o) => `<option value="${esc(o)}"${o === v[f.key] ? " selected" : ""}>${esc(f.labels?.[o] ? `${o} · ${f.labels[o]}` : o)}</option>`).join("")}</select></div>${f.hint ? `<span class="hint">${esc(f.hint)}</span>` : ""}</div>`;
  }
  if (f.type === "number") {
    const unit = f.unitKey
      ? `<select class="u" data-key="${f.unitKey}" aria-label="${esc(label)} unit">${f.units.map((u) => `<option${u === v[f.unitKey] ? " selected" : ""}>${esc(u)}</option>`).join("")}</select>`
      : `<span class="u">${esc(f.unit || "")}</span>`;
    return `<div class="field${f.full ? " full" : ""}" data-field="${f.key}"><label for="${id}">${esc(label)}</label>
      <div class="ctl"><input id="${id}" data-key="${f.key}" type="number" step="any" value="${v[f.key]}"${f.min !== undefined ? ` min="${f.min}"` : ""}${f.max !== undefined ? ` max="${f.max}"` : ""}>${unit}</div>${f.hint ? `<span class="hint">${esc(f.hint)}</span>` : ""}</div>`;
  }
  if (f.type === "fittings") {
    const row = (name, j, basis) => `<tr><td>${esc(name)}</td><td class="r"><input class="qty num" type="number" min="0" step="1" data-qty="${j}" value="${v.qty[j]}" aria-label="${esc(name)} quantity"></td><td class="num dim" id="fb-${j}">${basis}</td><td class="num" id="fk-${j}"></td></tr>`;
    return `<div class="field full"><div class="tbl"><table><thead><tr><th>Item</th><th class="r">Qty</th><th class="r">Basis</th><th class="r">K</th></tr></thead><tbody>
      ${FITTINGS.map((ft, j) => row(ft[0], j, "")).join("")}
      ${row("Entrance", FITTINGS.length, `K ${K_ENTRANCE}`)}${row("Exit", FITTINGS.length + 1, `K ${K_EXIT}`)}
      <tr><td>Straight pipe, f·L/D</td><td class="r dim" id="fk-len"></td><td></td><td class="num" id="fk-pipe"></td></tr>
      <tr><td><b>Total resistance K</b></td><td></td><td></td><td class="num"><b id="fk-tot"></b></td></tr></tbody></table></div></div>`;
  }
  return "";
}

function renderTool(id) {
  currentTool = id;
  const t = toolById(id), d = draft(id), v = d.inputs;
  const saved = d.caseId && store.findCase(d.caseId)?.c;
  const verNote = saved && (saved.engineVersion !== ENGINE_VERSION || saved.toolVersion !== t.version)
    ? `<div class="banner">This case was saved with ${esc(t.short)} v${esc(saved.toolVersion)} / engine v${esc(saved.engineVersion)}. Results below are recalculated with v${esc(t.version)} / engine v${ENGINE_VERSION}${saved.headline ? `; saved headline was ${esc(saved.headline)}` : ""}.</div>` : "";
  const groupsHTML = (panel) => t.groups.filter((g) => (g.panel || "") === panel).map((g) => {
    const fs = t.fields.filter((f) => f.group === g.id);
    if (!fs.length) return "";
    return `${g.label ? `<div class="sub">${esc(g.label)}</div>` : ""}<div class="fields">${fs.map((f) => fieldHTML(f, v)).join("")}</div>`;
  }).join("");
  const groups = groupsHTML("");
  const eqPanel = t.groups.some((g) => g.panel === "equiv") ? equivPanelHTML(groupsHTML("equiv")) : "";
  view.innerHTML = `<section class="view">
    <div class="vhead"><div><h1>${esc(t.title)}</h1><p>${esc(t.summary)}</p></div>
      <div class="src">Workbook sheet <b>${esc(t.sheet)}</b> · v${esc(t.version)}</div></div>
    ${verNote}
    <div class="casebar noprint">
      <input id="case-name" placeholder="Case name, e.g. Header A, max flow" value="${esc(d.caseName)}" aria-label="Case name">
      <button class="ibtn primary" type="button" id="case-save">${d.caseId ? "Save changes" : "Save case"}</button>
      ${d.caseId ? `<button class="ibtn" type="button" id="case-copy">Save as new</button>` : ""}
      <button class="ibtn" type="button" id="case-record">Calc record</button>
      <button class="ibtn" type="button" id="case-new">New case</button>
      ${d.caseId ? `<button class="ibtn danger" type="button" id="case-del">Delete</button>` : ""}
      <span class="saved" id="case-state"></span>
    </div>
    <div class="work">
      <form class="panel" id="form" autocomplete="off"><header><h2>Inputs</h2><span class="tag in">Editable</span></header><div class="body">${groups}</div></form>
      <section class="panel" aria-labelledby="res-h"><header><h2 id="res-h">Results</h2><span class="tag out">Calculated</span></header>
        <div class="body">
          <div class="status ok" id="status"><span class="dot"></span><span id="status-t"></span><small id="status-s"></small></div>
          <div class="hero" id="hero"></div>
          <div class="tbl"><table><tbody id="results"></tbody></table></div>
          ${id === "pipe-flow" ? `<div class="sub">Flow vs. outlet pressure</div><svg class="chart" id="chart" viewBox="0 0 560 240" role="img" aria-label="Mass flow versus outlet pressure"></svg>
          <div class="legend"><span><i style="background:var(--chart-line)"></i>Solved mass flow</span><span><i style="background:var(--accent)"></i>Your operating point</span><span><i style="background:var(--bad)"></i>Choked limit</span></div>` : ""}
          ${id === "temp-rise" ? `<div class="sub">Gas temperature along the pipe</div><svg class="chart" id="chart-a" viewBox="0 0 560 240" role="img" aria-label="Gas temperature versus distance"></svg>` : ""}
          ${id === "beam" ? `<div class="sub">Bending moment</div><svg class="chart" id="chart-a" viewBox="0 0 560 240" role="img" aria-label="Bending moment along the beam"></svg>
          <div class="sub">Deflection (positive up)</div><svg class="chart" id="chart-b" viewBox="0 0 560 240" role="img" aria-label="Deflection along the beam"></svg>
          <div class="legend"><span><i style="background:var(--accent)"></i>Evaluation position x</span></div>` : ""}
        </div></section>
    </div>
    ${eqPanel}
    <div class="grid2">
      <section class="panel"><header><h2>Checks</h2><span class="tag out">For the record</span></header><div class="body"><ul class="checks" id="checks"></ul></div></section>
      ${id === "pipe-flow" ? `<section class="panel"><header><h2>Model selection guide</h2><span class="tag out">Steps 1–8</span></header><div class="body"><div class="rec" id="advice"></div><ol class="steps" id="steps"></ol></div></section>` : `<div id="tables-side"></div>`}
    </div>
    <div id="tables" class="grid2"></div>
    <details class="theory"><summary>Theory, basis and limits</summary><div class="body">
      <p>${esc(t.method.basis)}</p>
      ${t.method.equations.map((e) => `<div class="eq">${esc(e)}</div>`).join("")}
      <p><b>Assumptions and limits</b></p><ul>${t.method.assumptions.map((a) => `<li>${esc(a)}</li>`).join("")}</ul>
      <p><b>References</b></p><ul>${t.method.references.map((a) => `<li>${esc(a)}</li>`).join("")}</ul>
    </div></details>
  </section>`;

  let timer;
  for (const form of [$("form"), $("eq-form")].filter(Boolean)) {
    form.addEventListener("input", () => {
      readForm(t, d);
      d.dirty = true;
      clearTimeout(timer); timer = setTimeout(() => update(t, d), id === "pipe-flow" ? 40 : 0);
    });
    form.addEventListener("submit", (e) => e.preventDefault());
  }
  $("case-name").addEventListener("input", (e) => { d.caseName = e.target.value; d.dirty = true; caseState(d); });
  $("case-save").addEventListener("click", () => saveCase(t, d, false));
  $("case-copy")?.addEventListener("click", () => saveCase(t, d, true));
  $("case-record").addEventListener("click", () => { location.hash = "#/record"; });
  $("case-new").addEventListener("click", () => { drafts[id] = { inputs: defaults(t), caseId: null, caseName: "", dirty: false }; renderTool(id); renderShell(); });
  $("case-del")?.addEventListener("click", () => {
    if (!confirm(`Delete case “${d.caseName || "Untitled"}” from this project?`)) return;
    store.deleteCase(d.caseId); d.caseId = null; renderTool(id); renderShell(); toast("Case deleted");
  });
  update(t, d);
  caseState(d);
}

// ---------------------------------------------------------------- fluid equivalence panel (flow converter)
function equivPanelHTML(fields) {
  const m = EQ_METHOD;
  return `<section class="panel eqpanel" aria-labelledby="eq-h"><header><h2 id="eq-h">Standard flow fluid equivalence</h2><span class="tag in">Tested gas → other gas</span></header>
    <div class="body">
      <p class="note">For a device tested or rated in standard flow of one gas, such as a regulator, orifice, relief valve or rotameter rated in air SCFM. Gives the standard flow the same device passes with another gas at the same pressures. Uses the ambient pressure, standard reference and density method from the inputs above.</p>
      <div class="work">
        <form id="eq-form" autocomplete="off">${fields}</form>
        <div class="eqout">
          <div class="status ok" id="eq-status"><span class="dot"></span><span id="eq-status-t"></span><small id="eq-status-s"></small></div>
          <div class="hero" id="eq-hero"></div>
          <div class="tbl" id="eq-cmp"></div>
          <div class="tbl" id="eq-fluids"></div>
          <ul class="checks" id="eq-checks"></ul>
        </div>
      </div>
      <details class="theory"><summary>Conversion logic, basis and limitations</summary><div class="body">
        <p>${esc(m.basis)}</p>
        ${m.equations.map((e) => `<div class="eq">${esc(e)}</div>`).join("")}
        <p><b>Which basis to use</b></p><ul>
          <li><b>Isentropic nozzle</b>: orifices, nozzles, relief valves, regulators and valves at a fixed opening. Handles both subcritical and choked flow. The default.</li>
          <li><b>Square-root SG rule</b>: rotameters at the same float position, and restrictions at small pressure drop. This is the familiar Q₂ = Q₁·√(SG₁/SG₂).</li>
          <li><b>Same mass flow</b>: Coriolis meters, or re-expressing a fixed mass demand in another gas's standard volume.</li>
        </ul>
        <p><b>Assumptions and limitations</b></p><ul>${m.assumptions.map((a) => `<li>${esc(a)}</li>`).join("")}</ul>
        <p><b>References</b></p><ul>${m.references.map((a) => `<li>${esc(a)}</li>`).join("")}</ul>
      </div></details>
    </div></section>`;
}

function miniTable(tb, sig = 5) {
  return `<table><thead><tr>${tb.columns.map((c, i) => `<th${i ? ' class="r"' : ""}>${esc(c)}</th>`).join("")}</tr></thead>
    <tbody>${tb.rows.map((r) => `<tr>${r.map((x, i) => `<td${i ? ' class="num"' : ""}>${esc(cell(x, sig))}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}

function updateEquiv(eq, v) {
  const st = eq.status;
  $("eq-status").className = "status " + st.level;
  $("eq-status-t").textContent = st.text; $("eq-status-s").textContent = st.detail || "";
  const e = eq.raw;
  $("eq-hero").innerHTML = [
    { k: `Equivalent flow, ${v.eqTo}`, val: fmt(eq.headline.value, 5), u: v.eqUnit },
    { k: `Ratio ${v.eqTo} / ${v.eqFrom}`, val: fmt(eq.headline.ratio, 5), u: "–" },
    { k: "Implied C·A (nozzle)", val: eq.ok ? fmt(e.CA, 4) : "NA", u: "in²" },
  ].map((h) => `<div class="kpi"><div class="k">${esc(h.k)}</div><div class="v">${esc(h.val)}</div><div class="u">${esc(h.u)}</div></div>`).join("");
  $("eq-cmp").innerHTML = eq.ok ? miniTable(eq.comparison) : "";
  $("eq-fluids").innerHTML = miniTable(eq.fluids);
  $("eq-checks").innerHTML = eq.checks.map((c) => `<li><span class="lv ${c.level}">${{ ok: "OK", warn: "CHECK", bad: "FAIL" }[c.level]}</span><span>${esc(c.label)}</span><small>${esc(c.detail)}</small></li>`).join("");
}

function readForm(t, d) {
  const v = d.inputs;
  view.querySelectorAll("[data-key]").forEach((el) => {
    const f = t.fields.find((x) => x.key === el.dataset.key);
    if (!f) return;
    if (f.type === "number") { const n = parseFloat(el.value); v[f.key] = Number.isFinite(n) ? n : 0; }
    else v[f.key] = el.value;
  });
  view.querySelectorAll("[data-qty]").forEach((el) => { const n = parseFloat(el.value); v.qty[+el.dataset.qty] = Number.isFinite(n) ? Math.max(0, n) : 0; });
}

function caseState(d) {
  const el = $("case-state"); if (!el) return;
  const c = d.caseId && store.findCase(d.caseId)?.c;
  el.textContent = c ? `Saved ${new Date(c.updated).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })} in ${store.project.name}${d.dirty ? " · unsaved changes" : ""}` : `Not saved yet · project ${store.project.name}`;
}

function saveCase(t, d, asNew) {
  const r = run(t, d.inputs).result;
  const h = r.headline[0];
  const existing = !asNew && d.caseId ? store.findCase(d.caseId)?.c : null;
  const c = store.saveCase({
    ...(existing || {}),
    id: asNew ? undefined : d.caseId || undefined,
    name: (d.caseName || "").trim() || `${t.short} ${today()}`,
    toolId: t.id, toolVersion: t.version, engineVersion: ENGINE_VERSION,
    inputs: JSON.parse(JSON.stringify(d.inputs)),
    fingerprint: fingerprint(t, d.inputs),
    headline: h && r.ok ? `${resultValue(h)} ${h.unit}` : r.status.text,
  });
  d.caseId = c.id; d.caseName = c.name; d.dirty = false;
  renderTool(t.id); renderShell(); toast(asNew ? "Saved as a new case" : "Case saved");
}

function setStatus(st) {
  const el = $("status"); el.className = "status " + st.level;
  $("status-t").textContent = st.text; $("status-s").textContent = st.detail || "";
}

function tableHTML(tb) {
  return `<section class="panel"><header><h2>${esc(tb.title)}</h2></header><div class="body"><div class="tbl"><table>
    <thead><tr>${tb.columns.map((c, i) => `<th${i ? ' class="r"' : ""}>${esc(c)}</th>`).join("")}</tr></thead>
    <tbody>${tb.rows.map((r) => `<tr>${r.map((x, i) => `<td${i ? ' class="num"' : ""}>${esc(cell(x))}</td>`).join("")}</tr>`).join("")}</tbody>
    ${tb.foot ? `<tfoot><tr>${tb.foot.map((x, i) => `<td${i ? ' class="num"' : ""}>${esc(cell(x))}</td>`).join("")}</tr></tfoot>` : ""}
  </table></div></div></section>`;
}

function update(t, d) {
  const v = d.inputs;
  // fields that only apply to some inputs (e.g. humidity for air)
  for (const f of t.fields) {
    const box = view.querySelector(`[data-field="${f.key}"]`);
    if (f.showIf) box?.toggleAttribute("hidden", !f.showIf(v));
    if (typeof f.label === "function" && box) box.querySelector("label").textContent = f.label(v);
    if (!f.activeIf) continue;
    const on = f.activeIf(v);
    box?.classList.toggle("off", !on); const inp = box?.querySelector("input"); if (inp) inp.disabled = !on;
  }
  const out = run(t, v);
  const r = out.result;
  last = { tool: t, inputs: out.inputs, result: r, draft: d };
  setStatus(r.status);
  $("hero").innerHTML = (r.headline.length ? r.headline : [{ label: "Result", value: NaN, unit: "" }])
    .map((h) => `<div class="kpi"><div class="k">${esc(h.label)}</div><div class="v${typeof h.value === "string" ? " txt" : ""}">${esc(resultValue(h))}</div><div class="u">${esc(h.unit)}</div></div>`).join("");
  $("results").innerHTML = r.results.map((x) => `<tr><td>${esc(x.label)}</td><td class="num">${esc(resultValue(x))}</td><td class="dim">${esc(x.unit)}</td></tr>`).join("");
  $("checks").innerHTML = r.checks.length
    ? r.checks.map((c) => `<li><span class="lv ${c.level}">${{ ok: "OK", warn: "CHECK", bad: "FAIL" }[c.level]}</span><span>${esc(c.label)}</span><small>${esc(c.detail)}</small></li>`).join("")
    : `<li><span class="lv bad">FAIL</span><span>${esc(r.status.text)}</span><small>${esc(r.status.detail || "")}</small></li>`;
  const tables = r.tables.filter((tb) => tb.title !== "Resistance build-up");
  if ($("tables-side")) { $("tables-side").innerHTML = tables.slice(0, 1).map(tableHTML).join(""); $("tables").innerHTML = tables.slice(1).map(tableHTML).join(""); }
  else $("tables").innerHTML = tables.map(tableHTML).join("");

  if (r.equivalence) updateEquiv(r.equivalence, v);
  if (t.id === "temp-rise") {
    const ns = (r.raw.nodes || []).filter((n) => Number.isFinite(n.V));
    drawLineChart($("chart-a"), ns.map((n) => [n.x, ((n.T - 273.15) * 9) / 5 + 32]), { xLabel: "Distance along pipe (ft)", yLabel: "Gas temperature (°F)" });
  }
  if (t.id === "beam") {
    const p = (r.raw.profile || []).filter((q) => !q.exact), h = r.raw.here;
    drawLineChart($("chart-a"), p.map((q) => [q.x, q.M]), { xLabel: "x (in)", yLabel: "M (lbf·in)", zeroLine: true, mark: h && { x: v.x, y: h.M } });
    drawLineChart($("chart-b"), p.map((q) => [q.x, q.y]), { xLabel: "x (in)", yLabel: "y (in)", zeroLine: true, mark: h && { x: v.x, y: h.y } });
  }

  if (t.id === "pipe-flow") {
    const S = r.raw.S, rr = r.raw.r;
    FITTINGS.forEach((ft, j) => { $(`fb-${j}`).textContent = `Le/D ${ft[1][Math.max(0, MATERIALS.indexOf(v.mat))]}`; $(`fk-${j}`).textContent = rr ? fmt(rr.Kfit[j], 4) : "–"; });
    $(`fk-${FITTINGS.length}`).textContent = rr ? fmt(rr.Kent, 4) : "–";
    $(`fk-${FITTINGS.length + 1}`).textContent = rr ? fmt(rr.Kexit, 4) : "–";
    $("fk-len").textContent = `${v.len} ft`;
    $("fk-pipe").textContent = rr ? fmt(rr.Kpipe, 4) : "–";
    $("fk-tot").textContent = rr ? fmt(rr.K, 4) : "–";
    const a = r.advice;
    $("advice").className = "rec" + (a && !a.matches ? " diff" : "");
    $("advice").innerHTML = a ? `<b>Recommended: ${esc(a.recommended)}</b>${a.matches ? " · matches your selection" : ` · you selected ${esc(v.model)}`}<br><span class="note">${esc(a.why)}</span>` : `<span class="note">Solve a valid case to run the guide.</span>`;
    $("steps").innerHTML = a ? a.steps.map((s) => `<li><span class="n">${s.n}</span><span>${esc(s.q)}</span><span class="a">${esc(s.a)}</span><small>${esc(s.detail)}</small></li>`).join("") : "";
    drawFlowChart($("chart"), out.inputs, S, rr || null);
  }
  caseState(d);
}

// ---------------------------------------------------------------- calc record view
function renderRecord() {
  if (!last) { location.hash = `#/${currentTool}`; return; }
  const { tool: t, inputs, result, draft: d } = last;
  const p = store.project;
  const saved = d.caseId && store.findCase(d.caseId)?.c;
  const meta = {
    project: p.name, number: p.number, client: p.client,
    caseName: d.caseName || saved?.name || "",
    preparedBy: saved?.preparedBy ?? store.user.name ?? "",
    checkedBy: saved?.checkedBy || "", checkedDate: saved?.checkedDate || "",
    purpose: saved?.purpose || "",
    date: (saved?.updated || new Date().toISOString()).slice(0, 10),
  };
  view.innerHTML = `<section class="view">
    <div class="vhead noprint"><div><h1>Calc record</h1><p>Fill in the purpose and sign-off, then print to PDF, paste into Word or download a CSV for Excel. The record is rebuilt from the inputs, so it always matches the tool.</p></div>
      <div class="src">${esc(t.short)} v${esc(t.version)} · engine v${ENGINE_VERSION}</div></div>
    ${d.dirty || !d.caseId ? `<div class="banner noprint">${d.caseId ? "This case has unsaved changes." : "This case isn't saved yet."} The record shows the current inputs. Save the case to keep the record details with it.</div>` : ""}
    <div class="casebar noprint actions">
      <button class="ibtn" type="button" id="rec-back">← Back to tool</button>
      <span class="spacer"></span>
      <button class="ibtn primary" type="button" id="rec-print">Print / Save PDF</button>
      <button class="ibtn" type="button" id="rec-copy">Copy for Word</button>
      <button class="ibtn" type="button" id="rec-csv">Download CSV</button>
      <button class="ibtn" type="button" id="rec-json">Download case file</button>
    </div>
    <form class="panel noprint" id="rec-form" autocomplete="off"><header><h2>Record details</h2><span class="tag in">Editable</span></header><div class="body"><div class="recmeta">
      <label>Case name<input name="caseName" value="${esc(meta.caseName)}"></label>
      <label>Date<input name="date" type="date" value="${esc(meta.date)}"></label>
      <label>Prepared by<input name="preparedBy" value="${esc(meta.preparedBy)}"></label>
      <label>Checked by<input name="checkedBy" value="${esc(meta.checkedBy)}"></label>
      <label>Check date<input name="checkedDate" type="date" value="${esc(meta.checkedDate)}"></label>
      <label class="full">Purpose<textarea name="purpose" placeholder="What this calculation establishes, e.g. confirm the 2 in header passes the design flow at 20 psig back-pressure.">${esc(meta.purpose)}</textarea></label>
    </div>${d.caseId ? `<div class="actions"><button class="ibtn" type="button" id="rec-save">Save details to case</button></div>` : ""}</div></form>
    <div class="paper" id="paper"></div>
  </section>`;
  const form = $("rec-form");
  const current = () => {
    const fd = Object.fromEntries(new FormData(form));
    return buildRecord(t, inputs, result, { ...meta, ...fd });
  };
  const paint = () => { $("paper").innerHTML = recordHTML(current()); };
  form.addEventListener("input", paint);
  paint();
  const base = () => (current().meta.caseName || t.short).replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") || "case";
  $("rec-back").addEventListener("click", () => { location.hash = `#/${t.id}`; });
  $("rec-print").addEventListener("click", () => window.print());
  $("rec-copy").addEventListener("click", async () => toast((await copyRecord(current())) ? "Copied. Paste into Word with Ctrl+V." : "Copy failed; use Print / Save PDF instead."));
  $("rec-csv").addEventListener("click", () => download(`${base()}.csv`, recordCSV(current()), "text/csv"));
  $("rec-json").addEventListener("click", () => {
    const rec = current();
    download(`${base()}.flowline.json`, JSON.stringify({ app: "flowline-calc", kind: "case", tool: t.id, toolVersion: t.version, engineVersion: ENGINE_VERSION, fingerprint: rec.fingerprint, meta: rec.meta, inputs }, null, 1), "application/json");
  });
  $("rec-save")?.addEventListener("click", () => {
    const fd = Object.fromEntries(new FormData(form));
    const c = store.findCase(d.caseId).c;
    store.saveCase({ ...c, name: fd.caseName || c.name, preparedBy: fd.preparedBy, checkedBy: fd.checkedBy, checkedDate: fd.checkedDate, purpose: fd.purpose });
    d.caseName = fd.caseName || c.name;
    renderShell(); toast("Record details saved to the case");
  });
  document.title = `${current().recordId} · ${SITE_NAME}`;
}

// ---------------------------------------------------------------- guide page
function renderGuide() {
  view.innerHTML = guideHTML(TOOLS);
  view.querySelector("#guide-feedback")?.addEventListener("click", () => openFeedback(feedbackContext()));
  document.title = `Guide · ${SITE_NAME}`;
}

// ---------------------------------------------------------------- routing
function route() {
  const h = location.hash.replace(/^#\/?/, "");
  document.title = SITE_NAME;
  if (h === "record") renderRecord();
  else if (h === "guide") renderGuide();
  else renderTool(toolById(h) ? h : currentTool);
  renderShell();
  window.scrollTo(0, 0);
}
window.addEventListener("hashchange", route);
window.addEventListener("beforeunload", (e) => { if (Object.values(drafts).some((d) => d.dirty && d.caseId)) e.preventDefault(); });
route();
