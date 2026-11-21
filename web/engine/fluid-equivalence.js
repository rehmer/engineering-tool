// Fluid equivalence: what a standard volume flow measured or rated with one gas
// (the tested fluid) becomes for another gas through the same device.
// New in tool v1.1.0; there is no workbook equivalent.
import { props, fToK, RU } from "./properties.js";

const PA_PER_PSI = 6894.757293168;
const LBFT3_PER_KGM3 = 0.0624279606;
const M3_TO_FT3 = 35.3146667215;

export const EQ_GASES = ["Acetylene", "Air", "Ammonia", "Argon", "Butane", "Carbon Dioxide", "Helium", "Hydrogen", "Methane", "Nitrogen"];

export const EQ_BASES = [
  "Restriction, isentropic nozzle",
  "Restriction, square-root SG rule",
  "Same mass flow",
];
export const EQ_BASIS_SHORT = ["Nozzle", "√SG rule", "Same mass"];

/** Standard volume units, as factors to ft³/min at the reference state. */
export const STD_UNITS = { "SCFM": 1, "SCFH": 1 / 60, "Sm³/hr": M3_TO_FT3 / 60, "Sm³/min": M3_TO_FT3, "SLPM": M3_TO_FT3 / 1000 };

/** Ideal-gas heat capacity ratio at the state's temperature. */
const kIdeal = (st) => st.cp0 / (st.cp0 - RU);

/** Nozzle flow function ψ(k, r): ṁ = C·A·√(P₁ρ₁)·ψ. */
export function psi(k, r) {
  const rc = Math.pow(2 / (k + 1), k / (k - 1));
  if (r <= rc) return { psi: Math.sqrt(k) * Math.pow(2 / (k + 1), (k + 1) / (2 * (k - 1))), choked: true, rc };
  return { psi: Math.sqrt(((2 * k) / (k - 1)) * (Math.pow(r, 2 / k) - Math.pow(r, (k + 1) / k))), choked: false, rc };
}

/** Per-fluid quantities at the device inlet and the standard reference. */
function fluidState(gas, i) {
  const st1 = props(gas, i.T1, i.P1, i.method);
  const stS = props(gas, i.Tref, i.Pref, i.method);
  const k = kIdeal(st1);
  const n = psi(k, i.P2 / i.P1);
  return {
    gas, MW: st1.MW, Z1: i.method === "Ideal Gas" ? 1 : st1.Z, k, rc: n.rc, choked: n.choked, psi: n.psi,
    rho1: st1.rho, rhoStd: stS.rho, valid: st1.valid && stS.valid, status: !st1.valid ? st1.status : stS.status,
    // mass flux per unit effective area (kg/s per m² of C·A) for each basis
    gNozzle: n.psi * Math.sqrt(i.P1 * st1.rho),
    gSqrt: Math.sqrt(2 * st1.rho * Math.max(0, i.P1 - i.P2)),
  };
}

/**
 * i: { from, to, q (in `unit`), unit, p1, p2 (psig), pamb (psia), t (°F), ps (psia), ts (°F), method, basis }
 */
export function equivalence(i) {
  const P1 = (i.p1 + i.pamb) * PA_PER_PSI, P2 = (i.p2 + i.pamb) * PA_PER_PSI;
  const s = { P1, P2, T1: fToK(i.t), Pref: i.ps * PA_PER_PSI, Tref: fToK(i.ts), method: i.method };
  const A = fluidState(i.from, s), B = fluidState(i.to, s);
  const qA = i.q * STD_UNITS[i.unit];                    // SCFM of the tested fluid
  const mA = qA * 60 * A.rhoStd * LBFT3_PER_KGM3;        // lbm/hr of the tested fluid
  // Q_std = ṁ / ρ_std, ṁ ∝ C·A·g → Q_B/Q_A = (g_B/ρstd,B)/(g_A/ρstd,A)
  const ratios = [
    (B.gNozzle / B.rhoStd) / (A.gNozzle / A.rhoStd),
    (B.gSqrt / B.rhoStd) / (A.gSqrt / A.rhoStd),
    A.rhoStd / B.rhoStd,
  ];
  const sel = Math.max(0, EQ_BASES.indexOf(i.basis));
  const qB = ratios.map((r) => (i.q * r));               // in the same unit as the input
  const mB = qB.map((q) => q * STD_UNITS[i.unit] * 60 * B.rhoStd * LBFT3_PER_KGM3);
  // effective flow area implied by the test, C·A, on the nozzle basis (in²)
  const CA = ((mA * 0.45359237) / 3600 / A.gNozzle) * 1550.0031;
  return { P1, P2, A, B, qA, mA, ratios, sel, ratio: ratios[sel], q: i.q, unit: i.unit, qB, mB, CA };
}

/** Results, tables and checks for display and the calc record. */
export function equivalenceReport(i) {
  const e = equivalence(i);
  const { A, B } = e;
  const checks = [];
  let status;
  const pressureOK = e.P1 > 0 && e.P2 > 0 && e.P2 < e.P1;
  if (!pressureOK) {
    status = { level: "bad", text: "Outlet pressure must be below inlet pressure and above zero absolute", detail: "" };
  } else if (!A.valid || !B.valid) {
    status = { level: "bad", text: `${!A.valid ? i.from : i.to}: ${!A.valid ? A.status : B.status}`, detail: "Check pressures, temperature and density method" };
  } else {
    const r = e.ratio;
    status = { level: "ok", text: `1 ${i.unit} of ${i.from} ≡ ${r.toPrecision(5)} ${i.unit} of ${i.to}`, detail: EQ_BASES[e.sel] };
  }
  const ok = status.level !== "bad";
  if (ok) {
    if (A.choked !== B.choked) checks.push({ level: "warn", label: "Flow regime differs between the gases", detail: `P₂/P₁ = ${(e.P2 / e.P1).toFixed(3)} lies between the critical ratios ${A.rc.toFixed(3)} (${i.from}) and ${B.rc.toFixed(3)} (${i.to}). Small changes in pressure move the result.` });
    else checks.push({ level: "ok", label: `Both gases ${A.choked ? "choked" : "subcritical"} at P₂/P₁ = ${(e.P2 / e.P1).toFixed(3)}`, detail: `Critical ratio ${A.rc.toFixed(3)} (${i.from}), ${B.rc.toFixed(3)} (${i.to})` });
    const dSG = Math.abs(e.ratios[1] / e.ratios[0] - 1);
    if (e.sel === 1) checks.push({ level: dSG > 0.02 ? "warn" : "ok", label: "Square-root SG rule assumes a small pressure drop", detail: `ΔP/P₁ = ${((e.P1 - e.P2) / e.P1).toFixed(3)}; differs from the nozzle basis by ${(dSG * 100).toFixed(2)} %${dSG > 0.02 ? ". Use the nozzle basis at this pressure drop." : ""}` });
    const mwRatio = Math.max(A.MW, B.MW) / Math.min(A.MW, B.MW);
    checks.push({ level: mwRatio > 3 ? "warn" : "ok", label: "Same discharge coefficient assumed for both gases", detail: mwRatio > 3 ? `Molecular weights differ by ${mwRatio.toFixed(1)}×. Viscosity and Reynolds-number effects can shift C; confirm against manufacturer data for meters and small orifices.` : `Molecular weight ratio ${mwRatio.toFixed(2)}` });
    if (i.method === "Ideal Gas") {
      const st = [props(i.from, fToK(i.t), e.P1, "Peng-Robinson"), props(i.to, fToK(i.t), e.P1, "Peng-Robinson")];
      const dz = Math.max(...st.map((x) => (x.valid ? Math.abs(1 - x.Z) : 0)));
      checks.push({ level: dz < 0.02 ? "ok" : "warn", label: "Ideal-gas inlet density", detail: `Largest |1 − Z| at inlet = ${dz.toFixed(4)}${dz >= 0.02 ? "; select Peng-Robinson above" : ""}` });
    }
  }
  const pick = (k) => [A[k], B[k]];
  const rows = EQ_BASES.map((b, j) => [EQ_BASIS_SHORT[j] + (j === e.sel ? " (selected)" : ""), e.ratios[j], e.qB[j], e.mB[j]]);
  return {
    ok, status, raw: e,
    headline: { value: ok ? e.qB[e.sel] : NaN, unit: `${i.unit} of ${i.to}`, ratio: ok ? e.ratio : NaN },
    comparison: { title: `Equivalent ${i.to} flow by basis`, columns: ["Basis", "Ratio", i.unit, "lbm/hr"], rows: ok ? rows : [] },
    fluids: {
      title: "Gas properties used",
      columns: ["Property", i.from, i.to],
      rows: [
        ["Molecular weight (g/mol)", ...pick("MW")],
        ["k = cp/cv (ideal, inlet T)", ...pick("k")],
        ["Critical pressure ratio", ...pick("rc")],
        ["Regime at P₂/P₁", ...[A, B].map((x) => (x.choked ? "choked" : "subcritical"))],
        ["Z at inlet (density used)", ...pick("Z1")],
        ["Inlet density (kg/m³)", ...pick("rho1")],
        ["Standard density (kg/m³)", ...pick("rhoStd")],
        ["Nozzle flow function ψ", ...pick("psi")],
      ],
    },
    results: ok ? [
      { label: `Equivalence: tested flow, ${i.from}`, value: i.q, unit: i.unit, digits: 6 },
      { label: `Equivalence: tested flow, ${i.from}`, value: e.mA, unit: "lbm/hr", digits: 6 },
      { label: `Equivalence: equivalent flow, ${i.to} (${EQ_BASIS_SHORT[e.sel]})`, value: e.qB[e.sel], unit: i.unit, digits: 6 },
      { label: `Equivalence: equivalent flow, ${i.to}`, value: e.mB[e.sel], unit: "lbm/hr", digits: 6 },
      { label: `Equivalence: ratio ${i.to} / ${i.from}`, value: e.ratio, unit: "–", digits: 6 },
      { label: "Equivalence: implied effective area C·A (nozzle)", value: e.CA, unit: "in²", digits: 4 },
    ] : [],
    checks,
  };
}

export const EQ_METHOD = {
  basis: "A device tested or rated in standard flow of one gas passes a different standard flow of another gas. Flow through a fixed restriction depends on the gas density at the inlet and, once compressibility matters, on its heat capacity ratio k. Each gas's standard flow is its mass flow divided by its own standard density at the same reference state, so the ratio between gases depends only on the gases and the pressures, not on the size of the device.",
  equations: [
    "Q_std = ṁ / ρ_std;   for the same device:  Q_B / Q_A = (ṁ_B / ρ_std,B) / (ṁ_A / ρ_std,A)",
    "Isentropic nozzle: ṁ = C·A·√(P₁·ρ₁)·ψ(k, r),  r = P₂/P₁",
    "ψ = √[2k/(k−1) · (r^(2/k) − r^((k+1)/k))]  for r > r_c;   ψ = √k · (2/(k+1))^((k+1)/(2(k−1)))  for r ≤ r_c (choked)",
    "r_c = (2/(k+1))^(k/(k−1));   k = c_p0 / (c_p0 − R) at the inlet temperature",
    "Nozzle, ideal gas:  Q_B/Q_A = (ψ_B/ψ_A) · √(M_A·Z_A / (M_B·Z_B))",
    "Square-root SG rule (small ΔP):  ṁ = C·A·√(2·ρ₁·ΔP)  ⇒  Q_B/Q_A = √(M_A/M_B) = √(SG_A/SG_B) for ideal gases",
    "Same mass flow:  Q_B/Q_A = ρ_std,A / ρ_std,B = M_A/M_B for ideal gases",
  ],
  assumptions: [
    "Same device and the same effective area C·A for both gases: the discharge coefficient is taken as unchanged. Reynolds-number and viscosity effects are ignored; they matter most for light gases (hydrogen, helium) and small or laminar flow elements.",
    "Both gases at the same inlet pressure, inlet temperature and outlet pressure, with the same standard reference. Dry, single-phase gas; adiabatic flow.",
    "The nozzle basis covers orifices, nozzles, relief valves (its choked form matches the API 520 C coefficient), and regulators or valves at a fixed opening. At small pressure drop it tends to the square-root SG rule; the two separate as ΔP grows and most when the flow chokes.",
    "The square-root SG rule is the usual correction for rotameters (same float position, density at meter conditions) and for valves at low pressure drop.",
    "Not for thermal mass flow meters or controllers (they respond to heat capacity: use the manufacturer's gas correction factor), Coriolis meters (they read mass: use Same mass flow), or positive-displacement, turbine and vortex meters (they read actual volume: use the converter above with actual volume as the input).",
    "Control valves: the ISA/IEC Cv equation uses an expansion factor with F_k = k/1.4 and the valve's x_T; the nozzle basis approximates it. Use the valve's own x_T for sizing.",
    "k is the ideal-gas value at the inlet temperature. Near saturation or at high pressure the real isentropic exponent differs.",
  ],
  references: [
    "Shapiro, A. H. (1953), The Dynamics and Thermodynamics of Compressible Fluid Flow, Vol. 1, Ronald Press (isentropic nozzle flow).",
    "API Standard 520 Part I, Sizing, Selection, and Installation of Pressure-relieving Devices (critical flow coefficient C).",
    "ANSI/ISA-75.01.01 (IEC 60534-2-1), Flow Equations for Sizing Control Valves (gas specific gravity and expansion factor).",
  ],
};
