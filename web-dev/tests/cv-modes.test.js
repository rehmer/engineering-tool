// Cv tool 2.0: flow from Cv or Cv from flow, for gas or liquid.
import { test } from "node:test";
import assert from "node:assert/strict";
import tool, { cvFlow, cvGasRequired, cvLiquid } from "../../web/engine/cv-flow.js";
import { defaults, normalize } from "../../web/engine/index.js";

const rel = (a, b) => Math.abs(a - b) / Math.abs(b);
const base = { ...defaults(tool) };

test("old saved cases (no mode or fluid) still give gas flow from Cv", () => {
  const old = normalize(tool, { gas: "Argon", method: "Peng-Robinson", cv: 0.73, p1: 15, p2: 1, pamb: 14.7, t: 70, pref: 14.696, tref: 32 });
  assert.equal(old.mode, "Flow from Cv");
  assert.equal(old.fluid, "Gas");
  const out = tool.calculate(old);
  assert.ok(out.ok);
  assert.ok(rel(out.raw.scfm, cvFlow(old).scfm) < 1e-12);
});

test("gas: Cv from flow inverts flow from Cv, subcritical and choked", () => {
  for (const p2 of [10, 1]) { // P₂/P₁ above and below 0.5
    const fwd = cvFlow({ ...base, cv: 2.5, p2 });
    for (const [unit, q] of [["SCFM", fwd.scfm], ["SCFH", fwd.scfm * 60], ["lb/hr", fwd.mdot * 2.20462262185 * 3600], ["kg/hr", fwd.mdot * 3600]]) {
      const inv = cvGasRequired({ ...base, mode: "Cv from flow", p2, qGas: q, qGasUnit: unit });
      assert.ok(rel(inv.cv, 2.5) < 1e-9, `${unit} p2=${p2}: ${inv.cv}`);
    }
  }
});

test("liquid: water at 1 psi through Cv 1 is 1 gpm", () => {
  const r = cvLiquid({ ...base, fluid: "Liquid", cv: 1, p1: 11, p2: 10, sg: 1 });
  assert.ok(!r.choked);
  assert.ok(rel(r.gpm, 1) < 1e-12);
});

test("liquid: flow scales with sqrt(ΔP/SG) and Cv from flow inverts it", () => {
  const r = cvLiquid({ ...base, fluid: "Liquid", cv: 3, p1: 30, p2: 10, sg: 0.8 });
  assert.ok(rel(r.gpm, 3 * Math.sqrt(20 / 0.8)) < 1e-12);
  for (const [u, q] of [["gpm", r.gpm], ["L/min", r.lpm], ["m³/h", r.m3h], ["kg/hr", r.mdot * 3600]]) {
    const inv = cvLiquid({ ...base, fluid: "Liquid", mode: "Cv from flow", p1: 30, p2: 10, sg: 0.8, qLiq: q, qLiqUnit: u });
    assert.ok(rel(inv.cv, 3) < 1e-9, u);
  }
});

test("liquid: choked flow caps the sizing pressure drop at FL²(P1 − FF·Pv)", () => {
  const i = { ...base, fluid: "Liquid", cv: 1, p1: 100, p2: 0, pamb: 14.7, sg: 1, fl: 0.9, pv: 0.3633, pc: 3200.1 };
  const r = cvLiquid(i);
  const FF = 0.96 - 0.28 * Math.sqrt(0.3633 / 3200.1);
  const lim = 0.81 * (114.7 - FF * 0.3633);
  assert.ok(r.choked);
  assert.ok(rel(r.dPchoke, lim) < 1e-12);
  assert.ok(rel(r.gpm, Math.sqrt(lim)) < 1e-12);
  const out = tool.calculate(i);
  assert.equal(out.status.level, "warn");
});

test("every mode and fluid solves with the tool defaults", () => {
  for (const mode of ["Flow from Cv", "Cv from flow"]) for (const fluid of ["Gas", "Liquid"]) {
    const out = tool.calculate({ ...base, mode, fluid });
    assert.ok(out.ok, `${mode} / ${fluid}`);
    assert.ok(out.headline.every((h) => typeof h.value === "string" || Number.isFinite(h.value)), `${mode} / ${fluid}`);
  }
});
