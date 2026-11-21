// Gas flow through a valve from its Cv. Mirrors workbook sheet 'Cv flow rate calculator'.
import { props, fToK, GAS_LIST, PA_PER_PSI, LB_PER_KG, MW_AIR } from "./properties.js";

const N2 = 22.67;          // C39, SCFM / psia / °R basis
const FT3_M3 = 0.028316846592;

export function cvFlow(i) {
  const gas = String(i.gas).toUpperCase();
  const P1 = i.p1 + i.pamb, P2 = i.p2 + i.pamb, dP = P1 - P2;  // C19:C21 psia
  const TR = i.t + 459.67;                                      // E9 °R
  const MW = props(gas, 300, 101325, "Ideal Gas").MW;           // C37
  const SG = MW / MW_AIR;                                       // C38
  const stStd = props(gas, fToK(60), 14.7 * PA_PER_PSI, i.method);   // row 9
  const stUp = props(gas, fToK(i.t), P1 * PA_PER_PSI, i.method);     // row 10
  const stRef = props(gas, fToK(i.tref), i.pref * PA_PER_PSI, i.method); // row 11
  const rhoStd = stStd.valid ? stStd.rho : NaN, rhoUp = stUp.valid ? stUp.rho : NaN, rhoRef = stRef.valid ? stRef.rho : NaN;
  const inputsOK = !(P1 <= 0 || P2 < 0 || P1 <= P2 || i.t <= -459.67 || i.cv <= 0 || i.pref <= 0 || i.tref <= -459.67);
  const choked = P2 <= 0.5 * P1;                                // C17
  const scfm = !inputsOK ? NaN : choked
    ? 0.471 * N2 * i.cv * P1 * Math.sqrt(1 / (SG * TR))
    : N2 * i.cv * P1 * (1 - (2 * dP) / (3 * P1)) * Math.sqrt(dP / (P1 * SG * TR)); // C25
  const mdot = (scfm * FT3_M3) / 60 * rhoStd;                   // C29 kg/s
  return {
    inputsOK, P1, P2, dP, TR, MW, SG, choked, scfm, mdot, rhoStd, rhoUp, rhoRef, stStd, stUp, stRef,
    regime: !inputsOK ? "—" : choked ? "High pressure drop / choked" : "Low pressure drop",
    slpm: scfm * 28.316846592,                                  // C26
    nm3h: (mdot / rhoRef) * 3600,                               // C27
    acfm: ((mdot / rhoUp) * 60) / FT3_M3,                       // C28
    rhoStdIdeal: (14.7 * PA_PER_PSI * (MW / 1000)) / (8.314462618 * fToK(60)),
    rhoUpIdeal: (P1 * PA_PER_PSI * (MW / 1000)) / (8.314462618 * fToK(i.t)),
    rhoRefIdeal: (i.pref * PA_PER_PSI * (MW / 1000)) / (8.314462618 * fToK(i.tref)),
  };
}

export default {
  id: "cv-flow",
  title: "Cv Gas Valve Flow",
  short: "Cv Valve Flow",
  version: "1.0.0",
  sheet: "Cv flow rate calculator",
  summary: "Gas flow through a valve of known Cv by the legacy ISA S75.01 correlation, reported as standard, normal, actual and mass flow.",
  groups: [
    { id: "gas", label: "" },
    { id: "p", label: "Operating conditions" },
    { id: "ref", label: "Reference / normal conditions" },
  ],
  fields: [
    { key: "gas", label: "Gas", type: "select", options: GAS_LIST, default: "Argon", group: "gas" },
    { key: "method", label: "Density method", type: "select", options: ["Ideal Gas", "Peng-Robinson"], default: "Peng-Robinson", group: "gas" },
    { key: "cv", label: "Valve flow coefficient", type: "number", unit: "Cv", default: 0.73, group: "gas", full: true },
    { key: "p1", label: "Upstream pressure", type: "number", unit: "psig", default: 15, group: "p" },
    { key: "p2", label: "Downstream pressure", type: "number", unit: "psig", default: 1, group: "p" },
    { key: "pamb", label: "Atmospheric pressure", type: "number", unit: "psia", default: 14.7, group: "p" },
    { key: "t", label: "Upstream temperature", type: "number", unit: "°F", default: 70, group: "p" },
    { key: "pref", label: "Reference pressure", type: "number", unit: "psia", default: 14.696, group: "ref" },
    { key: "tref", label: "Reference temperature", type: "number", unit: "°F", default: 32, group: "ref", hint: "For Nm³/h; SCFM is always at 14.7 psia and 60 °F" },
  ],

  calculate(v) {
    const r = cvFlow(v);
    const ok = r.inputsOK && Number.isFinite(r.scfm);
    const bad = [r.stStd, r.stUp, r.stRef].find((s) => !s.valid);
    const status = !r.inputsOK ? { level: "bad", text: "CHECK INPUTS", detail: "P₁ must exceed P₂; Cv and reference pressure must be positive" }
      : bad ? { level: "warn", text: `SCFM valid; density-based flows unavailable`, detail: bad.status }
      : { level: "ok", text: r.regime, detail: r.stUp.status };
    const checks = [];
    if (ok) {
      checks.push({ level: "ok", label: `P₂/P₁ = ${(r.P2 / r.P1).toFixed(4)}`, detail: r.choked ? "At or below 0.5: choked equation, flow independent of P₂" : "Above 0.5: low pressure drop equation" });
      const x = r.dP / r.P1;
      if (!r.choked && x > 0.4) checks.push({ level: "warn", label: "Near the choke threshold", detail: "The legacy correlation switches abruptly at P₂ = 0.5·P₁; modern ISA-75.01.01 uses xT and Fk instead" });
      const dz = Math.abs(1 - r.stUp.Z);
      checks.push({ level: dz < 0.05 ? "ok" : "warn", label: "Gas close to ideal at the inlet", detail: `Z = ${r.stUp.Z.toFixed(4)}. The Cv correlation itself assumes ideal gas.` });
    }
    return {
      ok, status,
      headline: [
        { label: "Standard flow", value: r.scfm, unit: "SCFM (14.7 psia, 60 °F)", digits: 5 },
        { label: "Mass flow", value: r.mdot * LB_PER_KG * 3600, unit: "lb/h", digits: 5 },
        { label: "Actual upstream flow", value: r.acfm, unit: "ACFM", digits: 5 },
      ],
      results: [
        { label: "Gas flow", value: r.scfm, unit: "SCFM", digits: 6 },
        { label: "Gas flow", value: r.slpm, unit: "standard L/min", digits: 6 },
        { label: "Reference / normal gas flow", value: r.nm3h, unit: "Nm³/h", digits: 6 },
        { label: "Actual upstream gas flow", value: r.acfm, unit: "ACFM", digits: 6 },
        { label: "Mass flow", value: r.mdot, unit: "kg/s", digits: 6 },
        { label: "Mass flow", value: r.mdot * 3600, unit: "kg/h", digits: 6 },
        { label: "Mass flow", value: r.mdot * LB_PER_KG * 60, unit: "lb/min", digits: 6 },
        { label: "Mass flow", value: r.mdot * LB_PER_KG * 3600, unit: "lb/h", digits: 6 },
        { label: "Flow regime", value: r.regime, unit: "" },
        { label: "Pressure drop Δp", value: r.dP, unit: "psi", digits: 6 },
        { label: "Critical downstream pressure", value: 0.5 * r.P1 - v.pamb, unit: "psig", digits: 6 },
        { label: "Gas specific gravity (air = 1)", value: r.SG, unit: "–", digits: 6 },
      ],
      tables: [
        { title: "Densities", columns: ["State", "Ideal gas (kg/m³)", "Selected method (kg/m³)"],
          rows: [["Standard, 14.7 psia & 60 °F", r.rhoStdIdeal, r.rhoStd], ["Upstream", r.rhoUpIdeal, r.rhoUp], ["Reference / normal", r.rhoRefIdeal, r.rhoRef]] },
      ],
      checks,
      raw: r,
    };
  },

  method: {
    basis: "Legacy ISA S75.01-1989 gas correlation for flow through a valve of known Cv. Flow is calculated in SCFM at 14.7 psia and 60 °F, then converted to mass flow with the standard density and to actual and normal flow with the densities at those states.",
    equations: [
      "P₁, P₂ absolute (psia);  Δp = P₁ − P₂;  T₁ in °R;  G_g = M / 28.965",
      "Low pressure drop (P₂ > 0.5·P₁):  q = N₂ · Cv · P₁ · (1 − 2Δp/(3P₁)) · √[Δp / (P₁·G_g·T₁)]",
      "Choked (P₂ ≤ 0.5·P₁):  q = 0.471 · N₂ · Cv · P₁ / √(G_g·T₁),   N₂ = 22.67",
      "ṁ = q × 0.0283168 / 60 × ρ_std;   Nm³/h = ṁ / ρ_ref × 3600;   ACFM = ṁ / ρ₁ × 60 / 0.0283168",
    ],
    assumptions: [
      "The correlation assumes ideal gas behaviour and switches to choked flow at a fixed P₂/P₁ = 0.5. It does not use the valve's pressure-drop ratio factor xT or the specific-heat factor Fk.",
      "SCFM is defined at 14.7 psia and 60 °F; the reference / normal flow uses the editable conditions.",
      "Not intended near condensation or liquefaction. For valve sizing, use the current ANSI/ISA-75.01.01 (IEC 60534-2-1) method with the valve's xT.",
    ],
    references: [
      "ISA S75.01-1989, Flow Equations for Sizing Control Valves; ISA S75.02-1989, Control Valve Capacity Test Procedure.",
      "Current successors: ANSI/ISA-75.01.01 / IEC 60534-2-1 and ANSI/ISA-75.02.01 / IEC 60534-2-3.",
    ],
  },
};
