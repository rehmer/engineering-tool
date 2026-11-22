// Method equations are written in LaTeX and rendered as MathML (screen, print and Word paste).
import { test } from "node:test";
import assert from "node:assert/strict";
import { TOOLS } from "../engine/index.js";
import { EQ_METHOD } from "../engine/fluid-equivalence.js";
import { parseTex, texToMathML } from "../app/math.js";

const methods = [...TOOLS.map((t) => [t.id, t.method]), ["fluid-equivalence", EQ_METHOD]];

/** Tag balance check: every opened MathML element is closed in order. */
function wellFormed(s) {
  const stack = [];
  for (const m of s.matchAll(/<(\/?)([a-z]+)[^>]*?(\/?)>/g)) {
    if (m[3]) continue;
    if (!m[1]) stack.push(m[2]);
    else if (stack.pop() !== m[2]) return false;
  }
  return stack.length === 0;
}

test("every tool equation is LaTeX that parses to well-formed MathML", () => {
  let n = 0;
  for (const [id, m] of methods) {
    assert.ok(m.equations.length > 0, id);
    for (const e of m.equations) {
      assert.equal(typeof e, "object", `${id}: equation should be { note, tex }`);
      assert.ok(e.tex, `${id}: missing tex`);
      const out = texToMathML(e.tex);
      assert.ok(wellFormed(out), `${id}: ${e.tex}`);
      assert.ok(!/<mi>\\/.test(out), `${id}: unparsed command in ${e.tex}`);
      n++;
    }
  }
  assert.ok(n >= 50, `only ${n} equations`);
});

test("fractions, roots, scripts and fences build the expected MathML", () => {
  assert.equal(texToMathML(String.raw`\frac{a}{b}`, { display: false }), '<math xmlns="http://www.w3.org/1998/Math/MathML"><mfrac><mi>a</mi><mi>b</mi></mfrac></math>');
  assert.match(texToMathML(String.raw`\sqrt{x}`), /<msqrt><mi>x<\/mi><\/msqrt>/);
  assert.match(texToMathML(String.raw`V_{\mathrm{next}}^2`), /<msubsup><mi>V<\/mi><mi mathvariant="normal">next<\/mi><mn>2<\/mn><\/msubsup>/);
  assert.match(texToMathML(String.raw`\left(\frac{2}{k+1}\right)`), /<mo fence="true">\(<\/mo>.*<mo fence="true">\)<\/mo>/);
  assert.match(texToMathML(String.raw`\dot m`), /<mover accent="true"><mi>m<\/mi><mo>˙<\/mo><\/mover>/);
  assert.match(texToMathML("a - b"), /<mo>−<\/mo>/);
  assert.match(texToMathML("6,894.757"), /<mn>6,894.757<\/mn>/);
});

test("unsupported or unbalanced LaTeX throws instead of rendering wrong", () => {
  assert.throws(() => parseTex(String.raw`\frac{a}{b`));
  assert.throws(() => parseTex(String.raw`\left( a`));
  assert.throws(() => parseTex(String.raw`\unknowncommand`));
  assert.throws(() => parseTex("a}"));
});
