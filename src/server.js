'use strict';
// medic's window: a page served to this computer only, while the window is
// open. When nobody has looked at it for a couple of minutes, it stops.

const fs = require('fs');
const path = require('path');
const Probe = require('./probe');
const Doctor = require('./doctor');
const Fix = require('./fix');
const Diary = require('./diary');
const Local = require('./local');
const pkg = require('../package.json');

const WEB = path.join(__dirname, '..', 'web');
const SCRIPT = path.join(__dirname, '..', 'bin', 'medic.js');
const historyFile = () => path.join(Fix.home(), 'checkups.jsonl');

/** Remember the main figures of a full checkup (one a day), to show how things change. */
function remember(v, exam) {
  const day = new Date(v.at).toDateString();
  let lines = [];
  try { lines = fs.readFileSync(historyFile(), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { /* first */ }
  lines = lines.filter((x) => new Date(x.at).toDateString() !== day);
  lines.push({ at: v.at, score: exam.score, health: v.battery && v.battery.health, cycles: v.battery && v.battery.cycles, free: v.disk && v.disk.free, mem: v.memory && v.memory.total });
  fs.mkdirSync(Fix.home(), { recursive: true });
  fs.writeFileSync(historyFile(), lines.slice(-400).map((x) => JSON.stringify(x)).join('\n') + '\n');
  return lines;
}
function history() {
  try { return fs.readFileSync(historyFile(), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; }
}

// The slow parts of a full checkup (Wi-Fi, the internet, Apple's battery
// figures) are kept for ten minutes, so the quick checks in between still
// know about them.
let slow = null;
const SLOW_FOR = 10 * 60000;

/** The checkup the window shows: the vitals, what they mean, and (deep) a note in the history. */
function checkup(deep) {
  const v = Probe.all({ deep });
  if (deep) slow = { at: v.at, network: v.network, battery: v.battery && { condition: v.battery.condition, health: v.battery.health, charger: v.battery.charger } };
  else if (slow && v.at - slow.at < SLOW_FOR) {
    v.network = slow.network;
    if (v.battery && v.battery.has && slow.battery) for (const [k, x] of Object.entries(slow.battery)) if (x != null) v.battery[k] = x;
    v.slowAt = slow.at;
  }
  const exam = Doctor.examine(v);
  if (deep) remember(v, exam);
  v.apps = v.apps.filter((a) => a.cpu > 0.5 || a.mem > 80 * 1024 * 1024).sort((a, b) => b.mem - a.mem).slice(0, 40);
  return { vitals: v, ...exam };
}

async function start({ port = 0, idleExit = true } = {}) {
  let seen = Date.now();
  const s = await Local.serve({
    port, secret: Local.secretIn(path.join(Fix.home(), 'secret')), web: WEB, header: 'x-medic',
    config: () => ({ version: pkg.version, mac: process.platform === 'darwin' || !!process.env.MEDIC_FIXTURES }),
    api: async (what, b) => {
      seen = Date.now();
      switch (what) {
        case 'ping': return { ok: true };
        case 'check': return checkup(!!b.deep);
        case 'fix': return Fix.act(b.action, b.arg);
        case 'startup': return Fix.startup(b.label, !!b.on);
        case 'diary': {
          const hours = Math.min(24 * 14, Math.max(1, Number(b.hours) || 24));
          const samples = Diary.read(hours);
          return { on: Diary.isOn(), samples: samples.map((x) => [x.t, x.pct, x.plugged ? 1 : 0]), summary: Diary.summary(samples), hours };
        }
        case 'diary-on': { const r = Diary.on(SCRIPT); if (r.ok) Diary.sample(); return { ok: r.ok, said: r.ok ? 'The diary is on: a note every five minutes.' : r.why }; }
        case 'diary-off': Diary.off(); return { ok: true };
        case 'history': return { history: history() };
        default: throw Object.assign(new Error(`medic doesn't know "${what}".`), { status: 404 });
      }
    },
  });
  if (idleExit) {
    const t = setInterval(() => { if (Date.now() - seen > 150000) { clearInterval(t); s.close().then(() => process.exit(0)); } }, 15000);
    t.unref();
  }
  return s;
}

module.exports = { start, checkup, history, remember, forget: () => { slow = null; } };
