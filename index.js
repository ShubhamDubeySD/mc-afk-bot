'use strict';

const dns = require('dns');
const mineflayer = require('mineflayer');
const { Movements, pathfinder } = require('mineflayer-pathfinder');
const config = require('./settings.json');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 10000;

let bot = null;
let activeIntervals = [];
let reconnectTimeoutId = null;
let connectWatchdogId = null;
let isReconnecting = false;

let botState = {
  connected: false,
  lastActivity: Date.now(),
  reconnectAttempts: 0,
  startTime: Date.now()
};

app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <title>${config.name || 'AFK Bot'} Dashboard</title>
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
          <h2>${config.name || 'AFK Bot'}</h2>
          <div class="card"><div>Status</div><div class="val" id="st">Loading...</div></div>
          <div class="card"><div>Uptime</div><div class="val" id="up">0s</div></div>
          <div class="card"><div>Server</div><div class="val" style="font-size:1rem;">${config.server?.ip || 'royalsmp13111.aternos.me'}</div></div>
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
  console.log(`[Server] Web server listening on port ${PORT}`);
});

function clearAllIntervals() {
  activeIntervals.forEach(id => clearInterval(id));
  activeIntervals = [];
}

function addInterval(callback, delay) {
  const id = setInterval(callback, delay);
  activeIntervals.push(id);
  return id;
}

function resolveServer(callback) {
  const rawHost = config.server?.ip || 'royalsmp13111.aternos.me';
  const cleanHost = rawHost.replace(/:\d+$/, '').trim().toLowerCase();
  const srvHost = `_minecraft._tcp.${cleanHost}`;
  console.log(`[DNS] Checking live SRV record for ${srvHost}...`);

  const resolver = new dns.Resolver();
  resolver.setServers(['8.8.8.8', '1.1.1.1']);

  resolver.resolveSrv(srvHost, (err, addresses) => {
    if (!err && addresses && addresses.length > 0) {
      const srvPort = addresses[0].port;
      console.log(`[DNS] Live resolved port via SRV: ${srvPort}`);
      callback(cleanHost, srvPort);
    } else {
      const fallbackPort = Number(config.server?.port) || 13111;
      console.log(`[DNS] Fallback port: ${fallbackPort}`);
      callback(cleanHost, fallbackPort);
    }
  });
}

function createBot() {
  if (isReconnecting) return;

  if (bot) {
    clearAllIntervals();
    try {
      bot.removeAllListeners();
      bot.end();
    } catch (e) {}
    bot = null;
  }

  resolveServer((domainHost, targetPort) => {
    const selectedVersion = '1.21.4';
    console.log(`[Bot] Connecting to ${domainHost}:${targetPort} (Version: ${selectedVersion})...`);

    try {
      bot = mineflayer.createBot({
        username: config['bot-account']?.username || 'Welcome',
        host: domainHost,
        port: targetPort,
        version: selectedVersion,
        auth: 'offline',
        viewDistance: 'tiny',
        hideErrors: false,
        connectTimeout: 30000,
        checkTimeoutInterval: 60000,
        keepAlive: true,
        closeTimeout: 60000,
        noPong: false
      });

      bot.loadPlugin(pathfinder);

      if (connectWatchdogId) clearTimeout(connectWatchdogId);
      connectWatchdogId = setTimeout(() => {
        if (!botState.connected) {
          console.log('[Bot] Handshake timeout. Retrying...');
          cleanupAndReconnect();
        }
      }, 35000);

      bot.once('login', () => {
        console.log('[Bot] Handshake verified, logged in successfully!');
      });

      bot.once('spawn', () => {
        if (connectWatchdogId) clearTimeout(connectWatchdogId);
        botState.connected = true;
        botState.lastActivity = Date.now();
        botState.reconnectAttempts = 0;
        isReconnecting = false;

        console.log(`[Bot] Spawned successfully as ${bot.username}!`);

        try {
          const mcData = require('minecraft-data')(bot.version);
          const defaultMove = new Movements(bot, mcData);
          defaultMove.allowFreeMotion = false;
          defaultMove.canDig = false;
        } catch (e) {}

        initializeModules(bot);
      });

      bot.on('kicked', (reason) => {
        console.log(`[Bot] Kicked: ${JSON.stringify(reason)}`);
        cleanupAndReconnect();
      });

      bot.on('end', (reason) => {
        console.log(`[Bot] Disconnected: ${reason || 'Unknown'}`);
        cleanupAndReconnect();
      });

      bot.on('error', (err) => {
        console.log(`[Bot] Error: ${err.message}`);
        cleanupAndReconnect();
      });

    } catch (err) {
      console.log(`[Bot] Init error: ${err.message}`);
      cleanupAndReconnect();
    }
  });
}

function cleanupAndReconnect() {
  if (connectWatchdogId) clearTimeout(connectWatchdogId);
  botState.connected = false;
  clearAllIntervals();

  if (bot) {
    try {
      bot.removeAllListeners();
      bot.end();
    } catch (e) {}
    bot = null;
  }

  scheduleReconnect();
}

function scheduleReconnect() {
  if (isReconnecting) return;
  isReconnecting = true;
  botState.reconnectAttempts++;

  if (reconnectTimeoutId) clearTimeout(reconnectTimeoutId);

  console.log('[Bot] Reconnecting in 15s...');
  reconnectTimeoutId = setTimeout(() => {
    reconnectTimeoutId = null;
    isReconnecting = false;
    createBot();
  }, 15000);
}

function initializeModules(bot) {
  addInterval(() => {
    if (bot && botState.connected) {
      try { bot.swingArm(); } catch (e) {}
    }
  }, 5000);

  if (config.utils && config.utils['chat-messages'] && config.utils['chat-messages'].enabled) {
    const messages = config.utils['chat-messages'].messages || [];
    let i = 0;
    if (messages.length > 0) {
      const chatDelay = (config.utils['chat-messages']['repeat-delay'] || 300) * 1000;
      addInterval(() => {
        if (bot && botState.connected) {
          bot.chat(messages[i]);
          console.log(`[Chat] Sent: ${messages[i]}`);

          setTimeout(() => {
            if (bot && botState.connected) {
              bot.chat('/lagg gc');
              console.log('[Command] Sent: /lagg gc');
            }
          }, 2000);

          i = (i + 1) % messages.length;
        }
      }, chatDelay);
    }
  }

  if (config.utils && config.utils['anti-afk'] && config.utils['anti-afk'].enabled && config.utils['anti-afk'].sneak) {
    try { bot.setControlState('sneak', true); } catch (e) {}
  }

  if (config.movement && config.movement['random-jump'] && config.movement['random-jump'].enabled) {
    const jumpInterval = config.movement['random-jump'].interval || 8000;
    addInterval(() => {
      if (!bot || !botState.connected) return;
      try {
        bot.setControlState('jump', true);
        setTimeout(() => { if (bot) bot.setControlState('jump', false); }, 300);
      } catch (e) {}
    }, jumpInterval);
  }

  if (config.movement && config.movement['look-around'] && config.movement['look-around'].enabled) {
    const lookInterval = config.movement['look-around'].interval || 4000;
    addInterval(() => {
      if (!bot || !botState.connected) return;
      try {
        const yaw = (Math.random() * Math.PI * 2) - Math.PI;
        const pitch = (Math.random() * Math.PI / 2) - Math.PI / 4;
        bot.look(yaw, pitch, false);
      } catch (e) {}
    }, lookInterval);
  }

  console.log('[Modules] All automation active.');
}

process.on('uncaughtException', (err) => {
  console.log(`[FATAL] Uncaught: ${err.message}`);
  cleanupAndReconnect();
});

createBot();
        
