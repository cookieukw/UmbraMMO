/**
 * UMBRA ONLINE - Main Server
 * Express server for static files + WebSocket server for game
 */

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const crypto = require('crypto');
const config = require('./config.js');
const CONSTANTS = require('../shared/constants.js');
const database = require('./database.js');
const auth = require('./auth.js');
const mobManager = require('./mobManager.js');
const bossManager = require('./bossManager.js');
const combatManager = require('./combatManager.js');
const skillManager = require('./skillManager.js');
const itemManager = require('./itemManager.js');
const fs = require('fs');

// ===================
// SECURITY CONSTANTS
// ===================
const MAX_MESSAGE_SIZE = 4096;           // 4KB max message size
const MAX_MESSAGES_PER_SECOND = 10;      // Rate limit per player
const MAX_CONNECTIONS_PER_IP = 5;        // Max concurrent connections per IP
const ALLOWED_ORIGINS = config.isProd() 
  ? ['https://umbra.labzts.fun', 'http://umbra.labzts.fun', 'https://labzts.fun', 'http://labzts.fun']
  : null; // Allow all in development

// Ghost player settings
const MAX_GHOSTS_PER_ZONE = 15;
const GHOST_UPDATE_INTERVAL = 5000;      // Send ghost updates every 5 seconds

// Mob sync settings
const MOB_SYNC_INTERVAL = 500;           // Send mob updates every 500ms

// Boss sync settings
const BOSS_SYNC_INTERVAL = 500;          // Send boss updates every 500ms

// Zone data cache
const zoneDataCache = new Map();

// Shop data cache
let shopsData = {};

// Shop sell multiplier (players sell at 80% of item's sellPrice)
const SHOP_SELL_MULTIPLIER = 0.8;

/**
 * Load shop definitions from individual JSON files
 */
function loadShopsData() {
  const shopsDir = path.join(__dirname, '..', 'data', 'shops');
  try {
    const files = fs.readdirSync(shopsDir);
    let loadedCount = 0;
    
    files.forEach(file => {
      // Skip non-JSON files and the old combined shops.json
      if (!file.endsWith('.json') || file === 'shops.json') return;
      
      try {
        const filePath = path.join(shopsDir, file);
        const shopData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        
        if (shopData.id) {
          shopsData[shopData.id] = shopData;
          loadedCount++;
        }
      } catch (err) {
        console.error(`[Server] Error loading shop file ${file}:`, err.message);
      }
    });
    
    console.log(`[Server] Loaded ${loadedCount} shop definitions`);
  } catch (err) {
    console.error('[Server] Error loading shops data:', err);
    shopsData = {};
  }
}
/**
 * Validate a zone ID to prevent path traversal attacks.
 * Only allows alphanumeric characters, underscores, and hyphens.
 */
function isValidZoneId(zoneId) {
  if (typeof zoneId !== 'string') return false;
  if (zoneId.length === 0 || zoneId.length > 50) return false;
  return /^[a-zA-Z0-9_-]+$/.test(zoneId);
}

/**
 * Load zone data from file
 */
function loadZoneData(zoneId) {
  // Validate zoneId to prevent path traversal
  if (!isValidZoneId(zoneId)) {
    console.error(`[Security] Invalid zone ID rejected: "${zoneId}"`);
    return null;
  }

  if (zoneDataCache.has(zoneId)) {
    return zoneDataCache.get(zoneId);
  }
  
  try {
    const zonesDir = path.join(__dirname, '../data/zones');
    const zonePath = path.join(zonesDir, `${zoneId}.json`);
    console.log(`[Server] Loading zone from: ${zonePath}`);
    
    // Check if zones directory exists
    if (!fs.existsSync(zonesDir)) {
      console.error(`[Server] Zones directory does not exist: ${zonesDir}`);
      console.error(`[Server] __dirname is: ${__dirname}`);
      return null;
    }
    
    // List available zones for debugging
    if (!fs.existsSync(zonePath)) {
      const availableZones = fs.readdirSync(zonesDir)
        .filter(f => f.endsWith('.json'))
        .map(f => f.replace('.json', ''))
        .slice(0, 20); // First 20 for brevity
      console.error(`[Server] Zone file not found: ${zonePath}`);
      console.error(`[Server] Available zones (first 20): ${availableZones.join(', ')}`);
      return null;
    }
    
    let data = fs.readFileSync(zonePath, 'utf8');
    // Strip BOM if present (common issue with files saved from certain editors/PowerShell)
    if (data.charCodeAt(0) === 0xFEFF) {
      data = data.slice(1);
    }
    const zoneData = JSON.parse(data);
    
    // Generate default tiles if missing or empty
    if (!zoneData.tiles || !Array.isArray(zoneData.tiles) || zoneData.tiles.length === 0) {
      console.warn(`[Server] Zone ${zoneId} has missing or empty tiles, generating defaults`);
      const width = zoneData.width || CONSTANTS.ZONE_WIDTH;
      const height = zoneData.height || CONSTANTS.ZONE_HEIGHT;
      zoneData.tiles = [];
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
        zoneData.tiles.push(row);
      }
    }
    
    // Ensure zone dimensions are set
    if (!zoneData.width) zoneData.width = zoneData.tiles[0]?.length || CONSTANTS.ZONE_WIDTH;
    if (!zoneData.height) zoneData.height = zoneData.tiles.length || CONSTANTS.ZONE_HEIGHT;
    
    zoneDataCache.set(zoneId, zoneData);
    console.log(`[Server] Successfully loaded zone: ${zoneId}`);
    return zoneData;
  } catch (err) {
    console.error(`[Server] Failed to load zone ${zoneId}:`, err.message);
    console.error(`[Server] __dirname is: ${__dirname}`);
    return null;
  }
}

/**
 * Check if a tile is blocked by a shop in the zone
 * @param {object} zoneData - Zone data object
 * @param {number} x - Tile X coordinate
 * @param {number} y - Tile Y coordinate
 * @returns {boolean} True if blocked by shop
 */
function isShopTile(zoneData, x, y) {
  if (!zoneData || !zoneData.shops) return false;
  
  for (const shop of zoneData.shops) {
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
 * Check if a tile is blocked by a market NPC
 */
function isMarketNpcTile(zoneData, x, y) {
  if (!zoneData || !zoneData.npcs) return false;
  
  for (const npc of zoneData.npcs) {
    if (npc.type !== 'market') continue;
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
 * Check if a tile is walkable (not blocked or shop)
 * @param {object} zoneData - Zone data object
 * @param {number} x - Tile X coordinate
 * @param {number} y - Tile Y coordinate
 * @returns {boolean} True if the tile can be walked on
 */
function isWalkableTile(zoneData, x, y) {
  if (!zoneData) return false;
  
  // Bounds check
  if (x < 0 || x >= zoneData.width || y < 0 || y >= zoneData.height) {
    return false;
  }
  
  // Safety check for tiles array
  if (!zoneData.tiles || !Array.isArray(zoneData.tiles)) {
    return false;
  }
  
  // Safety check for row
  if (!zoneData.tiles[y] || !Array.isArray(zoneData.tiles[y])) {
    return false;
  }
  
  // Check if blocked by shop
  if (isShopTile(zoneData, x, y)) {
    return false;
  }
  
  // Check if blocked by market NPC
  if (isMarketNpcTile(zoneData, x, y)) {
    return false;
  }
  
  // Check tile type - with safety check
  const tile = zoneData.tiles[y][x];
  if (tile === undefined) return false;
  
  // Walkable tiles: WALKABLE (0) and all EXIT types (2-5)
  return tile === CONSTANTS.TILE_TYPES.WALKABLE ||
         tile === CONSTANTS.TILE_TYPES.EXIT_NORTH ||
         tile === CONSTANTS.TILE_TYPES.EXIT_EAST ||
         tile === CONSTANTS.TILE_TYPES.EXIT_SOUTH ||
         tile === CONSTANTS.TILE_TYPES.EXIT_WEST;
}

// ===================
// EXPRESS SETUP
// ===================
const app = express();
const server = http.createServer(app);

// Trust proxy (for when behind Nginx)
if (config.isProd()) {
  app.set('trust proxy', 1);
}

// Security headers
app.use((req, res, next) => {
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // XSS protection (legacy browsers)
  res.setHeader('X-XSS-Protection', '1; mode=block');
  // Referrer policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // Content Security Policy (basic)
  if (config.isProd()) {
    res.setHeader('Content-Security-Policy', 
      "default-src 'self'; " +
      "script-src 'self'; " +
      "style-src 'self' 'unsafe-inline'; " +
      "img-src 'self' data: blob:; " +
      "connect-src 'self' wss://umbra.labzts.fun;"
    );
  }
  next();
});

// Serve static files from client folder
app.use(express.static(path.join(__dirname, '../client')));

// Serve shared folder for client access
app.use('/shared', express.static(path.join(__dirname, '../shared')));

// Serve data folder — only specific subdirectories the client needs (zones, shops)
// SECURITY: Do NOT serve /data directly — umbra.db lives there and would be downloadable
app.use('/data/zones', express.static(path.join(__dirname, '../data/zones'), {
  extensions: ['json'],
  dotfiles: 'deny'
}));
app.use('/data/shops', express.static(path.join(__dirname, '../data/shops'), {
  extensions: ['json'],
  dotfiles: 'deny'
}));

// API endpoint to get item by ID (handles numeric prefix automatically)
app.get('/api/item/:itemId', (req, res) => {
  const item = itemManager.getItem(req.params.itemId);
  if (item) {
    res.json(item);
  } else {
    res.status(404).json({ error: 'Item not found' });
  }
});

// API endpoint to get all items (for client caching)
app.get('/api/items', (req, res) => {
  res.json(itemManager.getAllItems());
});

// API endpoint to get all bosses (for map editor)
app.get('/api/bosses', (req, res) => {
  try {
    const bossesDir = path.join(__dirname, '../data/bosses');
    const files = fs.readdirSync(bossesDir).filter(f => f.endsWith('.json') && f !== 'README.md');
    
    const bosses = files.map(file => {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(bossesDir, file), 'utf8'));
        return {
          id: data.id || file.replace('.json', ''),
          name: data.name || data.id || file.replace('.json', ''),
          level: data.level || 1,
          biome: data.biome || 'unknown'
        };
      } catch (err) {
        return null;
      }
    }).filter(b => b !== null);
    
    // Sort by level, then by name
    bosses.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
    
    res.json(bosses);
  } catch (err) {
    console.error('[Server] Error loading bosses:', err);
    res.status(500).json({ error: 'Failed to load bosses' });
  }
});

// Health check endpoint (minimal info in production)
app.get('/health', (req, res) => {
  if (config.isProd()) {
    res.json({ status: 'ok' });
  } else {
    res.json({ 
      status: 'ok', 
      players: players.size,
      uptime: process.uptime()
    });
  }
});

// Debug endpoint to check zones (development only)
app.get('/api/debug/zones', (req, res) => {
  if (config.isProd()) {
    return res.status(404).json({ error: 'Not found' });
  }
  try {
    const zonesDir = path.join(__dirname, '../data/zones');
    const exists = fs.existsSync(zonesDir);
    
    if (!exists) {
      return res.json({
        error: 'Zones directory not found'
      });
    }
    
    const files = fs.readdirSync(zonesDir)
      .filter(f => f.endsWith('.json'))
      .map(f => f.replace('.json', ''));
    
    res.json({
      zoneCount: files.length,
      zones: files.sort()
    });
  } catch (err) {
    res.json({
      error: 'Failed to read zones'
    });
  }
});

// Debug endpoint to check server version (development only)
app.get('/api/debug/version', (req, res) => {
  if (config.isProd()) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.json({
    version: 'v2024-01-BUILD-003',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Setup authentication routes
auth.setupRoutes(app);

// ===================
// WEBSOCKET SETUP
// ===================

// Track connections per IP for rate limiting
const connectionsPerIP = new Map();

const wss = new WebSocket.Server({ 
  server, 
  path: config.WS_PATH,
  maxPayload: MAX_MESSAGE_SIZE,
  verifyClient: (info, callback) => {
    // Validate origin in production
    if (ALLOWED_ORIGINS) {
      const origin = info.origin || info.req.headers.origin;
      if (!origin || !ALLOWED_ORIGINS.includes(origin)) {
        console.log(`[Security] Rejected connection from origin: ${origin}`);
        callback(false, 403, 'Forbidden origin');
        return;
      }
    }
    
    // Check connection limit per IP
    const ip = info.req.socket.remoteAddress || 
               info.req.headers['x-forwarded-for']?.split(',')[0]?.trim();
    const currentConnections = connectionsPerIP.get(ip) || 0;
    
    if (currentConnections >= MAX_CONNECTIONS_PER_IP) {
      console.log(`[Security] Too many connections from IP: ${ip}`);
      callback(false, 429, 'Too many connections');
      return;
    }
    
    // Store IP for tracking
    info.req.clientIP = ip;
    callback(true);
  }
});

// Store connected players
const players = new Map();

/**
 * Generate a secure random player ID
 */
function generatePlayerId() {
  return crypto.randomBytes(8).toString('hex');
}

// ===================
// WEBSOCKET HANDLERS
// ===================
wss.on('connection', (ws, req) => {
  const clientIP = req.clientIP || req.socket.remoteAddress;
  
  // Update connection count for this IP
  connectionsPerIP.set(clientIP, (connectionsPerIP.get(clientIP) || 0) + 1);
  
  // Assign secure player ID (temporary until authenticated)
  const playerId = generatePlayerId();
  
  // Create player session with rate limiting (unauthenticated initially)
  const player = {
    id: playerId,
    ws: ws,
    ip: clientIP,
    authenticated: false,
    accountId: null,
    name: null,
    characterName: null,
    x: 10,
    y: 7,
    direction: 'down',
    zoneId: 'town_01',
    state: CONSTANTS.PLAYER_STATES.IDLE,
    isAdmin: false,
    // Rate limiting
    messageCount: 0,
    lastMessageReset: Date.now()
  };
  
  players.set(playerId, player);
  
  console.log(`[Server] Connection ${playerId.substring(0, 8)}... from ${clientIP}. Total: ${players.size}`);
  
  // Send connection acknowledgment - client must authenticate
  sendToPlayer(ws, {
    type: CONSTANTS.MSG_TYPES.CONNECT,
    message: 'Connected to Umbra Online. Please authenticate.'
  });
  
  // Handle incoming messages
  ws.on('message', (data) => {
    // Check message size (redundant with maxPayload, but defense in depth)
    if (data.length > MAX_MESSAGE_SIZE) {
      console.log(`[Security] Oversized message from ${playerId.substring(0, 8)}...`);
      return;
    }
    
    // Rate limiting
    const now = Date.now();
    if (now - player.lastMessageReset > 1000) {
      player.messageCount = 0;
      player.lastMessageReset = now;
    }
    
    player.messageCount++;
    if (player.messageCount > MAX_MESSAGES_PER_SECOND) {
      console.log(`[Security] Rate limit exceeded by ${playerId.substring(0, 8)}...`);
      return;
    }
    
    try {
      const message = JSON.parse(data);
      handleMessage(player, message);
    } catch (err) {
      console.error(`[Server] Invalid message from ${playerId.substring(0, 8)}...:`, err.message);
    }
  });
  
  // Handle disconnect
  ws.on('close', () => {
    // Update connection count for this IP
    const currentCount = connectionsPerIP.get(clientIP) || 1;
    if (currentCount <= 1) {
      connectionsPerIP.delete(clientIP);
    } else {
      connectionsPerIP.set(clientIP, currentCount - 1);
    }
    
    // Stop mob sync for this player
    stopMobSync(playerId);
    
    // Stop boss sync for this player
    stopBossSync(playerId);
    
    // Clear player's in-memory boss defeat cache
    const player = players.get(playerId);
    if (player && player.accountId) {
      bossManager.clearPlayerDefeats(player.accountId);
    }
    
    // Stop zone danger for this player
    stopZoneDanger(playerId);
    
    console.log(`[Server] Player ${playerId.substring(0, 8)}... disconnected. Total: ${players.size - 1}`);
    players.delete(playerId);
  });
  
  // Handle errors
  ws.on('error', (err) => {
    console.error(`[Server] WebSocket error for ${playerId.substring(0, 8)}...:`, err.message);
  });
});

// Track mob sync intervals per player
const mobSyncTimers = new Map();

/**
 * Start mob sync for a player
 */
function startMobSync(player) {
  // Clear existing timer
  stopMobSync(player.id);
  
  // Create new sync timer
  const timer = setInterval(() => {
    if (!player.ws || player.ws.readyState !== WebSocket.OPEN) {
      stopMobSync(player.id);
      return;
    }
    
    const mobs = mobManager.getMobsForZone(player.zoneId);
    sendToPlayer(player.ws, {
      type: CONSTANTS.MSG_TYPES.MOB_SYNC,
      mobs: mobs
    });
  }, MOB_SYNC_INTERVAL);
  
  mobSyncTimers.set(player.id, timer);
}

/**
 * Stop mob sync for a player
 */
function stopMobSync(playerId) {
  const timer = mobSyncTimers.get(playerId);
  if (timer) {
    clearInterval(timer);
    mobSyncTimers.delete(playerId);
  }
}

// Track boss sync intervals per player
const bossSyncTimers = new Map();

/**
 * Start boss sync for a player
 */
function startBossSync(player) {
  // Clear existing timer
  stopBossSync(player.id);
  
  // Create new sync timer
  const timer = setInterval(() => {
    if (!player.ws || player.ws.readyState !== WebSocket.OPEN) {
      stopBossSync(player.id);
      return;
    }
    
    // Get bosses filtered by player's defeat status
    const bosses = bossManager.getBossesForPlayer(player.zoneId, player.accountId);
    sendToPlayer(player.ws, {
      type: CONSTANTS.MSG_TYPES.BOSS_SYNC,
      bosses: bosses
    });
  }, BOSS_SYNC_INTERVAL);
  
  bossSyncTimers.set(player.id, timer);
}

/**
 * Stop boss sync for a player
 */
function stopBossSync(playerId) {
  const timer = bossSyncTimers.get(playerId);
  if (timer) {
    clearInterval(timer);
    bossSyncTimers.delete(playerId);
  }
}

// ===================
// PLAYER DEATH SYSTEM
// ===================

/**
 * Handle player death from any source
 * @param {Object} player - The player object
 * @param {string} source - What killed the player ('mob', 'boss', 'zone_danger', 'pvp')
 * @param {Object} killerData - Optional data about what killed the player
 */
async function handlePlayerDeath(player, source = 'unknown', killerData = {}) {
  if (!player || !player.accountId) return;
  
  // Get character data for spawn point and max HP
  const character = await database.getCharacter(player.accountId);
  if (!character) return;
  
  // Get player's spawn point
  const spawnPoint = await database.getSpawnPoint(player.accountId);
  const respawnHp = Math.floor(character.max_hp * 0.5); // Respawn with 50% HP
  
  const updates = {
    hp: respawnHp,
    stamina: character.max_stamina // Restore stamina on death
  };
  
  // Update position to spawn point
  await database.updateCharacterPosition(player.accountId, spawnPoint.zone, spawnPoint.x, spawnPoint.y);
  await database.updateCharacterStats(player.accountId, updates);
  
  // Update server-side player state
  const oldZone = player.zoneId;
  player.zoneId = spawnPoint.zone;
  player.x = spawnPoint.x;
  player.y = spawnPoint.y;
  player.hp = respawnHp;
  
  // Notify other players in old zone that this player left
  if (oldZone !== spawnPoint.zone) {
    broadcastToZone(oldZone, {
      type: CONSTANTS.MSG_TYPES.PLAYER_LEAVE,
      playerId: player.id.substring(0, 8)
    }, player.id);
  }
  
  // Load spawn zone data for name
  const spawnZoneData = loadZoneData(spawnPoint.zone);
  const spawnZoneName = spawnZoneData ? spawnZoneData.name : 'Unknown';
  
  // Build death notification message
  let deathMessage = 'You have been defeated!';
  if (source === 'zone_danger') {
    deathMessage = 'You were overwhelmed by the dangerous environment!';
  } else if (source === 'mob' && killerData.name) {
    deathMessage = `You were defeated by ${killerData.name}!`;
  } else if (source === 'boss' && killerData.name) {
    deathMessage = `You were crushed by ${killerData.name}!`;
  }
  
  // Send death notification
  sendToPlayer(player.ws, {
    type: CONSTANTS.MSG_TYPES.PLAYER_DEATH,
    killedBy: source,
    killerName: killerData.name || null,
    message: deathMessage,
    respawnHp: respawnHp,
    respawnZone: spawnPoint.zone,
    respawnZoneName: spawnZoneName,
    respawnX: spawnPoint.x,
    respawnY: spawnPoint.y
  });
  
  console.log(`[Death] ${player.characterName} was killed by ${source}${killerData.name ? ` (${killerData.name})` : ''}! Respawning at ${spawnZoneName}`);
  
  // Check zone danger for the spawn zone (should be safe typically)
  checkZoneDanger(player);
}

// ===================
// ZONE DANGER SYSTEM
// ===================
// Track zone danger timers per player
const zoneDangerTimers = new Map();

/**
 * Check if a zone is dangerous for a player and start/stop danger accordingly
 */
function checkZoneDanger(player) {
  if (!player || !player.authenticated) return;
  
  const dangerInfo = mobManager.getZoneDangerInfo(player.zoneId);
  
  // If no mobs in zone, stop any existing danger
  if (!dangerInfo) {
    stopZoneDanger(player.id);
    return;
  }
  
  const levelDifference = dangerInfo.level - (player.level || 1);
  
  // Check if zone is dangerous (mobs 5+ levels above player)
  if (levelDifference >= CONSTANTS.ZONE_DANGER_LEVEL_THRESHOLD) {
    // Zone is dangerous - start damage timer if not already running
    if (!zoneDangerTimers.has(player.id)) {
      startZoneDanger(player, dangerInfo);
    }
  } else {
    // Zone is safe - stop any existing danger
    stopZoneDanger(player.id);
  }
}

/**
 * Start zone danger for a player
 */
function startZoneDanger(player, dangerInfo) {
  // Clear any existing timer
  stopZoneDanger(player.id);
  
  const damage = dangerInfo.damage || 1;
  const mobLevel = dangerInfo.level || 1;
  
  // Notify player that they're in a dangerous zone
  sendToPlayer(player.ws, {
    type: CONSTANTS.MSG_TYPES.ZONE_DANGER,
    inDanger: true,
    mobLevel: mobLevel,
    playerLevel: player.level || 1,
    damage: damage,
    message: `This area is too dangerous! (Mobs are level ${mobLevel})`
  });
  
  console.log(`[ZoneDanger] ${player.characterName} entered dangerous zone ${player.zoneId} (mob lvl ${mobLevel}, player lvl ${player.level})`);
  
  // Set up damage timer with initial delay
  const timerData = {
    initialDelay: setTimeout(() => {
      // Apply first damage after initial delay
      applyZoneDamage(player, damage, mobLevel);
      
      // Start recurring damage
      timerData.interval = setInterval(() => {
        applyZoneDamage(player, damage, mobLevel);
      }, CONSTANTS.ZONE_DANGER_INTERVAL);
    }, CONSTANTS.ZONE_DANGER_INITIAL_DELAY),
    interval: null
  };
  
  zoneDangerTimers.set(player.id, timerData);
}

/**
 * Stop zone danger for a player
 */
function stopZoneDanger(playerId) {
  const timerData = zoneDangerTimers.get(playerId);
  if (timerData) {
    if (timerData.initialDelay) {
      clearTimeout(timerData.initialDelay);
    }
    if (timerData.interval) {
      clearInterval(timerData.interval);
    }
    zoneDangerTimers.delete(playerId);
    
    // Notify player they're safe (if still connected)
    const player = players.get(playerId);
    if (player && player.ws && player.ws.readyState === WebSocket.OPEN) {
      sendToPlayer(player.ws, {
        type: CONSTANTS.MSG_TYPES.ZONE_DANGER,
        inDanger: false
      });
    }
  }
}

/**
 * Apply zone damage to a player
 */
async function applyZoneDamage(player, damage, mobLevel) {
  if (!player || !player.ws || player.ws.readyState !== WebSocket.OPEN) {
    stopZoneDanger(player?.id);
    return;
  }
  
  // Re-check if zone is still dangerous (player level might have changed)
  const dangerInfo = mobManager.getZoneDangerInfo(player.zoneId);
  if (!dangerInfo) {
    stopZoneDanger(player.id);
    return;
  }
  
  const levelDifference = dangerInfo.level - (player.level || 1);
  if (levelDifference < CONSTANTS.ZONE_DANGER_LEVEL_THRESHOLD) {
    stopZoneDanger(player.id);
    return;
  }
  
  // Get current HP from database
  const character = await database.getCharacter(player.accountId);
  if (!character) {
    stopZoneDanger(player.id);
    return;
  }
  
  let currentHp = character.hp;
  const maxHp = character.max_hp;
  
  // Apply damage
  currentHp = Math.max(0, currentHp - damage);
  
  // Update database
  await database.updateCharacterHp(player.accountId, currentHp);
  
  // Update player object
  player.hp = currentHp;
  
  // Send damage notification to player
  sendToPlayer(player.ws, {
    type: CONSTANTS.MSG_TYPES.ZONE_DAMAGE,
    damage: damage,
    currentHp: currentHp,
    maxHp: maxHp,
    mobLevel: mobLevel,
    message: `The dangerous environment deals ${damage} damage!`
  });
  
  console.log(`[ZoneDanger] ${player.characterName} took ${damage} damage from zone danger (HP: ${currentHp}/${maxHp})`);
  
  // Check for death
  if (currentHp <= 0) {
    stopZoneDanger(player.id);
    handlePlayerDeath(player, 'zone_danger');
  }
}

/**
 * Sanitize string input - remove HTML/script tags, trim whitespace
 */
function sanitizeString(str, maxLength = 200) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/<[^>]*>/g, '')          // Remove HTML tags
    .replace(/[<>]/g, '')             // Remove any remaining angle brackets
    .trim()
    .substring(0, maxLength);
}

/**
 * Handle incoming message from player
 */
async function handleMessage(player, message) {
  // Validate message type exists
  if (!message || typeof message.type !== 'string') {
    return;
  }
  
  // Only log in development
  if (config.isDev()) {
    console.log(`[Server] Received from ${player.id.substring(0, 8)}...:`, message.type);
  }
  
  // Authentication message - allowed before authenticated
  if (message.type === CONSTANTS.MSG_TYPES.AUTH) {
    await handleAuth(player, message);
    return;
  }
  
  // All other messages require authentication
  if (!player.authenticated) {
    sendToPlayer(player.ws, {
      type: CONSTANTS.MSG_TYPES.AUTH_FAIL,
      error: 'Not authenticated'
    });
    return;
  }
  
  switch (message.type) {
    case CONSTANTS.MSG_TYPES.MOVE:
      handlePlayerMove(player, message);
      break;
      
    case CONSTANTS.MSG_TYPES.ZONE_CHANGE:
      handleZoneChange(player, message);
      break;
    
    case CONSTANTS.MSG_TYPES.ATTACK_MOB:
      handleAttackMob(player, message);
      break;
    
    case CONSTANTS.MSG_TYPES.ZONE_STATE:
      // Client requesting ghost update
      if (message.requestGhosts) {
        handleGhostRequest(player);
      }
      break;
    
    case CONSTANTS.MSG_TYPES.STAT_ALLOCATE:
      handleStatAllocate(player, message);
      break;
    
    case CONSTANTS.MSG_TYPES.SKILL_LEARN:
      handleSkillLearn(player, message);
      break;
    
    case CONSTANTS.MSG_TYPES.SKILL_EQUIP:
      handleSkillEquip(player, message);
      break;
    
    case 'get_skills':
      handleGetSkills(player);
      break;
    
    case 'get_skill_trees':
      handleGetSkillTrees(player);
      break;
    
    case 'admin_heal':
      handleAdminHeal(player);
      break;
    
    case 'admin_add_level':
      handleAdminAddLevel(player);
      break;
    
    case 'admin_reset_character':
      handleAdminResetCharacter(player);
      break;
    
    case 'admin_give_items':
      handleAdminGiveItems(player);
      break;
    
    // Admin Teleport
    case CONSTANTS.MSG_TYPES.ADMIN_TELEPORT:
      handleAdminTeleport(player, message);
      break;
    
    // Admin Map Editor
    case CONSTANTS.MSG_TYPES.ADMIN_GET_MAP_DATA:
      handleAdminGetMapData(player, message);
      break;
    
    case CONSTANTS.MSG_TYPES.ADMIN_SAVE_MAP:
      handleAdminSaveMap(player, message);
      break;
    
    // Inventory messages
    case 'equip_item':
      handleEquipItem(player, message);
      break;
    
    case 'unequip_item':
      handleUnequipItem(player, message);
      break;
    
    case 'use_item':
      handleUseItem(player, message);
      break;
    
    case 'get_inventory':
      handleGetInventory(player);
      break;
    
    case 'move_inventory_item':
      handleMoveInventoryItem(player, message);
      break;
    
    // Shop messages
    case 'shop_buy':
      handleShopBuy(player, message);
      break;
    
    case 'shop_sell':
      handleShopSell(player, message);
      break;
    
    // Player info
    case 'get_player_info':
      handleGetPlayerInfo(player, message);
      break;
    
    // PvP
    case 'pvp_attack':
      handlePvPAttack(player, message);
      break;
    
    // Spawn beacon
    case CONSTANTS.MSG_TYPES.SET_SPAWN:
      handleSetSpawn(player, message);
      break;
    
    // Castle wars
    case CONSTANTS.MSG_TYPES.GET_CASTLE_INFO:
      handleGetCastleInfo(player, message);
      break;
    
    case CONSTANTS.MSG_TYPES.ATTACK_CASTLE:
      handleAttackCastle(player, message);
      break;
    
    // Boss battles
    case CONSTANTS.MSG_TYPES.GET_BOSS_INFO:
      handleGetBossInfo(player, message);
      break;
    
    case CONSTANTS.MSG_TYPES.ATTACK_BOSS:
      handleAttackBoss(player, message);
      break;
    
    // Training
    case CONSTANTS.MSG_TYPES.TRAINING_START:
      handleTrainingStart(player, message);
      break;
    
    case CONSTANTS.MSG_TYPES.TRAINING_STOP:
      handleTrainingStop(player, message);
      break;
    
    case 'get_training_status':
      handleGetTrainingStatus(player);
      break;
    
    // Market messages
    case CONSTANTS.MSG_TYPES.MARKET_OPEN:
      handleMarketOpen(player);
      break;
    
    case CONSTANTS.MSG_TYPES.MARKET_LIST_ITEM:
      handleMarketListItem(player, message);
      break;
    
    case CONSTANTS.MSG_TYPES.MARKET_BUY_ITEM:
      handleMarketBuyItem(player, message);
      break;
    
    case CONSTANTS.MSG_TYPES.MARKET_CANCEL:
      handleMarketCancel(player, message);
      break;
    
    case CONSTANTS.MSG_TYPES.MARKET_SEARCH:
      handleMarketSearch(player, message);
      break;
    
    default:
      if (config.isDev()) {
        console.log(`[Server] Unknown message type: ${message.type}`);
      }
  }
}

/**
 * Handle authentication with session token
 */
async function handleAuth(player, message) {
  const token = message.token;
  
  if (!token) {
    sendToPlayer(player.ws, {
      type: CONSTANTS.MSG_TYPES.AUTH_FAIL,
      error: 'No token provided'
    });
    return;
  }
  
  // Validate session token
  const session = await database.validateSession(token);
  
  if (!session) {
    sendToPlayer(player.ws, {
      type: CONSTANTS.MSG_TYPES.AUTH_FAIL,
      error: 'Invalid or expired session'
    });
    return;
  }
  
  // Check if this account is already logged in
  for (const [existingId, existingPlayer] of players) {
    if (existingPlayer.accountId === session.accountId && existingPlayer.authenticated) {
      // Kick the existing session
      sendToPlayer(existingPlayer.ws, {
        type: CONSTANTS.MSG_TYPES.AUTH_FAIL,
        error: 'Logged in from another location'
      });
      existingPlayer.ws.close();
      players.delete(existingId);
      console.log(`[Server] Kicked existing session for account ${session.username}`);
      break;
    }
  }
  
  // Get character data
  const character = await database.getCharacter(session.accountId);
  
  if (!character) {
    sendToPlayer(player.ws, {
      type: CONSTANTS.MSG_TYPES.AUTH_FAIL,
      error: 'No character found',
      needsCharacter: true
    });
    return;
  }
  
  // Update player with account/character data
  player.authenticated = true;
  player.accountId = session.accountId;
  player.name = session.username;
  player.characterName = character.name;
  player.isAdmin = session.isAdmin;
  player.x = character.x;
  player.y = character.y;
  player.direction = character.direction;
  player.zoneId = character.zone_id;
  player.level = character.level || 1;
  player.hp = character.hp;
  player.maxHp = character.max_hp;
  
  // Load visible equipment (slot -> itemId) for paperdoll rendering
  const equipmentData = await database.getEquipment(session.accountId);
  player.visibleEquipment = {};
  for (const [slot, itemId] of Object.entries(equipmentData)) {
    // Only include visually rendered slots
    if (['headgear', 'chest', 'pants', 'boots', 'weapon1', 'weapon2'].includes(slot)) {
      player.visibleEquipment[slot] = itemId;
    }
  }
  
  console.log(`[Server] Player ${character.name} authenticated (Account: ${session.username})`);
  
  // Load zone data and spawn mobs if needed
  const zoneData = loadZoneData(player.zoneId);
  if (zoneData) {
    mobManager.spawnMobsForZone(player.zoneId, zoneData);
  }
  
  // Load player's boss defeats from DB (for per-player cooldowns)
  await bossManager.loadPlayerDefeats(player.accountId);
  
  // Send success with character data, ghosts, and mobs
  const ghosts = getGhostsForZone(player.zoneId, player.id);
  const mobs = mobManager.getMobsForZone(player.zoneId);
  const mobTypes = mobManager.getMobTypes();
  const bosses = bossManager.getBossesForPlayer(player.zoneId, player.accountId);
  const bossTypes = bossManager.getBossTypes();
  
  sendToPlayer(player.ws, {
    type: CONSTANTS.MSG_TYPES.AUTH_SUCCESS,
    playerId: player.id,
    character: {
      name: character.name,
      level: character.level,
      experience: character.experience || 0,
      zoneId: character.zone_id,
      x: character.x,
      y: character.y,
      direction: character.direction,
      hp: character.hp,
      maxHp: character.max_hp,
      stamina: character.stamina,
      maxStamina: character.max_stamina,
      gold: character.gold,
      statPoints: character.stat_points || 0,
      skillPoints: character.skill_points || 0,
      stats: {
        str: character.str || 1,
        vit: character.vit || 1,
        agi: character.agi || 1,
        dex: character.dex || 1,
        def: character.def || 1,
        int: character.int || 1,
        end: character.end || 1
      }
    },
    isAdmin: session.isAdmin,
    ghosts: ghosts,
    mobs: mobs,
    mobTypes: mobTypes,
    bosses: bosses,
    bossTypes: bossTypes
  });
  
  // Send skill data
  handleGetSkills(player);
  
  // Send inventory data
  handleGetInventory(player);
  
  // Check for training session and process rewards
  const trainingResult = await processTrainingOnLogin(player);
  if (trainingResult) {
    sendToPlayer(player.ws, {
      type: 'training_login_result',
      ...trainingResult
    });
  }
  
  // Start mob sync for this player
  startMobSync(player);
  
  // Start boss sync for this player
  startBossSync(player);
  
  // Initialize bosses for this zone (reuses zoneData from above)
  if (zoneData) {
    bossManager.initializeZone(player.zoneId, zoneData);
  }
  
  // Check if zone is dangerous for this player
  checkZoneDanger(player);
  
  // Notify other players in zone
  broadcastToZone(player.zoneId, {
    type: CONSTANTS.MSG_TYPES.PLAYER_ENTER,
    playerId: player.id.substring(0, 8),
    name: character.name,
    x: player.x,
    y: player.y,
    direction: player.direction,
    equipment: player.visibleEquipment || {}
  }, player.id);
}

/**
 * Handle player movement message
 * Server-authoritative: validates 1-tile distance, walkability, speed, and combat state
 */
function handlePlayerMove(player, message) {
  // Validate position data
  const newX = parseInt(message.x, 10);
  const newY = parseInt(message.y, 10);
  const direction = message.direction;
  
  if (isNaN(newX) || isNaN(newY)) return;
  
  // Load zone data for bounds + walkability check
  const zoneData = loadZoneData(player.zoneId);
  if (!zoneData) return;
  
  // Use zone dimensions (fall back to 20x15)
  const zoneWidth = zoneData.width || 20;
  const zoneHeight = zoneData.height || 15;
  if (newX < 0 || newX >= zoneWidth || newY < 0 || newY >= zoneHeight) return;
  
  // Block movement while in combat
  if (combatManager.isInCombat(player.id)) return;
  
  // --- 1-tile distance validation ---
  const dx = Math.abs(newX - player.x);
  const dy = Math.abs(newY - player.y);
  // Only cardinal movement (1 tile in one axis, 0 in the other)
  if ((dx + dy) !== 1) {
    // Allow 0-distance (re-sync) but not teleportation
    if (dx === 0 && dy === 0) {
      // Just a direction change / re-sync — accept silently
    } else {
      // Teleport attempt — reject and correct the client
      sendToPlayer(player.ws, {
        type: CONSTANTS.MSG_TYPES.ZONE_STATE,
        zoneId: player.zoneId,
        correctedPosition: { x: player.x, y: player.y, direction: player.direction }
      });
      console.log(`[Security] ${player.characterName} move rejected: tried (${player.x},${player.y})->(${newX},${newY}) dist=${dx+dy}`);
      return;
    }
  }
  
  // --- Speed limiting ---
  const now = Date.now();
  const timeSinceLastMove = now - (player.lastMoveTime || 0);
  // Allow a generous buffer (60% of movement speed) to account for network jitter
  const minMoveInterval = Math.floor(CONSTANTS.MOVEMENT_SPEED * 0.6);
  if (timeSinceLastMove < minMoveInterval && player.lastMoveTime) {
    // Moving too fast — silently ignore (don't disconnect, just drop the move)
    return;
  }
  player.lastMoveTime = now;
  
  // Validate the target position is walkable (reuse zoneData loaded above)
  if (!isWalkableTile(zoneData, newX, newY)) {
    // Position is blocked - reject the move silently
    // Client should have already prevented this, so this is just server-side validation
    return;
  }
  
  // Check if player is training - movement interrupts training
  checkAndInterruptTraining(player, 'moved');
  
  // Update player position
  player.x = newX;
  player.y = newY;
  if (['up', 'down', 'left', 'right'].includes(direction)) {
    player.direction = direction;
  }
  
  // Save to database (async, don't wait)
  if (player.accountId) {
    database.updateCharacterPosition(player.accountId, player.zoneId, player.x, player.y, player.direction);
  }
  
  // Broadcast to other players in same zone
  broadcastToZone(player.zoneId, {
    type: CONSTANTS.MSG_TYPES.MOVE_BROADCAST,
    playerId: player.id.substring(0, 8),
    name: player.characterName,
    x: player.x,
    y: player.y,
    direction: player.direction
  }, player.id);
}

/**
 * Handle zone change message — server-authoritative
 * Validates that the player is standing on a valid exit tile in their current zone,
 * that the target zone matches the exit definition, and places the player at the
 * server-determined entry point.
 */
function handleZoneChange(player, message) {
  const requestedZoneId = sanitizeString(message.toZone, 50);
  const exitDirection = message.exitDirection;
  
  if (!requestedZoneId || !isValidZoneId(requestedZoneId)) return;
  
  // Block zone change while in combat
  if (combatManager.isInCombat(player.id)) {
    sendToPlayer(player.ws, {
      type: CONSTANTS.MSG_TYPES.ERROR,
      error: 'Cannot change zones while in combat'
    });
    return;
  }
  
  const oldZoneId = player.zoneId;
  
  // --- Validate player is on an exit tile in their current zone ---
  const currentZoneData = loadZoneData(oldZoneId);
  if (!currentZoneData) return;
  
  const playerTile = currentZoneData.tiles?.[player.y]?.[player.x];
  
  // Determine which exit direction the player's tile corresponds to
  let actualExitDir = null;
  switch (playerTile) {
    case CONSTANTS.TILE_TYPES.EXIT_NORTH: actualExitDir = 'north'; break;
    case CONSTANTS.TILE_TYPES.EXIT_EAST:  actualExitDir = 'east';  break;
    case CONSTANTS.TILE_TYPES.EXIT_SOUTH: actualExitDir = 'south'; break;
    case CONSTANTS.TILE_TYPES.EXIT_WEST:  actualExitDir = 'west';  break;
  }
  
  if (!actualExitDir) {
    // Player is NOT on an exit tile — reject
    console.log(`[Security] ${player.characterName} zone change rejected: not on exit tile at (${player.x},${player.y}) tile=${playerTile} in ${oldZoneId}`);
    sendToPlayer(player.ws, {
      type: CONSTANTS.MSG_TYPES.ERROR,
      error: 'Not on an exit tile'
    });
    return;
  }
  
  // --- Validate the exit leads to the requested zone ---
  const exits = currentZoneData.exits || {};
  const expectedDestination = exits[actualExitDir];
  
  if (!expectedDestination || expectedDestination !== requestedZoneId) {
    console.log(`[Security] ${player.characterName} zone change rejected: exit ${actualExitDir} leads to "${expectedDestination}" but client requested "${requestedZoneId}" in ${oldZoneId}`);
    sendToPlayer(player.ws, {
      type: CONSTANTS.MSG_TYPES.ERROR,
      error: 'Invalid zone transition'
    });
    return;
  }
  
  // --- Load target zone and determine server-authoritative entry point ---
  const newZoneData = loadZoneData(requestedZoneId);
  if (!newZoneData) {
    sendToPlayer(player.ws, {
      type: CONSTANTS.MSG_TYPES.ERROR,
      error: 'Destination zone not found'
    });
    return;
  }
  
  // Determine entry point: use the target zone's entryPoints for the opposite direction
  const oppositeDir = { north: 'south', south: 'north', east: 'west', west: 'east' };
  const entryDir = oppositeDir[actualExitDir]; // entering from the opposite side
  const entryPoints = newZoneData.entryPoints || {};
  const entryPoint = entryPoints[entryDir];
  
  let newX, newY;
  if (entryPoint) {
    newX = entryPoint.x;
    newY = entryPoint.y;
  } else if (newZoneData.spawns && newZoneData.spawns[0]) {
    // Fallback to spawn point
    newX = newZoneData.spawns[0].x;
    newY = newZoneData.spawns[0].y;
  } else {
    // Last resort: center of map
    newX = Math.floor((newZoneData.width || 20) / 2);
    newY = Math.floor((newZoneData.height || 15) / 2);
  }
  
  // --- Apply the zone change ---
  player.zoneId = requestedZoneId;
  player.x = newX;
  player.y = newY;
  
  console.log(`[Server] ${player.characterName || player.id.substring(0, 8)} moved from ${oldZoneId} to ${requestedZoneId} via ${actualExitDir} exit -> entry (${newX},${newY})`);
  
  // Save to database
  if (player.accountId) {
    database.updateCharacterPosition(player.accountId, player.zoneId, player.x, player.y, player.direction);
  }
  
  // Notify old zone players that this player left
  broadcastToZone(oldZoneId, {
    type: CONSTANTS.MSG_TYPES.PLAYER_LEAVE,
    playerId: player.id.substring(0, 8)
  }, player.id);
  
  // Load zone data and spawn mobs if needed
  if (newZoneData) {
    mobManager.spawnMobsForZone(requestedZoneId, newZoneData);
    bossManager.initializeZone(requestedZoneId, newZoneData);
  }
  
  // Send ghosts, mobs, and bosses in new zone to this player
  const ghosts = getGhostsForZone(requestedZoneId, player.id);
  const mobs = mobManager.getMobsForZone(requestedZoneId);
  const mobTypes = mobManager.getMobTypes();
  const bosses = bossManager.getBossesForPlayer(requestedZoneId, player.accountId);
  const bossTypes = bossManager.getBossTypes();
  
  sendToPlayer(player.ws, {
    type: CONSTANTS.MSG_TYPES.ZONE_STATE,
    zoneId: requestedZoneId,
    entryX: newX,
    entryY: newY,
    ghosts: ghosts,
    mobs: mobs,
    mobTypes: mobTypes,
    bosses: bosses,
    bossTypes: bossTypes
  });
  
  // Notify new zone players that this player entered
  broadcastToZone(requestedZoneId, {
    type: CONSTANTS.MSG_TYPES.PLAYER_ENTER,
    playerId: player.id.substring(0, 8),
    name: player.characterName,
    x: player.x,
    y: player.y,
    direction: player.direction,
    equipment: player.visibleEquipment || {}
  }, player.id);
  
  // Check if new zone is dangerous for this player
  checkZoneDanger(player);
}

/**
 * Handle ghost request - client wants updated ghost list
 */
function handleGhostRequest(player) {
  const ghosts = getGhostsForZone(player.zoneId, player.id);
  sendToPlayer(player.ws, {
    type: CONSTANTS.MSG_TYPES.ZONE_STATE,
    zoneId: player.zoneId,
    ghosts: ghosts,
    isGhostSync: true  // Flag to indicate this is just a ghost sync, not a zone change
  });
}

/**
 * Handle stat allocation — server-authoritative
 * Client sends only { type: "stat_allocate", stat: "str" }
 * Server validates the player has stat_points, increments the stat,
 * decrements the points, recalculates derived stats, and responds
 * with the full authoritative character state.
 */
async function handleStatAllocate(player, message) {
  if (!player.accountId) return;
  
  const statName = message.stat;
  const validStats = ['str', 'vit', 'agi', 'dex', 'def', 'int', 'end'];
  
  if (!statName || !validStats.includes(statName)) {
    sendToPlayer(player.ws, {
      type: 'stat_allocate_response',
      success: false,
      error: 'Invalid stat'
    });
    return;
  }
  
  // Get authoritative character data from database
  const character = await database.getCharacter(player.accountId);
  if (!character) {
    sendToPlayer(player.ws, {
      type: 'stat_allocate_response',
      success: false,
      error: 'Character not found'
    });
    return;
  }
  
  // Validate player has stat points to spend
  if ((character.stat_points || 0) < 1) {
    sendToPlayer(player.ws, {
      type: 'stat_allocate_response',
      success: false,
      error: 'No stat points available'
    });
    return;
  }
  
  // Build the update: +1 to the chosen stat, -1 stat point
  const updates = {};
  updates[statName] = (character[statName] || 1) + 1;
  updates.stat_points = character.stat_points - 1;
  
  // Recalculate derived stats if VIT or END changed
  if (statName === 'vit') {
    const newVit = updates.vit;
    updates.max_hp = CONSTANTS.BASE_HP + (newVit * CONSTANTS.HP_PER_VIT);
    // Heal to new max if currently at full HP
    if (character.hp >= character.max_hp) {
      updates.hp = updates.max_hp;
    }
  }
  
  if (statName === 'end') {
    const newEnd = updates.end;
    updates.max_stamina = CONSTANTS.BASE_STAMINA + (newEnd * CONSTANTS.STAMINA_PER_END);
    updates.stamina = updates.max_stamina;
  }
  
  // Save to database
  const success = await database.updateCharacterStats(player.accountId, updates);
  
  if (!success) {
    sendToPlayer(player.ws, {
      type: 'stat_allocate_response',
      success: false,
      error: 'Failed to save stats'
    });
    return;
  }
  
  if (config.isDev()) {
    console.log(`[Server] ${player.characterName} allocated 1 point to ${statName} (now ${updates[statName]}), ${updates.stat_points} points remaining`);
  }
  
  // Re-read the full character to send back authoritative state
  const updated = await database.getCharacter(player.accountId);
  
  // Send authoritative response back to client
  sendToPlayer(player.ws, {
    type: 'stat_allocate_response',
    success: true,
    stat: statName,
    character: {
      level: updated.level,
      experience: updated.experience,
      hp: updated.hp,
      maxHp: updated.max_hp,
      stamina: updated.stamina,
      maxStamina: updated.max_stamina,
      statPoints: updated.stat_points,
      skillPoints: updated.skill_points,
      str: updated.str,
      vit: updated.vit,
      agi: updated.agi,
      dex: updated.dex,
      def: updated.def,
      int: updated.int,
      end: updated.end
    }
  });
}

/**
 * Handle admin heal request
 */
async function handleAdminHeal(player) {
  if (!player.accountId) return;
  
  // Check if player is admin
  if (!player.isAdmin) {
    sendToPlayer(player.ws, {
      type: 'admin_heal_response',
      success: false,
      message: 'Not authorized'
    });
    return;
  }
  
  // Get character data to get max HP
  const character = await database.getCharacter(player.accountId);
  if (!character) return;
  
  const maxHp = character.max_hp || 100;
  
  // Update HP to max
  const success = await database.updateCharacterStats(player.accountId, {
    hp: maxHp
  });
  
  if (success) {
    console.log(`[Admin] Full heal for ${player.characterName} (HP: ${maxHp}/${maxHp})`);
    
    sendToPlayer(player.ws, {
      type: 'admin_heal_response',
      success: true,
      hp: maxHp,
      maxHp: maxHp
    });
  } else {
    sendToPlayer(player.ws, {
      type: 'admin_heal_response',
      success: false,
      message: 'Failed to heal'
    });
  }
}

/**
 * Handle admin add level request
 */
async function handleAdminAddLevel(player) {
  if (!player.accountId) return;
  
  // Check if player is admin
  if (!player.isAdmin) {
    sendToPlayer(player.ws, {
      type: 'admin_add_level_response',
      success: false,
      message: 'Not authorized'
    });
    return;
  }
  
  // Get character data
  const character = await database.getCharacter(player.accountId);
  if (!character) return;
  
  const newLevel = (character.level || 1) + 1;
  // Max HP only depends on VIT, not level
  const newMaxHp = CONSTANTS.BASE_HP + ((character.vit || 1) * CONSTANTS.HP_PER_VIT);
  
  // Update level and give stat/skill points
  const success = await database.updateCharacterStats(player.accountId, {
    level: newLevel,
    stat_points: (character.stat_points || 0) + CONSTANTS.STAT_POINTS_PER_LEVEL,
    skill_points: (character.skill_points || 0) + CONSTANTS.SKILL_POINTS_PER_LEVEL,
    max_hp: newMaxHp,
    hp: newMaxHp // Full heal on level up
  });
  
  if (success) {
    console.log(`[Admin] Level up for ${player.characterName} (Level ${character.level} -> ${newLevel})`);
    
    sendToPlayer(player.ws, {
      type: 'admin_add_level_response',
      success: true,
      level: newLevel,
      statPoints: (character.stat_points || 0) + CONSTANTS.STAT_POINTS_PER_LEVEL,
      skillPoints: (character.skill_points || 0) + CONSTANTS.SKILL_POINTS_PER_LEVEL,
      maxHp: newMaxHp,
      hp: newMaxHp
    });
  } else {
    sendToPlayer(player.ws, {
      type: 'admin_add_level_response',
      success: false,
      message: 'Failed to add level'
    });
  }
}

/**
 * Handle admin character reset request
 */
async function handleAdminResetCharacter(player) {
  if (!player.accountId) return;
  
  // Check if player is admin
  if (!player.isAdmin) {
    sendToPlayer(player.ws, {
      type: 'admin_reset_response',
      success: false,
      message: 'Not authorized'
    });
    return;
  }
  
  // Reset character stats to defaults
  const resetStats = {
    level: 1,
    experience: 0,
    hp: 50,
    max_hp: 50,
    stamina: 50,
    max_stamina: 50,
    gold: 0,
    stat_points: 0,
    skill_points: 0,
    str: 1,
    vit: 1,
    agi: 1,
    dex: 1,
    def: 1,
    int: 1,
    end: 1
  };
  
  const statsSuccess = await database.updateCharacterStats(player.accountId, resetStats);
  
  // Reset skills (clear learned and equipped skills)
  const skillsSuccess = await database.resetCharacterSkills(player.accountId);
  
  // Clear inventory and equipment
  const inventorySuccess = await database.clearInventory(player.accountId);
  const equipmentSuccess = await database.clearEquipment(player.accountId);
  
  if (statsSuccess) {
    console.log(`[Admin] Character reset for ${player.characterName} (inventory: ${inventorySuccess}, equipment: ${equipmentSuccess})`);
    
    // Send full character data update to client
    sendToPlayer(player.ws, {
      type: 'admin_reset_response',
      success: true,
      character: {
        level: 1,
        experience: 0,
        hp: 50,
        maxHp: 50,
        stamina: 50,
        maxStamina: 50,
        gold: 0,
        statPoints: 0,
        skillPoints: 0,
        stats: {
          str: 1,
          vit: 1,
          agi: 1,
          dex: 1,
          def: 1,
          int: 1,
          end: 1
        }
      },
      skills: {
        learned: {},
        equipped: [null, null, null, null]
      },
      inventory: [],
      equipment: {}
    });
  } else {
    sendToPlayer(player.ws, {
      type: 'admin_reset_response',
      success: false,
      message: 'Failed to reset character'
    });
  }
}

/**
 * Handle admin give items (testing)
 */
async function handleAdminGiveItems(player) {
  if (!player.accountId) return;
  
  // Check if player is admin
  if (!player.isAdmin) {
    sendToPlayer(player.ws, {
      type: 'admin_give_items_response',
      success: false,
      message: 'Not authorized'
    });
    return;
  }
  
  // Get all items and pick 5 random ones
  const allItems = Object.values(itemManager.getAllItems());
  if (allItems.length === 0) {
    sendToPlayer(player.ws, {
      type: 'admin_give_items_response',
      success: false,
      message: 'No items loaded'
    });
    return;
  }
  
  const count = Math.min(5, allItems.length);
  const givenItems = [];
  
  for (let i = 0; i < count; i++) {
    const randomItem = allItems[Math.floor(Math.random() * allItems.length)];
    await database.addToInventory(player.accountId, randomItem.id, 1);
    givenItems.push({ name: randomItem.name, icon: randomItem.icon || '📦', rarity: randomItem.rarity || 'common' });
  }
  
  console.log(`[Admin] Gave ${count} random items to ${player.characterName}: ${givenItems.map(i => i.name).join(', ')}`);
  
  // Send updated inventory
  await handleGetInventory(player);
  
  sendToPlayer(player.ws, {
    type: 'admin_give_items_response',
    success: true,
    message: `Received ${count} random items!`,
    itemCount: count,
    items: givenItems
  });
}

/**
 * Handle admin teleport request
 */
async function handleAdminTeleport(player, message) {
  console.log(`[Teleport] === TELEPORT HANDLER CALLED ===`);
  console.log(`[Teleport] Message received:`, JSON.stringify(message));
  
  if (!player.accountId) return;
  
  // Check if player is admin
  if (!player.isAdmin) {
    sendToPlayer(player.ws, {
      type: CONSTANTS.MSG_TYPES.ADMIN_TELEPORT_RESPONSE,
      success: false,
      error: 'Not authorized'
    });
    return;
  }
  
  const zoneId = sanitizeString(message.zoneId, 50);
  
  console.log(`[Teleport] Admin teleport request to zone: "${zoneId}" (raw: "${message.zoneId}")`);
  
  if (!zoneId || !isValidZoneId(zoneId)) {
    sendToPlayer(player.ws, {
      type: CONSTANTS.MSG_TYPES.ADMIN_TELEPORT_RESPONSE,
      success: false,
      error: 'Invalid zone ID'
    });
    return;
  }
  
  // Clear cache for this zone to ensure fresh load (in case it was cached as null)
  zoneDataCache.delete(zoneId);
  
  // Check if zone exists
  const zoneData = loadZoneData(zoneId);
  
  console.log(`[Teleport] Zone data loaded: ${zoneData ? 'yes' : 'no'}`);
  
  if (!zoneData) {
    sendToPlayer(player.ws, {
      type: CONSTANTS.MSG_TYPES.ADMIN_TELEPORT_RESPONSE,
      success: false,
      error: `Zone "${zoneId}" not found`
    });
    return;
  }
  
  const oldZoneId = player.zoneId;
  
  // Get spawn point for the zone
  const spawnPoint = zoneData.spawns && zoneData.spawns[0] 
    ? zoneData.spawns[0] 
    : { x: Math.floor(zoneData.width / 2), y: Math.floor(zoneData.height / 2) };
  
  // Update player location
  player.zoneId = zoneId;
  player.x = spawnPoint.x;
  player.y = spawnPoint.y;
  
  // Update database (use updateCharacterPosition which handles zone_id)
  await database.updateCharacterPosition(player.accountId, zoneId, spawnPoint.x, spawnPoint.y, player.direction);
  
  // Notify old zone players that this player left
  if (oldZoneId && oldZoneId !== zoneId) {
    broadcastToZone(oldZoneId, {
      type: CONSTANTS.MSG_TYPES.PLAYER_LEAVE,
      playerId: player.id.substring(0, 8)
    }, player.id);
  }
  
  // Notify new zone players that this player entered
  broadcastToZone(zoneId, {
    type: CONSTANTS.MSG_TYPES.PLAYER_ENTER,
    playerId: player.id.substring(0, 8),
    name: player.characterName,
    x: player.x,
    y: player.y,
    direction: player.direction,
    equipment: player.visibleEquipment || {}
  }, player.id);
  
  console.log(`[Admin] ${player.characterName} teleported to ${zoneId} (${spawnPoint.x}, ${spawnPoint.y})`);
  
  sendToPlayer(player.ws, {
    type: CONSTANTS.MSG_TYPES.ADMIN_TELEPORT_RESPONSE,
    success: true,
    zoneId: zoneId,
    x: spawnPoint.x,
    y: spawnPoint.y
  });
}

/**
 * Handle admin get map data request
 */
async function handleAdminGetMapData(player, message) {
  if (!player.accountId) return;
  
  // Check if player is admin
  if (!player.isAdmin) {
    sendToPlayer(player.ws, {
      type: CONSTANTS.MSG_TYPES.ADMIN_MAP_DATA,
      success: false,
      error: 'Not authorized'
    });
    return;
  }
  
  // Check if map editor is enabled
  if (!config.ENABLE_MAP_EDITOR) {
    sendToPlayer(player.ws, {
      type: CONSTANTS.MSG_TYPES.ADMIN_MAP_DATA,
      success: false,
      error: 'Map editor is disabled'
    });
    return;
  }
  
  const zoneId = sanitizeString(message.zoneId, 50);
  
  console.log(`[MapEditor] Getting map data for zone: "${zoneId}" (raw: "${message.zoneId}")`);
  
  if (!zoneId || !isValidZoneId(zoneId)) {
    sendToPlayer(player.ws, {
      type: CONSTANTS.MSG_TYPES.ADMIN_MAP_DATA,
      success: false,
      error: 'Invalid zone ID'
    });
    return;
  }
  
  // Load zone data directly from file (bypass cache to get fresh data)
  try {
    const zonePath = path.join(__dirname, '../data/zones', `${zoneId}.json`);
    console.log(`[MapEditor] Looking for file at: ${zonePath}`);
    console.log(`[MapEditor] File exists: ${fs.existsSync(zonePath)}`);
    let data = fs.readFileSync(zonePath, 'utf8');
    // Strip BOM if present
    if (data.charCodeAt(0) === 0xFEFF) {
      data = data.slice(1);
    }
    const zoneData = JSON.parse(data);
    
    console.log(`[MapEditor] Successfully loaded zone data for: ${zoneId}`);
    
    sendToPlayer(player.ws, {
      type: CONSTANTS.MSG_TYPES.ADMIN_MAP_DATA,
      success: true,
      zoneId: zoneId,
      tiles: zoneData.tiles,
      entryPoints: zoneData.entryPoints || {},
      exits: zoneData.exits || {}
    });
  } catch (err) {
    console.error(`[MapEditor] Error loading zone ${zoneId}:`, err.message);
    sendToPlayer(player.ws, {
      type: CONSTANTS.MSG_TYPES.ADMIN_MAP_DATA,
      success: false,
      error: `Zone "${zoneId}" not found`
    });
  }
}

/**
 * Handle admin save map request (password protected)
 */
async function handleAdminSaveMap(player, message) {
  if (!player.accountId) return;
  
  // Check if player is admin
  if (!player.isAdmin) {
    sendToPlayer(player.ws, {
      type: CONSTANTS.MSG_TYPES.ADMIN_SAVE_MAP_RESPONSE,
      success: false,
      error: 'Not authorized'
    });
    return;
  }
  
  // Check if map editor is enabled
  if (!config.ENABLE_MAP_EDITOR) {
    sendToPlayer(player.ws, {
      type: CONSTANTS.MSG_TYPES.ADMIN_SAVE_MAP_RESPONSE,
      success: false,
      error: 'Map editor is disabled'
    });
    return;
  }
  
  // Verify password — ADMIN_MAP_PASSWORD must be set in .env
  const password = message.password;
  if (!config.ADMIN_MAP_PASSWORD || password !== config.ADMIN_MAP_PASSWORD) {
    sendToPlayer(player.ws, {
      type: CONSTANTS.MSG_TYPES.ADMIN_SAVE_MAP_RESPONSE,
      success: false,
      error: 'Invalid password'
    });
    console.log(`[Admin] Invalid map save password attempt by ${player.characterName}`);
    return;
  }
  
  const zoneId = sanitizeString(message.zoneId, 50);
  const tiles = message.tiles;
  const entryPoints = message.entryPoints;
  
  if (!zoneId || !isValidZoneId(zoneId) || !tiles) {
    sendToPlayer(player.ws, {
      type: CONSTANTS.MSG_TYPES.ADMIN_SAVE_MAP_RESPONSE,
      success: false,
      error: 'Invalid map data'
    });
    return;
  }
  
  try {
    const zonePath = path.join(__dirname, '../data/zones', `${zoneId}.json`);
    
    // Read existing zone data
    const existingData = fs.readFileSync(zonePath, 'utf8');
    const zoneData = JSON.parse(existingData);
    
    // Create backup before modifying
    const backupPath = path.join(__dirname, '../data/zones/backups');
    if (!fs.existsSync(backupPath)) {
      fs.mkdirSync(backupPath, { recursive: true });
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    fs.writeFileSync(
      path.join(backupPath, `${zoneId}_${timestamp}.json`),
      existingData
    );
    
    // Update tiles and entry points
    zoneData.tiles = tiles;
    if (entryPoints) {
      zoneData.entryPoints = entryPoints;
    }
    
    // Save updated zone data
    fs.writeFileSync(zonePath, JSON.stringify(zoneData, null, 2));
    
    // Clear zone cache so new data is loaded
    zoneDataCache.delete(zoneId);
    
    console.log(`[Admin] ${player.characterName} saved map ${zoneId}`);
    
    sendToPlayer(player.ws, {
      type: CONSTANTS.MSG_TYPES.ADMIN_SAVE_MAP_RESPONSE,
      success: true,
      zoneId: zoneId
    });
  } catch (err) {
    console.error(`[Admin] Failed to save map ${zoneId}:`, err);
    sendToPlayer(player.ws, {
      type: CONSTANTS.MSG_TYPES.ADMIN_SAVE_MAP_RESPONSE,
      success: false,
      error: 'Failed to save map'
    });
  }
}

/**
 * Handle get inventory request
 */
async function handleGetInventory(player) {
  if (!player.accountId) return;
  
  // Get inventory from database
  const inventoryRows = await database.getInventory(player.accountId);
  const equipment = await database.getEquipment(player.accountId);
  
  // Build inventory with item data
  const inventory = inventoryRows.map(row => {
    const itemData = itemManager.getItem(row.item_id);
    return {
      itemId: row.item_id,
      quantity: row.quantity,
      slotIndex: row.slot_index,
      item: itemData
    };
  });
  
  // Build equipment with item data
  const equippedItems = {};
  for (const [slot, itemId] of Object.entries(equipment)) {
    equippedItems[slot] = {
      itemId: itemId,
      item: itemManager.getItem(itemId)
    };
  }
  
  // Calculate equipment bonuses
  const equipmentBonuses = itemManager.calculateEquipmentBonuses(equipment);
  
  sendToPlayer(player.ws, {
    type: 'inventory_update',
    inventory: inventory,
    equipment: equippedItems,
    equipmentBonuses: equipmentBonuses,
    inventorySize: Math.min(8 + (equipmentBonuses.bonusSlots || 0), 36)
  });
}

/**
 * Handle equip item
 */
async function handleEquipItem(player, message) {
  if (!player.accountId) return;
  
  const { itemId, slot } = message;
  
  if (!itemId || !slot) {
    sendToPlayer(player.ws, {
      type: 'equip_item_response',
      success: false,
      message: 'Invalid request'
    });
    return;
  }
  
  // Verify item is in inventory
  const inventory = await database.getInventory(player.accountId);
  const inventoryItem = inventory.find(i => i.item_id === itemId);
  
  if (!inventoryItem) {
    sendToPlayer(player.ws, {
      type: 'equip_item_response',
      success: false,
      message: 'Item not in inventory'
    });
    return;
  }
  
  // Verify item can be equipped in this slot
  if (!itemManager.canEquipInSlot(itemId, slot)) {
    sendToPlayer(player.ws, {
      type: 'equip_item_response',
      success: false,
      message: 'Item cannot be equipped in this slot'
    });
    return;
  }
  
  // Check if there's already an item in this slot
  const currentEquipment = await database.getEquipment(player.accountId);
  const currentItemId = currentEquipment[slot];
  
  // Remove item from inventory (1 from stack)
  await database.removeFromInventory(player.accountId, itemId, 1);
  
  // If there was an item equipped, add it back to inventory
  if (currentItemId) {
    await database.addToInventory(player.accountId, currentItemId, 1);
  }
  
  // Equip new item
  await database.equipItem(player.accountId, slot, itemId);
  
  // Update visible equipment on player object for paperdoll
  if (['headgear', 'chest', 'pants', 'boots', 'weapon1', 'weapon2'].includes(slot)) {
    if (!player.visibleEquipment) player.visibleEquipment = {};
    player.visibleEquipment[slot] = itemId;
    // Broadcast equipment change to other players in zone
    broadcastToZone(player.zoneId, {
      type: 'equipment_changed',
      playerId: player.id.substring(0, 8),
      equipment: player.visibleEquipment
    }, player.id);
  }
  
  console.log(`[Inventory] ${player.characterName} equipped ${itemId} in ${slot}`);
  
  // Send updated inventory
  await handleGetInventory(player);
  
  sendToPlayer(player.ws, {
    type: 'equip_item_response',
    success: true
  });
}

/**
 * Handle unequip item
 */
async function handleUnequipItem(player, message) {
  if (!player.accountId) return;
  
  const { slot } = message;
  
  if (!slot) {
    sendToPlayer(player.ws, {
      type: 'unequip_item_response',
      success: false,
      message: 'Invalid request'
    });
    return;
  }
  
  // Check if there's an item in this slot
  const currentEquipment = await database.getEquipment(player.accountId);
  const itemId = currentEquipment[slot];
  
  if (!itemId) {
    sendToPlayer(player.ws, {
      type: 'unequip_item_response',
      success: false,
      message: 'No item in this slot'
    });
    return;
  }
  
  // Add item back to inventory
  await database.addToInventory(player.accountId, itemId, 1);
  
  // Unequip item
  await database.unequipItem(player.accountId, slot);
  
  // Update visible equipment on player object for paperdoll
  if (['headgear', 'chest', 'pants', 'boots', 'weapon1', 'weapon2'].includes(slot)) {
    if (!player.visibleEquipment) player.visibleEquipment = {};
    delete player.visibleEquipment[slot];
    // Broadcast equipment change to other players in zone
    broadcastToZone(player.zoneId, {
      type: 'equipment_changed',
      playerId: player.id.substring(0, 8),
      equipment: player.visibleEquipment
    }, player.id);
  }
  
  console.log(`[Inventory] ${player.characterName} unequipped ${itemId} from ${slot}`);
  
  // Send updated inventory
  await handleGetInventory(player);
  
  sendToPlayer(player.ws, {
    type: 'unequip_item_response',
    success: true
  });
}

/**
 * Handle use item (consumables)
 */
async function handleUseItem(player, message) {
  if (!player.accountId) return;
  
  const { itemId } = message;
  
  if (!itemId) {
    sendToPlayer(player.ws, {
      type: 'use_item_response',
      success: false,
      message: 'Invalid request'
    });
    return;
  }
  
  // Verify item is in inventory
  const inventory = await database.getInventory(player.accountId);
  const inventoryItem = inventory.find(i => i.item_id === itemId);
  
  if (!inventoryItem) {
    sendToPlayer(player.ws, {
      type: 'use_item_response',
      success: false,
      message: 'Item not in inventory'
    });
    return;
  }
  
  // Verify item is usable
  if (!itemManager.isUsable(itemId)) {
    sendToPlayer(player.ws, {
      type: 'use_item_response',
      success: false,
      message: 'Item cannot be used'
    });
    return;
  }
  
  // Get use effect
  const effect = itemManager.getUseEffect(itemId);
  const itemData = itemManager.getItem(itemId);
  
  if (!effect) {
    sendToPlayer(player.ws, {
      type: 'use_item_response',
      success: false,
      message: 'Item has no effect'
    });
    return;
  }
  
  // Get current character data
  const character = await database.getCharacter(player.accountId);
  if (!character) return;
  
  let resultMessage = '';
  const updates = {};
  
  // Apply effect
  switch (effect.type) {
    case 'heal':
      const newHp = Math.min(character.max_hp, character.hp + effect.value);
      const healAmount = newHp - character.hp;
      updates.hp = newHp;
      resultMessage = `Healed ${healAmount} HP`;
      break;
      
    case 'exp':
      updates.experience = (character.experience || 0) + effect.value;
      resultMessage = `Gained ${effect.value} EXP`;
      break;
      
    default:
      sendToPlayer(player.ws, {
        type: 'use_item_response',
        success: false,
        message: 'Unknown effect type'
      });
      return;
  }
  
  // Remove item from inventory
  await database.removeFromInventory(player.accountId, itemId, 1);
  
  // Apply updates to character
  if (Object.keys(updates).length > 0) {
    await database.updateCharacterStats(player.accountId, updates);
  }
  
  console.log(`[Inventory] ${player.characterName} used ${itemData.name}: ${resultMessage}`);
  
  // Send updated inventory
  await handleGetInventory(player);
  
  // Send stats update
  sendToPlayer(player.ws, {
    type: 'use_item_response',
    success: true,
    message: resultMessage,
    itemName: itemData.name,
    updates: updates
  });
}

/**
 * Handle moving/swapping inventory items between slots
 */
async function handleMoveInventoryItem(player, message) {
  if (!player.accountId) return;
  
  const { fromSlot, toSlot } = message;
  
  if (fromSlot === undefined || toSlot === undefined || fromSlot === toSlot) {
    sendToPlayer(player.ws, {
      type: 'move_inventory_response',
      success: false,
      message: 'Invalid request'
    });
    return;
  }
  
  // Move or swap items
  const success = await database.moveInventoryItem(player.accountId, fromSlot, toSlot);
  
  if (success) {
    console.log(`[Inventory] ${player.characterName} moved item from slot ${fromSlot} to slot ${toSlot}`);
    
    // Send updated inventory
    await handleGetInventory(player);
    
    sendToPlayer(player.ws, {
      type: 'move_inventory_response',
      success: true
    });
  } else {
    sendToPlayer(player.ws, {
      type: 'move_inventory_response',
      success: false,
      message: 'Failed to move item'
    });
  }
}

// ===================
// SHOP HANDLERS
// ===================

/**
 * Handle shop buy request
 */
async function handleShopBuy(player, message) {
  if (!player.accountId) return;
  
  const { shopId, itemId } = message;
  const quantity = parseInt(message.quantity, 10);
  
  // Validate inputs (cap quantity to prevent overflow)
  if (!shopId || !itemId || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
    sendToPlayer(player.ws, {
      type: 'shop_buy_response',
      success: false,
      message: 'Invalid request'
    });
    return;
  }
  
  // Get shop data
  const shop = shopsData[shopId];
  if (!shop) {
    sendToPlayer(player.ws, {
      type: 'shop_buy_response',
      success: false,
      message: 'Shop not found'
    });
    return;
  }
  
  // Find item in shop inventory
  const shopItem = shop.inventory.find(i => i.itemId === itemId);
  if (!shopItem) {
    sendToPlayer(player.ws, {
      type: 'shop_buy_response',
      success: false,
      message: 'Item not available in this shop'
    });
    return;
  }
  
  // Get item definition
  const itemDef = itemManager.getItem(itemId);
  if (!itemDef) {
    sendToPlayer(player.ws, {
      type: 'shop_buy_response',
      success: false,
      message: 'Item definition not found'
    });
    return;
  }
  
  // Calculate total price
  const totalPrice = shopItem.price * quantity;
  
  // Get player gold
  const character = await database.getCharacter(player.accountId);
  if (!character || character.gold < totalPrice) {
    sendToPlayer(player.ws, {
      type: 'shop_buy_response',
      success: false,
      message: 'Not enough gold'
    });
    return;
  }
  
  // Process transaction
  // 1. Deduct gold
  const newGold = character.gold - totalPrice;
  await database.updateCharacterStats(player.accountId, { gold: newGold });
  
  // 2. Add item to inventory
  await database.addToInventory(player.accountId, itemId, quantity);
  
  // 3. Update stock (if not unlimited) - Note: shop stock is per-server-instance currently
  // TODO: Implement persistent shop stock per player or global
  
  console.log(`[Shop] ${player.characterName} bought ${quantity}x ${itemDef.name} for ${totalPrice} gold`);
  
  // Send success response
  sendToPlayer(player.ws, {
    type: 'shop_buy_response',
    success: true,
    itemId: itemId,
    quantity: quantity,
    totalPrice: totalPrice,
    newGold: newGold
  });
  
  // Send updated inventory and character data
  await handleGetInventory(player);
  
  // Send gold update
  sendToPlayer(player.ws, {
    type: 'gold_update',
    gold: newGold
  });
}

/**
 * Handle shop sell request
 */
async function handleShopSell(player, message) {
  if (!player.accountId) return;
  
  const { shopId, itemId, slotIndex } = message;
  const quantity = parseInt(message.quantity, 10);
  
  // Validate inputs (cap quantity to prevent overflow)
  if (!shopId || !itemId || slotIndex === undefined || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
    sendToPlayer(player.ws, {
      type: 'shop_sell_response',
      success: false,
      message: 'Invalid request'
    });
    return;
  }
  
  // Get shop data
  const shop = shopsData[shopId];
  if (!shop) {
    sendToPlayer(player.ws, {
      type: 'shop_sell_response',
      success: false,
      message: 'Shop not found'
    });
    return;
  }
  
  // Verify item is in player's inventory at the specified slot
  const inventory = await database.getInventory(player.accountId);
  const inventoryItem = inventory.find(i => i.item_id === itemId && i.slot_index === slotIndex);
  
  if (!inventoryItem) {
    sendToPlayer(player.ws, {
      type: 'shop_sell_response',
      success: false,
      message: 'Item not found in inventory'
    });
    return;
  }
  
  // Check quantity
  if (inventoryItem.quantity < quantity) {
    sendToPlayer(player.ws, {
      type: 'shop_sell_response',
      success: false,
      message: 'Not enough items to sell'
    });
    return;
  }
  
  // Get item definition
  const itemDef = itemManager.getItem(itemId);
  if (!itemDef) {
    sendToPlayer(player.ws, {
      type: 'shop_sell_response',
      success: false,
      message: 'Item definition not found'
    });
    return;
  }
  
  // Calculate sell price (80% of item's sellPrice)
  const sellPricePerItem = Math.floor((itemDef.sellPrice || 1) * SHOP_SELL_MULTIPLIER);
  const totalSellPrice = sellPricePerItem * quantity;
  
  // Process transaction
  // 1. Remove item from inventory
  await database.removeFromInventory(player.accountId, itemId, quantity);
  
  // 2. Add gold
  const character = await database.getCharacter(player.accountId);
  const newGold = (character?.gold || 0) + totalSellPrice;
  await database.updateCharacterStats(player.accountId, { gold: newGold });
  
  console.log(`[Shop] ${player.characterName} sold ${quantity}x ${itemDef.name} for ${totalSellPrice} gold`);
  
  // Send success response
  sendToPlayer(player.ws, {
    type: 'shop_sell_response',
    success: true,
    itemId: itemId,
    quantity: quantity,
    totalPrice: totalSellPrice,
    newGold: newGold
  });
  
  // Send updated inventory
  await handleGetInventory(player);
  
  // Send gold update
  sendToPlayer(player.ws, {
    type: 'gold_update',
    gold: newGold
  });
}

/**
 * Handle get player info request (when clicking another player)
 */
async function handleGetPlayerInfo(player, message) {
  if (!player.accountId) return;
  
  const { playerId } = message;
  
  if (!playerId) {
    sendToPlayer(player.ws, {
      type: 'player_info_response',
      success: false,
      message: 'No player ID provided'
    });
    return;
  }
  
  // Find the target player in the players map
  // Ghost IDs are truncated to 8 characters, so we need to find by prefix
  let targetPlayer = null;
  for (const [fullId, p] of players) {
    if (fullId.startsWith(playerId) && p.authenticated) {
      targetPlayer = p;
      break;
    }
  }
  
  if (!targetPlayer) {
    sendToPlayer(player.ws, {
      type: 'player_info_response',
      success: false,
      message: 'Player not found'
    });
    return;
  }
  
  try {
    // Get the target player's character data
    const character = await database.getCharacter(targetPlayer.accountId);
    if (!character) {
      sendToPlayer(player.ws, {
        type: 'player_info_response',
        success: false,
        message: 'Character not found'
      });
      return;
    }
    
    // Get equipment
    const equipment = await database.getEquipment(targetPlayer.accountId);
    const equipmentData = {};
    
    // Convert equipment to a format with item details
    for (const [slot, itemId] of Object.entries(equipment)) {
      if (itemId) {
        const itemDef = itemManager.getItem(itemId);
        if (itemDef) {
          equipmentData[slot] = {
            id: itemId,
            name: itemDef.name,
            icon: itemDef.icon
          };
        }
      }
    }
    
    // Get equipped skills
    const playerSkills = await database.getCharacterSkills(targetPlayer.accountId);
    const equippedSkillsData = [];
    
    if (playerSkills && playerSkills.equipped) {
      for (const skillId of playerSkills.equipped) {
        if (skillId) {
          const skillDef = skillManager.getSkill(skillId);
          if (skillDef) {
            equippedSkillsData.push({
              id: skillId,
              name: skillDef.name,
              icon: skillDef.icon || '⚡'
            });
          }
        } else {
          equippedSkillsData.push(null);
        }
      }
    }
    
    // Send player info
    sendToPlayer(player.ws, {
      type: 'player_info_response',
      success: true,
      playerId: playerId,
      playerData: {
        name: character.name,
        level: character.level,
        equipment: equipmentData,
        equippedSkills: equippedSkillsData
      }
    });
    
    console.log(`[Server] ${player.characterName} viewed player info for ${character.name}`);
    
  } catch (error) {
    console.error('[Server] Error getting player info:', error);
    sendToPlayer(player.ws, {
      type: 'player_info_response',
      success: false,
      message: 'Error retrieving player info'
    });
  }
}

/**
 * Handle setting spawn point at a beacon
 */
async function handleSetSpawn(player, message) {
  if (!player.accountId) return;
  
  // Use the player's actual server-side zone, not client-provided zoneId
  const zoneId = player.zoneId;
  const x = player.x;
  const y = player.y;
  
  // Validate the spawn point exists in the zone
  const zoneData = loadZoneData(zoneId);
  if (!zoneData) {
    sendToPlayer(player.ws, {
      type: CONSTANTS.MSG_TYPES.SET_SPAWN_RESPONSE,
      success: false,
      message: 'Invalid zone'
    });
    return;
  }
  
  // Check if there's a spawn beacon at or near this position
  const hasBeacon = zoneData.objects && zoneData.objects.some(obj => {
    if (obj.type !== 'spawn_beacon') return false;
    const objWidth = obj.width || 1;
    const objHeight = obj.height || 1;
    // Check if player is adjacent to or on the beacon
    return x >= obj.x - 1 && x <= obj.x + objWidth &&
           y >= obj.y - 1 && y <= obj.y + objHeight;
  });
  
  if (!hasBeacon) {
    sendToPlayer(player.ws, {
      type: CONSTANTS.MSG_TYPES.SET_SPAWN_RESPONSE,
      success: false,
      message: 'No spawn beacon nearby'
    });
    return;
  }
  
  // Update spawn point in database
  const success = await database.updateSpawnPoint(player.accountId, zoneId, x, y);
  
  if (success) {
    sendToPlayer(player.ws, {
      type: CONSTANTS.MSG_TYPES.SET_SPAWN_RESPONSE,
      success: true,
      zoneId: zoneId,
      zoneName: zoneData.name,
      x: x,
      y: y,
      message: `Spawn point set to ${zoneData.name}`
    });
    console.log(`[Server] ${player.characterName} set spawn point to ${zoneData.name} (${x}, ${y})`);
  } else {
    sendToPlayer(player.ws, {
      type: CONSTANTS.MSG_TYPES.SET_SPAWN_RESPONSE,
      success: false,
      message: 'Failed to set spawn point'
    });
  }
}

/**
 * Handle getting castle information
 */
async function handleGetCastleInfo(player, message) {
  console.log('[Castle] handleGetCastleInfo called with:', message);
  
  if (!player.accountId) {
    console.log('[Castle] No accountId, returning');
    return;
  }
  
  const { castleId } = message;
  console.log('[Castle] castleId:', castleId);
  
  if (!castleId) {
    console.log('[Castle] No castleId specified');
    sendToPlayer(player.ws, {
      type: CONSTANTS.MSG_TYPES.CASTLE_INFO,
      success: false,
      message: 'No castle specified'
    });
    return;
  }
  
  try {
    // Get castle data
    const castle = await database.getCastle(castleId);
    console.log('[Castle] Castle from database:', castle);
  
    if (!castle || !castle.owner_account_id) {
      // Castle has no owner - get guardian mob info
      const zoneData = loadZoneData(player.zoneId);
      console.log('[Castle] Zone data loaded:', zoneData ? 'yes' : 'no');
      let guardianInfo = null;
      
      if (zoneData && zoneData.objects) {
        const castleObj = zoneData.objects.find(obj => obj.type === 'castle' && obj.id === castleId);
        console.log('[Castle] Castle object found:', castleObj);
        if (castleObj && castleObj.guardianMob) {
          const allMobTypes = mobManager.getMobTypes();
          console.log('[Castle] Mob types loaded, looking for:', castleObj.guardianMob);
          const mobData = allMobTypes[castleObj.guardianMob]; // Use object property access, not .get()
          console.log('[Castle] Mob data:', mobData);
          if (mobData) {
            guardianInfo = {
              name: mobData.name,
              level: mobData.level || 1,
              hp: mobData.maxHp || mobData.hp || 100,
              sprite: mobData.sprite || '👹'
            };
          }
        }
      }
      
      console.log('[Castle] Sending response - no owner, guardian:', guardianInfo);
      sendToPlayer(player.ws, {
        type: CONSTANTS.MSG_TYPES.CASTLE_INFO,
        success: true,
        castleId: castleId,
        hasOwner: false,
        canConquer: true,
        guardian: guardianInfo
      });
      return;
    }
  
    // Get owner's character data
    const ownerData = await database.getCastleOwnerData(castle.owner_account_id);
    
    if (!ownerData) {
      // Owner data not found, treat as unowned
      sendToPlayer(player.ws, {
        type: CONSTANTS.MSG_TYPES.CASTLE_INFO,
        success: true,
        castleId: castleId,
        hasOwner: false,
        canConquer: true
      });
      return;
    }
    
    // Calculate ownership duration
    const conqueredAt = new Date(castle.conquered_at);
    const ownershipDurationMs = Date.now() - conqueredAt.getTime();
    const ownershipHours = Math.floor(ownershipDurationMs / (60 * 60 * 1000));
    const ownershipMinutes = Math.floor((ownershipDurationMs % (60 * 60 * 1000)) / (60 * 1000));
    
    // Format equipped skills for client
    const equippedSkills = [];
    if (ownerData.skills && ownerData.skills.equipped) {
      for (let i = 1; i <= 5; i++) {
        const skillId = ownerData.skills.equipped[i];
        if (skillId) {
          equippedSkills.push({ slot: i, skillId: skillId });
        }
      }
    }
    
    // Check if player owns this castle
    const isOwner = castle.owner_account_id === player.accountId;
    
    sendToPlayer(player.ws, {
      type: CONSTANTS.MSG_TYPES.CASTLE_INFO,
      success: true,
      castleId: castleId,
      hasOwner: true,
      isOwner: isOwner,
      canConquer: !isOwner, // Can attack if not owner
      owner: {
        name: ownerData.character.name,
        level: ownerData.character.level,
        equipment: ownerData.equipment,
        equippedSkills: equippedSkills
      },
      ownershipDuration: {
        hours: ownershipHours,
        minutes: ownershipMinutes,
        totalMs: ownershipDurationMs
      },
      totalGoldEarned: castle.total_gold_earned || 0
    });
    
    console.log(`[Castle] ${player.characterName} requested info for castle ${castleId} (owner: ${castle.owner_name})`);
  
  } catch (error) {
    console.error('[Castle] Error in handleGetCastleInfo:', error.message);
    console.error('[Castle] Stack trace:', error.stack);
    sendToPlayer(player.ws, {
      type: CONSTANTS.MSG_TYPES.CASTLE_INFO,
      success: false,
      message: 'Error getting castle info'
    });
  }
}

/**
 * Handle castle attack (PvP against owner's shadow)
 */
async function handleAttackCastle(player, message) {
  if (!player.accountId) return;
  
  const { castleId } = message;
  
  if (!castleId) {
    sendToPlayer(player.ws, {
      type: CONSTANTS.MSG_TYPES.CASTLE_ATTACK_RESPONSE,
      success: false,
      message: 'No castle specified'
    });
    return;
  }
  
  // Check if player is already in combat
  if (combatManager.isInCombat(player.id)) {
    sendToPlayer(player.ws, {
      type: CONSTANTS.MSG_TYPES.CASTLE_ATTACK_RESPONSE,
      success: false,
      message: 'Already in combat'
    });
    return;
  }
  
  // Get castle data
  const castle = await database.getCastle(castleId);
  
  // If no owner, fight the guardian mob
  if (!castle || !castle.owner_account_id) {
    // Find the castle object in the zone to get guardian mob type
    const zoneId = player.zoneId;
    const zoneData = loadZoneData(zoneId);
    
    if (!zoneData || !zoneData.objects) {
      sendToPlayer(player.ws, {
        type: CONSTANTS.MSG_TYPES.CASTLE_ATTACK_RESPONSE,
        success: false,
        message: 'Castle not found in zone'
      });
      return;
    }
    
    const castleObj = zoneData.objects.find(obj => obj.type === 'castle' && obj.id === castleId);
    if (!castleObj) {
      sendToPlayer(player.ws, {
        type: CONSTANTS.MSG_TYPES.CASTLE_ATTACK_RESPONSE,
        success: false,
        message: 'Castle object not found'
      });
      return;
    }
    
    const guardianMobType = castleObj.guardianMob || 'rat';
    const allMobTypes = mobManager.getMobTypes();
    const mobData = allMobTypes[guardianMobType]; // Use object property access, not .get()
    
    if (!mobData) {
      sendToPlayer(player.ws, {
        type: CONSTANTS.MSG_TYPES.CASTLE_ATTACK_RESPONSE,
        success: false,
        message: 'Guardian mob type not found'
      });
      return;
    }
    
    try {
      // Get attacker data
      const attackerChar = await database.getCharacter(player.accountId);
      const attackerSkills = await database.getCharacterSkills(player.accountId);
      
      // Create guardian mob stats (like a regular mob fight)
      const guardianStats = {
        id: 'guardian_' + castleId,
        name: mobData.name + ' (Guardian)',
        hp: mobData.maxHp || mobData.hp || 100,
        maxHp: mobData.maxHp || mobData.hp || 100,
        stamina: mobData.maxStamina || mobData.stamina || 15,
        maxStamina: mobData.maxStamina || mobData.stamina || 15,
        damage: mobData.baseDamage || (mobData.str || 1) * CONSTANTS.DAMAGE_PER_STR,
        str: mobData.str || 1,
        agi: mobData.agi || 1,
        dex: mobData.dex || 1,
        int: mobData.int || 1,
        def: mobData.def || 0,
        level: mobData.level || 1
      };
      
      // Prepare attacker combat stats (with equipment bonuses)
      const attackerEquipment = await database.getEquipment(player.accountId);
      const attackerEquipBonuses = itemManager.calculateEquipmentBonuses(attackerEquipment);
      const attackerStats = buildPlayerCombatStats(player.id.substring(0, 8), attackerChar, attackerEquipBonuses);
      
      // Simulate the battle against the guardian mob
      const battleResult = combatManager.simulatePvPBattle(attackerStats, guardianStats, attackerSkills, { learned: {}, equipped: {} });
      
      // Debug: Log battle result details
      console.log(`[Castle] Battle result: playerWon=${battleResult.playerWon}, duration=${battleResult.duration}ms, events=${battleResult.events.length}`);
      console.log(`[Castle] Attacker stats: hp=${attackerStats.hp}, damage=${attackerStats.damage}, def=${attackerStats.def}`);
      console.log(`[Castle] Guardian stats: hp=${guardianStats.hp}, damage=${guardianStats.damage}, def=${guardianStats.def}`);
      
      // Mark attacker as in combat
      combatManager.startCombat(player.id, battleResult);
      
      console.log(`[Castle] ${player.characterName} fighting guardian ${guardianStats.name} for castle ${castleId}`);
      
      // Send castle combat start to attacker
      sendToPlayer(player.ws, {
        type: 'castle_combat_start',
        castleId: castleId,
        isGuardianFight: true,
        defender: {
          id: guardianStats.id,
          name: guardianStats.name,
          hp: guardianStats.hp,
          maxHp: guardianStats.maxHp,
          level: guardianStats.level
        },
        attacker: {
          hp: attackerStats.hp,
          maxHp: attackerStats.maxHp,
          stamina: attackerStats.stamina,
          maxStamina: attackerStats.maxStamina
        },
        events: battleResult.events,
        duration: battleResult.duration,
        playerWon: battleResult.playerWon
      });
      
      // Schedule combat end processing
      setTimeout(async () => {
        await processCastleGuardianCombatEnd(player, castleId, battleResult, attackerChar);
      }, battleResult.duration + 500);
      
    } catch (error) {
      console.error('[Castle] Error in guardian battle:', error);
      sendToPlayer(player.ws, {
        type: CONSTANTS.MSG_TYPES.CASTLE_ATTACK_RESPONSE,
        success: false,
        message: 'Error initiating guardian battle'
      });
    }
    return;
  }
  
  // Can't attack own castle
  if (castle.owner_account_id === player.accountId) {
    sendToPlayer(player.ws, {
      type: CONSTANTS.MSG_TYPES.CASTLE_ATTACK_RESPONSE,
      success: false,
      message: 'You already own this castle!'
    });
    return;
  }
  
  try {
    // Get attacker data
    const attackerChar = await database.getCharacter(player.accountId);
    const attackerSkills = await database.getCharacterSkills(player.accountId);
    
    // Get defender (owner) data
    const defenderChar = await database.getCharacter(castle.owner_account_id);
    const defenderSkills = await database.getCharacterSkills(castle.owner_account_id);
    
    if (!defenderChar) {
      // Owner character deleted, auto-conquer
      const conquerResult = await database.conquerCastle(castleId, player.accountId, attackerChar.name);
      
      let message = 'You have claimed the castle!';
      if (conquerResult.previousCastleId) {
        message += ` (Lost ownership of ${conquerResult.previousCastleId})`;
      }
      
      sendToPlayer(player.ws, {
        type: CONSTANTS.MSG_TYPES.CASTLE_CONQUERED,
        castleId: castleId,
        previousCastleId: conquerResult.previousCastleId,
        message: message
      });
      return;
    }
    
    // Prepare attacker combat stats (with equipment bonuses)
    const attackerEquipment = await database.getEquipment(player.accountId);
    const attackerEquipBonuses = itemManager.calculateEquipmentBonuses(attackerEquipment);
    const attackerStats = buildPlayerCombatStats(player.id.substring(0, 8), attackerChar, attackerEquipBonuses);
    
    // Prepare defender (shadow) combat stats - use full HP/stamina with equipment bonuses
    const defenderEquipment = await database.getEquipment(castle.owner_account_id);
    const defenderEquipBonuses = itemManager.calculateEquipmentBonuses(defenderEquipment);
    const defenderBase = buildPlayerCombatStats('shadow_' + castle.owner_account_id, defenderChar, defenderEquipBonuses);
    // Shadow always fights at full HP/stamina
    const defenderStats = {
      ...defenderBase,
      name: defenderChar.name + ' (Shadow)',
      hp: defenderBase.maxHp,
      stamina: defenderBase.maxStamina
    };
    
    // Simulate the PvP battle
    const battleResult = combatManager.simulatePvPBattle(attackerStats, defenderStats, attackerSkills, defenderSkills);
    
    // Mark attacker as in combat
    combatManager.startCombat(player.id, battleResult);
    
    console.log(`[Castle] ${player.characterName} attacking ${defenderChar.name}'s shadow for castle ${castleId} (${battleResult.events.length} events, ${battleResult.duration}ms)`);
    
    // Send castle combat start to attacker
    sendToPlayer(player.ws, {
      type: 'castle_combat_start',
      castleId: castleId,
      defender: {
        id: defenderStats.id,
        name: defenderStats.name,
        hp: defenderStats.hp,
        maxHp: defenderStats.maxHp,
        level: defenderChar.level
      },
      attacker: {
        hp: attackerStats.hp,
        maxHp: attackerStats.maxHp,
        stamina: attackerStats.stamina,
        maxStamina: attackerStats.maxStamina
      },
      events: battleResult.events,
      duration: battleResult.duration,
      playerWon: battleResult.playerWon
    });
    
    // Schedule combat end processing
    setTimeout(async () => {
      await processCastleCombatEnd(player, castle, castleId, battleResult, attackerChar);
    }, battleResult.duration + 500);
    
  } catch (error) {
    console.error('[Castle] Error in castle attack:', error);
    sendToPlayer(player.ws, {
      type: CONSTANTS.MSG_TYPES.CASTLE_ATTACK_RESPONSE,
      success: false,
      message: 'Error initiating castle battle'
    });
  }
}

/**
 * Process the end of castle combat
 */
async function processCastleCombatEnd(attacker, castle, castleId, battleResult, attackerChar) {
  // End combat state
  combatManager.endCombat(attacker.id);
  
  if (battleResult.playerWon) {
    // Attacker won - conquer the castle!
    const conquerResult = await database.conquerCastle(castleId, attacker.accountId, attackerChar.name);
    
    // Update attacker HP (they may have taken damage)
    const newHp = Math.max(1, battleResult.playerFinalHp || attackerChar.hp);
    await database.updateCharacterStats(attacker.accountId, { hp: newHp });
    
    let message = `You conquered the castle from ${castle.owner_name}!`;
    if (conquerResult.previousCastleId) {
      message += ` (Lost ownership of ${conquerResult.previousCastleId})`;
    }
    
    // Send conquest notification
    sendToPlayer(attacker.ws, {
      type: 'castle_combat_end',
      playerWon: true,
      conquered: true,
      castleId: castleId,
      previousCastleId: conquerResult.previousCastleId,
      newHp: newHp,
      message: message
    });
    
    console.log(`[Castle] ${attacker.characterName} conquered castle ${castleId} from ${castle.owner_name}!${conquerResult.previousCastleId ? ` (released ${conquerResult.previousCastleId})` : ''}`);
    
  } else {
    // Attacker lost - they take damage but don't die (castle defense)
    const newHp = Math.max(1, Math.floor(attackerChar.hp * 0.5));
    await database.updateCharacterStats(attacker.accountId, { hp: newHp });
    
    sendToPlayer(attacker.ws, {
      type: 'castle_combat_end',
      playerWon: false,
      conquered: false,
      castleId: castleId,
      newHp: newHp,
      message: `${castle.owner_name}'s shadow defended the castle!`
    });
    
    console.log(`[Castle] ${attacker.characterName} failed to conquer castle ${castleId} from ${castle.owner_name}`);
  }
}

/**
 * Process the end of castle guardian combat (unclaimed castle)
 */
async function processCastleGuardianCombatEnd(attacker, castleId, battleResult, attackerChar) {
  // End combat state
  combatManager.endCombat(attacker.id);
  
  if (battleResult.playerWon) {
    // Attacker won - claim the castle!
    const conquerResult = await database.conquerCastle(castleId, attacker.accountId, attackerChar.name);
    
    // Update attacker HP (they may have taken damage)
    const newHp = Math.max(1, battleResult.playerFinalHp || attackerChar.hp);
    await database.updateCharacterStats(attacker.accountId, { hp: newHp });
    
    let message = `You defeated the guardian and claimed the castle!`;
    if (conquerResult.previousCastleId) {
      message += ` (Lost ownership of ${conquerResult.previousCastleId})`;
    }
    
    // Send conquest notification
    sendToPlayer(attacker.ws, {
      type: 'castle_combat_end',
      playerWon: true,
      conquered: true,
      castleId: castleId,
      previousCastleId: conquerResult.previousCastleId,
      newHp: newHp,
      message: message
    });
    
    console.log(`[Castle] ${attacker.characterName} defeated guardian and claimed castle ${castleId}!${conquerResult.previousCastleId ? ` (released ${conquerResult.previousCastleId})` : ''}`);
    
  } else {
    // Attacker lost - they take damage but don't die
    const newHp = Math.max(1, Math.floor(attackerChar.hp * 0.5));
    await database.updateCharacterStats(attacker.accountId, { hp: newHp });
    
    sendToPlayer(attacker.ws, {
      type: 'castle_combat_end',
      playerWon: false,
      conquered: false,
      castleId: castleId,
      newHp: newHp,
      message: `The guardian defended the castle!`
    });
    
    console.log(`[Castle] ${attacker.characterName} failed to defeat guardian for castle ${castleId}`);
  }
}

// ===========================================
// BOSS BATTLE HANDLERS
// ===========================================

/**
 * Handle get boss info request
 */
async function handleGetBossInfo(player, message) {
  if (!player.accountId) return;
  
  const { bossId } = message;
  
  if (!bossId) {
    sendToPlayer(player.ws, {
      type: CONSTANTS.MSG_TYPES.BOSS_INFO,
      success: false,
      message: 'No boss specified'
    });
    return;
  }
  
  const bossInfo = bossManager.getBossInfo(player.zoneId, bossId, player.accountId);
  
  if (!bossInfo) {
    sendToPlayer(player.ws, {
      type: CONSTANTS.MSG_TYPES.BOSS_INFO,
      success: false,
      message: 'Boss not found'
    });
    return;
  }
  
  // Get player level for comparison
  const character = await database.getCharacter(player.accountId);
  
  sendToPlayer(player.ws, {
    type: CONSTANTS.MSG_TYPES.BOSS_INFO,
    success: true,
    boss: bossInfo,
    playerLevel: character?.level || 1
  });
}

/**
 * Handle boss attack request
 */
async function handleAttackBoss(player, message) {
  if (!player.accountId) return;
  
  const { bossId } = message;
  
  if (!bossId) {
    sendToPlayer(player.ws, {
      type: CONSTANTS.MSG_TYPES.BOSS_ATTACK_RESPONSE,
      success: false,
      message: 'No boss specified'
    });
    return;
  }
  
  // Check if player is already in combat
  if (combatManager.isInCombat(player.id)) {
    sendToPlayer(player.ws, {
      type: CONSTANTS.MSG_TYPES.BOSS_ATTACK_RESPONSE,
      success: false,
      message: 'Already in combat'
    });
    return;
  }
  
  // Check if player can attack this boss
  const canAttack = bossManager.canPlayerAttackBoss(player.zoneId, bossId, player.accountId);
  
  if (!canAttack.canAttack) {
    sendToPlayer(player.ws, {
      type: CONSTANTS.MSG_TYPES.BOSS_ATTACK_RESPONSE,
      success: false,
      message: canAttack.reason
    });
    return;
  }
  
  const boss = canAttack.boss;
  const bossType = canAttack.bossType;
  
  try {
    // Get attacker data
    const attackerChar = await database.getCharacter(player.accountId);
    const attackerSkills = await database.getCharacterSkills(player.accountId);
    
    // Prepare attacker combat stats (with equipment bonuses)
    const equipment = await database.getEquipment(player.accountId);
    const equipBonuses = itemManager.calculateEquipmentBonuses(equipment);
    const attackerStats = buildPlayerCombatStats(player.id.substring(0, 8), attackerChar, equipBonuses);
    
    // Prepare boss combat stats
    const bossStats = bossManager.getBossCombatStats(bossType);
    const bossSkills = bossManager.getBossSkills(bossType);
    
    // Simulate the PvP-style battle
    const battleResult = combatManager.simulatePvPBattle(attackerStats, bossStats, attackerSkills, bossSkills);
    
    // Mark attacker as in combat
    combatManager.startCombat(player.id, battleResult);
    
    console.log(`[Boss] ${player.characterName} fighting boss ${bossType.name} (${battleResult.events.length} events, ${battleResult.duration}ms)`);
    
    // Send boss combat start
    sendToPlayer(player.ws, {
      type: CONSTANTS.MSG_TYPES.BOSS_COMBAT_START,
      bossId: boss.id,
      bossType: boss.type,
      defender: {
        id: bossStats.id,
        name: bossType.name,
        title: bossType.title,
        hp: bossStats.hp,
        maxHp: bossStats.maxHp,
        level: bossType.level
      },
      attacker: {
        hp: attackerStats.hp,
        maxHp: attackerStats.maxHp,
        stamina: attackerStats.stamina,
        maxStamina: attackerStats.maxStamina
      },
      events: battleResult.events,
      duration: battleResult.duration,
      playerWon: battleResult.playerWon
    });
    
    // Schedule combat end processing
    setTimeout(async () => {
      await processBossCombatEnd(player, boss, bossType, battleResult, attackerChar);
    }, battleResult.duration + 500);
    
  } catch (error) {
    console.error('[Boss] Error in boss attack:', error);
    sendToPlayer(player.ws, {
      type: CONSTANTS.MSG_TYPES.BOSS_ATTACK_RESPONSE,
      success: false,
      message: 'Error initiating boss battle'
    });
  }
}

/**
 * Process the end of boss combat
 */
async function processBossCombatEnd(player, boss, bossType, battleResult, attackerChar) {
  // End combat state
  combatManager.endCombat(player.id);
  
  try {
    if (battleResult.playerWon) {
      // Player won - defeat the boss!
      await bossManager.recordBossDefeat(player.zoneId, boss.id, player.accountId);
      
      // Update player HP (they may have taken damage)
      const newHp = Math.max(1, battleResult.playerFinalHp || attackerChar.hp);
      await database.updateCharacterStats(player.accountId, { hp: newHp });
      
      // Award experience
      const expReward = bossType.expReward || 0;
      if (expReward > 0) {
        await database.addExperience(player.accountId, expReward);
      }
      
      // Award gold
      const goldReward = bossType.goldReward || 0;
      if (goldReward > 0) {
        await database.addGold(player.accountId, goldReward);
      }
      
      // Process drops
      const drops = [];
      if (bossType.drops && bossType.drops.length > 0) {
        for (const drop of bossType.drops) {
          const roll = Math.random() * 100;
          if (roll < drop.chance) {
            const qty = drop.minQty && drop.maxQty 
              ? Math.floor(Math.random() * (drop.maxQty - drop.minQty + 1)) + drop.minQty
              : 1;
            
            const added = await database.addItemToInventory(player.accountId, drop.itemId, qty);
            if (added) {
              const itemData = itemManager.getItem(drop.itemId);
              drops.push({
                itemId: drop.itemId,
                name: itemData?.name || drop.itemId,
                icon: itemData?.icon || '❓',
                quantity: qty
              });
            }
          }
        }
      }
      
      // Get updated character data
      const updatedChar = await database.getCharacter(player.accountId);
      
      // Send victory notification
      sendToPlayer(player.ws, {
        type: CONSTANTS.MSG_TYPES.BOSS_COMBAT_END,
        playerWon: true,
        bossId: boss.id,
        bossName: bossType.name,
        newHp: newHp,
        expGained: expReward,
        goldGained: goldReward,
        drops: drops,
        newLevel: updatedChar.level,
        newExp: updatedChar.experience,
        newGold: updatedChar.gold,
        cooldownMs: CONSTANTS.BOSS_COOLDOWN_MS,
        message: `You defeated ${bossType.name}!`
      });
      
      console.log(`[Boss] ${player.characterName} defeated boss ${bossType.name}! Exp: ${expReward}, Gold: ${goldReward}, Drops: ${drops.length}`);
      
    } else {
      // Player lost - they take damage but don't die
      const newHp = Math.max(1, Math.floor(attackerChar.hp * 0.5));
      await database.updateCharacterStats(player.accountId, { hp: newHp });
      
      sendToPlayer(player.ws, {
        type: CONSTANTS.MSG_TYPES.BOSS_COMBAT_END,
        playerWon: false,
        bossId: boss.id,
        bossName: bossType.name,
        newHp: newHp,
        message: `${bossType.name} has defeated you!`
      });
      
      console.log(`[Boss] ${player.characterName} was defeated by boss ${bossType.name}`);
    }
  } catch (error) {
    console.error(`[Boss] Error in processBossCombatEnd:`, error);
    // Always send the end message so the client doesn't get stuck
    try {
      sendToPlayer(player.ws, {
        type: CONSTANTS.MSG_TYPES.BOSS_COMBAT_END,
        playerWon: false,
        bossId: boss.id,
        bossName: bossType.name || 'Boss',
        newHp: attackerChar.hp,
        message: 'Boss battle ended unexpectedly.'
      });
    } catch (e) {
      console.error('[Boss] Failed to send fallback boss combat end:', e);
    }
  }
}

// ===========================================
// TRAINING HANDLERS
// ===========================================

/**
 * Handle training start request
 */
async function handleTrainingStart(player, message) {
  if (!player.accountId) return;
  
  const { dummyId } = message;
  
  if (!dummyId) {
    sendToPlayer(player.ws, {
      type: 'training_response',
      success: false,
      message: 'No training dummy specified'
    });
    return;
  }
  
  // Check if player is in combat
  if (combatManager.isInCombat(player.id)) {
    sendToPlayer(player.ws, {
      type: 'training_response',
      success: false,
      message: 'Cannot train while in combat'
    });
    return;
  }
  
  // Check if player is already training
  const existingSession = await database.getTrainingSession(player.accountId);
  if (existingSession) {
    sendToPlayer(player.ws, {
      type: 'training_response',
      success: false,
      message: 'Already training',
      session: existingSession
    });
    return;
  }
  
  // Get character level to check if they can still benefit from training
  const character = await database.getCharacter(player.accountId);
  if (character.level >= CONSTANTS.TRAINING_MAX_LEVEL) {
    sendToPlayer(player.ws, {
      type: 'training_response',
      success: false,
      message: `Training is only effective up to level ${CONSTANTS.TRAINING_MAX_LEVEL}`
    });
    return;
  }
  
  // Start training session
  const result = await database.startTrainingSession(player.accountId, dummyId, player.zoneId);
  
  if (result.success) {
    // Mark player as training (in-memory state)
    player.isTraining = true;
    player.trainingStartedAt = result.startedAt;
    
    sendToPlayer(player.ws, {
      type: 'training_response',
      success: true,
      message: 'Training started',
      startedAt: result.startedAt,
      cycleMinutes: CONSTANTS.TRAINING_CYCLE_MINUTES,
      expPercent: CONSTANTS.TRAINING_EXP_PERCENT,
      maxLevel: CONSTANTS.TRAINING_MAX_LEVEL
    });
    
    console.log(`[Training] ${player.characterName} started training at ${dummyId}`);
  } else {
    sendToPlayer(player.ws, {
      type: 'training_response',
      success: false,
      message: 'Failed to start training'
    });
  }
}

/**
 * Handle training stop request (manual stop)
 */
async function handleTrainingStop(player, message) {
  if (!player.accountId) return;
  
  const result = await processTrainingEnd(player, 'manual');
  
  sendToPlayer(player.ws, {
    type: 'training_stopped',
    ...result
  });
}

/**
 * Handle get training status request
 */
async function handleGetTrainingStatus(player) {
  if (!player.accountId) return;
  
  const session = await database.getTrainingSession(player.accountId);
  
  if (session) {
    const startTime = new Date(session.started_at).getTime();
    const now = Date.now();
    const elapsedMs = now - startTime;
    const cycleMs = CONSTANTS.TRAINING_CYCLE_MINUTES * 60 * 1000;
    const completedCycles = Math.floor(elapsedMs / cycleMs);
    const timeInCurrentCycle = elapsedMs % cycleMs;
    const timeUntilNextCycle = cycleMs - timeInCurrentCycle;
    
    sendToPlayer(player.ws, {
      type: 'training_status',
      isTraining: true,
      startedAt: session.started_at,
      dummyId: session.dummy_id,
      zoneId: session.zone_id,
      completedCycles: completedCycles,
      timeUntilNextCycle: timeUntilNextCycle,
      cycleMinutes: CONSTANTS.TRAINING_CYCLE_MINUTES,
      expPercent: CONSTANTS.TRAINING_EXP_PERCENT
    });
  } else {
    sendToPlayer(player.ws, {
      type: 'training_status',
      isTraining: false
    });
  }
}

/**
 * Check and interrupt training if player is training
 */
async function checkAndInterruptTraining(player, reason) {
  if (!player.accountId) return;
  
  const session = await database.getTrainingSession(player.accountId);
  if (session) {
    const result = await processTrainingEnd(player, reason);
    
    sendToPlayer(player.ws, {
      type: 'training_interrupted',
      reason: reason,
      ...result
    });
  }
}

/**
 * Process training session end and calculate rewards
 */
async function processTrainingEnd(player, reason) {
  const result = await database.endTrainingSession(player.accountId);
  
  if (!result.success || !result.session) {
    return {
      success: false,
      expGained: 0,
      cyclesCompleted: 0,
      message: 'No active training session'
    };
  }
  
  const session = result.session;
  const startTime = new Date(session.started_at).getTime();
  const endTime = Date.now();
  const elapsedMs = endTime - startTime;
  const cycleMs = CONSTANTS.TRAINING_CYCLE_MINUTES * 60 * 1000;
  const completedCycles = Math.floor(elapsedMs / cycleMs);
  
  // Clear in-memory training state
  player.isTraining = false;
  player.trainingStartedAt = null;
  
  if (completedCycles === 0) {
    console.log(`[Training] ${player.characterName} stopped training with 0 complete cycles (reason: ${reason})`);
    return {
      success: true,
      expGained: 0,
      cyclesCompleted: 0,
      message: reason === 'manual' 
        ? 'Training stopped. No cycles completed - no EXP gained.'
        : 'Training interrupted. No cycles completed - no EXP gained.'
    };
  }
  
  // Get character data to calculate EXP reward
  const character = await database.getCharacter(player.accountId);
  
  // Can't gain EXP if at or above max training level
  if (character.level >= CONSTANTS.TRAINING_MAX_LEVEL) {
    return {
      success: true,
      expGained: 0,
      cyclesCompleted: completedCycles,
      message: `Training stopped. Level ${CONSTANTS.TRAINING_MAX_LEVEL}+ characters don't gain EXP from training.`
    };
  }
  
  // Calculate EXP: 2% of level-up EXP per completed cycle
  const expForNextLevel = calculateExpForLevel(character.level);
  const expPerCycle = Math.floor(expForNextLevel * (CONSTANTS.TRAINING_EXP_PERCENT / 100));
  let totalExp = expPerCycle * completedCycles;
  
  // Award the EXP
  const expResult = await awardExperience(player, totalExp, 'training');
  
  // Get updated character data
  const updatedCharacter = await database.getCharacter(player.accountId);
  
  console.log(`[Training] ${player.characterName} completed ${completedCycles} training cycles, gained ${totalExp} EXP (reason: ${reason})`);
  
  return {
    success: true,
    expGained: totalExp,
    cyclesCompleted: completedCycles,
    levelUp: expResult.levelUp,
    newLevel: expResult.newLevel,
    newExp: updatedCharacter.experience,
    character: {
      level: updatedCharacter.level,
      experience: updatedCharacter.experience,
      statPoints: updatedCharacter.stat_points,
      skillPoints: updatedCharacter.skill_points,
      maxHp: updatedCharacter.max_hp,
      hp: updatedCharacter.hp
    },
    message: `Training complete! Gained ${totalExp} EXP from ${completedCycles} cycle${completedCycles > 1 ? 's' : ''}.`
  };
}

/**
 * Process training rewards on player login
 */
async function processTrainingOnLogin(player) {
  const session = await database.getTrainingSession(player.accountId);
  
  if (!session) {
    return null;
  }
  
  // Calculate completed cycles
  const startTime = new Date(session.started_at).getTime();
  const now = Date.now();
  const elapsedMs = now - startTime;
  const cycleMs = CONSTANTS.TRAINING_CYCLE_MINUTES * 60 * 1000;
  const completedCycles = Math.floor(elapsedMs / cycleMs);
  
  if (completedCycles === 0) {
    // Still in first cycle - continue training
    player.isTraining = true;
    player.trainingStartedAt = session.started_at;
    
    return {
      continuing: true,
      startedAt: session.started_at,
      dummyId: session.dummy_id,
      cyclesCompleted: 0,
      timeUntilNextCycle: cycleMs - (elapsedMs % cycleMs)
    };
  }
  
  // Has completed cycles - process the rewards and continue training
  const character = await database.getCharacter(player.accountId);
  
  // Check level cap
  if (character.level >= CONSTANTS.TRAINING_MAX_LEVEL) {
    // End training, no rewards
    await database.endTrainingSession(player.accountId);
    return {
      continuing: false,
      message: `Training ended. Level ${CONSTANTS.TRAINING_MAX_LEVEL}+ characters don't gain EXP from training.`,
      expGained: 0,
      cyclesCompleted: completedCycles
    };
  }
  
  // Calculate and award EXP
  const expForNextLevel = calculateExpForLevel(character.level);
  const expPerCycle = Math.floor(expForNextLevel * (CONSTANTS.TRAINING_EXP_PERCENT / 100));
  const totalExp = expPerCycle * completedCycles;
  
  // Award the EXP
  const expResult = await awardExperience(player, totalExp, 'training');
  
  // Get updated character data
  const updatedCharacter = await database.getCharacter(player.accountId);
  
  // Reset training start time to now for continued training
  await database.startTrainingSession(player.accountId, session.dummy_id, session.zone_id);
  
  player.isTraining = true;
  player.trainingStartedAt = new Date().toISOString();
  
  console.log(`[Training] ${player.characterName} collected ${completedCycles} training cycles (${totalExp} EXP) on login`);
  
  return {
    continuing: true,
    startedAt: player.trainingStartedAt,
    dummyId: session.dummy_id,
    expGained: totalExp,
    cyclesCompleted: completedCycles,
    levelUp: expResult.levelUp,
    newLevel: expResult.newLevel,
    character: {
      level: updatedCharacter.level,
      experience: updatedCharacter.experience,
      statPoints: updatedCharacter.stat_points,
      skillPoints: updatedCharacter.skill_points,
      maxHp: updatedCharacter.max_hp,
      hp: updatedCharacter.hp
    },
    message: `Welcome back! You gained ${totalExp} EXP from ${completedCycles} training cycle${completedCycles > 1 ? 's' : ''} while away.`
  };
}

/**
 * Handle PvP attack request (mock fight)
 */
async function handlePvPAttack(player, message) {
  if (!player.accountId) return;
  
  const { targetPlayerId } = message;
  
  if (!targetPlayerId) {
    sendToPlayer(player.ws, {
      type: 'pvp_attack_response',
      success: false,
      message: 'No target specified'
    });
    return;
  }
  
  // Check if player is already in combat
  if (combatManager.isInCombat(player.id)) {
    sendToPlayer(player.ws, {
      type: 'pvp_attack_response',
      success: false,
      message: 'Already in combat'
    });
    return;
  }
  
  // Find target player by truncated ID
  let targetPlayer = null;
  for (const [fullId, p] of players) {
    if (fullId.startsWith(targetPlayerId) && p.authenticated) {
      targetPlayer = p;
      break;
    }
  }
  
  if (!targetPlayer) {
    sendToPlayer(player.ws, {
      type: 'pvp_attack_response',
      success: false,
      message: 'Target player not found'
    });
    return;
  }
  
  // Check if target is in same zone
  if (targetPlayer.zoneId !== player.zoneId) {
    sendToPlayer(player.ws, {
      type: 'pvp_attack_response',
      success: false,
      message: 'Target is not in your zone'
    });
    return;
  }
  
  try {
    // Get attacker (current player) data
    const attackerChar = await database.getCharacter(player.accountId);
    const attackerSkills = await database.getCharacterSkills(player.accountId);
    
    // Get defender (target) data
    const defenderChar = await database.getCharacter(targetPlayer.accountId);
    const defenderSkills = await database.getCharacterSkills(targetPlayer.accountId);
    
    // Prepare attacker combat stats (with equipment bonuses)
    const attackerEquipment = await database.getEquipment(player.accountId);
    const attackerEquipBonuses = itemManager.calculateEquipmentBonuses(attackerEquipment);
    const attackerStats = buildPlayerCombatStats(player.id.substring(0, 8), attackerChar, attackerEquipBonuses);
    
    // Prepare defender combat stats (with equipment bonuses)
    const defenderEquipment = await database.getEquipment(targetPlayer.accountId);
    const defenderEquipBonuses = itemManager.calculateEquipmentBonuses(defenderEquipment);
    const defenderStats = buildPlayerCombatStats(targetPlayer.id.substring(0, 8), defenderChar, defenderEquipBonuses);
    
    // Simulate the PvP battle
    const battleResult = combatManager.simulatePvPBattle(attackerStats, defenderStats, attackerSkills, defenderSkills);
    
    // Mark attacker as in combat
    combatManager.startCombat(player.id, battleResult);
    
    // Calculate target position (below attacker)
    const targetX = player.x;
    const targetY = player.y + 1;
    
    console.log(`[PvP] ${player.characterName} attacked ${targetPlayer.characterName} (${battleResult.events.length} events, ${battleResult.duration}ms)`);
    console.log(`[PvP] First 5 events:`, battleResult.events.slice(0, 5).map(e => ({ type: e.type, time: e.time, attackerName: e.attackerName, damage: e.damage })));
    
    // Send PvP combat start to attacker
    sendToPlayer(player.ws, {
      type: 'pvp_combat_start',
      targetPlayerId: targetPlayer.id.substring(0, 8),
      target: {
        id: targetPlayer.id.substring(0, 8),
        name: defenderChar.name,
        hp: defenderStats.hp,
        maxHp: defenderStats.maxHp,
        level: defenderChar.level,
        x: targetX,
        y: targetY
      },
      player: {
        hp: attackerStats.hp,
        maxHp: attackerStats.maxHp,
        stamina: attackerStats.stamina,
        maxStamina: attackerStats.maxStamina
      },
      events: battleResult.events,
      duration: battleResult.duration,
      playerWon: battleResult.playerWon
    });
    
    // Schedule combat end processing
    setTimeout(async () => {
      await processPvPCombatEnd(player, targetPlayer, battleResult, attackerChar);
    }, battleResult.duration + 500);
    
  } catch (error) {
    console.error('[PvP] Error in PvP attack:', error);
    sendToPlayer(player.ws, {
      type: 'pvp_attack_response',
      success: false,
      message: 'Error initiating PvP combat'
    });
  }
}

/**
 * Process the end of PvP combat
 */
async function processPvPCombatEnd(attacker, defender, battleResult, attackerChar) {
  // End combat state
  combatManager.endCombat(attacker.id);
  
  if (battleResult.playerWon) {
    // Attacker won - just update their HP (mock fight, no rewards)
    const newHp = Math.max(1, battleResult.playerFinalHp || attackerChar.hp);
    await database.updateCharacterStats(attacker.accountId, { hp: newHp });
    
    // Send combat end to attacker
    sendToPlayer(attacker.ws, {
      type: 'pvp_combat_end',
      playerWon: true,
      newHp: newHp,
      message: `You defeated ${defender.characterName}!`
    });
    
    console.log(`[PvP] ${attacker.characterName} defeated ${defender.characterName} (mock fight)`);
    
  } else {
    // Attacker lost - treat like death
    // Get attacker's spawn point from database
    const spawnPoint = await database.getSpawnPoint(attacker.accountId);
    const respawnHp = Math.floor(attackerChar.max_hp * 0.5);
    
    // Update attacker's position and HP
    await database.updateCharacterPosition(attacker.accountId, spawnPoint.zone, spawnPoint.x, spawnPoint.y);
    await database.updateCharacterStats(attacker.accountId, { 
      hp: respawnHp
    });
    
    // Update server-side player state
    const oldZone = attacker.zoneId;
    attacker.zoneId = spawnPoint.zone;
    attacker.x = spawnPoint.x;
    attacker.y = spawnPoint.y;
    
    // Notify other players in old zone that this player left
    if (oldZone !== spawnPoint.zone) {
      broadcastToZone(oldZone, {
        type: CONSTANTS.MSG_TYPES.PLAYER_LEAVE,
        playerId: attacker.id.substring(0, 8)
      }, attacker.id);
    }
    
    // Get spawn zone name
    const spawnZoneData = loadZoneData(spawnPoint.zone);
    const spawnZoneName = spawnZoneData ? spawnZoneData.name : 'Unknown';
    
    // Send death/respawn to attacker
    sendToPlayer(attacker.ws, {
      type: 'pvp_combat_end',
      playerWon: false,
      died: true,
      killedBy: 'pvp',
      killerName: defender.characterName,
      respawnZone: spawnPoint.zone,
      respawnZoneName: spawnZoneName,
      respawnX: spawnPoint.x,
      respawnY: spawnPoint.y,
      newHp: respawnHp,
      message: `You were defeated by ${defender.characterName}!`
    });
    
    console.log(`[PvP] ${attacker.characterName} was defeated by ${defender.characterName}! Respawning at ${spawnZoneName}`);
  }
}

/**
 * Handle getting skill trees data
 */
async function handleGetSkillTrees(player) {
  if (!player.accountId) return;
  
  const character = await database.getCharacter(player.accountId);
  const playerLevel = character?.level || 1;
  
  // Get all skill trees with unlock status
  const trees = skillManager.getAllTrees().map(tree => ({
    ...tree.tree,
    skills: tree.skills.map(skill => ({
      id: skill.id,
      name: skill.name,
      type: skill.type,
      maxLevel: skill.maxLevel,
      description: skill.description,
      staminaCost: skill.staminaCost,
      cooldown: skill.cooldown,
      initialCooldown: skill.initialCooldown,
      scaling: skill.scaling
    })),
    unlocked: playerLevel >= tree.tree.unlockLevel
  }));
  
  sendToPlayer(player.ws, {
    type: 'skill_trees',
    trees: trees,
    playerLevel: playerLevel
  });
}

/**
 * Handle getting player's skills
 */
async function handleGetSkills(player) {
  if (!player.accountId) return;
  
  const character = await database.getCharacter(player.accountId);
  const playerSkills = await database.getCharacterSkills(player.accountId);
  
  const totalPoints = skillManager.calculateSkillPoints(character?.level || 1);
  const spentPoints = skillManager.calculateSpentPoints(playerSkills);
  const availablePoints = totalPoints - spentPoints;
  
  console.log(`[Skills] ${player.characterName} - Level ${character?.level}, Total: ${totalPoints}, Spent: ${spentPoints}, Available: ${availablePoints}`);
  
  sendToPlayer(player.ws, {
    type: 'skills_data',
    skills: playerSkills,
    totalPoints: totalPoints,
    spentPoints: spentPoints,
    availablePoints: availablePoints,
    playerLevel: character?.level || 1
  });
}

/**
 * Handle learning/upgrading a skill
 */
async function handleSkillLearn(player, message) {
  if (!player.accountId) return;
  
  const skillId = parseInt(message.skillId);
  if (isNaN(skillId)) {
    sendToPlayer(player.ws, { type: 'error', error: 'Invalid skill ID' });
    return;
  }
  
  const character = await database.getCharacter(player.accountId);
  const playerSkills = await database.getCharacterSkills(player.accountId);
  
  // Check if can learn
  const check = skillManager.canLearnSkill(playerSkills, character?.level || 1, skillId);
  if (!check.canLearn) {
    sendToPlayer(player.ws, { type: 'error', error: check.reason });
    return;
  }
  
  // Learn/upgrade the skill (use string key for JSON consistency)
  const skillKey = String(skillId);
  if (!playerSkills.learned[skillKey]) {
    playerSkills.learned[skillKey] = 1;
  } else {
    playerSkills.learned[skillKey]++;
  }
  
  // Save to database
  await database.updateCharacterSkills(player.accountId, playerSkills);
  
  // Get skill info for response
  const skill = skillManager.getSkill(skillId);
  
  console.log(`[Skills] ${player.characterName} learned ${skill.name} (level ${playerSkills.learned[skillKey]})`);
  
  // Send updated skills data
  const totalPoints = skillManager.calculateSkillPoints(character?.level || 1);
  const spentPoints = skillManager.calculateSpentPoints(playerSkills);
  
  sendToPlayer(player.ws, {
    type: 'skill_learned',
    skillId: skillId,
    skillName: skill.name,
    newLevel: playerSkills.learned[skillKey],
    skills: playerSkills,
    totalPoints: totalPoints,
    spentPoints: spentPoints,
    availablePoints: totalPoints - spentPoints
  });
}

/**
 * Handle equipping/unequipping an active skill
 */
async function handleSkillEquip(player, message) {
  if (!player.accountId) return;
  
  const skillId = message.skillId !== null ? parseInt(message.skillId) : null;
  const slotIndex = parseInt(message.slot);
  
  if (slotIndex < 0 || slotIndex > 4) {
    sendToPlayer(player.ws, { type: 'error', error: 'Invalid skill slot' });
    return;
  }
  
  const playerSkills = await database.getCharacterSkills(player.accountId);
  
  // If setting a skill
  if (skillId !== null && !isNaN(skillId)) {
    // Check if skill is learned
    if (!playerSkills.learned[skillId] || playerSkills.learned[skillId] <= 0) {
      sendToPlayer(player.ws, { type: 'error', error: 'Skill not learned' });
      return;
    }
    
    // Check if it's an active skill
    const skill = skillManager.getSkill(skillId);
    if (!skill || skill.type !== 'active') {
      sendToPlayer(player.ws, { type: 'error', error: 'Can only equip active skills' });
      return;
    }
    
    // Remove skill from any other slot first
    for (let i = 0; i < playerSkills.equipped.length; i++) {
      if (playerSkills.equipped[i] === skillId) {
        playerSkills.equipped[i] = null;
      }
    }
    
    // Equip to the slot
    playerSkills.equipped[slotIndex] = skillId;
  } else {
    // Unequip from slot
    playerSkills.equipped[slotIndex] = null;
  }
  
  // Save to database
  await database.updateCharacterSkills(player.accountId, playerSkills);
  
  console.log(`[Skills] ${player.characterName} updated skill slot ${slotIndex}`);
  
  sendToPlayer(player.ws, {
    type: 'skill_equipped',
    slot: slotIndex,
    skillId: playerSkills.equipped[slotIndex],
    equipped: playerSkills.equipped
  });
}

/**
 * Build player combat stats from character DB data + equipment bonuses
 * This ensures all combat uses equipment-enhanced stats
 * @param {string} id - Player/socket ID (will be truncated to 8 chars for PvP)
 * @param {Object} character - Character data from database.getCharacter()
 * @param {Object} equipBonuses - Equipment bonuses from itemManager.calculateEquipmentBonuses()
 * @returns {Object} Combat-ready stats object
 */
function buildPlayerCombatStats(id, character, equipBonuses) {
  const b = equipBonuses || {};
  const totalStr = (character.str || 1) + (b.str || 0);
  const totalAgi = (character.agi || 1) + (b.agi || 0);
  const totalDex = (character.dex || 1) + (b.dex || 0);
  const totalVit = (character.vit || 1) + (b.vit || 0);
  const totalEnd = (character.end || 1) + (b.end || 0);
  const totalInt = (character.int || 1) + (b.int || 0);
  const totalDef = (character.def || 0) + (b.def || 0);
  const totalArmor = (character.armor || 0) + (b.armor || 0);

  // Recalculate maxHp/maxStamina with bonuses
  const maxHp = CONSTANTS.BASE_HP + (totalVit * CONSTANTS.HP_PER_VIT);
  const maxStamina = CONSTANTS.BASE_STAMINA + (totalEnd * CONSTANTS.STAMINA_PER_END);

  return {
    id: id,
    name: character.name,
    hp: Math.min(character.hp || maxHp, maxHp),
    maxHp: maxHp,
    stamina: Math.min(character.stamina || maxStamina, maxStamina),
    maxStamina: maxStamina,
    damage: totalStr * CONSTANTS.DAMAGE_PER_STR,
    armor: totalArmor,
    level: character.level || 1,
    str: totalStr,
    agi: totalAgi,
    dex: totalDex,
    vit: totalVit,
    def: totalDef,
    end: totalEnd,
    int: totalInt
  };
}

/**
 * Handle player attacking a mob (initiating combat)
 * This is triggered when the player tries to walk into a mob
 */
async function handleAttackMob(player, message) {
  const mobId = message.mobId;
  
  if (!mobId || typeof mobId !== 'string') {
    return;
  }
  
  // Check if player is already in combat
  if (combatManager.isInCombat(player.id)) {
    sendToPlayer(player.ws, {
      type: CONSTANTS.MSG_TYPES.ERROR,
      error: 'Already in combat!'
    });
    return;
  }
  
  // Get mob
  const mob = mobManager.getMob(mobId);
  if (!mob || mob.isDead) {
    return;
  }
  
  // Check if mob is in same zone
  if (mob.zoneId !== player.zoneId) {
    return;
  }
  
  // Get character data for combat stats
  const character = await database.getCharacter(player.accountId);
  if (!character) return;
  
  // Get player's skills
  const playerSkills = await database.getCharacterSkills(player.accountId);
  
  // Get mob type data for combat stats
  const mobTypes = mobManager.getMobTypes();
  const mobType = mobTypes[mob.type];
  if (!mobType) return;
  
  // Prepare player combat stats (with equipment bonuses)
  const equipment = await database.getEquipment(player.accountId);
  const equipBonuses = itemManager.calculateEquipmentBonuses(equipment);
  const playerStats = buildPlayerCombatStats(player.id, character, equipBonuses);
  
  // Prepare mob combat stats (include all stats needed by initializeCombatant)
  const mobStats = {
    id: mob.id,
    name: mobType.name,
    hp: mob.hp,
    maxHp: mob.maxHp,
    stamina: mob.stamina || mobType.stamina || 50,
    maxStamina: mob.maxStamina || mobType.maxStamina || 50,
    damage: mobType.damage || mobType.baseDamage || ((mobType.str || 1) * CONSTANTS.DAMAGE_PER_STR),
    armor: mobType.armor || 0,
    defense: mobType.defense || mobType.def || 0,
    level: mobType.level || 1,
    // Stats needed for combat calculations (attack speed, crit, dodge, block)
    str: mobType.str || 1,
    agi: mobType.agi || 1,
    dex: mobType.dex || 1,
    def: mobType.def || mobType.defense || 0,
    int: mobType.int || 1,
    moveSpeed: mobType.moveSpeed || 1000,
    expReward: mobType.expReward,
    drops: mobType.drops || []
  };
  
  // Debug: Log mob stats for combat
  console.log(`[Combat] Mob stats for ${mobType.name}: hp=${mobStats.hp}, damage=${mobStats.damage}, str=${mobStats.str}, agi=${mobStats.agi}, dex=${mobStats.dex}, def=${mobStats.def}`);
  
  // Simulate the entire battle with skills
  console.log(`[Combat] Player skills data:`, JSON.stringify(playerSkills));
  
  let battleResult;
  try {
    battleResult = combatManager.simulateBattle(playerStats, mobStats, playerSkills);
  } catch (error) {
    console.error(`[Combat] ERROR in simulateBattle:`, error);
    console.error(`[Combat] Stack trace:`, error.stack);
    sendToPlayer(player.ws, {
      type: CONSTANTS.MSG_TYPES.ERROR,
      error: 'Combat simulation failed'
    });
    return;
  }
  
  // Mark player and mob as in combat
  combatManager.startCombat(player.id, battleResult);
  mob.inCombat = true;
  mob.combatPlayerId = player.id;
  
  console.log(`[Combat] ${player.characterName} started battle with ${mobType.name} (${battleResult.events.length} events, ${battleResult.duration}ms)`);
  
  // Send combat start to player with all events for replay
  sendToPlayer(player.ws, {
    type: CONSTANTS.MSG_TYPES.COMBAT_START,
    mobId: mob.id,
    mob: {
      id: mob.id,
      name: mobType.name,
      hp: mob.hp,
      maxHp: mob.maxHp,
      sprite: mobType.sprite,
      x: mob.x,
      y: mob.y
    },
    player: {
      hp: playerStats.hp,
      maxHp: playerStats.maxHp,
      stamina: playerStats.stamina,
      maxStamina: playerStats.maxStamina
    },
    events: battleResult.events,
    duration: battleResult.duration,
    playerWon: battleResult.playerWon
  });
  
  // Schedule combat end processing
  setTimeout(async () => {
    await processCombatEnd(player, mob, mobType, battleResult, character);
  }, battleResult.duration + 500); // Add small buffer for client animation
}

/**
 * Process the end of combat - update database, send rewards, handle death
 */
async function processCombatEnd(player, mob, mobType, battleResult, character) {
  // End combat state
  combatManager.endCombat(player.id);
  mob.inCombat = false;
  mob.combatPlayerId = null;
  
  if (battleResult.playerWon) {
    // Player won - kill mob and give rewards
    mobManager.killMob(mob.id);
    
    // Calculate experience and check for level up(s)
    let currentLevel = character.level || 1;
    let currentExp = (character.experience || 0) + battleResult.expReward;
    let expForNextLevel = calculateExpForLevel(currentLevel); // EXP needed to level up from current level
    
    // Check for level up (can level up multiple times if EXP is high enough)
    let levelUp = false;
    let levelsGained = 0;
    let newStatPoints = character.stat_points || 0;
    let newMaxHp = character.max_hp;
    
    while (currentExp >= expForNextLevel) {
      // Level up! Subtract the EXP needed and increment level
      currentExp -= expForNextLevel;
      currentLevel++;
      levelsGained++;
      newStatPoints += CONSTANTS.STAT_POINTS_PER_LEVEL;
      levelUp = true;
      
      // Calculate EXP needed for the next level
      expForNextLevel = calculateExpForLevel(currentLevel); // EXP needed to level up from new level
    }
    
    // Update max HP based on new level (if leveled up)
    if (levelUp) {
      newMaxHp = CONSTANTS.BASE_HP + ((character.vit || 1) * CONSTANTS.HP_PER_VIT);
    }
    
    const newLevel = currentLevel;
    const newExp = currentExp; // This is now the remaining EXP after level-ups
    
    // Handle item drop
    let itemDropped = null;
    let goldFromItem = 0;
    let inventoryFull = false;
    
    if (battleResult.itemDrop) {
      const droppedItemId = battleResult.itemDrop;
      const itemDef = itemManager.getItem(droppedItemId);
      
      if (itemDef) {
        // Check if player has inventory space (base 8 slots + bonus from equipment)
        const equipment = await database.getEquipment(player.accountId);
        const equipBonuses = itemManager.calculateEquipmentBonuses(equipment);
        const inventorySize = Math.min(8 + (equipBonuses.bonusSlots || 0), 36);
        const { hasSpace } = await database.canAddToInventory(player.accountId, droppedItemId, inventorySize);
        
        if (hasSpace) {
          // Add item to inventory
          await database.addToInventory(player.accountId, droppedItemId, 1);
          itemDropped = {
            itemId: droppedItemId,
            name: itemDef.name,
            icon: itemDef.icon,
            rarity: itemDef.rarity
          };
        } else {
          // Inventory full - convert to 80% gold value
          inventoryFull = true;
          goldFromItem = Math.floor((itemDef.sellPrice || 1) * 0.8);
        }
      }
    }
    
    // Update character in database
    const updates = {
      experience: newExp,
      gold: (character.gold || 0) + goldFromItem,
      hp: battleResult.finalPlayerHp,
      stamina: character.max_stamina  // Restore stamina to full after combat
    };
    
    if (levelUp) {
      updates.level = newLevel;
      updates.stat_points = newStatPoints;
      updates.max_hp = newMaxHp;
      updates.hp = newMaxHp; // Full heal on level up
    }
    
    await database.updateCharacterStats(player.accountId, updates);
    
    // Send combat end notification
    sendToPlayer(player.ws, {
      type: CONSTANTS.MSG_TYPES.COMBAT_END,
      result: 'victory',
      mobId: mob.id,
      exp: battleResult.expReward,
      newTotalExp: newExp,
      playerHp: levelUp ? newMaxHp : battleResult.finalPlayerHp,
      playerStamina: character.max_stamina,  // Send full stamina
      levelUp: levelUp,
      newLevel: newLevel,
      newMaxHp: levelUp ? newMaxHp : undefined,
      // Item drop info
      itemDrop: itemDropped,
      inventoryFull: inventoryFull,
      goldFromItem: goldFromItem,
      newTotalGold: (character.gold || 0) + goldFromItem
    });
    
    // Send inventory update if item was added
    if (itemDropped) {
      await handleGetInventory(player);
    }
    
    // Log combat result
    let logMsg = `[Combat] ${player.characterName} defeated ${mobType.name}! +${battleResult.expReward} EXP`;
    if (itemDropped) {
      logMsg += `, dropped: ${itemDropped.name}`;
    } else if (inventoryFull && goldFromItem > 0) {
      logMsg += `, inventory full - auto-sold for ${goldFromItem} gold`;
    }
    if (levelUp) {
      logMsg += ` - LEVEL UP to ${newLevel}!${levelsGained > 1 ? ` (+${levelsGained} levels)` : ''}`;
    }
    console.log(logMsg);
  } else {
    // Player lost - handle death
    // Get player's spawn point
    const spawnPoint = await database.getSpawnPoint(player.accountId);
    const respawnHp = Math.floor(character.max_hp * 0.5); // Respawn with 50% HP
    
    const updates = {
      hp: respawnHp,
      stamina: character.max_stamina // Restore stamina on death
    };
    
    // Update position to spawn point
    await database.updateCharacterPosition(player.accountId, spawnPoint.zone, spawnPoint.x, spawnPoint.y);
    await database.updateCharacterStats(player.accountId, updates);
    
    // Update server-side player state
    const oldZone = player.zoneId;
    player.zoneId = spawnPoint.zone;
    player.x = spawnPoint.x;
    player.y = spawnPoint.y;
    
    // Notify other players in old zone that this player left
    if (oldZone !== spawnPoint.zone) {
      broadcastToZone(oldZone, {
        type: CONSTANTS.MSG_TYPES.PLAYER_LEAVE,
        playerId: player.id.substring(0, 8)
      }, player.id);
    }
    
    // Load spawn zone data for name
    const spawnZoneData = loadZoneData(spawnPoint.zone);
    const spawnZoneName = spawnZoneData ? spawnZoneData.name : 'Unknown';
    
    // Send death notification with full spawn info
    sendToPlayer(player.ws, {
      type: CONSTANTS.MSG_TYPES.PLAYER_DEATH,
      mobId: mob.id,
      mobName: mobType.name,
      killedBy: 'mob',
      respawnHp: respawnHp,
      respawnZone: spawnPoint.zone,
      respawnZoneName: spawnZoneName,
      respawnX: spawnPoint.x,
      respawnY: spawnPoint.y
    });
    
    // Reset mob HP since player died
    mob.hp = mob.maxHp;
    
    console.log(`[Combat] ${player.characterName} was defeated by ${mobType.name}! Respawning at ${spawnZoneName}`);
  }
}

/**
 * Calculate experience required to level up from current level
 * Formula: 50 * level^1.5, rounded to nearest 10
 * Level 1->2: ~50 EXP, Level 2->3: ~140, Level 10->11: ~1580
 */
function calculateExpForLevel(level) {
  if (level <= 1) return 50; // Level 1 needs 50 EXP to reach level 2
  return Math.round(50 * Math.pow(level, 1.5) / 10) * 10;
}

/**
 * Award experience to a player and handle level ups
 * @param {Object} player - The player object
 * @param {number} expAmount - Amount of EXP to award
 * @param {string} source - Source of EXP (for logging)
 * @returns {Object} Result with levelUp info
 */
async function awardExperience(player, expAmount, source = 'unknown') {
  if (!player.accountId || expAmount <= 0) {
    return { success: false, levelUp: false };
  }
  
  const character = await database.getCharacter(player.accountId);
  if (!character) {
    return { success: false, levelUp: false };
  }
  
  let currentExp = character.experience + expAmount;
  let currentLevel = character.level;
  let expForNextLevel = calculateExpForLevel(currentLevel);
  let levelUp = false;
  let levelsGained = 0;
  
  // Check for level up(s)
  while (currentExp >= expForNextLevel) {
    currentExp -= expForNextLevel;
    currentLevel++;
    levelsGained++;
    levelUp = true;
    expForNextLevel = calculateExpForLevel(currentLevel);
  }
  
  // Calculate new stats if leveled up
  const updates = {
    experience: currentExp
  };
  
  if (levelUp) {
    const newMaxHp = CONSTANTS.BASE_HP + (character.vit * CONSTANTS.HP_PER_VIT);
    const newStatPoints = character.stat_points + (CONSTANTS.STAT_POINTS_PER_LEVEL * levelsGained);
    const newSkillPoints = (character.skill_points || 0) + (CONSTANTS.SKILL_POINTS_PER_LEVEL * levelsGained);
    
    updates.level = currentLevel;
    updates.stat_points = newStatPoints;
    updates.skill_points = newSkillPoints;
    updates.max_hp = newMaxHp;
    updates.hp = newMaxHp; // Full heal on level up
    
    // Update player in-memory data
    player.level = currentLevel;
  }
  
  await database.updateCharacterStats(player.accountId, updates);
  
  if (levelUp) {
    console.log(`[EXP] ${player.characterName} leveled up to ${currentLevel} from ${source}!`);
  }
  
  return {
    success: true,
    levelUp: levelUp,
    newLevel: currentLevel,
    levelsGained: levelsGained,
    newExp: currentExp
  };
}

// ===================
// MARKET HANDLERS
// ===================

const MAX_MARKET_LISTINGS = 3; // Maximum listings per player

/**
 * Handle opening the market - send all listings + player's own listings
 */
async function handleMarketOpen(player) {
  if (!player.accountId) return;

  try {
    const [allListings, myListings] = await Promise.all([
      database.getMarketListings(null, 100),
      database.getMyMarketListings(player.accountId)
    ]);

    // Enrich listings with item data
    const enrichedAll = allListings.map(l => ({
      id: l.id,
      sellerName: l.seller_name,
      itemId: l.item_id,
      item: itemManager.getItem(l.item_id),
      price: l.price,
      listedAt: l.listed_at
    })).filter(l => l.item); // filter out items that no longer exist

    const enrichedMy = myListings.map(l => ({
      id: l.id,
      itemId: l.item_id,
      item: itemManager.getItem(l.item_id),
      price: l.price,
      listedAt: l.listed_at
    })).filter(l => l.item);

    sendToPlayer(player.ws, {
      type: CONSTANTS.MSG_TYPES.MARKET_LISTINGS,
      listings: enrichedAll,
      myListings: enrichedMy,
      maxListings: MAX_MARKET_LISTINGS
    });
  } catch (err) {
    console.error('[Market] Error opening market:', err);
  }
}

/**
 * Handle searching market listings
 */
async function handleMarketSearch(player, message) {
  if (!player.accountId) return;

  const searchTerm = (message.searchTerm || '').trim().toLowerCase();

  try {
    const allListings = await database.getMarketListings(null, 200);

    const enrichedAll = allListings.map(l => ({
      id: l.id,
      sellerName: l.seller_name,
      itemId: l.item_id,
      item: itemManager.getItem(l.item_id),
      price: l.price,
      listedAt: l.listed_at
    })).filter(l => l.item);

    // Filter by search term (match item name)
    const filtered = searchTerm
      ? enrichedAll.filter(l => l.item.name.toLowerCase().includes(searchTerm))
      : enrichedAll;

    sendToPlayer(player.ws, {
      type: CONSTANTS.MSG_TYPES.MARKET_LISTINGS,
      listings: filtered,
      searchTerm: searchTerm
    });
  } catch (err) {
    console.error('[Market] Error searching market:', err);
  }
}

/**
 * Handle listing an item on the market
 */
async function handleMarketListItem(player, message) {
  if (!player.accountId) return;

  const { itemId, slotIndex, price } = message;

  if (!itemId || slotIndex === undefined || !price || price < 1) {
    sendToPlayer(player.ws, {
      type: CONSTANTS.MSG_TYPES.MARKET_LIST_RESPONSE,
      success: false,
      message: 'Invalid request'
    });
    return;
  }

  // Validate price (integer, reasonable range)
  const parsedPrice = Math.floor(price);
  if (parsedPrice < 1 || parsedPrice > 10000000) {
    sendToPlayer(player.ws, {
      type: CONSTANTS.MSG_TYPES.MARKET_LIST_RESPONSE,
      success: false,
      message: 'Price must be between 1 and 10,000,000 gold'
    });
    return;
  }

  // Check item exists and is equipment
  const itemDef = itemManager.getItem(itemId);
  if (!itemDef) {
    sendToPlayer(player.ws, {
      type: CONSTANTS.MSG_TYPES.MARKET_LIST_RESPONSE,
      success: false,
      message: 'Item not found'
    });
    return;
  }

  if (itemDef.type !== 'equipment') {
    sendToPlayer(player.ws, {
      type: CONSTANTS.MSG_TYPES.MARKET_LIST_RESPONSE,
      success: false,
      message: 'Only equipment items can be listed on the market'
    });
    return;
  }

  // Check listing limit
  const listingCount = await database.getMarketListingCount(player.accountId);
  if (listingCount >= MAX_MARKET_LISTINGS) {
    sendToPlayer(player.ws, {
      type: CONSTANTS.MSG_TYPES.MARKET_LIST_RESPONSE,
      success: false,
      message: `You can only have ${MAX_MARKET_LISTINGS} active listings`
    });
    return;
  }

  // Verify item is in inventory at the correct slot
  const inventory = await database.getInventory(player.accountId);
  const invItem = inventory.find(i => i.item_id === itemId && i.slot_index === slotIndex);
  if (!invItem) {
    sendToPlayer(player.ws, {
      type: CONSTANTS.MSG_TYPES.MARKET_LIST_RESPONSE,
      success: false,
      message: 'Item not found in inventory'
    });
    return;
  }

  try {
    // Remove 1 quantity from inventory
    await database.removeFromInventory(player.accountId, itemId, 1);

    // Create listing
    const listingId = await database.createMarketListing(
      player.accountId, player.characterName, itemId, parsedPrice
    );

    console.log(`[Market] ${player.characterName} listed ${itemDef.name} for ${parsedPrice} gold (listing #${listingId})`);

    sendToPlayer(player.ws, {
      type: CONSTANTS.MSG_TYPES.MARKET_LIST_RESPONSE,
      success: true,
      message: `Listed ${itemDef.name} for ${parsedPrice} gold`
    });

    // Refresh inventory
    await handleGetInventory(player);

    // Send updated market data
    await handleMarketOpen(player);
  } catch (err) {
    console.error('[Market] Error listing item:', err);
    sendToPlayer(player.ws, {
      type: CONSTANTS.MSG_TYPES.MARKET_LIST_RESPONSE,
      success: false,
      message: 'Failed to list item'
    });
  }
}

/**
 * Handle buying an item from the market
 */
async function handleMarketBuyItem(player, message) {
  if (!player.accountId) return;

  const { listingId } = message;
  if (!listingId) {
    sendToPlayer(player.ws, {
      type: CONSTANTS.MSG_TYPES.MARKET_BUY_RESPONSE,
      success: false,
      message: 'Invalid request'
    });
    return;
  }

  try {
    // Get the listing
    const listing = await database.getMarketListing(listingId);
    if (!listing) {
      sendToPlayer(player.ws, {
        type: CONSTANTS.MSG_TYPES.MARKET_BUY_RESPONSE,
        success: false,
        message: 'Listing no longer available'
      });
      return;
    }

    // Can't buy your own listing
    if (listing.seller_account_id === player.accountId) {
      sendToPlayer(player.ws, {
        type: CONSTANTS.MSG_TYPES.MARKET_BUY_RESPONSE,
        success: false,
        message: "You can't buy your own listing"
      });
      return;
    }

    // Check buyer has enough gold
    const character = await database.getCharacter(player.accountId);
    if (!character || character.gold < listing.price) {
      sendToPlayer(player.ws, {
        type: CONSTANTS.MSG_TYPES.MARKET_BUY_RESPONSE,
        success: false,
        message: 'Not enough gold'
      });
      return;
    }

    // Check buyer has inventory space
    const equipment = await database.getEquipment(player.accountId);
    const equipmentBonuses = itemManager.calculateEquipmentBonuses(equipment);
    const invSize = Math.min(8 + (equipmentBonuses.bonusSlots || 0), 36);
    const canAdd = await database.canAddToInventory(player.accountId, listing.item_id, invSize);
    if (!canAdd.hasSpace) {
      sendToPlayer(player.ws, {
        type: CONSTANTS.MSG_TYPES.MARKET_BUY_RESPONSE,
        success: false,
        message: 'Inventory full'
      });
      return;
    }

    // Process transaction
    // 1. Deduct gold from buyer
    const newGold = character.gold - listing.price;
    await database.updateCharacterStats(player.accountId, { gold: newGold });

    // 2. Add item to buyer's inventory
    await database.addToInventory(player.accountId, listing.item_id, 1);

    // 3. Credit seller full price - works even if offline
    const sellerPayout = listing.price;
    await database.creditGold(listing.seller_account_id, sellerPayout);

    // 4. Remove listing
    await database.deleteMarketListing(listingId);

    const itemDef = itemManager.getItem(listing.item_id);
    console.log(`[Market] ${player.characterName} bought ${itemDef?.name || listing.item_id} from ${listing.seller_name} for ${listing.price} gold`);

    sendToPlayer(player.ws, {
      type: CONSTANTS.MSG_TYPES.MARKET_BUY_RESPONSE,
      success: true,
      message: `Purchased ${itemDef?.name || 'item'} for ${listing.price} gold`,
      newGold: newGold
    });

    // Update buyer's gold display
    sendToPlayer(player.ws, { type: 'gold_update', gold: newGold });

    // Refresh inventory
    await handleGetInventory(player);

    // Refresh market
    await handleMarketOpen(player);

    // If seller is online, update their gold and notify them
    const sellerPlayer = findPlayerByAccountId(listing.seller_account_id);
    if (sellerPlayer) {
      const sellerChar = await database.getCharacter(listing.seller_account_id);
      if (sellerChar) {
        sendToPlayer(sellerPlayer.ws, { type: 'gold_update', gold: sellerChar.gold });
        sendToPlayer(sellerPlayer.ws, {
          type: 'market_sale_notification',
          itemName: itemDef?.name || listing.item_id,
          price: listing.price,
          payout: sellerPayout
        });
      }
    }
  } catch (err) {
    console.error('[Market] Error buying item:', err);
    sendToPlayer(player.ws, {
      type: CONSTANTS.MSG_TYPES.MARKET_BUY_RESPONSE,
      success: false,
      message: 'Failed to purchase item'
    });
  }
}

/**
 * Handle cancelling a market listing
 */
async function handleMarketCancel(player, message) {
  if (!player.accountId) return;

  const { listingId } = message;
  if (!listingId) {
    sendToPlayer(player.ws, {
      type: CONSTANTS.MSG_TYPES.MARKET_CANCEL_RESPONSE,
      success: false,
      message: 'Invalid request'
    });
    return;
  }

  try {
    const listing = await database.getMarketListing(listingId);
    if (!listing) {
      sendToPlayer(player.ws, {
        type: CONSTANTS.MSG_TYPES.MARKET_CANCEL_RESPONSE,
        success: false,
        message: 'Listing not found'
      });
      return;
    }

    // Must be the seller
    if (listing.seller_account_id !== player.accountId) {
      sendToPlayer(player.ws, {
        type: CONSTANTS.MSG_TYPES.MARKET_CANCEL_RESPONSE,
        success: false,
        message: 'You can only cancel your own listings'
      });
      return;
    }

    // Check inventory space to return the item
    const equipment = await database.getEquipment(player.accountId);
    const equipmentBonuses = itemManager.calculateEquipmentBonuses(equipment);
    const invSize = Math.min(8 + (equipmentBonuses.bonusSlots || 0), 36);
    const canAdd = await database.canAddToInventory(player.accountId, listing.item_id, invSize);
    if (!canAdd.hasSpace) {
      sendToPlayer(player.ws, {
        type: CONSTANTS.MSG_TYPES.MARKET_CANCEL_RESPONSE,
        success: false,
        message: 'Inventory full - cannot return item'
      });
      return;
    }

    // Return item to inventory
    await database.addToInventory(player.accountId, listing.item_id, 1);

    // Delete listing
    await database.deleteMarketListing(listingId);

    const itemDef = itemManager.getItem(listing.item_id);
    console.log(`[Market] ${player.characterName} cancelled listing for ${itemDef?.name || listing.item_id}`);

    sendToPlayer(player.ws, {
      type: CONSTANTS.MSG_TYPES.MARKET_CANCEL_RESPONSE,
      success: true,
      message: `Cancelled listing for ${itemDef?.name || 'item'}`
    });

    // Refresh inventory + market
    await handleGetInventory(player);
    await handleMarketOpen(player);
  } catch (err) {
    console.error('[Market] Error cancelling listing:', err);
    sendToPlayer(player.ws, {
      type: CONSTANTS.MSG_TYPES.MARKET_CANCEL_RESPONSE,
      success: false,
      message: 'Failed to cancel listing'
    });
  }
}

/**
 * Find a connected player by account ID
 */
function findPlayerByAccountId(accountId) {
  for (const [, p] of players) {
    if (p.accountId === accountId) return p;
  }
  return null;
}

/**
 * Get ghost player data for a zone (excluding a specific player)
 */
function getGhostsForZone(zoneId, excludePlayerId) {
  const ghosts = [];
  
  players.forEach((p) => {
    // Only include authenticated players with characters
    if (p.zoneId === zoneId && p.id !== excludePlayerId && p.authenticated && p.characterName) {
      ghosts.push({
        id: p.id.substring(0, 8),
        name: p.characterName,
        x: p.x,
        y: p.y,
        direction: p.direction || 'down',
        equipment: p.visibleEquipment || {}
      });
    }
  });
  
  // Limit to max ghosts
  return ghosts.slice(0, MAX_GHOSTS_PER_ZONE);
}

/**
 * Send message to specific player
 */
function sendToPlayer(ws, message) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

/**
 * Broadcast message to all connected players
 */
function broadcast(message) {
  const data = JSON.stringify(message);
  players.forEach((player) => {
    if (player.ws.readyState === WebSocket.OPEN) {
      player.ws.send(data);
    }
  });
}

/**
 * Broadcast message to all players in a specific zone
 */
function broadcastToZone(zoneId, message, excludePlayerId = null) {
  const data = JSON.stringify(message);
  players.forEach((player) => {
    if (player.zoneId === zoneId && player.id !== excludePlayerId) {
      if (player.ws.readyState === WebSocket.OPEN) {
        player.ws.send(data);
      }
    }
  });
}

// ===================
// CASTLE PAYOUT SYSTEM
// ===================

/**
 * Process castle payouts every hour
 */
async function processCastlePayouts() {
  console.log('[Castle] Starting payout processing...');
  try {
    const payouts = await database.processCastlePayouts();
    
    console.log(`[Castle] Database returned ${payouts.length} payouts`);
    
    // Notify online players of their payouts
    for (const payout of payouts) {
      console.log(`[Castle] Processing payout for ${payout.ownerName}: ${payout.goldEarned} gold`);
      // Find if owner is online
      for (const [, p] of players) {
        if (p.accountId === payout.accountId && p.ws.readyState === 1) {
          console.log(`[Castle] Player ${payout.ownerName} is online, sending notification`);
          sendToPlayer(p.ws, {
            type: CONSTANTS.MSG_TYPES.CASTLE_PAYOUT,
            castleId: payout.castleId,
            goldEarned: payout.goldEarned,
            message: `🏰 You earned ${payout.goldEarned} gold from your castle!`
          });
          
          // Also update their gold in character data
          const char = await database.getCharacter(p.accountId);
          if (char) {
            sendToPlayer(p.ws, {
              type: 'gold_update',
              gold: char.gold
            });
          }
          break;
        }
      }
    }
    
    if (payouts.length > 0) {
      console.log(`[Castle] Processed ${payouts.length} castle payouts`);
    } else {
      console.log('[Castle] No payouts to process');
    }
  } catch (error) {
    console.error('[Castle] Error processing payouts:', error);
  }
}

// Process castle payouts every 5 minutes for testing (change to 60 * 60 * 1000 for production)
const CASTLE_PAYOUT_INTERVAL = 5 * 60 * 1000; // 5 minutes for testing
setInterval(processCastlePayouts, CASTLE_PAYOUT_INTERVAL);
console.log(`[Castle] Payout interval set to ${CASTLE_PAYOUT_INTERVAL / 1000} seconds`);

// Also run once shortly after server start to catch up any missed payouts
setTimeout(processCastlePayouts, 10000); // 10 seconds after start
console.log('[Castle] Initial payout check scheduled for 10 seconds after start');

// ===================
// START SERVER
// ===================
const PORT = config.PORT;

// Initialize database then start server
database.init()
  .then(() => {
    // Initialize mob manager
    mobManager.init();
    
    // Initialize skill manager (load skill trees from JSON files)
    skillManager.loadSkills();
    
    // Initialize item manager (load items from JSON files)
    itemManager.init();
    
    // Initialize boss manager (after itemManager and skillManager)
    bossManager.init({
      itemManager: itemManager,
      skillManager: skillManager,
      database: database
    });
    
    // Load shop data
    loadShopsData();
    
    // Server version for tracking deployments
    const SERVER_VERSION = 'v2024-01-BUILD-002';
    
    server.listen(PORT, () => {
      console.log('=========================================');
      console.log('   UMBRA ONLINE SERVER');
      console.log(`   Version: ${SERVER_VERSION}`);
      console.log('=========================================');
      console.log(`   Environment: ${config.NODE_ENV}`);
      console.log(`   HTTP Server: http://localhost:${PORT}`);
      console.log(`   WebSocket:   ws://localhost:${PORT}${config.WS_PATH}`);
      if (config.isProd()) {
        console.log(`   Domain:      https://${config.DOMAIN}`);
      }
      console.log('=========================================');
      console.log('   Ready for connections!');
      console.log('=========================================');
      
      // List zones directory on startup to verify path
      const zonesDir = path.join(__dirname, '../data/zones');
      console.log(`[Startup] Checking zones directory: ${zonesDir}`);
      if (fs.existsSync(zonesDir)) {
        const zoneFiles = fs.readdirSync(zonesDir).filter(f => f.endsWith('.json'));
        console.log(`[Startup] Found ${zoneFiles.length} zone files: ${zoneFiles.slice(0,10).join(', ')}...`);
      } else {
        console.error(`[Startup] ZONES DIRECTORY NOT FOUND: ${zonesDir}`);
      }
    });
  })
  .catch((err) => {
    console.error('[Server] Failed to initialize database:', err);
    process.exit(1);
  });

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[Server] SIGTERM received, shutting down gracefully...');
  mobManager.shutdown();
  bossManager.shutdown();
  wss.clients.forEach((ws) => {
    ws.close(1001, 'Server shutting down');
  });
  server.close(() => {
    console.log('[Server] Server closed');
    process.exit(0);
  });
});
