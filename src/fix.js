'use strict';
// Safe fixes: nothing that needs an administrator, nothing that can't be undone.
//   quit an app (it asks you to save first, like quitting it yourself)
//   turn off something that starts by itself (yours only; it's put aside, and can come back)
//   open the right page of System Settings
//   open roomy, to find what's taking disk space

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const Probe = require('./probe');

const MAC = process.platform === 'darwin';
const home = () => process.env.MEDIC_HOME || path.join(os.homedir(), '.medic');
const DRY = () => !!process.env.MEDIC_FIXTURES; // tests: say what would happen, do nothing
const run = (cmd, args, timeout = 15000) => { const r = spawnSync(cmd, args, { encoding: 'utf8', timeout }); return { ok: r.status === 0, out: String(r.stdout || '').trim(), err: String(r.stderr || '').trim() }; };

const SETTINGS = {
  battery: 'x-apple.systempreferences:com.apple.Battery-Settings.extension',
  storage: 'x-apple.systempreferences:com.apple.settings.Storage',
  wifi: 'x-apple.systempreferences:com.apple.wifi-settings-extension',
  login: 'x-apple.systempreferences:com.apple.LoginItems-Settings.extension',
  update: 'x-apple.systempreferences:com.apple.Software-Update-Settings.extension',
  energy: 'x-apple.systempreferences:com.apple.Battery-Settings.extension',
};

function quit(name) {
  if (!name || /["\\]/.test(name)) throw new Error("That isn't an app name medic can quit.");
  if (require('./doctor').KEEP.test(name)) throw new Error(`${name} is part of how your Mac works, so medic won't quit it.`);
  if (DRY()) return { ok: true, said: `would quit ${name}` };
  if (!MAC) throw new Error('Quitting apps is for Macs.');
  const r = run('osascript', ['-e', `quit app "${name}"`], 60000);
  if (!r.ok) {
    if (/-128|cancel/i.test(r.err)) return { ok: false, said: `${name} asked about saving, and you chose Cancel, so it's still open.` };
    return { ok: false, said: `${name} didn't quit (${r.err.split('\n').pop() || 'it said no'}).` };
  }
  return { ok: true, said: `${name} quit.` };
}

/** Turn something that starts by itself off (put aside) or back on. */
function startup(label, on) {
  const item = Probe.startup().find((s) => s.label === label);
  if (!item) throw new Error("That isn't in the startup list any more.");
  if (!item.mine) throw new Error('That one is set up for everyone on this Mac, so only an administrator can turn it off. You can turn it off in System Settings › General › Login Items.');
  const uid = process.getuid ? process.getuid() : 0;
  const mineDir = path.join(os.homedir(), 'Library', 'LaunchAgents');
  if (DRY()) return { ok: true, said: `would turn ${on ? 'on' : 'off'} ${item.name}` };
  if (!on) {
    if (MAC) run('launchctl', ['bootout', `gui/${uid}/${label}`]);
    fs.mkdirSync(Probe.OFF_DIR(), { recursive: true });
    fs.renameSync(item.file, path.join(Probe.OFF_DIR(), path.basename(item.file)));
    return { ok: true, said: `${item.name} won't start by itself any more. (Turn it back on any time.)` };
  }
  const dest = path.join(mineDir, path.basename(item.file));
  fs.mkdirSync(mineDir, { recursive: true });
  fs.renameSync(item.file, dest);
  if (MAC) run('launchctl', ['bootstrap', `gui/${uid}`, dest]);
  return { ok: true, said: `${item.name} starts by itself again.` };
}

function settings(which) {
  const url = SETTINGS[which];
  if (!url) throw new Error('medic doesn\'t know that page of System Settings.');
  if (DRY()) return { ok: true, said: `would open ${which} settings` };
  if (!MAC) throw new Error('System Settings is on Macs.');
  run('open', [url]);
  return { ok: true, said: 'System Settings is open.' };
}

/** roomy, in a Terminal window (a .command file opens in Terminal without any permission prompt). */
function roomy() {
  const js = path.join(process.env.ROOMY_HOME || path.join(os.homedir(), '.roomy'), 'app', 'bin', 'roomy.js');
  const inPath = run('sh', ['-c', 'command -v roomy']).out;
  if (!fs.existsSync(js) && !inPath) {
    if (MAC && !DRY()) run('open', [SETTINGS.storage]);
    return { ok: false, said: "roomy isn't installed, so medic opened macOS's Storage settings instead. Get roomy with pca for a closer look." };
  }
  if (DRY()) return { ok: true, said: 'would open roomy' };
  const cmd = path.join(os.tmpdir(), 'medic-roomy.command');
  fs.writeFileSync(cmd, `#!/bin/sh\nclear\n${fs.existsSync(js) ? `'${process.execPath}' '${js}'` : 'roomy'}\n`, { mode: 0o755 });
  run('open', ['-a', 'Terminal', cmd]);
  return { ok: true, said: 'roomy is open in Terminal.' };
}

function act(action, arg) {
  switch (action) {
    case 'quit': return quit(arg);
    case 'settings': return settings(arg);
    case 'roomy': return roomy();
    default: throw new Error('medic doesn\'t know that fix.');
  }
}

module.exports = { quit, startup, settings, roomy, act, SETTINGS, home };
