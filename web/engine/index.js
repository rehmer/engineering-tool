// Engine entry point: the tool registry plus helpers shared by the web app,
// the calc record and the tests. No browser APIs are used here, so the same
// code runs in Node for testing and later on a server.
import { ENGINE_VERSION, REFERENCE_WORKBOOK } from "./version.js";
import flowConverter from "./flow-converter.js";
import pipeFlow from "./pipe-flow.js";
import tempRise from "./temp-rise.js";
import orifice from "./orifice.js";
import reliefValve from "./relief-valve.js";
import cvFlow from "./cv-flow.js";
import beam from "./beam.js";
import gasProperties from "./gas-properties.js";

export { ENGINE_VERSION, REFERENCE_WORKBOOK };

/** Tools in workbook sheet order, then the property lookup. */
export const TOOLS = [flowConverter, pipeFlow, tempRise, orifice, reliefValve, cvFlow, beam, gasProperties];
export const toolById = (id) => TOOLS.find((t) => t.id === id);

/** Default inputs for a tool. */
export function defaults(tool) {
  const v = {};
  for (const f of tool.fields) v[f.key] = Array.isArray(f.default) ? [...f.default] : f.default;
  return v;
}

/** Merge stored inputs over defaults, dropping unknown keys and coercing numbers. */
export function normalize(tool, inputs = {}) {
  const v = defaults(tool);
  for (const f of tool.fields) {
    if (!(f.key in inputs)) continue;
    const x = inputs[f.key];
    if (f.type === "number") v[f.key] = Number.isFinite(+x) ? +x : f.default;
    else if (f.type === "fittings") v[f.key] = f.default.map((d, j) => (Number.isFinite(+x?.[j]) ? Math.max(0, +x[j]) : d));
    else if (f.type === "select") v[f.key] = f.options.includes(x) ? x : f.default;
    else v[f.key] = x;
  }
  return v;
}

/** Run a tool on (possibly partial) inputs. */
export function run(toolOrId, inputs) {
  const tool = typeof toolOrId === "string" ? toolById(toolOrId) : toolOrId;
  if (!tool) throw new Error(`Unknown tool: ${toolOrId}`);
  const v = normalize(tool, inputs);
  return { tool, inputs: v, result: tool.calculate(v) };
}

/** Deterministic JSON (sorted keys) so the same case always gives the same fingerprint. */
export function stableStringify(x) {
  if (Array.isArray(x)) return "[" + x.map(stableStringify).join(",") + "]";
  if (x && typeof x === "object") return "{" + Object.keys(x).sort().map((k) => JSON.stringify(k) + ":" + stableStringify(x[k])).join(",") + "}";
  return JSON.stringify(x);
}

/** 64-bit FNV-1a hash of tool id, tool version, engine version and inputs, as 16 hex digits. */
export function fingerprint(tool, inputs) {
  const s = stableStringify({ tool: tool.id, tv: tool.version, ev: ENGINE_VERSION, inputs });
  let h = 0xcbf29ce484222325n;
  const P = 0x100000001b3n, M = (1n << 64n) - 1n;
  for (const ch of new TextEncoder().encode(s)) { h ^= BigInt(ch); h = (h * P) & M; }
  return h.toString(16).padStart(16, "0");
}
