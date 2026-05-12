/**
 * UMBRA ONLINE - Zone Manager
 * Handles loading and storing zone data
 */

const ZoneManager = (function() {
  // Currently loaded zone
  let currentZone = null;
  
  // Cache of loaded zones
  const zoneCache = new Map();
  
  /**
   * Load a zone by ID
   * @param {string} zoneId - The zone ID to load
   * @returns {Promise<object>} The zone data
   */
  async function loadZone(zoneId) {
    // Check cache first
    if (zoneCache.has(zoneId)) {
      currentZone = zoneCache.get(zoneId);
      console.log(`[ZoneManager] Loaded zone from cache: ${zoneId}`);
      
      // Validate and fix tiles if needed (even for cached zones)
      if (!currentZone.tiles || !Array.isArray(currentZone.tiles) || currentZone.tiles.length === 0) {
        console.warn(`[ZoneManager] Cached zone ${zoneId} has missing or empty tiles, generating defaults`);
        currentZone.tiles = generateDefaultTiles(currentZone.width || CONSTANTS.ZONE_WIDTH, currentZone.height || CONSTANTS.ZONE_HEIGHT);
      }
      
      // Notify tilemap renderer of zone change
      if (typeof TilemapRenderer !== 'undefined') {
        await TilemapRenderer.onZoneChange(currentZone);
      }
      
      return currentZone;
    }
    
    try {
      const response = await fetch(`/data/zones/${zoneId}.json`);
      if (!response.ok) {
        throw new Error(`Failed to load zone: ${response.status}`);
      }
      
      const zoneData = await response.json();
      
      // Validate and fix tiles array if missing or empty
      if (!zoneData.tiles || !Array.isArray(zoneData.tiles) || zoneData.tiles.length === 0) {
        console.warn(`[ZoneManager] Zone ${zoneId} has missing or empty tiles, generating defaults`);
        zoneData.tiles = generateDefaultTiles(zoneData.width || CONSTANTS.ZONE_WIDTH, zoneData.height || CONSTANTS.ZONE_HEIGHT);
      }
      
      // Ensure zone dimensions are set
      if (!zoneData.width) zoneData.width = zoneData.tiles[0]?.length || CONSTANTS.ZONE_WIDTH;
      if (!zoneData.height) zoneData.height = zoneData.tiles.length || CONSTANTS.ZONE_HEIGHT;
      
      // Cache the zone
      zoneCache.set(zoneId, zoneData);
      currentZone = zoneData;
      
      // Notify tilemap renderer of zone change
      if (typeof TilemapRenderer !== 'undefined') {
        await TilemapRenderer.onZoneChange(currentZone);
      }
      
      console.log(`[ZoneManager] Loaded zone: ${zoneData.name} (${zoneData.width}x${zoneData.height})`);
      return zoneData;
    } catch (error) {
      console.error(`[ZoneManager] Error loading zone ${zoneId}:`, error);
      return null;
    }
  }
  
  /**
   * Generate default tiles for a zone (all walkable with blocked borders)
   * @param {number} width - Zone width
   * @param {number} height - Zone height
   * @returns {Array} 2D tile array
   */
  function generateDefaultTiles(width, height) {
    const tiles = [];
    for (let y = 0; y < height; y++) {
      const row = [];
      for (let x = 0; x < width; x++) {
        // Border tiles are blocked
        if (x === 0 || x === width - 1 || y === 0 || y === height - 1) {
          row.push(CONSTANTS.TILE_TYPES.BLOCKED);
        } else {
          row.push(CONSTANTS.TILE_TYPES.WALKABLE);
        }
      }
      tiles.push(row);
    }
    return tiles;
  }
  
  /**
   * Get the current zone
   * @returns {object|null} Current zone data
   */
  function getCurrentZone() {
    return currentZone;
  }
  
  /**
   * Get tile at position
   * @param {number} x - Tile X coordinate
   * @param {number} y - Tile Y coordinate
   * @returns {number} Tile type (from CONSTANTS.TILE_TYPES)
   */
  function getTileAt(x, y) {
    if (!currentZone) return CONSTANTS.TILE_TYPES.BLOCKED;
    
    // Check bounds
    if (x < 0 || x >= currentZone.width || y < 0 || y >= currentZone.height) {
      return CONSTANTS.TILE_TYPES.BLOCKED;
    }
    
    // Safety check for tiles array
    if (!currentZone.tiles || !Array.isArray(currentZone.tiles)) {
      return CONSTANTS.TILE_TYPES.BLOCKED;
    }
    
    // Safety check for row
    if (!currentZone.tiles[y] || !Array.isArray(currentZone.tiles[y])) {
      return CONSTANTS.TILE_TYPES.BLOCKED;
    }
    
    // Safety check for tile value
    const tile = currentZone.tiles[y][x];
    return tile !== undefined ? tile : CONSTANTS.TILE_TYPES.BLOCKED;
  }
  
  /**
   * Check if a tile is walkable
   * @param {number} x - Tile X coordinate
   * @param {number} y - Tile Y coordinate
   * @returns {boolean} True if the tile can be walked on
   */
  function isWalkable(x, y) {
    const tile = getTileAt(x, y);
    
    // Check if blocked by shop first
    if (isShopTile(x, y)) {
      return false;
    }
    
    // Check if blocked by market NPC
    if (isMarketNpcTile(x, y)) {
      return false;
    }
    
    // Walkable tiles: WALKABLE, and all EXIT types
    return tile === CONSTANTS.TILE_TYPES.WALKABLE ||
           tile === CONSTANTS.TILE_TYPES.EXIT_NORTH ||
           tile === CONSTANTS.TILE_TYPES.EXIT_EAST ||
           tile === CONSTANTS.TILE_TYPES.EXIT_SOUTH ||
           tile === CONSTANTS.TILE_TYPES.EXIT_WEST;
  }
  
  /**
   * Check if a tile is blocked by a shop
   * @param {number} x - Tile X coordinate
   * @param {number} y - Tile Y coordinate
   * @returns {boolean} True if blocked by shop
   */
  function isShopTile(x, y) {
    if (!currentZone || !currentZone.shops) return false;
    
    for (const shop of currentZone.shops) {
      const shopWidth = shop.width || 1;
      const shopHeight = shop.height || 1;
      
      if (x >= shop.x && x < shop.x + shopWidth &&
          y >= shop.y && y < shop.y + shopHeight) {
        return true;
      }
    }
    return false;
  }
  
  /**
   * Check if tile is an exit
   * @param {number} x - Tile X coordinate
   * @param {number} y - Tile Y coordinate
   * @returns {string|null} Exit direction or null
   */
  function getExitDirection(x, y) {
    const tile = getTileAt(x, y);
    
    switch (tile) {
      case CONSTANTS.TILE_TYPES.EXIT_NORTH: return 'north';
      case CONSTANTS.TILE_TYPES.EXIT_EAST: return 'east';
      case CONSTANTS.TILE_TYPES.EXIT_SOUTH: return 'south';
      case CONSTANTS.TILE_TYPES.EXIT_WEST: return 'west';
      default: return null;
    }
  }
  
  /**
   * Get the destination zone for an exit direction
   * @param {string} direction - Exit direction (north, east, south, west)
   * @returns {string|null} Destination zone ID or null
   */
  function getExitZone(direction) {
    if (!currentZone || !currentZone.exits) return null;
    return currentZone.exits[direction] || null;
  }
  
  /**
   * Get spawn point for the current zone
   * @param {number} index - Spawn index (default 0)
   * @returns {object} Spawn point {x, y}
   */
  function getSpawnPoint(index = 0) {
    if (!currentZone || !currentZone.spawns || currentZone.spawns.length === 0) {
      // Default to center of map
      return {
        x: Math.floor(CONSTANTS.ZONE_WIDTH / 2),
        y: Math.floor(CONSTANTS.ZONE_HEIGHT / 2)
      };
    }
    
    return currentZone.spawns[Math.min(index, currentZone.spawns.length - 1)];
  }
  
  /**
   * Get entry point when coming from a specific direction
   * @param {string} fromDirection - Direction player came from (north, south, east, west)
   * @returns {object} Entry point {x, y}
   */
  function getEntryPoint(fromDirection) {
    // Get the opposite direction (where player enters)
    // If player exited north from previous zone, they enter from south in new zone
    const oppositeDir = {
      'north': 'south',
      'south': 'north',
      'east': 'west',
      'west': 'east'
    };
    
    const entryDir = oppositeDir[fromDirection] || fromDirection;
    
    // Check if zone has custom entry points defined
    if (currentZone && currentZone.entryPoints && currentZone.entryPoints[entryDir]) {
      const entryPoint = currentZone.entryPoints[entryDir];
      return { x: entryPoint.x, y: entryPoint.y };
    }
    
    // Calculate default edge-center position based on entry direction
    const width = currentZone?.width || CONSTANTS.ZONE_WIDTH;
    const height = currentZone?.height || CONSTANTS.ZONE_HEIGHT;
    
    const defaultEntryPoints = {
      'north': { x: Math.floor(width / 2), y: 1 },
      'south': { x: Math.floor(width / 2), y: height - 2 },
      'east': { x: width - 2, y: Math.floor(height / 2) },
      'west': { x: 1, y: Math.floor(height / 2) }
    };
    
    if (defaultEntryPoints[entryDir]) {
      return defaultEntryPoints[entryDir];
    }
    
    // Ultimate fallback to spawn point
    return getSpawnPoint(0);
  }
  
  /**
   * Find all exit tiles for a specific direction in the current zone
   * @param {string} direction - Exit direction (north, south, east, west)
   * @returns {Array} Array of {x, y} positions
   */
  function getExitTilesForDirection(direction) {
    if (!currentZone || !currentZone.tiles) return [];
    
    const exitTileType = {
      'north': CONSTANTS.TILE_TYPES.EXIT_NORTH,
      'south': CONSTANTS.TILE_TYPES.EXIT_SOUTH,
      'east': CONSTANTS.TILE_TYPES.EXIT_EAST,
      'west': CONSTANTS.TILE_TYPES.EXIT_WEST
    }[direction];
    
    if (exitTileType === undefined) return [];
    
    const exitTiles = [];
    const width = currentZone.width || CONSTANTS.ZONE_WIDTH;
    const height = currentZone.height || CONSTANTS.ZONE_HEIGHT;
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (currentZone.tiles[y] && currentZone.tiles[y][x] === exitTileType) {
          exitTiles.push({ x, y });
        }
      }
    }
    
    return exitTiles;
  }
  
  /**
   * Get aligned entry point when transitioning from another zone
   * Finds the entrance tile closest to where the player exited
   * @param {string} fromDirection - Direction player exited from (north, south, east, west)
   * @param {number} exitX - X position where player exited previous zone
   * @param {number} exitY - Y position where player exited previous zone
   * @returns {object} Entry point {x, y}
   */
  function getAlignedEntryPoint(fromDirection, exitX, exitY) {
    // Get the opposite direction (where player enters)
    const oppositeDir = {
      'north': 'south',
      'south': 'north',
      'east': 'west',
      'west': 'east'
    };
    
    const entryDir = oppositeDir[fromDirection];
    if (!entryDir) return getSpawnPoint(0);
    
    // Find all entrance tiles (tiles that match the entry direction's exit type)
    // E.g., if entering from west (because we exited east), look for EXIT_WEST tiles
    const entranceTiles = getExitTilesForDirection(entryDir);
    
    if (entranceTiles.length === 0) {
      // No matching entrance tiles, fall back to custom entry point or default
      console.log(`[ZoneManager] No entrance tiles for ${entryDir}, using default entry point`);
      return getEntryPoint(fromDirection);
    }
    
    // For east/west transitions, align by Y coordinate
    // For north/south transitions, align by X coordinate
    let bestTile = entranceTiles[0];
    let bestDistance = Infinity;
    
    for (const tile of entranceTiles) {
      let distance;
      
      if (fromDirection === 'east' || fromDirection === 'west') {
        // Horizontal transition - match Y position
        distance = Math.abs(tile.y - exitY);
      } else {
        // Vertical transition - match X position
        distance = Math.abs(tile.x - exitX);
      }
      
      if (distance < bestDistance) {
        bestDistance = distance;
        bestTile = tile;
      }
    }
    
    // Step one tile into the zone (away from the edge)
    let entryX = bestTile.x;
    let entryY = bestTile.y;
    
    // Adjust position to be one tile inside from the entrance
    switch (entryDir) {
      case 'north': entryY++; break;  // Entering from north, move down
      case 'south': entryY--; break;  // Entering from south, move up
      case 'east': entryX--; break;   // Entering from east, move left
      case 'west': entryX++; break;   // Entering from west, move right
    }
    
    // Verify the adjusted position is walkable, if not use the entrance tile
    if (!isWalkable(entryX, entryY)) {
      entryX = bestTile.x;
      entryY = bestTile.y;
    }
    
    console.log(`[ZoneManager] Aligned entry: exited at (${exitX}, ${exitY}) ${fromDirection}, entering at (${entryX}, ${entryY})`);
    return { x: entryX, y: entryY };
  }

  /**
   * Get shop at a specific position
   * @param {number} x - Tile X coordinate
   * @param {number} y - Tile Y coordinate
   * @returns {object|null} Shop data or null
   */
  function getShopAt(x, y) {
    if (!currentZone || !currentZone.shops) return null;
    
    for (const shop of currentZone.shops) {
      const shopWidth = shop.width || 1;
      const shopHeight = shop.height || 1;
      
      // Check if position is within shop bounds
      if (x >= shop.x && x < shop.x + shopWidth &&
          y >= shop.y && y < shop.y + shopHeight) {
        return shop;
      }
    }
    return null;
  }
  
  /**
   * Check if player is adjacent to a shop (can interact)
   * @param {number} playerX - Player tile X
   * @param {number} playerY - Player tile Y
   * @returns {object|null} Adjacent shop data or null
   */
  function getAdjacentShop(playerX, playerY) {
    if (!currentZone || !currentZone.shops) {
      return null;
    }
    
    for (const shop of currentZone.shops) {
      const shopWidth = shop.width || 1;
      const shopHeight = shop.height || 1;
      
      // Check if player is adjacent to or touching the shop bounding box (includes diagonals)
      // This matches the same check used by getAdjacentObject in tilemapRenderer
      if (playerX >= shop.x - 1 && playerX <= shop.x + shopWidth &&
          playerY >= shop.y - 1 && playerY <= shop.y + shopHeight) {
        // Make sure the player is NOT inside the shop itself
        const insideShop = playerX >= shop.x && playerX < shop.x + shopWidth &&
                           playerY >= shop.y && playerY < shop.y + shopHeight;
        if (!insideShop) {
          return shop;
        }
      }
    }
    return null;
  }
  
  /**
   * Get all shops in current zone
   * @returns {Array} Array of shop objects
   */
  function getShops() {
    if (!currentZone || !currentZone.shops) return [];
    return currentZone.shops;
  }
  
  /**
   * Get all castles in current zone
   * @returns {Array} Array of castle objects
   */
  function getCastles() {
    if (!currentZone || !currentZone.objects) return [];
    return currentZone.objects.filter(obj => obj.type === 'castle');
  }
  
  /**
   * Check if player is adjacent to a castle (can interact)
   * @param {number} playerX - Player tile X
   * @param {number} playerY - Player tile Y
   * @returns {object|null} Adjacent castle data or null
   */
  function getAdjacentCastle(playerX, playerY) {
    const castles = getCastles();
    
    for (const castle of castles) {
      const castleWidth = castle.width || 1;
      const castleHeight = castle.height || 1;
      
      // Check all tiles adjacent to the castle
      for (let cx = castle.x; cx < castle.x + castleWidth; cx++) {
        for (let cy = castle.y; cy < castle.y + castleHeight; cy++) {
          // Check if player is adjacent (not diagonal)
          const dx = Math.abs(playerX - cx);
          const dy = Math.abs(playerY - cy);
          
          // Adjacent means one tile away horizontally or vertically (not diagonally)
          if ((dx === 1 && dy === 0) || (dx === 0 && dy === 1)) {
            return castle;
          }
        }
      }
    }
    return null;
  }
  
  /**
   * Get all training dummies in current zone
   * @returns {Array} Array of training dummy objects
   */
  function getTrainingDummies() {
    if (!currentZone || !currentZone.objects) return [];
    return currentZone.objects.filter(obj => obj.type === 'training_dummy');
  }
  
  /**
   * Check if player is adjacent to a training dummy (can interact)
   * @param {number} playerX - Player tile X
   * @param {number} playerY - Player tile Y
   * @returns {object|null} Adjacent training dummy data or null
   */
  function getAdjacentTrainingDummy(playerX, playerY) {
    const dummies = getTrainingDummies();
    
    for (const dummy of dummies) {
      const dummyWidth = dummy.width || 1;
      const dummyHeight = dummy.height || 1;
      
      // Check all tiles adjacent to the dummy
      for (let dx = dummy.x; dx < dummy.x + dummyWidth; dx++) {
        for (let dy = dummy.y; dy < dummy.y + dummyHeight; dy++) {
          // Check if player is adjacent (not diagonal)
          const distX = Math.abs(playerX - dx);
          const distY = Math.abs(playerY - dy);
          
          // Adjacent means one tile away horizontally or vertically (not diagonally)
          if ((distX === 1 && distY === 0) || (distX === 0 && distY === 1)) {
            return dummy;
          }
        }
      }
    }
    return null;
  }
  
  /**
   * Get all market NPCs in current zone
   * @returns {Array} Array of market NPC objects
   */
  function getMarketNpcs() {
    if (!currentZone || !currentZone.npcs) return [];
    return currentZone.npcs.filter(npc => npc.type === 'market');
  }
  
  /**
   * Check if player is adjacent to a market NPC (can interact)
   * @param {number} playerX - Player tile X
   * @param {number} playerY - Player tile Y
   * @returns {object|null} Adjacent market NPC data or null
   */
  function getAdjacentMarketNpc(playerX, playerY) {
    const npcs = getMarketNpcs();
    
    for (const npc of npcs) {
      const npcWidth = npc.width || 1;
      const npcHeight = npc.height || 1;
      
      // Check if player is adjacent (including diagonals)
      if (playerX >= npc.x - 1 && playerX <= npc.x + npcWidth &&
          playerY >= npc.y - 1 && playerY <= npc.y + npcHeight) {
        // Make sure the player is NOT on the NPC
        const insideNpc = playerX >= npc.x && playerX < npc.x + npcWidth &&
                          playerY >= npc.y && playerY < npc.y + npcHeight;
        if (!insideNpc) {
          return npc;
        }
      }
    }
    return null;
  }
  
  /**
   * Check if a tile is a market NPC tile (blocked)
   * @param {number} x - Tile X
   * @param {number} y - Tile Y
   * @returns {boolean}
   */
  function isMarketNpcTile(x, y) {
    const npcs = getMarketNpcs();
    for (const npc of npcs) {
      const npcWidth = npc.width || 1;
      const npcHeight = npc.height || 1;
      if (x >= npc.x && x < npc.x + npcWidth &&
          y >= npc.y && y < npc.y + npcHeight) {
        return true;
      }
    }
    return false;
  }
  
  /**
   * Clear the zone cache (used when map data is modified)
   * @param {string} [zoneId] - Optional specific zone to clear, or all if not provided
   */
  function clearCache(zoneId) {
    if (zoneId) {
      zoneCache.delete(zoneId);
      console.log(`[ZoneManager] Cleared cache for zone: ${zoneId}`);
    } else {
      zoneCache.clear();
      console.log('[ZoneManager] Cleared all zone cache');
    }
  }
  
  // Public API
  return {
    loadZone,
    getCurrentZone,
    getTileAt,
    isWalkable,
    getExitDirection,
    getExitZone,
    getSpawnPoint,
    getEntryPoint,
    getShopAt,
    getAdjacentShop,
    getShops,
    getCastles,
    getAdjacentCastle,
    getTrainingDummies,
    getAdjacentTrainingDummy,
    isShopTile,
    isMarketNpcTile,
    getMarketNpcs,
    getAdjacentMarketNpc,
    clearCache,
    getExitTilesForDirection,
    getAlignedEntryPoint
  };
})();
