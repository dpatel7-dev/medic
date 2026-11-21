'use strict';
// The battery diary: every five minutes, a note of the battery and, while on
// battery, which apps are using the most power. Afterwards medic can tell you
// how fast it drained, and what drained it. Kept for two weeks in
// ~/.medic/diary.jsonl, never sent anywhere.

const fs = require('fs');
const path = require('path');
const Probe = require('./probe');
const { home } = require('./fix');

const file = () => path.join(home(), 'diary.jsonl');
const KEEP_DAYS = 14;
const LABEL = 'dev.dpatel7.medic.diary';

/** Take one note. */
function sample(now = Date.now()) {
  const b = Probe.battery();
  if (!b.has) return null;
  const s = { t: now, pct: b.percent, plugged: !!b.plugged, state: b.state };
  if (!b.plugged) s.top = Probe.powerNow().filter((p) => p.power > 0.5 && !/^(top|medic|node)$/.test(p.name)).slice(0, 5).map((p) => [p.name, p.power]);
  add(s);
  return s;
}

function add(s) {
  fs.mkdirSync(home(), { recursive: true });
  fs.appendFileSync(file(), JSON.stringify(s) + '\n');
  try {
    if (fs.statSync(file()).size > 1024 * 1024) { // keep it small: only the last two weeks
      const keep = read(KEEP_DAYS * 24);
      fs.writeFileSync(file(), keep.map((x) => JSON.stringify(x)).join('\n') + '\n');
    }
  } catch { /* fine */ }
}

function read(hours = 24, now = Date.now()) {
  let text = '';
  try { text = fs.readFileSync(file(), 'utf8'); } catch { return []; }
  const since = now - hours * 3600000;
  const out = [];
  for (const line of text.split('\n')) {
    try { const o = JSON.parse(line); if (o && o.t >= since) out.push(o); } catch { /* skip */ }
  }
  return out.sort((a, b) => a.t - b.t);
}

/**
 * What the notes say: time on battery, how fast it drained (% an hour), and
 * the apps that used the most power while unplugged.
 */
function summary(samples) {
  let onBattery = 0, drained = 0;
  const power = new Map();
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1], b = samples[i];
    const gap = b.t - a.t;
    if (gap > 20 * 60000) continue; // asleep, or medic wasn't running
    if (!a.plugged && !b.plugged) {
      onBattery += gap;
      if (b.pct < a.pct) drained += a.pct - b.pct;
      for (const [name, p] of b.top || []) power.set(name, (power.get(name) || 0) + p * (gap / 60000));
    }
  }
  const hours = onBattery / 3600000;
  const total = [...power.values()].reduce((x, y) => x + y, 0) || 1;
  return {
    hoursOnBattery: Math.round(hours * 10) / 10,
    perHour: hours >= 0.25 ? Math.round((drained / hours) * 10) / 10 : null,
    hoursFull: hours >= 0.25 && drained > 0 ? Math.round((100 / (drained / hours)) * 10) / 10 : null,
    apps: [...power.entries()].sort((x, y) => y[1] - x[1]).slice(0, 6).map(([name, p]) => ({ name, share: Math.round((p / total) * 100) })),
    samples: samples.length,
  };
}

function on(script) {
  const Mac = require('./macos')({ app: 'medic', label: LABEL, home });
  return Mac.startAgent({ args: ['sample'], every: 300, script });
}
function off() {
  const Mac = require('./macos')({ app: 'medic', label: LABEL, home });
  Mac.stopAgent(LABEL);
}
function isOn() {
  const Mac = require('./macos')({ app: 'medic', label: LABEL, home });
  return Mac.agentState(LABEL).installed;
}

module.exports = { sample, add, read, summary, on, off, isOn, file, LABEL };
