/**
 * UMBRA ONLINE - Combat Manager
 * Handles battle simulation between players and mobs
 * Battles are calculated instantly and replayed on the client
 * 
 * Supports the full skill system including:
 * - Active skills (equipped, with cooldowns and stamina costs)
 * - Passive skills (always active when learned)
 * - Status effects (stuns, buffs, debuffs)
 */

const CONSTANTS = require('../shared/constants.js');
const skillManager = require('./skillManager.js');
const itemManager = require('./itemManager.js');

// Active combats: Map<playerId, combatState>
const activeCombats = new Map();

// ===========================================
// STAT CALCULATIONS
// ===========================================

/**
 * Calculate attack speed in milliseconds between attacks
 */
function calculateAttackCooldown(agi) {
  const agiValue = agi || 1;
  const baseCooldown = CONSTANTS.BASE_ATTACK_COOLDOWN;
  const softCapAgi = CONSTANTS.AGI_SOFT_CAP;
  const minCooldown = CONSTANTS.MIN_ATTACK_COOLDOWN;
  const softCapCooldown = 1.0;
  
  let cooldown;
  
  if (agiValue <= softCapAgi) {
    const reduction = (baseCooldown - softCapCooldown) * (agiValue - 1) / (softCapAgi - 1);
    cooldown = baseCooldown - reduction;
  } else {
    const overCap = agiValue - softCapAgi;
    const remainingReduction = softCapCooldown - minCooldown;
    const diminishedReduction = remainingReduction * (overCap / (overCap + softCapAgi));
    cooldown = softCapCooldown - diminishedReduction;
  }
  
  cooldown = Math.max(cooldown, minCooldown);
  return cooldown * 1000;
}

/**
 * Calculate crit chance (with soft/hard cap)
 */
function calculateCritChance(dex) {
  const rawChance = (dex || 1) * CONSTANTS.CRIT_PER_DEX;
  return applyDiminishingReturns(rawChance, CONSTANTS.SOFT_CAP, CONSTANTS.HARD_CAP) / 100;
}

/**
 * Calculate dodge chance (with soft/hard cap)
 */
function calculateDodgeChance(dex) {
  const rawChance = (dex || 1) * CONSTANTS.DODGE_PER_DEX;
  return applyDiminishingReturns(rawChance, CONSTANTS.SOFT_CAP, CONSTANTS.HARD_CAP) / 100;
}

/**
 * Calculate block chance from DEF stat
 */
function calculateBlockChance(def) {
  const defValue = def || 0;
  let blockChance = 0;
  
  if (defValue <= CONSTANTS.DEF_SOFT_CAP) {
    blockChance = defValue * CONSTANTS.BLOCK_PER_DEF;
  } else {
    blockChance = CONSTANTS.DEF_SOFT_CAP * CONSTANTS.BLOCK_PER_DEF;
    const overCap = defValue - CONSTANTS.DEF_SOFT_CAP;
    blockChance += overCap * CONSTANTS.BLOCK_PER_DEF * 0.5;
  }
  
  blockChance = Math.min(blockChance, CONSTANTS.BLOCK_HARD_CAP);
  return blockChance / 100;
}

/**
 * Apply diminishing returns to a percentage stat
 */
function applyDiminishingReturns(rawPercent, softCap, hardCap) {
  softCap = softCap || CONSTANTS.SOFT_CAP;
  hardCap = hardCap || CONSTANTS.HARD_CAP;
  
  if (rawPercent <= softCap) {
    return rawPercent;
  }
  
  const overCap = rawPercent - softCap;
  const diminishedGain = overCap * 0.5;
  const total = softCap + diminishedGain;
  
  return Math.min(total, hardCap);
}

/**
 * Calculate armor damage mitigation
 */
function calculateArmorMitigation(armor, attackerLevel) {
  if (!armor || armor <= 0) return 0;
  const effectiveArmor = armor / (armor + 10 * (attackerLevel || 1));
  return Math.min(effectiveArmor, 0.75);
}

// ===========================================
// BATTLE SIMULATION
// ===========================================

/**
 * Simulate a complete battle between player and mob
 * @param {Object} player - Player combat stats
 * @param {Object} mob - Mob combat stats
 * @param {Object} playerSkills - Player's skill data { learned: {}, equipped: [] }
 * @returns {Object} - Battle result with events array
 */
function simulateBattle(player, mob, playerSkills = null) {
  const events = [];
  let currentTime = 0;
  
  // Debug: Log incoming combat stats
  console.log(`[Combat] simulateBattle called:`);
  console.log(`[Combat]   Player: ${player.name} - hp=${player.hp}/${player.maxHp}, damage=${player.damage}, str=${player.str}, agi=${player.agi}, dex=${player.dex}, def=${player.def}, level=${player.level}`);
  console.log(`[Combat]   Mob: ${mob.name} - hp=${mob.hp}/${mob.maxHp}, damage=${mob.damage}, str=${mob.str}, agi=${mob.agi}, dex=${mob.dex}, def=${mob.def}, level=${mob.level}`);
  
  // Get player's skills
  const activeSkills = skillManager.getEquippedActiveSkills(playerSkills);
  const passiveSkills = skillManager.getLearnedPassiveSkills(playerSkills);
  
  // Calculate passive bonuses
  const passiveBonuses = calculatePassiveBonuses(passiveSkills, player);
  
  // Initialize player combatant
  const playerState = initializeCombatant(player, true, activeSkills, passiveBonuses);
  
  // Initialize mob combatant (mobs don't have skills yet)
  const mobState = initializeCombatant(mob, false, [], {});
  
  // Debug: Log initialized combatant states
  console.log(`[Combat] Initialized combatants:`);
  console.log(`[Combat]   PlayerState: hp=${playerState.hp}, damage=${playerState.damage}, attackCooldown=${playerState.attackCooldown}ms, critChance=${(playerState.critChance*100).toFixed(1)}%, dodgeChance=${(playerState.dodgeChance*100).toFixed(1)}%`);
  console.log(`[Combat]   MobState: hp=${mobState.hp}, damage=${mobState.damage}, attackCooldown=${mobState.attackCooldown}ms, critChance=${(mobState.critChance*100).toFixed(1)}%, dodgeChance=${(mobState.dodgeChance*100).toFixed(1)}%`);
  
  // Store passives for combat processing
  playerState.passiveSkills = passiveSkills;
  playerState.passiveBonuses = passiveBonuses;
  mobState.passiveSkills = [];
  mobState.passiveBonuses = {};
  
  // Ooze: Enemy starts battle stunned (Shadow passive)
  if (passiveBonuses.oozeStunSeconds > 0) {
    const oozeStunMs = passiveBonuses.oozeStunSeconds * 1000;
    mobState.isStunned = true;
    mobState.stunEndTime = oozeStunMs;
    events.push({
      time: 0,
      type: 'passive_proc',
      passive: 'Ooze',
      attackerId: playerState.id,
      attackerName: playerState.name,
      targetId: mobState.id,
      targetName: mobState.name,
      stunDuration: passiveBonuses.oozeStunSeconds
    });
  }
  
  // Normalize: Reduce enemy's highest stat at battle start (Arcane passive)
  if (passiveBonuses.normalizePercent > 0) {
    const stats = {
      str: mob.str || 1,
      agi: mobState.agi || 1,
      dex: mobState.dex || 1,
      int: mobState.int || 1,
      def: mobState.def || 0
    };
    
    let highestStat = 'str';
    let highestValue = stats.str;
    
    for (const [stat, value] of Object.entries(stats)) {
      if (value > highestValue) {
        highestValue = value;
        highestStat = stat;
      }
    }
    
    const reduction = Math.floor(highestValue * (passiveBonuses.normalizePercent / 100));
    
    // Apply the reduction
    switch (highestStat) {
      case 'str':
        mobState.damage = Math.max(1, mobState.damage - (reduction * CONSTANTS.DAMAGE_PER_STR));
        break;
      case 'agi':
        mobState.agi = Math.max(1, mobState.agi - reduction);
        mobState.attackCooldown = Math.round(calculateAttackCooldown(mobState.agi));
        break;
      case 'dex':
        mobState.dex = Math.max(1, mobState.dex - reduction);
        mobState.critChance = calculateCritChance(mobState.dex);
        mobState.dodgeChance = calculateDodgeChance(mobState.dex);
        break;
      case 'int':
        mobState.int = Math.max(1, mobState.int - reduction);
        break;
      case 'def':
        mobState.def = Math.max(0, mobState.def - reduction);
        mobState.blockChance = calculateBlockChance(mobState.def);
        break;
    }
    
    events.push({
      time: 0,
      type: 'passive_proc',
      passive: 'Normalize',
      attackerId: playerState.id,
      attackerName: playerState.name,
      targetId: mobState.id,
      targetName: mobState.name,
      stat: highestStat,
      reduction: reduction,
      originalValue: highestValue
    });
  }
  
  // Illuminate: Reduce enemy dodge permanently (Arcane passive)
  if (passiveBonuses.illuminatePercent > 0) {
    const dodgeReduction = passiveBonuses.illuminatePercent / 100;
    mobState.dodgeChance = Math.max(0, mobState.dodgeChance - dodgeReduction);
    events.push({
      time: 0,
      type: 'passive_proc',
      passive: 'Illuminate',
      attackerId: playerState.id,
      attackerName: playerState.name,
      targetId: mobState.id,
      targetName: mobState.name,
      dodgeReduction: passiveBonuses.illuminatePercent
    });
  }
  
  // Battle start event - includes bonusHp for overflow HP display (e.g., 70/50)
  events.push({
    time: 0,
    type: 'battle_start',
    player: { 
      hp: playerState.hp, 
      maxHp: playerState.maxHp,
      bonusHp: playerState.bonusHp || 0,  // Overflow HP from Mana Shield etc
      stamina: playerState.stamina,
      maxStamina: playerState.maxStamina 
    },
    mob: { id: mobState.id, hp: mobState.hp, maxHp: mobState.maxHp },
    passives: passiveSkills.map(p => ({ id: p.skill.id, name: p.skill.name, level: p.level })),
    actives: activeSkills.map(a => ({ id: a.skill.id, name: a.skill.name, level: a.level })),
    attackCooldown: playerState.attackCooldown
  });
  
  // Simulate battle
  const maxTime = CONSTANTS.MAX_COMBAT_TICKS * CONSTANTS.COMBAT_TICK_RATE;
  
  while (playerState.hp > 0 && mobState.hp > 0 && currentTime < maxTime) {
    // Find next event time
    const nextTime = findNextEventTime(playerState, mobState, currentTime);
    currentTime = nextTime;
    
    // Process status effects (stuns, etc.) and tick-based passives
    processStatusEffects(playerState, mobState, currentTime, events);
    processStatusEffects(mobState, playerState, currentTime, events);
    
    // Stamina regeneration (pass enemy for Vigor passive)
    regenerateStamina(playerState, mobState, currentTime, events);
    regenerateStamina(mobState, playerState, currentTime, events);
    
    // Process skills FIRST (they fire when ready, independent of attack timing)
    if (!playerState.isStunned && playerState.hp > 0 && mobState.hp > 0) {
      processSkills(playerState, mobState, currentTime, events);
    }
    if (!mobState.isStunned && mobState.hp > 0 && playerState.hp > 0) {
      processSkills(mobState, playerState, currentTime, events);
    }
    
    // Process basic attacks (on their own timer)
    if (!playerState.isStunned && playerState.hp > 0 && mobState.hp > 0) {
      processBasicAttackAction(playerState, mobState, currentTime, events);
    }
    if (!mobState.isStunned && mobState.hp > 0 && playerState.hp > 0) {
      processBasicAttackAction(mobState, playerState, currentTime, events);
    }
    
    // Safety: ensure time advances
    if (currentTime === 0) {
      currentTime = CONSTANTS.COMBAT_TICK_RATE;
    }
  }
  
  // Determine winner
  const playerWon = mobState.hp <= 0;
  const mobWon = playerState.hp <= 0;
  
  // Battle end event
  events.push({
    time: currentTime,
    type: 'battle_end',
    playerWon: playerWon,
    mobWon: mobWon,
    player: { hp: Math.max(0, playerState.hp), stamina: playerState.stamina },
    mob: { hp: Math.max(0, mobState.hp) }
  });
  
  return {
    events,
    playerWon,
    mobWon,
    finalPlayerHp: Math.max(0, playerState.hp),
    finalPlayerStamina: playerState.stamina,
    finalMobHp: Math.max(0, mobState.hp),
    duration: Math.round(currentTime),
    expReward: playerWon ? mob.expReward : 0,
    itemDrop: playerWon ? calculateItemDrop(mob.drops, itemManager.getItem) : null
  };
}

/**
 * Initialize a combatant state for battle
 */
function initializeCombatant(entity, isPlayer, activeSkills, passiveBonuses) {
  const baseAttackCooldown = Math.round(calculateAttackCooldown(entity.agi || 1));
  
  // Apply attack speed buff from passives if any
  let attackCooldown = baseAttackCooldown;
  if (passiveBonuses.attackSpeedPercent) {
    attackCooldown = Math.round(baseAttackCooldown * (1 - passiveBonuses.attackSpeedPercent / 100));
  }
  
  // Base HP values (maxHp stays the same)
  let hp = entity.hp;
  let maxHp = entity.maxHp;
  let bonusHp = 0;
  
  // Mana Shield: Add bonus HP as overflow based on INT%
  if (passiveBonuses.manaShieldPercent > 0 && entity.int) {
    const manaShieldHp = Math.floor(entity.int * (passiveBonuses.manaShieldPercent / 100));
    bonusHp += manaShieldHp;
  }
  
  // Giant: Add bonus HP as overflow based on maxHP%
  if (passiveBonuses.giantPercent > 0) {
    const giantHp = Math.floor(maxHp * (passiveBonuses.giantPercent / 100));
    bonusHp += giantHp;
  }
  
  // Apply total bonus HP
  hp += bonusHp;
  
  const state = {
    id: entity.id,
    name: entity.name,
    hp: hp,
    maxHp: maxHp,
    bonusHp: bonusHp,          // Track bonus HP from Mana Shield, Giant etc (overflow HP)
    stamina: entity.maxStamina || 50,  // Always start combat with full stamina
    maxStamina: entity.maxStamina || 50,
    damage: entity.damage || ((entity.str || 1) * CONSTANTS.DAMAGE_PER_STR),  // Use pre-calculated damage or compute from STR
    armor: entity.armor || 0,
    level: entity.level || 1,
    agi: entity.agi || 1,
    dex: entity.dex || 1,
    def: entity.def || 0,
    int: entity.int || 1,
    
    // Combat stats
    baseAttackCooldown: baseAttackCooldown,
    attackCooldown: attackCooldown,
    critChance: calculateCritChance(entity.dex || 1),
    dodgeChance: calculateDodgeChance(entity.dex || 1),
    blockChance: calculateBlockChance(entity.def || 0),
    baseDef: entity.def || 0,  // Track base DEF for Sturdiness
    baseStr: entity.str || 1,  // Track base STR for Berserk
    
    // Timing
    nextAttackTime: isPlayer ? 0 : 200,
    lastStaminaRegen: 0,
    lastSturdinessTime: 0,     // Track Sturdiness timer
    lastRegenTime: 0,          // Track Regeneration timer
    lastShurikenTime: 0,       // Track Shuriken timer
    
    // Status
    isPlayer: isPlayer,
    isStunned: false,
    stunEndTime: 0,
    isInvulnerable: false,     // Shield Wall invulnerability
    invulnerableEndTime: 0,
    reflectActive: false,      // Reflect - block next attack and reflect damage
    reflectPercent: 0,
    healingBlocked: false,     // Disrupt - prevent healing
    healingBlockedEndTime: 0,
    lightFeetEndTime: passiveBonuses.lightFeetDuration > 0 ? passiveBonuses.lightFeetDuration * 1000 : 0, // Light Feet auto-dodge
    isSlowed: false,           // Frozen Bolt - attack speed reduction
    slowEndTime: 0,
    slowPercent: 0,
    cannotDodgeBlock: false,   // Heavy Cloud - prevent dodge/block
    cannotDodgeBlockEndTime: 0,
    
    // Active skills with cooldown tracking (apply Quick Cast and Hasty reductions to initial cooldowns)
    skills: activeSkills.map((s, index) => {
      let initialCooldown = s.skill.initialCooldown || 0;
      // Quick Cast: First cast has reduced cooldown
      if (passiveBonuses.quickCastPercent > 0 && initialCooldown > 0) {
        initialCooldown = Math.floor(initialCooldown * (1 - passiveBonuses.quickCastPercent / 100));
      }
      // Hasty: Reduce initial cooldown of skill in position 1 (index 0)
      if (index === 0 && passiveBonuses.hastySeconds > 0 && initialCooldown > 0) {
        initialCooldown = Math.max(0, initialCooldown - (passiveBonuses.hastySeconds * 1000));
      }
      return {
        ...s,
        currentCooldown: initialCooldown,
        ready: initialCooldown <= 0,
        lastUpdate: 0,
        firstCast: true  // Track if this is the first cast (for Quick Cast)
      };
    }),
    
    // Buffs
    attackSpeedBuff: 0,
    damageBuff: 0,
    defBuff: 0,               // Sturdiness DEF buff accumulator
    strBuff: 0,               // Berserk STR buff
    intBuff: 0,               // Chant/Hidden Force INT buff
    counterAttackBuff: 0,     // Counter-Attack damage buff (stacks)
    analyzeBuff: false,       // Analyze - next attack guaranteed crit with bonus damage
    analyzeBonus: 0,          // Analyze bonus damage%
    multiStrikeBuff: 0,       // Multi-Strike - next attack hits X extra times
    hasAttacked: false,       // Track if first attack happened (for Grand Opening)
    
    // Poison tracking
    poisonStacks: 0,          // Poison stacks on this combatant
    lastPoisonTime: 0,        // Last poison tick time
    
    // Magic tracking
    lastChantTime: 0,         // Track Chant timer
    baseInt: entity.int || 1, // Track base INT for Chant
    
    // Shadow tracking
    attacksReceived: 0,       // Track attacks received for Shadow Form
    shadowFormThreshold: passiveBonuses.shadowFormAttacks || 0,  // Attacks needed to auto-dodge
    dexBuff: 0,               // Weakness DEX buff accumulator
    baseDex: entity.dex || 1, // Track base DEX for Weakness
    lastPutridTime: 0,        // Track Putrid timer
    bindingTriggered: false,  // Track if Binding has been triggered
    
    // Arcane tracking
    consecutiveHits: 0,       // Track consecutive hits for Momentum
    
    // Passive effect tracking
    critDamageBonus: passiveBonuses.critDamageBonus || 0
  };
  
  return state;
}

/**
 * Calculate passive bonuses at battle start
 */
function calculatePassiveBonuses(passiveSkills, player) {
  const bonuses = {
    // Swordsmanship passives
    critDamageBonus: 0,
    attackSpeedPercent: 0,
    staminaOnAttackPercent: 0,
    percentMaxHpDamage: 0,
    doubleStrikeChance: 0,
    ripostePercent: 0,
    unbalancePercent: 0,
    // Defense passives
    poisePercent: 0,           // Heal % max HP on block
    sturdinessPercent: 0,      // Gain DEF% every 3s
    undermineAmount: 0,        // Enemy loses stamina on attack
    parryPercent: 0,           // Block has % chance to stun
    spikesDamage: 0,           // Fixed damage when hit
    manaShieldPercent: 0,      // Extra HP from INT%
    // Vitality passives
    regenerationPercent: 0,    // Regen % max HP per second
    berserkPercent: 0,         // +STR% per 1% HP missing below 50%
    lifeStealPercent: 0,       // Heal % of damage dealt
    divinePunishmentDamage: 0, // True damage when healed
    giantPercent: 0,           // +% max HP at battle start (overflow)
    rustPercent: 0,            // Reduce enemy armor mitigation
    // Roguery passives
    counterAttackPercent: 0,   // +damage% after dodge (stacks)
    lightFeetDuration: 0,      // Auto-dodge for first Xs
    poisonousBladeChance: 0,   // % chance to apply poison
    grandOpeningPercent: 0,    // First attack +damage%
    battleRhythmPercent: 0,    // Skills cost less stamina%
    shurikenPercent: 0,        // Deal DEX% damage every 3s
    // Magic passives
    meditationPercent: 0,      // Recover % max stamina per second
    timeBendPercent: 0,        // Increase enemy initial cooldowns by %
    shardsDamage: 0,           // Extra damage when using active skill
    quickCastPercent: 0,       // First cast of each skill has % less cooldown
    dispellingPercent: 0,      // Enemy loses % stamina when using skill
    chantPercent: 0,           // Gain +% INT every 3s
    // Windmaster passives
    rebalanceHeal: 0,          // Heal HP on dodge/block
    vigorDamage: 0,            // Deal damage when stamina recovered
    fatiguePercent: 0,         // +damage% if enemy below 20% stamina
    cushionPercent: 0,         // Reduce basic attack damage taken by %
    concentrationPercent: 0,   // +block% above 70% HP
    aegisPercent: 0,           // Healing stronger when below 20% HP
    // Shadow passives
    shadowFormAttacks: 0,      // Auto-dodge after X attacks received
    weaknessPercent: 0,        // +DEX% on crit
    hastySeconds: 0,           // Reduce skill 1 initial cooldown by Xs
    putridPoison: 0,           // Apply X poison every 2s
    bindingSeconds: 0,         // First enemy skill has +Xs cooldown
    oozeStunSeconds: 0,        // Enemy starts stunned for Xs
    // Arcane passives
    banishPercent: 0,          // +damage% if enemy at 100% HP
    normalizePercent: 0,       // Reduce enemy highest stat by %
    blessingHeal: 0,           // Heal HP when using active skill
    illuminatePercent: 0,      // Reduce enemy dodge by %
    reactivationChance: 0,     // % chance to cast skill twice
    momentumPercent: 0         // +attack speed% per consecutive hit
  };
  
  for (const { skill, level } of passiveSkills) {
    const value = skillManager.calculateSkillValue(skill, level, 'value1');
    
    switch (skill.effect) {
      // Swordsmanship passives
      case 'crit_damage_bonus': // Precision
        bonuses.critDamageBonus += value;
        break;
      case 'stamina_on_attack': // En Garde
        bonuses.staminaOnAttackPercent += value;
        break;
      case 'percent_max_hp_damage': // Bloodletting
        bonuses.percentMaxHpDamage += value;
        break;
      case 'double_strike': // Punish
        bonuses.doubleStrikeChance += value;
        break;
      case 'riposte': // Riposte
        bonuses.ripostePercent += value;
        break;
      case 'unbalance_damage': // Unbalance
        bonuses.unbalancePercent += value;
        break;
      // Defense passives
      case 'poise': // Poise - heal on block
        bonuses.poisePercent += value;
        break;
      case 'sturdiness': // Sturdiness - gain DEF every 3s
        bonuses.sturdinessPercent += value;
        break;
      case 'undermine': // Undermine - enemy loses stamina on attack
        bonuses.undermineAmount += value;
        break;
      case 'parry': // Parry - block can stun
        bonuses.parryPercent += value;
        break;
      case 'spikes': // Spikes - reflect fixed damage when hit
        bonuses.spikesDamage += value;
        break;
      case 'mana_shield': // Mana Shield - extra HP from INT
        bonuses.manaShieldPercent += value;
        break;
      // Vitality passives
      case 'regeneration': // Regeneration - heal % max HP per second
        bonuses.regenerationPercent += value;
        break;
      case 'berserk': // Berserk - +STR% when below 50% HP
        bonuses.berserkPercent += value;
        break;
      case 'life_steal': // Life Steal - heal % of damage dealt
        bonuses.lifeStealPercent += value;
        break;
      case 'divine_punishment': // Divine Punishment - true damage when healed
        bonuses.divinePunishmentDamage += value;
        break;
      case 'giant': // Giant - +% max HP at battle start
        bonuses.giantPercent += value;
        break;
      case 'rust': // Rust - reduce enemy armor mitigation
        bonuses.rustPercent += value;
        break;
      // Roguery passives
      case 'counter_attack': // Counter-Attack - +damage% after dodge
        bonuses.counterAttackPercent += value;
        break;
      case 'light_feet': // Light Feet - auto-dodge for first Xs
        bonuses.lightFeetDuration += value;
        break;
      case 'poisonous_blade': // Poisonous Blade - chance to apply poison
        bonuses.poisonousBladeChance += value;
        break;
      case 'grand_opening': // Grand Opening - first attack bonus damage
        bonuses.grandOpeningPercent += value;
        break;
      case 'battle_rhythm': // Battle Rhythm - skills cost less stamina
        bonuses.battleRhythmPercent += value;
        break;
      case 'shuriken': // Shuriken - deal DEX% damage every 3s
        bonuses.shurikenPercent += value;
        break;
      // Magic passives
      case 'meditation': // Meditation - recover % max stamina per second
        bonuses.meditationPercent += value;
        break;
      case 'time_bend': // Time Bend - increase enemy initial cooldowns by %
        bonuses.timeBendPercent += value;
        break;
      case 'shards': // Shards - extra damage when using active skill
        bonuses.shardsDamage += value;
        break;
      case 'quick_cast': // Quick Cast - first cast of each skill has % less cooldown
        bonuses.quickCastPercent += value;
        break;
      case 'dispelling': // Dispelling - enemy loses % stamina when using skill
        bonuses.dispellingPercent += value;
        break;
      case 'chant': // Chant - gain +% INT every 3s
        bonuses.chantPercent += value;
        break;
      // Windmaster passives
      case 'rebalance': // Rebalance - heal HP on dodge/block
        bonuses.rebalanceHeal += value;
        break;
      case 'vigor': // Vigor - deal damage when stamina recovered
        bonuses.vigorDamage += value;
        break;
      case 'fatigue': // Fatigue - +damage% if enemy below 20% stamina
        bonuses.fatiguePercent += value;
        break;
      case 'cushion': // Cushion - reduce basic attack damage taken by %
        bonuses.cushionPercent += value;
        break;
      case 'concentration': // Concentration - +block% above 70% HP
        bonuses.concentrationPercent += value;
        break;
      case 'aegis': // Aegis - healing stronger when below 20% HP
        bonuses.aegisPercent += value;
        break;
      // Shadow passives
      case 'shadow_form': // Shadow Form - auto-dodge after X attacks received
        bonuses.shadowFormAttacks += value;
        break;
      case 'weakness': // Weakness - +DEX% on crit
        bonuses.weaknessPercent += value;
        break;
      case 'hasty': // Hasty - reduce skill 1 initial cooldown
        bonuses.hastySeconds += value;
        break;
      case 'putrid': // Putrid - apply X poison every 2s
        bonuses.putridPoison += value;
        break;
      case 'binding': // Binding - first enemy skill has +Xs cooldown
        bonuses.bindingSeconds += value;
        break;
      case 'ooze': // Ooze - enemy starts stunned
        bonuses.oozeStunSeconds += value;
        break;
      // Arcane passives
      case 'banish': // Banish - +damage% if enemy at 100% HP
        bonuses.banishPercent += value;
        break;
      case 'normalize': // Normalize - reduce enemy highest stat at start
        bonuses.normalizePercent += value;
        break;
      case 'blessing': // Blessing - heal HP when using active skill
        bonuses.blessingHeal += value;
        break;
      case 'illuminate': // Illuminate - reduce enemy dodge
        bonuses.illuminatePercent += value;
        break;
      case 'reactivation': // Reactivation - chance to cast skill twice
        bonuses.reactivationChance += value;
        break;
      case 'momentum': // Momentum - +attack speed per consecutive hit
        bonuses.momentumPercent += value;
        break;
    }
  }
  
  return bonuses;
}

/**
 * Find the next event time in combat
 */
function findNextEventTime(player, mob, currentTime) {
  let nextTime = Infinity;
  
  // Next attack times
  if (!player.isStunned) {
    nextTime = Math.min(nextTime, player.nextAttackTime);
  }
  if (!mob.isStunned) {
    nextTime = Math.min(nextTime, mob.nextAttackTime);
  }
  
  // Skill cooldowns - calculate when each skill will be ready
  for (const skill of player.skills) {
    if (skill.currentCooldown > 0) {
      const readyTime = (skill.lastUpdate || 0) + skill.currentCooldown;
      if (readyTime < nextTime) {
        nextTime = readyTime;
      }
    }
  }
  
  // Stun end times
  if (player.isStunned && player.stunEndTime > currentTime) {
    nextTime = Math.min(nextTime, player.stunEndTime);
  }
  if (mob.isStunned && mob.stunEndTime > currentTime) {
    nextTime = Math.min(nextTime, mob.stunEndTime);
  }
  
  // Ensure time advances at least by tick rate
  if (nextTime <= currentTime) {
    nextTime = currentTime + CONSTANTS.COMBAT_TICK_RATE;
  }
  
  // Round to avoid floating point issues
  return Math.round(nextTime);
}

/**
 * Process status effects for a combatant
 */
function processStatusEffects(combatant, enemy, currentTime, events) {
  // Check stun end
  if (combatant.isStunned && currentTime >= combatant.stunEndTime) {
    combatant.isStunned = false;
    events.push({
      time: currentTime,
      type: 'status_end',
      targetId: combatant.id,
      targetName: combatant.name,
      status: 'stun'
    });
  }
  
  // Check invulnerability end (Shield Wall)
  if (combatant.isInvulnerable && currentTime >= combatant.invulnerableEndTime) {
    combatant.isInvulnerable = false;
    events.push({
      time: currentTime,
      type: 'status_end',
      targetId: combatant.id,
      targetName: combatant.name,
      status: 'invulnerable'
    });
  }
  
  // Check healing blocked end (Disrupt)
  if (combatant.healingBlocked && currentTime >= combatant.healingBlockedEndTime) {
    combatant.healingBlocked = false;
    events.push({
      time: currentTime,
      type: 'status_end',
      targetId: combatant.id,
      targetName: combatant.name,
      status: 'healing_blocked'
    });
  }
  
  // Check Heavy Cloud end (cannot dodge/block)
  if (combatant.cannotDodgeBlock && currentTime >= combatant.cannotDodgeBlockEndTime) {
    combatant.cannotDodgeBlock = false;
    events.push({
      time: currentTime,
      type: 'status_end',
      targetId: combatant.id,
      targetName: combatant.name,
      status: 'cannot_dodge_block'
    });
  }
  
  // Sturdiness: Gain DEF% every 3 seconds
  if (combatant.passiveBonuses?.sturdinessPercent > 0) {
    const timeSinceLastSturdiness = currentTime - (combatant.lastSturdinessTime || 0);
    if (timeSinceLastSturdiness >= 3000) {
      // Apply once per 3-second interval
      const defGain = Math.floor(combatant.baseDef * (combatant.passiveBonuses.sturdinessPercent / 100));
      combatant.defBuff += defGain;
      combatant.def = combatant.baseDef + combatant.defBuff;
      combatant.blockChance = calculateBlockChance(combatant.def);
      combatant.lastSturdinessTime = currentTime;
      
      if (defGain > 0) {
        events.push({
          time: currentTime,
          type: 'passive_proc',
          passive: 'Sturdiness',
          targetId: combatant.id,
          targetName: combatant.name,
          value: defGain,
          newDef: combatant.def
        });
      }
    }
  }
  
  // Regeneration: Heal % max HP per second
  if (combatant.passiveBonuses?.regenerationPercent > 0 && !combatant.healingBlocked) {
    const timeSinceLastRegen = currentTime - (combatant.lastRegenTime || 0);
    if (timeSinceLastRegen >= 1000) {
      // Apply once per 1-second interval
      const healAmount = Math.floor(combatant.maxHp * (combatant.passiveBonuses.regenerationPercent / 100));
      const oldHp = combatant.hp;
      combatant.hp = Math.min(combatant.maxHp + combatant.bonusHp, combatant.hp + healAmount);
      const actualHeal = combatant.hp - oldHp;
      combatant.lastRegenTime = currentTime;
      
      if (actualHeal > 0) {
        const regenEvent = {
          time: currentTime,
          type: 'passive_proc',
          passive: 'Regeneration',
          targetId: combatant.id,
          targetName: combatant.name,
          value: actualHeal,
          newHp: combatant.hp,
          maxHp: combatant.maxHp
        };
        
        // Divine Punishment: Deal true damage to enemy when healed
        if (combatant.passiveBonuses?.divinePunishmentDamage > 0 && enemy) {
          const divineDamage = combatant.passiveBonuses.divinePunishmentDamage;
          enemy.hp -= divineDamage;
          regenEvent.divinePunishment = true;
          regenEvent.divineDamage = divineDamage;
          regenEvent.enemyId = enemy.id;
          regenEvent.enemyName = enemy.name;
          regenEvent.enemyHp = Math.max(0, enemy.hp);
        }
        
        events.push(regenEvent);
      }
    }
  }
  
  // Berserk: Gain STR% when below 50% HP (recalculate each tick)
  if (combatant.passiveBonuses?.berserkPercent > 0) {
    const hpPercent = (combatant.hp / combatant.maxHp) * 100;
    if (hpPercent < 50) {
      // Each 1% HP missing below 50% gives berserkPercent% STR bonus
      const missingPercent = 50 - hpPercent;
      const strBonus = Math.floor(combatant.baseStr * (missingPercent * combatant.passiveBonuses.berserkPercent / 100));
      
      // Only update if bonus changed significantly
      if (Math.abs(strBonus - combatant.strBuff) >= 1) {
        combatant.strBuff = strBonus;
        // Recalculate damage with new STR (base damage is STR * DAMAGE_PER_STR)
        combatant.damage = (combatant.baseStr + combatant.strBuff) * CONSTANTS.DAMAGE_PER_STR;
      }
    } else {
      // Above 50% HP, no berserk bonus
      if (combatant.strBuff > 0) {
        combatant.strBuff = 0;
        combatant.damage = combatant.baseStr * CONSTANTS.DAMAGE_PER_STR;
      }
    }
  }
  
  // Poison tick: Deal poison stack damage every second (1 damage per stack per second)
  if (combatant.poisonStacks > 0) {
    const timeSinceLastPoison = currentTime - (combatant.lastPoisonTime || 0);
    if (timeSinceLastPoison >= 1000) {
      // Only apply ONE tick at a time to keep damage numbers clean
      // Poison deals 1 damage per stack
      const poisonDamage = combatant.poisonStacks;
      combatant.hp -= poisonDamage;
      combatant.lastPoisonTime = currentTime;
      
      events.push({
        time: currentTime,
        type: 'passive_proc',
        passive: 'Poison',
        targetId: combatant.id,
        targetName: combatant.name,
        damage: poisonDamage,
        stacks: combatant.poisonStacks,
        newHp: Math.max(0, combatant.hp)
      });
    }
  }
  
  // Shuriken: Every 3s deal DEX% as damage (Roguery passive)
  if (combatant.passiveBonuses?.shurikenPercent > 0 && enemy) {
    const timeSinceLastShuriken = currentTime - (combatant.lastShurikenTime || 0);
    if (timeSinceLastShuriken >= 3000) {
      // Apply once per 3-second interval
      const shurikenDamage = Math.floor(combatant.dex * (combatant.passiveBonuses.shurikenPercent / 100));
      
      if (shurikenDamage > 0) {
        // Shuriken damage ignores armor (true damage based on DEX)
        enemy.hp -= shurikenDamage;
        combatant.lastShurikenTime = currentTime;
        
        events.push({
          time: currentTime,
          type: 'passive_proc',
          passive: 'Shuriken',
          attackerId: combatant.id,
          attackerName: combatant.name,
          targetId: enemy.id,
          targetName: enemy.name,
          damage: shurikenDamage,
          dex: combatant.dex,
          percent: combatant.passiveBonuses.shurikenPercent,
          newHp: Math.max(0, enemy.hp)
        });
      }
    }
  }
  
  // Putrid: Every 2s apply poison to enemy (Shadow passive)
  if (combatant.passiveBonuses?.putridPoison > 0 && enemy) {
    const timeSinceLastPutrid = currentTime - (combatant.lastPutridTime || 0);
    if (timeSinceLastPutrid >= 2000) {
      // Apply poison once per 2-second interval (don't catch up multiple applications)
      const poisonToAdd = combatant.passiveBonuses.putridPoison;
      enemy.poisonStacks += poisonToAdd;
      combatant.lastPutridTime = currentTime;
      
      if (poisonToAdd > 0) {
        events.push({
          time: currentTime,
          type: 'passive_proc',
          passive: 'Putrid',
          attackerId: combatant.id,
          attackerName: combatant.name,
          targetId: enemy.id,
          targetName: enemy.name,
          poisonApplied: poisonToAdd,
          enemyPoisonStacks: enemy.poisonStacks
        });
      }
    }
  }
  
  // Check slow end (Frozen Bolt)
  if (combatant.isSlowed && currentTime >= combatant.slowEndTime) {
    combatant.isSlowed = false;
    // Restore original attack cooldown
    combatant.attackCooldown = combatant.baseAttackCooldown * (1 - combatant.attackSpeedBuff / 100);
    combatant.attackCooldown = Math.max(CONSTANTS.MIN_ATTACK_COOLDOWN * 1000, combatant.attackCooldown);
    combatant.attackCooldown = Math.round(combatant.attackCooldown);
    events.push({
      time: currentTime,
      type: 'status_end',
      targetId: combatant.id,
      targetName: combatant.name,
      status: 'slowed'
    });
  }
  
  // Chant: Gain +% INT every 3s (Magic passive)
  if (combatant.passiveBonuses?.chantPercent > 0) {
    const timeSinceLastChant = currentTime - (combatant.lastChantTime || 0);
    if (timeSinceLastChant >= 3000) {
      // Apply once per 3-second interval
      const intGain = Math.floor(combatant.baseInt * (combatant.passiveBonuses.chantPercent / 100));
      combatant.intBuff += intGain;
      combatant.int = combatant.baseInt + combatant.intBuff;
      combatant.lastChantTime = currentTime;
      
      if (intGain > 0) {
        events.push({
          time: currentTime,
          type: 'passive_proc',
          passive: 'Chant',
          targetId: combatant.id,
          targetName: combatant.name,
          value: intGain,
          newInt: combatant.int
        });
      }
    }
  }
  
  // Update skill cooldowns
  for (const skill of combatant.skills) {
    if (skill.currentCooldown > 0) {
      const elapsed = currentTime - (skill.lastUpdate || 0);
      skill.currentCooldown = Math.max(0, skill.currentCooldown - elapsed);
      skill.ready = skill.currentCooldown <= 0;
      skill.lastUpdate = currentTime;
    }
  }
}

/**
 * Regenerate stamina over time
 */
function regenerateStamina(combatant, enemy, currentTime, events) {
  const elapsed = currentTime - combatant.lastStaminaRegen;
  if (elapsed >= 1000) { // Regen every second
    // Apply once per 1-second interval
    let regenAmount = CONSTANTS.STAMINA_REGEN_PER_SEC;
    
    // Meditation: Recover additional % max stamina per second
    if (combatant.passiveBonuses?.meditationPercent > 0) {
      const meditationRegen = Math.floor(combatant.maxStamina * (combatant.passiveBonuses.meditationPercent / 100));
      regenAmount += meditationRegen;
    }
    
    const oldStamina = combatant.stamina;
    combatant.stamina = Math.min(combatant.maxStamina, combatant.stamina + regenAmount);
    const actualRegen = combatant.stamina - oldStamina;
    combatant.lastStaminaRegen = currentTime;
    
    // Vigor: Deal damage when stamina is recovered (Windmaster passive)
    if (actualRegen > 0 && combatant.passiveBonuses?.vigorDamage > 0 && enemy && enemy.hp > 0) {
      const vigorDamage = combatant.passiveBonuses.vigorDamage;
      enemy.hp -= vigorDamage;
      events.push({
        time: currentTime,
        type: 'passive_proc',
        passive: 'Vigor',
        attackerId: combatant.id,
        attackerName: combatant.name,
        targetId: enemy.id,
        targetName: enemy.name,
        damage: vigorDamage,
        staminaRecovered: actualRegen,
        newHp: Math.max(0, enemy.hp)
      });
    }
  }
}

/**
 * Process all ready skills for a combatant (skills fire independently of attack timing)
 */
function processSkills(attacker, defender, currentTime, events) {
  // Only process player skills (mobs don't have skills yet)
  if (!attacker.isPlayer) {
    return;
  }
  
  if (attacker.skills.length === 0) {
    return;
  }
  
  // Check each skill
  for (const skillData of attacker.skills) {
    // Skip if skill not ready
    if (!skillData.ready) {
      continue;
    }
    
    // Calculate actual stamina cost with Battle Rhythm reduction
    let actualStaminaCost = skillData.skill.staminaCost;
    if (attacker.passiveBonuses?.battleRhythmPercent > 0) {
      actualStaminaCost = Math.floor(actualStaminaCost * (1 - attacker.passiveBonuses.battleRhythmPercent / 100));
      actualStaminaCost = Math.max(1, actualStaminaCost);  // Minimum 1 stamina cost
    }
    
    // Skill is ready! Check stamina
    if (attacker.stamina < actualStaminaCost) {
      continue;
    }
    
    // Execute the skill
    const skillResult = executeActiveSkill(attacker, defender, skillData, currentTime, events);
    
    // Blessing: Heal HP when using active skill (Arcane passive)
    if (attacker.passiveBonuses?.blessingHeal > 0 && !attacker.healingBlocked) {
      let healAmount = attacker.passiveBonuses.blessingHeal;
      // Aegis: Healing stronger when below 20% HP
      if (attacker.passiveBonuses?.aegisPercent > 0 && (attacker.hp / attacker.maxHp) < 0.2) {
        healAmount = Math.floor(healAmount * (1 + attacker.passiveBonuses.aegisPercent / 100));
      }
      const oldHp = attacker.hp;
      attacker.hp = Math.min(attacker.maxHp + attacker.bonusHp, attacker.hp + healAmount);
      const actualHeal = attacker.hp - oldHp;
      if (actualHeal > 0) {
        events.push({
          time: currentTime,
          type: 'passive_proc',
          passive: 'Blessing',
          attackerId: attacker.id,
          attackerName: attacker.name,
          heal: actualHeal,
          newHp: attacker.hp
        });
        
        // Divine Punishment: Deal true damage to enemy when healed
        if (attacker.passiveBonuses?.divinePunishmentDamage > 0) {
          const divineDamage = attacker.passiveBonuses.divinePunishmentDamage;
          defender.hp -= divineDamage;
          events.push({
            time: currentTime,
            type: 'passive_proc',
            passive: 'Divine Punishment',
            attackerId: attacker.id,
            attackerName: attacker.name,
            targetId: defender.id,
            targetName: defender.name,
            damage: divineDamage,
            newHp: Math.max(0, defender.hp)
          });
        }
      }
    }
    
    // Binding: First enemy skill that hits has increased cooldown (Shadow passive on defender)
    // Only triggers once per battle for the defender
    if (!defender.bindingTriggered && defender.passiveBonuses?.bindingSeconds > 0) {
      const bindingIncrease = defender.passiveBonuses.bindingSeconds * 1000;
      // Store the binding penalty on the skill instance, not the original skill
      skillData.bindingPenalty = (skillData.bindingPenalty || 0) + bindingIncrease;
      defender.bindingTriggered = true;  // Only trigger once per battle
      events.push({
        time: currentTime,
        type: 'passive_proc',
        passive: 'Binding',
        defenderId: defender.id,
        defenderName: defender.name,
        attackerId: attacker.id,
        attackerName: attacker.name,
        skillName: skillData.skill.name,
        cooldownIncrease: defender.passiveBonuses.bindingSeconds
      });
    }
    
    // Dispelling: Enemy loses % stamina when attacker uses a skill (Magic passive on defender)
    if (defender.passiveBonuses?.dispellingPercent > 0) {
      const staminaLost = Math.floor(attacker.stamina * (defender.passiveBonuses.dispellingPercent / 100));
      attacker.stamina = Math.max(0, attacker.stamina - staminaLost);
      if (staminaLost > 0) {
        events.push({
          time: currentTime,
          type: 'passive_proc',
          passive: 'Dispelling',
          defenderId: defender.id,
          defenderName: defender.name,
          attackerId: attacker.id,
          attackerName: attacker.name,
          staminaLost: staminaLost,
          attackerStamina: attacker.stamina
        });
      }
    }
    
    // Shards: Deal extra damage when using active skill (Magic passive)
    // Only apply if skill doesn't already handle Shards (damage-dealing skills handle it internally)
    const shardHandledSkills = ['fireball', 'frozen_bolt', 'wind_blast', 'heavy_cloud', 'suffocate', 'assassinate', 'poison_cloud', 'mirror_strike', 'light_missile'];  // Skills that handle Shards internally
    if (attacker.passiveBonuses?.shardsDamage > 0 && !shardHandledSkills.includes(skillData.skill.effect)) {
      const shardsDamage = attacker.passiveBonuses.shardsDamage;
      defender.hp -= shardsDamage;
      events.push({
        time: currentTime,
        type: 'passive_proc',
        passive: 'Shards',
        attackerId: attacker.id,
        attackerName: attacker.name,
        targetId: defender.id,
        targetName: defender.name,
        damage: shardsDamage,
        newHp: Math.max(0, defender.hp)
      });
    }
    // Mark first cast done (for Quick Cast tracking)
    skillData.firstCast = false;
    
    // Set cooldown (skill goes on its regular cooldown, plus any Binding penalty)
    skillData.currentCooldown = skillData.skill.cooldown + (skillData.bindingPenalty || 0);
    skillData.ready = false;
    skillData.lastUpdate = currentTime;
    
    // Consume stamina (with Battle Rhythm reduction)
    attacker.stamina -= actualStaminaCost;
    
    // Reactivation: Chance to cast skill twice (Arcane passive)
    // Check if we have enough stamina to cast again
    if (attacker.passiveBonuses?.reactivationChance > 0 && 
        Math.random() * 100 < attacker.passiveBonuses.reactivationChance &&
        attacker.stamina >= actualStaminaCost) {
      // Cast the skill again
      executeActiveSkill(attacker, defender, skillData, currentTime, events);
      
      // Consume stamina again
      attacker.stamina -= actualStaminaCost;
      
      // Blessing triggers again too
      if (attacker.passiveBonuses?.blessingHeal > 0 && !attacker.healingBlocked) {
        let healAmount = attacker.passiveBonuses.blessingHeal;
        if (attacker.passiveBonuses?.aegisPercent > 0 && (attacker.hp / attacker.maxHp) < 0.2) {
          healAmount = Math.floor(healAmount * (1 + attacker.passiveBonuses.aegisPercent / 100));
        }
        const oldHp = attacker.hp;
        attacker.hp = Math.min(attacker.maxHp + attacker.bonusHp, attacker.hp + healAmount);
        const actualHeal = attacker.hp - oldHp;
        if (actualHeal > 0) {
          events.push({
            time: currentTime,
            type: 'passive_proc',
            passive: 'Blessing',
            attackerId: attacker.id,
            attackerName: attacker.name,
            heal: actualHeal,
            newHp: attacker.hp
          });
        }
      }
      
      events.push({
        time: currentTime,
        type: 'passive_proc',
        passive: 'Reactivation',
        attackerId: attacker.id,
        attackerName: attacker.name,
        skillName: skillData.skill.name
      });
    }
  }
}

/**
 * Execute an active skill
 */
function executeActiveSkill(attacker, defender, skillData, currentTime, events) {
  const { skill, level } = skillData;
  const value = skillManager.calculateSkillValue(skill, level, 'value1');
  
  switch (skill.effect) {
    // Swordsmanship active skills
    case 'bonus_damage': // Strike
      return executeStrike(attacker, defender, value, skill.name, currentTime, events);
    
    case 'attack_speed_buff': // Second Wind
      return executeAttackSpeedBuff(attacker, value, skill.name, currentTime, events);
    
    case 'stun': // Bash
      return executeBash(attacker, defender, value, skill.name, currentTime, events);
    
    // Defense active skills
    case 'reflect': // Reflect - block next attack and reflect damage
      return executeReflect(attacker, value, skill.name, currentTime, events);
    
    case 'invulnerable': // Shield Wall - become invulnerable
      return executeShieldWall(attacker, value, skill.name, currentTime, events);
    
    case 'stomp': // Stomp - deal DEF% as damage
      return executeStomp(attacker, defender, value, skill.name, currentTime, events);
    
    // Vitality active skills
    case 'heal': // Heal - heal % of max HP
      return executeHeal(attacker, defender, value, skill.name, currentTime, events);
    
    case 'unfair_exchange': // Unfair Exchange - heal + deal damage
      return executeUnfairExchange(attacker, defender, value, skill.name, currentTime, events);
    
    case 'disrupt': // Disrupt - block enemy healing
      return executeDisrupt(attacker, defender, value, skill.name, currentTime, events);
    
    // Roguery active skills
    case 'analyze': // Analyze - next attack guaranteed crit with bonus damage
      return executeAnalyze(attacker, value, skill.name, currentTime, events);
    
    case 'multi_strike': // Multi-Strike - next attack hits X extra times
      return executeMultiStrike(attacker, value, skill.name, currentTime, events);
    
    case 'cleanse': // Cleanse - remove all negative effects
      return executeCleanse(attacker, skill.name, currentTime, events);
    
    // Magic active skills
    case 'fireball': // Fireball - deal INT% as damage
      return executeFireball(attacker, defender, value, skill.name, currentTime, events);
    
    case 'frozen_bolt': // Frozen Bolt - slow enemy attack speed
      return executeFrozenBolt(attacker, defender, value, skill.name, currentTime, events);
    
    case 'hidden_force': // Hidden Force - buff STR by INT%
      return executeHiddenForce(attacker, value, skill.name, currentTime, events);
    
    // Windmaster active skills
    case 'wind_blast': // Wind Blast - deal enemy max HP% as true damage
      return executeWindBlast(attacker, defender, value, skill.name, currentTime, events);
    
    case 'heavy_cloud': // Heavy Cloud - prevent enemy dodge/block
      return executeHeavyCloud(attacker, defender, value, skill.name, currentTime, events);
    
    case 'suffocate': // Suffocate - drain enemy stamina
      return executeSuffocate(attacker, defender, value, skill.name, currentTime, events);
    
    // Shadow active skills
    case 'assassinate': // Assassinate - bonus damage, doubled if enemy below 50% HP
      return executeAssassinate(attacker, defender, value, skill.name, currentTime, events);
    
    case 'poison_cloud': // Poison Cloud - apply poison stacks instantly
      return executePoisonCloud(attacker, defender, value, skill.name, currentTime, events);
    
    case 'metamorph': // Metamorph - buff lowest attribute
      return executeMetamorph(attacker, value, skill.name, currentTime, events);
    
    // Arcane active skills
    case 'mirror_strike': // Mirror Strike - stun both self and enemy
      return executeMirrorStrike(attacker, defender, value, skill.name, currentTime, events);
    
    case 'light_missile': // Light Missile - deal true damage
      return executeLightMissile(attacker, defender, value, skill.name, currentTime, events);
    
    case 'avatar': // Avatar - buff all base attributes
      return executeAvatar(attacker, value, skill.name, currentTime, events);
    
    default:
      console.warn(`[Combat] Unknown skill effect: ${skill.effect}`);
      return null;
  }
}

/**
 * Strike skill - Attack with bonus damage
 */
function executeStrike(attacker, defender, bonusDamage, skillName, currentTime, events) {
  const event = {
    time: currentTime,
    type: 'skill',
    skillName: skillName,
    attackerId: attacker.id,
    attackerName: attacker.name,
    defenderId: defender.id,
    defenderName: defender.name,
    isPlayerAttack: attacker.isPlayer
  };
  
  // Check for dodge
  if (Math.random() < defender.dodgeChance) {
    event.result = 'dodge';
    event.damage = 0;
    event.defenderHp = defender.hp;
    
    // Riposte: Deal damage back when dodging
    if (defender.passiveBonuses?.ripostePercent > 0) {
      const riposteDamage = Math.floor((attacker.damage + bonusDamage) * (defender.passiveBonuses.ripostePercent / 100));
      if (riposteDamage > 0) {
        attacker.hp -= riposteDamage;
        event.riposte = true;
        event.riposteDamage = riposteDamage;
        event.attackerHp = Math.max(0, attacker.hp);
      }
    }
    
    // Unbalance: Deal AGI% damage when enemy dodges
    if (attacker.passiveBonuses?.unbalancePercent > 0) {
      const unbalanceDamage = Math.floor(attacker.agi * (attacker.passiveBonuses.unbalancePercent / 100));
      if (unbalanceDamage > 0) {
        defender.hp -= unbalanceDamage;
        event.unbalance = true;
        event.unbalanceDamage = unbalanceDamage;
        event.defenderHp = Math.max(0, defender.hp);
      }
    }
    
    events.push(event);
    return event;
  }
  
  // Calculate damage
  let damage = attacker.damage + bonusDamage;
  
  // Critical hit
  const isCrit = Math.random() < attacker.critChance;
  if (isCrit) {
    let critMultiplier = CONSTANTS.CRIT_MULTIPLIER;
    // Precision: Additional crit damage
    if (attacker.passiveBonuses?.critDamageBonus > 0) {
      critMultiplier += attacker.passiveBonuses.critDamageBonus / 100;
    }
    damage = Math.floor(damage * critMultiplier);
    event.isCrit = true;
  }
  
  // Block check
  const isBlocked = Math.random() < defender.blockChance;
  if (isBlocked) {
    damage = Math.floor(damage * (1 - CONSTANTS.BLOCK_MITIGATION));
    event.isBlocked = true;
    
    // Unbalance: Deal AGI% damage when enemy blocks
    if (attacker.passiveBonuses?.unbalancePercent > 0) {
      const unbalanceDamage = Math.floor(attacker.agi * (attacker.passiveBonuses.unbalancePercent / 100));
      if (unbalanceDamage > 0) {
        defender.hp -= unbalanceDamage;
        event.unbalance = true;
        event.unbalanceDamage = unbalanceDamage;
      }
    }
  }
  
  // Armor mitigation
  let armorMitigation = calculateArmorMitigation(defender.armor || 0, attacker.level);
  
  // Rust: Reduce enemy armor mitigation (Vitality passive)
  if (attacker.passiveBonuses?.rustPercent > 0 && armorMitigation > 0) {
    armorMitigation = armorMitigation * (1 - attacker.passiveBonuses.rustPercent / 100);
    event.rust = true;
  }
  
  if (armorMitigation > 0) {
    damage = Math.floor(damage * (1 - armorMitigation));
  }
  
  // Bloodletting: % max HP true damage
  if (attacker.passiveBonuses?.percentMaxHpDamage > 0) {
    const bleedDamage = Math.floor(defender.maxHp * (attacker.passiveBonuses.percentMaxHpDamage / 100));
    damage += bleedDamage;
    event.bloodletting = bleedDamage;
  }
  
  // Minimum damage
  damage = Math.max(1, damage);
  
  // Apply damage
  defender.hp -= damage;
  
  event.result = 'hit';
  event.damage = damage;
  event.defenderHp = Math.max(0, defender.hp);
  event.defenderMaxHp = defender.maxHp;
  
  // Track attacker stamina if player
  if (attacker.isPlayer) {
    event.attackerStamina = attacker.stamina;
  }
  
  // Punish: Chance to strike twice
  if (attacker.passiveBonuses?.doubleStrikeChance > 0 && Math.random() * 100 < attacker.passiveBonuses.doubleStrikeChance) {
    // Second strike (basic damage, no skill bonus)
    let secondDamage = attacker.damage;
    secondDamage = Math.floor(secondDamage * (1 - armorMitigation));
    secondDamage = Math.max(1, secondDamage);
    defender.hp -= secondDamage;
    event.doubleStrike = true;
    event.secondDamage = secondDamage;
    event.defenderHp = Math.max(0, defender.hp);
  }
  
  events.push(event);
  return event;
}

/**
 * Second Wind skill - Attack speed buff
 */
function executeAttackSpeedBuff(attacker, percentage, skillName, currentTime, events) {
  // Apply attack speed buff (permanent for this battle)
  attacker.attackSpeedBuff += percentage;
  attacker.attackCooldown = attacker.baseAttackCooldown * (1 - attacker.attackSpeedBuff / 100);
  attacker.attackCooldown = Math.max(CONSTANTS.MIN_ATTACK_COOLDOWN * 1000, attacker.attackCooldown);
  // Round to avoid floating point issues
  attacker.attackCooldown = Math.round(attacker.attackCooldown);
  
  events.push({
    time: currentTime,
    type: 'skill',
    skillName: skillName,
    attackerId: attacker.id,
    attackerName: attacker.name,
    result: 'buff',
    effect: 'attack_speed',
    value: percentage,
    newAttackSpeed: attacker.attackCooldown,
    isPlayerAttack: attacker.isPlayer,
    attackerStamina: attacker.isPlayer ? attacker.stamina : undefined
  });
  
  return true;
}

/**
 * Bash skill - Stun the enemy
 */
function executeBash(attacker, defender, duration, skillName, currentTime, events) {
  // Apply stun (duration is in seconds, convert to ms)
  const stunDurationMs = duration * 1000;
  defender.isStunned = true;
  defender.stunEndTime = currentTime + stunDurationMs;
  
  events.push({
    time: currentTime,
    type: 'skill',
    skillName: skillName,
    attackerId: attacker.id,
    attackerName: attacker.name,
    defenderId: defender.id,
    defenderName: defender.name,
    result: 'stun',
    duration: duration,
    stunEndTime: defender.stunEndTime,
    isPlayerAttack: attacker.isPlayer,
    attackerStamina: attacker.isPlayer ? attacker.stamina : undefined
  });
  
  return true;
}

/**
 * Reflect skill - Block next attack and reflect damage back
 */
function executeReflect(attacker, reflectPercent, skillName, currentTime, events) {
  // Set reflect active - will block and reflect next incoming attack
  attacker.reflectActive = true;
  attacker.reflectPercent = reflectPercent;
  
  events.push({
    time: currentTime,
    type: 'skill',
    skillName: skillName,
    attackerId: attacker.id,
    attackerName: attacker.name,
    result: 'buff',
    effect: 'reflect',
    value: reflectPercent,
    isPlayerAttack: attacker.isPlayer,
    attackerStamina: attacker.isPlayer ? attacker.stamina : undefined
  });
  
  return true;
}

/**
 * Shield Wall skill - Become invulnerable for a duration
 */
function executeShieldWall(attacker, duration, skillName, currentTime, events) {
  // Apply invulnerability (duration is in seconds, convert to ms)
  const invulnDurationMs = duration * 1000;
  attacker.isInvulnerable = true;
  attacker.invulnerableEndTime = currentTime + invulnDurationMs;
  
  events.push({
    time: currentTime,
    type: 'skill',
    skillName: skillName,
    attackerId: attacker.id,
    attackerName: attacker.name,
    result: 'buff',
    effect: 'invulnerable',
    duration: duration,
    invulnerableEndTime: attacker.invulnerableEndTime,
    isPlayerAttack: attacker.isPlayer,
    attackerStamina: attacker.isPlayer ? attacker.stamina : undefined
  });
  
  return true;
}

/**
 * Stomp skill - Deal damage based on DEF stat
 */
function executeStomp(attacker, defender, defPercent, skillName, currentTime, events) {
  const event = {
    time: currentTime,
    type: 'skill',
    skillName: skillName,
    attackerId: attacker.id,
    attackerName: attacker.name,
    defenderId: defender.id,
    defenderName: defender.name,
    isPlayerAttack: attacker.isPlayer
  };
  
  // Calculate damage based on DEF%
  let damage = Math.floor(attacker.def * (defPercent / 100));
  
  // Stomp cannot be dodged or blocked (it's a ground attack)
  
  // Apply armor mitigation
  const armorMitigation = calculateArmorMitigation(defender.armor || 0, attacker.level);
  if (armorMitigation > 0) {
    damage = Math.floor(damage * (1 - armorMitigation));
  }
  
  // Minimum damage of 1
  damage = Math.max(1, damage);
  
  // Apply damage
  defender.hp -= damage;
  
  event.result = 'hit';
  event.damage = damage;
  event.defenderHp = Math.max(0, defender.hp);
  event.defenderMaxHp = defender.maxHp;
  event.attackerStamina = attacker.isPlayer ? attacker.stamina : undefined;
  
  events.push(event);
  return event;
}

/**
 * Heal skill - Heal % of max HP
 */
function executeHeal(attacker, defender, healPercent, skillName, currentTime, events) {
  // Check if healing is blocked (Disrupt)
  if (attacker.healingBlocked) {
    events.push({
      time: currentTime,
      type: 'skill',
      skillName: skillName,
      attackerId: attacker.id,
      attackerName: attacker.name,
      result: 'blocked',
      reason: 'healing_blocked',
      isPlayerAttack: attacker.isPlayer,
      attackerStamina: attacker.isPlayer ? attacker.stamina : undefined
    });
    return true;
  }
  
  // Calculate heal amount
  let healAmount = Math.floor(attacker.maxHp * (healPercent / 100));
  
  // Aegis: Below 20% HP, healing is stronger (Windmaster passive - future-proofing)
  if (attacker.passiveBonuses?.aegisPercent > 0) {
    const hpPercent = (attacker.hp / attacker.maxHp) * 100;
    if (hpPercent < 20) {
      healAmount = Math.floor(healAmount * (1 + attacker.passiveBonuses.aegisPercent / 100));
    }
  }
  
  const oldHp = attacker.hp;
  attacker.hp = Math.min(attacker.maxHp + attacker.bonusHp, attacker.hp + healAmount);
  const actualHeal = attacker.hp - oldHp;
  
  const event = {
    time: currentTime,
    type: 'skill',
    skillName: skillName,
    attackerId: attacker.id,
    attackerName: attacker.name,
    result: 'heal',
    healAmount: actualHeal,
    newHp: attacker.hp,
    maxHp: attacker.maxHp,
    isPlayerAttack: attacker.isPlayer,
    attackerStamina: attacker.isPlayer ? attacker.stamina : undefined
  };
  
  // Divine Punishment: Deal true damage to enemy when healed
  if (actualHeal > 0 && attacker.passiveBonuses?.divinePunishmentDamage > 0) {
    const divineDamage = attacker.passiveBonuses.divinePunishmentDamage;
    defender.hp -= divineDamage;
    event.divinePunishment = true;
    event.divineDamage = divineDamage;
    event.defenderHp = Math.max(0, defender.hp);
    event.defenderId = defender.id;
    event.defenderName = defender.name;
  }
  
  events.push(event);
  return true;
}

/**
 * Unfair Exchange skill - Sacrifice HP to deal damage (value + INT)
 * Damages self for baseValue, damages enemy for baseValue + INT
 */
function executeUnfairExchange(attacker, defender, baseValue, skillName, currentTime, events) {
  const event = {
    time: currentTime,
    type: 'skill',
    skillName: skillName,
    attackerId: attacker.id,
    attackerName: attacker.name,
    defenderId: defender.id,
    defenderName: defender.name,
    isPlayerAttack: attacker.isPlayer
  };
  
  // Self-damage portion: sacrifice HP
  const selfDamage = baseValue;
  attacker.hp -= selfDamage;
  event.selfDamage = selfDamage;
  event.attackerHp = Math.max(0, attacker.hp);
  
  // Damage to enemy: baseValue + INT
  let damage = baseValue + (attacker.int || 0);
  
  // Apply armor mitigation with Rust reduction
  let armorMitigation = calculateArmorMitigation(defender.armor || 0, attacker.level);
  
  // Rust: Reduce enemy armor mitigation
  if (attacker.passiveBonuses?.rustPercent > 0) {
    armorMitigation = armorMitigation * (1 - attacker.passiveBonuses.rustPercent / 100);
  }
  
  if (armorMitigation > 0) {
    damage = Math.floor(damage * (1 - armorMitigation));
  }
  
  damage = Math.max(1, damage);
  defender.hp -= damage;
  
  event.result = 'hit';
  event.damage = damage;
  event.defenderHp = Math.max(0, defender.hp);
  event.defenderMaxHp = defender.maxHp;
  event.attackerStamina = attacker.isPlayer ? attacker.stamina : undefined;
  
  events.push(event);
  return event;
}

/**
 * Disrupt skill - Block enemy healing for a duration
 */
function executeDisrupt(attacker, defender, duration, skillName, currentTime, events) {
  // Apply healing block (duration is in seconds, convert to ms)
  const blockDurationMs = duration * 1000;
  defender.healingBlocked = true;
  defender.healingBlockedEndTime = currentTime + blockDurationMs;
  
  events.push({
    time: currentTime,
    type: 'skill',
    skillName: skillName,
    attackerId: attacker.id,
    attackerName: attacker.name,
    defenderId: defender.id,
    defenderName: defender.name,
    result: 'debuff',
    effect: 'healing_blocked',
    duration: duration,
    healingBlockedEndTime: defender.healingBlockedEndTime,
    isPlayerAttack: attacker.isPlayer,
    attackerStamina: attacker.isPlayer ? attacker.stamina : undefined
  });
  
  return true;
}

/**
 * Analyze skill - Next attack is guaranteed crit with bonus damage
 */
function executeAnalyze(attacker, bonusDamagePercent, skillName, currentTime, events) {
  attacker.analyzeBuff = true;
  attacker.analyzeBonus = bonusDamagePercent;
  
  events.push({
    time: currentTime,
    type: 'skill',
    skillName: skillName,
    attackerId: attacker.id,
    attackerName: attacker.name,
    result: 'buff',
    effect: 'analyze',
    value: bonusDamagePercent,
    isPlayerAttack: attacker.isPlayer,
    attackerStamina: attacker.isPlayer ? attacker.stamina : undefined
  });
  
  return true;
}

/**
 * Multi-Strike skill - Next attack hits X extra times
 */
function executeMultiStrike(attacker, extraHits, skillName, currentTime, events) {
  attacker.multiStrikeBuff = extraHits;
  
  events.push({
    time: currentTime,
    type: 'skill',
    skillName: skillName,
    attackerId: attacker.id,
    attackerName: attacker.name,
    result: 'buff',
    effect: 'multi_strike',
    value: extraHits,
    isPlayerAttack: attacker.isPlayer,
    attackerStamina: attacker.isPlayer ? attacker.stamina : undefined
  });
  
  return true;
}

/**
 * Cleanse skill - Remove all negative effects from self
 */
function executeCleanse(attacker, skillName, currentTime, events) {
  const cleansedEffects = [];
  
  // Remove stun
  if (attacker.isStunned) {
    attacker.isStunned = false;
    attacker.stunEndTime = 0;
    cleansedEffects.push('stun');
  }
  
  // Remove healing block (Disrupt)
  if (attacker.healingBlocked) {
    attacker.healingBlocked = false;
    attacker.healingBlockedEndTime = 0;
    cleansedEffects.push('healing_blocked');
  }
  
  // Remove poison
  if (attacker.poisonStacks > 0) {
    cleansedEffects.push(`poison (${attacker.poisonStacks} stacks)`);
    attacker.poisonStacks = 0;
  }
  
  // Remove slow (Frozen Bolt)
  if (attacker.isSlowed) {
    attacker.isSlowed = false;
    attacker.slowEndTime = 0;
    // Restore original attack cooldown
    attacker.attackCooldown = attacker.baseAttackCooldown * (1 - attacker.attackSpeedBuff / 100);
    attacker.attackCooldown = Math.max(CONSTANTS.MIN_ATTACK_COOLDOWN * 1000, attacker.attackCooldown);
    attacker.attackCooldown = Math.round(attacker.attackCooldown);
    cleansedEffects.push('slowed');
  }
  
  events.push({
    time: currentTime,
    type: 'skill',
    skillName: skillName,
    attackerId: attacker.id,
    attackerName: attacker.name,
    result: 'buff',
    effect: 'cleanse',
    cleansedEffects: cleansedEffects,
    isPlayerAttack: attacker.isPlayer,
    attackerStamina: attacker.isPlayer ? attacker.stamina : undefined
  });
  
  return true;
}

/**
 * Fireball skill - Deal INT% as damage (Magic active)
 */
function executeFireball(attacker, defender, intPercent, skillName, currentTime, events) {
  const event = {
    time: currentTime,
    type: 'skill',
    skillName: skillName,
    attackerId: attacker.id,
    attackerName: attacker.name,
    defenderId: defender.id,
    defenderName: defender.name,
    isPlayerAttack: attacker.isPlayer
  };
  
  // Calculate damage based on INT%
  let damage = Math.floor(attacker.int * (intPercent / 100));
  
  // Shards: Extra damage when using active skill (Magic passive)
  if (attacker.passiveBonuses?.shardsDamage > 0) {
    damage += attacker.passiveBonuses.shardsDamage;
    event.shards = attacker.passiveBonuses.shardsDamage;
  }
  
  // Fireball cannot be dodged (magic attack)
  // But it can be blocked
  const isBlocked = Math.random() < defender.blockChance;
  if (isBlocked) {
    damage = Math.floor(damage * (1 - CONSTANTS.BLOCK_MITIGATION));
    event.isBlocked = true;
  }
  
  // Apply armor mitigation
  let armorMitigation = calculateArmorMitigation(defender.armor || 0, attacker.level);
  
  // Rust: Reduce enemy armor mitigation (Vitality passive)
  if (attacker.passiveBonuses?.rustPercent > 0 && armorMitigation > 0) {
    armorMitigation = armorMitigation * (1 - attacker.passiveBonuses.rustPercent / 100);
    event.rust = true;
  }
  
  if (armorMitigation > 0) {
    damage = Math.floor(damage * (1 - armorMitigation));
  }
  
  // Minimum damage
  damage = Math.max(1, damage);
  
  // Apply damage
  defender.hp -= damage;
  
  event.result = 'hit';
  event.damage = damage;
  event.defenderHp = Math.max(0, defender.hp);
  event.defenderMaxHp = defender.maxHp;
  event.attackerStamina = attacker.isPlayer ? attacker.stamina : undefined;
  
  // Life Steal: Heal % of damage dealt (Vitality passive)
  if (attacker.passiveBonuses?.lifeStealPercent > 0 && !attacker.healingBlocked) {
    const lifeStealHeal = Math.floor(damage * (attacker.passiveBonuses.lifeStealPercent / 100));
    if (lifeStealHeal > 0) {
      const oldHp = attacker.hp;
      attacker.hp = Math.min(attacker.maxHp + attacker.bonusHp, attacker.hp + lifeStealHeal);
      const actualHeal = attacker.hp - oldHp;
      if (actualHeal > 0) {
        event.lifeSteal = true;
        event.lifeStealHeal = actualHeal;
        event.attackerHp = attacker.hp;
      }
    }
  }
  
  events.push(event);
  return event;
}

/**
 * Frozen Bolt skill - Slow enemy attack speed by 50% for duration (Magic active)
 */
function executeFrozenBolt(attacker, defender, duration, skillName, currentTime, events) {
  // Shards: Extra damage when using active skill (Magic passive)
  let shardsDamage = 0;
  if (attacker.passiveBonuses?.shardsDamage > 0) {
    shardsDamage = attacker.passiveBonuses.shardsDamage;
    defender.hp -= shardsDamage;
  }
  
  // Apply slow (duration is in seconds, convert to ms)
  const slowDurationMs = duration * 1000;
  defender.isSlowed = true;
  defender.slowEndTime = currentTime + slowDurationMs;
  defender.slowPercent = 50;  // Fixed 50% slow
  
  // Apply attack speed reduction
  defender.attackCooldown = defender.baseAttackCooldown * 1.5;  // 50% slower = 1.5x cooldown
  defender.attackCooldown = Math.round(defender.attackCooldown);
  
  events.push({
    time: currentTime,
    type: 'skill',
    skillName: skillName,
    attackerId: attacker.id,
    attackerName: attacker.name,
    defenderId: defender.id,
    defenderName: defender.name,
    result: 'debuff',
    effect: 'slow',
    slowPercent: 50,
    duration: duration,
    slowEndTime: defender.slowEndTime,
    shards: shardsDamage > 0 ? shardsDamage : undefined,
    defenderHp: shardsDamage > 0 ? Math.max(0, defender.hp) : undefined,
    isPlayerAttack: attacker.isPlayer,
    attackerStamina: attacker.isPlayer ? attacker.stamina : undefined
  });
  
  return true;
}

/**
 * Hidden Force skill - Increase STR by INT% until end of battle (Magic active)
 */
function executeHiddenForce(attacker, intPercent, skillName, currentTime, events) {
  // Calculate STR bonus based on INT%
  const strBonus = Math.floor(attacker.int * (intPercent / 100));
  
  // Apply STR buff (permanent for battle)
  attacker.strBuff += strBonus;
  // Recalculate damage with new STR
  attacker.damage = (attacker.baseStr + attacker.strBuff) * CONSTANTS.DAMAGE_PER_STR;
  
  // Shards: Extra damage to enemy when using active skill (Magic passive)
  let shardsDamage = 0;
  if (attacker.passiveBonuses?.shardsDamage > 0) {
    // For self-buff skills, Shards doesn't deal damage (no defender targeted)
    // But we track it for consistency
  }
  
  events.push({
    time: currentTime,
    type: 'skill',
    skillName: skillName,
    attackerId: attacker.id,
    attackerName: attacker.name,
    result: 'buff',
    effect: 'hidden_force',
    strBonus: strBonus,
    newStr: attacker.baseStr + attacker.strBuff,
    newDamage: attacker.damage,
    isPlayerAttack: attacker.isPlayer,
    attackerStamina: attacker.isPlayer ? attacker.stamina : undefined
  });
  
  return true;
}

/**
 * Wind Blast skill - Deal enemy max HP% as true damage (Windmaster active)
 */
function executeWindBlast(attacker, defender, maxHpPercent, skillName, currentTime, events) {
  // Calculate true damage based on enemy max HP%
  let damage = Math.floor(defender.maxHp * (maxHpPercent / 100));
  
  // Shards: Extra damage when using active skill (Magic passive)
  if (attacker.passiveBonuses?.shardsDamage > 0) {
    damage += attacker.passiveBonuses.shardsDamage;
  }
  
  // Wind Blast is TRUE damage - ignores armor, cannot be dodged or blocked
  damage = Math.max(1, damage);
  
  // Apply damage
  defender.hp -= damage;
  
  events.push({
    time: currentTime,
    type: 'skill',
    skillName: skillName,
    attackerId: attacker.id,
    attackerName: attacker.name,
    defenderId: defender.id,
    defenderName: defender.name,
    result: 'hit',
    damage: damage,
    isTrueDamage: true,
    defenderHp: Math.max(0, defender.hp),
    defenderMaxHp: defender.maxHp,
    isPlayerAttack: attacker.isPlayer,
    attackerStamina: attacker.isPlayer ? attacker.stamina : undefined
  });
  
  return true;
}

/**
 * Heavy Cloud skill - Prevent enemy dodge/block for duration (Windmaster active)
 */
function executeHeavyCloud(attacker, defender, duration, skillName, currentTime, events) {
  // Shards: Extra damage when using active skill (Magic passive)
  let shardsDamage = 0;
  if (attacker.passiveBonuses?.shardsDamage > 0) {
    shardsDamage = attacker.passiveBonuses.shardsDamage;
    defender.hp -= shardsDamage;
  }
  
  // Apply cannot dodge/block debuff (duration is in seconds, convert to ms)
  const debuffDurationMs = duration * 1000;
  defender.cannotDodgeBlock = true;
  defender.cannotDodgeBlockEndTime = currentTime + debuffDurationMs;
  
  events.push({
    time: currentTime,
    type: 'skill',
    skillName: skillName,
    attackerId: attacker.id,
    attackerName: attacker.name,
    defenderId: defender.id,
    defenderName: defender.name,
    result: 'debuff',
    effect: 'cannot_dodge_block',
    duration: duration,
    cannotDodgeBlockEndTime: defender.cannotDodgeBlockEndTime,
    shards: shardsDamage > 0 ? shardsDamage : undefined,
    defenderHp: shardsDamage > 0 ? Math.max(0, defender.hp) : undefined,
    isPlayerAttack: attacker.isPlayer,
    attackerStamina: attacker.isPlayer ? attacker.stamina : undefined
  });
  
  return true;
}

/**
 * Suffocate skill - Drain enemy stamina (Windmaster active)
 */
function executeSuffocate(attacker, defender, drainPercent, skillName, currentTime, events) {
  // Shards: Extra damage when using active skill (Magic passive)
  let shardsDamage = 0;
  if (attacker.passiveBonuses?.shardsDamage > 0) {
    shardsDamage = attacker.passiveBonuses.shardsDamage;
    defender.hp -= shardsDamage;
  }
  
  // Drain % of enemy's current stamina
  const staminaDrained = Math.floor(defender.stamina * (drainPercent / 100));
  defender.stamina = Math.max(0, defender.stamina - staminaDrained);
  
  events.push({
    time: currentTime,
    type: 'skill',
    skillName: skillName,
    attackerId: attacker.id,
    attackerName: attacker.name,
    defenderId: defender.id,
    defenderName: defender.name,
    result: 'debuff',
    effect: 'stamina_drain',
    staminaDrained: staminaDrained,
    defenderStamina: defender.stamina,
    shards: shardsDamage > 0 ? shardsDamage : undefined,
    defenderHp: shardsDamage > 0 ? Math.max(0, defender.hp) : undefined,
    isPlayerAttack: attacker.isPlayer,
    attackerStamina: attacker.isPlayer ? attacker.stamina : undefined
  });
  
  return true;
}

/**
 * Assassinate skill - Attack with bonus damage, doubled if enemy HP below 50% (Shadow active)
 */
function executeAssassinate(attacker, defender, bonusDamagePercent, skillName, currentTime, events) {
  const event = {
    time: currentTime,
    type: 'skill',
    skillName: skillName,
    attackerId: attacker.id,
    attackerName: attacker.name,
    defenderId: defender.id,
    defenderName: defender.name,
    isPlayerAttack: attacker.isPlayer
  };
  
  // Calculate bonus damage
  let bonusPercent = bonusDamagePercent;
  
  // Check if enemy HP is below 50% - double the bonus damage
  const enemyHpPercent = (defender.hp / defender.maxHp) * 100;
  if (enemyHpPercent < 50) {
    bonusPercent *= 2;
    event.executionBonus = true;
  }
  
  // Calculate total damage
  let damage = attacker.damage;
  const bonusDamage = Math.floor(damage * (bonusPercent / 100));
  damage += bonusDamage;
  event.bonusDamagePercent = bonusPercent;
  
  // Shards: Extra damage when using active skill (Magic passive)
  if (attacker.passiveBonuses?.shardsDamage > 0) {
    damage += attacker.passiveBonuses.shardsDamage;
    event.shards = attacker.passiveBonuses.shardsDamage;
  }
  
  // Check for dodge (can be dodged, but Heavy Cloud prevents it)
  if (!defender.cannotDodgeBlock && Math.random() < defender.dodgeChance) {
    event.result = 'dodge';
    event.damage = 0;
    event.defenderHp = defender.hp;
    
    // Riposte: Deal damage back when dodging
    if (defender.passiveBonuses?.ripostePercent > 0) {
      const riposteDamage = Math.floor(damage * (defender.passiveBonuses.ripostePercent / 100));
      if (riposteDamage > 0) {
        attacker.hp -= riposteDamage;
        event.riposte = true;
        event.riposteDamage = riposteDamage;
        event.attackerHp = Math.max(0, attacker.hp);
      }
    }
    
    events.push(event);
    return event;
  }
  
  // Critical hit
  const isCrit = Math.random() < attacker.critChance;
  if (isCrit) {
    let critMultiplier = CONSTANTS.CRIT_MULTIPLIER;
    // Precision: Additional crit damage
    if (attacker.passiveBonuses?.critDamageBonus > 0) {
      critMultiplier += attacker.passiveBonuses.critDamageBonus / 100;
    }
    damage = Math.floor(damage * critMultiplier);
    event.isCrit = true;
    
    // Weakness: Each crit increases DEX by % until end of battle (Shadow passive)
    if (attacker.passiveBonuses?.weaknessPercent > 0) {
      const dexGain = Math.floor(attacker.baseDex * (attacker.passiveBonuses.weaknessPercent / 100));
      attacker.dexBuff += dexGain;
      attacker.dex = attacker.baseDex + attacker.dexBuff;
      attacker.critChance = calculateCritChance(attacker.dex);
      attacker.dodgeChance = calculateDodgeChance(attacker.dex);
      event.weakness = true;
      event.weaknessDexGain = dexGain;
      event.newDex = attacker.dex;
    }
  }
  
  // Block check (Heavy Cloud prevents blocking)
  let effectiveBlockChance = defender.cannotDodgeBlock ? 0 : defender.blockChance;
  if (defender.passiveBonuses?.concentrationPercent > 0 && (defender.hp / defender.maxHp) > 0.7) {
    effectiveBlockChance += defender.passiveBonuses.concentrationPercent / 100;
  }
  
  const isBlocked = Math.random() < effectiveBlockChance;
  if (isBlocked) {
    damage = Math.floor(damage * (1 - CONSTANTS.BLOCK_MITIGATION));
    event.isBlocked = true;
  }
  
  // Apply armor mitigation
  let armorMitigation = calculateArmorMitigation(defender.armor || 0, attacker.level);
  
  // Rust: Reduce enemy armor mitigation (Vitality passive)
  if (attacker.passiveBonuses?.rustPercent > 0 && armorMitigation > 0) {
    armorMitigation = armorMitigation * (1 - attacker.passiveBonuses.rustPercent / 100);
    event.rust = true;
  }
  
  if (armorMitigation > 0) {
    damage = Math.floor(damage * (1 - armorMitigation));
  }
  
  // Bloodletting: % max HP true damage
  if (attacker.passiveBonuses?.percentMaxHpDamage > 0) {
    const bleedDamage = Math.floor(defender.maxHp * (attacker.passiveBonuses.percentMaxHpDamage / 100));
    damage += bleedDamage;
    event.bloodletting = bleedDamage;
  }
  
  // Minimum damage
  damage = Math.max(1, damage);
  
  // Apply damage
  defender.hp -= damage;
  
  event.result = 'hit';
  event.damage = damage;
  event.defenderHp = Math.max(0, defender.hp);
  event.defenderMaxHp = defender.maxHp;
  event.attackerStamina = attacker.isPlayer ? attacker.stamina : undefined;
  
  // Life Steal: Heal % of damage dealt (Vitality passive)
  if (attacker.passiveBonuses?.lifeStealPercent > 0 && !attacker.healingBlocked) {
    const lifeStealHeal = Math.floor(damage * (attacker.passiveBonuses.lifeStealPercent / 100));
    if (lifeStealHeal > 0) {
      const oldHp = attacker.hp;
      attacker.hp = Math.min(attacker.maxHp + attacker.bonusHp, attacker.hp + lifeStealHeal);
      const actualHeal = attacker.hp - oldHp;
      if (actualHeal > 0) {
        event.lifeSteal = true;
        event.lifeStealHeal = actualHeal;
        event.attackerHp = attacker.hp;
      }
    }
  }
  
  events.push(event);
  return event;
}

/**
 * Poison Cloud skill - Apply poison stacks instantly (Shadow active)
 */
function executePoisonCloud(attacker, defender, poisonStacks, skillName, currentTime, events) {
  // Apply poison stacks
  defender.poisonStacks += poisonStacks;
  
  // Shards: Extra damage when using active skill (Magic passive)
  let shardsDamage = 0;
  if (attacker.passiveBonuses?.shardsDamage > 0) {
    shardsDamage = attacker.passiveBonuses.shardsDamage;
    defender.hp -= shardsDamage;
  }
  
  events.push({
    time: currentTime,
    type: 'skill',
    skillName: skillName,
    attackerId: attacker.id,
    attackerName: attacker.name,
    defenderId: defender.id,
    defenderName: defender.name,
    result: 'debuff',
    effect: 'poison',
    poisonApplied: poisonStacks,
    defenderPoisonStacks: defender.poisonStacks,
    shards: shardsDamage > 0 ? shardsDamage : undefined,
    defenderHp: shardsDamage > 0 ? Math.max(0, defender.hp) : defender.hp,
    isPlayerAttack: attacker.isPlayer,
    attackerStamina: attacker.isPlayer ? attacker.stamina : undefined
  });
  
  return true;
}

/**
 * Metamorph skill - Gain +value to lowest attribute until end of battle (Shadow active)
 */
function executeMetamorph(attacker, attributeBonus, skillName, currentTime, events) {
  // Find the current lowest base attribute (STR, AGI, DEX, INT, DEF)
  const attributes = {
    str: attacker.baseStr || 1,
    agi: attacker.agi || 1,
    dex: attacker.baseDex || 1,
    int: attacker.baseInt || 1,
    def: attacker.baseDef || 0
  };
  
  let lowestAttr = 'str';
  let lowestValue = attributes.str;
  
  for (const [attr, value] of Object.entries(attributes)) {
    if (value < lowestValue) {
      lowestValue = value;
      lowestAttr = attr;
    }
  }
  
  // Apply the bonus to the lowest attribute
  switch (lowestAttr) {
    case 'str':
      attacker.strBuff += attributeBonus;
      attacker.damage = (attacker.baseStr + attacker.strBuff) * CONSTANTS.DAMAGE_PER_STR;
      break;
    case 'agi':
      attacker.agi += attributeBonus;
      attacker.attackCooldown = Math.round(calculateAttackCooldown(attacker.agi));
      if (attacker.attackSpeedBuff > 0) {
        attacker.attackCooldown = Math.round(attacker.attackCooldown * (1 - attacker.attackSpeedBuff / 100));
      }
      break;
    case 'dex':
      attacker.dexBuff += attributeBonus;
      attacker.dex = attacker.baseDex + attacker.dexBuff;
      attacker.critChance = calculateCritChance(attacker.dex);
      attacker.dodgeChance = calculateDodgeChance(attacker.dex);
      break;
    case 'int':
      attacker.intBuff += attributeBonus;
      attacker.int = attacker.baseInt + attacker.intBuff;
      break;
    case 'def':
      attacker.defBuff += attributeBonus;
      attacker.def = attacker.baseDef + attacker.defBuff;
      attacker.blockChance = calculateBlockChance(attacker.def);
      break;
  }
  
  events.push({
    time: currentTime,
    type: 'skill',
    skillName: skillName,
    attackerId: attacker.id,
    attackerName: attacker.name,
    result: 'buff',
    effect: 'metamorph',
    attribute: lowestAttr,
    bonus: attributeBonus,
    newValue: lowestAttr === 'str' ? attacker.baseStr + attacker.strBuff :
              lowestAttr === 'agi' ? attacker.agi :
              lowestAttr === 'dex' ? attacker.dex :
              lowestAttr === 'int' ? attacker.int :
              attacker.def,
    isPlayerAttack: attacker.isPlayer,
    attackerStamina: attacker.isPlayer ? attacker.stamina : undefined
  });
  
  return true;
}

// ===========================================
// ARCANE ACTIVE SKILLS
// ===========================================

/**
 * Mirror Strike skill - Stun both self and enemy
 */
function executeMirrorStrike(attacker, defender, stunDuration, skillName, currentTime, events) {
  const stunMs = stunDuration * 1000;
  
  // Stun the enemy
  defender.isStunned = true;
  defender.stunEndTime = currentTime + stunMs;
  
  // Stun self
  attacker.isStunned = true;
  attacker.stunEndTime = currentTime + stunMs;
  
  // Shards damage (applies to defender)
  let shardsDamage = 0;
  if (attacker.passiveBonuses?.shardsDamage > 0) {
    shardsDamage = attacker.passiveBonuses.shardsDamage;
    defender.hp -= shardsDamage;
  }
  
  events.push({
    time: currentTime,
    type: 'skill',
    skillName: skillName,
    attackerId: attacker.id,
    attackerName: attacker.name,
    defenderId: defender.id,
    defenderName: defender.name,
    result: 'mirror_strike',
    stunDuration: stunDuration,
    selfStunned: true,
    enemyStunned: true,
    shardsDamage: shardsDamage > 0 ? shardsDamage : undefined,
    defenderHp: Math.max(0, defender.hp),
    isPlayerAttack: attacker.isPlayer,
    attackerStamina: attacker.isPlayer ? attacker.stamina : undefined
  });
  
  return true;
}

/**
 * Light Missile skill - Deal true damage (ignores armor)
 */
function executeLightMissile(attacker, defender, trueDamage, skillName, currentTime, events) {
  // Add Shards damage
  let totalDamage = trueDamage;
  let shardsDamage = 0;
  if (attacker.passiveBonuses?.shardsDamage > 0) {
    shardsDamage = attacker.passiveBonuses.shardsDamage;
    totalDamage += shardsDamage;
  }
  
  // True damage - no dodge, no block, no armor
  defender.hp -= totalDamage;
  
  // Track consecutive hits for Momentum
  attacker.consecutiveHits++;
  
  // Update attack speed if Momentum is active
  if (attacker.passiveBonuses?.momentumPercent > 0) {
    updateMomentumAttackSpeed(attacker);
  }
  
  events.push({
    time: currentTime,
    type: 'skill',
    skillName: skillName,
    attackerId: attacker.id,
    attackerName: attacker.name,
    defenderId: defender.id,
    defenderName: defender.name,
    result: 'hit',
    damage: trueDamage,
    isTrueDamage: true,
    shardsDamage: shardsDamage > 0 ? shardsDamage : undefined,
    defenderHp: Math.max(0, defender.hp),
    isPlayerAttack: attacker.isPlayer,
    attackerStamina: attacker.isPlayer ? attacker.stamina : undefined
  });
  
  // Life Steal: Heal % of damage dealt
  if (attacker.passiveBonuses?.lifeStealPercent > 0 && !attacker.healingBlocked) {
    let healAmount = Math.floor(totalDamage * (attacker.passiveBonuses.lifeStealPercent / 100));
    // Aegis: Healing stronger when below 20% HP
    if (attacker.passiveBonuses?.aegisPercent > 0 && (attacker.hp / attacker.maxHp) < 0.2) {
      healAmount = Math.floor(healAmount * (1 + attacker.passiveBonuses.aegisPercent / 100));
    }
    const oldHp = attacker.hp;
    attacker.hp = Math.min(attacker.maxHp + attacker.bonusHp, attacker.hp + healAmount);
    const actualHeal = attacker.hp - oldHp;
    if (actualHeal > 0) {
      events.push({
        time: currentTime,
        type: 'passive_proc',
        passive: 'Life Steal',
        attackerId: attacker.id,
        attackerName: attacker.name,
        heal: actualHeal,
        newHp: attacker.hp
      });
      
      // Divine Punishment: Deal true damage to enemy when healed
      if (attacker.passiveBonuses?.divinePunishmentDamage > 0) {
        const divineDamage = attacker.passiveBonuses.divinePunishmentDamage;
        defender.hp -= divineDamage;
        events.push({
          time: currentTime,
          type: 'passive_proc',
          passive: 'Divine Punishment',
          attackerId: attacker.id,
          attackerName: attacker.name,
          targetId: defender.id,
          targetName: defender.name,
          damage: divineDamage,
          newHp: Math.max(0, defender.hp)
        });
      }
    }
  }
  
  return true;
}

/**
 * Avatar skill - Buff all base attributes for the rest of battle
 */
function executeAvatar(attacker, percentBonus, skillName, currentTime, events) {
  // Calculate bonuses for each base attribute
  const strBonus = Math.floor(attacker.baseStr * (percentBonus / 100));
  const agiBonus = Math.floor(attacker.agi * (percentBonus / 100));
  const dexBonus = Math.floor(attacker.baseDex * (percentBonus / 100));
  const intBonus = Math.floor(attacker.baseInt * (percentBonus / 100));
  const defBonus = Math.floor(attacker.baseDef * (percentBonus / 100));
  
  // Apply STR bonus (affects damage)
  attacker.strBuff += strBonus;
  attacker.damage = (attacker.baseStr + attacker.strBuff) * CONSTANTS.DAMAGE_PER_STR;
  
  // Apply AGI bonus (affects attack speed)
  attacker.agi += agiBonus;
  attacker.attackCooldown = Math.round(calculateAttackCooldown(attacker.agi));
  if (attacker.attackSpeedBuff > 0) {
    attacker.attackCooldown = Math.round(attacker.attackCooldown * (1 - attacker.attackSpeedBuff / 100));
  }
  
  // Apply DEX bonus (affects crit/dodge)
  attacker.dexBuff += dexBonus;
  attacker.dex = attacker.baseDex + attacker.dexBuff;
  attacker.critChance = calculateCritChance(attacker.dex);
  attacker.dodgeChance = calculateDodgeChance(attacker.dex);
  
  // Apply INT bonus
  attacker.intBuff += intBonus;
  attacker.int = attacker.baseInt + attacker.intBuff;
  
  // Apply DEF bonus (affects block)
  attacker.defBuff += defBonus;
  attacker.def = attacker.baseDef + attacker.defBuff;
  attacker.blockChance = calculateBlockChance(attacker.def);
  
  events.push({
    time: currentTime,
    type: 'skill',
    skillName: skillName,
    attackerId: attacker.id,
    attackerName: attacker.name,
    result: 'buff',
    effect: 'avatar',
    percentBonus: percentBonus,
    strBonus: strBonus,
    agiBonus: agiBonus,
    dexBonus: dexBonus,
    intBonus: intBonus,
    defBonus: defBonus,
    isPlayerAttack: attacker.isPlayer,
    attackerStamina: attacker.isPlayer ? attacker.stamina : undefined
  });
  
  return true;
}

/**
 * Helper function to update attack speed based on Momentum stacks
 */
function updateMomentumAttackSpeed(attacker) {
  if (!attacker.passiveBonuses?.momentumPercent || attacker.consecutiveHits <= 0) return;
  
  const momentumBonus = attacker.consecutiveHits * attacker.passiveBonuses.momentumPercent;
  const baseAttackCooldown = attacker.baseAttackCooldown;
  
  // Calculate new attack cooldown with all speed bonuses
  let newCooldown = baseAttackCooldown;
  
  // Apply passive attack speed buff
  if (attacker.passiveBonuses?.attackSpeedPercent > 0) {
    newCooldown = Math.round(newCooldown * (1 - attacker.passiveBonuses.attackSpeedPercent / 100));
  }
  
  // Apply active attack speed buff (Second Wind)
  if (attacker.attackSpeedBuff > 0) {
    newCooldown = Math.round(newCooldown * (1 - attacker.attackSpeedBuff / 100));
  }
  
  // Apply Momentum bonus
  newCooldown = Math.round(newCooldown * (1 - momentumBonus / 100));
  
  // Minimum attack cooldown
  attacker.attackCooldown = Math.max(100, newCooldown);
}

/**
 * Process basic attack for a combatant (on attack timer)
 */
function processBasicAttackAction(attacker, defender, currentTime, events) {
  // Check if it's time for basic attack
  if (currentTime < attacker.nextAttackTime) {
    return;
  }
  
  // Use basic attack if we have stamina
  if (attacker.stamina >= CONSTANTS.BASIC_ATTACK_STAMINA) {
    // Deduct stamina first
    attacker.stamina -= CONSTANTS.BASIC_ATTACK_STAMINA;
    
    const attackEvent = processBasicAttack(attacker, defender, currentTime);
    events.push(attackEvent);
    
    attacker.nextAttackTime = currentTime + attacker.attackCooldown;
    
    // En Garde: Restore stamina on attack
    if (attacker.passiveBonuses?.staminaOnAttackPercent > 0) {
      const staminaRestore = attacker.maxStamina * (attacker.passiveBonuses.staminaOnAttackPercent / 100);
      attacker.stamina = Math.min(attacker.maxStamina, attacker.stamina + staminaRestore);
      // Update event with final stamina after En Garde
      if (attacker.isPlayer) {
        attackEvent.attackerStamina = attacker.stamina;
      }
    }
  } else {
    // Not enough stamina, wait
    attacker.nextAttackTime = currentTime + 500;
  }
}

/**
 * Process a basic attack
 */
function processBasicAttack(attacker, defender, currentTime) {
  const event = {
    time: currentTime,
    type: 'attack',
    attackerId: attacker.id,
    attackerName: attacker.name,
    defenderId: defender.id,
    defenderName: defender.name,
    isPlayerAttack: attacker.isPlayer
  };
  
  // Undermine: Enemy loses stamina when attacking (Defense passive)
  if (defender.passiveBonuses?.undermineAmount > 0) {
    attacker.stamina = Math.max(0, attacker.stamina - defender.passiveBonuses.undermineAmount);
    event.undermine = true;
    event.undermineAmount = defender.passiveBonuses.undermineAmount;
  }
  
  // Shield Wall: Defender is invulnerable - attack does nothing
  if (defender.isInvulnerable) {
    event.result = 'invulnerable';
    event.damage = 0;
    event.defenderHp = defender.hp;
    return event;
  }
  
  // Reflect: Defender automatically blocks and reflects damage back
  if (defender.reflectActive) {
    defender.reflectActive = false; // Consume the reflect
    
    // Calculate reflected damage
    let damage = attacker.damage;
    const reflectedDamage = Math.floor(damage * (defender.reflectPercent / 100));
    
    // Reflect always blocks
    event.result = 'blocked';
    event.isBlocked = true;
    event.damage = 0;
    event.defenderHp = defender.hp;
    
    // Apply reflected damage to attacker
    if (reflectedDamage > 0) {
      attacker.hp -= reflectedDamage;
      event.reflect = true;
      event.reflectDamage = reflectedDamage;
      event.attackerHp = Math.max(0, attacker.hp);
    }
    
    // Poise: Heal on block (Defense passive)
    if (defender.passiveBonuses?.poisePercent > 0 && !defender.healingBlocked) {
      const healAmount = Math.floor(defender.maxHp * (defender.passiveBonuses.poisePercent / 100));
      const oldHp = defender.hp;
      defender.hp = Math.min(defender.maxHp + defender.bonusHp, defender.hp + healAmount);
      const actualHeal = defender.hp - oldHp;
      if (actualHeal > 0) {
        event.poise = true;
        event.poiseHeal = actualHeal;
        event.defenderHp = defender.hp;
        
        // Divine Punishment: Deal true damage to attacker when defender heals
        if (defender.passiveBonuses?.divinePunishmentDamage > 0) {
          const divineDamage = defender.passiveBonuses.divinePunishmentDamage;
          attacker.hp -= divineDamage;
          event.divinePunishment = true;
          event.divineDamage = divineDamage;
          event.attackerHp = Math.max(0, attacker.hp);
        }
      }
    }
    
    return event;
  }
  
  // Light Feet: Auto-dodge all basic attacks for first X seconds (Roguery passive)
  // Heavy Cloud prevents dodging
  if (defender.lightFeetEndTime > 0 && currentTime < defender.lightFeetEndTime && !defender.cannotDodgeBlock) {
    event.result = 'dodge';
    event.damage = 0;
    event.defenderHp = defender.hp;
    event.lightFeet = true;  // Mark as Light Feet dodge
    
    // Rebalance: Heal on dodge (Windmaster passive)
    if (defender.passiveBonuses?.rebalanceHeal > 0 && !defender.healingBlocked) {
      let healAmount = defender.passiveBonuses.rebalanceHeal;
      // Aegis: Healing stronger when below 20% HP
      if (defender.passiveBonuses?.aegisPercent > 0 && (defender.hp / defender.maxHp) < 0.2) {
        healAmount = Math.floor(healAmount * (1 + defender.passiveBonuses.aegisPercent / 100));
      }
      const oldHp = defender.hp;
      defender.hp = Math.min(defender.maxHp + defender.bonusHp, defender.hp + healAmount);
      const actualHeal = defender.hp - oldHp;
      if (actualHeal > 0) {
        event.rebalance = true;
        event.rebalanceHeal = actualHeal;
        event.defenderHp = defender.hp;
      }
    }
    
    // Counter-Attack: After dodging, gain +damage% for next attack (stacks)
    if (defender.passiveBonuses?.counterAttackPercent > 0) {
      defender.counterAttackBuff += defender.passiveBonuses.counterAttackPercent;
      event.counterAttackGained = defender.passiveBonuses.counterAttackPercent;
      event.counterAttackTotal = defender.counterAttackBuff;
    }
    
    // Riposte: Deal damage back when dodging
    if (defender.passiveBonuses?.ripostePercent > 0) {
      const riposteDamage = Math.floor(attacker.damage * (defender.passiveBonuses.ripostePercent / 100));
      if (riposteDamage > 0) {
        attacker.hp -= riposteDamage;
        event.riposte = true;
        event.riposteDamage = riposteDamage;
        event.attackerHp = Math.max(0, attacker.hp);
      }
    }
    
    // Unbalance: Deal AGI% damage when enemy dodges
    if (attacker.passiveBonuses?.unbalancePercent > 0) {
      const unbalanceDamage = Math.floor(attacker.agi * (attacker.passiveBonuses.unbalancePercent / 100));
      if (unbalanceDamage > 0) {
        defender.hp -= unbalanceDamage;
        event.unbalance = true;
        event.unbalanceDamage = unbalanceDamage;
        event.defenderHp = Math.max(0, defender.hp);
      }
    }
    
    return event;
  }
  
  // Shadow Form: Auto-dodge after X attacks received (Shadow passive)
  // Track attacks received and auto-dodge when threshold reached (Heavy Cloud prevents dodging)
  if (defender.shadowFormThreshold > 0 && !defender.cannotDodgeBlock) {
    defender.attacksReceived++;
    if (defender.attacksReceived >= defender.shadowFormThreshold) {
      defender.attacksReceived = 0;  // Reset counter
      event.result = 'dodge';
      event.damage = 0;
      event.defenderHp = defender.hp;
      event.shadowForm = true;  // Mark as Shadow Form dodge
      
      // Momentum: Reset consecutive hits on dodge (Arcane passive)
      if (attacker.consecutiveHits > 0) {
        attacker.consecutiveHits = 0;
        if (attacker.passiveBonuses?.momentumPercent > 0) {
          updateMomentumAttackSpeed(attacker);
          event.momentumReset = true;
        }
      }
      
      // Rebalance: Heal on dodge (Windmaster passive)
      if (defender.passiveBonuses?.rebalanceHeal > 0 && !defender.healingBlocked) {
        let healAmount = defender.passiveBonuses.rebalanceHeal;
        // Aegis: Healing stronger when below 20% HP
        if (defender.passiveBonuses?.aegisPercent > 0 && (defender.hp / defender.maxHp) < 0.2) {
          healAmount = Math.floor(healAmount * (1 + defender.passiveBonuses.aegisPercent / 100));
        }
        const oldHp = defender.hp;
        defender.hp = Math.min(defender.maxHp + defender.bonusHp, defender.hp + healAmount);
        const actualHeal = defender.hp - oldHp;
        if (actualHeal > 0) {
          event.rebalance = true;
          event.rebalanceHeal = actualHeal;
          event.defenderHp = defender.hp;
        }
      }
      
      // Counter-Attack: After dodging, gain +damage% for next attack (stacks)
      if (defender.passiveBonuses?.counterAttackPercent > 0) {
        defender.counterAttackBuff += defender.passiveBonuses.counterAttackPercent;
        event.counterAttackGained = defender.passiveBonuses.counterAttackPercent;
        event.counterAttackTotal = defender.counterAttackBuff;
      }
      
      // Riposte: Deal damage back when dodging
      if (defender.passiveBonuses?.ripostePercent > 0) {
        const riposteDamage = Math.floor(attacker.damage * (defender.passiveBonuses.ripostePercent / 100));
        if (riposteDamage > 0) {
          attacker.hp -= riposteDamage;
          event.riposte = true;
          event.riposteDamage = riposteDamage;
          event.attackerHp = Math.max(0, attacker.hp);
        }
      }
      
      // Unbalance: Deal AGI% damage when enemy dodges
      if (attacker.passiveBonuses?.unbalancePercent > 0) {
        const unbalanceDamage = Math.floor(attacker.agi * (attacker.passiveBonuses.unbalancePercent / 100));
        if (unbalanceDamage > 0) {
          defender.hp -= unbalanceDamage;
          event.unbalance = true;
          event.unbalanceDamage = unbalanceDamage;
          event.defenderHp = Math.max(0, defender.hp);
        }
      }
      
      return event;
    }
  }
  
  // Check for dodge (normal dodge chance) - Heavy Cloud prevents dodging
  if (!defender.cannotDodgeBlock && Math.random() < defender.dodgeChance) {
    event.result = 'dodge';
    event.damage = 0;
    event.defenderHp = defender.hp;
    
    // Momentum: Reset consecutive hits on dodge (Arcane passive)
    if (attacker.consecutiveHits > 0) {
      attacker.consecutiveHits = 0;
      if (attacker.passiveBonuses?.momentumPercent > 0) {
        updateMomentumAttackSpeed(attacker);
        event.momentumReset = true;
      }
    }
    
    // Rebalance: Heal on dodge (Windmaster passive)
    if (defender.passiveBonuses?.rebalanceHeal > 0 && !defender.healingBlocked) {
      let healAmount = defender.passiveBonuses.rebalanceHeal;
      // Aegis: Healing stronger when below 20% HP
      if (defender.passiveBonuses?.aegisPercent > 0 && (defender.hp / defender.maxHp) < 0.2) {
        healAmount = Math.floor(healAmount * (1 + defender.passiveBonuses.aegisPercent / 100));
      }
      const oldHp = defender.hp;
      defender.hp = Math.min(defender.maxHp + defender.bonusHp, defender.hp + healAmount);
      const actualHeal = defender.hp - oldHp;
      if (actualHeal > 0) {
        event.rebalance = true;
        event.rebalanceHeal = actualHeal;
        event.defenderHp = defender.hp;
      }
    }
    
    // Counter-Attack: After dodging, gain +damage% for next attack (stacks)
    if (defender.passiveBonuses?.counterAttackPercent > 0) {
      defender.counterAttackBuff += defender.passiveBonuses.counterAttackPercent;
      event.counterAttackGained = defender.passiveBonuses.counterAttackPercent;
      event.counterAttackTotal = defender.counterAttackBuff;
    }
    
    // Riposte: Deal damage back when dodging
    if (defender.passiveBonuses?.ripostePercent > 0) {
      const riposteDamage = Math.floor(attacker.damage * (defender.passiveBonuses.ripostePercent / 100));
      if (riposteDamage > 0) {
        attacker.hp -= riposteDamage;
        event.riposte = true;
        event.riposteDamage = riposteDamage;
        event.attackerHp = Math.max(0, attacker.hp);
      }
    }
    
    // Unbalance: Deal AGI% damage when enemy dodges
    if (attacker.passiveBonuses?.unbalancePercent > 0) {
      const unbalanceDamage = Math.floor(attacker.agi * (attacker.passiveBonuses.unbalancePercent / 100));
      if (unbalanceDamage > 0) {
        defender.hp -= unbalanceDamage;
        event.unbalance = true;
        event.unbalanceDamage = unbalanceDamage;
        event.defenderHp = Math.max(0, defender.hp);
      }
    }
    
    return event;
  }
  
  // Calculate base damage
  let damage = attacker.damage;
  
  // Grand Opening: First attack deals bonus damage (Roguery passive)
  let grandOpeningBonus = 0;
  if (!attacker.hasAttacked && attacker.passiveBonuses?.grandOpeningPercent > 0) {
    grandOpeningBonus = Math.floor(damage * (attacker.passiveBonuses.grandOpeningPercent / 100));
    damage += grandOpeningBonus;
    event.grandOpening = true;
    event.grandOpeningBonus = grandOpeningBonus;
  }
  attacker.hasAttacked = true;  // Mark first attack happened
  
  // Counter-Attack: Apply accumulated damage buff (consumed on attack)
  let counterAttackBonus = 0;
  if (attacker.counterAttackBuff > 0) {
    counterAttackBonus = Math.floor(damage * (attacker.counterAttackBuff / 100));
    damage += counterAttackBonus;
    event.counterAttack = true;
    event.counterAttackBonus = counterAttackBonus;
    event.counterAttackConsumed = attacker.counterAttackBuff;
    attacker.counterAttackBuff = 0;  // Consume buff
  }
  
  // Fatigue: +damage% if enemy below 20% stamina (Windmaster passive)
  if (attacker.passiveBonuses?.fatiguePercent > 0 && (defender.stamina / defender.maxStamina) < 0.2) {
    const fatigueBonus = Math.floor(damage * (attacker.passiveBonuses.fatiguePercent / 100));
    damage += fatigueBonus;
    event.fatigue = true;
    event.fatigueBonus = fatigueBonus;
  }
  
  // Banish: +damage% if enemy at 100% HP (Arcane passive)
  if (attacker.passiveBonuses?.banishPercent > 0 && defender.hp >= defender.maxHp) {
    const banishBonus = Math.floor(damage * (attacker.passiveBonuses.banishPercent / 100));
    damage += banishBonus;
    event.banish = true;
    event.banishBonus = banishBonus;
  }
  
  // Analyze: Guaranteed crit with bonus damage (Roguery active buff)
  let isCrit = false;
  if (attacker.analyzeBuff) {
    isCrit = true;  // Guaranteed crit
    const analyzeBonus = Math.floor(damage * (attacker.analyzeBonus / 100));
    damage += analyzeBonus;
    event.analyze = true;
    event.analyzeBonus = analyzeBonus;
    attacker.analyzeBuff = false;  // Consume buff
    attacker.analyzeBonus = 0;
  } else {
    // Normal crit check
    isCrit = Math.random() < attacker.critChance;
  }
  
  if (isCrit) {
    let critMultiplier = CONSTANTS.CRIT_MULTIPLIER;
    // Precision: Additional crit damage
    if (attacker.passiveBonuses?.critDamageBonus > 0) {
      critMultiplier += attacker.passiveBonuses.critDamageBonus / 100;
    }
    damage = Math.floor(damage * critMultiplier);
    event.isCrit = true;
    
    // Weakness: Each crit increases DEX by % until end of battle (Shadow passive)
    if (attacker.passiveBonuses?.weaknessPercent > 0) {
      const dexGain = Math.floor(attacker.baseDex * (attacker.passiveBonuses.weaknessPercent / 100));
      attacker.dexBuff += dexGain;
      attacker.dex = attacker.baseDex + attacker.dexBuff;
      attacker.critChance = calculateCritChance(attacker.dex);
      attacker.dodgeChance = calculateDodgeChance(attacker.dex);
      event.weakness = true;
      event.weaknessDexGain = dexGain;
      event.newDex = attacker.dex;
    }
  }
  
  // Calculate effective block chance
  let effectiveBlockChance = defender.blockChance;
  
  // Concentration: +block% above 70% HP (Windmaster passive)
  if (defender.passiveBonuses?.concentrationPercent > 0 && (defender.hp / defender.maxHp) > 0.7) {
    effectiveBlockChance += defender.passiveBonuses.concentrationPercent / 100;
  }
  
  // Heavy Cloud prevents blocking
  if (defender.cannotDodgeBlock) {
    effectiveBlockChance = 0;
  }
  
  // Check for block
  const isBlocked = Math.random() < effectiveBlockChance;
  if (isBlocked) {
    damage = Math.floor(damage * (1 - CONSTANTS.BLOCK_MITIGATION));
    event.isBlocked = true;
    
    // Rebalance: Heal on block (Windmaster passive)
    if (defender.passiveBonuses?.rebalanceHeal > 0 && !defender.healingBlocked) {
      let healAmount = defender.passiveBonuses.rebalanceHeal;
      // Aegis: Healing stronger when below 20% HP
      if (defender.passiveBonuses?.aegisPercent > 0 && (defender.hp / defender.maxHp) < 0.2) {
        healAmount = Math.floor(healAmount * (1 + defender.passiveBonuses.aegisPercent / 100));
      }
      const oldHp = defender.hp;
      defender.hp = Math.min(defender.maxHp + defender.bonusHp, defender.hp + healAmount);
      const actualHeal = defender.hp - oldHp;
      if (actualHeal > 0) {
        event.rebalance = true;
        event.rebalanceHeal = actualHeal;
      }
    }
    
    // Poise: Heal on block (Defense passive)
    if (defender.passiveBonuses?.poisePercent > 0 && !defender.healingBlocked) {
      let healAmount = Math.floor(defender.maxHp * (defender.passiveBonuses.poisePercent / 100));
      // Aegis: Healing stronger when below 20% HP
      if (defender.passiveBonuses?.aegisPercent > 0 && (defender.hp / defender.maxHp) < 0.2) {
        healAmount = Math.floor(healAmount * (1 + defender.passiveBonuses.aegisPercent / 100));
      }
      const oldHp = defender.hp;
      defender.hp = Math.min(defender.maxHp + defender.bonusHp, defender.hp + healAmount);
      const actualHeal = defender.hp - oldHp;
      if (actualHeal > 0) {
        event.poise = true;
        event.poiseHeal = actualHeal;
        
        // Divine Punishment: Deal true damage to attacker when defender heals
        if (defender.passiveBonuses?.divinePunishmentDamage > 0) {
          const divineDamage = defender.passiveBonuses.divinePunishmentDamage;
          attacker.hp -= divineDamage;
          event.divinePunishment = true;
          event.divineDamage = divineDamage;
          event.attackerHp = Math.max(0, attacker.hp);
        }
      }
    }
    
    // Parry: Block has chance to stun attacker (Defense passive)
    if (defender.passiveBonuses?.parryPercent > 0 && Math.random() * 100 < defender.passiveBonuses.parryPercent) {
      attacker.isStunned = true;
      attacker.stunEndTime = currentTime + 1000; // 1 second stun
      event.parry = true;
      event.parryStunDuration = 1;
    }
    
    // Unbalance: Deal AGI% damage when enemy blocks
    if (attacker.passiveBonuses?.unbalancePercent > 0) {
      const unbalanceDamage = Math.floor(attacker.agi * (attacker.passiveBonuses.unbalancePercent / 100));
      if (unbalanceDamage > 0) {
        defender.hp -= unbalanceDamage;
        event.unbalance = true;
        event.unbalanceDamage = unbalanceDamage;
      }
    }
  }
  
  // Apply armor mitigation
  let armorMitigation = calculateArmorMitigation(defender.armor || 0, attacker.level);
  
  // Rust: Reduce enemy armor mitigation (Vitality passive)
  if (attacker.passiveBonuses?.rustPercent > 0 && armorMitigation > 0) {
    const originalMitigation = armorMitigation;
    armorMitigation = armorMitigation * (1 - attacker.passiveBonuses.rustPercent / 100);
    event.rust = true;
    event.rustReduction = Math.round((originalMitigation - armorMitigation) * 100);
  }
  
  if (armorMitigation > 0) {
    damage = Math.floor(damage * (1 - armorMitigation));
    event.armorMitigation = Math.round(armorMitigation * 100);
  }
  
  // Bloodletting: % max HP true damage
  if (attacker.passiveBonuses?.percentMaxHpDamage > 0) {
    const bleedDamage = Math.floor(defender.maxHp * (attacker.passiveBonuses.percentMaxHpDamage / 100));
    damage += bleedDamage;
    event.bloodletting = bleedDamage;
  }
  
  // Minimum damage
  damage = Math.max(1, damage);
  
  // Cushion: Reduce basic attack damage taken by % (Windmaster passive)
  if (defender.passiveBonuses?.cushionPercent > 0) {
    const cushionReduction = Math.floor(damage * (defender.passiveBonuses.cushionPercent / 100));
    damage = Math.max(1, damage - cushionReduction);
    event.cushion = true;
    event.cushionReduction = cushionReduction;
  }
  
  // Multi-Strike: Apply extra hits (Roguery active buff)
  let totalDamage = damage;
  let extraHits = 0;
  if (attacker.multiStrikeBuff > 0) {
    extraHits = attacker.multiStrikeBuff;
    // Extra hits deal same damage each
    for (let i = 0; i < extraHits; i++) {
      totalDamage += damage;
    }
    event.multiStrike = true;
    event.multiStrikeHits = extraHits;
    event.multiStrikeDamagePerHit = damage;
    attacker.multiStrikeBuff = 0;  // Consume buff
  }
  
  // Apply total damage (original + multi-strike extra)
  defender.hp -= totalDamage;
  
  event.result = 'hit';
  event.damage = totalDamage;
  event.defenderHp = Math.max(0, defender.hp);
  event.defenderMaxHp = defender.maxHp;
  
  // Momentum: Track consecutive hits and update attack speed (Arcane passive)
  attacker.consecutiveHits++;
  if (attacker.passiveBonuses?.momentumPercent > 0) {
    updateMomentumAttackSpeed(attacker);
    event.momentum = true;
    event.momentumStacks = attacker.consecutiveHits;
  }
  
  // Spikes: Deal fixed damage back when hit (Defense passive) - procs for each hit
  if (defender.passiveBonuses?.spikesDamage > 0) {
    const spikesDamageTotal = defender.passiveBonuses.spikesDamage * (1 + extraHits);
    attacker.hp -= spikesDamageTotal;
    event.spikes = true;
    event.spikesDamage = spikesDamageTotal;
    event.attackerHp = Math.max(0, attacker.hp);
  }
  
  // Poisonous Blade: Chance to apply poison on hit (Roguery passive)
  if (attacker.passiveBonuses?.poisonousBladeChance > 0) {
    // Roll once for each hit (1 base + extra hits from multi-strike)
    const totalHits = 1 + extraHits;
    let poisonApplied = 0;
    for (let i = 0; i < totalHits; i++) {
      if (Math.random() * 100 < attacker.passiveBonuses.poisonousBladeChance) {
        defender.poisonStacks++;
        poisonApplied++;
      }
    }
    if (poisonApplied > 0) {
      event.poisonApplied = poisonApplied;
      event.defenderPoisonStacks = defender.poisonStacks;
    }
  }
  
  // Life Steal: Heal % of damage dealt (Vitality passive)
  if (attacker.passiveBonuses?.lifeStealPercent > 0 && !attacker.healingBlocked) {
    const lifeStealHeal = Math.floor(totalDamage * (attacker.passiveBonuses.lifeStealPercent / 100));
    if (lifeStealHeal > 0) {
      const oldHp = attacker.hp;
      attacker.hp = Math.min(attacker.maxHp + attacker.bonusHp, attacker.hp + lifeStealHeal);
      const actualHeal = attacker.hp - oldHp;
      if (actualHeal > 0) {
        event.lifeSteal = true;
        event.lifeStealHeal = actualHeal;
        event.attackerHp = attacker.hp;
        
        // Divine Punishment: Deal true damage to enemy when healed
        if (attacker.passiveBonuses?.divinePunishmentDamage > 0) {
          const divineDamage = attacker.passiveBonuses.divinePunishmentDamage;
          defender.hp -= divineDamage;
          event.divinePunishment = true;
          event.divineDamage = (event.divineDamage || 0) + divineDamage;
          event.defenderHp = Math.max(0, defender.hp);
        }
      }
    }
  }
  
  // Track attacker stamina if player
  if (attacker.isPlayer) {
    event.attackerStamina = attacker.stamina;
  }
  
  // Punish: Chance to strike twice (this is in addition to Multi-Strike)
  if (attacker.passiveBonuses?.doubleStrikeChance > 0 && Math.random() * 100 < attacker.passiveBonuses.doubleStrikeChance) {
    let secondDamage = attacker.damage;
    secondDamage = Math.floor(secondDamage * (1 - armorMitigation));
    secondDamage = Math.max(1, secondDamage);
    defender.hp -= secondDamage;
    event.doubleStrike = true;
    event.secondDamage = secondDamage;
    event.defenderHp = Math.max(0, defender.hp);
    
    // Spikes also procs on double strike
    if (defender.passiveBonuses?.spikesDamage > 0) {
      attacker.hp -= defender.passiveBonuses.spikesDamage;
      event.spikes = true;
      event.spikesDamage = (event.spikesDamage || 0) + defender.passiveBonuses.spikesDamage;
      event.attackerHp = Math.max(0, attacker.hp);
    }
    
    // Poisonous Blade: Also roll for double strike hit
    if (attacker.passiveBonuses?.poisonousBladeChance > 0) {
      if (Math.random() * 100 < attacker.passiveBonuses.poisonousBladeChance) {
        defender.poisonStacks++;
        event.poisonApplied = (event.poisonApplied || 0) + 1;
        event.defenderPoisonStacks = defender.poisonStacks;
      }
    }
    
    // Life Steal also procs on double strike
    if (attacker.passiveBonuses?.lifeStealPercent > 0 && !attacker.healingBlocked) {
      const lifeStealHeal = Math.floor(secondDamage * (attacker.passiveBonuses.lifeStealPercent / 100));
      if (lifeStealHeal > 0) {
        const oldHp = attacker.hp;
        attacker.hp = Math.min(attacker.maxHp + attacker.bonusHp, attacker.hp + lifeStealHeal);
        const actualHeal = attacker.hp - oldHp;
        if (actualHeal > 0) {
          event.lifeSteal = true;
          event.lifeStealHeal = (event.lifeStealHeal || 0) + actualHeal;
          event.attackerHp = attacker.hp;
          
          // Divine Punishment also procs on double strike heal
          if (attacker.passiveBonuses?.divinePunishmentDamage > 0) {
            const divineDamage = attacker.passiveBonuses.divinePunishmentDamage;
            defender.hp -= divineDamage;
            event.divinePunishment = true;
            event.divineDamage = (event.divineDamage || 0) + divineDamage;
            event.defenderHp = Math.max(0, defender.hp);
          }
        }
      }
    }
  }
  
  return event;
}
/**
 * Calculate gold reward from range (legacy, kept for compatibility)
 */
function calculateGoldReward(goldReward) {
  if (!goldReward) return 0;
  if (Array.isArray(goldReward)) {
    const min = goldReward[0] || 0;
    const max = goldReward[1] || min;
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
  return goldReward;
}

/**
 * Rarity priority map — higher number = rarer.
 * Used to decide which drop wins when multiple independent rolls succeed.
 */
const RARITY_PRIORITY = {
  normal:   0,
  common:   1,
  uncommon: 2,
  rare:     3,
  epic:     4,
  legendary: 5
};

/**
 * Calculate item drop from mob's drop table.
 *
 * Each entry is rolled **independently** (chance is NOT cumulative / does NOT
 * need to sum to 100).  If several drops succeed in the same kill, only the
 * **rarest** one is awarded.  Ties in rarity are broken by the lowest chance
 * value (i.e. the harder-to-get item wins).
 *
 * Drop format:
 *   { itemId: string, chance: number, rarity?: string }
 *
 * `rarity` is optional — if omitted the item is treated as "common".
 *
 * @param {Array} drops - Array of {itemId, chance, rarity?}
 * @param {Function} [getItemDef] - Optional helper that returns an item
 *   definition so we can read rarity from the item file when it isn't
 *   specified in the drop entry.
 * @returns {string|null} - Item ID that dropped, or null if nothing dropped
 */
function calculateItemDrop(drops, getItemDef) {
  if (!drops || !Array.isArray(drops) || drops.length === 0) {
    return null;
  }

  // Roll independently for every entry and collect successes
  const successes = [];
  for (const drop of drops) {
    const roll = Math.random() * 100;  // 0–99.999…
    if (roll < drop.chance) {
      // Determine rarity: explicit on drop entry → from item definition → fallback "common"
      let rarity = drop.rarity;
      if (!rarity && typeof getItemDef === 'function') {
        const def = getItemDef(drop.itemId);
        if (def) rarity = def.rarity;
      }
      rarity = (rarity || 'common').toLowerCase();

      successes.push({
        itemId: drop.itemId,
        rarity,
        priority: RARITY_PRIORITY[rarity] ?? 1, // default to common priority
        chance: drop.chance
      });
    }
  }

  if (successes.length === 0) {
    return null;
  }

  // Sort: highest rarity first, then lowest chance (rarer within same tier)
  successes.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return a.chance - b.chance; // lower chance = rarer
  });

  return successes[0].itemId;
}

// ===========================================
// COMBAT STATE MANAGEMENT
// ===========================================

/**
 * Simulate a PvP battle between two players
 * The "attacker" is the active player, "defender" is treated like a mob
 * @param {Object} attacker - Attacker player stats
 * @param {Object} defender - Defender player stats (treated as enemy)
 * @param {Object} attackerSkills - Attacker's skills
 * @param {Object} defenderSkills - Defender's skills (for stat calculation, not used actively in mock)
 * @returns {Object} Battle result
 */
function simulatePvPBattle(attacker, defender, attackerSkills = null, defenderSkills = null) {
  // For PvP mock, treat defender like a mob with player stats
  // The defender doesn't use skills actively (mock fight)
  
  // Build defender as a "mob" object
  const defenderAsMob = {
    id: defender.id || 'pvp_target',
    name: defender.name || 'Player',
    hp: defender.hp || defender.maxHp,
    maxHp: defender.maxHp,
    damage: defender.damage || (defender.str || 1) * CONSTANTS.DAMAGE_PER_STR,
    defense: defender.defense || defender.def || 0,
    level: defender.level || 1,
    moveSpeed: calculateAttackCooldown(defender.agi || 1),
    str: defender.str || 1,
    agi: defender.agi || 1,
    dex: defender.dex || 1,
    int: defender.int || 1,
    def: defender.def || 0,
    expReward: 0, // No XP from PvP mock
    drops: [] // No drops from PvP mock
  };
  
  // Use the regular simulateBattle function
  return simulateBattle(attacker, defenderAsMob, attackerSkills);
}

/**
 * Start a combat for a player
 */
function startCombat(playerId, battleResult) {
  activeCombats.set(playerId, {
    startTime: Date.now(),
    battleResult: battleResult,
    eventIndex: 0
  });
}

/**
 * Check if player is in combat
 */
function isInCombat(playerId) {
  return activeCombats.has(playerId);
}

/**
 * End combat for a player
 */
function endCombat(playerId) {
  activeCombats.delete(playerId);
}

/**
 * Get active combat state
 */
function getCombat(playerId) {
  return activeCombats.get(playerId);
}

module.exports = {
  simulateBattle,
  simulatePvPBattle,
  startCombat,
  isInCombat,
  endCombat,
  getCombat,
  calculateAttackCooldown,
  calculateCritChance,
  calculateDodgeChance,
  calculateBlockChance,
  calculateItemDrop
};
