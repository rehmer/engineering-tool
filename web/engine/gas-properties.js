// Gas property lookup: the shared property model as its own page.
import { props, fToK, GAS, GAS_LIST, LAMBDA300, PA_PER_PSI, MW_AIR } from "./properties.js";

export default {
  id: "gas-properties",
  title: "Gas Property Lookup",
  short: "Gas Properties",
  version: "1.0.0",
  summary: "Density, compressibility, heat capacities, k, speed of sound, viscosity, conductivity and enthalpy for ten common gases, by ideal gas or Peng-Robinson.",
  groups: [{ id: "state", label: "" }],
  fields: [
    { key: "gas", label: "Gas", type: "select", options: GAS_LIST, default: "Nitrogen", group: "state" },
    { key: "method", label: "Property method", type: "select", options: ["Ideal Gas", "Peng-Robinson"], default: "Peng-Robinson", group: "state" },
    { key: "p", label: "Pressure", type: "number", unit: "psig", default: 100, group: "state" },
    { key: "pamb", label: "Ambient pressure", type: "number", unit: "psia", default: 14.7, group: "state" },
    { key: "t", label: "Temperature", type: "number", unit: "°F", default: 70, group: "state" },
  ],

  calculate(v) {
    const G = String(v.gas).toUpperCase();
    const T = fToK(v.t), P = (v.p + v.pamb) * PA_PER_PSI;
    const sel = props(G, T, P, v.method), ig = props(G, T, P, "Ideal Gas"), pr = props(G, T, P, "Peng-Robinson");
    const [MW, Tc, Pc, w, , mu300, prOK] = GAS[G];
    const ok = sel.valid;
    const status = ok ? { level: "ok", text: sel.status, detail: v.method } : { level: "bad", text: sel.status, detail: "250–600 K, 1 kPa–10 MPa abs, gas phase" };
    const pct = (a, b) => (Number.isFinite(a) && Number.isFinite(b) ? { pct: (b - a) / a } : "");
    const row = (label, key, f = (x) => x) => [label, f(ig[key]), pr.valid ? f(pr[key]) : NaN, pr.valid ? pct(f(ig[key]), f(pr[key])) : ""];
    return {
      ok, status,
      headline: [
        { label: "Density", value: sel.rho, unit: "kg/m³", digits: 5 },
        { label: "Compressibility Z", value: v.method === "Ideal Gas" ? 1 : sel.Z, unit: `PR Z = ${Number.isFinite(pr.Z) ? pr.Z.toFixed(4) : "–"}`, digits: 5 },
        { label: "k = cp/cv", value: sel.k, unit: "–", digits: 5 },
      ],
      results: [
        { label: "Absolute pressure", value: v.p + v.pamb, unit: "psia", digits: 6 },
        { label: "Absolute temperature", value: T, unit: "K", digits: 6 },
        { label: "Density", value: sel.rho, unit: "kg/m³", digits: 6 },
        { label: "Density", value: sel.rho * 0.0624279606, unit: "lb/ft³", digits: 6 },
        { label: "Compressibility Z (Peng-Robinson)", value: sel.Z, unit: "–", digits: 6 },
        { label: "cp", value: sel.cp, unit: "J/(kg·K)", digits: 6 },
        { label: "cv", value: sel.cv, unit: "J/(kg·K)", digits: 6 },
        { label: "k = cp/cv", value: sel.k, unit: "–", digits: 6 },
        { label: "Speed of sound", value: sel.sound, unit: "m/s", digits: 6 },
        { label: "Speed of sound", value: sel.sound * 3.280839895, unit: "ft/s", digits: 6 },
        { label: "Viscosity", value: sel.mu, unit: "Pa·s", sci: true },
        { label: "Viscosity", value: sel.mu * 1000, unit: "cP", digits: 5 },
        { label: "Thermal conductivity", value: sel.lambda, unit: "W/(m·K)", digits: 5 },
        { label: "Enthalpy (from 298.15 K ideal gas)", value: sel.h / 1000, unit: "kJ/kg", digits: 6 },
        { label: "Volumetric expansion coefficient", value: sel.beta, unit: "1/K", digits: 5 },
        { label: "Molecular weight", value: MW, unit: "g/mol", digits: 7 },
        { label: "Specific gravity (air = 1)", value: MW / MW_AIR, unit: "–", digits: 6 },
      ],
      tables: [
        { title: "Ideal gas vs Peng-Robinson", columns: ["Property", "Ideal gas", "Peng-Robinson", "Difference"],
          rows: [row("Density (kg/m³)", "rho"), row("cp (J/kg·K)", "cp"), row("cv (J/kg·K)", "cv"), row("k", "k"), row("Speed of sound (m/s)", "sound"), row("Enthalpy (kJ/kg)", "h", (x) => x / 1000)] },
        { title: "Constants used", columns: ["Constant", "Value"],
          rows: [["Critical temperature (K)", Tc], ["Critical pressure (bar)", Pc / 1e5], ["Acentric factor ω", w], ["Viscosity at 300 K (Pa·s)", mu300], ["Conductivity at 300 K (W/m·K)", LAMBDA300[G]], ["Peng-Robinson supported", prOK ? "Yes" : "No (ideal gas only)"]] },
      ],
      checks: [
        { level: ig.valid ? "ok" : "bad", label: "Inside the property envelope", detail: `${T.toFixed(2)} K, ${(P / 1e5).toFixed(3)} bar abs; limits 250–600 K, 0.01–100 bar` },
        { level: pr.valid && Math.abs(1 - pr.Z) > 0.05 ? "warn" : "ok", label: "Ideal-gas deviation", detail: pr.valid ? `PR Z = ${pr.Z.toFixed(5)}; ideal-gas density is ${((1 / pr.Z - 1) * -100).toFixed(2)} % off` : "Peng-Robinson unavailable for this gas or state" },
        { level: P > 1e6 ? "warn" : "ok", label: "Transport properties", detail: P > 1e6 ? "Above 10 bar: viscosity and conductivity ignore pressure effects" : "Low-pressure power laws in T" },
      ],
      raw: { sel, ig, pr },
    };
  },

  method: {
    basis: "Peng-Robinson cubic equation of state with ideal-gas heat capacity polynomials fitted to CoolProp over 250–600 K. Ideal gas sets Z = 1 and uses the ideal heat capacities. The same property model supplies every gas tool on this site.",
    equations: [
      { note: "Peng-Robinson equation of state", tex: String.raw`P = \frac{R\,T}{v-b} - \frac{a(T)}{v^2 + 2bv - b^2}` },
      { tex: String.raw`a = 0.45724\,\frac{R^2\,T_c^2}{P_c}\left[1 + m\left(1-\sqrt{T/T_c}\right)\right]^2 \qquad b = 0.0778\,\frac{R\,T_c}{P_c}` },
      { note: "Z from the cubic (largest real root)", tex: String.raw`m = 0.37464 + 1.54226\,\omega - 0.26992\,\omega^2` },
      { note: "Ideal-gas heat capacity; enthalpy from 298.15 K plus the PR departure", tex: String.raw`c_{p0} = \sum_{i=0}^{4} c_i\left(\frac{T}{300}\right)^{i} \qquad h = \int_{298.15}^{T} c_{p0}\,dT + h_{\mathrm{dep}}` },
      { note: "Real-gas heat capacities", tex: String.raw`c_v = c_{p0} - R + \frac{T\,(d^2a/dT^2)}{2\sqrt{2}\,b}\,\ln\left[\frac{Z + 2.414B}{Z - 0.414B}\right] \qquad c_p = c_v - \frac{T\,(\partial P/\partial T)^2}{\partial P/\partial v}` },
      { note: "Speed of sound and transport properties", tex: String.raw`c = \sqrt{-\frac{v^2}{M}\,\frac{c_p}{c_v}\,\frac{\partial P}{\partial v}} \qquad \mu = \mu_{300}\left(\frac{T}{300}\right)^{0.7} \qquad \lambda = \lambda_{300}\left(\frac{T}{300}\right)^{0.8}` },
    ],
    assumptions: [
      "Envelope 250–600 K and 0.01–100 bar abs. Below 1.05·Tc a conservative Wilson screen rejects states near condensation; this is not a phase-equilibrium calculation.",
      "Air is treated as a pseudo-pure gas. Acetylene supports ideal gas only.",
      "Peng-Robinson is an engineering approximation, weakest for hydrogen, helium and polar gases such as ammonia and near the critical point.",
      "Transport properties ignore pressure effects.",
    ],
    references: [
      "Peng, D.-Y. & Robinson, D. B. (1976), A New Two-Constant Equation of State, Ind. Eng. Chem. Fundam. 15(1).",
      "Bell, I. H. et al. (2014), CoolProp, Ind. Eng. Chem. Res. 53(6) (source of the embedded constants and heat-capacity fits).",
    ],
  },
};
