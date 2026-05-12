/**
 * UMBRA ONLINE - Tilemap Renderer
 * Renders zone backgrounds and debug collision overlay
 */

const TilemapRenderer = (function() {
  // Background image cache
  const backgroundCache = new Map();
  
  // Current background image
  let currentBackground = null;
  let backgroundLoaded = false;
  
  // Debug tile colors (only shown in debug mode)
  const DEBUG_TILE_COLORS = {
    [CONSTANTS.TILE_TYPES.WALKABLE]: 'rgba(0, 255, 0, 0.3)',      // Green (walkable)
    [CONSTANTS.TILE_TYPES.BLOCKED]: 'rgba(255, 0, 0, 0.3)',       // Red (blocked)
    [CONSTANTS.TILE_TYPES.EXIT_NORTH]: 'rgba(0, 255, 255, 0.4)',  // Cyan (exit)
    [CONSTANTS.TILE_TYPES.EXIT_EAST]: 'rgba(0, 255, 255, 0.4)',
    [CONSTANTS.TILE_TYPES.EXIT_SOUTH]: 'rgba(0, 255, 255, 0.4)',
    [CONSTANTS.TILE_TYPES.EXIT_WEST]: 'rgba(0, 255, 255, 0.4)',
    [CONSTANTS.TILE_TYPES.WATER]: 'rgba(0, 100, 255, 0.4)',       // Blue (water)
    [CONSTANTS.TILE_TYPES.INTERACTABLE]: 'rgba(255, 255, 0, 0.4)' // Yellow (interactable)
  };
  
  // Exit arrow directions (for debug)
  const EXIT_ARROWS = {
    [CONSTANTS.TILE_TYPES.EXIT_NORTH]: '↑',
    [CONSTANTS.TILE_TYPES.EXIT_EAST]: '→',
    [CONSTANTS.TILE_TYPES.EXIT_SOUTH]: '↓',
    [CONSTANTS.TILE_TYPES.EXIT_WEST]: '←'
  };
  
  /**
   * Load background image for a zone
   * @param {string} backgroundPath - Path to background image
   * @returns {Promise<HTMLImageElement>}
   */
  function loadBackground(backgroundPath) {
    return new Promise((resolve, reject) => {
      // Check cache
      if (backgroundCache.has(backgroundPath)) {
        currentBackground = backgroundCache.get(backgroundPath);
        backgroundLoaded = true;
        resolve(currentBackground);
        return;
      }
      
      const img = new Image();
      img.onload = () => {
        backgroundCache.set(backgroundPath, img);
        currentBackground = img;
        backgroundLoaded = true;
        console.log(`[TilemapRenderer] Background loaded: ${backgroundPath}`);
        resolve(img);
      };
      img.onerror = () => {
        console.warn(`[TilemapRenderer] Failed to load background: ${backgroundPath}`);
        backgroundLoaded = false;
        currentBackground = null;
        resolve(null); // Don't reject, just use fallback
      };
      img.src = backgroundPath;
    });
  }
  
  /**
   * Called when zone changes - load new background
   * @param {object} zone - Zone data
   */
  async function onZoneChange(zone) {
    if (zone && zone.background) {
      await loadBackground(zone.background);
    } else {
      currentBackground = null;
      backgroundLoaded = false;
    }
  }
  
  /**
   * Render the current zone
   * @param {CanvasRenderingContext2D} ctx - Canvas context
   */
  function render(ctx) {
    const zone = ZoneManager.getCurrentZone();
    if (!zone) return;
    
    const canvasWidth = zone.width * CONSTANTS.TILE_SIZE;
    const canvasHeight = zone.height * CONSTANTS.TILE_SIZE;
    
    // Draw background image if loaded
    if (backgroundLoaded && currentBackground) {
      // Draw the background image scaled to fit the canvas
      ctx.drawImage(currentBackground, 0, 0, canvasWidth, canvasHeight);
    } else {
      // Fallback: draw a simple colored background
      renderFallbackBackground(ctx, zone);
    }
  }
  
  /**
   * Render fallback background when image not loaded
   * @param {CanvasRenderingContext2D} ctx - Canvas context
   * @param {object} zone - Zone data
   */
  function renderFallbackBackground(ctx, zone) {
    const tileSize = CONSTANTS.TILE_SIZE;
    
    // Base grass color
    ctx.fillStyle = '#2d4a2d';
    ctx.fillRect(0, 0, zone.width * tileSize, zone.height * tileSize);
    
    // Safety check for tiles array
    if (!zone.tiles || !Array.isArray(zone.tiles)) {
      console.warn('[TilemapRenderer] Zone tiles array is missing or invalid');
      return;
    }
    
    // Render visual hints based on tile types
    for (let y = 0; y < zone.height; y++) {
      // Safety check for row
      if (!zone.tiles[y] || !Array.isArray(zone.tiles[y])) {
        console.warn(`[TilemapRenderer] Zone tiles row ${y} is missing or invalid`);
        continue;
      }
      
      for (let x = 0; x < zone.width; x++) {
        const tileType = zone.tiles[y][x];
        if (tileType === undefined) continue;
        
        const pixelX = x * tileSize;
        const pixelY = y * tileSize;
        
        // Only render non-walkable and special tiles visually
        switch (tileType) {
          case CONSTANTS.TILE_TYPES.BLOCKED:
            // Dark stone/wall
            ctx.fillStyle = '#4a4a4a';
            ctx.fillRect(pixelX, pixelY, tileSize, tileSize);
            // Add some texture
            ctx.fillStyle = '#3a3a3a';
            ctx.fillRect(pixelX + 4, pixelY + 4, tileSize - 8, tileSize - 8);
            break;
            
          case CONSTANTS.TILE_TYPES.WATER:
            // Water
            ctx.fillStyle = '#2d5a8a';
            ctx.fillRect(pixelX, pixelY, tileSize, tileSize);
            // Wave effect
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(pixelX + 8, pixelY + tileSize / 3);
            ctx.quadraticCurveTo(pixelX + tileSize / 2, pixelY + tileSize / 3 - 6, pixelX + tileSize - 8, pixelY + tileSize / 3);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(pixelX + 8, pixelY + tileSize * 2 / 3);
            ctx.quadraticCurveTo(pixelX + tileSize / 2, pixelY + tileSize * 2 / 3 + 6, pixelX + tileSize - 8, pixelY + tileSize * 2 / 3);
            ctx.stroke();
            break;
            
          case CONSTANTS.TILE_TYPES.EXIT_NORTH:
          case CONSTANTS.TILE_TYPES.EXIT_EAST:
          case CONSTANTS.TILE_TYPES.EXIT_SOUTH:
          case CONSTANTS.TILE_TYPES.EXIT_WEST:
            // Exit path - lighter grass
            ctx.fillStyle = '#3d6a3d';
            ctx.fillRect(pixelX, pixelY, tileSize, tileSize);
            // Arrow indicator
            ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
            ctx.font = '24px Verdana';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(EXIT_ARROWS[tileType], pixelX + tileSize / 2, pixelY + tileSize / 2);
            break;
            
          case CONSTANTS.TILE_TYPES.INTERACTABLE:
            // Interactable spot - slight highlight
            ctx.fillStyle = '#4a5a3a';
            ctx.fillRect(pixelX, pixelY, tileSize, tileSize);
            break;
        }
      }
    }
    
    // Draw subtle grid
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
    ctx.lineWidth = 1;
    for (let y = 0; y <= zone.height; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * tileSize);
      ctx.lineTo(zone.width * tileSize, y * tileSize);
      ctx.stroke();
    }
    for (let x = 0; x <= zone.width; x++) {
      ctx.beginPath();
      ctx.moveTo(x * tileSize, 0);
      ctx.lineTo(x * tileSize, zone.height * tileSize);
      ctx.stroke();
    }
  }
  
  /**
   * Draw a debug collision overlay
   * @param {CanvasRenderingContext2D} ctx - Canvas context
   * @param {boolean} showCoords - Whether to show tile coordinates
   */
  function renderDebugGrid(ctx, showCoords = false) {
    const zone = ZoneManager.getCurrentZone();
    if (!zone) return;
    
    // Safety check for tiles array
    if (!zone.tiles || !Array.isArray(zone.tiles)) return;
    
    const tileSize = CONSTANTS.TILE_SIZE;
    
    // Render collision overlay
    for (let y = 0; y < zone.height; y++) {
      // Safety check for row
      if (!zone.tiles[y] || !Array.isArray(zone.tiles[y])) continue;
      
      for (let x = 0; x < zone.width; x++) {
        const tileType = zone.tiles[y][x];
        if (tileType === undefined) continue;
        
        const pixelX = x * tileSize;
        const pixelY = y * tileSize;
        
        // Check if this tile is a shop (override color)
        if (ZoneManager.isShopTile(x, y)) {
          ctx.fillStyle = 'rgba(139, 90, 43, 0.5)';  // Brown for shops
          ctx.fillRect(pixelX, pixelY, tileSize, tileSize);
          continue;
        }
        
        // Draw tile type overlay
        const color = DEBUG_TILE_COLORS[tileType] || DEBUG_TILE_COLORS[CONSTANTS.TILE_TYPES.BLOCKED];
        ctx.fillStyle = color;
        ctx.fillRect(pixelX, pixelY, tileSize, tileSize);
        
        // Draw exit arrows
        if (EXIT_ARROWS[tileType]) {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
          ctx.font = '20px Verdana';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(EXIT_ARROWS[tileType], pixelX + tileSize / 2, pixelY + tileSize / 2);
        }
      }
    }
    
    // Draw grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1;
    
    // Vertical lines
    for (let x = 0; x <= zone.width; x++) {
      ctx.beginPath();
      ctx.moveTo(x * tileSize, 0);
      ctx.lineTo(x * tileSize, zone.height * tileSize);
      ctx.stroke();
    }
    
    // Horizontal lines
    for (let y = 0; y <= zone.height; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * tileSize);
      ctx.lineTo(zone.width * tileSize, y * tileSize);
      ctx.stroke();
    }
    
    // Draw coordinates if requested
    if (showCoords) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.font = '10px Verdana';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      
      for (let y = 0; y < zone.height; y++) {
        for (let x = 0; x < zone.width; x++) {
          ctx.fillText(`${x},${y}`, x * tileSize + 3, y * tileSize + 3);
        }
      }
    }
  }
  
  /**
   * Check if background is loaded
   * @returns {boolean}
   */
  function isBackgroundLoaded() {
    return backgroundLoaded;
  }
  
  // Shop sprite cache
  const shopSprites = {};
  
  /**
   * Load a shop sprite image
   */
  function loadShopSprite(shopId) {
    if (shopSprites[shopId]) return shopSprites[shopId];
    
    const img = new Image();
    img.src = `assets/sprites/shops/${shopId}.png`;
    img.onload = () => {
      console.log(`[TilemapRenderer] Loaded shop sprite: ${shopId}`);
    };
    img.onerror = () => {
      console.warn(`[TilemapRenderer] Failed to load shop sprite: ${shopId}, using fallback`);
      shopSprites[shopId] = null; // Mark as failed so we don't retry
    };
    shopSprites[shopId] = img;
    return img;
  }
  
  // Object sprite cache (spawn beacons, etc.)
  const objectSprites = {};
  
  /**
   * Load an object sprite image
   */
  function loadObjectSprite(spriteKey) {
    if (objectSprites[spriteKey]) return objectSprites[spriteKey];
    
    const img = new Image();
    img.src = `assets/sprites/objects/${spriteKey}.png`;
    img.onload = () => {
      console.log(`[TilemapRenderer] Loaded object sprite: ${spriteKey}`);
    };
    img.onerror = () => {
      console.warn(`[TilemapRenderer] Failed to load object sprite: ${spriteKey}, using fallback`);
      objectSprites[spriteKey] = null;
    };
    objectSprites[spriteKey] = img;
    return img;
  }
  
  /**
   * Render shops on the map
   * @param {CanvasRenderingContext2D} ctx - Canvas context
   */
  function renderShops(ctx) {
    const zone = ZoneManager.getCurrentZone();
    if (!zone || !zone.shops) return;
    
    const tileSize = CONSTANTS.TILE_SIZE;
    const SPRITE_SIZE = 64; // Same size as player sprites
    
    for (const shop of zone.shops) {
      const pixelX = shop.x * tileSize;
      const pixelY = shop.y * tileSize;
      
      // Draw round shadow under shop NPC (same as player shadow)
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
      
      // Try to render shop sprite (64x64, centered on tile like player)
      const sprite = loadShopSprite(shop.shopId);
      if (sprite && sprite.complete && sprite.naturalWidth > 0) {
        // Center the 64x64 sprite on the 48x48 tile (same as player rendering)
        const offsetX = (tileSize - SPRITE_SIZE) / 2;
        const offsetY = (tileSize - SPRITE_SIZE) / 2;
        
        // Draw with drop shadow (like player)
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
        ctx.shadowBlur = 4;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;
        ctx.drawImage(sprite, pixelX + offsetX, pixelY + offsetY, SPRITE_SIZE, SPRITE_SIZE);
        ctx.restore();
      } else if (sprite !== null) {
        // Fallback: draw a simple shop indicator while sprite loads (no emoji)
        ctx.fillStyle = 'rgba(139, 90, 43, 0.7)';
        ctx.fillRect(pixelX, pixelY, tileSize, tileSize);
        ctx.strokeStyle = '#8b5a2b';
        ctx.lineWidth = 2;
        ctx.strokeRect(pixelX + 1, pixelY + 1, tileSize - 2, tileSize - 2);
      }
    }
  }
  
  /**
   * Render shop names on the text overlay canvas (crisp, not affected by zoom)
   * @param {CanvasRenderingContext2D} ctx - Text overlay canvas context
   */
  function renderShopNames(ctx, playerX, playerY) {
    const zone = ZoneManager.getCurrentZone();
    if (!zone || !zone.shops) return;
    
    const tileSize = CONSTANTS.TILE_SIZE;
    const adjacentShop = ZoneManager.getAdjacentShop(playerX, playerY);
    
    for (const shop of zone.shops) {
      const pixelX = shop.x * tileSize;
      const pixelY = shop.y * tileSize;
      
      const isAdjacent = adjacentShop && adjacentShop.x === shop.x && adjacentShop.y === shop.y;
      const shopName = (shop.name || 'Shop') + (isAdjacent ? ' [E]' : '');
      const worldCenterX = pixelX + tileSize / 2;
      const worldNameY = pixelY - 9;
      const screen = Camera.worldToScreen(worldCenterX, worldNameY);
      
      ctx.font = 'bold 12px Verdana';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      
      // Draw black outline (stroke) for readability
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 3;
      ctx.lineJoin = 'round';
      ctx.strokeText(shopName, screen.x, screen.y);
      
      // Draw neon yellow fill
      ctx.fillStyle = '#ffff00';
      ctx.fillText(shopName, screen.x, screen.y);
    }
  }
  
  /**
   * Render zone object names on the text overlay canvas (crisp, not affected by zoom)
   * @param {CanvasRenderingContext2D} ctx - Text overlay canvas context
   */
  function renderObjectNames(ctx, playerX, playerY) {
    const zone = ZoneManager.getCurrentZone();
    if (!zone || !zone.objects) return;
    
    const tileSize = CONSTANTS.TILE_SIZE;
    const adjacentObject = getAdjacentObject(playerX, playerY);
    
    for (const obj of zone.objects) {
      // Only render names for sprite-based objects
      if (obj.type !== 'spawn_beacon') continue;
      
      const pixelX = obj.x * tileSize;
      const pixelY = obj.y * tileSize;
      
      const isAdjacent = adjacentObject && adjacentObject.x === obj.x && adjacentObject.y === obj.y;
      const objName = (obj.name || 'Object') + (isAdjacent ? ' [E]' : '');
      const worldCenterX = pixelX + tileSize / 2;
      const worldNameY = pixelY - 9;
      const screen = Camera.worldToScreen(worldCenterX, worldNameY);
      
      ctx.font = 'bold 12px Verdana';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      
      // Draw black outline (stroke) for readability
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 3;
      ctx.lineJoin = 'round';
      ctx.strokeText(objName, screen.x, screen.y);
      
      // Draw neon yellow fill for beacons
      ctx.fillStyle = '#ffff00';
      ctx.fillText(objName, screen.x, screen.y);
    }
  }
  
  /**
   * Render zone objects (spawn beacons, etc.)
   * @param {CanvasRenderingContext2D} ctx - Canvas context
   */
  function renderZoneObjects(ctx) {
    const zone = ZoneManager.getCurrentZone();
    if (!zone || !zone.objects) return;
    
    const tileSize = CONSTANTS.TILE_SIZE;
    
    for (const obj of zone.objects) {
      // Skip shop objects - shops are rendered by renderShops()
      if (obj.type === 'shop') continue;
      
      const objWidth = (obj.width || 1) * tileSize;
      const objHeight = (obj.height || 1) * tileSize;
      const pixelX = obj.x * tileSize;
      const pixelY = obj.y * tileSize;
      
      if (obj.type === 'spawn_beacon') {
        const SPRITE_SIZE = 64;
        const spriteKey = obj.sprite || 'spawn_beacon';
        
        // Draw round shadow under beacon (same as player/shop)
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
        
        // Try to render object sprite
        const sprite = loadObjectSprite(spriteKey);
        if (sprite && sprite.complete && sprite.naturalWidth > 0) {
          const offsetX = (tileSize - SPRITE_SIZE) / 2;
          const offsetY = (tileSize - SPRITE_SIZE) / 2;
          
          // Draw with drop shadow
          ctx.save();
          ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
          ctx.shadowBlur = 4;
          ctx.shadowOffsetX = 2;
          ctx.shadowOffsetY = 2;
          ctx.drawImage(sprite, pixelX + offsetX, pixelY + offsetY, SPRITE_SIZE, SPRITE_SIZE);
          ctx.restore();
        } else if (sprite !== null) {
          // Fallback: draw a simple beacon indicator while sprite loads
          ctx.fillStyle = 'rgba(255, 120, 0, 0.5)';
          ctx.fillRect(pixelX, pixelY, tileSize, tileSize);
          ctx.strokeStyle = '#ff6600';
          ctx.lineWidth = 2;
          ctx.strokeRect(pixelX + 1, pixelY + 1, tileSize - 2, tileSize - 2);
        }
      } else if (obj.type === 'castle') {
        // Draw castle glow effect
        const centerX = pixelX + objWidth / 2;
        const centerY = pixelY + objHeight / 2;
        const time = Date.now() / 1000;
        const pulseSize = 1 + Math.sin(time * 1.5) * 0.1;
        
        // Outer glow - purple/royal theme
        const gradient = ctx.createRadialGradient(
          centerX, centerY, 0,
          centerX, centerY, objWidth * 0.9 * pulseSize
        );
        gradient.addColorStop(0, 'rgba(148, 103, 189, 0.4)');
        gradient.addColorStop(0.5, 'rgba(128, 0, 128, 0.2)');
        gradient.addColorStop(1, 'rgba(75, 0, 130, 0)');
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(centerX, centerY, objWidth * 0.9 * pulseSize, 0, Math.PI * 2);
        ctx.fill();
        
        // Draw castle icon
        const iconSize = Math.min(objWidth, objHeight) * 0.65;
        ctx.font = `${iconSize}px Verdana`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#fff';
        ctx.shadowColor = '#9467bd';
        ctx.shadowBlur = 20;
        ctx.fillText(obj.icon || '🏰', centerX, centerY);
        ctx.shadowBlur = 0;
      } else if (obj.type === 'training_dummy') {
        // Draw training dummy glow effect
        const centerX = pixelX + objWidth / 2;
        const centerY = pixelY + objHeight / 2;
        const time = Date.now() / 1000;
        const pulseSize = 1 + Math.sin(time * 2) * 0.08;
        
        // Outer glow - green/training theme
        const gradient = ctx.createRadialGradient(
          centerX, centerY, 0,
          centerX, centerY, objWidth * 0.8 * pulseSize
        );
        gradient.addColorStop(0, 'rgba(50, 205, 50, 0.4)');
        gradient.addColorStop(0.5, 'rgba(34, 139, 34, 0.2)');
        gradient.addColorStop(1, 'rgba(0, 100, 0, 0)');
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(centerX, centerY, objWidth * 0.8 * pulseSize, 0, Math.PI * 2);
        ctx.fill();
        
        // Draw training dummy icon
        const iconSize = Math.min(objWidth, objHeight) * 0.65;
        ctx.font = `${iconSize}px Verdana`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#fff';
        ctx.shadowColor = '#32cd32';
        ctx.shadowBlur = 15;
        ctx.fillText(obj.icon || '🎯', centerX, centerY);
        ctx.shadowBlur = 0;
      } else {
        // Generic object rendering
        ctx.font = `${Math.min(objWidth, objHeight) * 0.6}px Verdana`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#fff';
        ctx.fillText(obj.icon || '❓', pixelX + objWidth / 2, pixelY + objHeight / 2);
      }
    }
  }
  
  /**
   * Check if player is adjacent to a zone object
   * @param {number} playerX - Player tile X
   * @param {number} playerY - Player tile Y
   * @returns {Object|null} - Adjacent object or null
   */
  function getAdjacentObject(playerX, playerY) {
    const zone = ZoneManager.getCurrentZone();
    if (!zone || !zone.objects) return null;
    
    for (const obj of zone.objects) {
      const objWidth = obj.width || 1;
      const objHeight = obj.height || 1;
      
      // Check if player is adjacent to object
      if (playerX >= obj.x - 1 && playerX <= obj.x + objWidth &&
          playerY >= obj.y - 1 && playerY <= obj.y + objHeight) {
        return obj;
      }
    }
    
    return null;
  }
  
  // Market NPC sprite cache
  let marketNpcSprite = null;
  let marketNpcSpriteLoaded = false;
  
  /**
   * Load the market NPC sprite (player.png reused)
   */
  function loadMarketNpcSprite() {
    if (marketNpcSprite) return marketNpcSprite;
    
    marketNpcSprite = new Image();
    marketNpcSprite.src = 'assets/sprites/player.png';
    marketNpcSprite.onload = () => {
      marketNpcSpriteLoaded = true;
      console.log('[TilemapRenderer] Market NPC sprite loaded');
    };
    marketNpcSprite.onerror = () => {
      console.warn('[TilemapRenderer] Failed to load market NPC sprite');
      marketNpcSpriteLoaded = false;
    };
    return marketNpcSprite;
  }
  
  /**
   * Render market NPCs on the map (player-like sprite with outline)
   * @param {CanvasRenderingContext2D} ctx - Canvas context
   */
  function renderMarketNpcs(ctx) {
    const zone = ZoneManager.getCurrentZone();
    if (!zone || !zone.npcs) return;
    
    const tileSize = CONSTANTS.TILE_SIZE;
    const SPRITE_SIZE = 64;
    const marketNpcs = zone.npcs.filter(npc => npc.type === 'market');
    
    if (marketNpcs.length === 0) return;
    
    const sprite = loadMarketNpcSprite();
    
    for (const npc of marketNpcs) {
      const pixelX = npc.x * tileSize;
      const pixelY = npc.y * tileSize;
      
      // Draw shadow
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
      
      if (marketNpcSpriteLoaded && sprite && sprite.complete && sprite.naturalWidth > 0) {
        const offsetX = (SPRITE_SIZE - tileSize) / 2;
        const offsetY = (SPRITE_SIZE - tileSize) / 2;
        const renderX = pixelX - offsetX;
        const renderY = pixelY - offsetY;
        
        // Draw black outline (4 offset draws)
        const savedFilter = ctx.filter;
        ctx.filter = 'brightness(0)';
        for (const [ox, oy] of [[-0.5,0],[0.5,0],[0,-0.5],[0,0.5]]) {
          ctx.drawImage(sprite, 0, 0, SPRITE_SIZE, SPRITE_SIZE, renderX + ox, renderY + oy, SPRITE_SIZE, SPRITE_SIZE);
        }
        ctx.filter = savedFilter || 'none';
        
        // Draw actual sprite
        ctx.drawImage(sprite, 0, 0, SPRITE_SIZE, SPRITE_SIZE, renderX, renderY, SPRITE_SIZE, SPRITE_SIZE);
      } else {
        // Fallback: simple colored rectangle
        ctx.fillStyle = 'rgba(218, 165, 32, 0.7)';
        ctx.fillRect(pixelX, pixelY, tileSize, tileSize);
        ctx.strokeStyle = '#daa520';
        ctx.lineWidth = 2;
        ctx.strokeRect(pixelX + 1, pixelY + 1, tileSize - 2, tileSize - 2);
      }
    }
  }
  
  /**
   * Render market NPC names on the text overlay canvas
   * @param {CanvasRenderingContext2D} ctx - Text overlay canvas context
   * @param {number} playerX - Player tile X
   * @param {number} playerY - Player tile Y
   */
  function renderMarketNpcNames(ctx, playerX, playerY) {
    const zone = ZoneManager.getCurrentZone();
    if (!zone || !zone.npcs) return;
    
    const tileSize = CONSTANTS.TILE_SIZE;
    const adjacentNpc = ZoneManager.getAdjacentMarketNpc(playerX, playerY);
    const marketNpcs = zone.npcs.filter(npc => npc.type === 'market');
    
    for (const npc of marketNpcs) {
      const pixelX = npc.x * tileSize;
      const pixelY = npc.y * tileSize;
      
      const isAdjacent = adjacentNpc && adjacentNpc.x === npc.x && adjacentNpc.y === npc.y;
      const npcName = (npc.name || 'Market') + (isAdjacent ? ' [E]' : '');
      const worldCenterX = pixelX + tileSize / 2;
      const worldNameY = pixelY - 9;
      const screen = Camera.worldToScreen(worldCenterX, worldNameY);
      
      ctx.font = 'bold 12px Verdana';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      
      // Draw black outline
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 3;
      ctx.lineJoin = 'round';
      ctx.strokeText(npcName, screen.x, screen.y);
      
      // Draw gold fill
      ctx.fillStyle = '#ffa500';
      ctx.fillText(npcName, screen.x, screen.y);
    }
  }
  
  // Public API
  return {
    render,
    renderDebugGrid,
    renderShops,
    renderShopNames,
    renderObjectNames,
    renderZoneObjects,
    renderMarketNpcs,
    renderMarketNpcNames,
    getAdjacentObject,
    onZoneChange,
    loadBackground,
    isBackgroundLoaded
  };
})();
