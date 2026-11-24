// Standard volume flow output added to the Fixed Orifice tool in 1.1.0 (not in the workbook).
import { test } from "node:test";
import assert from "node:assert/strict";
import tool, { orifice } from "../../web/engine/orifice.js";

const base = { gas: "Air", method: "Ideal Gas", pu: 100, pd: 14.7, pamb: 14.7, t: 70, d: 0.25, cdMode: "Manual", cd: 0.61, re: 1000 };
const rel = (a, b) => Math.abs(a - b) / Math.abs(b);
const FT3 = 0.028316846592;

test("SCFM is mass flow divided by density at the standard state", () => {
  const r = orifice({ ...base, pstd: 14.696, tstd: 60 });
  assert.equal(r.check, "OK");
  assert.ok(rel((r.scfm / 60) * FT3 * r.rhoStd, r.mdot) < 1e-12);
  assert.ok(rel(r.scfh, r.scfm * 60) < 1e-12);
  assert.ok(rel(r.sm3h, (r.scfm / 60) * FT3 * 3600) < 1e-12);
});

test("air standard density at 14.696 psia and 60 °F is 1.2232 kg/m³ (0.07636 lb/ft³)", () => {
  const r = orifice({ ...base, pstd: 14.696, tstd: 60 });
  assert.ok(rel(r.rhoStd, 1.2232) < 5e-4, `got ${r.rhoStd}`);
});

test("ideal gas: SCFM scales with T_std / P_std", () => {
  const a = orifice({ ...base, pstd: 14.696, tstd: 60 });
  const b = orifice({ ...base, pstd: 14.73, tstd: 70 });
  const expect = a.scfm * ((70 + 459.67) / (60 + 459.67)) * (14.696 / 14.73);
  assert.ok(rel(b.scfm, expect) < 1e-12);
});

test("standard conditions do not change mass flow or any workbook result", () => {
  const a = orifice({ ...base, pstd: 14.696, tstd: 60 });
  const b = orifice({ ...base, pstd: 14.73, tstd: 32 });
  for (const k of ["mdot", "rho", "k", "rc", "Pcrit", "cdUsed", "m1"]) assert.equal(a[k], b[k], k);
});

test("old cases without standard inputs fall back to 14.696 psia and 60 °F", () => {
  const a = orifice(base);
  const b = orifice({ ...base, pstd: 14.696, tstd: 60 });
  assert.equal(a.scfm, b.scfm);
});

test("Peng-Robinson standard density is close to ideal for air", () => {
  const r = orifice({ ...base, method: "Peng-Robinson", pstd: 14.696, tstd: 60 });
  assert.ok(rel(r.rhoStd, r.rhoStdIdeal) < 0.002);
  assert.ok(Number.isFinite(r.scfm) && r.scfm > 0);
});

test("invalid standard conditions give a warning but keep mass flow", () => {
  const v = Object.fromEntries(tool.fields.map((f) => [f.key, f.default]));
  const out = tool.calculate({ ...v, pstd: 0 });
  assert.ok(out.ok);
  assert.ok(Number.isFinite(out.raw.mdot));
  assert.ok(!Number.isFinite(out.raw.scfm));
  assert.ok(out.checks.some((c) => c.label === "Standard flow not available"));
});

test("tool defaults ask for standard conditions and headline SCFM", () => {
  const keys = tool.fields.map((f) => f.key);
  assert.ok(keys.includes("pstd") && keys.includes("tstd"));
  const v = Object.fromEntries(tool.fields.map((f) => [f.key, f.default]));
  const out = tool.calculate(v);
  const h = out.headline.find((x) => x.label === "Standard flow");
  assert.ok(h && Number.isFinite(h.value) && h.value > 0);
  assert.match(h.unit, /14\.696 psia, 60 °F/);
});
