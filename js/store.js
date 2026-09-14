// Shared storage layer for the demo. Both admin.html and staff.html load
// this file and talk to the same IndexedDB database, so a project created
// on the admin side shows up on the staff side without any server.
//
// Schema:
//   projects:    { id (auto), client, brief, team: [staffName, ...], createdAt }
//   entries:     { id (auto), projectId, staff, day, desc, note, submitted, createdAt }
//   claims:      { id: "<projectId>::<staff>", projectId, staff, done }
//   submissions: { id (auto), projectId, staff, submittedAt, rows: [{day, desc, note}, ...] }
//
// "entries" with submitted:false are the current, still-editable draft for
// that staff member on that project. Hitting Submit snapshots them into a
// new "submissions" record (a frozen statement) and flips them to
// submitted:true so they drop out of the draft view.

const DB_NAME = 'uim-logbook-demo';
const DB_VERSION = 2;

// Fixed staff roster, per staffRoles_UiM.pdf. Not editable from this demo —
// only real HR change would add/remove people from this list.
// `passcode` is a placeholder stand-in for real auth — swap this whole
// lookup for a real backend check once wired to something server-side.
const STAFF = [
  { name: 'David',                skill: 'Video/Photo Production & Editing', passcode: '1111' },
  { name: 'Charity',              skill: 'Content Planning & Scheduling',    passcode: '2222' },
  { name: 'Ekong (IT)',           skill: 'SEO & Website Management',         passcode: '3333' },
  { name: 'Wilfred (Journalist)', skill: 'Blog Publication & Brand/PR',      passcode: '4444' },
];

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('projects')) {
        db.createObjectStore('projects', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('entries')) {
        const entries = db.createObjectStore('entries', { keyPath: 'id', autoIncrement: true });
        entries.createIndex('byProject', 'projectId');
      }
      if (!db.objectStoreNames.contains('claims')) {
        db.createObjectStore('claims', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('submissions')) {
        const submissions = db.createObjectStore('submissions', { keyPath: 'id', autoIncrement: true });
        submissions.createIndex('byProjectStaff', ['projectId', 'staff']);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

const Store = {
  STAFF,

  async addProject({ client, brief, team }) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const t = db.transaction('projects', 'readwrite');
      const req = t.objectStore('projects').add({ client, brief, team, createdAt: Date.now() });
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(req.error);
    });
  },

  async getAllProjects() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction('projects', 'readonly').objectStore('projects').getAll();
      req.onsuccess = () => resolve(req.result.sort((a, b) => b.createdAt - a.createdAt));
      req.onerror   = () => reject(req.error);
    });
  },

  async getProjectsForStaff(staffName) {
    const all = await this.getAllProjects();
    return all.filter(p => p.team.includes(staffName));
  },

  async addEntry({ projectId, staff, day, desc, note }) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const t = db.transaction('entries', 'readwrite');
      const req = t.objectStore('entries').add({ projectId, staff, day, desc, note, submitted: false, createdAt: Date.now() });
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(req.error);
    });
  },

  // staff omitted -> all entries for the project (used by admin oversight view).
  // draftOnly:true -> only entries not yet submitted (the staffer's current, editable list).
  async getEntries(projectId, staff, draftOnly = false) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const idx = db.transaction('entries', 'readonly').objectStore('entries').index('byProject');
      const req = idx.getAll(projectId);
      req.onsuccess = () => {
        let rows = staff ? req.result.filter(e => e.staff === staff) : req.result;
        if (draftOnly) rows = rows.filter(e => !e.submitted);
        resolve(rows.sort((a, b) => a.createdAt - b.createdAt));
      };
      req.onerror = () => reject(req.error);
    });
  },

  // Snapshots every current draft entry for this staffer+project into a new
  // submissions record, then marks those entries as submitted so they drop
  // out of the draft view. Returns the new submission, or null if there was
  // nothing unsubmitted to send.
  async submitEntries(projectId, staff) {
    const draft = await this.getEntries(projectId, staff, true);
    if (!draft.length) return null;

    const db = await openDB();
    const submission = await new Promise((resolve, reject) => {
      const t = db.transaction('submissions', 'readwrite');
      const req = t.objectStore('submissions').add({
        projectId, staff, submittedAt: Date.now(),
        rows: draft.map(e => ({ day: e.day, desc: e.desc, note: e.note })),
      });
      req.onsuccess = () => resolve({ id: req.result, projectId, staff });
      req.onerror   = () => reject(req.error);
    });

    await new Promise((resolve, reject) => {
      const t = db.transaction('entries', 'readwrite');
      const store = t.objectStore('entries');
      draft.forEach(e => store.put({ ...e, submitted: true }));
      t.oncomplete = () => resolve();
      t.onerror    = () => reject(t.error);
    });

    return submission;
  },

  async getSubmissions(projectId, staff) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const idx = db.transaction('submissions', 'readonly').objectStore('submissions').index('byProjectStaff');
      const req = idx.getAll([projectId, staff]);
      req.onsuccess = () => resolve(req.result.sort((a, b) => b.submittedAt - a.submittedAt));
      req.onerror   = () => reject(req.error);
    });
  },

  async setClaim(projectId, staff, done) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const t = db.transaction('claims', 'readwrite');
      const req = t.objectStore('claims').put({ id: `${projectId}::${staff}`, projectId, staff, done });
      req.onsuccess = () => resolve();
      req.onerror   = () => reject(req.error);
    });
  },

  // returns { staffName: true|false, ... } for every staff on the project
  async getClaimsForProject(projectId) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction('claims', 'readonly').objectStore('claims').getAll();
      req.onsuccess = () => {
        const map = {};
        req.result.filter(c => c.projectId === projectId).forEach(c => { map[c.staff] = c.done; });
        resolve(map);
      };
      req.onerror = () => reject(req.error);
    });
  },

  async resetAll() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const t = db.transaction(['projects', 'entries', 'claims', 'submissions'], 'readwrite');
      t.objectStore('projects').clear();
      t.objectStore('entries').clear();
      t.objectStore('claims').clear();
      t.objectStore('submissions').clear();
      t.oncomplete = () => resolve();
      t.onerror    = () => reject(t.error);
    });
  },
};

window.Store = Store;
