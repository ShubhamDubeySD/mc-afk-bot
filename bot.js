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

// Uncaught exceptions handle karein
process.on('uncaughtException', (err) => {
  console.log('Caught exception:', err.message)
})

let bot = null
let reconnectTimer = null

function createBot() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }

  console.log('⚡ Server se connect karne ki koshish...')

  // checkTimeoutInterval 0 karne se Aternos ka timeout issue solve ho jata hai
  bot = mineflayer.createBot({
    host: 'royalsmp13111.aternos.me',
    username: 'Welcome',
    checkTimeoutInterval: 0
  })

  let msgInterval = null
  let moveInterval = null
  let lookInterval = null

  bot.on('login', () => {
    console.log('✅ Bot login ho gaya!')
  })

  bot.on('spawn', () => {
    console.log('🔥 Bot game me spawn ho gaya! Anti-AFK & Commands active.')

    // Welcome Message + /lagg gc (Har 5 Minute me)
    msgInterval = setInterval(() => {
      try {
        bot.chat('Welcome everyone to the server! This server is created by Shubham2652!')
        console.log('📢 Welcome message sent!')

        setTimeout(() => {
          try {
            bot.chat('/lagg gc')
            console.log('🧹 /lagg gc command executed!')
          } catch (e) {}
        }, 2000)

      } catch (err) {
        console.log('Chat error:', err.message)
      }
    }, 5 * 60 * 1000)

    // 6-Direction Movement Engine
    let moveStep = 0
    moveInterval = setInterval(() => {
      try {
        bot.clearControlStates()

        switch(moveStep) {
          case 0:
            bot.look(0, 0, true)
            bot.setControlState('forward', true)
            bot.setControlState('sprint', true)
            bot.setControlState('jump', true)
            bot.swingArm('right')
            setTimeout(() => { try { bot.setControlState('sneak', true) } catch (e) {} }, 1200)
            break

          case 1:
            bot.look(0, 0, true)
            bot.setControlState('back', true)
            bot.setControlState('jump', true)
            bot.setControlState('sneak', true)
            setTimeout(() => { try { bot.setControlState('sneak', false) } catch (e) {} }, 800)
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
            if (bot.entity) {
              bot.look(bot.entity.yaw, -Math.PI / 2, true)
              bot.setControlState('jump', true)
              bot.swingArm('right')
            }
            break

          case 5:
            if (bot.entity) {
              bot.look(bot.entity.yaw, Math.PI / 2, true)
              bot.setControlState('sneak', true)
              setTimeout(() => { try { bot.setControlState('sneak', false) } catch (e) {} }, 250)
              setTimeout(() => { try { bot.setControlState('sneak', true) } catch (e) {} }, 500)
              setTimeout(() => { try { bot.setControlState('sneak', false) } catch (e) {} }, 750)
            }
            break
        }

        moveStep = (moveStep + 1) % 6
      } catch (e) {}
    }, 2600)

    // Player Look-At Engine
    lookInterval = setInterval(() => {
      try {
        const playerFilter = (entity) => entity.type === 'player' && entity.username !== bot.username
        const player = bot.nearestEntity(playerFilter)
        if (player) {
          bot.lookAt(player.position.offset(0, player.height, 0))
        }
      } catch (e) {}
    }, 3000)
  })

  function cleanupAndReconnect() {
    clearInterval(msgInterval)
    clearInterval(moveInterval)
    clearInterval(lookInterval)

    if (!reconnectTimer) {
      console.log('🔄 10 sec me bot dobara connect karega...')
      reconnectTimer = setTimeout(createBot, 10000)
    }
  }

  bot.on('kicked', (reason) => {
    console.log('⚠️ Server kick:', reason)
  })

  bot.on('error', (err) => {
    console.log('❌ Connection error:', err.message)
  })

  bot.on('end', () => {
    console.log('🔌 Disconnect hua.')
    cleanupAndReconnect()
  })
}

createBot()
