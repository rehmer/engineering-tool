// Selectable input units: conversions to each tool's base (US) unit and back.
import { test } from "node:test";
import assert from "node:assert/strict";
import { TOOLS } from "../engine/index.js";
import { dimOf, unitsOf, toBase, fromBase, unitsFor } from "../app/units.js";

const f = (unit) => ({ type: "number", unit });
const close = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} vs ${b}`);

test("known conversions to base units", () => {
  close(toBase(f("psig"), "bar(g)", 1), 14.503773773);
  close(toBase(f("psia"), "kPa(a)", 101.325), 14.695948775513449);
  close(toBase(f("psia"), "atm", 1), 14.695948775513449);
  close(toBase(f("°F"), "°C", 100), 212);
  close(toBase(f("°F"), "K", 273.15), 32);
  close(toBase(f("°F"), "°R", 459.67), 0);
  close(toBase(f("in"), "mm", 25.4), 1);
  close(toBase(f("ft"), "m", 0.3048), 1);
  close(toBase(f("in²"), "mm²", 645.16), 1);
  close(toBase(f("lbf"), "N", 4.4482216152605), 1);
  close(toBase(f("psi"), "MPa", 6.894757293168), 1000);
  close(toBase(f("Btu/(hr·ft·°F)"), "W/(m·K)", 1), 0.5778);
});

test("every unit round-trips", () => {
  for (const t of TOOLS) for (const fld of t.fields) {
    if (!dimOf(fld)) continue;
    for (const u of unitsOf(fld)) close(toBase(fld, u, fromBase(fld, u, 123.456)), 123.456, 1e-8);
  }
});

test("every tool's dimensional inputs get US defaults and SI choices", () => {
  let n = 0;
  for (const t of TOOLS) {
    const us = unitsFor(t, "US"), si = unitsFor(t, "SI");
    for (const fld of t.fields) {
      if (!dimOf(fld)) continue;
      n++;
      assert.equal(us[fld.key], fld.unit, `${t.id}.${fld.key}`);
      assert.notEqual(si[fld.key], fld.unit, `${t.id}.${fld.key} SI`);
    }
  }
  assert.ok(n > 50, `${n} convertible fields`);
});

test("saved unit choices override the system default; unknown ones are ignored", () => {
  const t = TOOLS.find((x) => x.id === "orifice");
  assert.equal(unitsFor(t, "US", { pu: "bar(g)" }).pu, "bar(g)");
  assert.equal(unitsFor(t, "US", { pu: "furlongs" }).pu, "psig");
});
