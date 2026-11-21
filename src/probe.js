'use strict';
// Taking the Mac's vitals. Every number comes from a tool macOS already has
// (pmset, ioreg, ps, sysctl, vm_stat, df, system_profiler…), run as you, with
// no administrator. Each reader is split in two: running the tool, and a
// plain function that reads its output (the tests feed those real samples).

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const MAC = process.platform === 'darwin';
const LIKE_MAC = () => MAC || !!process.env.MEDIC_FIXTURES; // fixtures stand in for a Mac in the tests
function sh(cmd, args, timeout = 12000) {
  if (process.env.MEDIC_FIXTURES) { // tests: canned outputs instead of a Mac
    const f = path.join(process.env.MEDIC_FIXTURES, `${[cmd, ...args].join(' ').replace(/[^a-z0-9.-]+/gi, '_').slice(0, 80)}.txt`);
    try { return fs.readFileSync(f, 'utf8'); } catch { return ''; }
  }
  try {
    const r = spawnSync(cmd, args, { encoding: 'utf8', timeout, maxBuffer: 16 * 1024 * 1024, env: { ...process.env, LC_ALL: 'C' } });
    return r.status === 0 ? String(r.stdout || '') : '';
  } catch { return ''; }
}
const num = (s) => { if (s == null || String(s).trim() === '') return null; const n = Number(String(s).replace(/[^\d.-]/g, '')); return Number.isFinite(n) && String(s).match(/\d/) ? n : null; };

// ── battery ──
function parseBatt(text) {
  const src = /drawing from '([^']+)'/.exec(text);
  const m = /(\d+)%;\s*([^;]+);\s*([^\n]*?)(?:\s+present|$)/m.exec(text);
  if (!m) return { has: false, source: src ? src[1] : 'AC Power' };
  const left = /(\d+):(\d+) remaining/.exec(m[3]);
  return { has: true, source: src ? src[1] : '', percent: Number(m[1]), state: m[2].trim(), plugged: !!src && /AC/.test(src[1]), minutesLeft: left && !/^0:00/.test(left[0]) ? Number(left[1]) * 60 + Number(left[2]) : null };
}
function parseIoreg(text) {
  const out = {};
  for (const m of text.matchAll(/"(\w+)" = ([^\n]+)/g)) {
    const v = m[2].trim();
    out[m[1]] = v === 'Yes' ? true : v === 'No' ? false : /^-?\d+$/.test(v) ? Number(v) : v;
  }
  return out;
}
function parsePowerProfile(text) {
  const g = (re) => { const m = re.exec(text); return m ? m[1].trim() : null; };
  return { condition: g(/Condition:\s*([^\n]+)/), maxCapacity: num(g(/Maximum Capacity:\s*([^\n]+)/)), cycles: num(g(/Cycle Count:\s*([^\n]+)/)), wattage: num(g(/Wattage \(W\):\s*([^\n]+)/)) };
}
function battery({ deep = false } = {}) {
  const b = parseBatt(sh('pmset', ['-g', 'batt']));
  if (!b.has) return b;
  const io = parseIoreg(sh('ioreg', ['-rn', 'AppleSmartBattery']));
  const design = io.DesignCapacity;
  const full = io.NominalChargeCapacity || io.AppleRawMaxCapacity || (io.MaxCapacity > 100 ? io.MaxCapacity : null);
  b.cycles = io.CycleCount != null ? io.CycleCount : null;
  b.health = design && full ? Math.min(100, Math.round((full / design) * 100)) : null;
  b.tempC = io.Temperature ? Math.round(io.Temperature / 10) / 10 : null;
  b.designMah = design || null;
  b.fullMah = full || null;
  if (deep) {
    const p = parsePowerProfile(sh('system_profiler', ['SPPowerDataType'], 20000));
    if (p.maxCapacity) b.health = p.maxCapacity; // Apple's own figure, when there is one
    if (p.condition) b.condition = p.condition;
    if (p.cycles != null) b.cycles = p.cycles;
    if (p.wattage) b.charger = p.wattage;
  }
  return b;
}

// ── what's keeping the Mac awake ──
function parseAssertions(text) {
  const out = [];
  for (const m of text.matchAll(/pid (\d+)\(([^)]+)\): \[[^\]]+\] ([\d:]+) (\w+) named: "([^"]*)"/g)) {
    const kind = m[4];
    if (!/Prevent(UserIdle)?(Display|System)Sleep|PreventUserIdleSystemSleep|NoIdleSleep|NoDisplaySleep/.test(kind)) continue;
    if (/^(powerd|WindowServer|coreaudiod|backupd|sharingd|bluetoothd|useractivityd|hidd)$/.test(m[2])) continue;
    out.push({ pid: Number(m[1]), app: m[2], since: m[3], display: /Display/.test(kind), why: m[5] });
  }
  return out;
}

// ── heat ──
function parseTherm(text) {
  const speed = /CPU_Speed_Limit\s*=\s*(\d+)/.exec(text);
  const warn = /thermal warning level[^\n]*?(\d+)/i.exec(text);
  return { speedLimit: speed ? Number(speed[1]) : 100, warning: warn && !/No thermal/.test(text) ? Number(warn[1]) : 0 };
}

// ── apps ──
const SYSTEM = /^\/(System|usr|sbin|bin|Library\/Apple|private)\//;
/** "Google Chrome" for anything inside Google Chrome.app (its helpers too). */
function appOf(cmd) {
  const i = cmd.indexOf('.app/');
  if (i >= 0) return { name: path.basename(cmd.slice(0, i)), app: cmd.slice(0, i + 4), system: SYSTEM.test(cmd) && !cmd.startsWith('/System/Applications/') };
  return { name: path.basename(cmd), app: null, system: SYSTEM.test(cmd) || !cmd.startsWith('/') };
}
function parsePs(text) {
  const rows = [];
  for (const line of text.split('\n').slice(1)) {
    const m = /^\s*(\d+)\s+(\d+)\s+([\d.]+)\s+(\d+)\s+(.+)$/.exec(line);
    if (m) rows.push({ pid: Number(m[1]), ppid: Number(m[2]), cpu: Number(m[3]), mem: Number(m[4]) * 1024, cmd: m[5].trim() });
  }
  return rows;
}
/** Processes added up by app, heaviest first. */
function groupApps(rows) {
  const by = new Map();
  for (const r of rows) {
    const a = appOf(r.cmd);
    const g = by.get(a.name) || { name: a.name, app: a.app, system: a.system, cpu: 0, mem: 0, procs: 0, pids: [] };
    g.cpu += r.cpu; g.mem += r.mem; g.procs++; g.pids.push(r.pid);
    if (a.app && !g.app) g.app = a.app;
    by.set(a.name, g);
  }
  return [...by.values()].map((g) => ({ ...g, cpu: Math.round(g.cpu * 10) / 10 }));
}
function apps() {
  const rows = parsePs(sh('ps', ['-Ao', 'pid,ppid,pcpu,rss,comm']));
  const me = process.pid;
  return groupApps(rows.filter((r) => r.pid !== me && !/\/medic\b|bin\/medic\.js/.test(r.cmd)));
}

// ── memory ──
function parseVmStat(text) {
  const page = num((/page size of (\d+)/.exec(text) || [])[1]) || 4096;
  const get = (name) => num((new RegExp(`${name}:\\s+([\\d.]+)`).exec(text) || [])[1]) || 0;
  const appMem = Math.max(0, get('Anonymous pages') - get('Pages purgeable'));
  return { page, used: (appMem + get('Pages wired down') + get('Pages occupied by compressor')) * page, compressed: get('Pages occupied by compressor') * page, wired: get('Pages wired down') * page };
}
function parseSwap(text) {
  const m = /used = ([\d.]+)([MG])/.exec(text);
  return m ? Number(m[1]) * (m[2] === 'G' ? 1024 : 1) * 1024 * 1024 : 0;
}
function memory() {
  const total = num(sh('sysctl', ['-n', 'hw.memsize'])) || os.totalmem();
  const vm = parseVmStat(sh('vm_stat', []));
  const level = num(sh('sysctl', ['-n', 'kern.memorystatus_vm_pressure_level'])) || 1;
  return { total, used: vm.used || total - os.freemem(), compressed: vm.compressed, swap: parseSwap(sh('sysctl', ['vm.swapusage'])), pressure: level >= 4 ? 'critical' : level >= 2 ? 'warning' : 'normal' };
}

// ── the disk ──
function parseDf(text) {
  const line = text.trim().split('\n').pop() || '';
  const p = line.split(/\s+/);
  if (p.length < 4 || !/^\d+$/.test(p[1])) return null;
  return { total: Number(p[1]) * 1024, used: Number(p[2]) * 1024, free: Number(p[3]) * 1024 };
}
function disk() {
  return parseDf(sh('df', ['-k', LIKE_MAC() ? '/System/Volumes/Data' : '/'])) || parseDf(sh('df', ['-k', '/']));
}

// ── how long since it restarted ──
function parseBoot(text) { const m = /sec = (\d+)/.exec(text); return m ? Number(m[1]) * 1000 : null; }
function boot() { return parseBoot(sh('sysctl', ['-n', 'kern.boottime'])) || Date.now() - os.uptime() * 1000; }

// ── what starts by itself ──
function parseLaunchList(text) {
  const out = new Map();
  for (const line of text.split('\n').slice(1)) {
    const p = line.split('\t');
    if (p.length >= 3) out.set(p[2].trim(), { pid: p[0] === '-' ? null : Number(p[0]), status: Number(p[1]) });
  }
  return out;
}
function plistInfo(file) {
  let text = '';
  if (MAC && !process.env.MEDIC_FIXTURES) text = sh('plutil', ['-convert', 'json', '-o', '-', file]);
  if (text) { try { const j = JSON.parse(text); return { label: j.Label, program: j.Program || (j.ProgramArguments || [])[0] || '', disabled: !!j.Disabled }; } catch { /* below */ } }
  try {
    const x = fs.readFileSync(file, 'utf8');
    const label = /<key>Label<\/key>\s*<string>([^<]+)<\/string>/.exec(x);
    const prog = /<key>Program<\/key>\s*<string>([^<]+)<\/string>/.exec(x) || /<key>ProgramArguments<\/key>\s*<array>\s*<string>([^<]+)<\/string>/.exec(x);
    return { label: label ? label[1] : path.basename(file, '.plist'), program: prog ? prog[1] : '', disabled: /<key>Disabled<\/key>\s*<true\/>/.test(x) };
  } catch { return null; }
}
const OFF_DIR = () => path.join(process.env.MEDIC_HOME || path.join(os.homedir(), '.medic'), 'turned-off');
function startup() {
  const running = parseLaunchList(sh('launchctl', ['list']));
  const list = [];
  const dirs = [[path.join(os.homedir(), 'Library', 'LaunchAgents'), 'you'], ['/Library/LaunchAgents', 'everyone']];
  for (const [dir, who] of dirs) {
    let files = [];
    try { files = fs.readdirSync(dir).filter((f) => f.endsWith('.plist')); } catch { continue; }
    for (const f of files) {
      const info = plistInfo(path.join(dir, f));
      if (!info || !info.label) continue;
      const r = running.get(info.label);
      list.push({ label: info.label, file: path.join(dir, f), program: info.program, who, mine: who === 'you', running: !!(r && r.pid), on: !info.disabled, name: friendly(info) });
    }
  }
  let off = [];
  try { off = fs.readdirSync(OFF_DIR()).filter((f) => f.endsWith('.plist')); } catch { /* none */ }
  for (const f of off) {
    const info = plistInfo(path.join(OFF_DIR(), f));
    if (info) list.push({ label: info.label, file: path.join(OFF_DIR(), f), program: info.program, who: 'you', mine: true, running: false, on: false, turnedOff: true, name: friendly(info) });
  }
  return list;
}
/** "com.google.keystone.agent" → "Google Keystone" */
function friendly({ label, program }) {
  const app = /\/([^/]+)\.app\//.exec(program || '');
  if (app) return app[1];
  const parts = String(label).split('.').filter((p) => !/^(com|org|net|io|dev|app|co|agent|daemon|helper|plist|launcher|user|LaunchAgent)$/i.test(p));
  return parts.slice(0, 2).map((p) => p.replace(/[-_]/g, ' ').replace(/^\w/, (c) => c.toUpperCase())).join(' ') || label;
}

// ── Wi-Fi and the internet ──
function parseAirport(text) {
  const cur = text.split(/Current Network Information:/)[1] || '';
  const sig = /Signal \/ Noise:\s*(-?\d+) dBm \/ (-?\d+) dBm/.exec(cur);
  const rate = /Transmit Rate:\s*(\d+)/.exec(cur);
  const ch = /Channel:\s*([^\n]+)/.exec(cur);
  const phy = /PHY Mode:\s*([^\n]+)/.exec(cur);
  return { connected: !!sig, signal: sig ? Number(sig[1]) : null, noise: sig ? Number(sig[2]) : null, rate: rate ? Number(rate[1]) : null, channel: ch ? ch[1].trim() : null, phy: phy ? phy[1].trim() : null };
}
function parsePing(text) {
  const loss = /([\d.]+)% packet loss/.exec(text);
  const avg = /= [\d.]+\/([\d.]+)\//.exec(text);
  return { loss: loss ? Number(loss[1]) : 100, ms: avg ? Math.round(Number(avg[1])) : null };
}
function network() {
  const air = LIKE_MAC() ? parseAirport(sh('system_profiler', ['SPAirPortDataType'], 20000)) : { connected: null };
  const ping = parsePing(sh('ping', ['-c', '3', '-q', '-t', '5', '1.1.1.1'], 8000));
  return { ...air, ping: ping.ms, loss: ping.loss };
}

// ── the Mac itself ──
/** "Model Name: MacBook Air", "Chip: Apple M1": the names people know (hw.model is "MacBookAir10,1"). */
function parseHardware(text) {
  const g = (re) => { const m = re.exec(text); return m ? m[1].trim() : null; };
  return { modelName: g(/Model Name:\s*([^\n]+)/), chip: g(/Chip:\s*([^\n]+)/) || g(/Processor Name:\s*([^\n]+)/), cores: num(g(/Total Number of Cores:\s*(\d+)/)) };
}
let hardware = null; // it doesn't change, so it's read once (in a full checkup)
function system({ deep = false } = {}) {
  if (deep && !hardware && LIKE_MAC()) hardware = parseHardware(sh('system_profiler', ['SPHardwareDataType'], 15000));
  const model = sh('sysctl', ['-n', 'hw.model']).trim();
  const chip = sh('sysctl', ['-n', 'machdep.cpu.brand_string']).trim();
  const hw = hardware || {};
  return { macos: sh('sw_vers', ['-productVersion']).trim() || os.release(), model, modelName: hw.modelName || null, chip: hw.chip || chip || (os.cpus()[0] || {}).model || '', cores: hw.cores || os.cpus().length, name: os.hostname().replace(/\.local$/, '') };
}

// ── the battery diary: what's using power right now ──
function parseTopPower(text) {
  const blocks = text.split(/\n\s*PID\s+COMMAND\s+POWER\s*\n/);
  const last = blocks.length > 1 ? blocks[blocks.length - 1] : '';
  const out = [];
  for (const line of last.split('\n')) {
    const m = /^\s*(\d+)\s+(.+?)\s+([\d.]+)\s*$/.exec(line);
    if (m) out.push({ pid: Number(m[1]), name: m[2].trim(), power: Number(m[3]) });
  }
  return out;
}
function powerNow() { return parseTopPower(sh('top', ['-l', '2', '-s', '1', '-n', '8', '-o', 'power', '-stats', 'pid,command,power'], 15000)); }

/** Everything (deep: the slow ones too: Apple's battery figures and Wi-Fi). */
function all({ deep = false } = {}) {
  const t0 = Date.now();
  const v = {
    at: Date.now(), mac: MAC || !!process.env.MEDIC_FIXTURES, system: system({ deep }), battery: battery({ deep }), awake: parseAssertions(sh('pmset', ['-g', 'assertions'])),
    heat: parseTherm(sh('pmset', ['-g', 'therm'])), memory: memory(), apps: apps(), disk: disk(), boot: boot(), startup: startup(),
  };
  if (deep) v.network = network();
  v.took = Date.now() - t0;
  return v;
}

module.exports = {
  all, battery, apps, memory, disk, boot, startup, network, system, powerNow, appOf, friendly, OFF_DIR,
  parseBatt, parseIoreg, parsePowerProfile, parseAssertions, parseTherm, parsePs, groupApps, parseVmStat, parseSwap, parseDf, parseBoot, parseLaunchList, parseAirport, parsePing, parseTopPower, parseHardware, sh,
};
