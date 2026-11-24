// Gas temperature rise in a horizontal pipe. Mirrors workbook sheet 'Gas Temp Rise in Pipe'
// and its node rows in 'Property calculations' (rows 12–463).
import { props, fToK, GAS_LIST, PA_PER_PSI, KG_PER_LB } from "./properties.js";

const FT3_M3 = 0.028316846592;
const BTU_K = 1.730734666;       // W/(m·K) per Btu/(hr·ft·°F)
const W_PER_BTUH = 0.2930710702;
export const FLOW_UNITS = ["SCFM", "ACFM", "lb/hr", "kg/hr"];
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const kToF = (K) => ((K - 273.15) * 9) / 5 + 32;

/** Node properties ('Property calculations' columns BC:BI). */
function nodeProps(gas, T, P, method) {
  const s = props(gas, T, P, method);
  return { T, P, valid: s.valid, status: s.status, rho: s.rho, mu: s.mu, lambda: s.lambda, cp: s.cp, h: s.h, sound: s.sound, beta: s.beta, k: s.k };
}

export function tempRise(i) {
  const gas = String(i.gas).toUpperCase();
  const N = i.segments;
  const inputsOK = !(i.flow <= 0 || i.pin < 0 || i.patm <= 0 || i.len <= 0 || i.id <= 0 || i.od <= i.id || i.rough < 0 || i.kpipe <= 0 ||
    (i.insul === "Insulated" && (i.tins <= 0 || i.kins <= 0)) || N < 5 || N > 50 || N % 1 !== 0);
  const D = i.id * 0.0254, ri = D / 2, ro = (i.od * 0.0254) / 2;
  const A = (Math.PI / 4) * D * D;                         // C29
  const Lseg = (i.len * 0.3048) / N;                       // C30
  const Tb = fToK(i.tb);
  const adiabatic = i.boundary === "Adiabatic";
  const n0 = nodeProps(gas, fToK(i.tin), (i.pin + i.patm) * PA_PER_PSI, i.method); // row 13
  const std = props(gas, fToK(60), 101352.9322, i.method);                          // row 12
  const mdot = i.unit === "lb/hr" ? (i.flow * KG_PER_LB) / 3600 : i.unit === "kg/hr" ? i.flow / 3600
    : i.unit === "ACFM" ? (i.flow * FT3_M3) / 60 * (n0.valid ? n0.rho : NaN) : (i.flow * FT3_M3) / 60 * (std.valid ? std.rho : NaN); // C28
  if (!inputsOK) return { inputsOK, status: "CHECK INPUTS", nodes: [], mdot, n0, std, A, N };

  // segment UA: inside film + pipe wall + optional insulation (Z column)
  const wallR = Math.log(ro / ri) / (2 * Math.PI * (i.kpipe * BTU_K) * Lseg);
  const insR = i.insul === "Insulated" ? Math.log((ro + i.tins * 0.0254) / ro) / (2 * Math.PI * (i.kins * BTU_K) * Lseg) : 0;
  const nodes = [];
  let cur = n0, fail = null;
  for (let j = 0; j <= N; j++) {
    const n = { j, x: (j * i.len) / N, ...cur };
    if (!cur.valid) { nodes.push(n); fail = fail || "CHECK GAS RANGE"; break; }
    n.V = mdot / (n.rho * A);                                        // S
    n.mach = n.V / n.sound;                                          // T
    n.Re = (n.rho * n.V * D) / n.mu;                                 // U
    n.Pr = (n.cp * n.mu) / n.lambda;                                 // V
    n.f = n.Re < 2300 ? 64 / n.Re : 0.25 / Math.pow(Math.log10((i.rough / i.id) / 3.7 + 5.74 / Math.pow(n.Re, 0.9)), 2); // W
    const nExp = Tb > n.T ? 0.4 : 0.3;
    n.Nu = n.Re < 2300 ? 3.66 : n.Re >= 10000 ? 0.023 * Math.pow(n.Re, 0.8) * Math.pow(n.Pr, nExp)
      : 3.66 + ((n.Re - 2300) / (10000 - 2300)) * (0.023 * Math.pow(10000, 0.8) * Math.pow(n.Pr, nExp) - 3.66); // X
    n.hi = (n.Nu * n.lambda) / D;                                    // Y
    const last = j >= N;
    n.UA = last || adiabatic ? 0 : 1 / (1 / (n.hi * 2 * Math.PI * ri * Lseg) + wallR + insR); // Z
    n.Q = last || adiabatic ? 0 : mdot * n.cp * (Tb - n.T) * (1 - Math.exp(-n.UA / (mdot * n.cp))); // AA
    n.q = last ? 0 : n.Q / mdot;                                     // AB
    n.dP = last ? 0 : n.f * (Lseg / D) * ((n.rho * n.V * n.V) / 2);  // AC
    n.Pnext = last ? n.P : Math.max(1000, n.P - n.dP);               // AD
    nodes.push(n);
    if (last) { n.res = 0; break; }
    // next node: nine bounded Newton evaluations of the total-enthalpy balance
    const target = n.h + n.q + (n.V * n.V) / 2;                      // AZ
    let T = clamp(n.T + n.q / n.cp, 250, 600), s, Vn, resid;
    for (let it = 0; it <= 8; it++) {
      s = nodeProps(gas, T, n.Pnext, i.method);
      Vn = mdot / (s.rho * A);                                       // AY
      resid = s.h + (Vn * Vn) / 2 - target;                          // BA
      if (it === 8) break;
      T = clamp(T - clamp(resid / (s.cp + Vn * Vn * s.beta), -50, 50), 250, 600); // BB
    }
    n.Vnext = mdot / (s.rho * A);                                    // AG
    n.res = Lseg / ((n.V + n.Vnext) / 2);                            // AH
    // Like the workbook: a node that does not converge leaves the next node without a state, which the
    // sheet reports as CHECK GAS RANGE; non-convergence at the outlet node itself is reported directly.
    if (s.valid && !(Math.abs(resid) < 0.1)) { fail = j + 1 < N ? "CHECK GAS RANGE" : "CHECK RANGE / CONVERGENCE"; n.unconverged = true; cur = { ...s, valid: false }; nodes.push({ j: j + 1, x: ((j + 1) * i.len) / N, ...s, converged: false }); break; }
    cur = s;
  }
  const done = nodes.filter((n) => Number.isFinite(n.V));
  const out = done.at(-1);
  let status = fail;
  if (!status) {
    const minP = Math.min(...done.map((n) => n.P)), maxM = Math.max(...done.map((n) => n.mach));
    status = minP <= 1000 ? "CHECK PRESSURE FLOOR" : maxM >= 1 ? "CHECK CHOKING" : maxM > 0.3 ? "HIGH MACH; REVIEW" : "OK - GAS ESTIMATE";
  }
  const sum = (k) => done.reduce((a, n) => a + (n[k] || 0), 0);
  const hPos = done.map((n) => n.hi).filter((h) => h > 0);
  const complete = !fail && out && out.j === N;
  return {
    inputsOK, status, nodes, mdot, n0, std, A, N, Lseg, complete,
    Tout: complete ? kToF(out.T) : NaN,
    Pout: complete ? out.P / PA_PER_PSI - i.patm : NaN,
    heatBtuh: sum("Q") / W_PER_BTUH,                                  // G13
    hMean: hPos.length ? hPos.reduce((a, b) => a + b, 0) / hPos.length / 5.678263337 : 0, // G14
    UA: sum("UA") / W_PER_BTUH / 1.8,                                 // G15, Btu/(hr·°F)
    UAworkbook: sum("UA") / W_PER_BTUH,
    maxMach: Math.max(...done.map((n) => n.mach)),
    Vin: done[0]?.V * 3.280839895,
    Vout: complete ? out.V * 3.280839895 : NaN,
    residence: sum("res"),
  };
}

export default {
  id: "temp-rise",
  title: "Gas Temperature Rise in Pipe",
  short: "Gas Temp Rise",
  version: "1.0.0",
  summary: "Steady 1-D gas flow in a horizontal pipe, marched segment by segment with Darcy pressure loss, wall heat transfer through pipe and insulation, and a total-enthalpy energy balance.",
  groups: [
    { id: "gas", label: "" },
    { id: "pipe", label: "Pipe" },
    { id: "heat", label: "Heat transfer" },
  ],
  fields: [
    { key: "gas", label: "Gas", type: "select", options: GAS_LIST, default: "Argon", group: "gas" },
    { key: "method", label: "Property method", type: "select", options: ["Ideal Gas", "Peng-Robinson"], default: "Peng-Robinson", group: "gas" },
    { key: "flow", label: "Flow rate", type: "number", default: 2, unitKey: "unit", units: FLOW_UNITS, group: "gas", full: true, hint: "SCFM at 14.7 psia and 60 °F; ACFM at inlet conditions" },
    { key: "unit", type: "unit", default: "SCFM" },
    { key: "tin", label: "Inlet gas temperature", type: "number", unit: "°F", default: 5, group: "gas" },
    { key: "pin", label: "Inlet pressure", type: "number", unit: "psig", default: 100, group: "gas" },
    { key: "patm", label: "Atmospheric pressure", type: "number", unit: "psia", default: 14.7, group: "gas" },
    { key: "len", label: "Pipe length", type: "number", unit: "ft", default: 100, group: "pipe" },
    { key: "id", label: "Inner diameter", type: "number", unit: "in", default: 2.067, group: "pipe" },
    { key: "od", label: "Outer diameter", type: "number", unit: "in", default: 2.375, group: "pipe" },
    { key: "rough", label: "Roughness", type: "number", unit: "in", default: 0.0018, group: "pipe" },
    { key: "segments", label: "Calculation segments", type: "number", unit: "5–50", default: 50, min: 5, max: 50, group: "pipe", hint: "Compare 25 and 50 to check sensitivity" },
    { key: "boundary", label: "Boundary condition", type: "select", options: ["Adiabatic", "Isothermal"], default: "Isothermal", group: "heat", hint: "Isothermal = fixed outer surface temperature" },
    { key: "tb", label: "Outer surface temperature", type: "number", unit: "°F", default: 200, group: "heat", activeIf: (v) => v.boundary === "Isothermal" },
    { key: "kpipe", label: "Pipe conductivity", type: "number", unit: "Btu/(hr·ft·°F)", default: 26, group: "heat", activeIf: (v) => v.boundary === "Isothermal" },
    { key: "insul", label: "Insulation", type: "select", options: ["None", "Insulated"], default: "Insulated", group: "heat", activeIf: (v) => v.boundary === "Isothermal" },
    { key: "tins", label: "Insulation thickness", type: "number", unit: "in", default: 1, group: "heat", activeIf: (v) => v.boundary === "Isothermal" && v.insul === "Insulated" },
    { key: "kins", label: "Insulation conductivity", type: "number", unit: "Btu/(hr·ft·°F)", default: 0.025, group: "heat", activeIf: (v) => v.boundary === "Isothermal" && v.insul === "Insulated" },
  ],

  calculate(v) {
    const r = tempRise(v);
    const lvl = r.status === "OK - GAS ESTIMATE" ? "ok" : r.status === "HIGH MACH; REVIEW" ? "warn" : "bad";
    const ok = lvl !== "bad" && r.complete;
    const status = { level: lvl, text: r.status, detail: `${r.N} segments · ${v.boundary === "Adiabatic" ? "adiabatic" : "isothermal outer surface"}` };
    const checks = [];
    if (r.inputsOK) {
      const okNodes = r.nodes.filter((n) => Number.isFinite(n.V));
      checks.push({ level: okNodes.every((n) => n.valid) && r.complete ? "ok" : "bad", label: "All nodes inside the property envelope and converged", detail: `${okNodes.length} of ${r.N + 1} nodes solved; energy residual below 0.1 J/kg at each` });
      checks.push({ level: r.maxMach >= 1 ? "bad" : r.maxMach > 0.3 ? "warn" : "ok", label: "Maximum Mach number", detail: `${Number.isFinite(r.maxMach) ? r.maxMach.toFixed(4) : "–"}${r.maxMach > 0.3 ? "; compressibility effects large, review" : ""}` });
      const reIn = r.nodes[0]?.Re;
      checks.push({ level: reIn > 2300 && reIn < 10000 ? "warn" : "ok", label: "Inlet flow regime", detail: `Re = ${Number.isFinite(reIn) ? Math.round(reIn).toLocaleString("en-US") : "–"}${reIn > 2300 && reIn < 10000 ? "; transitional, Nu is interpolated" : reIn < 2300 ? "; laminar, Nu = 3.66 (fully developed)" : "; turbulent, Dittus–Boelter"}` });
      checks.push({ level: "ok", label: "Segment sensitivity", detail: "Results change with segment count. Rerun at 25 and 50 segments to confirm the outlet temperature is stable." });
    }
    const prof = r.nodes.filter((n) => Number.isFinite(n.V));
    const pick = prof.length > 12 ? prof.filter((n, k) => k % Math.ceil(prof.length / 10) === 0 || k === prof.length - 1) : prof;
    return {
      ok, status,
      headline: [
        { label: "Outlet gas temperature", value: r.Tout, unit: "°F", digits: 5 },
        { label: "Temperature change", value: r.Tout - v.tin, unit: "°F", digits: 4 },
        { label: "Heat to gas", value: r.heatBtuh, unit: "Btu/hr", digits: 4 },
      ],
      results: [
        { label: "Outlet gas temperature", value: r.Tout, unit: "°F", digits: 6 },
        { label: "Temperature change", value: r.Tout - v.tin, unit: "°F", digits: 6 },
        { label: "Outlet gauge pressure", value: r.Pout, unit: "psig", digits: 8 },
        { label: "Pressure drop", value: v.pin - r.Pout, unit: "psi", digits: 5 },
        { label: "Mass flow", value: (r.mdot * 3600) / KG_PER_LB, unit: "lb/hr", digits: 6 },
        { label: "Mass flow", value: r.mdot, unit: "kg/s", digits: 6 },
        { label: "Heat transferred to gas", value: r.heatBtuh, unit: "Btu/hr", digits: 6 },
        { label: "Mean gas-side h", value: r.hMean, unit: "Btu/(hr·ft²·°F)", digits: 5 },
        { label: "Overall conductance UA", value: r.UA, unit: "Btu/(hr·°F)", digits: 5 },
        { label: "Maximum Mach number", value: r.maxMach, unit: "–", digits: 4 },
        { label: "Inlet velocity", value: r.Vin, unit: "ft/s", digits: 5 },
        { label: "Outlet velocity", value: r.Vout, unit: "ft/s", digits: 5 },
        { label: "Residence time", value: r.residence, unit: "s", digits: 5 },
      ],
      tables: [
        { title: "Profile along the pipe", columns: ["Distance (ft)", "Gas T (°F)", "Pressure (psig)", "Velocity (ft/s)", "Re", "h (Btu/hr·ft²·°F)"],
          rows: pick.map((n) => [n.x, kToF(n.T), n.P / PA_PER_PSI - v.patm, n.V * 3.280839895, n.Re, n.hi / 5.678263337]) },
      ],
      checks,
      raw: r,
    };
  },

  method: {
    basis: "The pipe is split into equal segments. At each node the gas properties are evaluated, the Darcy pressure loss and wall heat transfer over the segment are calculated, and the next node's temperature is found from a steady-flow energy balance on total enthalpy (h + V²/2).",
    equations: [
      { note: "Velocity and dimensionless groups", tex: String.raw`V = \frac{\dot m}{\rho A} \qquad \mathrm{Re} = \frac{\rho\,V\,D}{\mu} \qquad \mathrm{Pr} = \frac{c_p\,\mu}{\lambda}` },
      { note: "Friction factor: laminar below Re 2,300, otherwise Swamee–Jain", tex: String.raw`f = \frac{64}{\mathrm{Re}} \qquad f = \frac{0.25}{\left[\log_{10}\left(\dfrac{\varepsilon}{3.7D} + \dfrac{5.74}{\mathrm{Re}^{0.9}}\right)\right]^2}` },
      { note: "Nusselt number: 3.66 below Re 2,300; Dittus–Boelter at Re ≥ 10,000 (n = 0.4 heating, 0.3 cooling); linear in between", tex: String.raw`\mathrm{Nu} = 0.023\,\mathrm{Re}^{0.8}\,\mathrm{Pr}^{n} \qquad h = \frac{\mathrm{Nu}\,\lambda}{D}` },
      { note: "Overall conductance of a segment", tex: String.raw`\frac{1}{UA} = \frac{1}{h\,2\pi r_i L} + \frac{\ln(r_o/r_i)}{2\pi k_{\mathrm{pipe}} L} + \frac{\ln\left((r_o+t)/r_o\right)}{2\pi k_{\mathrm{ins}} L}` },
      { note: "Heat gain and pressure drop of a segment", tex: String.raw`Q = \dot m\,c_p\,(T_s - T)\left(1 - e^{-UA/(\dot m c_p)}\right) \qquad \Delta P = f\,\frac{L}{D}\,\frac{\rho V^2}{2} \qquad P_{\mathrm{next}} = \max(1,000\ \mathrm{Pa},\ P - \Delta P)` },
      { note: "Energy balance, solved with nine bounded Newton steps (|ΔT| ≤ 50 K, 250–600 K) to a residual below 0.1 J/kg", tex: String.raw`h(T_{\mathrm{next}},\ P_{\mathrm{next}}) + \frac{V_{\mathrm{next}}^2}{2} = h + \frac{Q}{\dot m} + \frac{V^2}{2}` },
    ],
    assumptions: [
      "Steady, horizontal, single-phase gas. Property envelope 250–600 K and 0.01–100 bar abs; the gas screen is not a phase-equilibrium calculation.",
      "Isothermal means the outer pipe or insulation surface is held at the boundary temperature. External air film and radiation are not modelled. Adiabatic ignores all thermal inputs.",
      "Laminar Nu = 3.66 assumes fully developed flow at constant wall temperature; entrance effects are ignored.",
      "Viscosity and conductivity use low-pressure power laws. Results depend on segment count; compare 25 and 50 segments.",
      "UA is reported in Btu/(hr·°F).",
    ],
    references: [
      "Incropera, DeWitt, Bergman & Lavine, Fundamentals of Heat and Mass Transfer (internal convection, Dittus–Boelter, cylindrical conduction).",
      "Swamee, P. K. & Jain, A. K. (1976), Explicit equations for pipe-flow problems, J. Hydraulics Div. ASCE 102(5).",
      "Peng, D.-Y. & Robinson, D. B. (1976), Ind. Eng. Chem. Fundam. 15(1) (enthalpy departure and heat capacities).",
    ],
  },
};
