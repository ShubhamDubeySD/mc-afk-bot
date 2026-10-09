const http = require('http')
const dns = require('dns')
const mineflayer = require('mineflayer')

const PORT = process.env.PORT || 3000
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' })
  res.end('Aternos AFK Bot 24/7 is Active!')
}).listen(PORT, () => {
  console.log(`Web server listening on port ${PORT}`)
})

process.on('uncaughtException', (err) => {
  console.log('Caught exception:', err.message)
})

let bot = null
let reconnectTimer = null

function connectBot() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }

  console.log('🔍 Aternos server dynamic IP & Port fetch ho raha hai...')

  // SRV Record se live port aur host resolve karein
  dns.resolveSrv('_minecraft._tcp.royalsmp13111.aternos.me', (err, addresses) => {
    let host = 'royalsmp13111.aternos.me'
    let port = 25565

    if (!err && addresses && addresses.length > 0) {
      host = addresses[0].name
      port = addresses[0].port
      console.log(`🎯 Resolved live server: ${host}:${port}`)
    } else {
      console.log('⚠️ SRV record fetch nahi hua, domain se direct koshish kar rahe hain...')
    }

    try {
      bot = mineflayer.createBot({
        host: host,
        port: port,
        username: 'Welcome',
        checkTimeoutInterval: 0
      })

      setupBotEvents(bot)
    } catch (e) {
      console.log('Bot creation error:', e.message)
      scheduleReconnect()
    }
  })
}

function setupBotEvents(botInstance) {
  let msgInterval = null
  let moveInterval = null
  let lookInterval = null

  botInstance.on('login', () => {
    console.log('✅ Bot login ho gaya!')
  })

  botInstance.on('spawn', () => {
    console.log('🔥 Bot spawn hua! Anti-AFK engine active.')

    // Welcome Message + /lagg gc
    msgInterval = setInterval(() => {
      try {
        botInstance.chat('Welcome everyone to the server! This server is created by Shubham2652!')
        setTimeout(() => {
          try { botInstance.chat('/lagg gc') } catch (e) {}
        }, 2000)
      } catch (err) {}
    }, 5 * 60 * 1000)

    // 6-Direction Anti-AFK
    let moveStep = 0
    moveInterval = setInterval(() => {
      try {
        botInstance.clearControlStates()
        switch(moveStep) {
          case 0:
            botInstance.setControlState('forward', true)
            botInstance.setControlState('sprint', true)
            botInstance.setControlState('jump', true)
            botInstance.swingArm('right')
            break
          case 1:
            botInstance.setControlState('back', true)
            botInstance.setControlState('sneak', true)
            break
          case 2:
            botInstance.setControlState('right', true)
            break
          case 3:
            botInstance.setControlState('left', true)
            break
          case 4:
            botInstance.setControlState('jump', true)
            botInstance.swingArm('right')
            break
          case 5:
            botInstance.setControlState('sneak', true)
            setTimeout(() => { try { botInstance.setControlState('sneak', false) } catch (e) {} }, 400)
            break
        }
        moveStep = (moveStep + 1) % 6
      } catch (e) {}
    }, 2500)

    // Look at players
    lookInterval = setInterval(() => {
      try {
        const player = botInstance.nearestEntity(e => e.type === 'player' && e.username !== botInstance.username)
        if (player) botInstance.lookAt(player.position.offset(0, player.height, 0))
      } catch (e) {}
    }, 3000)
  })

  function cleanup() {
    clearInterval(msgInterval)
    clearInterval(moveInterval)
    clearInterval(lookInterval)
    scheduleReconnect()
  }

  botInstance.on('kicked', (reason) => console.log('Kick reason:', reason))
  botInstance.on('error', (err) => console.log('Error:', err.message))
  botInstance.on('end', () => {
    console.log('🔌 Disconnected.')
    cleanup()
  })
}

function scheduleReconnect() {
  if (!reconnectTimer) {
    console.log('⏳ 15 sec me reconnect try karega...')
    reconnectTimer = setTimeout(connectBot, 15000)
  }
}

connectBot()
