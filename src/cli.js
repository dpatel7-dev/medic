'use strict';
// The `medic` command.

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const A = require('./ansi');
const Sprite = require('./sprite');
const Lotl = require('./axolotl');
const Probe = require('./probe');
const Doctor = require('./doctor');
const Fix = require('./fix');
const Diary = require('./diary');
const pkg = require('../package.json');

const out = (s = '') => process.stdout.write(s + '\n');
const pink = (s) => A.paint(s, { fg: '#f6a6b8', bold: true });
const teal = (s) => A.paint(s, { fg: '#4fc4bf' });
const dim = (s) => A.paint(s, { fg: '#8a909c' });
const ok = (s) => A.paint(s, { fg: '#8fd4a0' });
const amber = (s) => A.paint(s, { fg: '#f2c14e' });
const red = (s) => A.paint(s, { fg: '#ff8a80' });
const bold = (s) => A.paint(s, { bold: true });
const MAC = process.platform === 'darwin';
const SCRIPT = path.join(__dirname, '..', 'bin', 'medic.js');

const HELP = `
  medic: a checkup for your Mac. Why it's slow, hot or low on battery, in
  plain words, with safe fixes (nothing that needs an administrator).

  medic                  a quick checkup (type a number to fix something)
  medic check            the full checkup (Apple's battery figures, Wi-Fi, the internet)
  medic app              medic's window: everything, with fixes and the battery diary
  medic battery          the battery: health, charge cycles, temperature
  medic hogs             the apps using the most power and memory
  medic quit <app>       quit an app (it asks you to save first)
  medic startup          what starts by itself      medic startup off <n> · on <n>
  medic diary on         a note every 5 minutes, to see what drains the battery
  medic diary            what the diary says        medic diary off
  medic update · uninstall · help · --version
`;

function intro(lines) {
  const art = Sprite.picture(Lotl.BIG, Lotl.MINI, Lotl.INK);
  const w = A.vwidth(art[0] || '');
  out('');
  for (let i = 0; i < Math.max(art.length, lines.length); i++) out('  ' + (art[i] || ' '.repeat(w)) + '   ' + (lines[i] || ''));
  out('');
}
function ask(q) {
  if (!process.stdin.isTTY) return Promise.resolve('');
  return new Promise((resolve) => { const rl = readline.createInterface({ input: process.stdin, output: process.stdout }); rl.question(q, (a) => { rl.close(); resolve(a); }); });
}
const mark = (lvl) => (lvl === 'fix' ? red('●') : lvl === 'watch' ? amber('●') : ok('●'));
function wrap(text, width = 72, pad = '      ') {
  const words = String(text).split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) { if ((cur + ' ' + w).trim().length > width) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); }
  if (cur) lines.push(cur);
  return lines.map((l) => pad + l).join('\n');
}

function show(exam, { all = false } = {}) {
  out(`  ${bold(exam.verdict)}\n`);
  const list = exam.findings.filter((f) => all || f.level !== 'good');
  const fixes = [];
  list.forEach((f) => {
    out(`  ${mark(f.level)} ${bold(f.title)}`);
    out(dim(wrap(f.why)));
    if (f.todo) out(wrap(f.todo));
    const opts = [f.fix, ...(f.more || [])].filter(Boolean);
    for (const o of opts) { fixes.push(o); out(`      ${teal('[' + fixes.length + ']')} ${o.label}`); }
    out('');
  });
  const good = exam.findings.filter((f) => f.level === 'good');
  if (!all && good.length) out(dim(`  Fine: ${good.map((f) => f.title.charAt(0).toLowerCase() + f.title.slice(1)).join(' · ')}\n`));
  return fixes;
}

async function offerFixes(fixes) {
  if (!fixes.length || !process.stdin.isTTY) return;
  const a = (await ask(`  ${dim('Type a number to do that fix, or Enter for medic\'s window: ')}`)).trim();
  if (!a) return main(['app']);
  const f = fixes[Number(a) - 1];
  if (!f) { out('  Pick one of the numbers.'); return; }
  if (f.ask && !/^y/i.test(await ask(`  ${f.ask} (y/n) `))) return;
  const r = Fix.act(f.action, f.arg);
  out(`  ${r.ok ? ok('✓') : amber('!')} ${r.said}`);
}

const GB = 1024 ** 3;
const size = (n) => (n >= GB ? (n / GB).toFixed(1) + ' GB' : Math.round(n / 1024 / 1024) + ' MB');
function bar(frac, width = 24) {
  const n = Math.max(0, Math.min(width, Math.round(frac * width)));
  return A.paint('█'.repeat(n), { fg: '#4fc4bf' }) + dim('░'.repeat(width - n));
}

/** medic in Spotlight and Launchpad: a little app in ~/Applications that opens the window (no administrator needed). */
function spotlightApp() {
  if (!MAC || process.env.MEDIC_NO_APP) return;
  try {
    const Mac = require('./macos')({ app: 'medic', label: 'dev.dpatel7.medic', home: Fix.home });
    const plist = path.join(Mac.appsDir(), 'medic.app', 'Contents', 'Info.plist');
    let same = false;
    try { same = fs.readFileSync(plist, 'utf8').includes(`<key>CFBundleShortVersionString</key><string>${pkg.version}</string>`); } catch { /* not made yet */ }
    if (!same) Mac.makeApp({ name: 'medic', id: 'dev.dpatel7.medic.app', args: ['app'], icon: path.join(__dirname, '..', 'assets', 'medic.icns'), script: SCRIPT, version: pkg.version });
  } catch { /* only a shortcut: never stop the command for it */ }
}

async function main(argv) {
  const [cmd, ...rest] = argv;
  if (!['uninstall', 'help', '--help', '-h', '--version', '-v', 'version', 'nudge', 'sample'].includes(cmd)) spotlightApp();
  if (!MAC && !process.env.MEDIC_FIXTURES && !['help', '--help', '-h', '--version', '-v', 'version'].includes(cmd)) {
    out('\n  medic checks Macs: it reads things only macOS has (the battery, heat, memory pressure).');
    out(dim('  On this computer, try roomy for disk space instead.\n'));
    return;
  }
  switch (cmd) {
    case undefined: {
      intro(['', `${pink('medic')} ${dim('v' + pkg.version)}`, '', 'A checkup for your Mac.', 'Why it\'s slow, hot or low on battery,', 'in plain words.', '', dim(`${Lotl.NAME} is having a look…`)]);
      const exam = Doctor.examine(Probe.all({ deep: false }));
      const fixes = show(exam);
      out(dim('  The full checkup (Wi-Fi, Apple\'s battery figures): medic check · the window: medic app\n'));
      return offerFixes(fixes);
    }
    case 'check': case 'checkup': {
      out(`\n  ${pink('medic')} ${dim('· the full checkup, a few seconds…')}\n`);
      const v = Probe.all({ deep: true });
      const exam = Doctor.examine(v);
      require('./server').remember(v, exam);
      return offerFixes(show(exam, { all: rest.includes('--all') }));
    }
    case '--version': case '-v': case 'version': out(`medic ${pkg.version}`); return;
    case 'help': case '--help': case '-h': out(HELP); return;
    case 'app': case 'open': case 'window': {
      const s = await require('./server').start({});
      require('./open').openWindow(s.url, { width: 1240, height: 860 });
      out(`\n  medic's window is open. ${dim('It closes by itself a couple of minutes after you close the window (or press Ctrl+C).')}`);
      out(`  ${dim(s.url)}\n`);
      await new Promise(() => {});
      return;
    }
    case 'battery': {
      const b = Probe.battery({ deep: true });
      if (!b.has) { out('\n  This Mac has no battery (it\'s a desktop).\n'); return; }
      out(`\n  ${pink('The battery')}\n`);
      out(`  Charge        ${bar(b.percent / 100)} ${b.percent}% ${dim(b.state + (b.minutesLeft ? `, about ${Math.floor(b.minutesLeft / 60)} h ${b.minutesLeft % 60} min left` : ''))}`);
      if (b.health != null) out(`  Health        ${bar(b.health / 100)} ${b.health}% ${dim('of what it held new')}`);
      if (b.cycles != null) out(`  Cycles        ${b.cycles} ${dim('(one cycle = 100% used, in any number of goes)')}`);
      if (b.tempC != null) out(`  Temperature   ${b.tempC} °C ${dim(b.tempC >= 40 ? '(warm)' : '(fine)')}`);
      if (b.condition) out(`  Condition     ${/normal/i.test(b.condition) ? ok(b.condition) : red(b.condition)}`);
      if (b.charger) out(`  Charger       ${b.charger} W`);
      out('');
      return;
    }
    case 'hogs': case 'top': {
      const apps = Probe.apps();
      const cpu = apps.slice().sort((a, b) => b.cpu - a.cpu).slice(0, 8);
      const mem = apps.slice().sort((a, b) => b.mem - a.mem).slice(0, 8);
      const top = Math.max(100, cpu[0] ? cpu[0].cpu : 0);
      out(`\n  ${pink('Working hardest')} ${dim('(% of one processor core)')}`);
      for (const a of cpu) out(`  ${a.name.slice(0, 26).padEnd(27)}${bar(a.cpu / top, 18)} ${String(Math.round(a.cpu)).padStart(4)}%${a.procs > 1 ? dim(' · ' + a.procs + ' processes') : ''}`);
      const total = Probe.memory().total;
      out(`\n  ${pink('Using the most memory')} ${dim('(of ' + size(total) + ')')}`);
      for (const a of mem) out(`  ${a.name.slice(0, 26).padEnd(27)}${bar(a.mem / total, 18)} ${size(a.mem).padStart(7)}`);
      out(dim('\n  Quit one: medic quit "Google Chrome"\n'));
      return;
    }
    case 'quit': {
      const name = rest.join(' ').trim();
      if (!name) throw new Error('Which app? medic quit "Google Chrome"');
      const r = Fix.quit(name);
      out(`  ${r.ok ? ok('✓') : amber('!')} ${r.said}`);
      return;
    }
    case 'startup': {
      const list = Probe.startup().filter((s) => s.mine || s.on);
      if (rest[0] === 'off' || rest[0] === 'on') {
        const i = Number(rest[1]) - 1;
        if (!list[i]) throw new Error('Which one? See the numbers in: medic startup');
        const r = Fix.startup(list[i].label, rest[0] === 'on');
        out(`  ${ok('✓')} ${r.said}`);
        return;
      }
      out(`\n  ${pink('Starts by itself')} ${dim('(when you log in)')}\n`);
      list.forEach((s, i) => out(`  ${teal(String(i + 1).padStart(3))}  ${s.on ? ok('on ') : dim('off')}  ${s.name.slice(0, 34).padEnd(35)}${dim(s.mine ? (s.running ? 'running' : '') : 'for everyone (admin only)')}`));
      if (!list.length) out(dim('  Nothing extra. Nice.'));
      const first = list.findIndex((s) => s.mine && s.on);
      if (first >= 0) out(dim(`\n  Turn one off: medic startup off ${first + 1}   (and back on: medic startup on ${first + 1})`));
      out(dim('  Apps you added yourself are in System Settings › General › Login Items.\n'));
      return;
    }
    case 'diary': {
      if (rest[0] === 'on') {
        const r = Diary.on(SCRIPT);
        if (!r.ok) throw new Error(r.why);
        Diary.sample();
        out(`  ${ok('✓')} The battery diary is on: a note every 5 minutes (it uses almost nothing). Look at it with: medic diary`);
        return;
      }
      if (rest[0] === 'off') { Diary.off(); out('  The battery diary is off. What it noted stays until it\'s two weeks old.'); return; }
      const hours = Number(rest[0]) || 24;
      const s = Diary.summary(Diary.read(hours));
      out(`\n  ${pink('Battery diary')} ${dim('· the last ' + hours + ' hours' + (Diary.isOn() ? '' : ' · it\'s off: medic diary on'))}\n`);
      if (!s.hoursOnBattery) { out(dim('  No time on battery noted yet.\n')); return; }
      out(`  On battery for ${s.hoursOnBattery} h${s.perHour ? `, using about ${s.perHour}% an hour (a full charge would last about ${s.hoursFull} h)` : ''}.`);
      if (s.apps.length) { out('\n  What used it:'); for (const a of s.apps) out(`  ${a.name.slice(0, 26).padEnd(27)}${bar(a.share / 100, 18)} ${a.share}%`); }
      out('');
      return;
    }
    case 'sample': Diary.sample(); return;
    case 'update': return update();
    case 'uninstall': return uninstall();
    default: throw new Error(`"${cmd}" isn't a medic command. Try: medic help`);
  }
}

function installUrl(kind) {
  let hub = '';
  try { hub = fs.readFileSync(path.join(Fix.home(), 'hub'), 'utf8').trim(); } catch { /* from GitHub */ }
  if (/^https?:\/\//.test(hub)) return `${hub.replace(/\/+$/, '')}/install.${kind}`;
  return `https://raw.githubusercontent.com/dpatel7-dev/medic/main/install.${kind}`;
}
function update() {
  const { spawnSync } = require('child_process');
  const url = installUrl('sh');
  out(`  Updating from ${url}`);
  const r = spawnSync('sh', ['-c', `curl -fsSL "${url}" | sh`], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error('The update did not finish. Your current version still works.');
}
async function uninstall() {
  if (MAC) require('./macos')({ app: 'medic', label: 'dev.dpatel7.medic', home: Fix.home }).removeApp('medic');
  Diary.off();
  const root = Fix.home();
  let launcher = '';
  try { launcher = fs.readFileSync(path.join(root, 'launcher'), 'utf8').trim(); } catch { /* not from the installer */ }
  const off = Probe.OFF_DIR();
  if (fs.existsSync(off) && fs.readdirSync(off).length) out(dim(`  (Things you turned off are kept in ${off}, in case you want them back.)`));
  else fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(path.join(root, 'app'), { recursive: true, force: true });
  if (launcher && /medic(\.cmd)?$/.test(launcher)) fs.rmSync(launcher, { force: true });
  out('  medic is uninstalled from this computer.');
}

module.exports = { main, HELP };
