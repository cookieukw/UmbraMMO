/**
 * UMBRA ONLINE - Player Module
 * Handles the local player character
 */

const Player = (function() {
  // Player state
  let x = 10;           // Tile X position
  let y = 7;            // Tile Y position
  let pixelX = 0;       // Pixel X for rendering
  let pixelY = 0;       // Pixel Y for rendering
  let direction = 'down'; // Current facing direction: up, down, left, right
  let playerId = null;
  let playerName = '';   // Player's character name
  
  // Movement state
  let isMoving = false;
  let moveStartTime = 0;
  let moveFromX = 0;
  let moveFromY = 0;
  let moveToX = 0;
  let moveToY = 0;
  
  // Animation state
  let animationFrame = 0;      // Current animation frame (0 or 1 for walk cycle)
  let walkBobOffset = 0;       // Vertical bob offset for walking animation
  
  // Walk animation settings
  const WALK_BOB_AMOUNT = 4;   // Maximum pixels to bob up/down (30% more than 3)
  const WALK_BOB_SPEED = 1;  // Cycles per tile movement (30% less than 2)
  
  // Sprite settings (64x64 character sprites, centered on 48x48 tiles)
  const SPRITE_WIDTH = 64;
  const SPRITE_HEIGHT = 64;
  
  // Sprite image (will be loaded)
  let spriteImage = null;
  let spriteLoaded = false;
  
  // Equipment for paperdoll rendering (slot -> itemId)
  let visibleEquipment = {};

  /**
   * Simplified sprite system - single sprite that flips based on direction
   * The sprite faces RIGHT by default
   * - Moving RIGHT: normal sprite
   * - Moving LEFT: flipped sprite
   * - Moving UP/DOWN: use last horizontal direction, or default to right
   */
  let lastHorizontalDirection = 'right'; // Track last left/right direction for up/down movement
  
  /**
   * Initialize player at spawn point (legacy)
   */
  function init() {
    const spawn = ZoneManager.getSpawnPoint();
    x = spawn.x;
    y = spawn.y;
    pixelX = x * CONSTANTS.TILE_SIZE;
    pixelY = y * CONSTANTS.TILE_SIZE;
    direction = 'down';
    isMoving = false;
    
    // Load sprite
    loadSprite();
    
    console.log(`[Player] Initialized at (${x}, ${y})`);
  }
  
  /**
   * Initialize player with character data from server
   */
  function initWithCharacter(character) {
    x = character.x || 10;
    y = character.y || 7;
    pixelX = x * CONSTANTS.TILE_SIZE;
    pixelY = y * CONSTANTS.TILE_SIZE;
    direction = character.direction || 'down';
    isMoving = false;
    playerName = character.name || ''; // Set player name
    
    // Load sprite
    loadSprite();
    
    console.log(`[Player] ${character.name} initialized at (${x}, ${y}) in ${character.zoneId}`);
  }
  
  /**
   * Load the player sprite sheet
   */
  function loadSprite() {
    spriteImage = new Image();
    spriteImage.onload = () => {
      spriteLoaded = true;
      console.log('[Player] Sprite loaded');
    };
    spriteImage.onerror = () => {
      console.warn('[Player] Failed to load sprite, using placeholder');
      spriteLoaded = false;
    };
    spriteImage.src = '/assets/sprites/player.png';
  }
  
  /**
   * Set player ID (from server)
   */
  function setPlayerId(id) {
    playerId = id;
  }
  
  /**
   * Get player ID
   */
  function getPlayerId() {
    return playerId;
  }
  
  /**
   * Set player position (instant, no animation)
   */
  function setPosition(newX, newY) {
    x = newX;
    y = newY;
    pixelX = x * CONSTANTS.TILE_SIZE;
    pixelY = y * CONSTANTS.TILE_SIZE;
    isMoving = false;
    // Snap camera to new position
    if (typeof Camera !== 'undefined') {
      Camera.snapToPlayer(pixelX, pixelY);
    }
  }
  
  /**
   * Respawn player at a new location (for death/teleport)
   * @param {string} zoneId - Zone to respawn in (not used here, handled by ZoneManager)
   * @param {number} newX - Respawn X position
   * @param {number} newY - Respawn Y position
   */
  function respawn(zoneId, newX, newY) {
    x = newX;
    y = newY;
    pixelX = x * CONSTANTS.TILE_SIZE;
    pixelY = y * CONSTANTS.TILE_SIZE;
    isMoving = false;
    inCombat = false;
    combatMobId = null;
    direction = 'down';
    // Snap camera to respawn position
    if (typeof Camera !== 'undefined') {
      Camera.snapToPlayer(pixelX, pixelY);
    }
    console.log(`[Player] Respawned at (${newX}, ${newY})`);
  }
  
  /**
   * Set facing direction
   */
  function setDirection(dir) {
    if (['up', 'down', 'left', 'right'].includes(dir)) {
      direction = dir;
      // Track last horizontal direction for sprite flipping
      if (dir === 'left' || dir === 'right') {
        lastHorizontalDirection = dir;
      }
    }
  }
  
  // Combat state
  let inCombat = false;
  let combatMobId = null;
  
  /**
   * Try to move in a direction
   * @param {string} dir - Direction to move: up, down, left, right
   * @returns {boolean} True if movement started
   */
  function tryMove(dir) {
    // Can't move if already moving or in combat
    if (isMoving || inCombat) return false;
    
    // Close shop if open (player is moving away)
    if (typeof GameUI !== 'undefined' && GameUI.isShopOpen()) {
      GameUI.closeShop();
    }
    
    // Close market if open (player is moving away)
    if (typeof GameUI !== 'undefined' && GameUI.isMarketOpen()) {
      GameUI.closeMarket();
    }
    
    // Calculate target position
    let targetX = x;
    let targetY = y;
    
    switch (dir) {
      case 'up':    targetY--; break;
      case 'down':  targetY++; break;
      case 'left':  targetX--; break;
      case 'right': targetX++; break;
    }
    
    // Update facing direction
    setDirection(dir);
    
    // Check for mob at target position - initiate combat instead of moving
    const mobAtTarget = MobManager.getMobAt(targetX, targetY);
    if (mobAtTarget && !mobAtTarget.isDead) {
      // Send attack request to server
      Connection.send({
        type: CONSTANTS.MSG_TYPES.ATTACK_MOB,
        mobId: mobAtTarget.id
      });
      return false; // Don't move, combat will start
    }
    
    // Check if target is walkable
    if (!ZoneManager.isWalkable(targetX, targetY)) {
      return false;
    }
    
    // Start movement
    isMoving = true;
    moveStartTime = performance.now();
    moveFromX = x;
    moveFromY = y;
    moveToX = targetX;
    moveToY = targetY;
    
    return true;
  }
  
  /**
   * Set player in combat state
   */
  function setInCombat(combatState, mobId = null) {
    inCombat = combatState;
    combatMobId = mobId;
  }
  
  /**
   * Check if player is in combat
   */
  function isInCombat() {
    return inCombat;
  }
  
  /**
   * Update player state
   * @param {number} deltaTime - Time since last frame in ms
   */
  function update(deltaTime) {
    const currentTime = performance.now();
    
    if (!isMoving) {
      // Reset to idle
      animationFrame = 0;
      walkBobOffset = 0;
      return;
    }
    
    const elapsed = currentTime - moveStartTime;
    const progress = Math.min(elapsed / CONSTANTS.MOVEMENT_SPEED, 1);
    
    // Animation frame based on movement progress (switches at 50%)
    // This ensures consistent timing: frame 0 for first half, frame 1 for second half
    animationFrame = progress < 0.5 ? 0 : 1;
    
    // Calculate walking bob offset using sine wave
    // WALK_BOB_SPEED cycles per tile, using absolute value of sine for a "bounce" effect
    const bobPhase = progress * Math.PI * 2 * WALK_BOB_SPEED;
    walkBobOffset = -Math.abs(Math.sin(bobPhase)) * WALK_BOB_AMOUNT;
    
    // Interpolate pixel position
    const fromPixelX = moveFromX * CONSTANTS.TILE_SIZE;
    const fromPixelY = moveFromY * CONSTANTS.TILE_SIZE;
    const toPixelX = moveToX * CONSTANTS.TILE_SIZE;
    const toPixelY = moveToY * CONSTANTS.TILE_SIZE;
    
    pixelX = fromPixelX + (toPixelX - fromPixelX) * progress;
    pixelY = fromPixelY + (toPixelY - fromPixelY) * progress;
    
    // Check if movement complete
    if (progress >= 1) {
      // Snap to final position
      x = moveToX;
      y = moveToY;
      pixelX = x * CONSTANTS.TILE_SIZE;
      pixelY = y * CONSTANTS.TILE_SIZE;
      isMoving = false;
      animationFrame = 0; // Reset animation
      walkBobOffset = 0;  // Reset walking bob
      
      // Send position update to server
      if (typeof Connection !== 'undefined' && Connection.isConnected()) {
        Connection.send({
          type: CONSTANTS.MSG_TYPES.MOVE,
          x: x,
          y: y,
          direction: direction
        });
      }
      
      // Check if we're on an exit tile
      const exitDir = ZoneManager.getExitDirection(x, y);
      if (exitDir) {
        handleZoneExit(exitDir);
      }
    }
  }
  
  /**
   * Handle zone exit - transition to new zone
   * @param {string} exitDir - Direction of exit (north, south, east, west)
   */
  async function handleZoneExit(exitDir) {
    const destinationZoneId = ZoneManager.getExitZone(exitDir);
    
    if (!destinationZoneId) {
      console.log(`[Player] No destination zone for exit: ${exitDir}`);
      return;
    }
    
    // Save exit position before zone change
    const exitX = x;
    const exitY = y;
    const fromZone = ZoneManager.getCurrentZone()?.id;
    
    console.log(`[Player] Transitioning to ${destinationZoneId} via ${exitDir} exit from (${exitX}, ${exitY})`);
    
    // Clear ghost players from old zone
    if (typeof GhostPlayers !== 'undefined') {
      GhostPlayers.clear();
    }
    
    // Load the new zone first to calculate entry point
    const newZone = await ZoneManager.loadZone(destinationZoneId);
    
    if (!newZone) {
      console.error(`[Player] Failed to load zone: ${destinationZoneId}`);
      return;
    }
    
    // Get aligned entry point based on exit position
    const entryPoint = ZoneManager.getAlignedEntryPoint(exitDir, exitX, exitY);
    
    // Set player position at entry point
    setPosition(entryPoint.x, entryPoint.y);
    
    // Set facing direction (continue walking into the zone)
    const entryFacing = {
      'north': 'up',
      'south': 'down',
      'east': 'right',
      'west': 'left'
    };
    setDirection(entryFacing[exitDir] || direction);
    
    // Now notify server of zone change with correct entry position
    if (typeof Connection !== 'undefined' && Connection.isConnected()) {
      Connection.send({
        type: CONSTANTS.MSG_TYPES.ZONE_CHANGE,
        fromZone: fromZone,
        toZone: destinationZoneId,
        exitDirection: exitDir,
        x: entryPoint.x,
        y: entryPoint.y
      });
    }
    
    console.log(`[Player] Entered ${newZone.name} at (${entryPoint.x}, ${entryPoint.y})`);
  }
  
  /**
   * Check if player is currently moving
   */
  function getIsMoving() {
    return isMoving;
  }
  
  /**
   * Get current position
   */
  function getPosition() {
    return { x, y };
  }
  
  /**
   * Get current X position
   */
  function getX() {
    return x;
  }
  
  /**
   * Get current Y position
   */
  function getY() {
    return y;
  }
  
  /**
   * Get facing direction
   */
  function getDirection() {
    return direction;
  }
  
  /**
   * Get player name
   */
  function getName() {
    return playerName;
  }
  
  /**
   * Render the player
   * @param {CanvasRenderingContext2D} ctx - Canvas context
   */
  function render(ctx) {
    // Don't render player if dead
    if (typeof GameUI !== 'undefined' && GameUI.isPlayerDead && GameUI.isPlayerDead()) {
      return;
    }
    
    const tileSize = CONSTANTS.TILE_SIZE;
    
    // Calculate render position - center the 64x64 sprite on the 48x48 tile
    const offsetX = (SPRITE_WIDTH - tileSize) / 2;   // 8px offset for 64px sprite on 48px tile
    const offsetY = (SPRITE_HEIGHT - tileSize) / 2;
    const renderX = pixelX - offsetX;
    const renderY = pixelY - offsetY + walkBobOffset;  // Apply walking bob offset
    
    // Draw shadow under player (shadow stays on ground, doesn't bob)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
    ctx.beginPath();
    ctx.ellipse(
      pixelX + tileSize / 2,
      pixelY + tileSize + 4,
      tileSize / 3 * 0.8,
      tileSize / 6 * 0.8,
      0, 0, Math.PI * 2
    );
    ctx.fill();
    
    if (spriteLoaded && spriteImage) {
      // Simplified single-sprite system: just use the whole sprite image
      // Sprite faces RIGHT by default
      // Determine if we need to flip based on direction
      const shouldFlip = (direction === 'left') || 
                         ((direction === 'up' || direction === 'down') && lastHorizontalDirection === 'left');
      
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
      
      // Draw paperdoll equipment layers on top of player sprite
      if (typeof PaperdollManager !== 'undefined') {
        PaperdollManager.render(ctx, renderX, renderY, visibleEquipment, shouldFlip);
      }
    } else {
      // Draw placeholder rectangle (use original tile position)
      renderPlaceholder(ctx, pixelX, pixelY);
    }
    
    // Draw direction indicator (debug)
    // renderDirectionIndicator(ctx, renderX, renderY);
  }
  
  /**
   * Render the player's name in screen space (call AFTER ctx.restore so text is crisp)
   * @param {CanvasRenderingContext2D} ctx
   */
  function renderNameScreen(ctx) {
    if (!playerName) return;
    if (typeof GameUI !== 'undefined' && GameUI.isPlayerDead && GameUI.isPlayerDead()) return;
    
    const tileSize = CONSTANTS.TILE_SIZE;
    const displayName = playerName.substring(0, 12);
    
    // Convert world position to screen coordinates
    const worldCenterX = pixelX + tileSize / 2;
    const worldNameY = pixelY - 9;
    const screen = Camera.worldToScreen(worldCenterX, worldNameY);
    
    // Set font style (matching ghost player name style)
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
  }
  
  /**
   * Render placeholder when sprite not loaded
   */
  function renderPlaceholder(ctx, renderX, renderY) {
    const tileSize = CONSTANTS.TILE_SIZE;
    const padding = 8;
    
    // Body (centered in tile)
    ctx.fillStyle = '#4a90d9'; // Blue body
    ctx.fillRect(renderX + padding, renderY + 16, tileSize - padding * 2, tileSize - 16);
    
    // Head
    ctx.fillStyle = '#f5d0a9'; // Skin color
    const headSize = 16;
    const headX = renderX + (tileSize - headSize) / 2;
    ctx.fillRect(headX, renderY + 4, headSize, headSize);
    
    // Eyes based on direction
    ctx.fillStyle = '#000000';
    const eyeSize = 3;
    switch (direction) {
      case 'down':
        ctx.fillRect(headX + 3, renderY + 10, eyeSize, eyeSize);
        ctx.fillRect(headX + headSize - 6, renderY + 10, eyeSize, eyeSize);
        break;
      case 'up':
        // No eyes visible from behind
        break;
      case 'left':
        ctx.fillRect(headX + 2, renderY + 10, eyeSize, eyeSize);
        break;
      case 'right':
        ctx.fillRect(headX + headSize - 5, renderY + 10, eyeSize, eyeSize);
        break;
    }
    
    // Walking animation for placeholder
    if (isMoving) {
      const legOffset = (animationFrame % 2 === 0) ? -2 : 2;
      ctx.fillStyle = '#3a7abd';
      ctx.fillRect(renderX + padding + 4 + legOffset, renderY + tileSize - 6, 8, 6);
      ctx.fillRect(renderX + tileSize - padding - 12 - legOffset, renderY + tileSize - 6, 8, 6);
    }
  }
  
  /**
   * Debug: render direction indicator
   */
  function renderDirectionIndicator(ctx, renderX, renderY) {
    ctx.fillStyle = 'rgba(255, 255, 0, 0.8)';
    ctx.font = '10px Verdana';
    ctx.textAlign = 'center';
    ctx.fillText(direction, renderX + SPRITE_WIDTH / 2, renderY - 2);
  }
  
  /**
   * Set visible equipment for paperdoll rendering
   * @param {Object} equipment - Map of slot -> itemId (only visual slots)
   */
  function setEquipment(equipment) {
    visibleEquipment = equipment || {};
    // Preload sprites
    if (typeof PaperdollManager !== 'undefined') {
      PaperdollManager.preloadEquipment(visibleEquipment);
    }
    console.log('[Player] Equipment updated for paperdoll:', Object.keys(visibleEquipment));
  }
  
  /**
   * Get current visible equipment
   * @returns {Object}
   */
  function getEquipment() {
    return visibleEquipment;
  }
  
  /**
   * Get pixel position (for camera tracking during smooth movement)
   */
  function getPixelPosition() {
    return { x: pixelX, y: pixelY };
  }
  
  // Public API
  return {
    init,
    initWithCharacter,
    setPlayerId,
    getPlayerId,
    getName: function() { return playerName; },
    setPosition,
    respawn,
    setDirection,
    tryMove,
    update,
    getIsMoving,
    getPosition,
    getPixelPosition,
    getX,
    getY,
    getDirection,
    getName,
    setInCombat,
    isInCombat,
    setEquipment,
    getEquipment,
    render,
    renderNameScreen
  };
})();
