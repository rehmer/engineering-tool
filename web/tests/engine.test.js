// Behaviour tests that don't depend on the Excel fixture.
import { test } from "node:test";
import assert from "node:assert/strict";
import { TOOLS, run, defaults, normalize, fingerprint, ENGINE_VERSION } from "../engine/index.js";
import { setup, solve, evaluate, flowCurve, MODELS } from "../engine/pipe-flow.js";
import { props } from "../engine/properties.js";

test("every tool has the fields the app and calc record rely on", () => {
  for (const t of TOOLS) {
    for (const k of ["id", "title", "version", "sheet", "summary", "fields", "groups", "calculate", "method"]) assert.ok(t[k], `${t.id}.${k}`);
    assert.match(t.version, /^\d+\.\d+\.\d+$/);
    const out = t.calculate(defaults(t));
    assert.ok(out.ok, `${t.id} defaults solve`);
    assert.ok(out.headline.length && out.results.length && out.checks.length);
  }
});

test("workbook sample: converter at saved inputs", () => {
  const r = run("flow-converter", {}).result.raw;
  assert.ok(Math.abs(r.nm3 - 173.10280530454276) < 1e-9);
  assert.ok(Math.abs(r.scfm - 101.8844002904357) < 1e-9);
  assert.ok(Math.abs(r.acfm - 13.348490947142645) < 1e-9);
});

test("workbook sample: pipe residual at the saved 15 lbm/hr guess", () => {
  const { inputs } = run("pipe-flow", { pout: 24.999481039502 });
  const e = evaluate(inputs, setup(inputs), 15);
  assert.ok(Math.abs(e.resid - 0.26875195739302526) < 1e-9);
  assert.ok(Math.abs(e.K - 38.78394223974194) < 1e-9);
});

test("solver drives the residual to zero and flow rises as outlet pressure falls", () => {
  const { inputs } = run("pipe-flow", {});
  const S = setup(inputs);
  let last = 0;
  for (const pout of [24, 20, 10, 0]) {
    const r = solve({ ...inputs, pout }, setup({ ...inputs, pout }));
    assert.ok(Math.abs(r.resid) < 1e-6 * r.avail, `residual at ${pout} psig`);
    assert.ok(r.mdot > last, `flow rises at ${pout} psig`);
    last = r.mdot;
  }
  assert.ok(flowCurve(inputs, S, 12).pts.length >= 10);
});

test("choked flow caps the pressure ratio and stops depending on outlet pressure", () => {
  const base = { pin: 150, len: 20, qty: [0, 2, 0, 1, 0, 0, 0, 0, 1, 1] };
  const a = run("pipe-flow", { ...base, pout: 0 }).result;
  const b = run("pipe-flow", { ...base, pout: -10 }).result;
  assert.equal(a.status.level, "bad");
  assert.match(a.status.text, /CHOKED/);
  assert.ok(Math.abs(a.raw.r.mdot - b.raw.r.mdot) / a.raw.r.mdot < 1e-9);
});

test("model ordering: isothermal ≤ polytropic ≤ isentropic flow", () => {
  const { result } = run("pipe-flow", { pin: 100, pout: 20, len: 30, qty: [0, 0, 2, 1, 0, 0, 0, 0, 1, 1] });
  const m = Object.fromEntries(MODELS.map((k) => [k, result.raw.sols[k].mdot]));
  assert.ok(m.Isothermal <= m["Polytropic (Eq. 25)"] && m["Polytropic (Eq. 25)"] <= m.Isentropic, JSON.stringify(m));
});

test("selection guide follows the flowchart", () => {
  const small = run("pipe-flow", { pout: 24 }).result.advice;
  assert.equal(small.recommended, "Polytropic (Eq. 25)");
  assert.equal(small.steps.find((s) => s.n === 4).a, "Yes");
  const big = { pin: 100, pout: 0, len: 10, qty: [0, 0, 0, 0, 0, 0, 0, 0, 1, 1] };
  assert.equal(run("pipe-flow", { ...big, thermal: "Long, bare or buried line (NTU ≳ 3)" }).result.advice.recommended, "Isothermal");
  assert.equal(run("pipe-flow", { ...big, purpose: "Guaranteed minimum flow or maximum ΔP" }).result.advice.recommended, "Isothermal");
  assert.equal(run("pipe-flow", { ...big, purpose: "Credible maximum flow" }).result.advice.recommended, "Polytropic (Eq. 25)");
});

test("invalid inputs give a clear failed status, not numbers", () => {
  assert.match(run("pipe-flow", { pin: 10, pout: 20 }).result.status.text, /Pin must exceed Pout/);
  assert.equal(run("pipe-flow", { t: 1000 }).result.ok, false);
  const r = run("flow-converter", { fluid: "Carbon Dioxide", method: "Peng-Robinson", pg: 900, t: 60 }).result;
  assert.equal(r.status.level, "bad");
  assert.ok(!Number.isFinite(r.raw.acfm)); // actual state is near saturation; reference state is fine
});

test("Peng-Robinson tends to ideal gas at low pressure", () => {
  const ig = props("NITROGEN", 300, 2000, "Ideal Gas"), pr = props("NITROGEN", 300, 2000, "Peng-Robinson");
  assert.ok(Math.abs(pr.rho / ig.rho - 1) < 1e-4 && Math.abs(pr.k / ig.k - 1) < 1e-4);
});

test("normalize keeps known keys, coerces numbers and rejects unknown options", () => {
  const t = TOOLS[1];
  const v = normalize(t, { pin: "30", fluid: "UNOBTAINIUM", junk: 1, qty: [1, "2", -3] });
  assert.equal(v.pin, 30);
  assert.equal(v.fluid, "ARGON");
  assert.ok(!("junk" in v));
  assert.deepEqual(v.qty.slice(0, 3), [1, 2, 0]);
});

test("fingerprint is stable, order-independent and changes with inputs", () => {
  const t = TOOLS[0];
  const a = fingerprint(t, { a: 1, b: 2 }), b = fingerprint(t, { b: 2, a: 1 });
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{16}$/);
  assert.notEqual(a, fingerprint(t, { a: 1, b: 3 }));
  assert.match(ENGINE_VERSION, /^\d+\.\d+\.\d+$/);
});
