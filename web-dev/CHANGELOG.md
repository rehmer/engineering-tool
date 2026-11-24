# Changelog

## Site layout (2026-11-23)

- The published folder `web/` now holds only the site. Tests, tools, notes and `package.json` moved to `web-dev/`, and code comments in `web/` no longer carry spreadsheet cell references. No result changes.

## Engine 0.4.0 (2026-11-23)

- Input units: a US / SI switch in the top bar sets every input, and each input has its own unit list (pressure gauge and absolute, stress, temperature, length, area, force, line load, conductivity). The tools still calculate in their US base units, so results are unchanged. Saved cases keep their units.
- Cv Valve Flow 2.0.0: calculate flow from Cv or Cv from flow, for a gas (ISA S75.01, unchanged) or a liquid (ANSI/ISA-75.01.01 with the choked-flow limit FL²(P₁ − FF·Pv), Fp = 1). Old cases open as gas, flow from Cv. Tested in `tests/cv-modes.test.js`.
- References are links (DOI, publisher or standards body) on each tool and in the calc record. The two pipe-flow references now cite Kirkland (2019) and Wilson (2012).
- The site no longer shows the engine version or the source spreadsheet; the top-bar "Free" label is gone. The guide states that page views are counted with cookieless Cloudflare Web Analytics.

## Engine 0.3.1 (2026-11-22)

- Method equations are written in LaTeX and drawn as typeset math in the Theory panel, the calc record, Print / Save PDF and Copy for Word. Pasted into Word they become native, editable Word equations. No result changes.
- Copy for Word: tables now fit the page width, and each equation label stays on the same page as its equation.

## Engine 0.3.0 (2026-11-22)

- Fixed Orifice Gas Flow 1.1.0: asks for standard conditions (default 14.696 psia and 60 °F) and reports standard volume flow in SCFM (headline), SCFH and std m³/hr, plus actual ACFM at the upstream state. Standard density uses the selected density method at the standard state. Mass flow and every workbook result are unchanged. Not in the workbook; tested in `tests/orifice-standard.test.js`.
- Orifice cases saved under 1.0.0 open with a version notice and the default standard conditions.

## Engine 0.2.0 (2026-11-21)

- Five more workbook sheets as tools, each checked against Excel:
  - Gas Temperature Rise in Pipe 1.0.0 (18 cases)
  - Fixed Orifice Gas Flow 1.0.0 (47 cases)
  - Relief Valve Gas Capacity 1.0.0 (67 cases)
  - Cv Gas Valve Flow 1.0.0 (42 cases)
  - Beam Response, Roark Table 8.1, 1.0.0 (27 cases)
- New Gas Property Lookup page for the shared property engine.
- The property engine now also returns enthalpy, thermal conductivity and the expansion coefficient. Existing results are unchanged.
- Temperature rise: UA is reported in Btu/(hr·°F). The workbook's G15 omits the K-to-°F factor and reads 1.8 times higher.
- Site: renamed Engineering Clarity, open access, feedback form on every page, Guide, limits & terms page.

## Gas Flow Rate Converter 1.1.0 (2026-11-21)

- **Known flow is**: the input can be mass flow, standard volume flow or actual volume flow. Volume inputs are turned into mass flow with the same densities, so mass-flow cases give the same results as 1.0.0.
- **Standard flow fluid equivalence**: converts a standard flow tested or rated with one gas to another gas through the same device. Three bases: isentropic nozzle (subcritical or choked), square-root SG rule, and same mass flow. Shows basis, equations and limitations. It can be included in the calc record. Not in the workbook; tested in `tests/equivalence.test.js`.
- Cases saved under 1.0.0 open with a version notice, because the tool version changed.

## Engine 0.1.0 (2026-11-21)

- Gas Flow Rate Converter 1.0.0 and Polytropic Gas Pipe Flow 1.0.0, ported from `workbook/engineering tool - no dl.xlsx`.
- Checked against Excel: 71 converter cases, 91 pipe cases and 5 Goal Seek solutions.
- The pipe tool adds:
  - a direct solver in place of Goal Seek
  - a comparison of all three flow models
  - the model selection guide (steps 1–8)
  - an outlet Mach estimate
- Fitting Le/D now follows the selected material. The workbook always uses Commercial Steel.
