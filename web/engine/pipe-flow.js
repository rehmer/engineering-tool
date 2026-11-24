// Polytropic gas pipe flow. solve() finds the mass flow that makes the momentum residual zero.
import { GAS, GAS_NAMES, props, fToK } from "./properties.js";

export const PSI = 6894.757293168; // Pa per psi
const G = 9.81;
const R_GAS = 8.314;

export const MODELS = ["Polytropic (Eq. 25)", "Isothermal", "Isentropic"];
export const MATERIALS = ["Rigid PVC/HDPE", "Glass-reinforced plastic", "Commercial Steel", "Spiral Weld Steel"];

// Equivalent length Le/D per material
export const FITTINGS = [
  ["45° threaded elbow, r/D=1", [20, 18, 16, 14]],
  ["90° threaded elbow, r/D=1", [37, 34, 30, 26]],
  ["90° welded elbow, r/D=1.5", [17, 15, 13, 12]],
  ["Ball valve, full bore", [3.3, 3, 2.6, 2.3]],
  ["Swing check valve", [120, 110, 95, 85]],
  ["Globe valve, full open", [400, 370, 320, 280]],
  ["Threaded tee, branch", [75, 68, 60, 53]],
  ["Threaded tee, straight run", [25, 23, 20, 18]],
];
export const K_ENTRANCE = 0.5;
export const K_EXIT = 1;
// qty array layout: FITTINGS.length fitting counts, then entrance count, then exit count
export const QTY_LENGTH = FITTINGS.length + 2;

export const THERMAL = ["Unknown / in between", "Insulated, short or fast line (NTU ≲ 0.3)", "Long, bare or buried line (NTU ≳ 3)"];
export const PURPOSE = ["Best estimate", "Guaranteed minimum flow or maximum ΔP", "Credible maximum flow"];

/** Simple viscosity correlation, shown for comparison only. */
function legacyViscosity(fluid, T) {
  switch (fluid) {
    case "AIR": return 0.00001716 * Math.pow(T / 273.15, 1.5) * 383.55 / (T + 110.4);
    case "NITROGEN": return 0.00001663 * Math.pow(T / 273.15, 1.5) * 383.55 / (T + 106.7);
    case "ARGON": return 0.00002125 * Math.pow(T / 273.15, 1.5) * 383.55 / (T + 114);
    case "HELIUM": return 0.00001865 * Math.pow(T / 273.15, 0.647);
    case "HYDROGEN": return 0.000008411 * Math.pow(T / 273.15, 0.678);
    default: return NaN;
  }
}

/** State that does not depend on mass flow. */
export function setup(i) {
  const fluid = String(i.fluid).toUpperCase();
  const P1 = (i.pin + i.atm) * PSI;
  const P2 = (i.pout + i.atm) * PSI;
  const T = fToK(i.t);
  const pr = props(fluid, T, P1, i.method);
  const ideal = props(fluid, T, P1, "Ideal Gas");
  const MW = GAS[fluid][0];
  const matIx = Math.max(0, MATERIALS.indexOf(i.mat));
  return {
    fluid, P1, P2, T, pr, ideal, MW, matIx,
    rhoIdealSimple: (MW * P1) / (1000 * R_GAS * T),
    muLegacy: legacyViscosity(fluid, T),
    rho0: (101325 * MW) / (1000 * R_GAS * 273.15), // density at 1 atm and 0 °C
  };
}

/** Evaluate the pressure balance at mass flow mdot (lbm/hr). P2override in Pa abs. */
export function evaluate(i, S, mdot, P2override, modelOverride) {
  const P2 = P2override ?? S.P2;
  const model = modelOverride ?? i.model;
  const rho = S.pr.rho, mu = S.pr.mu, k = S.pr.k;
  const V = (0.2486 * mdot) / (rho * i.id * i.id);
  const Re = (rho * V * i.id * 0.0254) / mu;
  const fLam = 64 / Re;
  const fTurb = 0.25 / Math.pow(Math.log10(i.eps / (3.7 * i.id) + 5.74 / Math.pow(Re, 0.9)), 2);
  const f = Re < 2300 ? fLam : fTurb;
  const Kpipe = (f * (i.len * 12)) / i.id;
  const Kfit = FITTINGS.map((ft, j) => (i.qty[j] || 0) * ft[1][S.matIx] * f);
  const Kent = (i.qty[FITTINGS.length] || 0) * K_ENTRANCE;
  const Kexit = (i.qty[FITTINGS.length + 1] || 0) * K_EXIT;
  const K = Kpipe + Kfit.reduce((a, b) => a + b, 0) + Kent + Kexit;
  const hL = (K * V * V) / (2 * G);
  const x = (S.P1 - P2) / S.P1;
  const xch = K > 0 ? Math.exp(-Math.exp(0.43 - 0.6 * k - 0.43 * Math.log(K))) : 0;
  const xu = xch > 0 ? Math.min(Math.max(x, 0), xch) : Math.max(x, 0);
  const cEq25 = 1 + 1.8 * xu * ((k - 1) / (K + 1));
  const c = model === "Isothermal" ? 1 : model === "Isentropic" ? k : cEq25;
  const Y = xu <= 0 || K <= 0 ? 1
    : Math.sqrt((c / ((c + 1) * xu)) * ((Math.pow(1 - xu, (c + 1) / c) - 1) / ((2 / (c * K)) * Math.log(1 - xu) - 1)));
  const avail = S.P1 * xu - i.elev * 0.3048 * rho * G;
  const loss = (rho * G * hL) / (Y * Y);
  return {
    mdot, V, Re, fLam, fTurb, f, Kpipe, Kfit, Kent, Kexit, K, hL, x, xch, xu, cEq25, c, Y,
    avail, loss, resid: avail - loss,
    mach: V / S.pr.sound,
    choked: x > xch,
    P2choked: (S.P1 * (1 - xch)) / PSI - i.atm,                 // psig
    P2used: (S.P1 * (1 - xu)) / PSI - i.atm,                    // psig
  };
}

/** Find mdot (lbm/hr) with residual = 0. Residual falls monotonically as flow rises. */
export function solve(i, S, P2override, modelOverride) {
  const r = (m) => evaluate(i, S, m, P2override, modelOverride).resid;
  if (!(r(1e-9) > 0)) return null;
  let lo = 1e-9, hi = 1;
  for (let n = 0; n < 80 && r(hi) > 0; n++) { lo = hi; hi *= 4; }
  if (r(hi) > 0) return null;
  for (let n = 0; n < 200; n++) {
    const mid = Math.sqrt(lo * hi);
    if (r(mid) > 0) lo = mid; else hi = mid;
    if (hi / lo < 1 + 1e-14) break;
  }
  return evaluate(i, S, Math.sqrt(lo * hi), P2override, modelOverride);
}

/** Solved flow vs outlet pressure, from the inlet pressure down to 5 % of inlet absolute. */
export function flowCurve(i, S, n = 48) {
  const pMax = i.pin, pMin = Math.max(-i.atm + 0.2, i.pin - (i.pin + i.atm) * 0.95);
  const pts = [];
  for (let k = 1; k <= n; k++) {
    const pg = pMax - ((pMax - pMin) * k) / n;
    const sol = solve(i, S, (pg + i.atm) * PSI);
    if (sol) pts.push([pg, sol.mdot]);
  }
  return { pMin, pMax, pts };
}

/** Decision path from the Polytropic Pipe Flow Model Selection Guide (steps 1–8). */
export function adviseModel(i, S, sols, r) {
  const steps = [];
  const k = S.pr.k;
  const z = S.pr.Z;
  const step1 = S.pr.valid && k > 1 && k <= 1.67 && Math.abs(1 - z) < 0.05;
  steps.push({ n: 1, q: "Inside this model?", a: step1 ? "Yes" : "Check",
    detail: `Single-phase gas, steady, constant bore. k = ${k.toFixed(4)} (1–1.67), Z = ${z.toFixed(4)} (near 1).` });
  // A single valve (one unit, not a run of elbows) carrying over half of K is a restriction-dominated line.
  const valves = [3, 4, 5].filter((j) => (i.qty[j] || 0) > 0).map((j) => [FITTINGS[j][0], r.Kfit[j] / i.qty[j]]);
  const top = valves.reduce((a, b) => (b[1] > a[1] ? b : a), ["", 0]);
  const dominated = r.K < 1 || top[1] > 0.5 * r.K;
  steps.push({ n: 2, q: "Does one restriction dominate?", a: dominated ? "Check" : "No",
    detail: r.K < 1 ? "Total K < 1: size the restriction with its own tool and add the line as a series loss."
      : dominated ? `One ${top[0]} is ${(100 * top[1] / r.K).toFixed(0)} % of K. If a valve or orifice sets the flow, size it with its own tool first.`
      : "No single valve carries more than half of K; the line resistance is distributed." });
  steps.push({ n: 3, q: "K and x", a: `K = ${r.K.toFixed(2)}, x = ${r.x.toFixed(4)}`, detail: "Absolute pressures; K includes pipe, fittings, entrance and exit." });
  const iso = sols["Isothermal"], poly = sols["Polytropic (Eq. 25)"];
  const spread = iso && poly ? Math.abs(poly.mdot - iso.mdot) / poly.mdot : NaN;
  let rec, why;
  if (r.x < 0.1) {
    steps.push({ n: 4, q: "Is x < 0.1?", a: "Yes", detail: `Model choice is immaterial here: Isothermal and Polytropic differ by ${(100 * spread).toFixed(2)} %.` });
    rec = "Polytropic (Eq. 25)"; why = "x < 0.1, so the choice is immaterial; the guide defaults to Polytropic.";
  } else {
    steps.push({ n: 4, q: "Is x < 0.1?", a: "No", detail: `Isothermal and Polytropic differ by ${(100 * spread).toFixed(2)} %.` });
    steps.push({ n: 5, q: "Is x ≥ x_ch?", a: r.choked ? "Yes, choked" : "No, subsonic",
      detail: `x_ch = ${r.xch.toFixed(4)} (Eq. 34).${r.choked ? " Flow no longer depends on P₂; modes differ most here." : ""}` });
    const th = THERMAL.indexOf(i.thermal);
    if (th === 1) { rec = "Polytropic (Eq. 25)"; why = "Adiabatic line: Polytropic is within about 1 % of exact Fanno flow."; }
    else if (th === 2) { rec = "Isothermal"; why = "The wall can resupply the expansion cooling, so the flow is close to isothermal."; }
    steps.push({ n: 6, q: "Thermal environment", a: THERMAL[Math.max(0, th)], detail: th === 0 || th < 0 ? (spread < 0.02 ? "Modes differ by less than 2 %: report Polytropic." : "Modes differ by 2 % or more: choose by consequence (step 7).") : why });
    if (!rec && spread < 0.02) { rec = "Polytropic (Eq. 25)"; why = "Thermal environment unknown, but the two physical modes differ by less than 2 %."; }
    if (!rec) {
      const p = PURPOSE.indexOf(i.purpose);
      if (p === 1) { rec = "Isothermal"; why = "A guaranteed minimum flow (or maximum ΔP) is needed: Isothermal gives the lower flow."; }
      else if (p === 2) { rec = "Polytropic (Eq. 25)"; why = "A credible maximum flow is needed: use Polytropic and add margin. Isentropic is a non-physical upper bound only."; }
      else { rec = "Polytropic (Eq. 25)"; why = `Best estimate with an unknown thermal environment: report Polytropic and state the Isothermal result (${(100 * spread).toFixed(1)} % lower) as the bound.`; }
      steps.push({ n: 7, q: "Which error direction is unsafe?", a: PURPOSE[Math.max(0, p)], detail: why });
    }
  }
  steps.push({ n: 8, q: "Solve and verify", a: "See checks", detail: "Status, Re outside 2300–4000, K ≥ 1, k within 1–1.67, outlet Mach, elevation, Z at both ends." });
  return { recommended: rec, why, spread, steps, matches: rec === i.model };
}

const pct = (a, b) => (Number.isFinite(a) && Number.isFinite(b) ? (a - b) / b : NaN);

export default {
  id: "pipe-flow",
  title: "Polytropic Gas Pipe Flow",
  short: "Polytropic Pipe Flow",
  version: "1.0.0",
  summary: "Find the gas flow a pipe run will pass for a given inlet and outlet pressure. Includes friction, fittings, elevation, polytropic expansion and a choked-flow check.",
  groups: [
    { id: "fluid", label: "" },
    { id: "pt", label: "Pressure & temperature" },
    { id: "pipe", label: "Pipe" },
    { id: "fit", label: "Fittings & valves" },
    { id: "guide", label: "Model selection" },
  ],
  fields: [
    { key: "fluid", label: "Fluid", type: "select", options: GAS_NAMES, default: "ARGON", group: "fluid" },
    { key: "method", label: "Property source", type: "select", options: ["Ideal Gas", "Peng-Robinson"], default: "Peng-Robinson", group: "fluid" },
    { key: "model", label: "Flow model", type: "select", options: MODELS, default: MODELS[0], group: "fluid", full: true },
    { key: "pin", label: "Inlet pressure", type: "number", unit: "psig", default: 25, group: "pt" },
    { key: "pout", label: "Outlet pressure", type: "number", unit: "psig", default: 20, group: "pt" },
    { key: "t", label: "Inlet temperature", type: "number", unit: "°F", default: 70, group: "pt" },
    { key: "atm", label: "Atmospheric pressure", type: "number", unit: "psia", default: 14.7, group: "pt" },
    { key: "id", label: "Inside diameter", type: "number", unit: "in", default: 2.065, group: "pipe", hint: "2.065 in = 2\" Sch 80" },
    { key: "eps", label: "Roughness", type: "number", unit: "in", default: 0.0005, group: "pipe" },
    { key: "len", label: "Length", type: "number", unit: "ft", default: 100, group: "pipe" },
    { key: "elev", label: "Elevation rise", type: "number", unit: "ft", default: 0, group: "pipe" },
    { key: "mat", label: "Fitting material basis (Le/D table)", type: "select", options: MATERIALS, default: "Commercial Steel", group: "pipe", full: true },
    { key: "qty", label: "Fitting quantities", type: "fittings", default: [0, 0, 50, 3, 0, 0, 0, 0, 0, 0], group: "fit", full: true },
    { key: "thermal", label: "Thermal environment", type: "select", options: THERMAL, default: THERMAL[0], group: "guide", full: true },
    { key: "purpose", label: "What the result is for", type: "select", options: PURPOSE, default: PURPOSE[0], group: "guide", full: true },
  ],

  calculate(v) {
    const S = setup(v);
    const base = { S, checks: [], tables: [propTable(v, S)] };
    const fail = (text, detail) => ({ ...base, ok: false, status: { level: "bad", text, detail }, headline: [], results: [], raw: { S } });
    if (!S.pr.valid) return fail(S.pr.status, "Property engine");
    if (v.pin <= v.pout) return fail("CHECK: Pin must exceed Pout", "Raise inlet or lower outlet pressure");
    if (!(v.id > 0) || !(v.len >= 0)) return fail("CHECK: pipe dimensions", "Inside diameter must be positive");
    const r = solve(v, S);
    if (!r) return fail("CHECK: elevation exceeds pressure head", "No positive flow satisfies the balance");

    const sols = Object.fromEntries(MODELS.map((m) => [m, m === v.model ? r : solve(v, S, undefined, m)]));
    const advice = adviseModel(v, S, sols, r);

    let status;
    if (r.K < 1) status = { level: "warn", text: "CHECK: Eq. 34 valid for K ≥ 1", detail: "Add pipe length or fittings" };
    else if (r.choked) status = { level: "bad", text: "CHOKED: using choked pressure drop", detail: "Flow is at its maximum for this inlet pressure" };
    else status = { level: "ok", text: "SUBSONIC: using actual pressure drop", detail: rangeNote(r, S) };

    const acfm = r.mdot / (S.pr.rho * 0.062428) / 60;
    const scfm = (acfm * S.pr.rho) / S.rho0;                     // at 0 °C and 1 atm
    const lbmin = r.mdot / 60, kghr = lbmin * 27.2155;
    // Outlet state along Pv^c = const
    const pr2 = 1 - r.xu;
    const V2 = r.V / Math.pow(pr2, 1 / r.c);
    const mach2 = V2 / (S.pr.sound * Math.sqrt(Math.pow(pr2, (r.c - 1) / r.c)));
    const S2 = props(S.fluid, S.T, (r.P2used + v.atm) * PSI, v.method);

    const checks = [
      { level: r.K >= 1 ? "ok" : "warn", label: "Total resistance K ≥ 1 (Eq. 34 range)", detail: `K = ${r.K.toFixed(3)}` },
      { level: S.pr.k >= 1 && S.pr.k <= 1.67 ? "ok" : "warn", label: "Heat-capacity ratio k within 1.0–1.67", detail: `k = ${S.pr.k.toFixed(4)}` },
      { level: r.Re >= 2300 && r.Re < 4000 ? "warn" : "ok", label: "Reynolds number outside transition (2300–4000)", detail: `Re = ${Math.round(r.Re).toLocaleString("en-US")}` },
      { level: r.choked ? "bad" : "ok", label: "Not choked", detail: `x = ${r.x.toFixed(4)}, x_ch = ${r.xch.toFixed(4)}` },
      { level: mach2 < 0.3 ? "ok" : mach2 < 0.7 ? "warn" : "bad", label: "Outlet Mach number (estimate)", detail: `Inlet ${r.mach.toFixed(3)}, outlet ≈ ${mach2.toFixed(3)} along Pv^c = const` },
      { level: Math.abs(1 - S.pr.Z) < 0.05 && (!S2.valid || Math.abs(1 - S2.Z) < 0.05) ? "ok" : "warn", label: "Near-ideal gas at both ends (|1 − Z| < 0.05)", detail: `Z inlet ${S.pr.Z.toFixed(4)}, outlet ${S2.valid ? S2.Z.toFixed(4) : "NA"}` },
      { level: v.elev === 0 ? "ok" : "warn", label: "Elevation term", detail: v.elev === 0 ? "No elevation change" : `${v.elev} ft rise uses inlet density for the whole column` },
      { level: advice.matches ? "ok" : "warn", label: "Flow model matches the selection guide", detail: advice.matches ? advice.why : `Guide suggests ${advice.recommended}: ${advice.why}` },
    ];

    const fitRows = FITTINGS.map((f, j) => [f[0], v.qty[j] || 0, `Le/D ${f[1][S.matIx]}`, r.Kfit[j]])
      .concat([["Entrance", v.qty[FITTINGS.length] || 0, `K ${K_ENTRANCE}`, r.Kent],
        ["Exit", v.qty[FITTINGS.length + 1] || 0, `K ${K_EXIT}`, r.Kexit],
        ["Straight pipe, f·L/D", `${v.len} ft`, "", r.Kpipe]]);

    return {
      ok: true,
      status,
      headline: [
        { key: "mdot", label: "Mass flow", value: r.mdot, unit: "lbm/hr", digits: 5 },
        { key: "scfm", label: "Standard flow", value: scfm, unit: "SCFM (0 °C, 1 atm)", digits: 5 },
        { key: "vel", label: "Inlet gas velocity", value: r.V, unit: "m/s", digits: 4 },
      ],
      results: [
        { label: "Mass flow rate", value: r.mdot, unit: "lbm/hr", digits: 5 },
        { label: "Mass flow rate", value: kghr, unit: "kg/hr", digits: 5 },
        { label: "Standard flow (0 °C, 1 atm)", value: scfm, unit: "SCFM", digits: 5 },
        { label: "Actual flow at inlet", value: acfm, unit: "ACFM", digits: 5 },
        { label: "Inlet velocity", value: r.V, unit: "m/s", digits: 4 },
        { label: "Inlet Mach number", value: r.mach, unit: "–", digits: 4 },
        { label: "Reynolds number", value: r.Re, unit: r.Re < 2300 ? "laminar" : r.Re < 4000 ? "transitional" : "turbulent", digits: 5 },
        { label: "Friction factor used", value: r.f, unit: r.Re < 2300 ? "64/Re" : "Swamee–Jain", digits: 4 },
        { label: "Total resistance K", value: r.K, unit: "velocity heads", digits: 4 },
        { label: "Pressure ratio x = ΔP/P₁, actual", value: r.x, unit: "–", digits: 4 },
        { label: "Choked pressure ratio x_ch (Eq. 34)", value: r.xch, unit: "–", digits: 4 },
        { label: "Outlet pressure used", value: r.P2used, unit: "psig", digits: 5 },
        { label: "Outlet pressure at choke", value: r.P2choked, unit: "psig", digits: 5 },
        { label: "Polytropic index c", value: r.c, unit: "–", digits: 6 },
        { label: "Net expansion factor Y", value: r.Y, unit: "–", digits: 6 },
        { label: "Solver residual", value: r.resid, unit: "Pa (target 0)", sci: true },
      ],
      tables: [
        { title: "Resistance build-up", columns: ["Item", "Qty", "Basis", "K"], rows: fitRows, foot: ["Total resistance K", "", "", r.K] },
        { title: "Model comparison", columns: ["Flow model", "Mass flow (lbm/hr)", "vs Polytropic", "c"],
          rows: MODELS.map((m) => [m + (m === v.model ? " (selected)" : ""), sols[m] ? sols[m].mdot : NaN,
            sols[m] && sols[MODELS[0]] ? { pct: pct(sols[m].mdot, sols[MODELS[0]].mdot) } : NaN, sols[m] ? sols[m].c : NaN]) },
        propTable(v, S),
      ],
      advice,
      checks,
      raw: { S, r, sols, mach2, scfm, acfm },
    };
  },

  method: {
    basis: "Integrated momentum balance for compressible flow with friction along a Pv^c = constant path (polytropic approximation). The mass flow is solved so the available pressure term equals the friction and fitting losses divided by Y².",
    equations: [
      { note: "Mass flow is solved so the residual is zero", tex: String.raw`P_1\,x_{\mathrm{used}} - \Delta z\,\rho\,g - \frac{\rho\,g\,\sum h_L}{Y^2} = 0` },
      { note: "Velocity (ṁ in lb/hr, ID in inches), Reynolds number and friction factor (Swamee–Jain above Re 2300)", tex: String.raw`V = \frac{0.2486\,\dot m}{\rho\,\mathrm{ID}^2} \qquad \mathrm{Re} = \frac{\rho\,V\,D}{\mu} \qquad f = \frac{64}{\mathrm{Re}}\quad(\mathrm{Re} < 2300)` },
      { note: "Loss coefficients and head loss", tex: String.raw`K_{\mathrm{pipe}} = f\,\frac{L}{D} \qquad K_{\mathrm{fitting}} = \mathrm{Qty}\cdot\frac{L_e}{D}\,f \qquad K_{\mathrm{entrance}} = 0.5 \qquad K_{\mathrm{exit}} = 1.0 \qquad \sum h_L = \frac{K\,V^2}{2g}` },
      { note: "Polytropic exponent (Eq. 25); c = 1 isothermal, c = k isentropic", tex: String.raw`c = 1 + \frac{1.8\,x\,(k-1)}{K+1}` },
      { note: "Expansion factor", tex: String.raw`Y = \sqrt{\frac{\dfrac{c}{(c+1)\,x}\left[(1-x)^{(c+1)/c} - 1\right]}{\dfrac{2}{c\,K}\,\ln(1-x) - 1}}` },
      { note: "Choked pressure ratio (Eq. 34, valid for K ≥ 1)", tex: String.raw`x_{\mathrm{ch}} = \exp\left[-\exp\left(0.43 - 0.6k - 0.43\,\ln K\right)\right] \qquad x_{\mathrm{used}} = \min(x,\ x_{\mathrm{ch}})` },
    ],
    assumptions: [
      "Steady, single-phase gas, constant bore, horizontal except for the elevation term.",
      "Density, viscosity and k are evaluated at inlet conditions (property range 250–600 K, 1 kPa–10 MPa).",
      "Fitting losses use equivalent lengths Le/D multiplied by the pipe friction factor.",
      "If x exceeds x_ch the choked ratio is used and the result is the maximum flow for this inlet pressure.",
    ],
    references: [
      "Kirkland, W. M. (2019), A Polytropic Approximation of Compressible Flow in Pipes With Friction, J. Fluids Eng. 141(12), 121404.",
      "Wilson, H. (2012), Pressure Drop in Pipe Fittings and Valves: Equivalent Length and Resistance Coefficient, Katmar Software.",
      "Swamee, P. K. and Jain, A. K. (1976), Explicit equations for pipe-flow problems, J. Hydraul. Div. ASCE 102(5).",
      "Peng, D.-Y. and Robinson, D. B. (1976), Ind. Eng. Chem. Fundam. 15(1).",
    ],
  },
};

function rangeNote(r, S) {
  if (r.K < 1) return "K < 1 not validated";
  if (S.pr.k < 1 || S.pr.k > 1.67) return "k outside 1.0–1.67";
  if (r.Re >= 2300 && r.Re < 4000) return "Transitional Reynolds range";
  return "Within stated range";
}

function propTable(v, S) {
  return {
    title: "Fluid properties at inlet",
    columns: ["Property", "Ideal gas / simple correlation", "Selected method", "Difference"],
    rows: [
      ["Molecular weight (g/mol)", S.MW, "", ""],
      ["Density (kg/m³)", S.rhoIdealSimple, S.pr.valid ? S.pr.rho : NaN, { pct: pct(S.rhoIdealSimple, S.pr.rho) }],
      ["Viscosity (Pa·s)", S.muLegacy, S.pr.valid ? S.pr.mu : NaN, { pct: pct(S.muLegacy, S.pr.mu) }],
      ["Heat-capacity ratio k = Cp/Cv", S.ideal.k, S.pr.valid ? S.pr.k : NaN, { pct: pct(S.ideal.k, S.pr.k) }],
      ["Speed of sound (m/s)", S.ideal.sound, S.pr.valid ? S.pr.sound : NaN, { pct: pct(S.ideal.sound, S.pr.sound) }],
      ["Compressibility Z", 1, v.method === "Peng-Robinson" && S.pr.valid ? S.pr.Z : 1, ""],
      ["Inlet pressure (kPa abs)", S.P1 / 1000, "", ""],
      ["Inlet temperature (K)", S.T, "", ""],
    ],
  };
}
