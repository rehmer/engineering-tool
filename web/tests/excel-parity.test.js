// Checks the web engine against numbers produced by the workbook itself in Excel.
// Regenerate the fixture with: python web/tools/excel_reference.py
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { convert } from "../engine/flow-converter.js";
import { setup, evaluate, solve } from "../engine/pipe-flow.js";
import { orifice } from "../engine/orifice.js";
import { relief } from "../engine/relief-valve.js";
import { cvFlow } from "../engine/cv-flow.js";
import { tempRise } from "../engine/temp-rise.js";
import { beam } from "../engine/beam.js";

const ref = JSON.parse(readFileSync(new URL("./fixtures/excel-reference.json", import.meta.url), "utf8"));

const REL = 1e-9; // Excel and JavaScript both use IEEE doubles; differences are rounding only

function close(actual, expected, label, scale) {
  // FALSE comes from nested IFs with no matching branch (e.g. the legacy viscosity column, C44,
  // has no correlation for methane or CO2); the engine shows that as NA.
  if (expected === null || expected === undefined || expected === false) {
    assert.ok(!Number.isFinite(actual), `${label}: Excel gives NA, engine gives ${actual}`);
    return;
  }
  if (typeof expected === "string") { assert.equal(actual, expected, label); return; }
  const tol = REL * Math.max(Math.abs(expected), scale ?? 0, 1e-300);
  assert.ok(Math.abs(actual - expected) <= tol, `${label}: engine ${actual}, Excel ${expected}, diff ${actual - expected}`);
}

const caseName = (i) => Object.entries(i).filter(([k]) => k !== "qty").map(([, v]) => v).join(" | ");

test("fixture covers both tools", () => {
  assert.ok(ref.converter.length >= 60, "converter cases");
  assert.ok(ref.pipe.length >= 80, "pipe cases");
  assert.ok(ref.pipeSolved.length >= 5, "Goal Seek cases");
  for (const k of ["orifice", "relief", "cv", "tempRise", "beam"]) assert.ok(ref[k]?.length >= 10, `${k} cases`);
});

for (const { inputs, excel } of ref.converter) {
  test(`converter: ${caseName(inputs)}`, () => {
    const r = convert(inputs);
    for (const key of ["nm3", "scfm", "acfm", "MW", "rhoIdeal", "rhoSel", "rhoUsed", "rhoRefSel", "rhoRefIdeal"]) {
      close(r[key], excel[key], key);
    }
  });
}

for (const { inputs, excel } of ref.pipe) {
  test(`pipe at fixed flow: ${caseName(inputs)}`, () => {
    const S = setup(inputs);
    const e = evaluate(inputs, S, inputs.mdot);
    const acfm = inputs.mdot / (S.pr.rho * 0.062428) / 60;
    const got = {
      c: e.c, P2choked: e.P2choked, V: e.V, mach: e.mach, avail: e.avail, loss: e.loss, Re: e.Re, f: e.f,
      cEq25: e.cEq25, Y: e.Y, x: e.x, xch: e.xch, xu: e.xu, P2used: e.P2used, Kpipe: e.Kpipe, K: e.K, hL: e.hL,
      rhoIdeal: S.rhoIdealSheet, rho: S.pr.rho, muLegacy: S.muLegacy, mu: S.pr.mu, k: S.pr.k, sound: S.pr.sound,
      rho0: S.rho0, acfm, scfm: (acfm * S.pr.rho) / S.rho0,
    };
    for (const [key, value] of Object.entries(got)) {
      // pressures in psig can sit near zero, so compare them on the absolute-pressure scale
      const scale = key.startsWith("P2") ? inputs.pin + inputs.atm : undefined;
      close(value, excel[key], key, scale);
    }
    close(e.resid, excel.resid, "resid", Math.max(Math.abs(excel.avail), Math.abs(excel.loss)));
  });
}

// ---- sheets added in engine 0.2.0 -------------------------------------------------
const title = (s) => String(s).toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
const PSI = 6894.757293168;

for (const { inputs, excel } of ref.orifice || []) {
  test(`orifice: ${caseName(inputs)}`, () => {
    const r = orifice({ ...inputs, gas: title(inputs.gas) });
    assert.equal(r.check, excel.check, "input check");
    if (excel.regime !== undefined && excel.regime !== null) assert.equal(r.regime, excel.regime, "regime");
    const got = { rc: r.rc, PcritPsia: r.Pcrit / PSI, PusedPsia: r.Pused / PSI, rho: r.rho, mdot: r.mdot, k: r.k, rhoIdeal: r.rhoIdeal,
      m1: r.m1, rePerCd: r.rePerCd, cdWu: r.cdWu, cdUsed: r.cdUsed, ReFlow: r.ReFlow, cdAtRe: r.cdAtRe, mu: r.mu };
    for (const [k, v] of Object.entries(got)) close(v, excel[k] === "" ? null : excel[k], k);
  });
}

for (const { inputs, excel } of ref.relief || []) {
  test(`relief valve: ${caseName(inputs)}`, () => {
    const r = relief({ ...inputs, gas: title(inputs.gas) });
    assert.equal(r.inputsOK ? "OK" : "CHECK INPUTS", excel.check, "input check");
    if (!r.inputsOK) return;
    assert.equal(r.regime, excel.regime ?? "—", "regime");
    const got = { r: r.r, rc: r.rc, PcritPsia: r.Pcrit / 6.894757293168, areaIn2: r.areaIn2, C: r.C, Z: r.Z, W: r.W, k: r.k, Zcalc: r.Zcalc };
    for (const [k, v] of Object.entries(got)) close(v, excel[k] === "" ? null : excel[k], k);
    if (typeof excel.F2 === "number") close(r.F2, excel.F2, "F2"); else assert.ok(!Number.isFinite(r.F2), "F2 not used when sonic");
  });
}

for (const { inputs, excel } of ref.cv || []) {
  test(`Cv: ${caseName(inputs)}`, () => {
    const r = cvFlow({ ...inputs, gas: title(inputs.gas) });
    assert.equal(r.inputsOK ? "OK" : "CHECK INPUTS", excel.check, "input check");
    if (!r.inputsOK) return;
    assert.equal(r.regime, excel.regime, "regime");
    const got = { scfm: r.scfm, slpm: r.slpm, nm3h: r.nm3h, acfm: r.acfm, mdot: r.mdot, SG: r.SG, rhoStd: r.rhoStd, rhoUp: r.rhoUp, rhoRef: r.rhoRef };
    for (const [k, v] of Object.entries(got)) close(v, excel[k] === "" ? null : excel[k], k);
  });
}

for (const { inputs, excel } of ref.tempRise || []) {
  test(`gas temp rise: ${caseName(inputs)}`, () => {
    const r = tempRise({ ...inputs, gas: title(inputs.gas) });
    assert.equal(r.status, excel.status, "status");
    if (!r.complete) return;
    const got = { Tout: r.Tout, Pout: r.Pout, lbhr: (r.mdot * 3600) / 0.45359237, mdot: r.mdot, heat: r.heatBtuh, hMean: r.hMean,
      UA: r.UAworkbook, maxMach: r.maxMach, Vin: r.Vin, Vout: r.Vout, residence: r.residence };
    // the march repeats Newton steps and sums 50 segments, so allow a little more rounding than a closed form
    for (const [k, v] of Object.entries(got)) {
      const scale = k === "Pout" ? inputs.pin + inputs.patm : k === "Tout" ? 460 : undefined;
      const e = excel[k];
      assert.ok(Math.abs(v - e) <= 1e-8 * Math.max(Math.abs(e), scale ?? 0, 1e-300), `${k}: engine ${v}, Excel ${e}`);
    }
  });
}

for (const { inputs, excel } of ref.beam || []) {
  test(`Roark beam: ${caseName(inputs)}`, () => {
    const r = beam(inputs);
    assert.equal(r.sec.check, excel.secCheck, "section check");
    if (excel.secCheck !== "OK") return; // the sheet leaves I blank and its beam cells error out
    assert.equal(r.check, excel.check, "case check");
    if (r.check !== "OK") return;
    const M = Math.max(Math.abs(excel.Mmax), Math.abs(excel.Mmin), 1);
    const Y = Math.max(Math.abs(excel.yAbs), 1e-12), V = Math.max(excel.vAbs, 1);
    const TH = Math.max(Math.abs(excel.ta), Math.abs(excel.tb), Math.abs(excel.th), Y / inputs.l);
    const got = {
      Ra: [r.Ra, V], Rb: [r.Rb, V], Ma: [r.Ma, M], Mb: [r.Mb, M], ta: [r.ta, TH], tb: [r.tb, TH], ya: [r.ya, Y], V: [r.here.V, V], M: [r.here.M, M],
      th: [r.here.th, TH], y: [r.here.y, Y], Mmax: [r.Mmax.value, M], Mmin: [r.Mmin.value, M], ymax: [r.ymax.value, Y], ymin: [r.ymin.value, Y],
      yAbs: [r.yAbs.value, Y], vAbs: [r.vAbs.value, V], I: [r.sec.I], c: [r.sec.c], S: [r.sec.S], Mabs: [r.Mabs, M], stress: [r.stress], fos: [r.fos],
      MmaxX: [r.Mmax.x, inputs.l], MminX: [r.Mmin.x, inputs.l], yAbsX: [r.yAbs.x, inputs.l], vAbsX: [r.vAbs.x, inputs.l], stressAt: [r.stressAt, inputs.l],
    };
    // where a response is zero to rounding (e.g. a load at a fixed end) its location is arbitrary
    if (Math.abs(excel.yAbs) < 1e-12 * inputs.l) delete got.yAbsX;
    // equal-magnitude extremes (e.g. +W/2 and −W/2 shear, equal end moments) have no single location;
    // the sheet's INDEX/MATCH then picks one by the last rounding digit
    const tie = (u, w) => Math.abs(Math.abs(u) - Math.abs(w)) <= 1e-9 * Math.max(Math.abs(u), Math.abs(w), 1e-300);
    const multi = (key, val) => r.profile.filter((p) => tie(p[key], val) && Math.sign(p[key]) === Math.sign(val)).length > 1;
    if (tie(r.Vmax?.value ?? Math.max(...r.profile.map((p) => p.V)), Math.min(...r.profile.map((p) => p.V))) || multi("V", r.vAbs.value * Math.sign(excel.vAbs || 1))) delete got.vAbsX;
    if (tie(r.ymax.value, r.ymin.value) || multi("y", r.ymin.value) || multi("y", r.ymax.value)) delete got.yAbsX;
    if (tie(r.Mmax.value, r.Mmin.value)) delete got.stressAt;
    if (multi("M", r.Mmax.value)) delete got.MmaxX;
    if (multi("M", r.Mmin.value)) delete got.MminX;
    for (const [k, [v, scale]] of Object.entries(got)) close(v, excel[k] === "" ? null : excel[k], k, scale);
  });
}

for (const { inputs, excel } of ref.pipeSolved) {
  test(`pipe solver vs Excel Goal Seek: ${caseName(inputs)}`, () => {
    const S = setup(inputs);
    const r = solve(inputs, S);
    assert.ok(r, "engine finds a solution");
    // Goal Seek stops at a loose tolerance, so compare flow to 0.1 % and confirm the engine residual is ~0.
    const rel = Math.abs(r.mdot - excel.mdot) / excel.mdot;
    assert.ok(rel < 1e-3, `engine ${r.mdot} lbm/hr, Goal Seek ${excel.mdot} lbm/hr (${(rel * 100).toFixed(4)} %)`);
    assert.ok(Math.abs(r.resid) <= 1e-9 * Math.max(r.avail, 1), `engine residual ${r.resid}`);
  });
}
