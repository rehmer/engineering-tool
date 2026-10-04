# Engineering Tool

Excel engineering workbook and its associated source documents.

## Workbooks

- [Download engineering tools.xlsx](workbook/engineering%20tools.xlsx) — self-contained version without VBA, DLLs, or live property lookups. Includes the high-pressure gas ranges, water flow in the Fixed Orifice and Cv calculators, and the reference-based Cd calculator.
- [Download engineering tools - property lookup.xlsm](workbook/engineering%20tools%20-%20property%20lookup.xlsm) — macro-enabled version with CoolProp/REFPROP property-library support.

Download the selected workbook using GitHub's **Download raw file** button and open it in Microsoft Excel desktop. Preserve its file extension. GitHub stores and versions the files; the workbooks run locally in Excel.

## Self-contained version

In **engineering tools.xlsx**, open **Guide & Setup** for operating limits and model assumptions. Gas calculations support 250–600 K, with air, nitrogen, argon and helium up to 7,000 psig, and hydrogen up to 10,000 psig. Other gases retain the 100 bar absolute ceiling. High-pressure properties and flow are engineering estimates; the workbook displays limitations and sampled reference comparisons.

The Fixed Orifice and Cv sheets also support liquid water from 33.8–194°F, up to 100 bar absolute. They flag flashing, cavitation limitations and missing device pressure-recovery factors. This version passed 200 calculation and boundary checks in desktop Excel. It needs no property-library setup.

## Property-lookup version: getting started

Open **Guide & Setup**, the first worksheet, for a tour of all eight calculators/data tabs, unit conventions, model assumptions, and troubleshooting.

**Gas Temp Rise in Pipe** now has a **Property method** dropdown in **C22**:

- **Calculated** uses ideal-gas relationships and documented reference transport properties. This mode works without CoolProp, REFPROP, or workbook macros.
- **CoolProp** uses local temperature and pressure to evaluate segment properties and enthalpy.
- **REFPROP** uses the REFPROP backend through CoolProp. It requires both libraries and a separate REFPROP installation.

Unavailable packages and unsupported fluids produce an explicit status and unavailable results on this tab; they do not silently switch methods.

## Property-lookup version: configure property libraries

Library controls support Windows desktop Excel. Libraries are not included in this repository.

1. On **Guide & Setup**, click **Browse CoolProp** or enter the full DLL path in **D7**. Use `CoolProp_x64.dll` for 64-bit Excel or `CoolProp_stdcall.dll` for 32-bit Excel.
2. If using REFPROP, click **Browse REFPROP** or enter its installation folder in **D8**. It must contain the matching REFPROP DLL, `FLUIDS`, and `MIXTURES`.
3. Enable this workbook's macros when appropriate, then click **Apply / test libraries**. Repeat Apply each time you open Excel. The connection status reports setup problems.
4. Use **D6** to choose the preferred package for the existing calculators' Property Package mode. The temperature-rise tab uses its own explicit C22 choice.

This workbook calls the CoolProp DLL directly; `CoolProp.xlam` is not required. The current saved workbook contains the author's local CoolProp 8.0.0 DLL path. Replace D7 with your own installation path before applying. If a loaded path changes, save and close all Excel windows before reopening and applying. Setup does not change system environment variables or Excel security settings.

The latest setup-status formula assumes the 64-bit DLL filename, although the underlying VBA still includes a 32-bit loader. A 32-bit installation may therefore show an incorrect filename warning in D10.

See the official [CoolProp Excel installation documentation](https://coolprop.org/coolprop/wrappers/Excel/index.html) and [REFPROP backend/path documentation](https://coolprop.org/coolprop/REFPROP.html). The standalone helper source is in [`vba/PropertySetup.bas`](vba/PropertySetup.bas); its procedures are already embedded in the workbook, so users should not import it again.

## Property-lookup version: validation and limits

The prior guide/property-selector update passed 37 checks in Windows 64-bit Excel, covering all ten calculated-mode gases, macro-disabled recalculation, live CoolProp properties, heating/cooling, segment refinement, adiabatic energy conservation at the tested flow, all four flow units, invalid paths, unsupported fluids, missing packages, save/reopen, and preservation of the temperature profile chart. The latest user-saved workbook was separately checked in Excel: its saved CoolProp 8.0.0 path loaded successfully, and both CoolProp and Calculated modes returned OK for its saved argon heating case.

Successful REFPROP calculations and 32-bit Excel have not been tested. The temperature model remains a segmented, horizontal, steady, single-phase approximation; the guide explains the low-pressure calculated correlations and the limits of the heat-transfer and pressure-loss model. Other calculators retain their existing equations and fallback behavior and have not undergone a full engineering audit.

## Reference documents

- [Polytropic approximation of compressible flow in pipes with friction](references/polytropic%20approximation%20of%20compressible%20flow%20in%20pipes%20with%20friction.pdf)
- [Hydown manual](references/Hydown%20manual.pdf)
- [Pressure drop in pipe fittings and valves: equivalent length and resistance coefficient](references/Pressure%20drop%20in%20pipe%20fittings%20and%20valves%20_%20equivalent%20length%20and%20resistance%20coefficient.pdf)

## Version history

The initial commit preserves the supplied workbook and PDFs without modification. The property-lookup workbook adds the guide, portable library setup, and the temperature-rise property selector. Source PDFs remain unchanged.

The latest user-saved update revises the DLL path and setup-status formula, adds future-session guidance, moves the guide's reference table with its dependent lookups, and saves new example inputs. Embedded VBA and the underlying engineering equations are unchanged from the preceding version.

The self-contained high-pressure/water version is named `workbook/engineering tools.xlsx`. The macro-enabled property-library version is named `workbook/engineering tools - property lookup.xlsm`. Both files were renamed without changing their contents.

Save changes in the appropriate workbook and commit with a description of the change. Excel workbooks and PDFs are binary files, so GitHub does not show ordinary line-by-line diffs for them.

## Rights

No open-source license has been assigned. Reference documents retain their respective owners' rights.
