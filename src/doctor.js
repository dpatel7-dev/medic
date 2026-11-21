'use strict';
// Reading the vitals: what's wrong (if anything), in plain words, and what
// would help. Every finding says what it means and what to do.
//
// level: 'fix' (worth doing something about), 'watch' (keep an eye on it), 'good'.

const GB = 1024 ** 3;
const gb = (n) => (n >= 10 * GB ? Math.round(n / GB) : Math.round((n / GB) * 10) / 10) + ' GB';
const days = (ms) => Math.floor(ms / 86400000);
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

// things not to offer to quit
const KEEP = /^(Finder|Dock|SystemUIServer|WindowServer|loginwindow|Control Center|Spotlight|NotificationCenter|kernel_task|launchd|medic|node|Terminal|iTerm2)$/;

function examine(v) {
  const F = [];
  const add = (f) => F.push(f);
  const b = v.battery || {};
  const mem = v.memory || {};
  const disk = v.disk;
  const apps = (v.apps || []).filter((a) => a.name);
  const byCpu = apps.slice().sort((x, y) => y.cpu - x.cpu);
  const byMem = apps.slice().sort((x, y) => y.mem - x.mem);
  const quitFix = (a) => (!a.system && !KEEP.test(a.name) ? { label: `Quit ${a.name}`, action: 'quit', arg: a.name, ask: `Quit ${a.name}? If anything isn't saved in it, it will ask you first.` } : null);

  // ── battery ──
  if (b.has) {
    if (b.condition && !/normal/i.test(b.condition)) {
      add({ id: 'battery-service', area: 'battery', level: 'fix', title: `macOS says the battery needs service ("${b.condition}")`, why: 'The battery is worn enough that macOS recommends a new one. It will run out much sooner than it used to, and may shut down suddenly when it gets low.', todo: 'An Apple Store or repair shop can replace it. Until then, keep the charger nearby.', fix: { label: 'Open Battery settings', action: 'settings', arg: 'battery' } });
    } else if (b.health != null && b.health < 80) {
      add({ id: 'battery-worn', area: 'battery', level: 'fix', title: `The battery holds ${b.health}% of what it did when new`, why: `That's why it runs out sooner than it used to. Batteries wear a little with every charge (this one has been through ${plural(b.cycles || 0, 'cycle')}).`, todo: 'Below 80%, a new battery makes a real difference. Turning on Optimized Battery Charging slows the wear down.', fix: { label: 'Open Battery settings', action: 'settings', arg: 'battery' } });
    } else if (b.health != null && b.health < 88) {
      add({ id: 'battery-aging', area: 'battery', level: 'watch', title: `The battery holds ${b.health}% of what it did when new`, why: 'That\'s normal wear for a battery that has been used a while. It lasts a bit less than it did new.', todo: 'Nothing to do yet. Keeping it between 20% and 80% most of the time helps it last.' });
    } else if (b.health != null) {
      add({ id: 'battery-ok', area: 'battery', level: 'good', title: `The battery is healthy (${b.health}%)`, why: `${b.cycles != null ? plural(b.cycles, 'charge cycle') + ' so far. ' : ''}It holds nearly all it did when new.` });
    }
    if (b.tempC != null && b.tempC >= 40) {
      add({ id: 'battery-hot', area: 'heat', level: b.tempC >= 45 ? 'fix' : 'watch', title: `The battery is warm (${Math.round(b.tempC)} °C)`, why: 'Heat wears batteries out faster than anything else, and a warm Mac slows itself down to cool off.', todo: 'Give it air: not on a bed or a blanket, not in the sun. Quitting what\'s working hardest (below) helps too.' });
    }
  }

  // ── heat ──
  const heat = v.heat || {};
  if (heat.speedLimit < 100) {
    add({ id: 'throttled', area: 'heat', level: 'fix', title: `Your Mac is slowing itself down to cool off (running at ${heat.speedLimit}% speed)`, why: 'It got hot, so macOS turned the processor down. That makes everything feel slow until it cools.', todo: 'Let air get under it, and quit the apps working the hardest.', fix: byCpu[0] ? quitFix(byCpu[0]) : null });
  }

  // ── what's working hard ──
  const busy = byCpu.filter((a) => a.cpu >= 60 && a.name !== 'kernel_task');
  for (const a of busy.slice(0, 3)) {
    add({ id: `busy-${a.name}`, area: 'energy', level: a.cpu >= 120 ? 'fix' : 'watch', title: `${a.name} is working hard (${Math.round(a.cpu)}% of a processor core)`, why: `That makes your Mac warmer, its fans louder and its battery run down faster${a.procs > 3 ? ` (it's ${a.procs} processes together, like tabs and helpers)` : ''}.`, todo: a.system ? 'This is part of macOS. It usually settles down by itself after a few minutes (indexing, backups, updates).' : 'If you\'re not using it right now, quitting it helps straight away.', fix: quitFix(a) });
  }
  if (byCpu.some((a) => a.name === 'kernel_task' && a.cpu > 150)) {
    add({ id: 'kernel-task', area: 'heat', level: 'watch', title: 'macOS is holding the processor back to keep it cool', why: '"kernel_task" using a lot means macOS is keeping the processor busy on purpose, so it can\'t get hotter.', todo: 'Cool it down: give it air, and quit apps you aren\'t using.' });
  }

  // ── staying awake ──
  const awake = (v.awake || []).filter((a) => !/^(powerd|caffeinate)$/.test(a.app));
  if (awake.length) {
    const names = [...new Set(awake.map((a) => a.app))];
    add({ id: 'awake', area: 'energy', level: 'watch', title: `${names.join(', ')} ${names.length === 1 ? 'is' : 'are'} keeping your Mac awake`, why: awake.map((a) => `${a.app}: "${a.why}"`).join('; ') + '. That\'s fine while you\'re using it (a video, a call, a download) but it stops your Mac sleeping and uses battery.', todo: 'If you\'re done with it, close that tab or app.', fix: quitFix(apps.find((x) => x.name === names[0]) || { name: names[0] }) });
  }

  // ── memory ──
  if (mem.total) {
    const top = byMem.filter((a) => !a.system).slice(0, 3);
    const list = top.map((a) => `${a.name} ${gb(a.mem)}`).join(', ');
    if (mem.pressure === 'critical' || mem.pressure === 'warning' || mem.swap > 4 * GB) {
      add({ id: 'memory', area: 'memory', level: mem.pressure === 'critical' || mem.swap > 6 * GB || (mem.pressure === 'warning' && mem.swap > 2 * GB) ? 'fix' : 'watch', title: 'Your Mac is short on memory', why: `It has ${gb(mem.total)} and needs more than that right now, so it's squeezing things and using the disk as extra memory (${gb(mem.swap)}). That's the most common reason a Mac feels slow. Using the most: ${list}.`, todo: 'Quit apps you aren\'t using, and close tabs you don\'t need (each tab uses memory).', fix: top[0] ? quitFix(top[0]) : null, more: top.slice(1).map(quitFix).filter(Boolean) });
    } else {
      add({ id: 'memory-ok', area: 'memory', level: 'good', title: 'Plenty of memory', why: `${gb(mem.used)} of ${gb(mem.total)} in use, and nothing's waiting for room.${list ? ' Using the most: ' + list + '.' : ''}` });
    }
  }

  // ── the disk ──
  if (disk && disk.total) {
    const pct = Math.round((disk.free / disk.total) * 100);
    if (disk.free < 5 * GB || pct < 5) add({ id: 'disk', area: 'storage', level: 'fix', title: `Your disk is nearly full (${gb(disk.free)} free)`, why: 'macOS needs free space to work: for memory, updates and saving files. Below about 10% free, everything slows down and updates can fail.', todo: 'Delete what you don\'t need, or move big files somewhere else. roomy (from the same family) finds what\'s taking the space.', fix: { label: 'Find what\'s taking space', action: 'roomy' } });
    else if (pct < 12 || disk.free < 15 * GB) add({ id: 'disk', area: 'storage', level: 'watch', title: `Disk space is getting low (${gb(disk.free)} free)`, why: 'There\'s enough for now, but macOS slows down and updates can fail when it gets much fuller.', todo: 'A good moment to clear out old downloads and videos.', fix: { label: 'Find what\'s taking space', action: 'roomy' } });
    else add({ id: 'disk-ok', area: 'storage', level: 'good', title: `${gb(disk.free)} free on the disk`, why: `${pct}% of ${gb(disk.total)} is free. That's plenty.` });
  }

  // ── restarting ──
  if (v.boot) {
    const d = days(Date.now() - v.boot);
    if (d >= 14) add({ id: 'restart', area: 'system', level: 'fix', title: `It's been ${d} days since your Mac restarted`, why: 'Over days, apps leave things behind in memory, and updates wait for a restart. Restarting clears all of that out.', todo: 'Save your work, then choose Restart from the Apple menu (top left). It takes a minute and often fixes slowness by itself.' });
    else if (d >= 7) add({ id: 'restart', area: 'system', level: 'watch', title: `${d} days since the last restart`, why: 'A restart every week or so keeps things running smoothly.', todo: 'Next time you take a break: Apple menu › Restart.' });
    else add({ id: 'restart-ok', area: 'system', level: 'good', title: `Restarted ${d === 0 ? 'today' : d === 1 ? 'yesterday' : d + ' days ago'}`, why: 'Nothing has had time to pile up.' });
  }

  // ── what starts by itself ──
  const start = (v.startup || []).filter((s) => s.on && !s.turnedOff);
  if (start.length >= 12) add({ id: 'startup', area: 'startup', level: 'watch', title: `${start.length} things start by themselves`, why: 'Each one starts when you log in and keeps running in the background, using memory and battery even when you never open it.', todo: 'Turn off the ones you don\'t recognise or need (in Startup, below). You can turn them back on any time.' });

  // ── the network ──
  const n = v.network;
  if (n) {
    if (n.loss >= 100) add({ id: 'offline', area: 'network', level: 'fix', title: 'Your Mac can\'t reach the internet', why: n.connected ? 'It\'s connected to Wi-Fi, but nothing comes back from the internet. The network itself may be down, or need you to sign in.' : 'It isn\'t connected to Wi-Fi.', todo: n.connected ? 'Try turning Wi-Fi off and on. If other devices can\'t connect either, it\'s the network.' : 'Pick a network in Wi-Fi settings.', fix: { label: 'Open Wi-Fi settings', action: 'settings', arg: 'wifi' } });
    else if (n.signal != null && n.signal < -75) add({ id: 'wifi-weak', area: 'network', level: 'watch', title: `The Wi-Fi signal is weak (${n.signal} dBm)`, why: 'A weak signal makes pages load slowly and calls break up. Walls and distance from the router weaken it.', todo: 'Move closer to the router, or away from thick walls.' });
    else if (n.ping != null && n.ping > 150) add({ id: 'slow-net', area: 'network', level: 'watch', title: `The internet is slow to answer (${n.ping} ms)`, why: 'Each request takes a while to come back, so pages feel sluggish.', todo: 'Busy networks (school, a café) are often like this. Moving closer to the router can help.' });
    else if (n.ping != null) add({ id: 'net-ok', area: 'network', level: 'good', title: `The internet is answering quickly (${n.ping} ms)`, why: n.signal != null ? `Wi-Fi signal ${n.signal} dBm: ${n.signal > -60 ? 'strong' : 'fine'}.` : 'All good.' });
  }

  const order = { fix: 0, watch: 1, good: 2 };
  const area = { memory: 0, heat: 1, storage: 2, energy: 3, battery: 4, system: 5, network: 6, startup: 7 };
  F.sort((a, b) => order[a.level] - order[b.level] || (area[a.area] ?? 9) - (area[b.area] ?? 9));
  return { findings: F, verdict: verdict(F, v), score: score(F) };
}

/** One or two sentences: the gist. */
function verdict(F, v) {
  const fix = F.filter((f) => f.level === 'fix');
  const watch = F.filter((f) => f.level === 'watch');
  const lower = (s) => (/^(The|Your|It's|Disk|Plenty|Restarted|Some|A|An)\b/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s);
  if (!fix.length && !watch.length) return 'Your Mac is healthy. Nothing needs fixing.';
  if (!fix.length) return `Your Mac is doing fine. ${watch.length === 1 ? 'One thing' : watch.length + ' things'} to keep an eye on: ${lower(watch[0].title)}.`;
  if (fix.length === 1) return `One thing needs attention: ${lower(fix[0].title)}.`;
  return `${fix.length} things need attention. The biggest: ${lower(fix[0].title)}. After that: ${lower(fix[1].title)}.`;
}

function score(F) {
  let s = 100;
  for (const f of F) s -= f.level === 'fix' ? 18 : f.level === 'watch' ? 6 : 0;
  return Math.max(5, s);
}

module.exports = { examine, verdict, score, gb, KEEP };
