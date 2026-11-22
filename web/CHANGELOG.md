# Changelog

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
