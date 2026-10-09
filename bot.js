const mineflayer = require('mineflayer')

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
    console.log('🔥 Bot game ke andar spawn ho gaya! Extreme Anti-AFK Active.')

    // 1. Welcome Message Har 5 Minute me
    setInterval(() => {
      try {
        bot.chat('Welcome everyone to the server! This server is created by Shubham2652!')
        console.log('📢 5-Min Welcome message sent!')
      } catch (err) {
        console.log('Chat error:', err.message)
      }
    }, 5 * 60 * 1000)

    // 2. Extreme 6-Direction Movement Engine
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
          setTimeout(() => {
            bot.setControlState('sneak', true)
          }, 1200)
          break

        case 1: // Backward: Jump + Sneak reset
          bot.look(0, 0, true)
          bot.setControlState('back', true)
          bot.setControlState('jump', true)
          bot.setControlState('sneak', true)
          setTimeout(() => {
            bot.setControlState('sneak', false), 800)
          }, 800)
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

    // 3. Human Look-At Engine
    setInterval(() => {
      const playerFilter = (entity) => entity.type === 'player' && entity.username !== bot.username
      const player = bot.nearestEntity(playerFilter)
      if (player) {
        bot.lookAt(player.position.offset(0, player.height, 0))
      }
    }, 3000)
  })

  bot.on('kicked', (reason) => {
    console.log('⚠️ Server ne kick kiya:', reason)
  })

  bot.on('error', (err) => {
    console.log('❌ Error aaya:', err.message)
  })

  // 4. Exact 5 Second Reconnect Logic
  bot.on('end', () => {
    console.log('🔄 Disconnect hua. Theek 5 sec me reconnect kar raha hai...')
    setTimeout(createBot, 5000)
  })
}

createBot()
            
