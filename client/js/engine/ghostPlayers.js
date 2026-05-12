/**
 * UMBRA ONLINE - Ghost Players Module
 * Renders "shadow" versions of other players in the zone
 * Ghosts have fake AI that makes them wander around
 */

const GhostPlayers = (function() {
  // Store ghost player data
  let ghosts = [];
  
  // Sprite settings (64x64 character sprites, centered on 48x48 tiles)
  const SPRITE_WIDTH = 64;
  const SPRITE_HEIGHT = 64;
  
  // Maximum ghosts to display
  const MAX_GHOSTS = 15;
  
  // AI behavior settings
  const AI_DECISION_MIN = 1500;    // Minimum time before next decision (ms)
  const AI_DECISION_MAX = 4000;    // Maximum time before next decision (ms)
  const AI_MOVE_CHANCE = 0.6;      // 60% chance to move, 40% to idle
  
  // Walk animation settings
  const WALK_BOB_AMOUNT = 4;       // Maximum pixels to bob up/down (30% more than 3)
  const WALK_BOB_SPEED = 1;      // Cycles per tile movement (30% less than 2)
  
  // Server sync interval
  const SYNC_INTERVAL = 5000;      // Request ghost updates every 5 seconds
  let lastSyncTime = 0;
  
  // Simplified sprite system - single sprite that flips based on direction
  // Sprite faces RIGHT by default
  
  // Shared sprite image (load once)
  let spriteImage = null;
  let spriteLoaded = false;
  
  /**
   * Initialize ghost players system
   */
  function init() {
    loadSprite();
    console.log('[GhostPlayers] Initialized');
  }
  
  /**
   * Load the ghost player sprite (same as player sprite)
   */
  function loadSprite() {
    spriteImage = new Image();
    spriteImage.onload = () => {
      spriteLoaded = true;
      console.log('[GhostPlayers] Sprite loaded');
    };
    spriteImage.onerror = () => {
      console.warn('[GhostPlayers] Failed to load sprite');
      spriteLoaded = false;
    };
    spriteImage.src = '/assets/sprites/player.png';
  }
  
  /**
   * Update ghost players from server data
   * @param {Array} ghostData - Array of ghost player info from server
   */
  function updateGhosts(ghostData) {
    if (!Array.isArray(ghostData)) return;
    
    // Create a map of existing ghosts for merging
    const existingGhosts = new Map();
    ghosts.forEach(g => existingGhosts.set(g.id, g));
    
    // Update or create ghosts
    const newGhosts = ghostData.slice(0, MAX_GHOSTS).map(g => {
      const existing = existingGhosts.get(g.id);
      
      if (existing) {
        // Don't update position if ghost is locked (in combat)
        if (!existing.locked) {
          // Update server position (ghost will smoothly move there via AI)
          existing.serverX = g.x;
          existing.serverY = g.y;
          existing.serverDirection = g.direction || 'down';
        }
        return existing;
      }
      
      // Create new ghost
      return createGhost(g);
    });
    
    ghosts = newGhosts;
    lastSyncTime = performance.now();
  }
  
  /**
   * Create a new ghost player object
   */
  function createGhost(data) {
    const dir = data.direction || 'down';
    const equipment = data.equipment || {};
    
    // Preload paperdoll sprites for this ghost's equipment
    if (typeof PaperdollManager !== 'undefined') {
      PaperdollManager.preloadEquipment(equipment);
    }
    
    return {
      id: data.id,
      name: data.name || 'Unknown',
      x: data.x,
      y: data.y,
      direction: dir,
      lastHorizontalDirection: (dir === 'left' || dir === 'right') ? dir : 'right',
      pixelX: data.x * CONSTANTS.TILE_SIZE,
      pixelY: data.y * CONSTANTS.TILE_SIZE,
      // Server position (for reference)
      serverX: data.x,
      serverY: data.y,
      serverDirection: dir,
      // Equipment for paperdoll
      equipment: equipment,
      // Movement state
      isMoving: false,
      moveStartTime: 0,
      moveFromX: data.x,
      moveFromY: data.y,
      moveToX: data.x,
      moveToY: data.y,
      // Animation state
      animationFrame: 0,
      walkBobOffset: 0,
      // AI state
      nextDecisionTime: performance.now() + randomRange(500, 2000),
      idleTime: 0
    };
  }
  
  /**
   * Clear all ghosts (on zone change)
   */
  function clear() {
    ghosts = [];
  }
  
  /**
   * Get random number in range
   */
  function randomRange(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
  
  /**
   * Update ghost animation and AI
   * @param {number} deltaTime - Time since last frame
   */
  function update(deltaTime) {
    const currentTime = performance.now();
    
    // Check if we should request server update
    if (currentTime - lastSyncTime >= SYNC_INTERVAL) {
      requestGhostUpdate();
      lastSyncTime = currentTime;
    }
    
    // Update each ghost
    ghosts.forEach(ghost => {
      updateGhostMovement(ghost, currentTime);
      updateGhostAI(ghost, currentTime);
    });
  }
  
  /**
   * Request ghost update from server
   */
  function requestGhostUpdate() {
    if (typeof Connection !== 'undefined' && Connection.isConnected()) {
      Connection.send({
        type: CONSTANTS.MSG_TYPES.ZONE_STATE,
        requestGhosts: true
      });
    }
  }
  
  /**
   * Update ghost movement interpolation
   */
  function updateGhostMovement(ghost, currentTime) {
    // Don't move if ghost is locked (in combat)
    if (ghost.locked) {
      ghost.isMoving = false;
      ghost.animationFrame = 0;
      ghost.walkBobOffset = 0;
      return;
    }
    
    if (!ghost.isMoving) {
      ghost.animationFrame = 0;
      ghost.walkBobOffset = 0;
      return;
    }
    
    const elapsed = currentTime - ghost.moveStartTime;
    const progress = Math.min(elapsed / CONSTANTS.MOVEMENT_SPEED, 1);
    
    // Animation frame based on movement progress (switches at 50%)
    ghost.animationFrame = progress < 0.5 ? 0 : 1;
    
    // Calculate walking bob offset using sine wave
    const bobPhase = progress * Math.PI * 2 * WALK_BOB_SPEED;
    ghost.walkBobOffset = -Math.abs(Math.sin(bobPhase)) * WALK_BOB_AMOUNT;
    
    // Interpolate pixel position
    const fromPixelX = ghost.moveFromX * CONSTANTS.TILE_SIZE;
    const fromPixelY = ghost.moveFromY * CONSTANTS.TILE_SIZE;
    const toPixelX = ghost.moveToX * CONSTANTS.TILE_SIZE;
    const toPixelY = ghost.moveToY * CONSTANTS.TILE_SIZE;
    
    ghost.pixelX = fromPixelX + (toPixelX - fromPixelX) * progress;
    ghost.pixelY = fromPixelY + (toPixelY - fromPixelY) * progress;
    
    // Check if movement complete
    if (progress >= 1) {
      ghost.x = ghost.moveToX;
      ghost.y = ghost.moveToY;
      ghost.pixelX = ghost.x * CONSTANTS.TILE_SIZE;
      ghost.pixelY = ghost.y * CONSTANTS.TILE_SIZE;
      ghost.isMoving = false;
      ghost.animationFrame = 0;
      ghost.walkBobOffset = 0;
    }
  }
  
  /**
   * Update ghost AI - random wandering behavior
   */
  function updateGhostAI(ghost, currentTime) {
    // Don't do AI if ghost is locked (in combat)
    if (ghost.locked) return;
    
    // Don't make decisions while moving
    if (ghost.isMoving) return;
    
    // Check if it's time for a decision
    if (currentTime < ghost.nextDecisionTime) return;
    
    // Make a decision: move or idle
    if (Math.random() < AI_MOVE_CHANCE) {
      // Try to move in a random direction
      const directions = ['up', 'down', 'left', 'right'];
      const shuffled = directions.sort(() => Math.random() - 0.5);
      
      for (const dir of shuffled) {
        if (tryGhostMove(ghost, dir)) {
          break;
        }
      }
    }
    
    // Schedule next decision
    ghost.nextDecisionTime = currentTime + randomRange(AI_DECISION_MIN, AI_DECISION_MAX);
  }
  
  /**
   * Try to move a ghost in a direction
   */
  function tryGhostMove(ghost, direction) {
    let targetX = ghost.x;
    let targetY = ghost.y;
    
    switch (direction) {
      case 'up':    targetY--; break;
      case 'down':  targetY++; break;
      case 'left':  targetX--; break;
      case 'right': targetX++; break;
    }
    
    // Check if target is walkable (use ZoneManager)
    if (typeof ZoneManager !== 'undefined') {
      // Check bounds and walkability
      if (targetX < 0 || targetX >= CONSTANTS.ZONE_WIDTH ||
          targetY < 0 || targetY >= CONSTANTS.ZONE_HEIGHT) {
        return false;
      }
      
      // Don't walk on blocked, water, or exit tiles
      const tile = ZoneManager.getTileAt(targetX, targetY);
      if (tile !== CONSTANTS.TILE_TYPES.WALKABLE) {
        return false;
      }
    }
    
    // Start movement
    ghost.direction = direction;
    // Track last horizontal direction for sprite flipping
    if (direction === 'left' || direction === 'right') {
      ghost.lastHorizontalDirection = direction;
    }
    ghost.isMoving = true;
    ghost.moveStartTime = performance.now();
    ghost.moveFromX = ghost.x;
    ghost.moveFromY = ghost.y;
    ghost.moveToX = targetX;
    ghost.moveToY = targetY;
    
    return true;
  }
  
  /**
   * Render all ghost players
   * @param {CanvasRenderingContext2D} ctx - Canvas context
   */
  function render(ctx) {
    if (ghosts.length === 0) return;
    
    ghosts.forEach(ghost => {
      renderGhost(ctx, ghost);
    });
  }
  
  /**
   * Render a single ghost player
   * @param {CanvasRenderingContext2D} ctx - Canvas context
   * @param {object} ghost - Ghost player data
   */
  function renderGhost(ctx, ghost) {
    const tileSize = CONSTANTS.TILE_SIZE;
    
    // Calculate render position - center the 64x64 sprite on the 48x48 tile
    const offsetX = (SPRITE_WIDTH - tileSize) / 2;  // 8px offset
    const offsetY = (SPRITE_HEIGHT - tileSize) / 2;
    const renderX = ghost.pixelX - offsetX;
    const renderY = ghost.pixelY - offsetY + (ghost.walkBobOffset || 0);  // Apply walking bob
    
    // Draw shadow under ghost (shadow stays on ground, doesn't bob)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
    ctx.beginPath();
    ctx.ellipse(
      ghost.pixelX + tileSize / 2,
      ghost.pixelY + tileSize + 4,
      tileSize / 3 * 0.8,
      tileSize / 6 * 0.8,
      0, 0, Math.PI * 2
    );
    ctx.fill();
    
    if (spriteLoaded && spriteImage) {
      // Simplified single-sprite system
      // Determine if we need to flip based on direction
      // Use lastHorizontalDirection if available, otherwise infer from current direction
      const lastHoriz = ghost.lastHorizontalDirection || 
                        (ghost.direction === 'left' ? 'left' : 'right');
      const shouldFlip = (ghost.direction === 'left') || 
                         ((ghost.direction === 'up' || ghost.direction === 'down') && lastHoriz === 'left');
      
      // --- Black outline: draw body sprite offset in 4 directions with brightness(0) ---
      const savedFilter = ctx.filter;
      ctx.filter = 'brightness(0)';
      if (shouldFlip) {
        for (const [ox, oy] of [[-0.5,0],[0.5,0],[0,-0.5],[0,0.5]]) {
          ctx.save();
          ctx.translate(renderX + SPRITE_WIDTH + ox, renderY + oy);
          ctx.scale(-1, 1);
          ctx.drawImage(spriteImage, 0, 0, SPRITE_WIDTH, SPRITE_HEIGHT, 0, 0, SPRITE_WIDTH, SPRITE_HEIGHT);
          ctx.restore();
        }
      } else {
        for (const [ox, oy] of [[-0.5,0],[0.5,0],[0,-0.5],[0,0.5]]) {
          ctx.drawImage(spriteImage, 0, 0, SPRITE_WIDTH, SPRITE_HEIGHT, renderX + ox, renderY + oy, SPRITE_WIDTH, SPRITE_HEIGHT);
        }
      }
      ctx.filter = savedFilter || 'none';
      
      // --- Draw the actual body sprite on top ---
      if (shouldFlip) {
        // Flip horizontally for left-facing
        ctx.save();
        ctx.translate(renderX + SPRITE_WIDTH, renderY);
        ctx.scale(-1, 1);
        ctx.drawImage(
          spriteImage,
          0, 0, SPRITE_WIDTH, SPRITE_HEIGHT,
          0, 0, SPRITE_WIDTH, SPRITE_HEIGHT
        );
        ctx.restore();
      } else {
        // Normal draw (facing right)
        ctx.drawImage(
          spriteImage,
          0, 0, SPRITE_WIDTH, SPRITE_HEIGHT,
          renderX, renderY, SPRITE_WIDTH, SPRITE_HEIGHT
        );
      }
      
      // Draw paperdoll equipment layers on top of ghost sprite
      if (typeof PaperdollManager !== 'undefined' && ghost.equipment) {
        PaperdollManager.render(ctx, renderX, renderY, ghost.equipment, shouldFlip);
      }
    } else {
      // Placeholder rendering (use original tile position)
      renderPlaceholderGhost(ctx, ghost.pixelX, ghost.pixelY, ghost);
    }
    
    // Render name above ghost (use centered position)
    // (Name rendering moved to renderNames for screen-space drawing)
  }
  
  /**
   * Render placeholder ghost when sprite not loaded
   */
  function renderPlaceholderGhost(ctx, renderX, renderY, ghost) {
    const tileSize = CONSTANTS.TILE_SIZE;
    const padding = 8;
    
    // Body
    ctx.fillStyle = '#4a90d9';
    ctx.fillRect(renderX + padding, renderY + 16, tileSize - padding * 2, tileSize - 16);
    
    // Head
    ctx.fillStyle = '#f5d0a9';
    const headSize = 16;
    const headX = renderX + (tileSize - headSize) / 2;
    ctx.fillRect(headX, renderY + 4, headSize, headSize);
    
    // Eyes based on direction
    ctx.fillStyle = '#000000';
    const eyeSize = 3;
    switch (ghost.direction) {
      case 'down':
        ctx.fillRect(headX + 3, renderY + 10, eyeSize, eyeSize);
        ctx.fillRect(headX + headSize - 6, renderY + 10, eyeSize, eyeSize);
        break;
      case 'up':
        break;
      case 'left':
        ctx.fillRect(headX + 2, renderY + 10, eyeSize, eyeSize);
        break;
      case 'right':
        ctx.fillRect(headX + headSize - 5, renderY + 10, eyeSize, eyeSize);
        break;
    }
    
    // Walking animation
    if (ghost.isMoving) {
      const legOffset = (ghost.animationFrame % 2 === 0) ? -2 : 2;
      ctx.fillStyle = '#3a7abd';
      ctx.fillRect(renderX + padding + 4 + legOffset, renderY + tileSize - 6, 8, 6);
      ctx.fillRect(renderX + tileSize - padding - 12 - legOffset, renderY + tileSize - 6, 8, 6);
    }
  }
  
  /**
   * Render ghost player name and HP bar (if in combat)
   */
  function renderGhostName(ctx, ghost, renderX, renderY) {
    const tileSize = CONSTANTS.TILE_SIZE;
    // Only show truncated name
    const displayName = ghost.name.substring(0, 12);
    
    // Center position (based on tile center, not sprite)
    const centerX = renderX + tileSize / 2;
    let nameY = renderY - 9;
    
    // Render HP bar if ghost has HP data (in PvP combat)
    if (ghost.hp !== undefined && ghost.maxHp !== undefined && ghost.locked) {
      const barWidth = tileSize;
      const barHeight = 6;
      const barX = renderX;
      const barY = renderY - 22;
      
      // Background
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(barX, barY, barWidth, barHeight);
      
      // HP fill
      const hpPercent = Math.max(0, ghost.hp / ghost.maxHp);
      const fillColor = hpPercent > 0.5 ? '#44ff44' : (hpPercent > 0.25 ? '#ffcc00' : '#ff4444');
      ctx.fillStyle = fillColor;
      ctx.fillRect(barX + 1, barY + 1, (barWidth - 2) * hpPercent, barHeight - 2);
      
      // Border
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 1;
      ctx.strokeRect(barX, barY, barWidth, barHeight);
      
      // Move name up to make room for HP bar
      nameY = barY - 2;
    }
    
    // Set font style
    ctx.font = 'bold 12px Verdana';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    
    // Draw black outline (stroke)
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.strokeText(displayName, centerX, nameY);
    
    // Draw neon green fill
    ctx.fillStyle = '#39ff14';
    ctx.fillText(displayName, centerX, nameY);
  }
  
  /**
   * Render all ghost names in screen space (call AFTER ctx.restore so text is crisp)
   * @param {CanvasRenderingContext2D} ctx
   */
  function renderNames(ctx) {
    if (ghosts.length === 0 || typeof Camera === 'undefined') return;
    
    const tileSize = CONSTANTS.TILE_SIZE;
    
    ghosts.forEach(ghost => {
      const displayName = ghost.name.substring(0, 12);
      
      // Calculate world-space positions
      const worldCenterX = ghost.pixelX + tileSize / 2;
      let worldNameY = ghost.pixelY - 9;
      
      // HP bar in screen space (if in PvP combat)
      if (ghost.hp !== undefined && ghost.maxHp !== undefined && ghost.locked) {
        const barWidth = tileSize;
        const barHeight = 6;
        const worldBarX = ghost.pixelX;
        const worldBarY = ghost.pixelY - 22;
        
        const barTopLeft = Camera.worldToScreen(worldBarX, worldBarY);
        const barBottomRight = Camera.worldToScreen(worldBarX + barWidth, worldBarY + barHeight);
        const sBarW = barBottomRight.x - barTopLeft.x;
        const sBarH = barBottomRight.y - barTopLeft.y;
        
        // Background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(barTopLeft.x, barTopLeft.y, sBarW, sBarH);
        
        // HP fill
        const hpPercent = Math.max(0, ghost.hp / ghost.maxHp);
        const fillColor = hpPercent > 0.5 ? '#44ff44' : (hpPercent > 0.25 ? '#ffcc00' : '#ff4444');
        ctx.fillStyle = fillColor;
        ctx.fillRect(barTopLeft.x + 1, barTopLeft.y + 1, (sBarW - 2) * hpPercent, sBarH - 2);
        
        // Border
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1;
        ctx.strokeRect(barTopLeft.x, barTopLeft.y, sBarW, sBarH);
        
        // Move name up to make room for HP bar
        worldNameY = worldBarY - 2;
      }
      
      const screen = Camera.worldToScreen(worldCenterX, worldNameY);
      
      // Set font style
      ctx.font = 'bold 12px Verdana';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      
      // Draw black outline (stroke)
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 3;
      ctx.lineJoin = 'round';
      ctx.strokeText(displayName, screen.x, screen.y);
      
      // Draw neon green fill
      ctx.fillStyle = '#39ff14';
      ctx.fillText(displayName, screen.x, screen.y);
    });
  }
  
  /**
   * Get count of current ghosts
   */
  function getCount() {
    return ghosts.length;
  }
  
  /**
   * Add a single ghost (when player enters zone)
   */
  function addGhost(data) {
    // Don't add if already at max or ghost already exists
    if (ghosts.length >= MAX_GHOSTS) return;
    if (ghosts.some(g => g.id === data.id)) return;
    
    ghosts.push(createGhost(data));
    console.log(`[GhostPlayers] Added ghost: ${data.id}`);
  }
  
  /**
   * Remove a ghost by ID (when player leaves zone)
   */
  function removeGhost(playerId) {
    const index = ghosts.findIndex(g => g.id === playerId);
    if (index !== -1) {
      ghosts.splice(index, 1);
      console.log(`[GhostPlayers] Removed ghost: ${playerId}`);
    }
  }
  
  /**
   * Get a ghost by ID (supports partial ID matching)
   */
  function getGhost(playerId) {
    // First try exact match
    let ghost = ghosts.find(g => g.id === playerId);
    // If not found, try prefix match
    if (!ghost && playerId) {
      ghost = ghosts.find(g => g.id.startsWith(playerId) || playerId.startsWith(g.id));
    }
    return ghost;
  }
  
  /**
   * Get all ghosts (for iteration)
   */
  function getAllGhosts() {
    return ghosts;
  }
  
  /**
   * Get ghost at screen position (for click detection)
   * @param {number} screenX - Click X position on canvas
   * @param {number} screenY - Click Y position on canvas
   * @returns {Object|null} Ghost at position or null
   */
  function getGhostAtScreenPosition(screenX, screenY) {
    const TILE_SIZE = CONSTANTS.TILE_SIZE;
    
    // Check each ghost (in reverse order so top-rendered ghosts are checked first)
    for (let i = ghosts.length - 1; i >= 0; i--) {
      const ghost = ghosts[i];
      
      // Ghost's pixel position is directly the screen position (no camera system)
      const ghostScreenX = ghost.pixelX;
      const ghostScreenY = ghost.pixelY;
      
      // Check if click is within ghost's tile bounds
      // Use a slightly larger hitbox for easier clicking
      const hitboxPadding = 4;
      if (screenX >= ghostScreenX - hitboxPadding && 
          screenX < ghostScreenX + TILE_SIZE + hitboxPadding &&
          screenY >= ghostScreenY - hitboxPadding && 
          screenY < ghostScreenY + TILE_SIZE + hitboxPadding) {
        return ghost;
      }
    }
    
    return null;
  }
  
  /**
   * Teleport a ghost to a new position (for PvP combat)
   * @param {string} ghostId - Ghost ID
   * @param {number} x - New tile X
   * @param {number} y - New tile Y
   * @param {string} direction - Direction to face (optional)
   */
  function teleportGhost(ghostId, x, y, direction = null) {
    const ghost = getGhost(ghostId);
    if (ghost) {
      ghost.x = x;
      ghost.y = y;
      ghost.targetX = x;
      ghost.targetY = y;
      ghost.pixelX = x * CONSTANTS.TILE_SIZE;
      ghost.pixelY = y * CONSTANTS.TILE_SIZE;
      ghost.isMoving = false;
      ghost.moveProgress = 0;
      if (direction) {
        ghost.direction = direction;
        // Track last horizontal direction for sprite flipping
        if (direction === 'left' || direction === 'right') {
          ghost.lastHorizontalDirection = direction;
        }
      }
      console.log(`[GhostPlayers] Teleported ${ghost.name} to (${x}, ${y}) facing ${ghost.direction}`);
    }
  }
  
  /**
   * Lock/unlock ghost movement (for combat)
   * @param {string} ghostId - Ghost ID
   * @param {boolean} locked - Whether to lock
   */
  function setGhostLocked(ghostId, locked) {
    const ghost = getGhost(ghostId);
    if (ghost) {
      ghost.locked = locked;
      // Stop any current movement immediately when locked
      if (locked) {
        ghost.isMoving = false;
      }
      console.log(`[GhostPlayers] ${ghost.name} locked: ${locked}`);
    } else {
      console.warn(`[GhostPlayers] setGhostLocked - Ghost not found: ${ghostId}`);
    }
  }
  
  /**
   * Update ghost equipment (for paperdoll rendering)
   * @param {string} ghostId - Ghost ID
   * @param {Object} equipment - Map of slot -> itemId
   */
  function updateGhostEquipment(ghostId, equipment) {
    const ghost = getGhost(ghostId);
    if (ghost) {
      ghost.equipment = equipment || {};
      // Preload paperdoll sprites for new equipment
      if (typeof PaperdollManager !== 'undefined') {
        PaperdollManager.preloadEquipment(ghost.equipment);
      }
      console.log(`[GhostPlayers] Updated ${ghost.name} equipment:`, Object.keys(ghost.equipment));
    }
  }
  
  /**
   * Update ghost HP (for PvP combat display)
   * @param {string} ghostId - Ghost ID
   * @param {number} hp - Current HP
   * @param {number} maxHp - Max HP
   */
  function updateGhostHp(ghostId, hp, maxHp) {
    const ghost = getGhost(ghostId);
    if (ghost) {
      ghost.hp = hp;
      ghost.maxHp = maxHp;
      console.log(`[GhostPlayers] Updated ${ghost.name} HP: ${hp}/${maxHp}`);
    }
  }
  
  // Public API
  return {
    init,
    updateGhosts,
    addGhost,
    removeGhost,
    getGhost,
    getAllGhosts,
    getGhostAtScreenPosition,
    teleportGhost,
    setGhostLocked,
    updateGhostHp,
    updateGhostEquipment,
    clear,
    update,
    render,
    renderNames,
    getCount
  };
})();
