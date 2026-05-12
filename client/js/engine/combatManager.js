/**
 * UMBRA ONLINE - Combat Manager (Client)
 * Handles combat replay animations and UI updates
 */

const CombatManager = (function() {
  // Combat state
  let inCombat = false;
  let currentCombat = null;
  let combatEvents = [];
  let currentEventIndex = 0;
  let combatStartTime = 0;
  let combatMobId = null;
  
  // PvP state
  let isPvPCombat = false;
  let pvpTargetId = null;
  let pvpTargetData = null;
  
  // Boss combat state
  let isBossCombat = false;
  let bossCombatId = null;
  
  // Safety timeout to unlock player if server end message never arrives
  let combatSafetyTimeout = null;
  
  // Damage numbers queue
  let damageNumbers = [];
  
  // Combat result callback
  let onCombatEndCallback = null;
  
  /**
   * Helper: Get enemy position (boss, PvP target, or mob)
   */
  function getEnemyPosition() {
    if (isBossCombat && bossCombatId && typeof BossManager !== 'undefined') {
      const boss = BossManager.getBoss(bossCombatId);
      return boss ? { x: boss.x, y: boss.y } : null;
    }
    if (isPvPCombat && pvpTargetData) {
      return { x: pvpTargetData.x, y: pvpTargetData.y };
    }
    const mob = MobManager.getMob(combatMobId);
    return mob ? { x: mob.x, y: mob.y } : null;
  }
  
  /**
   * Helper: Update enemy HP display (boss, PvP target, or mob)
   */
  function updateEnemyHp(hp, maxHp) {
    if (isBossCombat && bossCombatId && typeof BossManager !== 'undefined') {
      BossManager.updateBossHp(bossCombatId, hp, maxHp);
    } else if (isPvPCombat && pvpTargetData) {
      pvpTargetData.hp = hp;
      GhostPlayers.updateGhostHp(pvpTargetId, hp, maxHp || pvpTargetData.maxHp);
    } else {
      MobManager.updateMobHp(combatMobId, hp, maxHp);
    }
  }
  
  /**
   * Initialize combat manager
   */
  function init() {
    console.log('[CombatManager] Initialized');
  }
  
  /**
   * Start combat replay
   * @param {Object} combatData - Combat data from server
   */
  function startCombat(combatData) {
    inCombat = true;
    isPvPCombat = false;
    pvpTargetId = null;
    pvpTargetData = null;
    currentCombat = combatData;
    combatEvents = combatData.events || [];
    currentEventIndex = 0;
    combatStartTime = performance.now();
    combatMobId = combatData.mobId;
    
    // Lock player movement
    Player.setInCombat(true, combatMobId);
    
    // Log combat start
    GameUI.logCombat(`Battle started with ${combatData.mob.name}!`);
    
    console.log(`[CombatManager] Starting combat replay: ${combatEvents.length} events over ${combatData.duration}ms`);
    
    // Debug: Log ALL events with their timestamps to see timing
    console.log(`[CombatManager] Full event timeline:`);
    for (const e of combatEvents) {
      if (e.type === 'skill') {
        console.log(`  ${e.time}ms: SKILL "${e.skillName}" (${e.result})`);
      } else if (e.type === 'attack') {
        console.log(`  ${e.time}ms: ATTACK by ${e.attackerName} -> ${e.damage || 0} dmg`);
      } else if (e.type === 'battle_start') {
        console.log(`  ${e.time}ms: BATTLE_START - actives: ${e.actives?.map(a => a.name).join(', ') || 'none'}`);
        console.log(`    Attack cooldown: ${e.attackCooldown}ms`);
        if (e.skillDebug) {
          console.log(`    Skill debug info:`);
          e.skillDebug.forEach(s => {
            console.log(`      - ${s.name}: initialCD=${s.initialCooldown}, currentCD=${s.currentCooldown}, ready=${s.ready}, cost=${s.cost}`);
          });
        }
      } else if (e.type === 'battle_end') {
        console.log(`  ${e.time}ms: BATTLE_END`);
      } else if (e.type === 'debug') {
        console.log(`  ${e.time}ms: DEBUG - ${e.message}`);
      } else {
        console.log(`  ${e.time}ms: ${e.type}`);
      }
    }
  }
  
  /**
   * Start PvP combat replay
   * @param {Object} pvpData - PvP combat data from server
   */
  function startPvPCombat(pvpData) {
    console.log('[CombatManager] startPvPCombat called');
    console.log('[CombatManager] pvpData:', pvpData);
    
    inCombat = true;
    isPvPCombat = true;
    pvpTargetId = pvpData.targetPlayerId;
    pvpTargetData = pvpData.target;
    currentCombat = pvpData;
    combatEvents = pvpData.events || [];
    currentEventIndex = 0;
    combatStartTime = performance.now();
    combatMobId = null; // No mob in PvP
    
    // Track boss combat state
    isBossCombat = !!pvpData.isBossCombat;
    bossCombatId = pvpData.bossId || null;
    
    // If boss combat, freeze the boss in place
    if (isBossCombat && bossCombatId && typeof BossManager !== 'undefined') {
      BossManager.setBossInCombat(bossCombatId, true);
    }
    
    console.log('[CombatManager] Combat state set - inCombat:', inCombat, 'events:', combatEvents.length, 'startTime:', combatStartTime, 'isBoss:', isBossCombat);
    
    // Lock player movement
    Player.setInCombat(true, null);
    console.log('[CombatManager] Player locked in combat:', Player.isInCombat());
    
    // Lock ghost movement (only for actual PvP, not boss combat)
    if (!isBossCombat) {
      GhostPlayers.setGhostLocked(pvpTargetId, true);
    }
    
    // Log combat start
    const combatLabel = isBossCombat ? '👑 Boss battle' : '⚔️ PvP battle';
    GameUI.logCombat(`${combatLabel} started with ${pvpData.target.name}!`);
    
    console.log(`[CombatManager] Starting PvP combat replay: ${combatEvents.length} events over ${pvpData.duration}ms`);
    
    // Debug: Log ALL events with their timestamps to see timing
    console.log(`[CombatManager] PvP event timeline:`);
    for (const e of combatEvents) {
      if (e.type === 'skill') {
        console.log(`  ${e.time}ms: SKILL "${e.skillName}" (${e.result})`);
      } else if (e.type === 'attack') {
        console.log(`  ${e.time}ms: ATTACK by ${e.attackerName} -> ${e.damage || 0} dmg (result: ${e.result})`);
      } else if (e.type === 'battle_start') {
        console.log(`  ${e.time}ms: BATTLE_START`);
      } else if (e.type === 'battle_end') {
        console.log(`  ${e.time}ms: BATTLE_END`);
      } else {
        console.log(`  ${e.time}ms: ${e.type}`);
      }
    }
  }
  
  /**
   * Update combat - process events based on elapsed time
   * @param {number} deltaTime - Time since last frame
   */
  function update(deltaTime) {
    // Always update damage numbers, even when not in combat
    updateDamageNumbers(deltaTime);
    
    if (!inCombat) {
      return;
    }
    
    if (combatEvents.length === 0) {
      console.warn('[CombatManager] In combat but no events!');
      return;
    }
    
    const elapsed = performance.now() - combatStartTime;
    
    // Debug log every frame during combat
    if (currentEventIndex < combatEvents.length) {
      const nextEvent = combatEvents[currentEventIndex];
      if (Math.floor(elapsed) % 500 === 0) { // Log every ~500ms
        console.log(`[CombatManager] Combat active - elapsed: ${Math.round(elapsed)}ms, next event at: ${nextEvent.time}ms, isPvP: ${isPvPCombat}`);
      }
    }
    
    // Process all events up to current time
    while (currentEventIndex < combatEvents.length) {
      const event = combatEvents[currentEventIndex];
      
      if (event.time <= elapsed) {
        console.log(`[CombatManager] Processing event ${currentEventIndex}: ${event.type} at ${event.time}ms (elapsed: ${Math.round(elapsed)}ms)`);
        processEvent(event);
        currentEventIndex++;
      } else {
        break;
      }
    }
  }
  
  /**
   * Process a combat event
   */
  function processEvent(event) {
    console.log(`[CombatManager] processEvent called with type: ${event.type}, isPvP: ${isPvPCombat}`);
    
    switch (event.type) {
      case 'battle_start':
        processBattleStart(event);
        break;
        
      case 'attack':
        processAttackEvent(event);
        break;
      
      case 'skill':
        processSkillEvent(event);
        break;
      
      case 'status_end':
        processStatusEndEvent(event);
        break;
      
      case 'passive_proc':
        processPassiveProcEvent(event);
        break;
        
      case 'battle_end':
        processBattleEnd(event);
        break;
      
      case 'debug':
        // Debug events - log to console with timestamp
        console.log(`[Combat DEBUG @ ${event.time}ms] ${event.message}`);
        break;
        
      default:
        console.warn(`[CombatManager] Unknown event type: ${event.type}`);
    }
  }
  
  /**
   * Process battle start event - log active skills and set initial HP
   */
  function processBattleStart(event) {
    // Update HP display with potentially overflowed HP (Mana Shield, Giant etc)
    if (event.player) {
      console.log(`[Combat] Battle start - HP: ${event.player.hp}/${event.player.maxHp}, bonusHp: ${event.player.bonusHp}`);
      GameUI.updateHp(event.player.hp, event.player.maxHp);
      
      // Log if there's bonus HP from passives like Mana Shield, Giant
      if (event.player.bonusHp > 0) {
        GameUI.logCombat(`🔮 Overflow HP: +${event.player.bonusHp} bonus HP`);
      }
    }
    
    if (event.passives && event.passives.length > 0) {
      const passiveNames = event.passives.map(p => `${p.name} Lv${p.level}`).join(', ');
      GameUI.logCombat(`Passive skills: ${passiveNames}`);
    }
    if (event.actives && event.actives.length > 0) {
      const activeNames = event.actives.map(a => `${a.name} Lv${a.level}`).join(', ');
      GameUI.logCombat(`Active skills: ${activeNames}`);
    }
    
    // Debug: Log detailed skill info to console
    if (event.skillDebug && event.skillDebug.length > 0) {
      console.log('[Combat] === EQUIPPED ACTIVE SKILLS STATE ===');
      for (const s of event.skillDebug) {
        console.log(`  ${s.name} (id=${s.id}, effect=${s.effect}):`);
        console.log(`    initialCD=${s.initialCooldown}ms, cooldown=${s.cooldown}ms`);
        console.log(`    currentCD=${s.currentCooldown}ms, ready=${s.ready}`);
        console.log(`    staminaCost=${s.cost}`);
      }
      console.log(`  Player stamina: ${event.player.stamina}/${event.player.maxStamina}`);
      console.log('[Combat] =====================================');
    } else {
      console.log('[Combat] No active skills equipped (skillDebug is empty or missing)');
    }
  }
  
  /**
   * Process an attack event
   */
  function processAttackEvent(event) {
    console.log(`[CombatManager] processAttackEvent FULL EVENT:`, JSON.stringify(event, null, 2));
    
    const isPlayerAttack = event.isPlayerAttack;
    const attackerName = event.attackerName;
    const defenderName = event.defenderName;
    
    console.log(`[CombatManager] processAttackEvent: isPlayerAttack=${isPlayerAttack}, isPvPCombat=${isPvPCombat}, damage=${event.damage}`);
    
    // Determine where to show damage number
    let targetX, targetY;
    if (isPlayerAttack) {
      // Damage on enemy (mob, PvP target, or boss)
      const enemyPos = getEnemyPosition();
      if (enemyPos) {
        targetX = enemyPos.x;
        targetY = enemyPos.y;
      }
    } else {
      // Damage on player
      targetX = Player.getX();
      targetY = Player.getY();
    }
    
    // Create log message and damage number based on result
    let logMsg = '';
    let damageColor = '#ffffff';
    
    if (event.result === 'dodge') {
      // Check if this was a Light Feet auto-dodge
      if (event.lightFeet) {
        logMsg = isPlayerAttack 
          ? `🦶 ${defenderName}'s Light Feet auto-dodges!`
          : `🦶 Light Feet auto-dodges ${attackerName}'s attack!`;
      } else {
        logMsg = isPlayerAttack 
          ? `${defenderName} dodged your attack!`
          : `You dodged ${attackerName}'s attack!`;
      }
      damageColor = '#88ccff';
      addDamageNumber(targetX, targetY, 'DODGE', damageColor);
      
      // Handle Counter-Attack buff gained from dodge
      if (event.counterAttackGained) {
        const counterMsg = isPlayerAttack
          ? `↪️ ${defenderName} gains +${event.counterAttackGained}% Counter-Attack (total: ${event.counterAttackTotal}%)`
          : `↪️ You gain +${event.counterAttackGained}% Counter-Attack (total: ${event.counterAttackTotal}%)`;
        GameUI.logCombat(counterMsg);
      }
    } else if (event.result === 'hit') {
      let dmgText = event.damage.toString();
      
      if (event.isCrit) {
        damageColor = '#ffcc00';
        dmgText += '!';
        logMsg = isPlayerAttack
          ? `CRIT! You hit ${defenderName} for ${event.damage} damage!`
          : `CRIT! ${attackerName} hits you for ${event.damage} damage!`;
      } else if (event.isBlocked) {
        damageColor = '#aaaaaa';
        logMsg = isPlayerAttack
          ? `${defenderName} blocked! You deal ${event.damage} damage.`
          : `You blocked! ${attackerName} deals ${event.damage} damage.`;
      } else {
        damageColor = isPlayerAttack ? '#ff4444' : '#ff8888';
        logMsg = isPlayerAttack
          ? `You hit ${defenderName} for ${event.damage} damage.`
          : `${attackerName} hits you for ${event.damage} damage.`;
      }
      
      addDamageNumber(targetX, targetY, dmgText, damageColor, event.isCrit);
      
      // Handle Bloodletting bonus damage
      if (event.bloodletting) {
        GameUI.logCombat(`Bloodletting deals ${event.bloodletting} bonus damage!`);
      }
      
      // Handle Punish (double strike)
      if (event.doubleStrike) {
        setTimeout(() => {
          addDamageNumber(targetX, targetY + 0.3, event.secondDamage.toString(), '#ff6666', false);
        }, 150);
        GameUI.logCombat(`Punish! Second strike deals ${event.secondDamage} damage!`);
      }
      
      // Handle Life Steal (heal from damage)
      if (event.lifeSteal && event.lifeStealHeal) {
        const playerX = Player.getX();
        const playerY = Player.getY();
        setTimeout(() => {
          addDamageNumber(playerX, playerY, `+${event.lifeStealHeal}`, '#44ff88', false);
        }, 200);
        GameUI.logCombat(`🧛 Life Steal heals for ${event.lifeStealHeal} HP!`);
        
        // Update player HP with life steal heal
        if (event.attackerHp !== undefined && isPlayerAttack) {
          const charData = Game.getCharacterData();
          GameUI.updateHp(event.attackerHp, charData?.maxHp);
        }
      }
      
      // Handle Divine Punishment (true damage when healed via Life Steal)
      if (event.divinePunishment && event.divineDamage) {
        setTimeout(() => {
          addDamageNumber(targetX, targetY + 0.4, event.divineDamage.toString(), '#ffff44', true);
        }, 350);
        GameUI.logCombat(`⚡ Divine Punishment deals ${event.divineDamage} true damage!`);
      }
      
      // Handle Rust (armor penetration)
      if (event.rust && event.rustReduction) {
        GameUI.logCombat(`🔧 Rust reduces armor mitigation by ${event.rustReduction}%!`);
      }
      
      // Handle Grand Opening (first attack bonus) - Roguery
      if (event.grandOpening && event.grandOpeningBonus) {
        GameUI.logCombat(`🎭 Grand Opening! +${event.grandOpeningBonus} bonus damage!`);
      }
      
      // Handle Counter-Attack buff consumed - Roguery
      if (event.counterAttack && event.counterAttackBonus) {
        GameUI.logCombat(`↪️ Counter-Attack consumed (+${event.counterAttackConsumed}%) for +${event.counterAttackBonus} bonus damage!`);
      }
      
      // Handle Analyze (guaranteed crit + bonus) - Roguery
      if (event.analyze && event.analyzeBonus) {
        GameUI.logCombat(`🔍 Analyze! Guaranteed crit +${event.analyzeBonus} bonus damage!`);
      }
      
      // Handle Multi-Strike (extra hits) - Roguery
      if (event.multiStrike && event.multiStrikeHits) {
        GameUI.logCombat(`✨ Multi-Strike! ${event.multiStrikeHits} extra hits (${event.multiStrikeDamagePerHit} each)!`);
        // Show extra hit damage numbers
        for (let i = 0; i < event.multiStrikeHits; i++) {
          setTimeout(() => {
            addDamageNumber(targetX + (Math.random() * 0.4 - 0.2), targetY + (Math.random() * 0.4 - 0.2), 
              event.multiStrikeDamagePerHit.toString(), '#ff66ff', false);
          }, 100 + (i * 100));
        }
      }
      
      // Handle Poisonous Blade - Roguery
      if (event.poisonApplied && event.poisonApplied > 0) {
        GameUI.logCombat(`🗡️ Poisonous Blade! Applied ${event.poisonApplied} poison stack(s) (total: ${event.defenderPoisonStacks})`);
        setTimeout(() => {
          addDamageNumber(targetX, targetY + 0.3, `+${event.poisonApplied} POISON`, '#44ff44', false);
        }, 200);
      }
    }
    
    // Handle Riposte (damage back on dodge)
    if (event.riposte && event.riposteDamage) {
      const riposteTargetX = isPlayerAttack ? Player.getX() : targetX;
      const riposteTargetY = isPlayerAttack ? Player.getY() : targetY;
      setTimeout(() => {
        addDamageNumber(riposteTargetX, riposteTargetY, event.riposteDamage.toString(), '#ff88ff', false);
      }, 200);
      const riposteMsg = isPlayerAttack
        ? `${defenderName} ripostes for ${event.riposteDamage} damage!`
        : `You riposte for ${event.riposteDamage} damage!`;
      GameUI.logCombat(riposteMsg);
      
      // Update player HP if riposted against us
      if (isPlayerAttack && event.attackerHp !== undefined) {
        const charData = Game.getCharacterData();
        GameUI.updateHp(event.attackerHp, charData?.maxHp);
      }
    }
    
    // Handle Unbalance (damage on dodge/block)
    if (event.unbalance && event.unbalanceDamage) {
      setTimeout(() => {
        addDamageNumber(targetX, targetY + 0.2, event.unbalanceDamage.toString(), '#88ffff', false);
      }, 150);
      GameUI.logCombat(`Unbalance deals ${event.unbalanceDamage} damage!`);
    }
    
    // Handle Spikes (damage back when hit)
    if (event.spikes && event.spikesDamage) {
      const spikesTargetX = isPlayerAttack ? targetX : Player.getX();
      const spikesTargetY = isPlayerAttack ? targetY : Player.getY();
      setTimeout(() => {
        addDamageNumber(spikesTargetX, spikesTargetY + 0.2, event.spikesDamage.toString(), '#ff8844', false);
      }, 200);
      const spikesMsg = isPlayerAttack
        ? `📌 ${defenderName}'s Spikes deal ${event.spikesDamage} damage back!`
        : `📌 Your Spikes deal ${event.spikesDamage} damage back!`;
      GameUI.logCombat(spikesMsg);
      
      // Update attacker HP display (player if mob attacked us)
      if (!isPlayerAttack && event.attackerHp !== undefined) {
        updateEnemyHp(event.attackerHp);
      }
    }
    
    // Handle Poise (heal on block) 
    if (event.poise && event.poiseHeal) {
      const poiseTargetX = isPlayerAttack ? targetX : Player.getX();
      const poiseTargetY = isPlayerAttack ? targetY : Player.getY();
      setTimeout(() => {
        addDamageNumber(poiseTargetX, poiseTargetY - 0.3, `+${event.poiseHeal}`, '#44ff88', false);
      }, 250);
      const poiseMsg = isPlayerAttack
        ? `🧘 ${defenderName} heals ${event.poiseHeal} HP from Poise!`
        : `🧘 You heal ${event.poiseHeal} HP from Poise!`;
      GameUI.logCombat(poiseMsg);
      
      // If player blocked, update player HP with Poise heal
      if (!isPlayerAttack && event.defenderHp !== undefined) {
        GameUI.updateHp(event.defenderHp, event.defenderMaxHp);
      }
      
      // Handle Divine Punishment from Poise heal
      if (event.divinePunishment && event.divineDamage) {
        setTimeout(() => {
          const divineTargetX = isPlayerAttack ? Player.getX() : targetX;
          const divineTargetY = isPlayerAttack ? Player.getY() : targetY;
          addDamageNumber(divineTargetX, divineTargetY, event.divineDamage.toString(), '#ffff44', true);
        }, 400);
        const divineMsg = isPlayerAttack
          ? `⚡ Divine Punishment deals ${event.divineDamage} true damage to you!`
          : `⚡ Divine Punishment deals ${event.divineDamage} true damage!`;
        GameUI.logCombat(divineMsg);
      }
    }
    
    // Handle Parry (stun on block)
    if (event.parry) {
      const parryMsg = isPlayerAttack
        ? `🤺 ${defenderName}'s Parry stuns you!`
        : `🤺 Your Parry stuns ${attackerName}!`;
      GameUI.logCombat(parryMsg);
    }
    
    // Update target HP display
    if (isPlayerAttack) {
      updateEnemyHp(event.defenderHp, event.defenderMaxHp);
    }
    
    // Update player HP/stamina display
    if (!isPlayerAttack) {
      GameUI.updateHp(event.defenderHp, event.defenderMaxHp);
    }
    if (event.attackerStamina !== undefined) {
      GameUI.updateStamina(event.attackerStamina);
    }
    
    GameUI.logCombat(logMsg);
  }
  
  /**
   * Process a skill event
   */
  function processSkillEvent(event) {
    const isPlayerSkill = event.isPlayerAttack;
    const skillName = event.skillName;
    
    // Determine where to show damage/effect
    let targetX, targetY;
    let casterX, casterY;
    
    // Get caster position (for skill name shout)
    if (isPlayerSkill) {
      casterX = Player.getX();
      casterY = Player.getY();
    } else {
      // Enemy caster position (mob, PvP target, or boss)
      const enemyPos = getEnemyPosition();
      casterX = enemyPos?.x || 0;
      casterY = enemyPos?.y || 0;
    }
    
    if (event.defenderId) {
      if (isPlayerSkill) {
        // Target is enemy (mob, PvP target, or boss)
        const enemyPos = getEnemyPosition();
        if (enemyPos) {
          targetX = enemyPos.x;
          targetY = enemyPos.y;
        }
      } else {
        targetX = Player.getX();
        targetY = Player.getY();
      }
    } else {
      // Self-buff, show on caster
      targetX = casterX;
      targetY = casterY;
    }
    
    // Show skill name "shout" above the caster
    if (isPlayerSkill) {
      addDamageNumber(casterX, casterY - 0.5, `⚔️ ${skillName}!`, '#ffdd44', false);
    }
    
    switch (event.result) {
      case 'hit':
        // Skill that deals damage (like Strike)
        let dmgText = event.damage.toString();
        let damageColor = '#ff66ff'; // Purple for skill damage
        
        if (event.isCrit) {
          damageColor = '#ffcc00';
          dmgText += '!';
          GameUI.logCombat(`⚔️ ${skillName} CRITS for ${event.damage} damage!`);
        } else {
          GameUI.logCombat(`⚔️ ${skillName} deals ${event.damage} damage!`);
        }
        
        // Show damage with slight delay so skill name appears first
        setTimeout(() => {
          addDamageNumber(targetX, targetY, dmgText, damageColor, event.isCrit);
        }, 200);
        
        // Handle self-damage (Unfair Exchange)
        if (event.selfDamage && isPlayerSkill) {
          GameUI.logCombat(`💔 ${skillName} costs you ${event.selfDamage} HP!`);
          setTimeout(() => {
            addDamageNumber(casterX, casterY, `-${event.selfDamage}`, '#ff4444', false);
          }, 100);
          // Update player HP
          if (event.attackerHp !== undefined) {
            const charData = Game.getCharacterData();
            GameUI.updateHp(event.attackerHp, charData?.maxHp);
          }
        }
        
        // Handle additional skill effects
        if (event.bloodletting) {
          GameUI.logCombat(`Bloodletting deals ${event.bloodletting} bonus damage!`);
        }
        if (event.doubleStrike) {
          setTimeout(() => {
            addDamageNumber(targetX, targetY + 0.3, event.secondDamage.toString(), '#ff6666', false);
          }, 350);
          GameUI.logCombat(`Punish! Second strike deals ${event.secondDamage} damage!`);
        }
        
        // Update HP displays
        if (isPlayerSkill) {
          updateEnemyHp(event.defenderHp, event.defenderMaxHp);
        } else {
          GameUI.updateHp(event.defenderHp, event.defenderMaxHp);
        }
        break;
      
      case 'dodge':
        GameUI.logCombat(`⚔️ ${skillName} was dodged!`);
        setTimeout(() => {
          addDamageNumber(targetX, targetY, 'DODGE', '#88ccff');
        }, 200);
        
        // Handle Unbalance on dodge
        if (event.unbalance && event.unbalanceDamage) {
          setTimeout(() => {
            addDamageNumber(targetX, targetY + 0.2, event.unbalanceDamage.toString(), '#88ffff', false);
          }, 350);
          GameUI.logCombat(`Unbalance deals ${event.unbalanceDamage} damage!`);
        }
        break;
      
      case 'buff':
        // Self-buff skill (like Second Wind, Analyze, Multi-Strike, etc.)
        let buffMsg = '';
        let buffText = '';
        let buffColor = '#44ff44';
        
        if (event.effect === 'attack_speed') {
          buffMsg = isPlayerSkill 
            ? `⚔️ ${skillName}: +${event.value}% attack speed!`
            : `${event.attackerName} uses ${skillName}!`;
          buffText = `+${event.value}%`;
        } else if (event.effect === 'analyze') {
          buffMsg = `🔍 ${skillName}: Next attack is guaranteed crit +${event.value}% bonus damage!`;
          buffText = `ANALYZE`;
          buffColor = '#ffdd44';
        } else if (event.effect === 'multi_strike') {
          buffMsg = `✨ ${skillName}: Next attack hits ${event.value} extra times!`;
          buffText = `+${event.value} HITS`;
          buffColor = '#ff66ff';
        } else if (event.effect === 'cleanse') {
          const cleansedList = event.cleansedEffects?.length > 0 
            ? event.cleansedEffects.join(', ')
            : 'no effects';
          buffMsg = `🧹 ${skillName}: Removed ${cleansedList}!`;
          buffText = `CLEANSE`;
          buffColor = '#88ffff';
        } else if (event.effect === 'reflect') {
          buffMsg = `🪞 ${skillName}: Reflecting ${event.value}% of next attack!`;
          buffText = `REFLECT`;
          buffColor = '#ff88ff';
        } else if (event.effect === 'invulnerable') {
          buffMsg = `🛡️ ${skillName}: Invulnerable for ${event.duration || event.value}s!`;
          buffText = `SHIELD`;
          buffColor = '#88aaff';
        } else {
          buffMsg = isPlayerSkill 
            ? `⚔️ ${skillName}!`
            : `${event.attackerName} uses ${skillName}!`;
          buffText = event.value ? `+${event.value}` : 'BUFF';
        }
        
        GameUI.logCombat(buffMsg);
        setTimeout(() => {
          addDamageNumber(targetX, targetY, buffText, buffColor, false);
        }, 200);
        break;
      
      case 'stun':
        // Stun skill (like Bash)
        const stunTarget = isPlayerSkill ? event.defenderName : 'You';
        GameUI.logCombat(`⚔️ ${skillName} stuns ${stunTarget} for ${event.duration}s!`);
        setTimeout(() => {
          addDamageNumber(targetX, targetY, 'STUNNED', '#ffaa00', true);
        }, 200);
        break;
      
      case 'heal':
        // Heal skill (like Heal)
        if (event.healAmount > 0) {
          GameUI.logCombat(`💚 ${skillName} heals for ${event.healAmount} HP!`);
          setTimeout(() => {
            addDamageNumber(casterX, casterY, `+${event.healAmount}`, '#44ff88', false);
          }, 200);
          
          // Divine Punishment - damage enemy when healed
          if (event.divinePunishment && event.divineDamage) {
            GameUI.logCombat(`⚡ Divine Punishment deals ${event.divineDamage} true damage!`);
            setTimeout(() => {
              const enemyPos = getEnemyPosition();
              if (enemyPos) {
                addDamageNumber(enemyPos.x, enemyPos.y, event.divineDamage.toString(), '#ffff44', true);
              }
            }, 400);
            if (isPlayerSkill) {
              updateEnemyHp(event.defenderHp, event.defenderMaxHp);
            }
          }
        }
        
        // Update player HP
        if (isPlayerSkill && event.newHp !== undefined) {
          GameUI.updateHp(event.newHp, event.maxHp);
        }
        break;
      
      case 'blocked':
        // Heal was blocked (Disrupt)
        GameUI.logCombat(`🚫 ${skillName} was blocked - healing is disrupted!`);
        setTimeout(() => {
          addDamageNumber(casterX, casterY, 'BLOCKED', '#888888', false);
        }, 200);
        break;
      
      case 'debuff':
        // Debuff skill (like Disrupt)
        const debuffTarget = isPlayerSkill ? event.defenderName : 'You';
        if (event.effect === 'healing_blocked') {
          GameUI.logCombat(`🚫 ${skillName} blocks ${debuffTarget}'s healing for ${event.duration}s!`);
          setTimeout(() => {
            addDamageNumber(targetX, targetY, 'DISRUPTED', '#ff6666', true);
          }, 200);
        }
        break;
    }
    
    // Handle Divine Punishment for hit skills with healing (like Unfair Exchange)
    if (event.result === 'hit' && event.divinePunishment && event.divineDamage) {
      GameUI.logCombat(`⚡ Divine Punishment deals ${event.divineDamage} true damage!`);
      setTimeout(() => {
        const enemyPos = getEnemyPosition();
        if (enemyPos) {
          addDamageNumber(enemyPos.x, enemyPos.y + 0.3, event.divineDamage.toString(), '#ffff44', true);
        }
      }, 450);
    }
    
    // Handle heal amount shown for skills that both heal and damage (Unfair Exchange)
    if (event.result === 'hit' && event.healAmount > 0) {
      GameUI.logCombat(`💚 ${skillName} heals for ${event.healAmount} HP!`);
      setTimeout(() => {
        addDamageNumber(casterX, casterY, `+${event.healAmount}`, '#44ff88', false);
      }, 400);
      if (isPlayerSkill && event.newHp !== undefined) {
        GameUI.updateHp(event.newHp, event.maxHp);
      }
    } else if (event.result === 'hit' && event.healBlocked) {
      GameUI.logCombat(`🚫 ${skillName} heal was blocked by Disrupt!`);
    }
    
    // Update player stamina if provided
    if (isPlayerSkill && event.attackerStamina !== undefined) {
      GameUI.updateStamina(event.attackerStamina);
    }
  }
  
  /**
   * Process status end event
   */
  function processStatusEndEvent(event) {
    if (event.status === 'stun') {
      GameUI.logCombat(`${event.targetName} is no longer stunned.`);
    } else if (event.status === 'invulnerable') {
      GameUI.logCombat(`${event.targetName}'s Shield Wall fades.`);
    } else if (event.status === 'healing_blocked') {
      GameUI.logCombat(`${event.targetName} can heal again.`);
    }
  }
  
  /**
   * Process passive proc event (Regeneration, Sturdiness, Divine Punishment from regen, etc.)
   */
  function processPassiveProcEvent(event) {
    const isPlayer = event.targetId === undefined || event.targetName === Player.getName?.() || event.targetId === Game.getCharacterData?.()?.id;
    
    // Get position for damage numbers
    let targetX, targetY;
    if (isPlayer) {
      targetX = Player.getX();
      targetY = Player.getY();
    } else {
      // Target is enemy (mob, PvP target, or boss)
      const enemyPos = getEnemyPosition();
      targetX = enemyPos?.x || 0;
      targetY = enemyPos?.y || 0;
    }
    
    switch (event.passive) {
      case 'Regeneration':
        // Healing tick from Regeneration passive
        GameUI.logCombat(`♻️ Regeneration heals ${event.value} HP`);
        addDamageNumber(targetX, targetY, `+${event.value}`, '#44ff88', false);
        
        // Update HP display
        if (isPlayer && event.newHp !== undefined) {
          GameUI.updateHp(event.newHp, event.maxHp);
        }
        
        // Divine Punishment from Regeneration
        if (event.divinePunishment && event.divineDamage) {
          GameUI.logCombat(`⚡ Divine Punishment deals ${event.divineDamage} true damage!`);
          setTimeout(() => {
            const enemyPos = getEnemyPosition();
            if (enemyPos) {
              addDamageNumber(enemyPos.x, enemyPos.y, event.divineDamage.toString(), '#ffff44', true);
            }
          }, 150);
          // Update enemy HP
          if (event.enemyHp !== undefined) {
            updateEnemyHp(event.enemyHp);
          }
        }
        break;
      
      case 'Sturdiness':
        // DEF gain from Sturdiness passive
        GameUI.logCombat(`💪 Sturdiness: +${Math.round(event.value)} DEF (now ${Math.round(event.newDef)})`);
        addDamageNumber(targetX, targetY, `+DEF`, '#4488ff', false);
        break;
      
      case 'Poison':
        // Poison tick damage (Roguery: Poisonous Blade)
        GameUI.logCombat(`☠️ Poison deals ${event.damage} damage (${event.stacks} stacks)`);
        addDamageNumber(targetX, targetY, event.damage.toString(), '#88ff44', false);
        
        // Update HP display (poison is on the target, not player)
        if (!isPlayer && event.newHp !== undefined) {
          updateEnemyHp(event.newHp);
        } else if (isPlayer && event.newHp !== undefined) {
          GameUI.updateHp(event.newHp, Game.getCharacterData()?.maxHp);
        }
        break;
      
      case 'Shuriken':
        // Shuriken periodic damage (Roguery passive)
        GameUI.logCombat(`⭐ Shuriken deals ${event.damage} damage (${event.percent}% of ${event.dex} DEX)`);
        
        // Get enemy position for damage number
        let shurikenTargetX, shurikenTargetY;
        if (event.attackerId === Game.getCharacterData?.()?.id) {
          // Player's shuriken hits enemy
          const enemyPos = getEnemyPosition();
          shurikenTargetX = enemyPos?.x || 0;
          shurikenTargetY = enemyPos?.y || 0;
        } else {
          // Enemy's shuriken hits player
          shurikenTargetX = Player.getX();
          shurikenTargetY = Player.getY();
        }
        addDamageNumber(shurikenTargetX, shurikenTargetY, event.damage.toString(), '#ffff00', false);
        
        // Update enemy HP
        if (event.newHp !== undefined && event.attackerId === Game.getCharacterData?.()?.id) {
          updateEnemyHp(event.newHp);
        }
        break;
      
      default:
        // Generic passive proc
        if (event.value) {
          GameUI.logCombat(`${event.passive}: ${event.value}`);
        }
        break;
    }
  }

  /**
   * Process battle end event
   */
  function processBattleEnd(event) {
    // Don't end combat here - wait for server COMBAT_END message
    // This is just the visual end of the replay
    
    // For boss combat, unfreeze the boss
    if (isBossCombat && bossCombatId && typeof BossManager !== 'undefined') {
      BossManager.setBossInCombat(bossCombatId, false);
    }
    
    // For PvP (non-boss), unlock the ghost and clear HP display when battle animation ends
    if (isPvPCombat && pvpTargetId && !isBossCombat) {
      GhostPlayers.setGhostLocked(pvpTargetId, false);
      // Clear HP data so the HP bar disappears
      GhostPlayers.updateGhostHp(pvpTargetId, undefined, undefined);
    }
    
    // Safety timeout: if the server's end message doesn't arrive within 3 seconds
    // after the replay finishes, force-unlock the player to prevent getting stuck
    if (combatSafetyTimeout) clearTimeout(combatSafetyTimeout);
    combatSafetyTimeout = setTimeout(() => {
      if (inCombat) {
        console.warn('[CombatManager] Safety timeout: force-ending combat (server end message never arrived)');
        
        // Unfreeze boss if still frozen
        if (isBossCombat && bossCombatId && typeof BossManager !== 'undefined') {
          BossManager.setBossInCombat(bossCombatId, false);
        }
        
        inCombat = false;
        isPvPCombat = false;
        isBossCombat = false;
        bossCombatId = null;
        pvpTargetId = null;
        pvpTargetData = null;
        currentCombat = null;
        combatEvents = [];
        currentEventIndex = 0;
        combatMobId = null;
        
        Player.setInCombat(false, null);
        GameUI.setActionsLocked(false);
        GameUI.logSystem('⚠️ Combat ended (timeout).');
      }
    }, 3000);
  }
  
  /**
   * End combat (called when server sends COMBAT_END)
   */
  function endCombat(result) {
    // Clear safety timeout
    if (combatSafetyTimeout) { clearTimeout(combatSafetyTimeout); combatSafetyTimeout = null; }
    
    // Guard against being called multiple times
    if (!inCombat && !currentCombat) {
      console.log('[CombatManager] endCombat called but not in combat, ignoring');
      return;
    }
    
    // Unlock ghost if PvP
    if (isPvPCombat && pvpTargetId) {
      GhostPlayers.setGhostLocked(pvpTargetId, false);
    }
    
    inCombat = false;
    isPvPCombat = false;
    isBossCombat = false;
    bossCombatId = null;
    pvpTargetId = null;
    pvpTargetData = null;
    currentCombat = null;
    combatEvents = [];
    currentEventIndex = 0;
    
    // Unlock player movement
    Player.setInCombat(false, null);
    
    // Handle result
    if (result.result === 'victory') {
      // Build victory message with item drop info
      let victoryMsg = `Victory! +${result.exp} EXP`;
      
      if (result.itemDrop) {
        // Item dropped and added to inventory
        const rarityColor = CONSTANTS.RARITY[result.itemDrop.rarity?.toUpperCase()]?.color || '#fff';
        victoryMsg += `, Loot: ${result.itemDrop.icon} ${result.itemDrop.name}`;
        GameUI.logCombat(victoryMsg);
        GameUI.logSystem(`📦 Obtained: ${result.itemDrop.icon} ${result.itemDrop.name}`);
      } else if (result.inventoryFull && result.goldFromItem > 0) {
        // Inventory was full, item auto-sold
        victoryMsg += `, +${result.goldFromItem} Gold (inventory full)`;
        GameUI.logCombat(victoryMsg);
        GameUI.logSystem(`⚠️ Inventory full! Item auto-sold for ${result.goldFromItem} gold.`);
      } else {
        // No item drop (shouldn't happen with current system)
        GameUI.logCombat(victoryMsg);
      }
      
      if (result.levelUp) {
        GameUI.logSystem(`LEVEL UP! You are now level ${result.newLevel}!`);
        GameUI.logSystem(`You gained ${CONSTANTS.STAT_POINTS_PER_LEVEL} stat points!`);
      }
      
      // Show floating reward text
      const playerX = Player.getX();
      const playerY = Player.getY();
      addDamageNumber(playerX, playerY - 0.5, `+${result.exp} EXP`, '#44ff44', false);
      
      if (result.itemDrop) {
        setTimeout(() => {
          addDamageNumber(playerX, playerY - 0.3, `${result.itemDrop.icon} ${result.itemDrop.name}`, '#ffcc00', false);
        }, 300);
      } else if (result.goldFromItem > 0) {
        setTimeout(() => {
          addDamageNumber(playerX, playerY - 0.3, `+${result.goldFromItem} Gold`, '#ffdd44', false);
        }, 300);
      }
    }
    
    // Update character data with server's authoritative values
    const charData = Game.getCharacterData();
    if (charData) {
      charData.hp = result.playerHp;
      charData.stamina = result.playerStamina;
      if (result.levelUp) {
        charData.level = result.newLevel;
        charData.maxHp = result.newMaxHp;
        charData.statPoints = (charData.statPoints || 0) + CONSTANTS.STAT_POINTS_PER_LEVEL;
      }
      // Use server's authoritative totals
      charData.experience = result.newTotalExp;
      charData.gold = result.newTotalGold;
      GameUI.setCharacterData(charData);
    }
    
    combatMobId = null;
    
    console.log('[CombatManager] Combat ended:', result.result);
  }
  
  /**
   * Handle player death (from any source: mob, PvP, boss, etc.)
   * @param {Object} data - Death data from server
   */
  function handlePlayerDeath(data) {
    console.log('[CombatManager] Player died:', data);
    
    // Clear safety timeout
    if (combatSafetyTimeout) { clearTimeout(combatSafetyTimeout); combatSafetyTimeout = null; }
    
    // Unfreeze boss if in boss combat
    if (isBossCombat && bossCombatId && typeof BossManager !== 'undefined') {
      BossManager.setBossInCombat(bossCombatId, false);
    }
    
    inCombat = false;
    isPvPCombat = false;
    isBossCombat = false;
    bossCombatId = null;
    pvpTargetId = null;
    pvpTargetData = null;
    currentCombat = null;
    combatEvents = [];
    currentEventIndex = 0;
    combatMobId = null;
    
    // Unlock player movement state (even though they're dead)
    Player.setInCombat(false, null);
    
    // Log the death message based on source
    if (data.killedBy === 'pvp') {
      GameUI.logCombat(`You were defeated by ${data.killerName || 'an opponent'}!`);
    } else {
      GameUI.logCombat(`You were defeated by ${data.mobName || 'a creature'}!`);
    }
    
    // Show death overlay - this locks all actions and shows the respawn button
    GameUI.showDeathOverlay(data);
    
    console.log('[CombatManager] Death handled, showing death overlay');
  }
  
  /**
   * End PvP combat (called when server sends pvp_combat_end)
   */
  function endPvPCombat(result) {
    console.log('[CombatManager] endPvPCombat called:', result);
    
    // Clear safety timeout
    if (combatSafetyTimeout) { clearTimeout(combatSafetyTimeout); combatSafetyTimeout = null; }
    
    // Unlock ghost if PvP (not boss)
    if (pvpTargetId && !isBossCombat) {
      GhostPlayers.setGhostLocked(pvpTargetId, false);
      // Clear HP data so the HP bar disappears
      GhostPlayers.updateGhostHp(pvpTargetId, undefined, undefined);
    }
    
    // Unfreeze boss if boss combat
    if (isBossCombat && bossCombatId && typeof BossManager !== 'undefined') {
      BossManager.setBossInCombat(bossCombatId, false);
    }
    
    inCombat = false;
    isPvPCombat = false;
    isBossCombat = false;
    bossCombatId = null;
    pvpTargetId = null;
    pvpTargetData = null;
    currentCombat = null;
    combatEvents = [];
    currentEventIndex = 0;
    combatMobId = null;
    
    // Unlock player movement
    Player.setInCombat(false, null);
    
    console.log('[CombatManager] PvP combat ended, player unlocked');
  }
  
  /**
   * End boss combat (called when server sends BOSS_COMBAT_END)
   */
  function endBossCombat(result) {
    console.log('[CombatManager] endBossCombat called:', result);
    
    // Clear safety timeout
    if (combatSafetyTimeout) { clearTimeout(combatSafetyTimeout); combatSafetyTimeout = null; }
    
    // Unfreeze boss
    if (bossCombatId && typeof BossManager !== 'undefined') {
      BossManager.setBossInCombat(bossCombatId, false);
    }
    
    inCombat = false;
    isPvPCombat = false;
    isBossCombat = false;
    bossCombatId = null;
    pvpTargetId = null;
    pvpTargetData = null;
    currentCombat = null;
    combatEvents = [];
    currentEventIndex = 0;
    combatMobId = null;
    
    // Unlock player movement
    Player.setInCombat(false, null);
    
    console.log('[CombatManager] Boss combat ended, player unlocked');
  }
  
  /**
   * Add a floating damage number
   */
  function addDamageNumber(x, y, text, color, isCrit = false) {
    console.log(`[CombatManager] Adding damage number: "${text}" at (${x}, ${y}) color: ${color}`);
    damageNumbers.push({
      x: x,
      y: y,
      text: text,
      color: color,
      isCrit: isCrit,
      startTime: performance.now(),
      offsetY: 0,
      alpha: 1
    });
  }
  
  /**
   * Update damage numbers animation
   */
  function updateDamageNumbers(deltaTime) {
    const now = performance.now();
    const duration = 1500; // 1.5 seconds
    
    damageNumbers = damageNumbers.filter(num => {
      const elapsed = now - num.startTime;
      if (elapsed >= duration) return false;
      
      const progress = elapsed / duration;
      num.offsetY = -30 * progress; // Float upward
      num.alpha = 1 - (progress * 0.7); // Fade out
      
      return true;
    });
  }
  
  /**
   * Render damage numbers
   */
  function renderDamageNumbers(ctx, cameraX, cameraY) {
    const TILE_SIZE = CONSTANTS.TILE_SIZE;
    
    damageNumbers.forEach(num => {
      const screenX = (num.x * TILE_SIZE) - cameraX + TILE_SIZE / 2;
      const screenY = (num.y * TILE_SIZE) - cameraY + num.offsetY;
      
      ctx.save();
      ctx.globalAlpha = num.alpha;
      
      // Text styling
      const fontSize = num.isCrit ? 18 : 14;
      ctx.font = `bold ${fontSize}px Verdana`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      // Outline
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 3;
      ctx.strokeText(num.text, screenX, screenY);
      
      // Fill
      ctx.fillStyle = num.color;
      ctx.fillText(num.text, screenX, screenY);
      
      ctx.restore();
    });
  }
  
  /**
   * Check if in combat
   */
  function isInCombat() {
    return inCombat;
  }
  
  /**
   * Get current combat mob ID
   */
  function getCombatMobId() {
    return combatMobId;
  }
  
  // Public API
  return {
    init,
    startCombat,
    startPvPCombat,
    update,
    endCombat,
    endPvPCombat,
    endBossCombat,
    handlePlayerDeath,
    addDamageNumber,
    renderDamageNumbers,
    isInCombat,
    getCombatMobId
  };
})();

// Auto-initialize
if (typeof window !== 'undefined') {
  CombatManager.init();
}
