const http = require('http')
const mineflayer = require('mineflayer')

// 1. Web Server (Render + UptimeRobot ke liye)
const PORT = process.env.PORT || 3000
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' })
  res.end('Aternos AFK Bot 24/7 is Active!')
}).listen(PORT, () => {
  console.log(`Web server listening on port ${PORT}`)
})

// 2. Minecraft Bot
function createBot() {
  console.log('⚡ Server se connect kar raha hai...')

  const bot = mineflayer.createBot({
    host: 'royalsmp13111.aternos.me',
    port: 13111,
    username: 'Welcome',
    checkTimeoutInterval: 60000,
    version: false
  })

  bot.on('login', () => {
    console.log('✅ Bot login ho gaya!')
  })

  bot.on('spawn', () => {
    console.log('🔥 Bot game me spawn ho gaya! Anti-AFK & Commands active.')

    // Welcome Message + /lagg gc (Har 5 Minute me)
    setInterval(() => {
      try {
        bot.chat('Welcome everyone to the server! This server is created by Shubham2652!')
        console.log('📢 Welcome message sent!')

        // Message ke 2 second baad /lagg gc command
        setTimeout(() => {
          bot.chat('/lagg gc')
          console.log('🧹 /lagg gc command executed!')
        }, 2000)

      } catch (err) {
        console.log('Chat/Command error:', err.message)
      }
    }, 5 * 60 * 1000)

    // 6-Direction Movement Engine (Survival/Adventure mode me)
    let moveStep = 0
    setInterval(() => {
      bot.clearControlStates()

      switch(moveStep) {
        case 0: // Forward: Sprint + Jump + Sneak
          bot.look(0, 0, true)
          bot.setControlState('forward', true)
          bot.setControlState('sprint', true)
          bot.setControlState('jump', true)
          bot.swingArm('right')
          setTimeout(() => bot.setControlState('sneak', true), 1200)
          break

        case 1: // Backward: Jump + Sneak reset
          bot.look(0, 0, true)
          bot.setControlState('back', true)
          bot.setControlState('jump', true)
          bot.setControlState('sneak', true)
          setTimeout(() => bot.setControlState('sneak', false), 800)
          break

        case 2: // Right: Strafe Sprint Jump
          bot.look(Math.PI / 2, 0, true)
          bot.setControlState('right', true)
          bot.setControlState('sprint', true)
          bot.setControlState('jump', true)
          break

        case 3: // Left: Strafe Jump + Crouch
          bot.look(-Math.PI / 2, 0, true)
          bot.setControlState('left', true)
          bot.setControlState('jump', true)
          bot.setControlState('sneak', true)
          break

        case 4: // Vertical UP: Sky look + Jump
          bot.look(bot.entity.yaw, -Math.PI / 2, true)
          bot.setControlState('jump', true)
          bot.swingArm('right')
          break

        case 5: // Vertical DOWN: Ground look + Sneak spam
          bot.look(bot.entity.yaw, Math.PI / 2, true)
          bot.setControlState('sneak', true)
          setTimeout(() => bot.setControlState('sneak', false), 250)
          setTimeout(() => bot.setControlState('sneak', true), 500)
          setTimeout(() => bot.setControlState('sneak', false), 750)
          break
      }

      moveStep = (moveStep + 1) % 6
    }, 2600)

    // Human Look-At Engine
    setInterval(() => {
      const playerFilter = (entity) => entity.type === 'player' && entity.username !== bot.username
      const player = bot.nearestEntity(playerFilter)
      if (player) {
        bot.lookAt(player.position.offset(0, player.height, 0))
      }
    }, 3000)
  })

  bot.on('kicked', (reason) => console.log('⚠️ Server kick:', reason))
  bot.on('error', (err) => console.log('❌ Error:', err.message))

  // Exact 5 Second Reconnect Logic
  bot.on('end', () => {
    console.log('🔄 Disconnect hua. Theek 5 sec me reconnect...')
    setTimeout(createBot, 5000)
  })
}

createBot()
