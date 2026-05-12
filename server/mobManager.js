/**
 * UMBRA ONLINE - Server Mob Manager
 * Handles mob spawning, AI, and state management
 */

const fs = require('fs');
const path = require('path');

// Mob type definitions loaded from JSON
let mobTypes = {};

// Active mobs per zone: Map<zoneId, Map<mobId, mobData>>
const zoneMobs = new Map();

// Mob ID counter
let nextMobId = 1;

// Update interval
const MOB_UPDATE_INTERVAL = 500; // ms
let updateTimer = null;

// Zone data cache for pathfinding
const zoneCache = new Map();

/**
 * Load mob type definitions from individual JSON files
 * Falls back to mobs.json for any mob types not found as individual files
 */
function loadMobTypes() {
  try {
    const mobsDir = path.join(__dirname, '../data/mobs');
    const files = fs.readdirSync(mobsDir);
    
    mobTypes = {};
    let loadedCount = 0;
    
    // First, load from the combined mobs.json as a base
    const combinedPath = path.join(mobsDir, 'mobs.json');
    if (fs.existsSync(combinedPath)) {
      try {
        const data = fs.readFileSync(combinedPath, 'utf8');
        const combinedMobs = JSON.parse(data);
        
        for (const [mobId, mobData] of Object.entries(combinedMobs)) {
          mobTypes[mobId] = normalizeMobData(mobData);
          loadedCount++;
          console.log(`[MobManager] Loaded mob type from mobs.json: ${mobId}`);
        }
      } catch (err) {
        console.error('[MobManager] Failed to load mobs.json:', err.message);
      }
    }
    
    // Then, load individual files which override mobs.json entries
    for (const file of files) {
      // Skip if not a JSON file or is the combined file
      if (!file.endsWith('.json') || file === 'mobs.json') continue;
      
      try {
        const filePath = path.join(mobsDir, file);
        let data = fs.readFileSync(filePath, 'utf8');
        
        // Strip BOM if present
        if (data.charCodeAt(0) === 0xFEFF) {
          data = data.slice(1);
        }
        
        const mobData = JSON.parse(data);
        
        // Use the mob's id as the key, fallback to filename without extension
        const mobId = mobData.id || file.replace('.json', '');
        
        // Normalize the mob data to flatten nested structures
        const normalizedMob = normalizeMobData(mobData);
        
        // Check if this is overriding an existing entry
        const isOverride = mobTypes[mobId] !== undefined;
        mobTypes[mobId] = normalizedMob;
        
        if (isOverride) {
          console.log(`[MobManager] Overrode mob type with individual file: ${mobId}`);
        } else {
          loadedCount++;
          console.log(`[MobManager] Loaded mob type: ${mobId}`);
        }
        
        // Debug: log the normalized stats for verification
        console.log(`[MobManager] ${mobId} normalized stats: hp=${normalizedMob.hp}, damage=${normalizedMob.damage}, str=${normalizedMob.str}, agi=${normalizedMob.agi}`);
      } catch (fileErr) {
        console.error(`[MobManager] Failed to load mob file ${file}:`, fileErr.message);
      }
    }
    
    console.log(`[MobManager] Loaded ${loadedCount} mob types total`);
    return loadedCount > 0;
  } catch (err) {
    console.error('[MobManager] Failed to load mob types:', err.message);
    return false;
  }
}

/**
 * Normalize mob data to flatten nested structures (baseStats, combat, rewards, behavior)
 * Converts new format mobs to the flat format expected by combat code
 */
function normalizeMobData(mobData) {
  // Calculate default EXP based on level using power formula: multiplier * level^exponent
  // Exponent < 1.5 means kills per level increase at higher levels (desired progression)
  // Target: ~30-40 kills for early tiers, ~70-90 for mid, ~100-130 for late
  const level = mobData.level || 1;
  const expMultiplier = 8;
  const expExponent = 1.25;
  const defaultExp = Math.round(expMultiplier * Math.pow(level, expExponent));
  
  // If already in flat format (has hp directly), return as-is with defaults
  if (mobData.hp !== undefined && !mobData.baseStats) {
    return {
      ...mobData,
      // Ensure all expected fields have defaults
      spriteUrl: mobData.spriteUrl || null,
      str: mobData.str || 1,
      vit: mobData.vit || 1,
      agi: mobData.agi || 1,
      dex: mobData.dex || 1,
      def: mobData.def || 0,
      int: mobData.int || 1,
      end: mobData.end || 1,
      damage: mobData.damage || mobData.baseDamage || 1,
      defense: mobData.defense || mobData.def || 0,
      maxHp: mobData.maxHp || mobData.hp,
      maxStamina: mobData.maxStamina || mobData.stamina || 50,
      // Use calculated EXP if not explicitly set
      expReward: mobData.expReward || defaultExp
    };
  }
  
  // New format with nested structures - flatten it
  const baseStats = mobData.baseStats || {};
  const combat = mobData.combat || {};
  const rewards = mobData.rewards || {};
  const behavior = mobData.behavior || {};
  
  const normalized = {
    // Core identity
    id: mobData.id,
    name: mobData.name,
    level: mobData.level || 1,
    sprite: mobData.sprite,
    spriteUrl: mobData.spriteUrl || null,
    color: mobData.color,
    description: mobData.description,
    biome: mobData.biome,
    
    // Stats from baseStats
    hp: baseStats.hp || 20,
    maxHp: baseStats.hp || 20,
    stamina: baseStats.stamina || 30,
    maxStamina: baseStats.stamina || 30,
    str: baseStats.str || 1,
    vit: baseStats.vit || 1,
    agi: baseStats.agi || 1,
    dex: baseStats.dex || 1,
    def: baseStats.def || 0,
    int: baseStats.int || 1,
    end: baseStats.end || 1,
    
    // Combat stats from combat object
    damage: combat.baseDamage || baseStats.str || 1,
    baseDamage: combat.baseDamage || baseStats.str || 1,
    defense: baseStats.def || 0,
    armor: combat.armor || 0,
    attackSpeed: combat.attackSpeed || 1500,
    moveSpeed: combat.moveSpeed || 1000,
    aggroRange: combat.aggroRange || 0,
    leashRange: combat.leashRange || 8,
    
    // Behavior
    behavior: (typeof behavior === 'string') ? behavior : (behavior.type || 'wander'),
    isAggressive: behavior.aggressiveness === 'aggressive',
    canFlee: behavior.type === 'flee' || behavior.aggressiveness === 'passive',
    fleeHealthPercent: behavior.fleeHealthPercent || 0.15,
    
    // Rewards - calculate EXP based on level using power formula if not explicitly set
    // Formula: 8 * level^1.25 for progressive difficulty (more kills at higher levels)
    expReward: rewards.exp || mobData.expReward || defaultExp,
    gold: rewards.gold || 0,
    
    // Respawn and drops
    respawnTime: mobData.respawnTime || 30000,
    drops: mobData.drops || [],
    
    // Flags
    isBoss: mobData.isBoss || false
  };
  
  console.log(`[MobManager] Normalized ${mobData.name}: hp=${normalized.hp}, damage=${normalized.damage}, str=${normalized.str}, agi=${normalized.agi}`);
  
  return normalized;
}

/**
 * Initialize mob manager
 */
function init() {
  loadMobTypes();
  
  // Start mob update loop
  if (updateTimer) clearInterval(updateTimer);
  updateTimer = setInterval(updateAllMobs, MOB_UPDATE_INTERVAL);
  
  console.log('[MobManager] Server mob manager initialized');
}

/**
 * Cache zone data for pathfinding
 */
function cacheZone(zoneId, zoneData) {
  zoneCache.set(zoneId, {
    width: zoneData.width,
    height: zoneData.height,
    tiles: zoneData.tiles
  });
}

/**
 * Spawn mobs for a zone
 */
function spawnMobsForZone(zoneId, zoneData) {
  if (!zoneData.mobType || !zoneData.mobSpawns) {
    return;
  }
  
  const mobType = mobTypes[zoneData.mobType];
  if (!mobType) {
    console.warn(`[MobManager] Unknown mob type: ${zoneData.mobType}`);
    return;
  }
  
  // Cache zone for pathfinding
  cacheZone(zoneId, zoneData);
  
  // Initialize zone mob map if needed
  if (!zoneMobs.has(zoneId)) {
    zoneMobs.set(zoneId, new Map());
  }
  
  const mobs = zoneMobs.get(zoneId);
  
  // Only spawn if zone is empty
  if (mobs.size > 0) {
    return;
  }
  
  // Spawn mobs at each spawn point
  zoneData.mobSpawns.forEach((spawn, index) => {
    const mobId = `mob_${zoneId}_${nextMobId++}`;

    const mob = {
      id: mobId,
      type: zoneData.mobType,
      zoneId: zoneId,
      x: spawn.x,
      y: spawn.y,
      spawnX: spawn.x,
      spawnY: spawn.y,
      
      // Resources (use maxHp/maxStamina from data, or calculate from VIT/END)
      hp: mobType.maxHp || mobType.hp,
      maxHp: mobType.maxHp || mobType.hp,
      stamina: mobType.maxStamina || mobType.stamina || 50,
      maxStamina: mobType.maxStamina || mobType.stamina || 50,
      
      // Attributes (same as player)
      str: mobType.str || 1,
      vit: mobType.vit || 1,
      agi: mobType.agi || 1,
      dex: mobType.dex || 1,
      def: mobType.def || 0,
      int: mobType.int || 1,
      end: mobType.end || 1,
      level: mobType.level || 1,
      
      // Combat stats
      baseDamage: mobType.baseDamage || mobType.damage || 1,
      armor: mobType.armor || 0,
      
      // Legacy support (in case old format is used)
      damage: mobType.baseDamage || mobType.damage || 1,
      defense: mobType.defense || mobType.def || 0,
      
      // Rewards
      expReward: mobType.expReward,
      drops: mobType.drops || [],
      
      // Behavior
      moveSpeed: mobType.moveSpeed,
      aggroRange: mobType.aggroRange || 0,
      leashRange: mobType.leashRange || 8,
      respawnTime: mobType.respawnTime,
      behavior: mobType.behavior || 'wander',
      
      // Flags
      isBoss: mobType.isBoss || false,
      isAggressive: mobType.isAggressive || false,
      canFlee: mobType.canFlee || false,
      fleeHealthPercent: mobType.fleeHealthPercent || 0.15,
      
      // State
      isDead: false,
      direction: 'down',
      lastMoveTime: Date.now(),
      lastActionTime: Date.now(),
      targetPlayerId: null,
      inCombat: false,
      
      // Wander state
      wanderCooldown: Math.random() * 3000,
      isMoving: false
    };
    
    mobs.set(mobId, mob);
  });
  
  console.log(`[MobManager] Spawned ${zoneData.mobSpawns.length} ${zoneData.mobType}s in ${zoneId}`);
}

/**
 * Check if a tile is walkable for mobs
 */
function isTileWalkable(zoneId, x, y) {
  const zone = zoneCache.get(zoneId);
  if (!zone) return false;
  
  if (x < 0 || x >= zone.width || y < 0 || y >= zone.height) {
    return false;
  }
  
  const tileType = zone.tiles[y]?.[x];
  return tileType === 0; // Only walkable tiles (not exits, water, etc.)
}

/**
 * Update all mobs AI
 */
function updateAllMobs() {
  const now = Date.now();
  
  for (const [zoneId, mobs] of zoneMobs) {
    for (const [mobId, mob] of mobs) {
      if (mob.isDead) {
        // Check for respawn
        if (mob.deathTime && now - mob.deathTime >= mob.respawnTime) {
          respawnMob(mob);
        }
        continue;
      }
      
      // Update based on behavior
      switch (mob.behavior) {
        case 'wander':
          updateWanderBehavior(mob, now);
          break;
        case 'aggressive':
          // TODO: Chase players
          updateWanderBehavior(mob, now);
          break;
        default:
          updateWanderBehavior(mob, now);
      }
    }
  }
}

/**
 * Wander behavior - move randomly
 */
function updateWanderBehavior(mob, now) {
  // Don't move if in combat
  if (mob.inCombat) {
    return;
  }
  
  // Check if enough time has passed since last move
  if (now - mob.lastMoveTime < mob.moveSpeed) {
    return;
  }
  
  // Random chance to move or stay still
  mob.wanderCooldown -= MOB_UPDATE_INTERVAL;
  
  if (mob.wanderCooldown > 0) {
    return;
  }
  
  // Reset cooldown - mobs wait 2-8 seconds between moves
  mob.wanderCooldown = 2000 + Math.random() * 6000; // 2-8 seconds
  
  // Random chance to move (70%) or stand still
  if (Math.random() < 0.3) {
    mob.isMoving = false;
    return;
  }
  
  // Pick random direction
  const directions = [
    { dx: 0, dy: -1, dir: 'up' },
    { dx: 0, dy: 1, dir: 'down' },
    { dx: -1, dy: 0, dir: 'left' },
    { dx: 1, dy: 0, dir: 'right' }
  ];
  
  // Shuffle directions
  for (let i = directions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [directions[i], directions[j]] = [directions[j], directions[i]];
  }
  
  // Try each direction until we find a valid one
  for (const dir of directions) {
    const newX = mob.x + dir.dx;
    const newY = mob.y + dir.dy;
    
    // Don't wander too far from spawn
    const distFromSpawn = Math.abs(newX - mob.spawnX) + Math.abs(newY - mob.spawnY);
    if (distFromSpawn > 4) {
      continue;
    }
    
    if (isTileWalkable(mob.zoneId, newX, newY)) {
      // Check if another mob is there
      if (!isMobAt(mob.zoneId, newX, newY, mob.id)) {
        mob.x = newX;
        mob.y = newY;
        mob.direction = dir.dir;
        mob.lastMoveTime = now;
        mob.isMoving = true;
        break;
      }
    }
  }
}

/**
 * Check if a mob is at position
 */
function isMobAt(zoneId, x, y, excludeId = null) {
  const mobs = zoneMobs.get(zoneId);
  if (!mobs) return false;
  
  for (const [, mob] of mobs) {
    if (mob.id === excludeId || mob.isDead) continue;
    if (mob.x === x && mob.y === y) {
      return true;
    }
  }
  return false;
}

/**
 * Respawn a dead mob
 */
function respawnMob(mob) {
  mob.x = mob.spawnX;
  mob.y = mob.spawnY;
  mob.hp = mob.maxHp;
  mob.stamina = mob.maxStamina;
  mob.isDead = false;
  mob.deathTime = null;
  mob.targetPlayerId = null;
  mob.inCombat = false;
  mob.wanderCooldown = Math.random() * 2000;
  
  console.log(`[MobManager] Respawned ${mob.type} at (${mob.x}, ${mob.y})`);
}

/**
 * Get mob state for a zone (to send to clients)
 */
function getMobsForZone(zoneId) {
  const mobs = zoneMobs.get(zoneId);
  if (!mobs) return [];
  
  const mobList = [];
  for (const [, mob] of mobs) {
    mobList.push({
      id: mob.id,
      type: mob.type,
      x: mob.x,
      y: mob.y,
      hp: mob.hp,
      maxHp: mob.maxHp,
      direction: mob.direction,
      isDead: mob.isDead
    });
  }
  return mobList;
}

/**
 * Get mob type definitions (to send to clients)
 */
function getMobTypes() {
  return mobTypes;
}

/**
 * Get a specific mob by ID
 */
function getMob(mobId) {
  for (const [, mobs] of zoneMobs) {
    if (mobs.has(mobId)) {
      return mobs.get(mobId);
    }
  }
  return null;
}

/**
 * Damage a mob
 * Returns damage dealt and whether mob died
 */
function damageMob(mobId, damage) {
  const mob = getMob(mobId);
  if (!mob || mob.isDead) {
    return { damage: 0, killed: false };
  }
  
  // Apply damage
  const actualDamage = Math.max(1, damage - mob.defense);
  mob.hp -= actualDamage;
  
  if (mob.hp <= 0) {
    mob.hp = 0;
    mob.isDead = true;
    mob.deathTime = Date.now();
    
    return {
      damage: actualDamage,
      killed: true,
      exp: mob.expReward
    };
  }
  
  return { damage: actualDamage, killed: false };
}

/**
 * Kill a mob directly (from combat system)
 */
function killMob(mobId) {
  const mob = getMob(mobId);
  if (!mob || mob.isDead) {
    return false;
  }
  
  mob.hp = 0;
  mob.isDead = true;
  mob.deathTime = Date.now();
  mob.inCombat = false;
  mob.combatPlayerId = null;
  
  return true;
}

/**
 * Clear mobs for a zone
 */
function clearZoneMobs(zoneId) {
  zoneMobs.delete(zoneId);
}

/**
 * Get the zone danger info for a player
 * Returns null if zone is safe, or { level, damage } if dangerous
 * Zone is dangerous if mobs are 5+ levels above player
 */
function getZoneDangerInfo(zoneId) {
  const mobs = zoneMobs.get(zoneId);
  if (!mobs || mobs.size === 0) {
    return null;
  }
  
  // Get the first mob to determine zone mob level and damage
  let mobLevel = 1;
  let mobDamage = 1;
  
  for (const [, mob] of mobs) {
    mobLevel = mob.level || 1;
    mobDamage = mob.baseDamage || mob.damage || 1;
    break; // All mobs in a zone are the same type
  }
  
  return {
    level: mobLevel,
    damage: mobDamage
  };
}

/**
 * Get mob type info by type ID
 */
function getMobTypeInfo(typeId) {
  return mobTypes[typeId] || null;
}

/**
 * Shutdown mob manager
 */
function shutdown() {
  if (updateTimer) {
    clearInterval(updateTimer);
    updateTimer = null;
  }
  zoneMobs.clear();
  console.log('[MobManager] Shut down');
}

module.exports = {
  init,
  loadMobTypes,
  spawnMobsForZone,
  getMobsForZone,
  getMobTypes,
  getMob,
  getMobTypeInfo,
  getZoneDangerInfo,
  damageMob,
  killMob,
  clearZoneMobs,
  shutdown
};
