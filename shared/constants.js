/**
 * UMBRA ONLINE - Shared Constants
 * These constants are used by both client and server
 */

const CONSTANTS = {
  // ===================
  // TILE & ZONE
  // ===================
  TILE_SIZE: 48,           // Pixels per tile (48x48)
  ZONE_WIDTH: 20,          // Tiles per zone (horizontal)
  ZONE_HEIGHT: 15,         // Tiles per zone (vertical)
  
  // Tile types
  TILE_TYPES: {
    WALKABLE: 0,
    BLOCKED: 1,
    EXIT_NORTH: 2,
    EXIT_EAST: 3,
    EXIT_SOUTH: 4,
    EXIT_WEST: 5,
    WATER: 6,
    INTERACTABLE: 7
  },

  // ===================
  // MOVEMENT
  // ===================
  MOVEMENT_SPEED: 507,     // Milliseconds per tile (30% slower than 390ms)
  TILES_PER_SECOND: 1.97,  // Movement speed in tiles

  // ===================
  // COMBAT
  // ===================
  COMBAT_TICK_RATE: 100,   // Milliseconds per combat tick (0.1s)
  MAX_COMBAT_TICKS: 1500,  // Maximum ticks (150 seconds)
  BASIC_ATTACK_STAMINA: 2, // Stamina cost for basic attack
  STAMINA_REGEN_PER_SEC: 2,// Stamina regenerated per second
  BLOCK_MITIGATION: 0.5,   // 50% damage reduction on block/defense
  DODGE_MITIGATION: 1.0,   // 100% damage reduction on dodge
  BLOCK_MITIGATION: 0.5,   // 50% damage reduction on block
  CRIT_MULTIPLIER: 1.5,    // Critical hit damage multiplier

  // ===================
  // STATS
  // ===================
  BASE_HP: 45,
  BASE_STAMINA: 45,
  HP_PER_VIT: 5,
  STAMINA_PER_END: 5,
  DAMAGE_PER_STR: 1,
  MAGIC_DAMAGE_PER_INT: 1,
  
  // Attack speed (AGI)
  BASE_ATTACK_COOLDOWN: 2.0,     // Base cooldown in seconds (at AGI 0)
  AGI_SOFT_CAP: 50,              // AGI level where 1.0s cooldown is reached
  MIN_ATTACK_COOLDOWN: 0.3,      // Minimum cooldown (hard cap)

  // Block chance (DEF)
  BLOCK_PER_DEF: 1.0,        // 1% block chance per DEF point (before soft cap)
  DEF_SOFT_CAP: 50,          // DEF level where diminishing returns start
  BLOCK_HARD_CAP: 75,        // Maximum block chance %

  // Percentage stats (per point)
  CRIT_PER_DEX: 0.5,       // % per DEX
  DODGE_PER_DEX: 0.5,      // % per DEX
  CDR_PER_INT: 0.5,        // % per INT

  // General diminishing returns (for crit/dodge)
  SOFT_CAP: 35,            // % where diminishing returns start
  HARD_CAP: 70,            // % maximum achievable
  CDR_HARD_CAP: 50,        // % maximum cooldown reduction

  // ===================
  // LEVELING
  // ===================
  STAT_POINTS_PER_LEVEL: 3,
  SKILL_POINTS_PER_LEVEL: 1,
  
  // ===================
  // TRAINING
  // ===================
  TRAINING_CYCLE_MINUTES: 20,    // Minutes per training cycle
  TRAINING_EXP_PERCENT: 2,       // % of level-up EXP gained per cycle
  TRAINING_MAX_LEVEL: 50,        // Max level for training benefits

  // ===================
  // BOSS COOLDOWNS
  // ===================
  BOSS_COOLDOWN_MS: 12 * 60 * 60 * 1000,  // 12 hours per-player cooldown after defeating a boss

  // Feature unlock levels
  UNLOCK_LEVELS: {
    SKILLS: 1,  // Skills available from level 1
    PVP: 5,
    BOSS: 5,
    BAZAR: 10,
    GUILD: 10,
    CASTLE: 10,
    VITALITY_TREE: 10,
    ROGUERY_TREE: 10,
    MAGIC_TREE: 20,
    WINDMASTER_TREE: 20,
    SHADOW_TREE: 30,
    ARCANE_TREE: 30
  },

  // ===================
  // ZONE DANGER
  // ===================
  ZONE_DANGER_LEVEL_THRESHOLD: 5,    // Mobs must be this many levels above player
  ZONE_DANGER_INTERVAL: 2000,        // Damage every 2 seconds (ms)
  ZONE_DANGER_INITIAL_DELAY: 2000,   // 2 second delay before first damage

  // ===================
  // INVENTORY
  // ===================
  BASE_INVENTORY_SLOTS: 8,
  EQUIPMENT_SLOTS: [
    'headgear', 'amulet', 'backpack',
    'weapon1', 'chest', 'weapon2',
    'ring1', 'pants', 'ring2',
    'boots'
  ],

  // ===================
  // ITEM TYPES
  // ===================
  ITEM_TYPES: {
    EQUIPMENT: 'equipment',
    FOOD: 'food',
    LOOT: 'loot',
    RESOURCE: 'resource'
  },

  WEAPON_SUBTYPES: {
    ONE_HANDED: '1h',
    TWO_HANDED: '2h',
    OFF_HAND: 'offhand'
  },

  RARITY: {
    NORMAL: { name: 'Normal', color: '#a4a4a4' },
    UNCOMMON: { name: 'Uncommon', color: '#28a745' },
    RARE: { name: 'Rare', color: '#007bff' },
    EPIC: { name: 'Epic', color: '#9d4edd' },
    LEGENDARY: { name: 'Legendary', color: '#ffc107' }
  },

  // ===================
  // PLAYER STATES
  // ===================
  PLAYER_STATES: {
    IDLE: 'idle',
    WALKING: 'walking',
    COMBAT: 'combat',
    TRAINING: 'training',
    GATHERING: 'gathering',
    DEAD: 'dead'
  },

  // ===================
  // TRAINING
  // ===================
  BASE_TRAINING_DURATION: 20 * 60 * 1000, // 20 minutes in ms
  TRAINING_UPGRADE_COSTS: [500, 2000, 8000, 32000, 128000],
  TRAINING_UPGRADE_REDUCTION: [0, 0.1, 0.2, 0.3, 0.4, 0.5],

  // ===================
  // PROFESSIONS
  // ===================
  PROFESSION_YIELD_BONUS: 0.05, // 5% per level
  
  // ===================
  // NETWORK
  // ===================
  SERVER_PORT: 3000,
  WEBSOCKET_PATH: '/ws',
  
  // Message types
  MSG_TYPES: {
    // Connection
    CONNECT: 'connect',
    DISCONNECT: 'disconnect',
    AUTH: 'auth',
    AUTH_SUCCESS: 'auth_success',
    AUTH_FAIL: 'auth_fail',
    
    // Movement
    MOVE: 'move',
    MOVE_BROADCAST: 'player_move',
    ZONE_CHANGE: 'zone_change',
    ZONE_STATE: 'zone_state',
    
    // Players
    PLAYER_ENTER: 'player_enter',
    PLAYER_LEAVE: 'player_leave',
    PLAYER_STATE: 'player_state',
    
    // Combat
    COMBAT_START: 'combat_start',
    COMBAT_RESULT: 'combat_result',
    COMBAT_EVENT: 'combat_event',
    COMBAT_END: 'combat_end',
    ATTACK_MOB: 'attack_mob',
    MOB_DAMAGE: 'mob_damage',
    MOB_KILLED: 'mob_killed',
    PLAYER_DEATH: 'player_death',
    PLAYER_RESPAWN: 'player_respawn',
    
    // Spawn Beacon
    SET_SPAWN: 'set_spawn',
    SET_SPAWN_RESPONSE: 'set_spawn_response',
    
    // Castle Wars
    GET_CASTLE_INFO: 'get_castle_info',
    CASTLE_INFO: 'castle_info',
    ATTACK_CASTLE: 'attack_castle',
    CASTLE_ATTACK_RESPONSE: 'castle_attack_response',
    CASTLE_CONQUERED: 'castle_conquered',
    CASTLE_PAYOUT: 'castle_payout',
    
    // Bosses
    BOSS_SYNC: 'boss_sync',
    GET_BOSS_INFO: 'get_boss_info',
    BOSS_INFO: 'boss_info',
    ATTACK_BOSS: 'attack_boss',
    BOSS_ATTACK_RESPONSE: 'boss_attack_response',
    BOSS_COMBAT_START: 'boss_combat_start',
    BOSS_COMBAT_END: 'boss_combat_end',
    BOSS_DEFEATED: 'boss_defeated',
    BOSS_SPAWNED: 'boss_spawned',
    
    // Mobs
    MOB_SYNC: 'mob_sync',
    
    // Zone Danger
    ZONE_DANGER: 'zone_danger',
    ZONE_DAMAGE: 'zone_damage',
    
    // Character
    CHAR_CREATE: 'char_create',
    CHAR_DATA: 'char_data',
    STAT_ALLOCATE: 'stat_allocate',
    
    // Skills
    SKILL_LEARN: 'skill_learn',
    SKILL_EQUIP: 'skill_equip',
    SKILL_RESPEC: 'skill_respec',
    
    // Inventory
    ITEM_EQUIP: 'item_equip',
    ITEM_UNEQUIP: 'item_unequip',
    ITEM_USE: 'item_use',
    ITEM_DROP: 'item_drop',
    INVENTORY_UPDATE: 'inventory_update',
    
    // Training
    TRAINING_START: 'training_start',
    TRAINING_STOP: 'training_stop',
    TRAINING_COMPLETE: 'training_complete',
    
    // Gathering
    GATHER_START: 'gather_start',
    GATHER_COMPLETE: 'gather_complete',
    
    // Crafting
    CRAFT: 'craft',
    
    // Shop
    SHOP_BUY: 'shop_buy',
    SHOP_SELL: 'shop_sell',
    
    // Market
    MARKET_OPEN: 'market_open',
    MARKET_LISTINGS: 'market_listings',
    MARKET_MY_LISTINGS: 'market_my_listings',
    MARKET_LIST_ITEM: 'market_list_item',
    MARKET_LIST_RESPONSE: 'market_list_response',
    MARKET_BUY_ITEM: 'market_buy_item',
    MARKET_BUY_RESPONSE: 'market_buy_response',
    MARKET_CANCEL: 'market_cancel',
    MARKET_CANCEL_RESPONSE: 'market_cancel_response',
    MARKET_SEARCH: 'market_search',
    
    // Admin - Teleport
    ADMIN_TELEPORT: 'admin_teleport',
    ADMIN_TELEPORT_RESPONSE: 'admin_teleport_response',
    
    // Admin - Map Editor
    ADMIN_SAVE_MAP: 'admin_save_map',
    ADMIN_SAVE_MAP_RESPONSE: 'admin_save_map_response',
    ADMIN_GET_MAP_DATA: 'admin_get_map_data',
    ADMIN_MAP_DATA: 'admin_map_data',
    
    // Error
    ERROR: 'error'
  }
};

// Export for Node.js (server)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CONSTANTS;
}

// Export for browser (client)
if (typeof window !== 'undefined') {
  window.CONSTANTS = CONSTANTS;
}
