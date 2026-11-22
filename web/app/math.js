// Small LaTeX-subset to MathML converter for the method equations.
// Browsers draw MathML natively (screen and Print / Save PDF), and Word turns pasted
// MathML into native Word equations, so one LaTeX source serves every output.
//
// Supported: groups {…}, ^ and _, \frac \dfrac \tfrac, \sqrt, \left…\right, \text, \mathrm,
// \dot \bar \hat \tilde, Greek letters, common operators and functions, spacing commands.

const GREEK = {
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ϵ", varepsilon: "ε", zeta: "ζ", eta: "η",
  theta: "θ", kappa: "κ", lambda: "λ", mu: "μ", nu: "ν", xi: "ξ", pi: "π", rho: "ρ", sigma: "σ",
  tau: "τ", phi: "ϕ", varphi: "φ", chi: "χ", psi: "ψ", omega: "ω",
  Gamma: "Γ", Delta: "Δ", Theta: "Θ", Lambda: "Λ", Xi: "Ξ", Pi: "Π", Sigma: "Σ", Phi: "Φ", Psi: "Ψ", Omega: "Ω",
  partial: "∂", infty: "∞", ell: "ℓ",
};
const OPS = {
  cdot: "·", times: "×", pm: "±", div: "÷", le: "≤", leq: "≤", ge: "≥", geq: "≥", ne: "≠", neq: "≠",
  approx: "≈", equiv: "≡", sim: "∼", propto: "∝", to: "→", rightarrow: "→", Rightarrow: "⇒", leftarrow: "←",
  sum: "∑", prod: "∏", int: "∫", iint: "∬", ldots: "…", cdots: "⋯", circ: "∘", mid: "∣",
  langle: "⟨", rangle: "⟩", lvert: "|", rvert: "|", lbrace: "{", rbrace: "}",
};
const LARGE = new Set(["∑", "∏", "∫", "∬"]);
const FUNCS = new Set(["ln", "log", "exp", "max", "min", "sin", "cos", "tan", "lim", "sinh", "cosh", "tanh"]);
const ACCENT = { dot: "˙", bar: "¯", hat: "^", tilde: "~" };
// Spacing is written as Unicode space characters, not <mspace>: Word drops <mspace> on paste.
const SPACE = { ",": "\u2009", ":": "\u205F", ";": "\u2004", " ": "\u2005", quad: "\u2003", qquad: "\u2003\u2003" };
const DELIM = { "(": "(", ")": ")", "[": "[", "]": "]", "|": "|", ".": "", "\\{": "{", "\\}": "}", "\\langle": "⟨", "\\rangle": "⟩", "\\lvert": "|", "\\rvert": "|", "\\|": "‖" };

/** Parse LaTeX into a small tree. Throws on syntax it does not support. */
export function parseTex(src) {
  let i = 0;
  const err = (m) => { throw new Error(`${m} at ${i} in: ${src}`); };
  const ws = () => { while (i < src.length && /\s/.test(src[i])) i++; };
  const cmdName = () => {
    const m = /^[A-Za-z]+/.exec(src.slice(i + 1));
    if (m) { i += 1 + m[0].length; return m[0]; }
    i += 2; return src[i - 1];
  };
  const braced = () => { // raw text inside {…}
    ws(); if (src[i] !== "{") err("Expected {");
    let depth = 0, s = "";
    for (i++; i < src.length; i++) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}") { if (!depth) { i++; return s; } depth--; }
      s += src[i];
    }
    err("Unclosed {");
  };
  const delim = () => {
    ws();
    if (src[i] === "\\") { const s = i; const n = cmdName(); const k = "\\" + n; if (!(k in DELIM)) { i = s; err("Bad delimiter"); } return DELIM[k]; }
    const c = src[i++]; if (!(c in DELIM)) err("Bad delimiter"); return DELIM[c];
  };
  const arg = () => { ws(); return src[i] === "{" ? (i++, row("}")) : atom(); };

  function row(stop) {
    const c = [];
    for (;;) {
      ws();
      if (i >= src.length) { if (stop === "}") err("Unclosed {"); break; }
      if (stop === "}" && src[i] === "}") { i++; break; }
      if (stop === "right" && src.startsWith("\\right", i) && !/[A-Za-z]/.test(src[i + 6] || "")) break;
      if (src[i] === "}") err("Unexpected }");
      const a = atom();
      if (a) c.push(scripts(a));
    }
    return { k: "row", c };
  }

  function scripts(base) {
    let sub = null, sup = null;
    for (;;) {
      ws();
      if (src[i] === "_" && !sub) { i++; sub = arg(); }
      else if (src[i] === "^" && !sup) { i++; sup = arg(); }
      else break;
    }
    return sub || sup ? { k: "script", base, sub, sup } : base;
  }

  function atom() {
    ws();
    const ch = src[i];
    if (ch === "{") { i++; return row("}"); }
    if (ch === "^" || ch === "_") return { k: "row", c: [] }; // empty base, e.g. {}^{\circ}
    if (ch === "\\") {
      const n = cmdName();
      if (n === "frac" || n === "dfrac" || n === "tfrac") { const num = arg(); return { k: "frac", num, den: arg() }; }
      if (n === "sqrt") { ws(); if (src[i] === "[") err("Root index not supported"); return { k: "sqrt", b: arg() }; }
      if (n === "left") { const open = delim(); const b = row("right"); if (!src.startsWith("\\right", i)) err("Missing \\right"); i += 6; return { k: "fence", open, close: delim(), b }; }
      if (n === "right") err("Unmatched \\right");
      if (n === "text") return { k: "text", v: braced() };
      if (n === "mathrm" || n === "operatorname") return { k: "ident", v: braced(), upright: true };
      if (n in ACCENT) return { k: "acc", ch: ACCENT[n], b: arg() };
      if (n in SPACE) return { k: "space", w: SPACE[n] };
      if (n === "!") return null;
      if (n === "{" || n === "}" || n === "|") return { k: "op", v: n === "|" ? "‖" : n };
      if (n in GREEK) return { k: "ident", v: GREEK[n], upright: /^[A-Z]/.test(n) };
      if (n in OPS) return { k: "op", v: OPS[n], large: LARGE.has(OPS[n]) };
      if (FUNCS.has(n)) return { k: "fn", v: n };
      err(`Unknown command \\${n}`);
    }
    const num = /^\d+(?:[.,]\d+)*/.exec(src.slice(i));
    if (num) { i += num[0].length; return { k: "num", v: num[0] }; }
    i++;
    if (/[A-Za-z]/.test(ch) || /\p{L}/u.test(ch)) {
      // keep combining marks with their letter (e.g. ṁ written as m + U+0307)
      let v = ch; while (i < src.length && /\p{M}/u.test(src[i])) v += src[i++];
      return { k: "ident", v };
    }
    if (ch === "-") return { k: "op", v: "−" };
    if (ch === "'") return { k: "op", v: "′" };
    if (ch === "~") return { k: "space", w: "\u00A0" };
    return { k: "op", v: ch };
  }

  const tree = row(null);
  return tree;
}

const x = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const FENCE_OPS = new Set(["(", ")", "[", "]", "|", "‖", "⟨", "⟩", "{", "}"]);

function ml(n) {
  switch (n.k) {
    case "row": return n.c.length === 1 ? ml(n.c[0]) : `<mrow>${n.c.map(ml).join("")}</mrow>`;
    case "num": return `<mn>${x(n.v)}</mn>`;
    case "ident": return n.upright || [...n.v].length > 1 && !/\p{M}/u.test(n.v) ? `<mi mathvariant="normal">${x(n.v)}</mi>` : `<mi>${x(n.v)}</mi>`;
    case "fn": return `<mi>${x(n.v)}</mi>`;
    case "text": return `<mtext>${x(n.v)}</mtext>`;
    case "op": return n.large ? `<mo largeop="true">${x(n.v)}</mo>` : FENCE_OPS.has(n.v) ? `<mo stretchy="false">${x(n.v)}</mo>` : `<mo>${x(n.v)}</mo>`;
    case "space": return `<mtext>${n.w}</mtext>`;
    case "frac": return `<mfrac>${ml(n.num)}${ml(n.den)}</mfrac>`;
    case "sqrt": return `<msqrt>${ml(n.b)}</msqrt>`;
    case "acc": return `<mover accent="true">${ml(n.b)}<mo>${x(n.ch)}</mo></mover>`;
    case "fence": return `<mrow>${n.open ? `<mo fence="true">${x(n.open)}</mo>` : ""}${ml(n.b)}${n.close ? `<mo fence="true">${x(n.close)}</mo>` : ""}</mrow>`;
    case "script": {
      const b = ml(n.base);
      if (n.sub && n.sup) return `<msubsup>${b}${ml(n.sub)}${ml(n.sup)}</msubsup>`;
      return n.sub ? `<msub>${b}${ml(n.sub)}</msub>` : `<msup>${b}${ml(n.sup)}</msup>`;
    }
  }
  throw new Error(`Unknown node ${n.k}`);
}

/** LaTeX to a MathML <math> element string. */
export function texToMathML(tex, { display = true } = {}) {
  return `<math xmlns="http://www.w3.org/1998/Math/MathML"${display ? ' display="block"' : ""}>${ml(parseTex(tex))}</math>`;
}

/** Normalise a method equation entry: strings are legacy plain text, objects carry { note, tex }. */
export const eqEntry = (e) => (typeof e === "string" ? { note: e } : e);

/** One method equation for the screen: optional note line, then the display equation. */
export function eqHTML(e) {
  const { note, tex } = eqEntry(e);
  return `<div class="eq">${note ? `<div class="eqnote">${x(note)}</div>` : ""}${tex ? texToMathML(tex) : ""}</div>`;
}
