'use strict';
// medic's tests. They use real macOS output saved in test/fixtures, so they run
// anywhere; with MEDIC_FIXTURES set, fixes only say what they would do.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const FIX = path.join(__dirname, 'fixtures');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'medic-test-'));
process.env.MEDIC_FIXTURES = FIX;
process.env.MEDIC_HOME = path.join(TMP, 'medic');
process.env.HOME = path.join(TMP, 'home');
const AGENTS = path.join(process.env.HOME, 'Library', 'LaunchAgents');
fs.mkdirSync(AGENTS, { recursive: true });
const plist = (label, prog) => `<?xml version="1.0" encoding="UTF-8"?>\n<plist version="1.0"><dict><key>Label</key><string>${label}</string><key>ProgramArguments</key><array><string>${prog}</string></array></dict></plist>\n`;
fs.writeFileSync(path.join(AGENTS, 'com.google.keystone.agent.plist'), plist('com.google.keystone.agent', '/Users/sam/Library/Google/GoogleSoftwareUpdate/GoogleSoftwareUpdate.bundle/Contents/Resources/GoogleSoftwareUpdateAgent.app/Contents/MacOS/GoogleSoftwareUpdateAgent'));
fs.writeFileSync(path.join(AGENTS, 'com.spotify.webhelper.plist'), plist('com.spotify.webhelper', '/Users/sam/Library/Application Support/Spotify/SpotifyWebHelper'));

const Probe = require('../src/probe');
const Doctor = require('../src/doctor');
const Diary = require('../src/diary');
const Server = require('../src/server');
const Local = require('../src/local');
const read = (f) => fs.readFileSync(path.join(FIX, f), 'utf8');
const GB = 1024 ** 3;

test('reads the battery: charge, health, cycles, temperature', () => {
  const b = Probe.battery({ deep: true });
  assert.equal(b.has, true);
  assert.equal(b.percent, 74);
  assert.equal(b.plugged, false);
  assert.equal(b.minutesLeft, 3 * 60 + 41);
  assert.equal(b.health, 86);
  assert.equal(b.cycles, 412);
  assert.equal(b.condition, 'Normal');
  assert.ok(b.tempC > 30 && b.tempC < 40);
  assert.deepEqual(Probe.parseBatt("Now drawing from 'AC Power'\n"), { has: false, source: 'AC Power' });
});

test('adds processes up by app, helpers and all', () => {
  const apps = Probe.groupApps(Probe.parsePs(read('ps_-Ao_pid_ppid_pcpu_rss_comm.txt')));
  const chrome = apps.find((a) => a.name === 'Google Chrome');
  assert.ok(chrome.procs >= 4);
  assert.equal(Math.round(chrome.cpu), 125);
  assert.ok(chrome.mem > 3 * GB);
  assert.equal(apps.find((a) => a.name === 'WindowServer').system, true);
  assert.equal(Probe.appOf('/Applications/Spotify.app/Contents/MacOS/Spotify').name, 'Spotify');
  assert.equal(Probe.appOf('/System/Applications/Messages.app/Contents/MacOS/Messages').system, false);
});

test('reads memory, swap, the disk, the restart and Wi-Fi', () => {
  const m = Probe.memory();
  assert.equal(m.total, 8 * GB);
  assert.equal(m.pressure, 'warning');
  assert.ok(Math.abs(m.swap - 4.9 * GB) < 0.1 * GB);
  assert.ok(m.used > 5 * GB && m.used < 8 * GB);
  const d = Probe.disk();
  assert.ok(d.total > 200 * GB && d.free > 10 * GB && d.free < 12 * GB);
  assert.ok(Date.now() - Probe.boot() > 14 * 86400000);
  const n = Probe.network();
  assert.equal(n.connected, true);
  assert.equal(n.signal, -71);
  assert.equal(n.ping, 35);
  assert.equal(n.loss, 0);
  assert.deepEqual(Probe.parsePing('3 packets transmitted, 0 packets received, 100.0% packet loss'), { loss: 100, ms: null });
});

test('reads what keeps the Mac awake, the heat and the model', () => {
  const awake = Probe.parseAssertions(read('pmset_-g_assertions.txt'));
  assert.ok(awake.some((a) => a.app === 'Google Chrome'));
  assert.ok(!awake.some((a) => a.app === 'powerd'));
  assert.equal(Probe.parseTherm(read('pmset_-g_therm.txt')).speedLimit, 100);
  assert.equal(Probe.parseTherm('CPU_Speed_Limit = 62').speedLimit, 62);
  const s = Probe.system({ deep: true });
  assert.equal(s.modelName, 'MacBook Air');
  assert.equal(s.chip, 'Apple M1');
  assert.equal(s.cores, 8);
  assert.ok(Probe.parseTopPower(read('top_-l_2_-s_1_-n_8_-o_power_-stats_pid_command_power.txt')).length > 2);
});

test('lists what starts by itself, with friendly names', () => {
  const list = Probe.startup();
  assert.equal(list.length, 2);
  const g = list.find((s) => s.label === 'com.google.keystone.agent');
  assert.equal(g.name, 'GoogleSoftwareUpdateAgent');
  assert.equal(g.mine, true);
  assert.equal(g.running, true);
  assert.equal(Probe.friendly({ label: 'com.spotify.webhelper', program: '/x/SpotifyWebHelper' }), 'Spotify Webhelper');
});

test('the doctor puts the worst first and says it plainly', () => {
  const exam = Doctor.examine(Probe.all({ deep: true }));
  const fix = exam.findings.filter((f) => f.level === 'fix').map((f) => f.id);
  assert.deepEqual(fix, ['memory', 'busy-Google Chrome', 'restart']);
  assert.match(exam.verdict, /^3 things need attention\. The biggest: your Mac is short on memory\. After that: Google Chrome is working hard/);
  assert.ok(exam.findings.some((f) => f.id === 'disk' && f.level === 'watch'));
  assert.ok(exam.findings.some((f) => f.id === 'battery-aging'));
  assert.ok(exam.findings.some((f) => f.id === 'net-ok' && f.level === 'good'));
  const mem = exam.findings.find((f) => f.id === 'memory');
  assert.equal(mem.fix.action, 'quit');
  assert.equal(mem.fix.arg, 'Google Chrome');
  assert.ok(exam.score < 60);
});

test('the doctor: a healthy Mac, a worn battery, a full disk, no internet, heat', () => {
  const now = Date.now();
  const healthy = { battery: { has: true, health: 97, cycles: 40, tempC: 30 }, memory: { total: 16 * GB, used: 7 * GB, swap: 0, pressure: 'normal' }, disk: { total: 500 * GB, free: 200 * GB }, boot: now - 86400000, apps: [], startup: [], network: { loss: 0, ping: 20, signal: -50 } };
  const h = Doctor.examine(healthy);
  assert.equal(h.verdict, 'Your Mac is healthy. Nothing needs fixing.');
  assert.equal(h.score, 100);
  const sick = { ...healthy, battery: { has: true, health: 71, cycles: 1100, tempC: 46 }, disk: { total: 250 * GB, free: 3 * GB }, network: { loss: 100, connected: true }, heat: { speedLimit: 70 }, apps: [{ name: 'Zoom', cpu: 90, mem: GB }] };
  const s = Doctor.examine(sick);
  const ids = s.findings.map((f) => f.id);
  for (const id of ['battery-worn', 'battery-hot', 'disk', 'offline', 'throttled']) assert.ok(ids.includes(id), id);
  assert.equal(s.findings.find((f) => f.id === 'disk').fix.action, 'roomy');
  assert.equal(s.findings.find((f) => f.id === 'throttled').fix.arg, 'Zoom');
  assert.equal(Doctor.examine({ ...healthy, battery: { has: true, health: 90, condition: 'Service Recommended' } }).findings[0].id, 'battery-service');
  // never offers to quit a part of macOS
  const finder = Doctor.examine({ ...healthy, apps: [{ name: 'Finder', cpu: 150, mem: GB }] }).findings.find((f) => f.id === 'busy-Finder');
  assert.equal(finder.fix, null);
});

test('the diary: how fast it drains, and what drained it', () => {
  const t0 = Date.now() - 3 * 3600000;
  const S = [];
  for (let i = 0; i <= 24; i++) S.push({ t: t0 + i * 5 * 60000, pct: 90 - i, plugged: false, top: [['Zoom', 20], ['Safari', 5]] });
  S.push({ t: t0 + 200 * 60000, pct: 60, plugged: false }); // after a sleep: not counted
  const s = Diary.summary(S);
  assert.equal(s.hoursOnBattery, 2);
  assert.equal(s.perHour, 12);
  assert.equal(s.hoursFull, 8.3);
  assert.equal(s.apps[0].name, 'Zoom');
  assert.equal(s.apps[0].share, 80);
  Diary.add({ t: Date.now() - 50 * 3600000, pct: 50, plugged: true });
  Diary.add({ t: Date.now(), pct: 51, plugged: true });
  assert.equal(Diary.read(24).length, 1);
  assert.equal(Diary.read(72).length, 2);
});

test("the window's server: needs its secret, checks, fixes (pretend) and the diary", async () => {
  const s = await Server.start({ port: 0, idleExit: false });
  try {
    const port = s.server.address().port;
    const secret = Local.secretIn(path.join(process.env.MEDIC_HOME, 'secret'));
    const ask = (what, body) => Local.ask(port, secret, what, body, 'x-medic');
    const no = await fetch(`http://127.0.0.1:${port}/${secret}/api/check`, { method: 'POST', body: '{}' });
    assert.equal(no.status, 403);
    const page = await (await fetch(s.url)).text();
    assert.match(page, /"secret":/);
    assert.doesNotMatch(page, /__CONFIG__/);

    const quick = await ask('check', { deep: false });
    assert.equal(quick.vitals.network, undefined);
    const deep = await ask('check', { deep: true });
    assert.equal(deep.vitals.network.ping, 35);
    assert.equal(deep.vitals.system.modelName, 'MacBook Air');
    const again = await ask('check', { deep: false });
    assert.equal(again.vitals.network.ping, 35, 'the slow parts are remembered for a while');
    assert.ok(again.findings.some((f) => f.id === 'net-ok'));
    assert.equal((await ask('history')).history.length, 1);

    assert.equal((await ask('fix', { action: 'quit', arg: 'Spotify' })).said, 'would quit Spotify');
    await assert.rejects(ask('fix', { action: 'quit', arg: 'Finder' }), /part of how your Mac works/);
    await assert.rejects(ask('fix', { action: 'rm', arg: '/' }), /doesn't know that fix/);
    assert.equal((await ask('fix', { action: 'settings', arg: 'battery' })).ok, true);
    assert.equal((await ask('startup', { label: 'com.spotify.webhelper', on: false })).said, 'would turn off Spotify Webhelper');
    const d = await ask('diary', { hours: 72 });
    assert.equal(d.hours, 72);
    assert.ok(Array.isArray(d.samples));
  } finally { await s.close(); }
});

test('the command line', () => {
  const run = (...args) => spawnSync(process.execPath, [path.join(__dirname, '..', 'bin', 'medic.js'), ...args], { encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' }, input: '' });
  assert.match(run('--version').stdout, /^medic \d+\.\d+\.\d+/);
  assert.match(run('help').stdout, /medic diary on/);
  const b = run('battery').stdout;
  assert.match(b, /74%/);
  assert.match(b, /412/);
  const hogs = run('hogs').stdout;
  assert.match(hogs, /Google Chrome/);
  assert.match(hogs, /medic quit "Google Chrome"/);
  const c = run('check').stdout;
  assert.match(c, /short on memory/);
  assert.match(c, /\[1\] Quit Google Chrome/);
  assert.match(run('startup').stdout, /startup off 1/);
  assert.match(run('startup', 'off', '2').stdout, /would turn off/);
  assert.match(run('quit', 'Spotify').stdout + run('quit', 'Spotify').stderr, /would quit Spotify/);
});
