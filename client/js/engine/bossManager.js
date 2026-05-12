/**
 * UMBRA ONLINE - Client Boss Manager
 * Handles rendering and client-side boss display/interaction
 * Features: Directional sprites, breathing, walking, and attack animations
 */

const BossManager = (function() {
  // Boss type definitions loaded from server
  let bossTypes = {};
  
  // Active bosses in current zone
  let bosses = new Map();
  
  // Boss cooldowns: Map<bossId, { name, cooldownEnd }>
  let bossCooldowns = new Map();
  
  // Tile size for positioning
  const TILE_SIZE = CONSTANTS.TILE_SIZE;
  
  // Boss sprite rendering
  // Sprites are 128x128 canvas, render at 1:1 scale
  const BOSS_SPRITE_SIZE = 128;   // Source sprite canvas size
  const BOSS_RENDER_SIZE = 128;   // Render at same size as source (1:1 scale)
  
  // Animation timing
  let globalTime = 0;
  
  // Animation constants (slightly different from mobs - bosses are larger/slower)
  const BREATHING_SPEED = 2.0;       // Slower breathing for bosses
  const BREATHING_AMPLITUDE = 2.0;   // Slightly more pronounced
  const BREATHING_SCALE = 0.025;     // Subtle scale for breathing
  
  // Walk bob animation (matching player feel but heavier for bosses)
  const WALK_BOB_AMOUNT = 5;         // Maximum pixels to bob (slightly more than player)
  const WALK_BOB_SPEED = 5;          // Slower walk for bosses (more menacing)
  const WALK_TILT_AMOUNT = 1.5;      // Less tilt (heavy creature)
  const WALK_SQUASH = 0.03;          // Squash/stretch while walking
  
  const ATTACK_DURATION = 400;       // Longer attack animation for bosses
  const ATTACK_LUNGE = 12;           // Further lunge
  const ATTACK_SHAKE = 4;            // More intense shake
  
  // Player level (for name coloring)
  let playerLevel = 1;
  
  // Damage numbers to display
  let damageNumbers = [];
  
  // Sprite cache for loaded images
  const spriteCache = new Map();
  
  /**
   * Initialize boss manager
   */
  function init() {
    // Boss manager ready
  }
  
  /**
   * Set boss type definitions
   */
  function setBossTypes(types) {
    bossTypes = types || {};
    // Preload sprites if they have URLs
    for (const [typeId, bossType] of Object.entries(bossTypes)) {
      if (bossType.spriteUrl) {
        loadSprite(bossType.spriteUrl);
      }
    }
  }
  
  /**
   * Load a sprite image
   */
  function loadSprite(url) {
    if (!url) return null;
    
    // Use URL as-is (matching mobManager approach)
    if (spriteCache.has(url)) return spriteCache.get(url);
    
    const img = new Image();
    img.onerror = () => {
      console.warn(`[BossManager] Failed to load sprite: ${url}`);
    };
    img.src = url;
    spriteCache.set(url, img);
    return img;
  }
  
  /**
   * Set player level for name coloring
   */
  function setPlayerLevel(level) {
    playerLevel = level || 1;
  }
  
  /**
   * Update bosses from server data
   */
  function updateBosses(bossData) {
    if (!Array.isArray(bossData)) return;
    
    // Create a set of received boss IDs
    const receivedIds = new Set();
    
    bossData.forEach(data => {
      receivedIds.add(data.id);
      
      if (bosses.has(data.id)) {
        // Update existing boss
        const boss = bosses.get(data.id);
        
        // Don't update position or HP if boss is frozen in combat
        if (!boss.inCombat) {
          // Track previous position for direction
          const prevX = boss.targetX;
          const prevY = boss.targetY;
          
          // Smooth movement - store target position
          boss.targetX = data.x;
          boss.targetY = data.y;
          
          // Update facing direction based on movement
          if (data.x !== prevX || data.y !== prevY) {
            boss.isMoving = true;
            boss.moveStartTime = globalTime;
            
            // Determine facing direction (left or right)
            if (data.x > prevX) {
              boss.facingRight = true;
            } else if (data.x < prevX) {
              boss.facingRight = false;
            }
          }
          
          // Only update HP from server sync when NOT in combat replay
          // (combat replay manages HP via updateBossHp)
          boss.hp = data.hp;
          boss.maxHp = data.maxHp;
        }
        boss.isAlive = data.isAlive;
      } else {
        // Create new boss
        const bossType = bossTypes[data.type] || {};
        const spriteUrl = bossType.spriteUrl || null;
        
        // Preload the sprite if not already cached
        if (spriteUrl) {
          loadSprite(spriteUrl);
        }
        
        bosses.set(data.id, {
          id: data.id,
          type: data.type,
          name: data.name || bossType.name || data.type,
          title: data.title || bossType.title || null,
          x: data.x,
          y: data.y,
          targetX: data.x,
          targetY: data.y,
          hp: data.hp,
          maxHp: data.maxHp,
          level: data.level || bossType.level || 1,
          sprite: bossType.sprite || '👑',
          spriteUrl: spriteUrl,
          color: bossType.color || '#FFD700',
          isAlive: data.isAlive !== false,
          facingRight: true,        // Direction sprite faces
          isMoving: false,          // Is currently moving
          moveStartTime: 0,         // When movement started
          isAttacking: false,       // Is currently attacking
          attackStartTime: 0,       // When attack started
          inCombat: false,          // Whether boss is frozen in combat
          breathOffset: Math.random() * Math.PI * 2  // Random offset for breathing
        });
      }
    });
    
    // Remove bosses that weren't in the update
    for (const [id] of bosses) {
      if (!receivedIds.has(id)) {
        bosses.delete(id);
        bossCooldowns.delete(id);
      }
    }
    
    // Update cooldown tracking from server data
    bossData.forEach(data => {
      if (data.onCooldown && data.cooldownRemaining > 0) {
        bossCooldowns.set(data.id, {
          name: data.name,
          cooldownEnd: Date.now() + data.cooldownRemaining
        });
      } else {
        bossCooldowns.delete(data.id);
      }
    });
  }
  
  /**
   * Clear all bosses (on zone change)
   */
  function clearBosses() {
    bosses.clear();
    bossCooldowns.clear();
  }
  
  /**
   * Trigger attack animation for a boss
   */
  function triggerAttack(bossId) {
    const boss = bosses.get(bossId);
    if (boss) {
      boss.isAttacking = true;
      boss.attackStartTime = globalTime;
    }
  }
  
  /**
   * Set boss combat state (freeze/unfreeze movement)
   */
  function setBossInCombat(bossId, inCombat) {
    const boss = bosses.get(bossId);
    if (boss) {
      boss.inCombat = inCombat;
      if (inCombat) {
        // Stop movement immediately when entering combat
        boss.isMoving = false;
        boss.targetX = boss.x;
        boss.targetY = boss.y;
      }
    }
  }
  
  /**
   * Get boss at tile position (for interaction)
   */
  function getBossAtTile(tileX, tileY) {
    for (const [id, boss] of bosses) {
      if (!boss.isAlive) continue;
      if (isBossOnCooldown(id)) continue;
      
      // Check if player is adjacent to boss
      const dx = Math.abs(boss.x - tileX);
      const dy = Math.abs(boss.y - tileY);
      
      if (dx <= 1 && dy <= 1 && (dx + dy <= 1)) {
        return boss;
      }
    }
    return null;
  }
  
  /**
   * Get adjacent boss (within 1 tile)
   */
  function getAdjacentBoss(playerX, playerY) {
    for (const [id, boss] of bosses) {
      if (!boss.isAlive) continue;
      if (isBossOnCooldown(id)) continue;
      
      const dx = Math.abs(boss.x - playerX);
      const dy = Math.abs(boss.y - playerY);
      
      // Adjacent = within 1 tile (including diagonals)
      if (dx <= 1 && dy <= 1 && !(dx === 0 && dy === 0)) {
        return boss;
      }
    }
    return null;
  }
  
  /**
   * Calculate animation transforms for a boss
   */
  function getAnimationTransforms(boss) {
    const transforms = {
      offsetX: 0,
      offsetY: 0,
      scaleX: 1,
      scaleY: 1,
      rotation: 0
    };
    
    const time = globalTime / 1000; // Convert to seconds
    
    if (boss.isAttacking) {
      // Attack animation: lunge forward + shake
      const attackProgress = (globalTime - boss.attackStartTime) / ATTACK_DURATION;
      
      if (attackProgress < 0.25) {
        // Wind up (bosses telegraph more)
        const windUp = attackProgress / 0.25;
        transforms.offsetX = (boss.facingRight ? -1 : 1) * ATTACK_LUNGE * 0.4 * windUp;
        transforms.scaleX = 1 + 0.12 * windUp;
        transforms.scaleY = 1 - 0.06 * windUp;
        transforms.rotation = (boss.facingRight ? -1 : 1) * 3 * windUp;
      } else if (attackProgress < 0.45) {
        // Lunge forward (powerful strike)
        const lunge = (attackProgress - 0.25) / 0.2;
        transforms.offsetX = (boss.facingRight ? 1 : -1) * ATTACK_LUNGE * lunge;
        transforms.scaleX = 1.12 - 0.12 * lunge;
        transforms.scaleY = 0.94 + 0.06 * lunge;
        transforms.rotation = (boss.facingRight ? 1 : -1) * 5 * (1 - lunge);
      } else if (attackProgress < 0.65) {
        // Impact shake (more intense for bosses)
        const shake = (attackProgress - 0.45) / 0.2;
        transforms.offsetX = (boss.facingRight ? 1 : -1) * ATTACK_LUNGE * (1 - shake * 0.5);
        transforms.offsetX += Math.sin(shake * Math.PI * 10) * ATTACK_SHAKE;
        transforms.offsetY = Math.cos(shake * Math.PI * 10) * ATTACK_SHAKE * 0.6;
        transforms.rotation = Math.sin(shake * Math.PI * 6) * 2;
      } else {
        // Return to normal
        const ret = (attackProgress - 0.65) / 0.35;
        transforms.offsetX = (boss.facingRight ? 1 : -1) * ATTACK_LUNGE * 0.5 * (1 - ret);
      }
    } else if (boss.isMoving) {
      // Walking animation: heavy bob up and down + slight tilt (matching player bob feel)
      const walkCycle = time * WALK_BOB_SPEED;
      // Use absolute sine for bounce effect like player
      transforms.offsetY = -Math.abs(Math.sin(walkCycle)) * WALK_BOB_AMOUNT;
      transforms.rotation = Math.sin(walkCycle) * WALK_TILT_AMOUNT * (boss.facingRight ? 1 : -1);
      
      // Squash and stretch
      const squash = Math.sin(walkCycle * 2) * WALK_SQUASH;
      transforms.scaleX = 1 + squash;
      transforms.scaleY = 1 - squash;
    } else {
      // Breathing animation: menacing slow breathing
      const breathCycle = time * BREATHING_SPEED + boss.breathOffset;
      transforms.offsetY = Math.sin(breathCycle) * BREATHING_AMPLITUDE;
      
      // Subtle scale for breathing
      const breathScale = Math.sin(breathCycle) * BREATHING_SCALE;
      transforms.scaleX = 1 + breathScale * 0.5;
      transforms.scaleY = 1 + breathScale;
    }
    
    return transforms;
  }
  
  /**
   * Update animation and smooth movement
   */
  function update(deltaTime) {
    globalTime += deltaTime;
    
    // Smooth movement for bosses
    const lerpSpeed = 0.1; // Slower than mobs for more menacing movement
    for (const [id, boss] of bosses) {
      // Skip movement if boss is frozen in combat
      if (boss.inCombat) {
        boss.isMoving = false;
        // Still update attack animation even when in combat
        if (boss.isAttacking && globalTime - boss.attackStartTime > ATTACK_DURATION) {
          boss.isAttacking = false;
        }
        continue;
      }
      
      const dx = boss.targetX - boss.x;
      const dy = boss.targetY - boss.y;
      
      if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) {
        boss.x += dx * lerpSpeed;
        boss.y += dy * lerpSpeed;
        boss.isMoving = true;
        
        // Update facing based on movement direction
        if (Math.abs(dx) > 0.01) {
          boss.facingRight = dx > 0;
        }
        
        // Snap when close enough
        if (Math.abs(dx) < 0.05) boss.x = boss.targetX;
        if (Math.abs(dy) < 0.05) boss.y = boss.targetY;
      } else {
        boss.isMoving = false;
      }
      
      // Check if attack animation is done
      if (boss.isAttacking && globalTime - boss.attackStartTime > ATTACK_DURATION) {
        boss.isAttacking = false;
      }
    }
    
    // Update damage numbers
    updateDamageNumbers();
  }
  
  /**
   * Render all bosses
   */
  function render(ctx, cameraX, cameraY) {
    // Ensure full opacity at the start
    ctx.globalAlpha = 1.0;
    
    for (const [id, boss] of bosses) {
      if (!boss.isAlive) continue;
      
      // Don't render bosses that are on cooldown for this player
      if (isBossOnCooldown(id)) continue;
      
      renderBoss(ctx, boss, cameraX, cameraY);
    }
  }
  
  /**
   * Render a single boss
   */
  function renderBoss(ctx, boss, cameraX, cameraY) {
    const screenX = (boss.x * TILE_SIZE) - cameraX;
    const screenY = (boss.y * TILE_SIZE) - cameraY;
    
    // Skip if off screen
    if (screenX < -TILE_SIZE * 2 || screenX > ctx.canvas.width + TILE_SIZE * 2 ||
        screenY < -TILE_SIZE * 2 || screenY > ctx.canvas.height + TILE_SIZE * 2) {
      return;
    }
    
    // Get animation transforms
    const anim = getAnimationTransforms(boss);
    
    // Draw boss shadow (larger, squashed with animation)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.beginPath();
    ctx.ellipse(
      screenX + TILE_SIZE / 2 + anim.offsetX * 0.3,
      screenY + TILE_SIZE - 4,
      (TILE_SIZE / 2) * anim.scaleX,
      TILE_SIZE / 5,
      0, 0, Math.PI * 2
    );
    ctx.fill();
    
    // Draw boss glow (subtle black drop shadow instead of colored glow)
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetX = 4;
    ctx.shadowOffsetY = 4;
    
    // Move to sprite center
    const centerX = screenX + TILE_SIZE / 2 + anim.offsetX;
    const centerY = screenY + TILE_SIZE / 2 - 8 + anim.offsetY;  // Offset up slightly for larger sprite
    
    ctx.translate(centerX, centerY);
    
    // Apply rotation
    ctx.rotate(anim.rotation * Math.PI / 180);
    
    // Apply scale (flip horizontally if facing left)
    const flipX = boss.facingRight ? 1 : -1;
    ctx.scale(flipX * anim.scaleX, anim.scaleY);
    
    // Try to draw sprite image, fall back to emoji
    // Use spriteUrl directly (matching mobManager approach)
    const spriteImg = boss.spriteUrl ? spriteCache.get(boss.spriteUrl) : null;
    
    if (spriteImg && spriteImg.complete && spriteImg.naturalWidth > 0) {
      // Draw the sprite image centered (128x128 source -> BOSS_RENDER_SIZE)
      const halfSize = BOSS_RENDER_SIZE / 2;
      
      // --- Black outline: draw sprite offset in 4 directions with brightness(0) ---
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
      
      const savedFilter = ctx.filter;
      ctx.filter = 'brightness(0)';
      ctx.drawImage(spriteImg, -halfSize - 1, -halfSize, BOSS_RENDER_SIZE, BOSS_RENDER_SIZE);
      ctx.drawImage(spriteImg, -halfSize + 1, -halfSize, BOSS_RENDER_SIZE, BOSS_RENDER_SIZE);
      ctx.drawImage(spriteImg, -halfSize, -halfSize - 1, BOSS_RENDER_SIZE, BOSS_RENDER_SIZE);
      ctx.drawImage(spriteImg, -halfSize, -halfSize + 1, BOSS_RENDER_SIZE, BOSS_RENDER_SIZE);
      ctx.filter = savedFilter || 'none';
      
      // Re-apply drop shadow for the main sprite
      ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetX = 4;
      ctx.shadowOffsetY = 4;
      
      // --- Draw the actual sprite on top ---
      ctx.drawImage(spriteImg, -halfSize, -halfSize, BOSS_RENDER_SIZE, BOSS_RENDER_SIZE);
    } else {
      // Fallback to emoji
      const spriteSize = TILE_SIZE * 1.2;
      ctx.font = `${spriteSize}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = boss.color || '#FFD700';
      ctx.fillText(boss.sprite || '👑', 0, 0);
    }
    
    ctx.restore();
    
    // (Name/title rendering moved to renderNames for screen-space drawing)
    
    // Draw HP bar
    const hpBarWidth = TILE_SIZE * 1.2;
    const hpBarHeight = 6;
    const hpBarX = screenX + (TILE_SIZE - hpBarWidth) / 2;
    const hpBarY = screenY + TILE_SIZE + 4;
    const hpPercent = boss.hp / boss.maxHp;
    
    // Background
    ctx.fillStyle = '#333';
    ctx.fillRect(hpBarX, hpBarY, hpBarWidth, hpBarHeight);
    
    // HP fill (gradient from green to red)
    let hpColor;
    if (hpPercent > 0.5) {
      hpColor = '#22CC22';
    } else if (hpPercent > 0.25) {
      hpColor = '#CCCC22';
    } else {
      hpColor = '#CC2222';
    }
    
    ctx.fillStyle = hpColor;
    ctx.fillRect(hpBarX, hpBarY, hpBarWidth * hpPercent, hpBarHeight);
    
    // Border
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.strokeRect(hpBarX, hpBarY, hpBarWidth, hpBarHeight);
    
    // (Level badge rendering moved to renderNames for screen-space drawing)
  }
  
  /**
   * Render all boss names in screen space (call AFTER ctx.restore)
   * @param {CanvasRenderingContext2D} ctx
   */
  function renderNames(ctx, playerX, playerY) {
    if (typeof Camera === 'undefined') return;
    
    for (const [id, boss] of bosses) {
      if (boss.isDead) continue;
      
      // Don't render names for bosses on cooldown
      if (isBossOnCooldown(id)) continue;
      
      // Check if player is adjacent to this boss
      const dx = Math.abs(boss.x - playerX);
      const dy = Math.abs(boss.y - playerY);
      const isAdjacent = dx <= 1 && dy <= 1 && !(dx === 0 && dy === 0);
      
      const nameText = boss.name + (isAdjacent ? ' [E]' : '');
      
      const worldNameCenterX = boss.x * TILE_SIZE + TILE_SIZE / 2;
      const worldNameY = boss.y * TILE_SIZE - 9;
      const screenName = Camera.worldToScreen(worldNameCenterX, worldNameY);
      
      ctx.font = 'bold 12px Verdana';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      
      // Draw black outline (stroke) for readability
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 3;
      ctx.lineJoin = 'round';
      ctx.strokeText(nameText, screenName.x, screenName.y);
      
      // Draw neon green fill
      ctx.fillStyle = '#39ff14';
      ctx.fillText(nameText, screenName.x, screenName.y);
    }
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
      duration: 1200  // Slightly longer for bosses
    });
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
   * Render damage numbers
   */
  function renderDamageNumbers(ctx, cameraX, cameraY) {
    const now = performance.now();
    
    for (const dn of damageNumbers) {
      const progress = (now - dn.startTime) / dn.duration;
      const alpha = 1 - progress;
      const floatY = progress * 40; // Float upward (more for bosses)
      
      const screenX = (dn.x * TILE_SIZE) - cameraX + TILE_SIZE / 2;
      const screenY = (dn.y * TILE_SIZE) - cameraY - floatY;
      
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      if (dn.isReward) {
        // Reward text (gold color, larger for boss rewards)
        ctx.font = 'bold 14px Verdana';
        ctx.fillStyle = '#FFD700';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 3;
        ctx.strokeText(dn.damage, screenX, screenY);
        ctx.fillText(dn.damage, screenX, screenY);
      } else {
        // Damage number (larger for bosses)
        ctx.font = dn.isCrit ? 'bold 24px Verdana' : 'bold 16px Verdana';
        ctx.fillStyle = dn.isCrit ? '#FF4444' : '#FFFFFF';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 3;
        ctx.strokeText(dn.damage, screenX, screenY);
        ctx.fillText(dn.damage, screenX, screenY);
      }
      
      ctx.restore();
    }
  }
  
  /**
   * Show boss death effect
   */
  function showBossDeath(bossId, exp, gold) {
    const boss = bosses.get(bossId);
    if (boss) {
      // Add reward text
      const text = `+${exp} EXP, +${gold} Gold`;
      damageNumbers.push({
        x: boss.x,
        y: boss.y - 0.5,
        damage: text,
        isReward: true,
        startTime: performance.now(),
        duration: 2000  // Longer for boss kills
      });
    }
  }
  
  /**
   * Update a specific boss's HP (for combat display)
   */
  function updateBossHp(bossId, hp, maxHp) {
    const boss = bosses.get(bossId);
    if (boss) {
      boss.hp = hp;
      if (maxHp !== undefined) {
        boss.maxHp = maxHp;
      }
    }
  }
  
  /**
   * Get boss by ID
   */
  function getBoss(id) {
    return bosses.get(id);
  }
  
  /**
   * Get all bosses (for debugging)
   */
  function getAllBosses() {
    return Array.from(bosses.values());
  }
  
  /**
   * Check if there are any visible bosses
   */
  function hasBosses() {
    return bosses.size > 0;
  }
  
  /**
   * Render boss cooldown timers at the top of the screen
   * Called from the main render loop in screen space
   */
  function renderCooldownTimers(ctx, canvasWidth) {
    if (bossCooldowns.size === 0) return;
    
    const now = Date.now();
    let yOffset = 40; // Start below any top-of-screen HUD
    
    for (const [bossId, cd] of bossCooldowns) {
      const remaining = cd.cooldownEnd - now;
      if (remaining <= 0) {
        bossCooldowns.delete(bossId);
        continue;
      }
      
      // Format time
      const totalSecs = Math.ceil(remaining / 1000);
      const hours = Math.floor(totalSecs / 3600);
      const mins = Math.floor((totalSecs % 3600) / 60);
      const secs = totalSecs % 60;
      const timeStr = hours > 0
        ? `${hours}h ${String(mins).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`
        : `${mins}m ${String(secs).padStart(2, '0')}s`;
      
      const text = `⏰ ${cd.name} — ${timeStr}`;
      
      ctx.save();
      ctx.font = 'bold 13px Verdana';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      
      const textWidth = ctx.measureText(text).width;
      const padding = 12;
      const boxW = textWidth + padding * 2;
      const boxH = 26;
      const boxX = (canvasWidth - boxW) / 2;
      const boxY = yOffset;
      
      // Semi-transparent dark background with rounded corners
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.beginPath();
      const r = 6;
      ctx.moveTo(boxX + r, boxY);
      ctx.lineTo(boxX + boxW - r, boxY);
      ctx.quadraticCurveTo(boxX + boxW, boxY, boxX + boxW, boxY + r);
      ctx.lineTo(boxX + boxW, boxY + boxH - r);
      ctx.quadraticCurveTo(boxX + boxW, boxY + boxH, boxX + boxW - r, boxY + boxH);
      ctx.lineTo(boxX + r, boxY + boxH);
      ctx.quadraticCurveTo(boxX, boxY + boxH, boxX, boxY + boxH - r);
      ctx.lineTo(boxX, boxY + r);
      ctx.quadraticCurveTo(boxX, boxY, boxX + r, boxY);
      ctx.closePath();
      ctx.fill();
      
      // Subtle red border
      ctx.strokeStyle = 'rgba(255, 80, 80, 0.6)';
      ctx.lineWidth = 1;
      ctx.stroke();
      
      // Text with outline
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 3;
      ctx.lineJoin = 'round';
      ctx.strokeText(text, canvasWidth / 2, boxY + 5);
      ctx.fillStyle = '#ff6b6b';
      ctx.fillText(text, canvasWidth / 2, boxY + 5);
      
      ctx.restore();
      
      yOffset += boxH + 4;
    }
  }
  
  /**
   * Check if a boss is on cooldown
   */
  function isBossOnCooldown(bossId) {
    const cd = bossCooldowns.get(bossId);
    if (!cd) return false;
    return cd.cooldownEnd > Date.now();
  }
  
  return {
    init,
    setBossTypes,
    setPlayerLevel,
    updateBosses,
    clearBosses,
    getBossAtTile,
    getAdjacentBoss,
    triggerAttack,
    setBossInCombat,
    update,
    render,
    renderNames,
    renderCooldownTimers,
    addDamageNumber,
    renderDamageNumbers,
    showBossDeath,
    updateBossHp,
    getBoss,
    getAllBosses,
    hasBosses,
    isBossOnCooldown
  };
})();
