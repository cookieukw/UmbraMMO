/**
 * UMBRA ONLINE - Mob Manager
 * Handles rendering and client-side mob display
 * Features: Directional sprites, breathing, walking, and attack animations
 */

const MobManager = (function() {
  // Mob data loaded from server
  let mobTypes = {};
  
  // Active mobs in current zone
  let mobs = new Map();
  
  // Tile size for positioning
  const TILE_SIZE = CONSTANTS.TILE_SIZE;
  
  // Mob sprite rendering
  // Sprites are 128x128 canvas, render at native size (mobs appear larger than players)
  // If you want mobs same size as player, use 64 instead of 128
  const MOB_SPRITE_SIZE = 128;  // Source sprite canvas size
  const MOB_RENDER_SIZE = 128;  // Render at native size
  
  // Animation timing
  let globalTime = 0;
  
  // Animation constants
  const BREATHING_SPEED = 2.5;      // Speed of breathing cycle
  const BREATHING_AMPLITUDE = 1.5;  // Pixels of vertical movement
  const BREATHING_SCALE = 0.02;     // Scale oscillation amount
  
  // Walk bob animation (matching player feel)
  const WALK_BOB_AMOUNT = 4;        // Maximum pixels to bob up/down (matching player)
  const WALK_BOB_SPEED = 6;         // Speed of walk bob cycle (time-based for mobs)
  const WALK_TILT_AMOUNT = 2;       // Degrees of tilt while walking (reduced)
  const WALK_SQUASH = 0.03;         // Amount of squash/stretch while walking (reduced)
  
  const ATTACK_DURATION = 300;      // ms for attack animation
  const ATTACK_LUNGE = 8;           // Pixels to lunge forward
  const ATTACK_SHAKE = 3;           // Shake intensity
  
  // Combat state
  let lastAttackTime = 0;
  const ATTACK_COOLDOWN = 500; // ms between attacks
  
  // Damage numbers to display
  let damageNumbers = [];
  
  // Sprite cache for loaded images
  const spriteCache = new Map();
  
  /**
   * Initialize mob manager
   */
  function init() {
    // Mob types will be loaded from server on zone entry
    console.log('[MobManager] Initialized with sprite animations');
  }
  
  /**
   * Set mob type definitions
   */
  function setMobTypes(types) {
    mobTypes = types || {};
    // Preload sprites
    for (const [typeId, mobType] of Object.entries(mobTypes)) {
      if (mobType.spriteUrl) {
        loadSprite(mobType.spriteUrl);
      }
    }
  }
  
  /**
   * Load a sprite image
   */
  function loadSprite(url) {
    if (spriteCache.has(url)) return spriteCache.get(url);
    
    const img = new Image();
    img.src = url;
    spriteCache.set(url, img);
    return img;
  }
  
  /**
   * Update mobs from server data
   */
  function updateMobs(mobData) {
    if (!Array.isArray(mobData)) return;
    
    // Get current combat mob ID to avoid overwriting HP during combat
    const combatMobId = typeof CombatManager !== 'undefined' ? CombatManager.getCombatMobId() : null;
    
    // Create a set of received mob IDs
    const receivedIds = new Set();
    
    mobData.forEach(data => {
      receivedIds.add(data.id);
      
      if (mobs.has(data.id)) {
        // Update existing mob
        const mob = mobs.get(data.id);
        
        // Track previous position for direction
        const prevX = mob.targetX;
        const prevY = mob.targetY;
        
        // Smooth movement - store target position
        mob.targetX = data.x;
        mob.targetY = data.y;
        
        // Update facing direction based on movement
        if (data.x !== prevX || data.y !== prevY) {
          mob.isMoving = true;
          mob.moveStartTime = globalTime;
          
          // Determine facing direction (left or right)
          if (data.x > prevX) {
            mob.facingRight = true;
          } else if (data.x < prevX) {
            mob.facingRight = false;
          }
        }
        
        // Don't overwrite HP if this mob is in combat (client has authoritative HP during combat)
        if (data.id !== combatMobId) {
          mob.hp = data.hp;
          mob.maxHp = data.maxHp;
        }
        
        mob.isDead = data.isDead || false;
      } else {
        // Create new mob
        const mobType = mobTypes[data.type] || {};
        const spriteUrl = mobType.spriteUrl || null;
        
        // Preload sprite if available
        if (spriteUrl && !spriteCache.has(spriteUrl)) {
          loadSprite(spriteUrl);
        }
        
        mobs.set(data.id, {
          id: data.id,
          type: data.type,
          name: mobType.name || data.type,
          x: data.x,
          y: data.y,
          targetX: data.x,
          targetY: data.y,
          hp: data.hp,
          maxHp: data.maxHp,
          sprite: mobType.sprite || '❓',
          spriteUrl: spriteUrl,
          color: mobType.color || '#ffffff',
          isDead: data.isDead || false,
          facingRight: true,        // Direction sprite faces
          isMoving: false,          // Is currently moving
          moveStartTime: 0,         // When movement started
          isAttacking: false,       // Is currently attacking
          attackStartTime: 0,       // When attack started
          breathOffset: Math.random() * Math.PI * 2  // Random offset for breathing
        });
      }
    });
    
    // Remove mobs that weren't in the update
    for (const [id] of mobs) {
      if (!receivedIds.has(id)) {
        mobs.delete(id);
      }
    }
  }
  
  /**
   * Clear all mobs (on zone change)
   */
  function clearMobs() {
    mobs.clear();
  }
  
  /**
   * Trigger attack animation for a mob
   */
  function triggerAttack(mobId) {
    const mob = mobs.get(mobId);
    if (mob) {
      mob.isAttacking = true;
      mob.attackStartTime = globalTime;
    }
  }
  
  /**
   * Update mob animations and smooth movement
   */
  function update(deltaTime) {
    globalTime += deltaTime;
    
    // Get combat mob to prevent movement interpolation during combat
    const combatMobId = typeof CombatManager !== 'undefined' ? CombatManager.getCombatMobId() : null;
    
    // Smooth mob movement (interpolate towards target)
    const lerpSpeed = 0.15;
    for (const [, mob] of mobs) {
      // Don't interpolate movement for mobs in combat - they should stay put
      if (mob.id === combatMobId) {
        mob.isMoving = false;
        continue;
      }
      
      const wasMoving = mob.isMoving;
      const dx = mob.targetX - mob.x;
      const dy = mob.targetY - mob.y;
      
      if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) {
        mob.x += dx * lerpSpeed;
        mob.y += dy * lerpSpeed;
        mob.isMoving = true;
        
        // Update facing based on movement direction
        if (Math.abs(dx) > 0.01) {
          mob.facingRight = dx > 0;
        }
        
        // Snap when close enough
        if (Math.abs(dx) < 0.05) mob.x = mob.targetX;
        if (Math.abs(dy) < 0.05) mob.y = mob.targetY;
      } else {
        mob.isMoving = false;
      }
      
      // Check if attack animation is done
      if (mob.isAttacking && globalTime - mob.attackStartTime > ATTACK_DURATION) {
        mob.isAttacking = false;
      }
    }
    
    // Update damage numbers
    updateDamageNumbers();
  }
  
  /**
   * Calculate animation transforms for a mob
   */
  function getAnimationTransforms(mob) {
    const transforms = {
      offsetX: 0,
      offsetY: 0,
      scaleX: 1,
      scaleY: 1,
      rotation: 0
    };
    
    const time = globalTime / 1000; // Convert to seconds
    
    if (mob.isAttacking) {
      // Attack animation: lunge forward + shake
      const attackProgress = (globalTime - mob.attackStartTime) / ATTACK_DURATION;
      
      if (attackProgress < 0.3) {
        // Wind up
        const windUp = attackProgress / 0.3;
        transforms.offsetX = (mob.facingRight ? -1 : 1) * ATTACK_LUNGE * 0.3 * windUp;
        transforms.scaleX = 1 + 0.1 * windUp;
        transforms.scaleY = 1 - 0.05 * windUp;
      } else if (attackProgress < 0.5) {
        // Lunge forward
        const lunge = (attackProgress - 0.3) / 0.2;
        transforms.offsetX = (mob.facingRight ? 1 : -1) * ATTACK_LUNGE * lunge;
        transforms.scaleX = 1.1 - 0.1 * lunge;
        transforms.scaleY = 0.95 + 0.05 * lunge;
      } else if (attackProgress < 0.7) {
        // Impact shake
        const shake = (attackProgress - 0.5) / 0.2;
        transforms.offsetX = (mob.facingRight ? 1 : -1) * ATTACK_LUNGE * (1 - shake * 0.5);
        transforms.offsetX += Math.sin(shake * Math.PI * 8) * ATTACK_SHAKE;
        transforms.offsetY = Math.cos(shake * Math.PI * 8) * ATTACK_SHAKE * 0.5;
      } else {
        // Return to normal
        const ret = (attackProgress - 0.7) / 0.3;
        transforms.offsetX = (mob.facingRight ? 1 : -1) * ATTACK_LUNGE * 0.5 * (1 - ret);
      }
    } else if (mob.isMoving) {
      // Walking animation: bob up and down + slight tilt (matching player bob feel)
      const walkCycle = time * WALK_BOB_SPEED;
      // Use absolute sine for bounce effect like player
      transforms.offsetY = -Math.abs(Math.sin(walkCycle)) * WALK_BOB_AMOUNT;
      transforms.rotation = Math.sin(walkCycle) * WALK_TILT_AMOUNT * (mob.facingRight ? 1 : -1);
      
      // Squash and stretch
      const squash = Math.sin(walkCycle * 2) * WALK_SQUASH;
      transforms.scaleX = 1 + squash;
      transforms.scaleY = 1 - squash;
    } else {
      // Idle - no animation, just stand still
      // (breathing animation removed as it looked like floating)
    }
    
    return transforms;
  }
  
  /**
   * Render all mobs
   */
  function render(ctx, cameraX, cameraY) {
    // Ensure full opacity at the start
    ctx.globalAlpha = 1.0;
    
    const combatMobId = typeof CombatManager !== 'undefined' ? CombatManager.getCombatMobId() : null;
    
    for (const [, mob] of mobs) {
      if (mob.isDead) continue;
      
      const screenX = (mob.x * TILE_SIZE) - cameraX;
      const screenY = (mob.y * TILE_SIZE) - cameraY;
      
      // Skip if off-screen
      if (screenX < -TILE_SIZE || screenX > ctx.canvas.width + TILE_SIZE ||
          screenY < -TILE_SIZE || screenY > ctx.canvas.height + TILE_SIZE) {
        continue;
      }
      
      const isInCombat = mob.id === combatMobId;
      
      // Get animation transforms
      const anim = getAnimationTransforms(mob);
      
      // Draw mob shadow (squash with animation)
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.beginPath();
      ctx.ellipse(
        screenX + TILE_SIZE / 2 + anim.offsetX * 0.3,
        screenY + TILE_SIZE - 6,
        (TILE_SIZE / 3) * anim.scaleX,
        TILE_SIZE / 6,
        0, 0, Math.PI * 2
      );
      ctx.fill();
      
      // Draw mob sprite with transforms
      ctx.save();
      ctx.globalAlpha = 1.0;
      
      // Move to sprite center
      const centerX = screenX + TILE_SIZE / 2 + anim.offsetX;
      const centerY = screenY + TILE_SIZE / 2 - 4 + anim.offsetY;
      
      ctx.translate(centerX, centerY);
      
      // Apply rotation
      ctx.rotate(anim.rotation * Math.PI / 180);
      
      // Apply scale (flip horizontally if facing left)
      const flipX = mob.facingRight ? 1 : -1;
      ctx.scale(flipX * anim.scaleX, anim.scaleY);
      
      // Apply drop shadow (30% opacity)
      ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetX = 4;
      ctx.shadowOffsetY = 4;
      
      // Try to draw sprite image, fall back to emoji
      const spriteImg = mob.spriteUrl ? spriteCache.get(mob.spriteUrl) : null;
      
      if (spriteImg && spriteImg.complete && spriteImg.naturalWidth > 0) {
        // Draw the sprite image centered (128x128 -> MOB_RENDER_SIZE)
        const halfSize = MOB_RENDER_SIZE / 2;
        
        // Draw 1px black outline by rendering the sprite offset in 4 directions
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        ctx.globalCompositeOperation = 'source-over';
        
        // Use filter for outline: 4 drop-shadows at 1px in each cardinal direction
        const savedFilter = ctx.filter;
        ctx.filter = 'brightness(0) drop-shadow(0px 0px 0px black)';
        ctx.drawImage(spriteImg, -halfSize - 1, -halfSize, MOB_RENDER_SIZE, MOB_RENDER_SIZE);
        ctx.drawImage(spriteImg, -halfSize + 1, -halfSize, MOB_RENDER_SIZE, MOB_RENDER_SIZE);
        ctx.drawImage(spriteImg, -halfSize, -halfSize - 1, MOB_RENDER_SIZE, MOB_RENDER_SIZE);
        ctx.drawImage(spriteImg, -halfSize, -halfSize + 1, MOB_RENDER_SIZE, MOB_RENDER_SIZE);
        ctx.filter = savedFilter || 'none';
        
        // Re-apply drop shadow for the main sprite
        ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
        ctx.shadowBlur = 8;
        ctx.shadowOffsetX = 4;
        ctx.shadowOffsetY = 4;
        
        // Draw the actual sprite on top
        ctx.drawImage(spriteImg, -halfSize, -halfSize, MOB_RENDER_SIZE, MOB_RENDER_SIZE);
      } else {
        // Fallback to emoji
        ctx.font = `${TILE_SIZE - 8}px Verdana`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(mob.sprite, 0, 0);
      }
      
      ctx.restore();
      
      // Draw HP bar (always show when in combat, or if not full health)
      if (mob.hp < mob.maxHp || isInCombat) {
        const barWidth = TILE_SIZE - 8;
        const barHeight = 4;
        const barX = screenX + 4;
        const barY = screenY - 8;
        
        // Background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(barX - 1, barY - 1, barWidth + 2, barHeight + 2);
        
        // Red background
        ctx.fillStyle = '#4a1a1a';
        ctx.fillRect(barX, barY, barWidth, barHeight);
        
        // Green fill
        const hpPercent = mob.hp / mob.maxHp;
        ctx.fillStyle = hpPercent > 0.5 ? '#3e8c3e' : hpPercent > 0.25 ? '#c1a13e' : '#c13e3e';
        ctx.fillRect(barX, barY, barWidth * hpPercent, barHeight);
      }
      
      // (Name rendering moved to renderNames for screen-space drawing)
    }
  }
  
  /**
   * Get mob at a specific tile position
   */
  function getMobAt(tileX, tileY) {
    for (const [, mob] of mobs) {
      if (mob.isDead) continue;
      if (Math.floor(mob.x) === tileX && Math.floor(mob.y) === tileY) {
        return mob;
      }
    }
    return null;
  }
  
  /**
   * Get mob by ID
   */
  function getMob(id) {
    return mobs.get(id);
  }
  
  /**
   * Update a specific mob's HP (for combat display)
   */
  function updateMobHp(mobId, hp, maxHp) {
    const mob = mobs.get(mobId);
    if (mob) {
      mob.hp = hp;
      if (maxHp !== undefined) {
        mob.maxHp = maxHp;
      }
    }
  }
  
  /**
   * Get all mobs
   */
  function getAllMobs() {
    return Array.from(mobs.values());
  }
  
  /**
   * Check if a tile has a mob
   */
  function hasMobAt(tileX, tileY) {
    return getMobAt(tileX, tileY) !== null;
  }
  
  /**
   * Get the nearest mob within attack range of player position
   */
  function getNearestMob(playerX, playerY, direction, maxRange = 1) {
    let nearestMob = null;
    let nearestDist = Infinity;
    
    // First check tile in front of player (based on direction)
    let checkX = playerX;
    let checkY = playerY;
    
    switch (direction) {
      case 'up': checkY -= 1; break;
      case 'down': checkY += 1; break;
      case 'left': checkX -= 1; break;
      case 'right': checkX += 1; break;
    }
    
    // Check mob in front first
    const mobInFront = getMobAt(checkX, checkY);
    if (mobInFront && !mobInFront.isDead) {
      return mobInFront;
    }
    
    // Check all mobs within range
    for (const [, mob] of mobs) {
      if (mob.isDead) continue;
      
      const dx = Math.abs(Math.floor(mob.x) - playerX);
      const dy = Math.abs(Math.floor(mob.y) - playerY);
      const dist = dx + dy; // Manhattan distance
      
      if (dist <= maxRange && dist < nearestDist) {
        nearestDist = dist;
        nearestMob = mob;
      }
    }
    
    return nearestMob;
  }
  
  /**
   * Try to attack a mob (client-side validation)
   */
  function tryAttack(playerX, playerY, direction) {
    const now = performance.now();
    
    // Check cooldown
    if (now - lastAttackTime < ATTACK_COOLDOWN) {
      return { success: false, reason: 'cooldown' };
    }
    
    // Find nearest mob
    const mob = getNearestMob(playerX, playerY, direction, 1);
    
    if (!mob) {
      return { success: false, reason: 'no_target' };
    }
    
    lastAttackTime = now;
    return { success: true, mobId: mob.id, mob: mob };
  }
  
  /**
   * Add a damage number to display
   */
  function addDamageNumber(x, y, damage, isCrit = false) {
    damageNumbers.push({
      x: x,
      y: y,
      damage: damage,
      isCrit: isCrit,
      startTime: performance.now(),
      duration: 1000
    });
  }
  
  /**
   * Show mob death effect
   */
  function showMobDeath(mobId, exp, gold) {
    const mob = mobs.get(mobId);
    if (mob) {
      // Add reward text
      const text = `+${exp} EXP, +${gold} Gold`;
      damageNumbers.push({
        x: mob.x,
        y: mob.y - 0.5,
        damage: text,
        isReward: true,
        startTime: performance.now(),
        duration: 1500
      });
    }
  }
  
  /**
   * Update damage numbers
   */
  function updateDamageNumbers() {
    const now = performance.now();
    damageNumbers = damageNumbers.filter(dn => {
      return now - dn.startTime < dn.duration;
    });
  }
  
  /**
   * Render all mob names in screen space (call AFTER ctx.restore so text is crisp)
   * @param {CanvasRenderingContext2D} ctx
   */
  function renderNames(ctx) {
    if (typeof Camera === 'undefined') return;
    
    const combatMobId = typeof CombatManager !== 'undefined' ? CombatManager.getCombatMobId() : null;
    
    for (const [, mob] of mobs) {
      if (mob.isDead) continue;
      
      const isInCombat = mob.id === combatMobId;
      const worldX = mob.x * TILE_SIZE + TILE_SIZE / 2;
      const worldY = mob.y * TILE_SIZE - 12;
      const screen = Camera.worldToScreen(worldX, worldY);
      
      ctx.font = 'bold 12px Verdana';
      ctx.fillStyle = isInCombat ? '#ff6666' : '#39FF14';
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 3;
      ctx.lineJoin = 'round';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      const displayName = isInCombat ? `⚔️ ${mob.name}` : mob.name;
      ctx.strokeText(displayName, screen.x, screen.y);
      ctx.fillText(displayName, screen.x, screen.y);
    }
  }

  /**
   * Render damage numbers
   */
  function renderDamageNumbers(ctx, cameraX, cameraY) {
    const now = performance.now();
    
    for (const dn of damageNumbers) {
      const progress = (now - dn.startTime) / dn.duration;
      const alpha = 1 - progress;
      const floatY = progress * 30; // Float upward
      
      const screenX = (dn.x * TILE_SIZE) - cameraX + TILE_SIZE / 2;
      const screenY = (dn.y * TILE_SIZE) - cameraY - floatY;
      
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      if (dn.isReward) {
        // Reward text (gold color)
        ctx.font = 'bold 12px Verdana';
        ctx.fillStyle = '#FFD700';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.strokeText(dn.damage, screenX, screenY);
        ctx.fillText(dn.damage, screenX, screenY);
      } else {
        // Damage number
        ctx.font = dn.isCrit ? 'bold 20px Verdana' : 'bold 14px Verdana';
        ctx.fillStyle = dn.isCrit ? '#FF4444' : '#FFFFFF';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 3;
        ctx.strokeText(dn.damage, screenX, screenY);
        ctx.fillText(dn.damage, screenX, screenY);
      }
      
      ctx.restore();
    }
  }
  
  // Public API
  return {
    init,
    setMobTypes,
    updateMobs,
    clearMobs,
    update,
    render,
    getMobAt,
    getMob,
    updateMobHp,
    getAllMobs,
    hasMobAt,
    getNearestMob,
    tryAttack,
    addDamageNumber,
    showMobDeath,
    renderNames,
    renderDamageNumbers
  };
})();

// Auto-initialize when loaded
if (typeof window !== 'undefined') {
  MobManager.init();
}
