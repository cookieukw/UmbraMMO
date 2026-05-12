/**
 * UMBRA ONLINE - Server Boss Manager
 * Handles boss spawning, state, cooldowns, and combat
 * 
 * Boss mechanics:
 * - Bosses are always alive on the map and walk around
 * - Players interact with [E] to see boss info
 * - Combat is PvP-style (boss has skills)
 * - When defeated: 12-hour per-player cooldown (boss stays visible to others)
 * - Cooldowns are persisted in the database
 * - No server-wide respawn timers or grace periods
 */

const fs = require('fs');
const path = require('path');
const CONSTANTS = require('../shared/constants.js');

// Reference to external managers (set during init)
let itemManager = null;
let skillManager = null;
let database = null;

// Boss type definitions loaded from JSON
let bossTypes = {};

// Active bosses per zone: Map<zoneId, Map<bossId, bossState>>
const zoneBosses = new Map();

// In-memory cache of player boss defeats: Map<`${accountId}_${bossKey}`, defeatTime>
// This is loaded from DB on player join and updated on defeat
const playerBossDefeats = new Map();

// Boss ID counter
let nextBossInstanceId = 1;

// Update interval
const BOSS_UPDATE_INTERVAL = 500; // ms
let updateTimer = null;

// Zone data cache for pathfinding
const zoneCache = new Map();

/**
 * Normalize boss data to flatten nested structures (baseStats, combat, rewards, behavior)
 * Converts new format bosses to the flat format expected by combat code
 */
function normalizeBossData(bossData) {
  // If already in flat format (has hp directly and no baseStats), return as-is with defaults
  if (bossData.hp !== undefined && !bossData.baseStats) {
    return {
      ...bossData,
      spriteUrl: bossData.spriteUrl || null,
      maxHp: bossData.maxHp || bossData.hp,
      maxStamina: bossData.maxStamina || bossData.stamina || 50,
      moveSpeed: (bossData.moveSpeed || 1000) * 5  // Bosses move 5x slower
    };
  }
  
  // New format with nested structures - flatten it
  const baseStats = bossData.baseStats || {};
  const combat = bossData.combat || {};
  const rewards = bossData.rewards || {};
  const behavior = bossData.behavior || {};
  
  return {
    // Core identity
    id: bossData.id,
    name: bossData.name,
    title: bossData.title,
    level: bossData.level || 1,
    sprite: bossData.sprite,
    spriteUrl: bossData.spriteUrl || null,
    color: bossData.color,
    description: bossData.description,
    biome: bossData.biome,
    location: bossData.location,
    camp: bossData.camp,
    
    // Stats from baseStats
    hp: baseStats.hp || 100,
    maxHp: baseStats.hp || 100,
    stamina: baseStats.stamina || 50,
    maxStamina: baseStats.stamina || 50,
    str: baseStats.str || 1,
    vit: baseStats.vit || 1,
    agi: baseStats.agi || 1,
    dex: baseStats.dex || 1,
    def: baseStats.def || 0,
    int: baseStats.int || 1,
    end: baseStats.end || 1,
    
    // Combat stats
    baseDamage: combat.baseDamage || baseStats.str || 1,
    armor: combat.armor || 0,
    attackSpeed: combat.attackSpeed || 1500,
    moveSpeed: (combat.moveSpeed || 1000) * 5,  // Bosses move 5x slower (more menacing)
    aggroRange: combat.aggroRange || 5,
    
    // Behavior
    behavior: (typeof behavior === 'string') ? behavior : (behavior.type || 'patrol'),
    patrolRadius: bossData.patrolRadius || 3,
    
    // Rewards
    expReward: rewards.exp || bossData.expReward || 100,
    goldReward: rewards.gold || bossData.goldReward || 50,
    
    // Respawn and drops
    respawnTime: bossData.respawnTime || 3600000,
    graceTime: bossData.graceTime || 60000,
    drops: bossData.drops || [],
    
    // Skills
    skills: bossData.skills || { active: [], passive: [] }
  };
}

/**
 * Load boss type definitions from JSON files
 */
function loadBossTypes() {
  try {
    const bossDir = path.join(__dirname, '../data/bosses');
    
    if (!fs.existsSync(bossDir)) {
      console.log('[BossManager] No bosses directory found, creating...');
      fs.mkdirSync(bossDir, { recursive: true });
      return false;
    }
    
    const files = fs.readdirSync(bossDir);
    
    bossTypes = {};
    let loadedCount = 0;
    
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      
      try {
        const filePath = path.join(bossDir, file);
        const data = fs.readFileSync(filePath, 'utf8');
        const bossData = JSON.parse(data);
        
        const bossId = bossData.id || file.replace('.json', '');
        // Normalize the boss data to flatten nested structures
        const normalizedBoss = normalizeBossData(bossData);
        bossTypes[bossId] = normalizedBoss;
        loadedCount++;
        
        // Debug: check if spriteUrl is present after normalization
        console.log(`[BossManager] Loaded boss type: ${bossId} (${normalizedBoss.name}) - spriteUrl: ${normalizedBoss.spriteUrl || 'MISSING'}`);
      } catch (fileErr) {
        console.error(`[BossManager] Failed to load boss file ${file}:`, fileErr.message);
      }
    }
    
    console.log(`[BossManager] Loaded ${loadedCount} boss types total`);
    
    // Debug: log all spriteUrls
    console.log('[BossManager] spriteUrl status for all bosses:');
    for (const [id, boss] of Object.entries(bossTypes)) {
      console.log(`  ${id}: ${boss.spriteUrl || 'MISSING'}`);
    }
    
    return loadedCount > 0;
  } catch (err) {
    console.error('[BossManager] Failed to load boss types:', err.message);
    return false;
  }
}

/**
 * Initialize boss manager
 * @param {Object} options - Optional config
 * @param {Object} options.itemManager - Reference to item manager
 * @param {Object} options.skillManager - Reference to skill manager
 * @param {Object} options.database - Reference to database module
 */
function init(options = {}) {
  // Store manager references
  if (options.itemManager) itemManager = options.itemManager;
  if (options.skillManager) skillManager = options.skillManager;
  if (options.database) database = options.database;
  
  loadBossTypes();
  
  // Start boss update loop
  if (updateTimer) clearInterval(updateTimer);
  updateTimer = setInterval(updateAllBosses, BOSS_UPDATE_INTERVAL);
  
  // Periodically clean up expired defeats from DB (every hour)
  setInterval(() => {
    if (database) {
      database.cleanupBossDefeats(CONSTANTS.BOSS_COOLDOWN_MS);
    }
  }, 60 * 60 * 1000);
  
  console.log('[BossManager] Server boss manager initialized (per-player cooldowns, 12h)');
}

/**
 * Get boss type definitions
 */
function getBossTypes() {
  console.log('[BossManager] getBossTypes called, returning', Object.keys(bossTypes).length, 'types');
  if (Object.keys(bossTypes).length > 0) {
    const firstKey = Object.keys(bossTypes)[0];
    console.log('[BossManager] First boss type key:', firstKey, 'has spriteUrl:', bossTypes[firstKey]?.spriteUrl);
  }
  // Debug: check poison_widow specifically
  if (bossTypes['poison_widow']) {
    console.log('[BossManager] poison_widow spriteUrl:', bossTypes['poison_widow'].spriteUrl);
    console.log('[BossManager] poison_widow keys:', Object.keys(bossTypes['poison_widow']));
  }
  return bossTypes;
}

/**
 * Get a specific boss type
 */
function getBossType(bossId) {
  return bossTypes[bossId] || null;
}

/**
 * Initialize bosses for a zone
 * Bosses are ALWAYS spawned - no global respawn check needed
 */
function initializeZone(zoneId, zoneData) {
  if (!zoneData || !zoneData.bossSpawns) {
    zoneBosses.set(zoneId, new Map());
    return;
  }
  
  // Cache zone data
  zoneCache.set(zoneId, zoneData);
  
  // If zone already has bosses initialized, don't re-initialize
  if (zoneBosses.has(zoneId) && zoneBosses.get(zoneId).size > 0) {
    return;
  }
  
  const bosses = new Map();
  
  for (const spawn of zoneData.bossSpawns) {
    const bossType = bossTypes[spawn.bossType];
    if (!bossType) {
      console.warn(`[BossManager] Unknown boss type: ${spawn.bossType} in zone ${zoneId}`);
      continue;
    }
    
    const bossKey = `${zoneId}_${spawn.bossType}_${spawn.x}_${spawn.y}`;
    const instanceId = `boss_${nextBossInstanceId++}`;
    
    const boss = {
      id: instanceId,
      type: spawn.bossType,
      bossKey: bossKey,
      name: bossType.name,
      title: bossType.title || null,
      x: spawn.x,
      y: spawn.y,
      spawnX: spawn.x,
      spawnY: spawn.y,
      hp: bossType.maxHp || bossType.hp,
      maxHp: bossType.maxHp || bossType.hp,
      stamina: bossType.maxStamina || bossType.stamina,
      maxStamina: bossType.maxStamina || bossType.stamina,
      level: bossType.level || 1,
      direction: 'down',
      moveSpeed: bossType.moveSpeed || 1500,
      patrolRadius: bossType.patrolRadius || 3,
      behavior: bossType.behavior || 'patrol',
      lastMoveTime: Date.now(),
      targetX: spawn.x,
      targetY: spawn.y,
      isAlive: true
    };
    
    bosses.set(instanceId, boss);
    console.log(`[BossManager] Spawned boss ${bossType.name} at (${spawn.x}, ${spawn.y}) in zone ${zoneId}`);
  }
  
  zoneBosses.set(zoneId, bosses);
}

/**
 * Load player's boss defeats from database into memory cache
 * Call this when a player connects/joins
 */
async function loadPlayerDefeats(accountId) {
  if (!database) return;
  
  try {
    const defeats = await database.getBossDefeats(accountId, CONSTANTS.BOSS_COOLDOWN_MS);
    const now = Date.now();
    
    for (const [bossKey, defeatTime] of Object.entries(defeats)) {
      const remaining = CONSTANTS.BOSS_COOLDOWN_MS - (now - defeatTime);
      if (remaining > 0) {
        playerBossDefeats.set(`${accountId}_${bossKey}`, defeatTime);
      }
    }
    
    console.log(`[BossManager] Loaded ${Object.keys(defeats).length} active boss cooldowns for account ${accountId}`);
  } catch (err) {
    console.error(`[BossManager] Failed to load boss defeats for account ${accountId}:`, err);
  }
}

/**
 * Get all bosses in a zone for a player
 * All bosses are always sent - cooldown info is included per boss
 */
function getBossesForPlayer(zoneId, accountId) {
  const bosses = zoneBosses.get(zoneId);
  if (!bosses) return [];
  
  const result = [];
  const now = Date.now();
  
  for (const [id, boss] of bosses) {
    if (!boss.isAlive) continue;
    
    // Check if this player has this boss on cooldown
    const defeatKey = `${accountId}_${boss.bossKey}`;
    const defeatTime = playerBossDefeats.get(defeatKey);
    
    let onCooldown = false;
    let cooldownRemaining = 0;
    
    if (defeatTime) {
      const elapsed = now - defeatTime;
      if (elapsed < CONSTANTS.BOSS_COOLDOWN_MS) {
        onCooldown = true;
        cooldownRemaining = CONSTANTS.BOSS_COOLDOWN_MS - elapsed;
      } else {
        // Cooldown expired, clean up
        playerBossDefeats.delete(defeatKey);
      }
    }
    
    result.push({
      id: boss.id,
      type: boss.type,
      name: boss.name,
      title: boss.title,
      x: boss.x,
      y: boss.y,
      hp: boss.hp,
      maxHp: boss.maxHp,
      level: boss.level,
      direction: boss.direction,
      isAlive: boss.isAlive,
      onCooldown: onCooldown,
      cooldownRemaining: onCooldown ? cooldownRemaining : 0
    });
  }
  
  return result;
}

/**
 * Get boss by instance ID
 */
function getBoss(zoneId, bossInstanceId) {
  const bosses = zoneBosses.get(zoneId);
  if (!bosses) return null;
  return bosses.get(bossInstanceId) || null;
}

/**
 * Get detailed boss info (for info panel)
 */
function getBossInfo(zoneId, bossInstanceId, accountId) {
  const boss = getBoss(zoneId, bossInstanceId);
  if (!boss) return null;
  
  const bossType = bossTypes[boss.type];
  if (!bossType) return null;
  
  // Check if player has this boss on cooldown
  const defeatKey = `${accountId}_${boss.bossKey}`;
  const defeatTime = playerBossDefeats.get(defeatKey);
  const now = Date.now();
  
  let canAttack = true;
  let cooldownRemaining = 0;
  
  if (defeatTime) {
    const elapsed = now - defeatTime;
    if (elapsed < CONSTANTS.BOSS_COOLDOWN_MS) {
      canAttack = false;
      cooldownRemaining = Math.ceil((CONSTANTS.BOSS_COOLDOWN_MS - elapsed) / 1000); // seconds
    } else {
      playerBossDefeats.delete(defeatKey);
    }
  }
  
  return {
    id: boss.id,
    type: boss.type,
    name: boss.name,
    title: boss.title,
    level: boss.level,
    hp: boss.hp,
    maxHp: boss.maxHp,
    description: bossType.description || '',
    
    // Stats for display
    stats: {
      str: bossType.str || 1,
      vit: bossType.vit || 1,
      agi: bossType.agi || 1,
      dex: bossType.dex || 1,
      def: bossType.def || 0,
      end: bossType.end || 1
    },
    
    // Active skills (for display)
    activeSkills: (bossType.skills?.active || []).map(skill => {
      const skillData = skillManager ? skillManager.getSkillInfo(skill.treeId, skill.skillId, skill.level) : null;
      return {
        treeId: skill.treeId,
        skillId: skill.skillId,
        level: skill.level,
        name: skillData?.name || `${skill.treeId}:${skill.skillId}`,
        icon: skillData?.icon || '⚔️',
        description: skillData?.description || ''
      };
    }),
    
    // Drops (for display)
    drops: (bossType.drops || []).map(drop => {
      const item = itemManager ? itemManager.getItem(drop.itemId) : null;
      return {
        itemId: drop.itemId,
        chance: drop.chance,
        minQty: drop.minQty,
        maxQty: drop.maxQty,
        name: item?.name || drop.itemId,
        icon: item?.icon || '📦',
        rarity: item?.rarity || 'common'
      };
    }),
    
    // Rewards
    expReward: bossType.expReward || 0,
    goldReward: bossType.goldReward || 0,
    
    // Combat availability
    canAttack: canAttack,
    cooldownRemaining: cooldownRemaining
  };
}

/**
 * Check if player can attack a boss
 */
function canPlayerAttackBoss(zoneId, bossInstanceId, accountId) {
  const boss = getBoss(zoneId, bossInstanceId);
  if (!boss || !boss.isAlive) return { canAttack: false, reason: 'Boss not found' };
  
  const bossType = bossTypes[boss.type];
  if (!bossType) return { canAttack: false, reason: 'Invalid boss type' };
  
  // Check if player has this boss on cooldown
  const defeatKey = `${accountId}_${boss.bossKey}`;
  const defeatTime = playerBossDefeats.get(defeatKey);
  const now = Date.now();
  
  if (defeatTime) {
    const elapsed = now - defeatTime;
    if (elapsed < CONSTANTS.BOSS_COOLDOWN_MS) {
      const remaining = CONSTANTS.BOSS_COOLDOWN_MS - elapsed;
      const hours = Math.floor(remaining / 3600000);
      const mins = Math.floor((remaining % 3600000) / 60000);
      return { canAttack: false, reason: `You've already defeated this boss. Cooldown: ${hours}h ${mins}m remaining.` };
    } else {
      // Cooldown expired
      playerBossDefeats.delete(defeatKey);
    }
  }
  
  return { canAttack: true, boss: boss, bossType: bossType };
}

/**
 * Get boss combat stats (for PvP-style combat)
 */
function getBossCombatStats(bossType) {
  return {
    id: `boss_${bossType.id}`,
    name: bossType.name,
    hp: bossType.maxHp || bossType.hp,
    maxHp: bossType.maxHp || bossType.hp,
    stamina: bossType.maxStamina || bossType.stamina,
    maxStamina: bossType.maxStamina || bossType.stamina,
    damage: bossType.baseDamage || (bossType.str || 1) * CONSTANTS.DAMAGE_PER_STR,
    str: bossType.str || 1,
    agi: bossType.agi || 1,
    dex: bossType.dex || 1,
    int: bossType.int || 1,
    def: bossType.def || 0,
    armor: bossType.armor || 0,
    level: bossType.level || 1
  };
}

/**
 * Get boss skills in the format combat manager expects
 */
function getBossSkills(bossType) {
  const skills = {
    learned: {},
    equipped: []
  };
  
  if (!bossType.skills) return skills;
  
  // Add active skills to learned and equipped
  if (bossType.skills.active) {
    for (let i = 0; i < bossType.skills.active.length && i < 5; i++) {
      const skill = bossType.skills.active[i];
      const skillKey = `${skill.treeId}_${skill.skillId}`;
      skills.learned[skillKey] = skill.level;
      skills.equipped.push({ treeId: skill.treeId, skillId: skill.skillId });
    }
  }
  
  // Add passive skills to learned
  if (bossType.skills.passive) {
    for (const skill of bossType.skills.passive) {
      const skillKey = `${skill.treeId}_${skill.skillId}`;
      skills.learned[skillKey] = skill.level;
    }
  }
  
  return skills;
}

/**
 * Record boss defeat by a player
 * Saves to both memory cache and database
 */
async function recordBossDefeat(zoneId, bossInstanceId, accountId) {
  const boss = getBoss(zoneId, bossInstanceId);
  if (!boss) return;
  
  const now = Date.now();
  
  // Record defeat in memory cache
  const defeatKey = `${accountId}_${boss.bossKey}`;
  playerBossDefeats.set(defeatKey, now);
  
  // Persist to database
  if (database) {
    try {
      await database.recordBossDefeat(accountId, boss.bossKey);
      console.log(`[BossManager] Player ${accountId} defeated boss ${boss.name} - 12h cooldown started (persisted to DB)`);
    } catch (err) {
      console.error(`[BossManager] Failed to persist boss defeat to DB:`, err);
    }
  } else {
    console.log(`[BossManager] Player ${accountId} defeated boss ${boss.name} - 12h cooldown started (in-memory only)`);
  }
}

/**
 * Update boss AI (movement/patrol)
 */
function updateBossAI(boss, zoneData) {
  if (!boss.isAlive || boss.behavior === 'stationary') return;
  
  const now = Date.now();
  
  // Check if it's time to move
  if (now - boss.lastMoveTime < boss.moveSpeed) return;
  
  // If reached target, pick new target
  if (boss.x === boss.targetX && boss.y === boss.targetY) {
    // Random wander within patrol radius
    const offsetX = Math.floor(Math.random() * (boss.patrolRadius * 2 + 1)) - boss.patrolRadius;
    const offsetY = Math.floor(Math.random() * (boss.patrolRadius * 2 + 1)) - boss.patrolRadius;
    
    const newX = boss.spawnX + offsetX;
    const newY = boss.spawnY + offsetY;
    
    // Check if walkable
    if (zoneData && isWalkable(zoneData, newX, newY)) {
      boss.targetX = newX;
      boss.targetY = newY;
    }
  }
  
  // Move toward target
  if (boss.x !== boss.targetX || boss.y !== boss.targetY) {
    const dx = boss.targetX - boss.x;
    const dy = boss.targetY - boss.y;
    
    let newX = boss.x;
    let newY = boss.y;
    
    if (Math.abs(dx) > Math.abs(dy)) {
      newX += Math.sign(dx);
      boss.direction = dx > 0 ? 'right' : 'left';
    } else if (dy !== 0) {
      newY += Math.sign(dy);
      boss.direction = dy > 0 ? 'down' : 'up';
    }
    
    if (zoneData && isWalkable(zoneData, newX, newY)) {
      boss.x = newX;
      boss.y = newY;
    } else {
      // Can't move, pick new target
      boss.targetX = boss.x;
      boss.targetY = boss.y;
    }
    
    boss.lastMoveTime = now;
  }
}

/**
 * Check if a tile is walkable
 */
function isWalkable(zoneData, x, y) {
  if (!zoneData || !zoneData.tiles) return false;
  if (x < 0 || y < 0 || y >= zoneData.tiles.length || x >= zoneData.tiles[0].length) return false;
  
  const tile = zoneData.tiles[y][x];
  return tile === CONSTANTS.TILE_TYPES.WALKABLE ||
         tile === CONSTANTS.TILE_TYPES.EXIT_NORTH ||
         tile === CONSTANTS.TILE_TYPES.EXIT_EAST ||
         tile === CONSTANTS.TILE_TYPES.EXIT_SOUTH ||
         tile === CONSTANTS.TILE_TYPES.EXIT_WEST;
}

/**
 * Update all bosses in all zones
 * No respawn checking needed - bosses are always alive
 */
function updateAllBosses() {
  for (const [zoneId, bosses] of zoneBosses) {
    const zoneData = zoneCache.get(zoneId);
    
    for (const [id, boss] of bosses) {
      updateBossAI(boss, zoneData);
    }
  }
}

/**
 * Clean up player defeat cache when they disconnect
 */
function clearPlayerDefeats(accountId) {
  for (const key of playerBossDefeats.keys()) {
    if (key.startsWith(`${accountId}_`)) {
      playerBossDefeats.delete(key);
    }
  }
}

/**
 * Clean up zone bosses when zone is unloaded
 */
function cleanupZone(zoneId) {
  zoneBosses.delete(zoneId);
  zoneCache.delete(zoneId);
}

/**
 * Shutdown boss manager
 */
function shutdown() {
  if (updateTimer) {
    clearInterval(updateTimer);
    updateTimer = null;
  }
  zoneBosses.clear();
  playerBossDefeats.clear();
  console.log('[BossManager] Shutdown complete');
}

module.exports = {
  init,
  loadBossTypes,
  getBossTypes,
  getBossType,
  initializeZone,
  loadPlayerDefeats,
  getBossesForPlayer,
  getBoss,
  getBossInfo,
  canPlayerAttackBoss,
  getBossCombatStats,
  getBossSkills,
  recordBossDefeat,
  clearPlayerDefeats,
  cleanupZone,
  shutdown
};
