'use strict';

const dns = require('dns');
const mineflayer = require('mineflayer');
const { Movements, pathfinder, goals } = require('mineflayer-pathfinder');
const { GoalBlock } = goals;
const config = require('./settings.json');
const express = require('express');

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
  startTime: Date.now()
};

function formatUptime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}h ${m}m ${s}s`;
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
    reconnectAttempts: botState.reconnectAttempts
  });
});

app.get('/ping', (req, res) => res.send('pong'));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Server] HTTP server started on port ${PORT}`);
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

function createBot() {
  if (isReconnecting) return;

  if (bot) {
    clearAllIntervals();
    try { bot.removeAllListeners(); bot.end(); } catch (e) {}
    bot = null;
  }

  const srvHost = `_minecraft._tcp.${config.server.ip}`;
  console.log(`[DNS] Resolving SRV records for ${srvHost}...`);

  dns.resolveSrv(srvHost, (err, addresses) => {
    let host = config.server.ip;
    let port = config.server.port || 25565;

    if (!err && addresses && addresses.length > 0) {
      host = addresses[0].name;
      port = addresses[0].port;
      console.log(`[DNS] Found live backend: ${host}:${port}`);
    } else {
      console.log(`[DNS] SRV not found, trying direct: ${host}:${port}`);
    }

    try {
      bot = mineflayer.createBot({
        username: config['bot-account'].username,
        host: host,
        port: port,
        hideErrors: false,
        checkTimeoutInterval: 60000
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
      }, 60000);

      bot.once('spawn', () => {
        clearBotTimeouts();
        botState.connected = true;
        botState.lastActivity = Date.now();
        botState.reconnectAttempts = 0;
        isReconnecting = false;

        console.log(`[Bot] Spawned on server! Bot username: ${bot.username}`);

        const mcData = require('minecraft-data')(bot.version);
        const defaultMove = new Movements(bot, mcData);
        defaultMove.allowFreeMotion = false;
        defaultMove.canDig = false;

        initializeModules(bot);
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
        scheduleReconnect();
      });

      bot.on('error', (err) => {
        console.log(`[Bot] Error: ${err.message}`);
      });

    } catch (err) {
      console.log(`[Bot] Failed to create bot: ${err.message}`);
      scheduleReconnect();
    }
  });
}

function scheduleReconnect() {
  clearBotTimeouts();

  if (isReconnecting) return;
  isReconnecting = true;
  botState.reconnectAttempts++;

  console.log('[Bot] Reconnecting in 10s...');
  reconnectTimeoutId = setTimeout(() => {
    reconnectTimeoutId = null;
    isReconnecting = false;
    createBot();
  }, 10000);
}

function initializeModules(bot) {
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
    }, (config.utils['chat-messages']['repeat-delay'] || 300) * 1000);
  }

  // Anti-AFK
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
    }, config.movement['random-jump'].interval || 8000);
  }

  if (config.movement?.['look-around']?.enabled) {
    addInterval(() => {
      if (!bot || !botState.connected) return;
      try {
        const yaw = (Math.random() * Math.PI * 2) - Math.PI;
        const pitch = (Math.random() * Math.PI / 2) - Math.PI / 4;
        bot.look(yaw, pitch, false);
      } catch (e) {}
    }, config.movement['look-around'].interval || 4000);
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
