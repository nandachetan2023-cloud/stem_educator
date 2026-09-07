# StemEducatorApp Hardware Agent

If you're using the **cloud-hosted** version of the app (e.g. Render), the server has no USB ports at all - it physically cannot reach an Arduino plugged into your computer. This small local agent bridges that gap: it runs on your PC, has real USB access, and the web app automatically detects and uses it whenever it's running.

You do **not** need this if you're using the full local install (`start.bat` on this same PC) - that version already has direct hardware access built in.

## Setup (one time)

1. Requires [Node.js](https://nodejs.org) 18 or newer - if you already have the main app's installer, you already have this.
2. Double-click **`start-agent.bat`**. First run installs a few small dependencies automatically.

## Using it

1. Plug in your Arduino/board.
2. Run **`start-agent.bat`** and leave the window open.
3. Open the web app in your browser as usual and use Connect / Board / Upload Code like normal - it'll automatically route hardware requests through this agent instead of the cloud server.

You'll know it's working if the agent window shows:
```
Hardware agent running on http://localhost:8899
arduino-cli: found
```

If it says `arduino-cli: NOT FOUND`, firmware compile/upload won't work until `tools/arduino-cli/` is present next to this folder (same as the full offline installer ships).

## What this does and doesn't do

- Only handles the hardware-specific parts (listing serial ports, connecting, compiling, and flashing firmware).
- Everything else - your account, projects, tenants/billing if you're an admin - still goes through the cloud app normally.
- It only ever listens on `localhost` and only does anything when the web page you're actively using asks it to.
