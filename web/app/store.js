// Projects and saved cases.
// Phase 1 keeps them in this browser (localStorage) with export/import to a JSON file,
// so nothing leaves your machine. Phase 4 replaces this module with cloud storage
// behind the same functions.

const KEY = "flowline.v1";
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

function blank() {
  const p = { id: uid(), name: "My calculations", number: "", client: "", created: new Date().toISOString(), cases: [] };
  return { version: 1, user: { name: "", checker: "" }, projects: [p], currentProject: p.id };
}

let memory = null; // used when localStorage is blocked

function load() {
  try {
    const s = localStorage.getItem(KEY);
    if (s) return JSON.parse(s);
  } catch { /* fall through */ }
  return memory || (memory = blank());
}

function save(db) {
  memory = db;
  try { localStorage.setItem(KEY, JSON.stringify(db)); return true; } catch { return false; }
}

export const store = {
  db: load(),
  persisted() { try { return !!localStorage.getItem(KEY); } catch { return false; } },
  commit() { return save(this.db); },

  get user() { return this.db.user; },
  setUser(u) { Object.assign(this.db.user, u); this.commit(); },

  get projects() { return this.db.projects; },
  get project() { return this.db.projects.find((p) => p.id === this.db.currentProject) || this.db.projects[0]; },
  selectProject(id) { this.db.currentProject = id; this.commit(); },
  addProject(fields) {
    const p = { id: uid(), name: fields.name || "Untitled project", number: fields.number || "", client: fields.client || "", created: new Date().toISOString(), cases: [] };
    this.db.projects.push(p); this.db.currentProject = p.id; this.commit(); return p;
  },
  updateProject(fields) { Object.assign(this.project, fields); this.commit(); },
  deleteProject(id) {
    this.db.projects = this.db.projects.filter((p) => p.id !== id);
    if (!this.db.projects.length) this.db.projects.push(blank().projects[0]);
    this.db.currentProject = this.db.projects[0].id; this.commit();
  },

  findCase(id) { for (const p of this.db.projects) { const c = p.cases.find((x) => x.id === id); if (c) return { project: p, c }; } return null; },
  saveCase(c) {
    const p = this.project, now = new Date().toISOString();
    const existing = c.id && p.cases.find((x) => x.id === c.id);
    if (existing) Object.assign(existing, c, { updated: now });
    else { c.id = uid(); c.created = now; c.updated = now; p.cases.push(c); }
    this.commit(); return existing || c;
  },
  deleteCase(id) { for (const p of this.db.projects) p.cases = p.cases.filter((x) => x.id !== id); this.commit(); },

  /** Whole database as a downloadable backup. */
  exportJSON() { return JSON.stringify({ app: "flowline-calc", exported: new Date().toISOString(), ...this.db }, null, 1); },
  /** Merge projects from a backup file; projects with the same id are replaced. */
  importJSON(text) {
    const d = JSON.parse(text);
    if (!Array.isArray(d.projects)) throw new Error("Not a backup file from this site");
    for (const p of d.projects) {
      if (!p.id || !Array.isArray(p.cases)) continue;
      const i = this.db.projects.findIndex((x) => x.id === p.id);
      if (i >= 0) this.db.projects[i] = p; else this.db.projects.push(p);
    }
    this.commit(); return d.projects.length;
  },
};
