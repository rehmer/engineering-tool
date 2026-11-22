// Beam response, Roark Table 8.1 cases 1a, 1d, 1e, 2a, 2d, 2e. Mirrors workbook sheet 'Roark Beam Table 8.1'.

export const CASES = {
  "1a": "Point load W at a · left free, right fixed",
  "1d": "Point load W at a · both ends fixed",
  "1e": "Point load W at a · both ends simply supported",
  "2a": "Linear load from a to l · left free, right fixed",
  "2d": "Linear load from a to l · both ends fixed",
  "2e": "Linear load from a to l · both ends simply supported",
};
export const SECTIONS = ["Pipe / Round HSS", "Solid Round Bar (Rod)", "Solid Square Bar", "HSS Square Tube", "Solid Rectangular Bar", "HSS Rectangular Tube", "Wide-Flange (W-Shape) / I-Beam"];

const DIM_LABELS = {
  "Pipe / Round HSS": ["Outside diameter, OD", "Wall thickness, t"],
  "Solid Round Bar (Rod)": ["Diameter, d"],
  "Solid Square Bar": ["Side, b"],
  "HSS Square Tube": ["Outside side, B", "Wall thickness, t"],
  "Solid Rectangular Bar": ["Width, b", "Height, h"],
  "HSS Rectangular Tube": ["Outside width, B", "Outside height, H", "Wall thickness, t"],
  "Wide-Flange (W-Shape) / I-Beam": ["Overall depth, d", "Flange width, bf", "Flange thickness, tf", "Web thickness, tw"],
};
export const dimLabel = (sec, n) => DIM_LABELS[sec]?.[n] || "";

/** Section check, extreme-fibre distance c and I (G21:G23). */
export function section(sec, d) {
  const [g16, g17, g18, g19] = d;
  let check = "OK", c, I;
  switch (sec) {
    case "Pipe / Round HSS": if (!(g16 > 0 && g17 > 0 && 2 * g17 < g16)) check = "CHECK: OD > 2t > 0"; c = g16 / 2; I = (Math.PI / 64) * (g16 ** 4 - (g16 - 2 * g17) ** 4); break;
    case "Solid Round Bar (Rod)": if (!(g16 > 0)) check = "CHECK: d must be > 0"; c = g16 / 2; I = (Math.PI * g16 ** 4) / 64; break;
    case "Solid Square Bar": if (!(g16 > 0)) check = "CHECK: b must be > 0"; c = g16 / 2; I = g16 ** 4 / 12; break;
    case "HSS Square Tube": if (!(g16 > 0 && g17 > 0 && 2 * g17 < g16)) check = "CHECK: B > 2t > 0"; c = g16 / 2; I = (g16 ** 4 - (g16 - 2 * g17) ** 4) / 12; break;
    case "Solid Rectangular Bar": if (!(g16 > 0 && g17 > 0)) check = "CHECK: b and h must be > 0"; c = g17 / 2; I = (g16 * g17 ** 3) / 12; break;
    case "HSS Rectangular Tube": if (!(g16 > 0 && g17 > 0 && g18 > 0 && 2 * g18 < Math.min(g16, g17))) check = "CHECK: B,H > 2t > 0"; c = g17 / 2; I = (g16 * g17 ** 3 - (g16 - 2 * g18) * (g17 - 2 * g18) ** 3) / 12; break;
    case "Wide-Flange (W-Shape) / I-Beam": if (!(g16 > 0 && g17 > 0 && g18 > 0 && g19 > 0 && 2 * g18 < g16 && g19 <= g17)) check = "CHECK: d > 2tf and bf >= tw > 0"; c = g16 / 2;
      I = 2 * ((g17 * g18 ** 3) / 12 + g17 * g18 * (g16 / 2 - g18 / 2) ** 2) + (g19 * (g16 - 2 * g18) ** 3) / 12; break;
    default: check = "CHECK: choose section type";
  }
  return check === "OK" ? { check, c, I, S: c > 0 ? I / c : NaN } : { check, c: NaN, I: NaN, S: NaN };
}

export function beam(i) {
  const cs = String(i.caseId).toLowerCase();
  const sec = section(i.section, [i.d1, i.d2, i.d3, i.d4]);
  const l = i.l, a = i.a, x = i.x, W = i.W, wa = i.wa, wl = i.wl, E = i.E, I = sec.I;
  const check = !(cs in CASES) ? "CHECK: choose 1a, 1d, 1e, 2a, 2d, or 2e" : l <= 0 ? "CHECK: l must be > 0" : a < 0 || a > l ? "CHECK: a must satisfy 0 <= a <= l"
    : x < 0 || x > l ? "CHECK: x must satisfy 0 <= x <= l" : cs[0] === "2" && a >= l ? "CHECK: distributed load requires a < l"
    : !(E > 0 && I > 0) ? "CHECK: E and I must be > 0" : "OK";                          // C16
  const out = { check, sec, caseId: cs };
  if (check !== "OK") return out;
  const L = l - a, EI = E * I, point = cs[0] === "1", dw = wl - wa;                     // C43, C47, C46
  const total = point ? W : ((wa + wl) / 2) * L;                                        // C48
  let Ra, Rb, Ma, Mb, ta, tb, ya;
  switch (cs) {
    case "1a": Ra = 0; Rb = W; Ma = 0; Mb = -W * L; ta = (W * L ** 2) / (2 * EI); tb = 0; ya = (-W * (2 * l ** 3 - 3 * l ** 2 * a + a ** 3)) / (6 * EI); break;
    case "1d": Ra = (W / l ** 3) * L ** 2 * (l + 2 * a); Rb = ((W * a ** 2) / l ** 3) * (3 * l - 2 * a); Ma = ((-W * a) / (l ** 2)) * L ** 2; Mb = ((-W * a ** 2) / (l ** 2)) * L; ta = 0; tb = 0; ya = 0; break;
    case "1e": Ra = (W / l) * L; Rb = (W * a) / l; Ma = 0; Mb = 0; ta = (-W * a * (2 * l - a) * L) / (6 * EI * l); tb = (W * a * (l ** 2 - a ** 2)) / (6 * EI * l); ya = 0; break;
    case "2a": Ra = 0; Rb = ((wa + wl) / 2) * L; Ma = 0; Mb = (-wa / 2) * L ** 2 - (dw / 6) * L ** 2; ta = (wa * L ** 3) / (6 * EI) + (dw * L ** 3) / (24 * EI); tb = 0;
      ya = (-wa * L ** 3 * (3 * l + a)) / (24 * EI) - (dw * L ** 3 * (4 * l + a)) / (120 * EI); break;
    case "2d": Ra = (wa / (2 * l ** 3)) * L ** 3 * (l + a) + (dw / (20 * l ** 3)) * L ** 3 * (3 * l + 2 * a); Rb = total - Ra;
      Ma = (-wa / (12 * l ** 2)) * L ** 3 * (l + 3 * a) - (dw / (60 * l ** 2)) * L ** 3 * (2 * l + 3 * a); Mb = Ra * l + Ma - (wa / 2) * L ** 2 - (dw / 6) * L ** 2; ta = 0; tb = 0; ya = 0; break;
    case "2e": Ra = (wa / (2 * l)) * L ** 2 + (dw / (6 * l)) * L ** 2; Rb = total - Ra; Ma = 0; Mb = 0;
      ta = (-wa * L ** 2 * (l ** 2 + 2 * a * l - a ** 2)) / (24 * EI * l) - (dw * L ** 2 * (7 * l ** 2 + 6 * a * l - 3 * a ** 2)) / (360 * EI * l);
      tb = (wa * (l ** 2 - a ** 2) ** 2) / (24 * EI * l) + (dw * L ** 2 * (8 * l ** 2 + 9 * a * l + 3 * a ** 2)) / (360 * EI * l); ya = 0; break;
  }
  const yb = 0;
  // general response at any x (C29:C32 and the profile columns)
  const at = (xx) => {
    const m = Math.max(xx - a, 0);
    return point ? {
      V: Ra - W * (xx >= a ? 1 : 0), M: Ma + Ra * xx - W * m,
      th: ta + (Ma * xx) / EI + (Ra * xx ** 2) / (2 * EI) - (W * m ** 2) / (2 * EI),
      y: ya + ta * xx + (Ma * xx ** 2) / (2 * EI) + (Ra * xx ** 3) / (6 * EI) - (W * m ** 3) / (6 * EI),
    } : {
      V: Ra - wa * m - (dw * m ** 2) / (2 * L), M: Ma + Ra * xx - (wa * m ** 2) / 2 - (dw * m ** 3) / (6 * L),
      th: ta + (Ma * xx) / EI + (Ra * xx ** 2) / (2 * EI) - (wa * m ** 3) / (6 * EI) - (dw * m ** 4) / (24 * EI * L),
      y: ya + ta * xx + (Ma * xx ** 2) / (2 * EI) + (Ra * xx ** 3) / (6 * EI) - (wa * m ** 4) / (24 * EI) - (dw * m ** 5) / (120 * EI * L),
    };
  };
  const profile = [];
  for (let n = 0; n <= 200; n++) { const xx = (n * l) / 200; profile.push({ x: xx, ...at(xx) }); }
  // exact load/start row (row 257)
  profile.push({ x: a, V: point ? Ra - W : Ra, M: Ma + Ra * a, th: ta + (Ma * a) / EI + (Ra * a ** 2) / (2 * EI), y: ya + ta * a + (Ma * a ** 2) / (2 * EI) + (Ra * a ** 3) / (6 * EI), exact: true });
  const ext = (key, fn) => { let best = 0; profile.forEach((p, k) => { if (fn(p[key], profile[best][key])) best = k; }); return { value: profile[best][key], x: profile[best].x }; };
  const Mmax = ext("M", (u, w) => u > w), Mmin = ext("M", (u, w) => u < w), ymax = ext("y", (u, w) => u > w), ymin = ext("y", (u, w) => u < w);
  const Vmax = ext("V", (u, w) => u > w), Vmin = ext("V", (u, w) => u < w);
  const yAbs = Math.abs(ymax.value) >= Math.abs(ymin.value) ? ymax : ymin;
  const vAbs = Math.abs(Vmax.value) >= Math.abs(Vmin.value) ? Vmax : Vmin;
  const Mabs = Math.max(Math.abs(Mmax.value), Math.abs(Mmin.value));                   // G25
  const stress = sec.S > 0 ? Mabs / sec.S : NaN;                                         // G26
  const here = at(x);
  return {
    ...out, L, EI, total, Ra, Rb, Ma, Mb, ta, tb, ya, yb, here, profile, Mmax, Mmin, ymax, ymin,
    yAbs: { value: Math.abs(yAbs.value), x: yAbs.x }, vAbs: { value: Math.abs(vAbs.value), x: vAbs.x },
    Mabs, stress, stressAt: Math.abs(Mmax.value) >= Math.abs(Mmin.value) ? Mmax.x : Mmin.x,
    fos: i.allow > 0 ? i.allow / stress : NaN,
    residuals: {
      vertical: Ra + Rb - total,
      moment: point ? Ma + Ra * l - W * L - Mb : Ma + Ra * l - (wa * L ** 2) / 2 - (dw * L ** 2) / 6 - Mb,
      slope: point ? ta + (Ma * l) / EI + (Ra * l ** 2) / (2 * EI) - (W * L ** 2) / (2 * EI) - tb
        : ta + (Ma * l) / EI + (Ra * l ** 2) / (2 * EI) - (wa * L ** 3) / (6 * EI) - (dw * L ** 3) / (24 * EI) - tb,
      deflection: point ? ya + ta * l + (Ma * l ** 2) / (2 * EI) + (Ra * l ** 3) / (6 * EI) - (W * L ** 3) / (6 * EI) - yb
        : ya + ta * l + (Ma * l ** 2) / (2 * EI) + (Ra * l ** 3) / (6 * EI) - (wa * L ** 4) / (24 * EI) - (dw * L ** 4) / (120 * EI) - yb,
    },
  };
}

const isPoint = (v) => String(v.caseId)[0] === "1";

export default {
  id: "beam",
  title: "Beam Response (Roark Table 8.1)",
  short: "Roark Beam",
  version: "1.0.0",
  sheet: "Roark Beam Table 8.1",
  summary: "Reactions, end actions, shear, moment, slope and deflection for six Roark Table 8.1 beam cases, with section properties and a bending stress check.",
  chart: "beam",
  groups: [
    { id: "case", label: "" },
    { id: "load", label: "Span and loading" },
    { id: "sec", label: "Section and material" },
  ],
  fields: [
    { key: "caseId", label: "Reference case", type: "select", options: Object.keys(CASES), labels: CASES, default: "1e", group: "case", full: true },
    { key: "l", label: "Beam length, l", type: "number", unit: "in", default: 120, group: "load" },
    { key: "a", label: "Load location / start, a", type: "number", unit: "in", default: 60, group: "load" },
    { key: "x", label: "Evaluation position, x", type: "number", unit: "in", default: 60, group: "load" },
    { key: "W", label: "Concentrated load, W", type: "number", unit: "lbf", default: 1000, group: "load", activeIf: isPoint },
    { key: "wa", label: "Distributed load at a, wₐ", type: "number", unit: "lbf/in", default: 10, group: "load", activeIf: (v) => !isPoint(v) },
    { key: "wl", label: "Distributed load at l, wₗ", type: "number", unit: "lbf/in", default: 10, group: "load", activeIf: (v) => !isPoint(v) },
    { key: "section", label: "Section type", type: "select", options: SECTIONS, default: "Solid Square Bar", group: "sec", full: true },
    { key: "d1", label: (v) => dimLabel(v.section, 0), type: "number", unit: "in", default: 6.718272, group: "sec" },
    { key: "d2", label: (v) => dimLabel(v.section, 1), type: "number", unit: "in", default: 0.5, group: "sec", showIf: (v) => !!dimLabel(v.section, 1) },
    { key: "d3", label: (v) => dimLabel(v.section, 2), type: "number", unit: "in", default: 0.25, group: "sec", showIf: (v) => !!dimLabel(v.section, 2) },
    { key: "d4", label: (v) => dimLabel(v.section, 3), type: "number", unit: "in", default: 0.25, group: "sec", showIf: (v) => !!dimLabel(v.section, 3) },
    { key: "E", label: "Elastic modulus, E", type: "number", unit: "psi", default: 29000000, group: "sec" },
    { key: "allow", label: "Allowable bending stress", type: "number", unit: "psi", default: 36000, group: "sec" },
  ],

  calculate(v) {
    const r = beam(v);
    if (r.sec.check !== "OK" || r.check !== "OK") {
      const t = r.sec.check !== "OK" ? r.sec.check : r.check;
      return { ok: false, status: { level: "bad", text: t, detail: "" }, headline: [], results: [], tables: [], checks: [], raw: r };
    }
    const pass = r.fos >= 1;
    const status = { level: Number.isFinite(r.fos) ? (pass ? "ok" : "bad") : "warn", text: Number.isFinite(r.fos) ? `Bending stress ${pass ? "PASS" : "FAIL"} · factor of safety ${r.fos.toFixed(2)}` : "Enter an allowable stress", detail: `Case ${r.caseId}` };
    const res = r.residuals, tiny = (val, s) => Math.abs(val) <= 1e-8 * Math.max(1, s);
    const checks = [
      { level: tiny(res.vertical, r.total) ? "ok" : "bad", label: "Vertical equilibrium", detail: `R_A + R_B − total load = ${res.vertical.toExponential(2)} lbf` },
      { level: tiny(res.moment, Math.abs(r.total) * v.l) ? "ok" : "bad", label: "Right-end moment balance", detail: `${res.moment.toExponential(2)} lbf·in` },
      { level: tiny(res.slope, Math.abs(r.ta) + Math.abs(r.tb) + 1e-12) ? "ok" : "warn", label: "Right-end slope boundary", detail: `${res.slope.toExponential(2)} rad` },
      { level: tiny(res.deflection, r.yAbs.value + 1e-12) ? "ok" : "warn", label: "Right-end deflection boundary", detail: `${res.deflection.toExponential(2)} in` },
      { level: r.yAbs.value / v.l < 0.05 ? "ok" : "warn", label: "Small-deflection assumption", detail: `max |y| / l = ${(r.yAbs.value / v.l).toExponential(2)}` },
    ];
    if (isPoint(v) && Math.abs(v.x - v.a) < 1e-10) checks.push({ level: "ok", label: "Shear at x = a", detail: "Shear is discontinuous at the point load; V(x) reports the right-hand value." });
    return {
      ok: true, status,
      headline: [
        { label: "Max |bending moment|", value: r.Mabs, unit: `lbf·in at x = ${r.stressAt}`, digits: 5 },
        { label: "Max |deflection|", value: r.yAbs.value, unit: `in at x = ${+r.yAbs.x.toFixed(4)}`, digits: 4 },
        { label: "Bending stress", value: r.stress, unit: `psi · FoS ${Number.isFinite(r.fos) ? r.fos.toFixed(2) : "–"}`, digits: 5 },
      ],
      results: [
        { label: "Left reaction, R_A", value: r.Ra, unit: "lbf", digits: 6 },
        { label: "Right reaction, R_B", value: r.Rb, unit: "lbf", digits: 6 },
        { label: "Left end moment, M_A", value: r.Ma, unit: "lbf·in", digits: 6 },
        { label: "Right end moment, M_B", value: r.Mb, unit: "lbf·in", digits: 6 },
        { label: "Left end slope, θ_A", value: r.ta, unit: "rad", sci: true },
        { label: "Right end slope, θ_B", value: r.tb, unit: "rad", sci: true },
        { label: "Left end deflection, y_A", value: r.ya, unit: "in", sci: true },
        { label: `Shear at x = ${v.x}, V(x)`, value: r.here.V, unit: "lbf", digits: 6 },
        { label: `Moment at x = ${v.x}, M(x)`, value: r.here.M, unit: "lbf·in", digits: 6 },
        { label: `Slope at x = ${v.x}, θ(x)`, value: r.here.th, unit: "rad", sci: true },
        { label: `Deflection at x = ${v.x}, y(x)`, value: r.here.y, unit: "in", sci: true },
        { label: "Maximum moment", value: r.Mmax.value, unit: `lbf·in at x = ${+r.Mmax.x.toFixed(4)}`, digits: 6 },
        { label: "Minimum moment", value: r.Mmin.value, unit: `lbf·in at x = ${+r.Mmin.x.toFixed(4)}`, digits: 6 },
        { label: "Maximum |shear|", value: r.vAbs.value, unit: `lbf at x = ${+r.vAbs.x.toFixed(4)}`, digits: 6 },
        { label: "Maximum |deflection|", value: r.yAbs.value, unit: `in at x = ${+r.yAbs.x.toFixed(4)}`, sci: true },
        { label: "Area moment of inertia, I", value: r.sec.I, unit: "in⁴", digits: 6 },
        { label: "Extreme-fibre distance, c", value: r.sec.c, unit: "in", digits: 6 },
        { label: "Section modulus, S = I/c", value: r.sec.S, unit: "in³", digits: 6 },
        { label: "Maximum bending stress", value: r.stress, unit: "psi", digits: 6 },
        { label: "Factor of safety", value: r.fos, unit: "–", digits: 4 },
      ],
      tables: [
        { title: "Beam profile (every 10th scan point)", columns: ["x (in)", "V (lbf)", "M (lbf·in)", "θ (rad)", "y (in)"],
          rows: r.profile.filter((p, k) => !p.exact && k % 10 === 0).map((p) => [p.x, p.V, p.M, p.th, p.y]) },
      ],
      checks,
      raw: r,
    };
  },

  method: {
    basis: "Euler–Bernoulli beam theory with Roark's closed-form end conditions for each case. The left-end reaction, moment, slope and deflection are the integration constants; shear, moment, slope and deflection anywhere follow from Macaulay (singularity) functions. A 201-point scan plus the exact load point finds the extremes.",
    equations: [
      { note: "Singularity function and loaded length", tex: String.raw`\langle x-a\rangle = \max(x-a,\ 0) \qquad L = l-a` },
      { note: "Point load W at x = a", tex: String.raw`V = R_A - W\langle x-a\rangle^{0} \qquad M = M_A + R_A\,x - W\langle x-a\rangle` },
      { note: "Linearly varying load from x = a to x = l", tex: String.raw`V = R_A - w_a\langle x-a\rangle - \frac{(w_l-w_a)\langle x-a\rangle^{2}}{2L}` },
      { tex: String.raw`M = M_A + R_A\,x - \frac{w_a\langle x-a\rangle^{2}}{2} - \frac{(w_l-w_a)\langle x-a\rangle^{3}}{6L}` },
      { note: "Slope and deflection", tex: String.raw`\theta(x) = \theta_A + \int \frac{M}{EI}\,dx \qquad y(x) = y_A + \theta_A\,x + \iint \frac{M}{EI}\,dx\,dx` },
      { note: "Bending stress and factor of safety", tex: String.raw`\sigma = \frac{|M|_{\max}}{S} \qquad S = \frac{I}{c} \qquad \mathrm{FS} = \frac{\sigma_{\mathrm{allow}}}{\sigma}` },
    ],
    assumptions: [
      "Small deflections, linear elastic material, constant E and I. Shear deformation, large-deflection effects, yielding, local stress concentrations and dynamic response are not included.",
      "Loads positive downward; deflection positive upward (Roark convention), so downward deflection is negative.",
      "Distributed cases vary linearly from w_a at x = a to w_l at x = l; set them equal for a uniform load.",
      "Wide-flange I is built from rectangles and ignores fillets; use published section properties for rolled shapes.",
    ],
    references: [
      "Young, W. C., Budynas, R. G. & Sadegh, A. M., Roark's Formulas for Stress and Strain, Table 8.1, Shear, moment, slope, and deflection formulas for elastic straight beams.",
    ],
  },
};
