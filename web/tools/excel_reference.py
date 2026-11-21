"""Generate engine test cases by running the workbook itself in desktop Excel.

For each case this script writes the inputs into a temporary copy of the workbook,
recalculates, reads the result cells, and saves everything to
web/tests/fixtures/excel-reference.json. The Node tests then check the web engine
against those numbers.

Run from the repository root (Windows, desktop Excel, pip install pywin32):
    python web/tools/excel_reference.py
The workbook itself is never modified.
"""
from pathlib import Path
import json, math, shutil, site, sys, tempfile, datetime

ROOT = Path(__file__).resolve().parents[2]
# pywin32 is required (pip install pywin32). PYWIN32_SITE can point at a folder it was installed into with --target.
import os  # noqa: E402
if os.environ.get("PYWIN32_SITE"):
    site.addsitedir(os.environ["PYWIN32_SITE"])
import win32com.client  # noqa: E402

WORKBOOK = ROOT / "workbook" / "engineering tool - no dl.xlsx"
OUT = ROOT / "web" / "tests" / "fixtures" / "excel-reference.json"


def clean(v):
    """Excel error values arrive as large negative ints; 'NA' strings mean not applicable."""
    if isinstance(v, bool):
        return v
    if isinstance(v, int) and v < -2_000_000_000:
        return None
    if isinstance(v, float) and not math.isfinite(v):
        return None
    if isinstance(v, str) and v.strip().upper() in ("NA", "#N/A"):
        return None
    return v


# ---------------------------------------------------------------- converter
CONV_IN = {"pg": "C6", "mlbhr": "C7", "t": "C8", "fluid": "C9", "method": "C10",
           "pamb": "C11", "ps": "C13", "ts": "C14", "rh": "C15", "rhs": "F15"}
CONV_OUT = {"nm3": "C23", "scfm": "C24", "acfm": "C25", "MW": "C28",
            "rhoIdeal": "C30", "rhoSel": "E30", "rhoUsed": "C32", "rhoRefSel": "C33", "rhoRefIdeal": "C34"}

conv_cases = []
GASES = ["Acetylene", "Air", "Ammonia", "Argon", "Butane", "Carbon Dioxide", "Helium", "Hydrogen", "Methane", "Nitrogen"]
for fluid in GASES + ["Water"]:
    for method in ["Ideal Gas", "Peng-Robinson"]:
        conv_cases.append(dict(fluid=fluid, method=method, pg=100, mlbhr=631.6, t=70, pamb=12.2, ps=14.7, ts=70, rh=0, rhs=0))
        conv_cases.append(dict(fluid=fluid, method=method, pg=800, mlbhr=5000, t=200, pamb=14.7, ps=14.696, ts=32, rh=0, rhs=0))
        conv_cases.append(dict(fluid=fluid, method=method, pg=5, mlbhr=12.5, t=0, pamb=14.7, ps=14.7, ts=60, rh=0, rhs=0))
for rh, rhs in [(0.5, 0), (0.8, 0.36), (1.0, 1.0)]:
    conv_cases.append(dict(fluid="Air", method="Ideal Gas", pg=0, mlbhr=100, t=95, pamb=14.7, ps=14.7, ts=60, rh=rh, rhs=rhs))
conv_cases.append(dict(fluid="Carbon Dioxide", method="Peng-Robinson", pg=900, mlbhr=100, t=60, pamb=14.7, ps=14.7, ts=60, rh=0, rhs=0))  # near saturation
conv_cases.append(dict(fluid="Nitrogen", method="Peng-Robinson", pg=1400, mlbhr=900, t=-10, pamb=14.7, ps=14.7, ts=60, rh=0, rhs=0))

# ---------------------------------------------------------------- pipe flow
PIPE_IN = {"pin": "C7", "pout": "C8", "mdot": "C9", "t": "C10", "fluid": "C11", "id": "C12", "method": "C13",
           "model": "C14", "eps": "C16", "len": "C17", "elev": "C18", "atm": "C19", "mat": "C20"}
QTY_CELLS = ["C72", "C73", "C74", "C75", "C76", "C77", "C78", "C79", "C80", "C81"]
PIPE_OUT = {"status": "C6", "c": "C15", "scfm": "C27", "acfm": "C28", "P2choked": "C31", "V": "C32", "mach": "C33",
            "avail": "C35", "loss": "C36", "resid": "C37", "rhoIdeal": "C43", "rho": "E43", "muLegacy": "C44", "mu": "E44",
            "Re": "C46", "k": "C49", "sound": "C53", "f": "C57", "cEq25": "C58", "Y": "C59", "x": "C60", "rho0": "C61",
            "xch": "C62", "xu": "C63", "P2used": "C65", "Kpipe": "H71", "K": "H82", "hL": "F82"}

BASE = dict(pin=25, pout=20, t=70, fluid="ARGON", id=2.065, method="Peng-Robinson", model="Polytropic (Eq. 25)",
            eps=0.0005, len=100, elev=0, atm=14.7, mat="Commercial Steel", qty=[0, 0, 50, 3, 0, 0, 0, 0, 0, 0])
MODELS = ["Polytropic (Eq. 25)", "Isothermal", "Isentropic"]
pipe_cases = []
for fluid in ["AIR", "NITROGEN", "ARGON", "HELIUM", "HYDROGEN", "METHANE", "CARBON DIOXIDE"]:
    for method in ["Ideal Gas", "Peng-Robinson"]:
        for model in MODELS:
            for mdot in [15, 2000]:
                pipe_cases.append(dict(BASE, fluid=fluid, method=method, model=model, mdot=mdot))
# choked, long line, elevation, fittings, entrance/exit, high pressure, small bore
pipe_cases += [
    dict(BASE, pin=150, pout=0, mdot=30000, len=20, qty=[0, 2, 0, 1, 0, 0, 0, 0, 1, 1]),
    dict(BASE, pin=150, pout=0, mdot=30000, len=20, qty=[0, 2, 0, 1, 0, 0, 0, 0, 1, 1], model="Isothermal"),
    dict(BASE, fluid="AIR", pin=100, pout=60, mdot=4000, len=2000, eps=0.0018, id=4.026, qty=[0, 0, 0, 0, 1, 1, 2, 4, 1, 1]),
    dict(BASE, fluid="NITROGEN", pin=60, pout=50, mdot=500, elev=150, qty=[1, 1, 1, 1, 1, 1, 1, 1, 1, 1]),
    dict(BASE, fluid="HYDROGEN", pin=1000, pout=900, mdot=800, t=150, id=0.957, len=300, qty=[0, 6, 0, 2, 1, 0, 0, 0, 1, 1]),
    dict(BASE, fluid="METHANE", pin=5, pout=2, mdot=40, t=40, id=1.049, len=50, atm=12.2),
    dict(BASE, fluid="HELIUM", pin=300, pout=250, mdot=100, t=300, id=0.5, len=10, qty=[0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
]
# Excel Goal Seek cases: the solved flow is compared with the engine's solver.
seek_cases = [
    dict(BASE, mdot=1000),
    dict(BASE, fluid="AIR", model="Isothermal", mdot=1000),
    dict(BASE, fluid="NITROGEN", pin=150, pout=0, len=20, qty=[0, 2, 0, 1, 0, 0, 0, 0, 1, 1], mdot=20000),
    dict(BASE, fluid="AIR", pin=100, pout=60, len=2000, eps=0.0018, id=4.026, qty=[0, 0, 0, 0, 1, 1, 2, 4, 1, 1], mdot=3000),
    dict(BASE, fluid="METHANE", method="Ideal Gas", model="Isentropic", pin=50, pout=30, len=500, mdot=2000),
]


# ---------------------------------------------------------------- fixed orifice
ORI_IN = {"gas": "C5", "pu": "C6", "pd": "C7", "pamb": "C8", "t": "C9", "d": "C10", "cd": "C11", "method": "C12", "cdMode": "K5", "re": "K6"}
ORI_OUT = {"check": "C15", "regime": "C16", "rc": "C19", "PcritPsia": "C20", "PusedPsia": "C21", "rho": "C36", "mdot": "C24", "k": "C33",
           "rhoIdeal": "C34", "m1": "K15", "rePerCd": "K16", "cdWu": "K17", "cdUsed": "K18", "ReFlow": "K19", "cdAtRe": "K8", "mu": "K14"}
ORI_BASE = dict(gas="HYDROGEN", pu=500, pd=50, pamb=11.7, t=70, d=0.25, cd=0.9, method="Peng-Robinson", cdMode="Manual", re=1000)
ori_cases = []
for gas in ["AIR", "NITROGEN", "ARGON", "HELIUM", "HYDROGEN", "METHANE", "CARBON DIOXIDE", "AMMONIA", "BUTANE", "ACETYLENE"]:
    for method in ["Ideal Gas", "Peng-Robinson"]:
        ori_cases.append(dict(ORI_BASE, gas=gas, method=method))                       # choked
        ori_cases.append(dict(ORI_BASE, gas=gas, method=method, pu=20, pd=25, t=150))  # subcritical
for cdMode, d, pu, pd, re in [("Wu gas estimate", 0.01, 30, 30, 50), ("Wu gas estimate", 0.004, 2, 14, 400), ("Wu gas estimate", 0.25, 500, 50, 2500),
                              ("Manual", 0.5, 5000, 50, 0), ("Manual", 1.0, 0, 11, 10)]:
    ori_cases.append(dict(ORI_BASE, gas="NITROGEN", cdMode=cdMode, d=d, pu=pu, pd=pd, re=re))
ori_cases.append(dict(ORI_BASE, pd=600))   # back pressure above upstream
ori_cases.append(dict(ORI_BASE, cd=1.2))   # invalid Cd

# ---------------------------------------------------------------- relief valve
REL_IN = {"gas": "C5", "pset": "C6", "pback": "C7", "pamb": "C8", "t": "C9", "size": "C10", "area": "C11", "kd": "C12", "kb": "C13",
          "kc": "C14", "zMethod": "C15", "zManual": "C16"}
REL_OUT = {"check": "C19", "regime": "C20", "r": "C23", "rc": "C24", "PcritPsia": "C25", "areaIn2": "C26", "C": "C27", "F2": "C28",
           "Z": "C42", "W": "C30", "k": "C39", "Zcalc": "C41"}
REL_BASE = dict(gas="ARGON", pset=9, pback=14.7, pamb=14.7, t=70, size="Custom", area=0.11, kd=0.975, kb=1, kc=1, zMethod="Peng-Robinson", zManual=1)
rel_cases = []
for gas in ["AIR", "NITROGEN", "ARGON", "HELIUM", "HYDROGEN", "METHANE", "CARBON DIOXIDE", "AMMONIA", "BUTANE", "ACETYLENE"]:
    for zm in ["Manual", "Ideal Gas", "Peng-Robinson"]:
        rel_cases.append(dict(REL_BASE, gas=gas, zMethod=zm))                                  # subcritical
        rel_cases.append(dict(REL_BASE, gas=gas, zMethod=zm, pset=250, t=300, size="J", kb=0.9, kc=0.9, zManual=0.95))  # critical
rel_cases += [dict(REL_BASE, size=s, pset=1200, t=150) for s in ["D", "G", "L", "P", "T"]]
rel_cases += [dict(REL_BASE, pback=30), dict(REL_BASE, kd=1.2)]

# ---------------------------------------------------------------- Cv
CV_IN = {"gas": "C5", "p1": "C6", "p2": "C7", "pamb": "C8", "t": "C9", "cv": "C10", "pref": "C11", "tref": "C12", "method": "C13"}
CV_OUT = {"check": "C16", "regime": "C17", "scfm": "C25", "slpm": "C26", "nm3h": "C27", "acfm": "C28", "mdot": "C29", "SG": "C38",
          "rhoStd": "C44", "rhoUp": "C47", "rhoRef": "C50"}
CV_BASE = dict(gas="ARGON", p1=15, p2=1, pamb=14.7, t=70, cv=0.73, pref=14.696, tref=32, method="Peng-Robinson")
cv_cases = []
for gas in ["AIR", "NITROGEN", "ARGON", "HELIUM", "HYDROGEN", "METHANE", "CARBON DIOXIDE", "AMMONIA", "BUTANE", "ACETYLENE"]:
    for method in ["Ideal Gas", "Peng-Robinson"]:
        cv_cases.append(dict(CV_BASE, gas=gas, method=method))
        cv_cases.append(dict(CV_BASE, gas=gas, method=method, p1=400, p2=50, t=200, cv=4.5, tref=68))
cv_cases += [dict(CV_BASE, p2=20), dict(CV_BASE, cv=0)]

# ---------------------------------------------------------------- gas temp rise
TR_IN = {"gas": "C6", "flow": "C7", "unit": "D7", "tin": "C8", "pin": "C9", "patm": "C10", "len": "C11", "id": "C12", "od": "C13",
         "rough": "C14", "boundary": "C15", "tb": "C16", "insul": "C17", "tins": "C18", "kpipe": "C19", "kins": "C20", "segments": "C21", "method": "C22"}
TR_OUT = {"status": "G6", "Tout": "G7", "Pout": "G9", "lbhr": "G11", "mdot": "G12", "heat": "G13", "hMean": "G14", "UA": "G15",
          "maxMach": "G16", "Vin": "G17", "Vout": "G18", "residence": "G19"}
TR_BASE = dict(gas="ARGON", flow=2, unit="SCFM", tin=5, pin=100, patm=14.7, len=100, id=2.067, od=2.375, rough=0.0018, boundary="Isothermal",
               tb=200, insul="Insulated", tins=1, kpipe=26, kins=0.025, segments=50, method="Peng-Robinson")
tr_cases = [TR_BASE]
for gas in ["AIR", "NITROGEN", "HELIUM", "HYDROGEN", "METHANE", "CARBON DIOXIDE"]:
    for method in ["Ideal Gas", "Peng-Robinson"]:
        tr_cases.append(dict(TR_BASE, gas=gas, method=method, flow=150, unit="lb/hr", tin=300, tb=40, insul="None", segments=25))
tr_cases += [
    dict(TR_BASE, flow=400, unit="SCFM", boundary="Adiabatic", segments=20),
    dict(TR_BASE, gas="NITROGEN", flow=60, unit="ACFM", tin=70, tb=250, insul="None", segments=40),     # turbulent heating
    dict(TR_BASE, gas="AIR", flow=900, unit="kg/hr", pin=50, len=300, id=1.049, od=1.315, segments=30), # transitional / turbulent
    dict(TR_BASE, gas="AIR", flow=15, unit="SCFM", pin=30, segments=5),
    dict(TR_BASE, gas="METHANE", method="Ideal Gas", flow=3000, unit="lb/hr", pin=200, id=1.049, od=1.315, len=500, boundary="Adiabatic", segments=50),  # high velocity
]

# ---------------------------------------------------------------- Roark beam
BEAM_IN = {"caseId": "C6", "l": "C8", "a": "C9", "x": "C10", "W": "C11", "wa": "C12", "wl": "C13", "E": "C14",
           "section": "G15", "d1": "G16", "d2": "G17", "d3": "G18", "d4": "G19", "allow": "G20"}
BEAM_OUT = {"check": "C16", "Ra": "C21", "Rb": "C22", "Ma": "C23", "Mb": "C24", "ta": "C25", "tb": "C26", "ya": "C27", "V": "C29", "M": "C30",
            "th": "C31", "y": "C32", "Mmax": "C35", "MmaxX": "F35", "Mmin": "C36", "MminX": "F36", "ymax": "C37", "ymin": "C38", "yAbs": "C39",
            "yAbsX": "F39", "vAbs": "C40", "vAbsX": "F40", "I": "G23", "c": "G22", "S": "G24", "Mabs": "G25", "stress": "G26", "stressAt": "G27",
            "fos": "G28", "secCheck": "G21"}
BEAM_BASE = dict(caseId="1e", l=120, a=60, x=60, W=1000, wa=10, wl=10, E=29000000, section="Solid Square Bar", d1=6.718272, d2=0.5, d3=0.25, d4=0.25, allow=36000)
beam_cases = []
for cid in ["1a", "1d", "1e", "2a", "2d", "2e"]:
    beam_cases.append(dict(BEAM_BASE, caseId=cid))
    beam_cases.append(dict(BEAM_BASE, caseId=cid, a=30, x=85, wa=4, wl=16))
    beam_cases.append(dict(BEAM_BASE, caseId=cid, a=0, x=0, l=96, wa=12, wl=12))
for sec, dims in [("Pipe / Round HSS", (6.625, 0.28, 0, 0)), ("Solid Round Bar (Rod)", (3, 0, 0, 0)), ("HSS Square Tube", (4, 0.25, 0, 0)),
                  ("Solid Rectangular Bar", (2, 6, 0, 0)), ("HSS Rectangular Tube", (4, 8, 0.375, 0)), ("Wide-Flange (W-Shape) / I-Beam", (12, 6.5, 0.4, 0.25)),
                  ("HSS Square Tube", (4, 2.5, 0, 0))]:
    beam_cases.append(dict(BEAM_BASE, caseId="2d", a=20, x=70, wa=5, wl=25, section=sec, d1=dims[0], d2=dims[1], d3=dims[2], d4=dims[3]))
beam_cases += [dict(BEAM_BASE, a=130), dict(BEAM_BASE, caseId="2a", a=120)]


def run_sheet(app, ws, cases, cell_in, cell_out):
    rows = []
    for case in cases:
        for k, cell in cell_in.items():
            ws.Range(cell).Value = case[k]
        app.Calculate()
        print(".", end="", flush=True)
        rows.append({"inputs": case, "excel": {k: clean(ws.Range(c).Value) for k, c in cell_out.items()}})
    return rows


def main():
    tmp = Path(tempfile.mkdtemp()) / "reference.xlsx"
    shutil.copy2(WORKBOOK, tmp)
    app = win32com.client.DispatchEx("Excel.Application")
    app.Visible = False
    app.DisplayAlerts = False
    try:
        wb = app.Workbooks.Open(str(tmp), UpdateLinks=0, ReadOnly=True)
        app.ScreenUpdating = False
        app.Calculation = -4135  # manual: recalculate once per case, not on every cell write
        app.Calculate()
        fc = wb.Worksheets("Flow rate converter")
        pp = wb.Worksheets("polytropic pipe flow")
        out = {"generated": datetime.datetime.now().isoformat(timespec="seconds"), "workbook": WORKBOOK.name,
               "excel": str(app.Version), "converter": [], "pipe": [], "pipeSolved": []}

        for case in conv_cases:
            for k, cell in CONV_IN.items():
                fc.Range(cell).Value = case[k]
            app.Calculate()
            print(".", end="", flush=True)
            out["converter"].append({"inputs": case, "excel": {k: clean(fc.Range(c).Value) for k, c in CONV_OUT.items()}})

        def set_pipe(case):
            for k, cell in PIPE_IN.items():
                pp.Range(cell).Value = case[k]
            for cell, q in zip(QTY_CELLS, case["qty"]):
                pp.Range(cell).Value = q

        for case in pipe_cases:
            set_pipe(case)
            app.Calculate()
            print(".", end="", flush=True)
            out["pipe"].append({"inputs": case, "excel": {k: clean(pp.Range(c).Value) for k, c in PIPE_OUT.items()}})

        for case in seek_cases:
            set_pipe(case)
            app.Calculate()
            pp.Range("C37").GoalSeek(0, pp.Range("C9"))
            app.Calculate()
            out["pipeSolved"].append({"inputs": case, "excel": {"mdot": pp.Range("C9").Value, "resid": pp.Range("C37").Value,
                                                                 "loss": pp.Range("C36").Value}})
        out["orifice"] = run_sheet(app, wb.Worksheets("Fixed Orifice Calculator"), ori_cases, ORI_IN, ORI_OUT)
        out["relief"] = run_sheet(app, wb.Worksheets("Relief Valve Calculator"), rel_cases, REL_IN, REL_OUT)
        out["cv"] = run_sheet(app, wb.Worksheets("Cv flow rate calculator"), cv_cases, CV_IN, CV_OUT)
        out["tempRise"] = run_sheet(app, wb.Worksheets("Gas Temp Rise in Pipe"), tr_cases, TR_IN, TR_OUT)
        out["beam"] = run_sheet(app, wb.Worksheets("Roark Beam Table 8.1"), beam_cases, BEAM_IN, BEAM_OUT)
        wb.Close(SaveChanges=False)
    finally:
        app.Quit()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, indent=1), encoding="utf-8")
    print("\n" + ", ".join(f"{len(v)} {k}" for k, v in out.items() if isinstance(v, list)) + f" -> {OUT}")


if __name__ == "__main__":
    sys.exit(main())
