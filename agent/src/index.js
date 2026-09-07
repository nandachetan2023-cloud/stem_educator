/**
 * StemEducatorApp Hardware Agent
 *
 * A small local helper for the cloud-hosted app. The cloud backend (Render,
 * etc.) has no USB ports at all - this agent runs on the same PC as your
 * Arduino and exposes the same serial/compile/upload API on localhost, so
 * the web page can reach real hardware even though its own server can't.
 *
 * Reuses the exact same serial/compiler/firmware modules the full offline
 * installer uses - same code, same board support, just packaged standalone
 * with no database/accounts/tenant system attached.
 */

const express = require('express');
const cors = require('cors');

const SerialManager = require('../../backend/src/serial/SerialManager');
const ArduinoCompiler = require('../../backend/src/compiler/ArduinoCompiler');

const PORT = process.env.AGENT_PORT || 8899;

const logger = {
  info: (msg) => console.log('[agent] ' + msg),
  warn: (msg) => console.warn('[agent] ' + msg),
  error: (msg) => console.error('[agent] ' + msg)
};

const serialManager = new SerialManager(logger);
const arduinoCompiler = new ArduinoCompiler(logger);

const app = express();
app.use(express.json({limit: '5mb'}));

// Any site can reach this (it only ever runs on your own machine, and only
// does anything when you explicitly connect/upload from the page you're
// using) - but Chrome's Private Network Access policy additionally requires
// this preflight response before an HTTPS page may reach a localhost server
// at all, which already rules out silent access from a random tab.
app.use(cors({
  origin: true,
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  next();
});

app.get('/health', (req, res) => {
  res.json({ok: true, name: 'stemapp-hardware-agent', version: '1.0.0'});
});

app.get('/api/serial/ports', async (req, res) => {
  try {
    const ports = await serialManager.listPorts();
    res.json({ports});
  } catch (err) {
    res.status(500).json({error: err.message});
  }
});

app.get('/api/serial/current', (req, res) => {
  res.json({connections: serialManager.getConnections()});
});

app.post('/api/serial/connect', async (req, res) => {
  try {
    const {path: portPath, port, baudRate, boardType} = req.body || {};
    const target = portPath || port;
    if (!target) return res.status(400).json({error: 'path is required'});
    const device = await serialManager.connect(target, {baudRate: baudRate || 115200, boardType});
    res.json({success: true, device});
  } catch (err) {
    res.status(500).json({error: err.message});
  }
});

app.post('/api/serial/disconnect-all', async (req, res) => {
  try {
    await serialManager.disconnectAll();
    res.json({success: true, message: 'All serial connections closed'});
  } catch (err) {
    res.status(500).json({error: err.message});
  }
});

app.post('/api/serial/disconnect/:deviceId', async (req, res) => {
  try {
    await serialManager.disconnect(req.params.deviceId);
    res.json({success: true});
  } catch (err) {
    res.status(500).json({error: err.message});
  }
});

app.get('/api/compiler/status', (req, res) => {
  res.json({available: arduinoCompiler.isAvailable()});
});

// Serialize flash operations per port - concurrent uploads fight over the
// same COM port and all fail; second caller gets 409 instead of piling on.
const portLocks = new Map();
function lockPort(port) {
  if (portLocks.get(port)) return false;
  portLocks.set(port, true);
  return true;
}
function unlockPort(port) {
  portLocks.delete(port);
}
const dly = (ms) => new Promise((r) => setTimeout(r, ms));
async function resetBoard(port) {
  await serialManager.disconnectByPort(port).catch(() => {});
  await dly(300);
  await serialManager.resetToBootloader(port).catch(() => {});
  await dly(2500);
}
const normalizePort = (p) => (p || '').toUpperCase().replace(/^COM(\d+)$/, 'COM$1');

app.post('/api/compiler/compile-upload-cpp', async (req, res) => {
  try {
    if (!arduinoCompiler.isAvailable()) {
      return res.status(500).json({error: 'arduino-cli not available on this machine. Install it in tools/arduino-cli/'});
    }
    const {cppCode, port, board} = req.body || {};
    if (!cppCode) return res.status(400).json({error: 'No C++ code provided'});
    if (!port) return res.status(400).json({error: 'No port specified'});
    const normPort = normalizePort(port);
    if (!lockPort(normPort)) {
      return res.status(409).json({error: 'An upload on ' + normPort + ' is already running. Please wait for it to finish.'});
    }
    const fqbn = board || 'arduino:avr:uno';
    let compileResult, uploadResult;
    try {
      compileResult = arduinoCompiler.compile(cppCode, fqbn);
      await resetBoard(normPort);
      uploadResult = arduinoCompiler.upload(compileResult.hexPath, normPort, fqbn);
    } finally {
      unlockPort(normPort);
    }
    arduinoCompiler.cleanup(compileResult.sketchPath);
    res.json({success: true, compileOutput: compileResult.output, uploadOutput: uploadResult.output});
  } catch (err) {
    res.status(500).json({error: err.message});
  }
});

app.listen(PORT, '127.0.0.1', () => {
  logger.info('Hardware agent running on http://localhost:' + PORT);
  logger.info('Keep this window open while using hardware features on the web app.');
  logger.info('arduino-cli: ' + (arduinoCompiler.isAvailable() ? 'found' : 'NOT FOUND - firmware upload will not work'));
});
