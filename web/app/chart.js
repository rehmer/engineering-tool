// Pipe-flow chart: solved mass flow against outlet pressure, with the operating point and choke line.
import { flowCurve } from "../engine/pipe-flow.js";
import { fmt } from "./format.js";

const niceStep = (v) => { const e = Math.pow(10, Math.floor(Math.log10(v))); const f = v / e; return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * e; };

/** Simple line chart for profiles: pts = [[x, y], ...]; opts { xLabel, yLabel, zeroLine, mark: {x, label} }. */
export function drawLineChart(svg, pts, opts = {}) {
  pts = pts.filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
  if (pts.length < 2) { svg.innerHTML = `<text x="280" y="120" text-anchor="middle">No valid profile for these inputs</text>`; return; }
  const W = 560, H = 240, L = 66, R = 14, T = 12, B = 34;
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  let y0 = Math.min(...ys), y1 = Math.max(...ys);
  if (opts.zeroLine) { y0 = Math.min(y0, 0); y1 = Math.max(y1, 0); }
  if (y1 - y0 < 1e-12 * Math.max(1, Math.abs(y1))) { y0 -= 1; y1 += 1; }
  const pad = (y1 - y0) * 0.06; y0 -= pad; y1 += pad;
  const X = (x) => L + ((x - x0) / (x1 - x0 || 1)) * (W - L - R);
  const Y = (y) => H - B - ((y - y0) / (y1 - y0)) * (H - B - T);
  let g = "";
  const ys1 = niceStep((y1 - y0) / 4);
  for (let y = Math.ceil(y0 / ys1) * ys1; y <= y1 + 1e-12; y += ys1) g += `<line x1="${L}" x2="${W - R}" y1="${Y(y)}" y2="${Y(y)}" stroke="var(--chart-grid)"/><text x="${L - 6}" y="${Y(y) + 4}" text-anchor="end">${fmt(Math.abs(y) < ys1 * 1e-9 ? 0 : y, 3)}</text>`;
  const xs1 = niceStep((x1 - x0) / 5);
  for (let x = Math.ceil(x0 / xs1) * xs1; x <= x1 + 1e-9; x += xs1) g += `<line x1="${X(x)}" x2="${X(x)}" y1="${T}" y2="${H - B}" stroke="var(--chart-grid)"/><text x="${X(x)}" y="${H - B + 15}" text-anchor="middle">${fmt(x, 3)}</text>`;
  if (opts.zeroLine && y0 < 0 && y1 > 0) g += `<line x1="${L}" x2="${W - R}" y1="${Y(0)}" y2="${Y(0)}" stroke="var(--muted)" stroke-width="1"/>`;
  g += `<text x="${(L + W - R) / 2}" y="${H - 4}" text-anchor="middle">${opts.xLabel || ""}</text>`;
  g += `<text x="12" y="${(T + H - B) / 2}" text-anchor="middle" transform="rotate(-90 12 ${(T + H - B) / 2})">${opts.yLabel || ""}</text>`;
  const path = pts.map((p, k) => (k ? "L" : "M") + X(p[0]).toFixed(1) + "," + Y(p[1]).toFixed(1)).join("");
  g += `<path d="${path}" fill="none" stroke="var(--chart-line)" stroke-width="2"/>`;
  if (opts.mark && Number.isFinite(opts.mark.x) && Number.isFinite(opts.mark.y)) {
    g += `<circle cx="${X(opts.mark.x)}" cy="${Y(opts.mark.y)}" r="5" fill="var(--accent)" stroke="var(--surface)" stroke-width="2"/>`;
  }
  svg.innerHTML = g;
}

export function drawFlowChart(svg, inputs, S, r) {
  if (!r) { svg.innerHTML = `<text x="280" y="120" text-anchor="middle">No valid solution for these inputs</text>`; return; }
  const { pMin, pMax, pts } = flowCurve(inputs, S, 48);
  if (!pts.length) { svg.innerHTML = ""; return; }
  const W = 560, H = 240, L = 58, Rr = 14, T = 12, B = 34;
  const yMax = Math.max(...pts.map((p) => p[1]), r.mdot) * 1.08;
  const x = (p) => L + ((pMax - p) / (pMax - pMin)) * (W - L - Rr);
  const y = (m) => H - B - (m / yMax) * (H - B - T);
  const nice = (v) => { const e = Math.pow(10, Math.floor(Math.log10(v))); const f = v / e; return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * e; };
  let g = "";
  const yStep = nice(yMax / 4);
  for (let m = 0; m <= yMax; m += yStep) g += `<line x1="${L}" x2="${W - Rr}" y1="${y(m)}" y2="${y(m)}" stroke="var(--chart-grid)"/><text x="${L - 6}" y="${y(m) + 4}" text-anchor="end">${fmt(m, 3)}</text>`;
  const xStep = nice((pMax - pMin) / 5);
  for (let p = Math.ceil(pMin / xStep) * xStep; p <= pMax + 1e-9; p += xStep) g += `<line x1="${x(p)}" x2="${x(p)}" y1="${T}" y2="${H - B}" stroke="var(--chart-grid)"/><text x="${x(p)}" y="${H - B + 15}" text-anchor="middle">${fmt(p, 3)}</text>`;
  g += `<text x="${(L + W - Rr) / 2}" y="${H - 4}" text-anchor="middle">Outlet pressure (psig), falling →</text>`;
  g += `<text x="12" y="${(T + H - B) / 2}" text-anchor="middle" transform="rotate(-90 12 ${(T + H - B) / 2})">lbm/hr</text>`;
  const all = [[pMax, 0], ...pts];
  const path = all.map((p, k) => (k ? "L" : "M") + x(p[0]).toFixed(1) + "," + y(p[1]).toFixed(1)).join("");
  g += `<path d="${path}L${x(all.at(-1)[0]).toFixed(1)},${H - B}Z" fill="var(--chart-line)" fill-opacity=".08"/>`;
  g += `<path d="${path}" fill="none" stroke="var(--chart-line)" stroke-width="2"/>`;
  const pc = r.P2choked;
  if (pc > pMin && pc < pMax) g += `<line x1="${x(pc)}" x2="${x(pc)}" y1="${T}" y2="${H - B}" stroke="var(--bad)" stroke-dasharray="4 3"/><text x="${x(pc) + 4}" y="${T + 11}" style="fill:var(--bad)">choke ${fmt(pc, 3)} psig</text>`;
  const px = Math.max(pMin, Math.min(pMax, inputs.pout));
  g += `<circle cx="${x(px)}" cy="${y(r.mdot)}" r="5" fill="var(--accent)" stroke="var(--surface)" stroke-width="2"/>`;
  svg.innerHTML = g;
}
