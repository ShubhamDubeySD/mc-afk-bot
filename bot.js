const http = require('http')
const mineflayer = require('mineflayer')

// Web Server for Render
const PORT = process.env.PORT || 3000
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' })
  res.end('Aternos AFK Bot 24/7 is Active!')
}).listen(PORT, () => {
  console.log(`Web server listening on port ${PORT}`)
})

// Unhandled error se bot band na ho
process.on('uncaughtException', (err) => {
  console.log('Caught exception:', err.message)
})

function createBot() {
  console.log('⚡ Server se connect karne ki koshish...')

  // Termux wala logic: No dynamic port! Minecraft SRV record khud handle karega.
  const bot = mineflayer.createBot({
    host: 'royalsmp13111.aternos.me',
    username: 'Welcome',
    checkTimeoutInterval: 60000
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

        setTimeout(() => {
          bot.chat('/lagg gc')
          console.log('🧹 /lagg gc command executed!')
        }, 2000)

      } catch (err) {
        console.log('Chat error:', err.message)
      }
    }, 5 * 60 * 1000)

    // 6-Direction Movement Engine
    let moveStep = 0
    setInterval(() => {
      bot.clearControlStates()

      switch(moveStep) {
        case 0:
          bot.look(0, 0, true)
          bot.setControlState('forward', true)
          bot.setControlState('sprint', true)
          bot.setControlState('jump', true)
          bot.swingArm('right')
          setTimeout(() => bot.setControlState('sneak', true), 1200)
          break

        case 1:
          bot.look(0, 0, true)
          bot.setControlState('back', true)
          bot.setControlState('jump', true)
          bot.setControlState('sneak', true)
          setTimeout(() => bot.setControlState('sneak', false), 800)
          break

        case 2:
          bot.look(Math.PI / 2, 0, true)
          bot.setControlState('right', true)
          bot.setControlState('sprint', true)
          bot.setControlState('jump', true)
          break

        case 3:
          bot.look(-Math.PI / 2, 0, true)
          bot.setControlState('left', true)
          bot.setControlState('jump', true)
          bot.setControlState('sneak', true)
          break

        case 4:
          bot.look(bot.entity.yaw, -Math.PI / 2, true)
          bot.setControlState('jump', true)
          bot.swingArm('right')
          break

        case 5:
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

  bot.on('kicked', (reason) => {
    console.log('⚠️ Server kick:', reason)
  })

  bot.on('error', (err) => {
    console.log('❌ Connection error:', err.message)
  })

  bot.on('end', () => {
    console.log('🔄 Disconnect hua. Theek 10 sec me dobara connect karega...')
    setTimeout(createBot, 10000)
  })
}

createBot()
