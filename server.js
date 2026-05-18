const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const DB_PATH = path.join(__dirname, 'db.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── DATA GENERATION ────────────────────────────────────────────────────────────
const YEAR0 = 2026;
const WP = 245000;
const CR = 325000;

const EQ = {1:"Early Season",2:"Early Summer",3:"High Season",4:"★ HIGH SUMMER",5:"★ HIGH SUMMER",6:"Late Season"};
const KQ = {1:"Pre-Season",2:"★ CHRISTMAS",3:"★ NEW YEAR",4:"Peak Season",5:"Late Season",6:"Off-Season"};
const EP = new Set([4,5]);
const KP = new Set([2,3]);

function euOwner(sn, yr) { return ["A","B","C"][(sn - 1 + yr - 1) % 3]; }
function karOwner(sn, yr) { return ["A","B","C"][(sn - 1 + yr - 1 + 1) % 3]; }
function euBase(sn, yr) { const d = new Date(YEAR0 + yr - 1, 4, 15); d.setDate(d.getDate() + (sn - 1) * 21); return d; }
function karBase(sn, yr) { const d = new Date(YEAR0 + yr - 1, 10, 15); d.setDate(d.getDate() + (sn - 1) * 21); return d; }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function isoDate(d) { return d.toISOString().slice(0, 10); }

function buildWeeks() {
  const weeks = [];
  for (let yr = 1; yr <= 3; yr++) {
    for (let sn = 1; sn <= 6; sn++) {
      const b = euBase(sn, yr);
      const ow = euOwner(sn, yr);
      const slotId = `eu${yr}_${sn}`;
      for (let wn = 1; wn <= 3; wn++) {
        const start = addDays(b, (wn - 1) * 7);
        weeks.push({
          id: `${slotId}_w${wn}`,
          slotId, slotLabel: `EU ${sn}`, slotShort: `EU${sn}`,
          type: "EU", season: EQ[sn], isPremium: EP.has(sn),
          yr, sn, wn, origOwner: ow, owner: ow, status: null,
          start: isoDate(start), end: isoDate(addDays(start, 6))
        });
      }
    }
    for (let sn = 1; sn <= 6; sn++) {
      const b = karBase(sn, yr);
      const ow = karOwner(sn, yr);
      const slotId = `kar${yr}_${sn}`;
      for (let wn = 1; wn <= 3; wn++) {
        const start = addDays(b, (wn - 1) * 7);
        weeks.push({
          id: `${slotId}_w${wn}`,
          slotId, slotLabel: `KAR ${sn}`, slotShort: `KAR${sn}`,
          type: "KAR", season: KQ[sn], isPremium: KP.has(sn),
          yr, sn, wn, origOwner: ow, owner: ow, status: null,
          start: isoDate(start), end: isoDate(addDays(start, 6))
        });
      }
    }
  }
  return weeks;
}

const DEMO_STATUS_OVERRIDES = {};

const DEMO_OWNER_OVERRIDES = {};

const DEMO_REQUESTS = [];

function buildInitialState() {
  const weeks = buildWeeks().map(w => {
    if (DEMO_OWNER_OVERRIDES[w.id]) w = { ...w, owner: DEMO_OWNER_OVERRIDES[w.id] };
    if (DEMO_STATUS_OVERRIDES[w.id]) w = { ...w, ...DEMO_STATUS_OVERRIDES[w.id] };
    return w;
  });
  return {
    meta: { year0: YEAR0, weekPrice: WP, charterRate: CR },
    weeks,
    requests: DEMO_REQUESTS,
    leads: [],
  };
}

const INITIAL_STATE = buildInitialState();

// In-memory database (works locally and on Vercel).
// On Vercel serverless, state resets on cold start → always starts from INITIAL_STATE.
// For persistent multi-user state, replace with Vercel KV or Upstash Redis.
let db = JSON.parse(JSON.stringify(INITIAL_STATE));

function loadDb() { return db; }
function saveDb(data) {
  db = data;
  // Also persist locally when running on disk (dev mode)
  try { fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8'); } catch {}
}

// ── HELPERS ────────────────────────────────────────────────────────────────────
function isLocked(database, weekId) {
  return database.requests.some(r =>
    r.status === 'pending' &&
    (r.myWid === weekId || r.theirWid === weekId || r.tgtWid === weekId)
  );
}

// ── API ROUTES ─────────────────────────────────────────────────────────────────
app.get('/api/state', (req, res) => {
  db = loadDb();
  res.json({ weeks: db.weeks, requests: db.requests, meta: db.meta });
});

app.patch('/api/weeks/:weekId/status', (req, res) => {
  const { weekId } = req.params;
  const { owner, status } = req.body;
  db = loadDb();
  const week = db.weeks.find(w => w.id === weekId);
  if (!week) return res.status(404).json({ ok: false, error: 'Week not found' });
  if (week.owner !== owner) return res.status(403).json({ ok: false, error: 'You do not own this week' });
  if (isLocked(db, weekId)) return res.status(400).json({ ok: false, error: 'Week is locked by a pending request' });
  const valid = [null, 'use', 'charter'];
  if (!valid.includes(status)) return res.status(400).json({ ok: false, error: 'Invalid status' });
  week.status = week.status === status ? null : status;
  saveDb(db);
  res.json({ ok: true, week });
});

app.post('/api/requests', (req, res) => {
  db = loadDb();
  const { type, fromOwner, myWid, theirWid, tgtWid, toOwner } = req.body;
  if (!['swap','buy','sell'].includes(type)) return res.status(400).json({ ok: false, error: 'Invalid type' });

  const wmap = Object.fromEntries(db.weeks.map(w => [w.id, w]));

  if (type === 'swap') {
    const mw = wmap[myWid]; const tw = wmap[theirWid];
    if (!mw || !tw) return res.status(400).json({ ok: false, error: 'Week not found' });
    if (mw.owner !== fromOwner) return res.status(403).json({ ok: false, error: 'You do not own myWid' });
    if (tw.owner === fromOwner) return res.status(400).json({ ok: false, error: 'Cannot swap with your own week' });
    if (isLocked(db, myWid) || isLocked(db, theirWid)) return res.status(400).json({ ok: false, error: 'A week is locked by a pending request' });
    const newReq = { id: `req_${Date.now()}`, type: 'swap', fromOwner, toOwner: tw.owner, myWid, theirWid, tgtWid: null, status: 'pending', createdAt: new Date().toISOString(), resolvedAt: null };
    db.requests.push(newReq);
    saveDb(db);
    return res.status(201).json({ ok: true, request: newReq });
  }

  if (type === 'buy') {
    const tw = wmap[tgtWid];
    if (!tw) return res.status(400).json({ ok: false, error: 'Week not found' });
    if (tw.owner === fromOwner) return res.status(400).json({ ok: false, error: 'You already own this week' });
    if (isLocked(db, tgtWid)) return res.status(400).json({ ok: false, error: 'Week is locked by a pending request' });
    const newReq = { id: `req_${Date.now()}`, type: 'buy', fromOwner, toOwner: tw.owner, myWid: null, theirWid: null, tgtWid, status: 'pending', createdAt: new Date().toISOString(), resolvedAt: null };
    db.requests.push(newReq);
    saveDb(db);
    return res.status(201).json({ ok: true, request: newReq });
  }

  if (type === 'sell') {
    const mw = wmap[myWid];
    if (!mw) return res.status(400).json({ ok: false, error: 'Week not found' });
    if (mw.owner !== fromOwner) return res.status(403).json({ ok: false, error: 'You do not own this week' });
    if (isLocked(db, myWid)) return res.status(400).json({ ok: false, error: 'Week is locked by a pending request' });
    const now = new Date().toISOString();
    const newReqs = ['A','B','C'].filter(o => o !== fromOwner).map(tO => ({
      id: `req_${Date.now()}_${tO}`, type: 'sell', fromOwner, toOwner: tO,
      myWid, theirWid: null, tgtWid: null, status: 'pending', createdAt: now, resolvedAt: null
    }));
    newReqs.forEach(r => db.requests.push(r));
    saveDb(db);
    return res.status(201).json({ ok: true, requests: newReqs });
  }
});

app.post('/api/requests/:id/respond', (req, res) => {
  db = loadDb();
  const { id } = req.params;
  const { owner, decision } = req.body;
  if (!['accepted','declined'].includes(decision)) return res.status(400).json({ ok: false, error: 'Invalid decision' });
  const reqObj = db.requests.find(r => r.id === id);
  if (!reqObj) return res.status(404).json({ ok: false, error: 'Request not found' });
  if (reqObj.status !== 'pending') return res.status(400).json({ ok: false, error: 'Request is not pending' });
  if (reqObj.toOwner !== owner) return res.status(403).json({ ok: false, error: 'Only the recipient can respond' });

  const wmap = Object.fromEntries(db.weeks.map(w => [w.id, w]));
  const affectedWeeks = [];

  if (decision === 'accepted') {
    if (reqObj.type === 'swap') {
      const mw = wmap[reqObj.myWid]; const tw = wmap[reqObj.theirWid];
      if (!mw || !tw) return res.status(400).json({ ok: false, error: 'Referenced weeks not found' });
      if (mw.owner !== reqObj.fromOwner) return res.status(400).json({ ok: false, error: 'Week ownership has changed since this request was created' });
      if (tw.owner !== reqObj.toOwner) return res.status(400).json({ ok: false, error: 'Week ownership has changed since this request was created' });
      mw.owner = reqObj.toOwner; mw.status = null;
      tw.owner = reqObj.fromOwner; tw.status = null;
      affectedWeeks.push(mw, tw);
    }
    if (reqObj.type === 'buy') {
      const tw = wmap[reqObj.tgtWid];
      if (!tw) return res.status(400).json({ ok: false, error: 'Referenced week not found' });
      if (tw.owner !== reqObj.toOwner) return res.status(400).json({ ok: false, error: 'Week ownership has changed since this request was created' });
      tw.owner = reqObj.fromOwner; tw.status = null;
      affectedWeeks.push(tw);
    }
    if (reqObj.type === 'sell') {
      const mw = wmap[reqObj.myWid];
      if (!mw) return res.status(400).json({ ok: false, error: 'Referenced week not found' });
      if (mw.owner !== reqObj.fromOwner) return res.status(400).json({ ok: false, error: 'Week ownership has changed since this request was created' });
      mw.owner = reqObj.toOwner; mw.status = null;
      affectedWeeks.push(mw);
      // Cancel the sibling broadcast requests (other owners who didn't accept in time)
      const resolvedAt = new Date().toISOString();
      db.requests.forEach(r => {
        if (r.id !== reqObj.id && r.type === 'sell' && r.myWid === reqObj.myWid && r.status === 'pending') {
          r.status = 'declined'; r.resolvedAt = resolvedAt;
        }
      });
    }
  }

  reqObj.status = decision;
  reqObj.resolvedAt = new Date().toISOString();
  saveDb(db);
  res.json({ ok: true, request: reqObj, affectedWeeks });
});

app.post('/api/reset', (req, res) => {
  db = JSON.parse(JSON.stringify(INITIAL_STATE));
  saveDb(db);
  res.json({ ok: true, message: 'State reset to initial' });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ ok: false, error: err.message });
});

// Local dev: start server directly. Vercel imports this file as a module.
if (require.main === module) {
  app.listen(3000, () => console.log('Yacht Planner running on http://localhost:3000'));
}
module.exports = app;
