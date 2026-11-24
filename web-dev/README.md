# Engineering Clarity (web)

Web versions of the engineering workbook tools. Each tool has saved cases, checks, its theory and a calc record you can print to PDF, paste into Word or download as CSV.

Every calculator sheet in the workbook is a tool, plus a gas property lookup:

| Tool | Workbook sheet |
|---|---|
| Gas Flow Rate Converter (with standard-flow fluid equivalence) | Flow rate converter |
| Polytropic Gas Pipe Flow | polytropic pipe flow |
| Gas Temperature Rise in Pipe | Gas Temp Rise in Pipe |
| Fixed Orifice Gas Flow | Fixed Orifice Calculator |
| Relief Valve Gas Capacity | Relief Valve Calculator |
| Cv Gas Valve Flow | Cv flow rate calculator |
| Beam Response (Roark Table 8.1) | Roark Beam Table 8.1 |
| Gas Property Lookup | gas properties / Property calculations |

The site is open to everyone. Each page has a **Feedback** button (set the form endpoint in `app/config.js`) and links to the **Guide, limits & terms** page.

## Run it locally

Requires Node 18 or later. Nothing to install.

```
cd web-dev
npm run serve
```

Open http://localhost:8787. Projects and cases are saved in that browser. Use **Back up all projects** to keep a copy or move them to another machine.

## Test it

```
cd web-dev
npm test
```

There are 391 tests:

- **`tests/excel-parity.test.js`** checks the engine against numbers that desktop Excel calculated from the workbook:
  - 71 converter cases
  - 91 pipe cases at a fixed flow
  - 5 cases solved with Excel's Goal Seek
  - 18 temperature-rise, 47 orifice, 67 relief valve, 42 Cv and 27 beam cases

  Results must agree within 1 part in 10⁹. Goal Seek results must agree within 0.1 %, because Goal Seek stops at a loose tolerance.
- **`tests/equivalence.test.js`** checks the converter's volume-flow input and the fluid-equivalence calculator against closed-form results.
- **`tests/engine.test.js`** checks behaviour:
  - the solver converges
  - choked flow and the model ordering are correct
  - the selection guide branches correctly
  - invalid inputs are handled
  - fingerprints are stable

To regenerate the Excel cases after the workbook changes, run this on Windows with desktop Excel and `pip install pywin32`:

```
python web-dev/tools/excel_reference.py
```

The script works on a temporary copy, so the workbook is never modified. To add cases, edit the lists in that script.

## Layout

```
web/
  index.html            app shell
  app/                  browser-only code: views, saved cases, calc record, chart
  engine/               calculation engine (no browser APIs; runs in Node and the browser)
    properties.js       Peng-Robinson / ideal-gas property engine shared by all tools
    flow-converter.js   tool: 'Flow rate converter' sheet
    temp-rise.js        tool: 'Gas Temp Rise in Pipe' (segment march with energy balance)
    orifice.js          tool: 'Fixed Orifice Calculator'
    relief-valve.js     tool: 'Relief Valve Calculator' (API 520)
    cv-flow.js          tool: 'Cv flow rate calculator'
    beam.js             tool: 'Roark Beam Table 8.1'
    gas-properties.js   tool: property lookup page
    fluid-equivalence.js  standard flow equivalence between gases (converter panel)
    pipe-flow.js        tool: 'polytropic pipe flow' sheet, solver and model selection guide
    index.js            tool registry, input normalisation, case fingerprint
    version.js          engine version, used in case fingerprints
web-dev/                developer files, kept out of the published site
  tests/                Node tests and the Excel fixture
  tools/                local server and the Excel case generator
  README.md, CHANGELOG.md, DEPLOY.md, package.json
```

Cloudflare Pages publishes only `web/`, so nothing in `web-dev/` is served on the site. Keep spreadsheet cell references and other development notes out of comments in `web/`, since those files are public.

## Adding a tool (Phase 2)

1. Create `engine/<tool>.js`. It exports a tool object with:
   - `id`, `title`, `short`, `version` and `summary`
   - `groups` and `fields`, which build the input form automatically
   - `calculate(inputs)`, which returns `status`, `headline`, `results`, `tables`, `checks` and `raw`
   - `method`, which holds the basis, equations, assumptions and references

   Put the workbook cell references in comments.
2. Register the tool in `engine/index.js`.
3. Add the tool's input and output cells to `tools/excel_reference.py`, regenerate the fixture, and add parity tests.
4. Write up the tool's theory and model choice in `method` and, if the tool has a model choice, add a guide like `adviseModel` in `pipe-flow.js`.

## Versioning

Every calc record shows the tool version, the engine version and a fingerprint of the inputs. Saving a case stores those versions. If a later version changes the result, the tool shows a notice when you reopen the case. Record changes in `CHANGELOG.md`.

## Differences from the workbook

- **Fitting material basis.** In the workbook, cells E72:E79 always read the Commercial Steel Le/D column (P7:P14), so the material selector in C20 has no effect. The web tool uses the selected material. The Excel tests only use Commercial Steel.
- **Goal Seek.** The web tool solves the residual to zero on every change, so there is no Goal Seek step.
- **Added checks.** The web tool also reports:
  - an outlet Mach estimate
  - Z at both ends
  - a model comparison
  - the selection-guide recommendation

  The workbook does not have these.
- **Temperature rise UA.** The workbook's G15 converts W/K with 0.2930710702 only, so its "Btu/(hr·°F)" value is 1.8 times too high. The web tool divides by 1.8 as well. The tests compare the workbook value.
- **Orifice default.** The workbook's sample (hydrogen at 5,000 psig) is outside the property range, so the web tool opens at 500 psig.
- **Water on the pipe sheet.** The workbook breaks for WATER because C49 returns "NA". The web tool lists gases only.
