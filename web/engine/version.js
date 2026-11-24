// Engine version. Every calc record carries this number and each tool's own version,
// so a printed result can be traced back to the exact code that produced it.
// Bump the patch number for fixes that change no result, the minor number when any
// result can change, and record the change in web/CHANGELOG.md.
export const ENGINE_VERSION = "0.4.0";

// Workbook the engine is checked against (see web/tests/fixtures).
export const REFERENCE_WORKBOOK = "workbook/engineering tool - no dl.xlsx";
