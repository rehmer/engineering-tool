// Tests for the v1.1 converter additions: volume-flow input and the fluid-equivalence calculator.
import { test } from "node:test";
import assert from "node:assert/strict";
import { run } from "../engine/index.js";
import { equivalence, equivalenceReport, psi } from "../engine/fluid-equivalence.js";
import { GAS, RU, props, fToK } from "../engine/properties.js";
import { buildRecord } from "../app/record.js";

const close = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} vs ${b}`);
const base = { from: "Air", to: "Nitrogen", q: 100, unit: "SCFM", p1: 100, p2: 0, pamb: 14.7, t: 70, ps: 14.7, ts: 70, method: "Ideal Gas", basis: "Restriction, isentropic nozzle" };
const MW = (g) => GAS[g.toUpperCase()][0];

test("same gas gives a ratio of 1 on every basis", () => {
  const e = equivalence({ ...base, to: "Air" });
  e.ratios.forEach((r) => close(r, 1));
});

test("square-root SG rule and same-mass ratios match the closed forms for ideal gases", () => {
  const e = equivalence({ ...base, to: "Helium" });
  close(e.ratios[1], Math.sqrt(MW("Air") / MW("Helium")));
  close(e.ratios[2], MW("Air") / MW("Helium"));
});

test("choked nozzle ratio matches (ψB/ψA)·√(MA/MB) computed independently", () => {
  const T = fToK(70), P = 114.7 * 6894.757293168;
  const k = (g) => { const c = props(g, T, P, "Ideal Gas").cp0; return c / (c - RU); };
  const crit = (kk) => Math.sqrt(kk) * Math.pow(2 / (kk + 1), (kk + 1) / (2 * (kk - 1)));
  const e = equivalence({ ...base, to: "Helium" });
  assert.ok(e.A.choked && e.B.choked);
  close(e.ratios[0], (crit(k("Helium")) / crit(k("Air"))) * Math.sqrt(MW("Air") / MW("Helium")));
});

test("air to nitrogen is close to the textbook 1.017", () => {
  const e = equivalence({ ...base, basis: "Restriction, square-root SG rule" });
  close(e.ratio, 1.0168, 1e-3);
});

test("nozzle tends to the square-root SG rule at small pressure drop", () => {
  const e = equivalence({ ...base, to: "Argon", p1: 10, p2: 9.9 });
  assert.ok(!e.A.choked && !e.B.choked);
  assert.ok(Math.abs(e.ratios[0] / e.ratios[1] - 1) < 2e-3, `${e.ratios[0]} vs ${e.ratios[1]}`);
});

test("ψ is continuous at the critical pressure ratio", () => {
  const k = 1.4, rc = Math.pow(2 / (k + 1), k / (k - 1));
  close(psi(k, rc + 1e-9).psi, psi(k, rc).psi, 1e-6);
});

test("report flags a regime split and a bad pressure set", () => {
  // between the critical ratios of helium (~0.487) and carbon dioxide (~0.546)
  const split = equivalenceReport({ ...base, from: "Helium", to: "Carbon Dioxide", p1: 14.7 / 0.52 - 14.7, p2: 0 });
  assert.ok(split.checks.some((c) => c.level === "warn" && /regime differs/.test(c.label)));
  assert.equal(equivalenceReport({ ...base, p2: 120 }).ok, false);
});

test("standard and actual volume inputs round-trip through mass flow", () => {
  const m = run("flow-converter", { fluid: "Nitrogen", method: "Peng-Robinson", m: 500, munit: "lbm/hr" }).result.raw;
  const fromS = run("flow-converter", { fluid: "Nitrogen", method: "Peng-Robinson", basis: "Standard volume flow", qs: m.scfm, qsunit: "SCFM" }).result.raw;
  const fromA = run("flow-converter", { fluid: "Nitrogen", method: "Peng-Robinson", basis: "Actual volume flow", qa: m.acfm * 60, qaunit: "ACFH" }).result.raw;
  close(fromS.mass.lbhr, 500); close(fromA.mass.lbhr, 500); close(fromA.scfm, m.scfm);
});

test("humid air volume input round-trips", () => {
  const i = { fluid: "Air", rh: 60, rhs: 0, t: 90 };
  const m = run("flow-converter", { ...i, m: 100 }).result.raw;
  close(run("flow-converter", { ...i, basis: "Standard volume flow", qs: m.scfm }).result.raw.mass.lbhr, 100);
});

test("water cannot take a standard volume input", () => {
  assert.equal(run("flow-converter", { fluid: "Water", basis: "Standard volume flow", qs: 10 }).result.ok, false);
  assert.ok(run("flow-converter", { fluid: "Water", basis: "Actual volume flow", qa: 10 }).result.ok);
});

test("calc record includes the equivalence only when asked", () => {
  const off = run("flow-converter", {});
  const recOff = buildRecord(off.tool, off.inputs, off.result, {});
  assert.ok(!recOff.inputs.some((r) => /Equivalence/.test(r[0])) && !recOff.results.some((r) => /Equivalence/.test(r[0])));
  assert.ok(!recOff.inputs.some((r) => r[0] === "Standard volume flow (at the reference below)"));
  const on = run("flow-converter", { eqRec: "Yes" });
  const recOn = buildRecord(on.tool, on.inputs, on.result, {});
  assert.ok(recOn.inputs.some((r) => r[0] === "Equivalence: tested fluid"));
  assert.ok(recOn.results.some((r) => /equivalent flow, Nitrogen/.test(r[0])));
  assert.ok(recOn.method.equations.some((e) => /Equivalence/.test(e)));
});
