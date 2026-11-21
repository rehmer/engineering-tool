// Gas property engine.
// Mirrors the workbook's 'gas properties' constants (M4:AF13) and the
// 'Property calculations' sheet: Peng-Robinson cubic, ideal-gas Cp0 polynomial,
// departure Cv/Cp, speed of sound, power-law viscosity and the validity screen.

export const RU = 8.314462618; // J/(mol·K), property engine value

// name: [MW g/mol, Tc K, Pc Pa, omega, Cp0 coefficients c0..c4 (J/mol·K, t = T/300), mu at 300 K (Pa·s), PR supported]
export const GAS = {
  "AIR":            [28.96546, 132.5306, 3786000, 0.0335, [28.96299107971955, 0.7333443095621944, -1.7587886539621411, 1.451100883789237, -0.28532264985518635], 1.853734050902612e-05, 1],
  "NITROGEN":       [28.01348, 126.19199999958556, 3395800.444647145, 0.0372, [28.290327311607825, 3.0958578229630573, -4.228545707467172, 2.369318032966908, -0.40087407207437936], 1.789009282215899e-05, 1],
  "ARGON":          [39.948, 150.68700000001058, 4863000.544876669, -0.00219, [20.786275000000185, -5.28182331654784e-13, 5.752314956827467e-13, -2.7162661378793686e-13, 4.6888818036510314e-14], 2.2740960263116123e-05, 1],
  "HELIUM":         [4.002602, 5.195300013635951, 228322.7892147868, -0.38353992538323034, [20.786149499999517, 1.4030642993618933e-12, -1.4737295791832601e-12, 6.735182213494724e-13, -1.141700127830898e-13], 1.9929719619187127e-05, 1],
  "HYDROGEN":       [2.0158799999999997, 33.1443326883113, 1296357.6060553084, -0.219, [15.33124009980296, 33.330932550829615, -30.053392321584447, 12.026425832404517, -1.791877588137369], 8.938468144405008e-06, 1],
  "ACETYLENE":      [26.0373, 308.3, 6138000, 0, [40.293164994923075, 0, 0, 0, 0], 1.04e-05, 0],
  "AMMONIA":        [17.03052, 405.55999997326353, 11363391.157414673, 0.2556905229865023, [38.89270731445558, -24.27653233211174, 32.479419999394395, -13.598786787476694, 2.099041963898244], 1.0160366730597356e-05, 1],
  "BUTANE":         [58.1222, 425.125000000008, 3796000.0174158094, 0.200810094644, [79.3959961667843, -92.88048165648131, 180.90735327044473, -80.91737727296434, 12.463390855224505], 7.451945307105133e-06, 1],
  "CARBON DIOXIDE": [44.0098, 304.1282000029807, 7377298.373446752, 0.22394, [19.030469247632833, 22.751377429834164, -4.359155765797787, -0.4180202526196479, 0.22390503624008495], 1.5003195772361616e-05, 1],
  "METHANE":        [16.0428, 190.56400265128698, 4599200.474282439, 0.01142, [49.088720999447034, -52.78515827851362, 56.8978132572002, -20.025222632886816, 2.599012582265611], 1.1255039218871347e-05, 1],
};

export const GAS_NAMES = Object.keys(GAS);
/** Gas choices shown in tool forms (title case); engines upper-case them for lookups. */
export const GAS_LIST = ["Acetylene", "Air", "Ammonia", "Argon", "Butane", "Carbon Dioxide", "Helium", "Hydrogen", "Methane", "Nitrogen"];
export const PA_PER_PSI = 6894.757293168;
export const KG_PER_LB = 0.45359237;
export const LB_PER_KG = 2.20462262185; // the workbook's lb/kg factor
export const MW_AIR = 28.96546;

// Thermal conductivity at 300 K (W/m·K), 'gas properties'!X4:X13; scaled by (T/300)^0.8.
export const LAMBDA300 = {
  "AIR": 0.026384465709828872, "NITROGEN": 0.02596867789066934, "ARGON": 0.0178374168116132,
  "HELIUM": 0.1559743213913112, "HYDROGEN": 0.18669902522580262, "ACETYLENE": 0.0214,
  "AMMONIA": 0.025101708204985872, "BUTANE": 0.01674723378854743, "CARBON DIOXIDE": 0.016774414469172178,
  "METHANE": 0.03439510053409794,
};
export const PROPERTY_METHODS = ["Ideal Gas", "Peng-Robinson"];
export const PROPERTY_LIMITS = { Tmin: 250, Tmax: 600, Pmin: 1000, Pmax: 1e7 }; // K, Pa abs

const cbrt = (x) => Math.sign(x) * Math.pow(Math.abs(x), 1 / 3);

/**
 * Gas properties at T (K) and P (Pa abs).
 * method: "Ideal Gas" or "Peng-Robinson".
 * Returns density kg/m³, cp/cv J/(kg·K), k, speed of sound m/s, viscosity Pa·s,
 * compressibility Z (always the PR root; the ideal method uses Z = 1 for density) and a validity flag.
 */
export function props(gas, T, P, method) {
  const g = GAS[String(gas).toUpperCase()];
  if (!g) throw new Error(`Unknown gas: ${gas}`);
  const [MW, Tc, Pc, w, c, mu300, pr] = g;
  const a0 = (0.45724 * RU * RU * Tc * Tc) / Pc;
  const m = 0.37464 + 1.54226 * w - 0.26992 * w * w;
  const b = (0.0778 * RU * Tc) / Pc;
  const s = 1 + m * (1 - Math.sqrt(T / Tc));
  const a = a0 * s * s;
  const dadT = (-a0 * m * s) / Math.sqrt(T * Tc);
  const d2a = (a0 * m * (1 + m)) / (2 * Math.sqrt(Tc) * Math.pow(T, 1.5));
  const A = (a * P) / (RU * RU * T * T);
  const B = (b * P) / (RU * T);
  // Z³ + c2·Z² + c1·Z + c0 = 0
  const c2 = B - 1, c1 = A - 3 * B * B - 2 * B, c0 = -A * B + B * B + B * B * B;
  const p = c1 - (c2 * c2) / 3;
  const q = (2 * c2 * c2 * c2) / 27 - (c2 * c1) / 3 + c0;
  const disc = (q * q) / 4 + (p * p * p) / 27;
  let Z;
  if (disc < 0) {
    // three real roots: take the largest (gas) root
    const th = Math.acos(Math.max(-1, Math.min(1, -q / (2 * Math.sqrt(-Math.pow(p / 3, 3))))));
    Z = 2 * Math.sqrt(-p / 3) * Math.cos(th / 3) - c2 / 3;
  } else {
    const sq = Math.sqrt(Math.max(0, disc));
    Z = cbrt(-q / 2 + sq) + cbrt(-q / 2 - sq) - c2 / 3;
  }
  const resid = Z * Z * Z + c2 * Z * Z + c1 * Z + c0;
  const v = (Z * RU * T) / P;
  const den = v * v + 2 * b * v - b * b;
  const dPdT = RU / (v - b) - dadT / den;
  const dPdv = (-RU * T) / ((v - b) * (v - b)) + (a * (2 * v + 2 * b)) / (den * den);
  const lg = Math.log((Z + (1 + Math.SQRT2) * B) / (Z + (1 - Math.SQRT2) * B));
  const t = T / 300;
  const cp0 = c[0] + c[1] * t + c[2] * t * t + c[3] * t ** 3 + c[4] * t ** 4;
  const Cv = cp0 - RU + ((T * d2a) / (2 * Math.SQRT2 * b)) * lg;
  const Cp = Cv - (T * dPdT * dPdT) / dPdv;
  const ideal = method === "Ideal Gas";
  const Zu = ideal ? 1 : Z;
  const rho = (P * MW) / (1000 * Zu * RU * T);
  const cpm = ((ideal ? cp0 : Cp) * 1000) / MW;
  const cvm = ((ideal ? cp0 - RU : Cv) * 1000) / MW;
  const sound = ideal
    ? Math.sqrt(((cpm / cvm) * RU * T * 1000) / MW)
    : Math.sqrt(-(v * v) * (1000 / MW) * (cpm / cvm) * dPdv);
  const mu = mu300 * Math.pow(T / 300, 0.7);
  const lambda = LAMBDA300[String(gas).toUpperCase()] * Math.pow(T / 300, 0.8);
  // ideal-gas enthalpy from 298.15 K (column AI) plus PR departure (AJ), J/kg
  const hint = (tt) => 300 * (c[0] * tt + (c[1] * tt * tt) / 2 + (c[2] * tt ** 3) / 3 + (c[3] * tt ** 4) / 4 + (c[4] * tt ** 5) / 5);
  const h0 = hint(t) - hint(298.15 / 300);
  const hdep = RU * T * (Z - 1) + ((T * dadT - a) / (2 * Math.SQRT2 * b)) * lg;
  const h = ((h0 + (ideal ? 0 : hdep)) * 1000) / MW;
  const beta = ideal ? 1 / T : -dPdT / (dPdv * v); // volumetric expansion coefficient, 1/K (AX)
  const L = PROPERTY_LIMITS;
  const nearSat = T < 1.05 * Tc && P > 0.5 * Pc * Math.exp(5.373 * (1 + w) * (1 - Tc / T));
  let valid = !(
    T < L.Tmin || T > L.Tmax || P < L.Pmin || P > L.Pmax ||
    (!ideal && pr === 0) || nearSat ||
    (!ideal && (Z <= B || Math.abs(resid) > 1e-8 || dPdv >= 0)) ||
    cpm <= 0 || cvm <= 0
  );
  if (!Number.isFinite(rho) || !Number.isFinite(sound)) valid = false;
  let status;
  if (valid) status = P > 1e6 ? "Gas estimate; transport approximate above 10 bar" : "Gas estimate; phase screen only";
  else if (!ideal && pr === 0) status = "PR unsupported: select Ideal Gas";
  else status = "Outside range / near phase boundary / invalid state";
  return { valid, status, MW, Z, rho, cp: cpm, cv: cvm, k: cpm / cvm, sound, mu, cp0, h, lambda, beta };
}

/** Saturation pressure of water (Pa) at t °C, Huang (2018). */
export function psatWater(tC) {
  return tC >= 0
    ? Math.exp(34.494 - 4924.99 / (tC + 237.1)) / Math.pow(tC + 105, 1.57)
    : Math.exp(43.494 - 6545.8 / (tC + 278)) / Math.pow(tC + 868, 2);
}

export const fToK = (f) => ((f - 32) * 5) / 9 + 273.15;
