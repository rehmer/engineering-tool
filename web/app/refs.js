// Links for method references. Each tool lists its references as plain citations; this map adds
// a link (DOI where one exists, otherwise the publisher or standards body) when rendering.
import { esc } from "./format.js";

const LINKS = [
  [/Peng, D\.-Y\./, "https://doi.org/10.1021/i160057a011"],
  [/Huang, J\. \(2018\)/, "https://doi.org/10.1175/JAMC-D-17-0334.1"],
  [/Kirkland, W\. M\./, "https://doi.org/10.1115/1.4043717"],
  [/Pressure Drop in Pipe Fittings and Valves/i, "https://www.katmarsoftware.com/articles/pipe-fitting-pressure-drop.htm"],
  [/Swamee, P\. K\./, "https://doi.org/10.1061/JYCEAJ.0004542"],
  [/Incropera/, "https://www.wiley.com/en-us/Fundamentals+of+Heat+and+Mass+Transfer%2C+8th+Edition-p-9781119353881"],
  [/Yellow Book/, "https://repository.tno.nl/islandora/object/uuid%3A4928209c-5998-4261-9393-3d55073e6e87"],
  [/Wu, D\., Burton/, "https://doi.org/10.1080/14399776.2002.10781143"],
  [/API Standard 520/, "https://www.api.org/products-and-services/standards/important-standards-announcements/520parti"],
  [/API Standard 526/, "https://standards.globalspec.com/std/202857/api-std-526"],
  [/ANSI\/ISA-75\.01\.01/, "https://webstore.ansi.org/standards/isa/ansiisa75012012"],
  [/Roark's Formulas/, "https://www.mheducation.com/highered/product/roark-s-formulas-stress-strain-young-budynas/9781260453751.html"],
  [/CoolProp/, "https://doi.org/10.1021/ie4033999"],
];

/** Link for a reference citation, or null when there is no reliable one. */
export const refURL = (text) => LINKS.find(([re]) => re.test(text))?.[1] || null;

/** Citation as HTML: a link when one is known. `style` is for the inline-styled calc record. */
export function refHTML(text, style = "") {
  const url = refURL(text);
  return url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer"${style ? ` style="${style}"` : ""}>${esc(text)}</a>` : esc(text);
}
