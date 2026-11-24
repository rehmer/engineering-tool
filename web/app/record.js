// Calc record: one structured record per case, rendered three ways —
// HTML for screen and print (Save as PDF), rich HTML on the clipboard for pasting into Word,
// and CSV for spreadsheets. Styles are inline so the pasted version keeps its formatting.
import { ENGINE_VERSION, fingerprint } from "../engine/index.js";
import { FITTINGS } from "../engine/pipe-flow.js";
import { fmt, cell, resultValue, esc, today } from "./format.js";
import { SITE_NAME } from "./config.js";
import { texToMathML, eqEntry } from "./math.js";
import { dimOf, displayValue } from "./units.js";
import { refHTML } from "./refs.js";

const LEVEL = { ok: "OK", warn: "CHECK", bad: "FAIL" };

/** Input rows for the record, skipping fields that don't apply. */
export function inputRows(tool, v, units = {}) {
  const rows = [];
  for (const f of tool.fields) {
    if (f.type === "unit") continue;
    if (f.activeIf && !f.activeIf(v)) continue;
    if (f.showIf && !f.showIf(v)) continue;
    if (f.recordIf && !f.recordIf(v)) continue;
    if (f.type === "fittings") {
      FITTINGS.forEach((ft, j) => { if (v.qty[j] > 0) rows.push([ft[0], String(v.qty[j]), "qty"]); });
      if (v.qty[FITTINGS.length] > 0) rows.push(["Entrance, K 0.5", String(v.qty[FITTINGS.length]), "qty"]);
      if (v.qty[FITTINGS.length + 1] > 0) rows.push(["Exit, K 1.0", String(v.qty[FITTINGS.length + 1]), "qty"]);
      if (!v.qty.some((q) => q > 0)) rows.push(["Fittings", "none", ""]);
      continue;
    }
    const label = f.recLabel || (typeof f.label === "function" ? f.label(v) : f.label);
    const u = dimOf(f) && units[f.key];
    rows.push([label, u ? displayValue(f, u, v[f.key]) : String(v[f.key]), f.unitKey ? v[f.unitKey] : u || f.unit || ""]);
  }
  return rows;
}

export function buildRecord(tool, inputs, result, meta, units = {}) {
  const fp = fingerprint(tool, inputs);
  return {
    tool: { id: tool.id, title: tool.title, version: tool.version },
    engine: ENGINE_VERSION,
    fingerprint: fp,
    recordId: `${tool.id.toUpperCase().slice(0, 4)}-${fp.slice(0, 8).toUpperCase()}`,
    meta: { project: "", number: "", client: "", caseName: "", date: today(), preparedBy: "", checkedBy: "", purpose: "", ...meta },
    status: result.status,
    inputs: inputRows(tool, inputs, units),
    results: [...(result.ok ? result.results : []), ...(result.extraResults || [])].map((r) => [r.label, resultValue(r), r.unit]),
    checks: [...result.checks, ...(result.extraChecks || [])].map((c) => [c.label, LEVEL[c.level] || c.level, c.detail]),
    advice: result.advice ? { recommended: result.advice.recommended, why: result.advice.why, selected: inputs.model } : null,
    method: result.method || tool.method,
  };
}

// ---- HTML ----------------------------------------------------------------
const F = "font-family:Calibri,Arial,sans-serif;";
const TD = `${F}font-size:10pt;border:1px solid #9aa5b1;padding:3px 6px;vertical-align:top;`;
const TH = `${TD}background:#e8edf2;font-weight:bold;text-align:left;`;
const H = `${F}font-size:12pt;font-weight:bold;color:#1f4e78;margin:14pt 0 4pt;`;
const P = `${F}font-size:10pt;margin:0 0 4pt;`;

function table(cols, rows, numCol = -1, widths = []) {
  const head = cols.map((c, i) => `<th style="${TH}${widths[i] ? `width:${widths[i]};` : ""}">${esc(c)}</th>`).join("");
  const body = rows.map((r) => "<tr>" + r.map((x, i) => {
    const color = x === "FAIL" ? "color:#b3372d;font-weight:bold;" : x === "CHECK" ? "color:#a86a12;font-weight:bold;" : x === "OK" ? "color:#2c7a47;" : "";
    return `<td style="${TD}${i === numCol ? "text-align:right;font-family:Consolas,monospace;" : ""}${color}">${esc(x)}</td>`;
  }).join("") + "</tr>").join("");
  return `<table width="100%" style="border-collapse:collapse;width:100%;margin:0 0 6pt;"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

export function recordHTML(rec) {
  const m = rec.meta;
  const metaRow = (a, av, b, bv) => `<tr><td style="${TH}width:18%">${a}</td><td style="${TD}width:32%">${esc(av || "—")}</td><td style="${TH}width:18%">${b}</td><td style="${TD}width:32%">${esc(bv || "—")}</td></tr>`;
  const st = rec.status;
  const stColor = st.level === "ok" ? "#2c7a47" : st.level === "warn" ? "#a86a12" : "#b3372d";
  let n = 0; const sec = (t) => `<p style="${H}">${++n}. ${esc(t)}</p>`;
  return `<div style="${F}color:#15202b;">
<table width="100%" style="border-collapse:collapse;width:100%;margin-bottom:8pt;"><tr>
<td style="${F}font-size:16pt;font-weight:bold;color:#1f4e78;border-bottom:2px solid #1f4e78;padding:0 0 4pt;">Calculation record: ${esc(rec.tool.title)}</td>
<td style="${F}font-size:10pt;text-align:right;border-bottom:2px solid #1f4e78;padding:0 0 4pt;white-space:nowrap;">Record ${esc(rec.recordId)}</td></tr></table>
<table width="100%" style="border-collapse:collapse;width:100%;margin-bottom:6pt;">
${metaRow("Project", m.project, "Project no.", m.number)}
${metaRow("Case", m.caseName, "Client", m.client)}
${metaRow("Prepared by", m.preparedBy, "Date", m.date)}
${metaRow("Checked by", m.checkedBy, "Check date", m.checkedDate)}
</table>
${sec("Purpose")}<p style="${P}">${esc(m.purpose || "—")}</p>
${sec("Inputs")}${table(["Parameter", "Value", "Unit"], rec.inputs, 1, ["55%", "25%", "20%"])}
${sec("Results")}<p style="${P}"><b style="color:${stColor}">${esc(st.text)}</b>${st.detail ? ` · ${esc(st.detail)}` : ""}</p>
${rec.results.length ? table(["Result", "Value", "Unit"], rec.results, 1, ["55%", "25%", "20%"]) : `<p style="${P}">No valid result for these inputs.</p>`}
${sec("Checks")}${table(["Check", "Result", "Detail"], rec.checks, -1, ["40%", "10%", "50%"])}
${rec.advice ? `${sec("Model selection")}<p style="${P}">Selected: <b>${esc(rec.advice.selected)}</b>. Selection guide recommends: <b>${esc(rec.advice.recommended)}</b>. ${esc(rec.advice.why)}</p>` : ""}
${sec("Method and basis")}<p style="${P}">${esc(rec.method.basis)}</p>
${rec.method.equations.map(eqEntry).map(({ note, tex }) => `${note ? `<p style="${P}font-size:9pt;color:#5a6a7a;margin:6pt 0 0 12pt;page-break-after:avoid;">${esc(note)}</p>` : ""}${tex ? `<div style="margin:2pt 0 4pt 12pt;font-size:11pt;">${texToMathML(tex)}</div>` : ""}`).join("")}
<p style="${P}margin-top:6pt;"><b>Assumptions and limits</b></p>
<ul style="${F}font-size:10pt;margin:0 0 4pt 0;padding-left:18pt;">${rec.method.assumptions.map((a) => `<li>${esc(a)}</li>`).join("")}</ul>
${sec("References")}<ul style="${F}font-size:10pt;margin:0;padding-left:18pt;">${rec.method.references.map((a) => `<li>${refHTML(a, "color:#1f4e78;")}</li>`).join("")}</ul>
<p style="${F}font-size:8pt;color:#5a6a7a;border-top:1px solid #9aa5b1;margin-top:12pt;padding-top:4pt;">${esc(SITE_NAME)} · ${esc(rec.tool.title)} v${esc(rec.tool.version)} · record ${esc(rec.recordId)} · fingerprint ${esc(rec.fingerprint)}. Results are engineering estimates and must be checked by a qualified engineer before use.</p>
</div>`;
}

export function recordText(rec) {
  const lines = [`Calculation record: ${rec.tool.title}  (Record ${rec.recordId})`, `Project: ${rec.meta.project}   Case: ${rec.meta.caseName}   Date: ${rec.meta.date}`, ""];
  lines.push("INPUTS", ...rec.inputs.map((r) => `  ${r[0]}: ${r[1]} ${r[2]}`), "", "RESULTS", `  ${rec.status.text}`);
  lines.push(...rec.results.map((r) => `  ${r[0]}: ${r[1]} ${r[2]}`), "", "CHECKS", ...rec.checks.map((r) => `  [${r[1]}] ${r[0]} — ${r[2]}`));
  lines.push("", `${rec.tool.title} v${rec.tool.version}, fingerprint ${rec.fingerprint}`);
  return lines.join("\n");
}

export function recordCSV(rec) {
  const q = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
  const rows = [["Section", "Item", "Value", "Unit / detail"],
    ["Record", "Tool", rec.tool.title, `v${rec.tool.version}`], ["Record", "Record ID", rec.recordId, rec.fingerprint],
    ["Record", "Project", rec.meta.project, rec.meta.number], ["Record", "Case", rec.meta.caseName, ""], ["Record", "Date", rec.meta.date, ""],
    ["Record", "Prepared by", rec.meta.preparedBy, ""], ["Record", "Checked by", rec.meta.checkedBy, ""], ["Record", "Status", rec.status.text, rec.status.detail || ""],
    ...rec.inputs.map((r) => ["Input", ...r]), ...rec.results.map((r) => ["Result", ...r]), ...rec.checks.map((r) => ["Check", r[0], r[1], r[2]])];
  return "﻿" + rows.map((r) => r.map(q).join(",")).join("\r\n");
}

/** Copy as rich HTML (pastes as formatted tables in Word) with a plain-text fallback. */
export async function copyRecord(rec) {
  const html = `<html><body>${recordHTML(rec)}</body></html>`;
  try {
    await navigator.clipboard.write([new ClipboardItem({ "text/html": new Blob([html], { type: "text/html" }), "text/plain": new Blob([recordText(rec)], { type: "text/plain" }) })]);
    return true;
  } catch {
    const div = document.createElement("div");
    div.innerHTML = recordHTML(rec);
    div.style.cssText = "position:fixed;left:-9999px;top:0;background:#fff";
    document.body.appendChild(div);
    const range = document.createRange(); range.selectNodeContents(div);
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range);
    const ok = document.execCommand("copy");
    sel.removeAllRanges(); div.remove();
    return ok;
  }
}

export function download(name, text, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export { fmt, cell };
