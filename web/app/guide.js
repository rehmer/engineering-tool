// Guide page: what the site is, how to use it, model limits, terms of use and privacy.
import { esc } from "./format.js";
import { SITE_NAME } from "./config.js";

export function renderGuide(tools) {
  return `<section class="view guide">
    <div class="vhead"><div><h1>Guide, limits &amp; terms</h1>
      <p>${esc(SITE_NAME)} is a free set of engineering calculators. Each one shows its inputs, results, checks, the theory and limits behind it, and produces a calc record you can attach to a report.</p></div></div>

    <section class="panel"><header><h2>Calculators</h2></header><div class="body">
      <div class="tbl"><table><thead><tr><th>Tool</th><th>What it does</th></tr></thead><tbody>
      ${tools.map((t) => `<tr><td><a href="#/${t.id}">${esc(t.title)}</a></td><td>${esc(t.summary)}</td></tr>`).join("")}
      </tbody></table></div>
    </div></section>

    <div class="grid2">
      <section class="panel"><header><h2>How to use it</h2></header><div class="body prose">
        <ol>
          <li><b>Pick a tool</b> and change the inputs. Results update as you type.</li>
          <li><b>Pick US or SI</b> at the top of the page for all inputs, or change any single input's unit from its drop-down. Results list their own units.</li>
          <li><b>Read the checks.</b> Each tool flags inputs outside its valid range, choked flow, high Mach number and similar issues. A result is only as good as its assumptions.</li>
          <li><b>Open "Theory, basis and limits"</b> at the bottom of each tool for the equations, assumptions and references.</li>
          <li><b>Save a case</b> to keep it in a project. Projects and cases are stored in this browser only.</li>
          <li><b>Calc record</b> builds a one-page record with purpose, inputs, results, checks, method and sign-off fields. Print it to PDF, copy it into Word, or download a CSV.</li>
          <li><b>Back up all projects</b> regularly, and restore the file on another computer or browser to move your work.</li>
        </ol>
      </div></section>

      <section class="panel"><header><h2>Supported conditions</h2></header><div class="body prose">
        <ul>
          <li>Gas properties cover 250–600 K (−10 to 620 °F) and 0.01–100 bar absolute (0.145–1,450 psia). This is the implementation range, not a certified accuracy range.</li>
          <li>Below 1.05 times the critical temperature, a conservative screen rejects states near condensation. It is not a phase-equilibrium calculation.</li>
          <li>Single-phase gas only. Dense fluids, condensation, two-phase flow, cryogenic and near-critical states are outside the intended use.</li>
          <li>Air is treated as a pseudo-pure gas. Acetylene supports ideal gas only.</li>
          <li>Hydrogen, helium, polar gases and high pressures need particular care. Peng-Robinson is an engineering approximation, not a high-accuracy fluid database.</li>
          <li>Viscosity and conductivity use low-pressure correlations; pressure effects are ignored above 10 bar.</li>
          <li>The valve, orifice and pipe-flow equations keep their own flow and choking assumptions. Using real-gas properties does not make them general real-fluid solvers.</li>
        </ul>
      </div></section>
    </div>

    <div class="grid2">
      <section class="panel" id="terms"><header><h2>Terms of use</h2></header><div class="body prose">
        <ul>
          <li>The calculators are provided free and as is, without warranty of any kind, including fitness for a particular purpose.</li>
          <li>Results are engineering estimates. They must be reviewed and checked by a qualified engineer before they are used in design, construction, operation or any safety-related decision. You are responsible for how you use them.</li>
          <li>The site owner is not liable for any loss or damage arising from use of the calculators or reliance on their results.</li>
          <li>Equations follow the published references listed on each tool. Check the current edition of any code or standard that applies to your work.</li>
          <li>The calculators, their content and design may change without notice. Every calc record shows the tool version that produced it.</li>
        </ul>
      </div></section>

      <section class="panel"><header><h2>Privacy</h2></header><div class="body prose">
        <ul>
          <li>Calculations run in your browser. Inputs, projects and cases are not sent anywhere; they are saved in this browser's local storage.</li>
          <li>Clearing your browser data deletes saved projects. Use <b>Back up all projects</b> to keep a copy.</li>
          <li>The feedback form sends only what you type, plus, if you leave the box ticked, the current tool's inputs and result, the page address and your browser type. Your email is optional and is used only to reply.</li>
          <li>The site sets no cookies and has no advertising trackers. It counts page views with Cloudflare Web Analytics, which is cookieless and does not identify you. The hosting provider keeps standard request logs.</li>
        </ul>
        <p><button class="ibtn primary" type="button" id="guide-feedback">Report a bug or send feedback</button></p>
      </div></section>
    </div>
  </section>`;
}
