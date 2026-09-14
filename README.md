# UIM Logbook — project-brief demo (shared IndexedDB)

Frontend-only, no build step, no dependencies. Two entry points sharing one
browser database:

- `admin.html` — Barrister/admin side: write a brief, pick a client, assign staff.
- `staff.html` — Staff side: pick who you are (simulated login), see only the
  projects you're assigned to, log entries, claim your own part done.
- `index.html` — landing page linking to both.

## Run it

Opening these directly as `file://` works in some browsers but not others —
Chrome generally shares IndexedDB across file:// tabs from the same folder,
Firefox blocks IndexedDB under file:// entirely. To avoid confusion, serve the
folder instead:

```bash
cd idb-demo
python3 -m http.server 8000
```

Then open `http://localhost:8000/` on two tabs (or two devices on the same
network) — one as admin, one as staff.

## How to simulate the flow

1. Open `admin.html`. Create a project: client name, a one-line brief, and
   tick the staff assigned to it.
2. Open `staff.html`. Use the "Simulating login as" dropdown to pick one of
   the assigned staff — the project you just created shows up as a tab.
3. Add an entry as that staffer. Switch the dropdown to another assigned
   staffer on the same project — their own entries are separate, but the
   "who's done" chips at the top are shared and visible to everyone on it.
4. Back on `admin.html`, hit the browser's focus (click the tab) or reload —
   the project card shows live entry counts and done-claims per person.

## What's real here vs. what's still a stand-in

- **Real:** the data model (projects, entries, individual done-claims), the
  separation of admin/staff roles, and the fact that data actually persists
  in IndexedDB and is shared correctly between the two pages.
- **Stand-in:** login is a dropdown, not authentication. The staff roster
  (`js/store.js` → `STAFF`) is hardcoded from `staffRoles_UiM.pdf`, not
  editable from either page. There's no boss/read-only dashboard here yet —
  that's `admin/index.html` in the real app and hasn't been touched.
- **Not built:** the Sunday-night edit cutoff isn't enforced anywhere in this
  demo — entries and claims are editable indefinitely for now.

See `handoff.md` (from the main design conversation) for the full reasoning
behind this model and the open questions still unresolved.
