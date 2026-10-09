'use strict';

const mineflayer = require('mineflayer');
const { Movements, pathfinder, goals } = require('mineflayer-pathfinder');
const { GoalBlock } = goals;
const config = require('./settings.json');
const express = require('express');
const http = require('http');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 5000;

let bot = null;
let activeIntervals = [];
let reconnectTimeoutId = null;
let connectionTimeoutId = null;
let isReconnecting = false;

let botState = {
  connected: false,
  lastActivity: Date.now(),
  reconnectAttempts: 0,
  startTime: Date.now(),
  errors: [],
  wasThrottled: false
};

function formatUptime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}h ${m}m ${s}s`;
}

function pushError(entry) {
  botState.errors.push(entry);
  if (botState.errors.length > 100) {
    botState.errors = botState.errors.slice(-50);
  }
}

app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <title>${config.name} Dashboard</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { font-family: sans-serif; background: #0f172a; color: #f8fafc; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; }
          .container { background: #111827; padding: 2rem; border-radius: 1rem; width: 360px; text-align: center; }
          .card { background: #1f2937; border-radius: 0.5rem; padding: 1rem; margin-bottom: 1rem; text-align: left; }
          .val { font-size: 1.2rem; font-weight: bold; color: #2dd4bf; }
        </style>
      </head>
      <body>
        <div class="container">
          <h2>${config.name}</h2>
          <div class="card"><div>Status</div><div class="val" id="st">Loading...</div></div>
          <div class="card"><div>Uptime</div><div class="val" id="up">0s</div></div>
          <div class="card"><div>Server</div><div class="val" style="font-size:1rem;">${config.server.ip}</div></div>
        </div>
        <script>
          async function update() {
            try {
              const r = await fetch('/health');
              const d = await r.json();
              document.getElementById('st').innerText = d.status;
              document.getElementById('up').innerText = d.uptime + 's';
            } catch(e) {}
          }
          setInterval(update, 5000); update();
        </script>
      </body>
    </html>
  `);
});

app.get('/health', (req, res) => {
  res.json({
    status: botState.connected ? 'connected' : 'disconnected',
    uptime: Math.floor((Date.now() - botState.startTime) / 1000),
    coords: (bot && bot.entity) ? bot.entity.position : null,
    lastActivity: botState.lastActivity,
    reconnectAttempts: botState.reconnectAttempts,
    memoryUsage: process.memoryUsage().heapUsed / 1024 / 1024
  });
});

app.get('/ping', (req, res) => res.send('pong'));

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Server] HTTP server started on port ${server.address().port}`);
});

function clearBotTimeouts() {
  if (reconnectTimeoutId) { clearTimeout(reconnectTimeoutId); reconnectTimeoutId = null; }
  if (connectionTimeoutId) { clearTimeout(connectionTimeoutId); connectionTimeoutId = null; }
}

function clearAllIntervals() {
  activeIntervals.forEach(id => clearInterval(id));
  activeIntervals = [];
}

function addInterval(callback, delay) {
  const id = setInterval(callback, delay);
  activeIntervals.push(id);
  return id;
}

function getReconnectDelay() {
  const baseDelay = config.utils['auto-reconnect-delay'] || 5000;
  return baseDelay;
}

function createBot() {
  if (isReconnecting) return;

  if (bot) {
    clearAllIntervals();
    try { bot.removeAllListeners(); bot.end(); } catch (e) {}
    bot = null;
  }

  console.log(`[Bot] Connecting to ${config.server.ip}:${config.server.port}`);

  try {
    const botVersion = config.server.version && config.server.version.trim() !== '' ? config.server.version : false;

    bot = mineflayer.createBot({
      username: config['bot-account'].username,
      host: config.server.ip,
      port: config.server.port,
      version: botVersion,
      hideErrors: false,
      checkTimeoutInterval: 0
    });

    bot.loadPlugin(pathfinder);

    clearBotTimeouts();
    connectionTimeoutId = setTimeout(() => {
      if (!botState.connected) {
        console.log('[Bot] Connection timeout - no spawn received');
        try { bot.removeAllListeners(); bot.end(); } catch (e) {}
        bot = null;
        scheduleReconnect();
      }
    }, 120000);

    let spawnHandled = false;

    bot.once('spawn', () => {
      if (spawnHandled) return;
      spawnHandled = true;

      clearBotTimeouts();
      botState.connected = true;
      botState.lastActivity = Date.now();
      botState.reconnectAttempts = 0;
      isReconnecting = false;

      console.log(`[Bot] Spawned on server (version: ${bot.version})`);

      const mcData = require('minecraft-data')(bot.version);
      const defaultMove = new Movements(bot, mcData);
      defaultMove.allowFreeMotion = false;
      defaultMove.canDig = false;

      initializeModules(bot, mcData, defaultMove);
    });

    bot.on('kicked', (reason) => {
      console.log(`[Bot] Kicked: ${JSON.stringify(reason)}`);
      botState.connected = false;
      clearAllIntervals();
    });

    bot.on('end', (reason) => {
      console.log(`[Bot] Disconnected: ${reason || 'Unknown'}`);
      botState.connected = false;
      clearAllIntervals();
      spawnHandled = false;
      scheduleReconnect();
    });

    bot.on('error', (err) => {
      console.log(`[Bot] Error: ${err.message}`);
    });

  } catch (err) {
    console.log(`[Bot] Failed to create bot: ${err.message}`);
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  clearBotTimeouts();

  if (isReconnecting) return;
  isReconnecting = true;
  botState.reconnectAttempts++;

  const delay = getReconnectDelay();
  console.log(`[Bot] Reconnecting in ${delay / 1000}s`);

  reconnectTimeoutId = setTimeout(() => {
    reconnectTimeoutId = null;
    isReconnecting = false;
    createBot();
  }, delay);
}

function initializeModules(bot, mcData, defaultMove) {
  console.log('[Modules] Initializing...');

  // Welcome message + /lagg gc har 5 minute me
  if (config.utils['chat-messages']?.enabled) {
    const messages = config.utils['chat-messages'].messages;
    let i = 0;
    addInterval(() => {
      if (bot && botState.connected) {
        bot.chat(messages[i]);
        console.log(`[Chat] Sent: ${messages[i]}`);

        setTimeout(() => {
          if (bot && botState.connected) {
            bot.chat('/lagg gc');
            console.log('[Command] /lagg gc executed!');
          }
        }, 2000);

        i = (i + 1) % messages.length;
      }
    }, config.utils['chat-messages']['repeat-delay'] * 1000);
  }

  // Anti-AFK engine (actions)
  if (config.utils['anti-afk']?.enabled) {
    addInterval(() => {
      if (!bot || !botState.connected) return;
      try { bot.swingArm(); } catch (e) {}
    }, 15000);

    if (config.utils['anti-afk'].sneak) {
      try { bot.setControlState('sneak', true); } catch (e) {}
    }
  }

  // Random jump & look around
  if (config.movement?.['random-jump']?.enabled) {
    addInterval(() => {
      if (!bot || !botState.connected) return;
      try {
        bot.setControlState('jump', true);
        setTimeout(() => { if (bot) bot.setControlState('jump', false); }, 300);
      } catch (e) {}
    }, config.movement['random-jump'].interval);
  }

  if (config.movement?.['look-around']?.enabled) {
    addInterval(() => {
      if (!bot || !botState.connected) return;
      try {
        const yaw = (Math.random() * Math.PI * 2) - Math.PI;
        const pitch = (Math.random() * Math.PI / 2) - Math.PI / 4;
        bot.look(yaw, pitch, false);
      } catch (e) {}
    }, config.movement['look-around'].interval);
  }

  console.log('[Modules] All modules initialized.');
}

process.on('uncaughtException', (err) => {
  console.log(`[FATAL] Uncaught Exception: ${err.message}`);
  clearAllIntervals();
  botState.connected = false;
  setTimeout(() => scheduleReconnect(), 10000);
});

createBot();
            
