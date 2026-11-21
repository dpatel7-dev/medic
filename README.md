# medic

```
  [Lotl]  medic  v1.0.0

          A checkup for your Mac.
          Why it's slow, hot or low on battery,
          in plain words.
```

**medic tells you why your Mac is slow, hot or running out of battery, in plain words, and fixes
what it safely can.** No charts you have to decode: "Your Mac is short on memory. Chrome is using
3.4 GB of it." and a button that quits Chrome (it asks you to save first).

Lotl the axolotl does the checking. Axolotls are famous for healing themselves.

It needs no administrator, changes nothing unless you press a button, and nothing leaves your computer.

## Get it

With [pca](https://github.com/dpatel7-dev/Project-CLI-Access): open pca, pick **medic**, press **I**. Or:

```sh
curl -fsSL https://djp7.pythonanywhere.com/medic/install.sh | sh
```

## Using it

| To | Do this |
| --- | --- |
| A quick checkup | `medic`. Type a number to do one of the fixes it suggests, or press Enter for the window. |
| The full checkup | `medic check` (adds Apple's own battery figures, Wi-Fi and how fast the internet answers) |
| medic's window | `medic app`: everything at once, with buttons for the fixes, a pond at the bottom |
| The battery | `medic battery`: charge, health (how much it holds compared to new), charge cycles, temperature |
| What's using the power | `medic hogs`, then `medic quit "Google Chrome"` |
| What starts by itself | `medic startup`, then `medic startup off 2` (and `on 2` to undo) |
| Find out what drains the battery | `medic diary on`, use your Mac on battery for a while, then `medic diary` (or the window) |

### What it looks at

- **Memory**: the most common reason a Mac feels slow. medic says when macOS is squeezing apps and
  using the disk as extra memory, and which apps are using the most.
- **Heat**: when the Mac slows itself down to cool off, and what's making it hot.
- **What's working hard**: apps using a lot of the processor, and what's keeping your Mac awake
  (a video, a call, a stuck tab).
- **The battery**: its health, cycles and temperature. If macOS says it needs service, medic says so too.
- **Storage**: when the disk is getting full. *Find what's taking space* opens
  [roomy](https://github.com/dpatel7-dev/roomy) if you have it.
- **Restarts**: how long since the last one. Often the simplest fix there is.
- **The internet**: is it reachable, how quickly it answers, how strong the Wi-Fi is.
- **What starts by itself**: the background helpers that start when you log in.

### The fixes (all safe)

- **Quit an app**: exactly like choosing Quit yourself, so it asks you to save first. medic never
  quits parts of macOS (Finder, the Dock and so on).
- **Turn off something that starts by itself**: only your own ones, never ones set up for everyone
  on the Mac. They're put aside in `~/.medic/turned-off`, not deleted, and come back with one click.
- **Open the right page of System Settings** (Battery, Storage, Wi-Fi).
- **Open roomy** to find what's taking disk space.

### The battery diary

`medic diary on` takes a note every five minutes: the charge, and while you're unplugged, which
apps are using the most power (from macOS's own energy figures). After a few hours on battery,
`medic diary` (or the window) tells you how fast it drains, how long a full charge would last at
that rate, and what's draining it. The notes stay in `~/.medic/diary.jsonl` for two weeks.
`medic diary off` stops it.

### On a school Mac

medic only reads things any user can read, and its fixes only touch your own things, so it works
on a managed Mac without an administrator. It never changes the Mac's settings.

## Uninstall

```sh
medic uninstall
```

## How it works

Plain Node.js (18 or newer), no dependencies. It asks macOS the same questions Activity Monitor and
System Information do (`pmset`, `ioreg`, `ps`, `vm_stat`, `system_profiler` and friends) and turns the
answers into sentences. The window is a small web page served to this computer only (127.0.0.1,
behind a secret), and it closes itself a couple of minutes after you close the window.

`npm test` runs the tests against real macOS output saved in `test/fixtures`.

MIT licence.
