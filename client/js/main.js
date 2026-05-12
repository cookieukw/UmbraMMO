/**
 * UMBRA ONLINE - Main Game Entry Point
 * Initializes and runs the game
 */

const Game = (function() {
  // Canvas and context
  let canvas = null;
  let ctx = null;
  
  // Text overlay canvas (crisp text, no pixelated filter)
  let textCanvas = null;
  let textCtx = null;
  
  // Game loop
  let lastTime = 0;
  let frameCount = 0;
  let fpsTime = 0;
  let currentFps = 0;
  
  // Game state
  let isRunning = false;
  let isLoading = true;
  
  // Auth state
  let authToken = null;
  let characterData = null;
  
  // Debug options (admin only)
  const DEBUG = {
    showGrid: false,
    showCoords: false,
    isAdmin: false
  };
  
  /**
   * Start the game with auth token and character data
   * Called by Auth module after successful login
   */
  async function start(token, character) {
    authToken = token;
    characterData = character;
    
    console.log(`[Game] Starting game for ${character.name}...`);
    
    // Get canvas
    canvas = document.getElementById('game-canvas');
    if (!canvas) {
      console.error('[Game] Canvas not found!');
      return;
    }
    
    ctx = canvas.getContext('2d');
    
    // Keep pixel art crisp at any zoom level
    ctx.imageSmoothingEnabled = false;
    
    // Set canvas size from constants
    canvas.width = CONSTANTS.ZONE_WIDTH * CONSTANTS.TILE_SIZE;
    canvas.height = CONSTANTS.ZONE_HEIGHT * CONSTANTS.TILE_SIZE;
    
    // Initialize text overlay canvas (for crisp text rendering)
    textCanvas = document.getElementById('text-overlay-canvas');
    if (textCanvas) {
      // Match internal game resolution so worldToScreen coords align perfectly.
      // CSS scales both canvases identically to display size.
      textCanvas.width = canvas.width;
      textCanvas.height = canvas.height;
      textCtx = textCanvas.getContext('2d');
    }
    
    // Initialize camera system
    Camera.init(canvas);
    
    // Load the character's zone (with fallback to town_01 if zone doesn't exist)
    const zoneId = character.zoneId || 'town_01';
    let zone = await ZoneManager.loadZone(zoneId);
    
    // If zone failed to load, try loading town_01 as fallback
    if (!zone && zoneId !== 'town_01') {
      console.warn(`[Game] Zone ${zoneId} not found, falling back to town_01`);
      zone = await ZoneManager.loadZone('town_01');
      // Update character position to spawn point
      character.x = 10;
      character.y = 7;
      character.zoneId = 'town_01';
    }
    
    if (!zone) {
      console.error('[Game] Failed to load any zone!');
      return;
    }
    
    // Initialize player with character data
    Player.initWithCharacter(character);
    
    // Snap camera to player start position
    const pos = Player.getPosition();
    Camera.snapToPlayer(pos.x * CONSTANTS.TILE_SIZE, pos.y * CONSTANTS.TILE_SIZE);
    
    // Initialize ghost players system
    GhostPlayers.init();
    
    // Initialize the UI system
    GameUI.init(character);
    GameUI.logSystem(`Welcome to Umbra Online, ${character.name}!`);
    
    // Initialize networking and authenticate
    Connection.init();
    Connection.onReady(() => {
      // Send auth token to WebSocket server
      Connection.send({
        type: CONSTANTS.MSG_TYPES.AUTH,
        token: authToken
      });
    });
    
    // Register message handlers
    registerMessageHandlers();
    
    // Initialize input system
    Input.init();
    Input.onMove(handleMovementInput);
    Input.onAttack(handleAttackInput);
    Input.onInteract(handleInteractInput);
    
    // Add canvas click handler for player interaction
    canvas.addEventListener('click', handleCanvasClick);
    
    // Start game loop
    isRunning = true;
    isLoading = false;
    lastTime = performance.now();
    requestAnimationFrame(gameLoop);
    
    // Update zone name in UI
    GameUI.updateZoneName();
    
    console.log('[Game] Game started!');
  }
  
  /**
   * Legacy init - now handled by Auth
   */
  async function init() {
    // Auth system handles initialization now
    console.log('[Game] Use Auth.init() to start');
  }
  
  /**
   * Load the initial zone
   */
  async function loadInitialZone() {
    const zone = await ZoneManager.loadZone('town_01');
    if (!zone) {
      console.error('[Game] Failed to load initial zone!');
    }
  }
  
  /**
   * Register handlers for server messages
   */
  function registerMessageHandlers() {
    // Handle auth success from WebSocket
    Connection.on(CONSTANTS.MSG_TYPES.AUTH_SUCCESS, (message) => {
      Player.setPlayerId(message.playerId);
      console.log(`[Game] Authenticated: ${message.character?.name}`);
      
      // Update character data
      if (message.character) {
        // Flatten stats object into character data
        characterData = {
          ...message.character,
          ...(message.character.stats || {})
        };
        delete characterData.stats;
        
        GameUI.setCharacterData(characterData);
        
        // Update debug player info with character name
        const infoEl = document.getElementById('player-info');
        if (infoEl) {
          infoEl.textContent = `Player: ${message.character.name}`;
        }
        
        GameUI.logServer('Connected to server');
      }
      
      // Set admin status
      if (message.isAdmin) {
        setAdminStatus(true);
        GameUI.setAdminStatus(true);
      }
      
      // Load ghosts
      if (message.ghosts && Array.isArray(message.ghosts)) {
        GhostPlayers.updateGhosts(message.ghosts);
      }
      
      // Load mob types and mobs
      if (message.mobTypes) {
        MobManager.setMobTypes(message.mobTypes);
      }
      if (message.mobs && Array.isArray(message.mobs)) {
        MobManager.updateMobs(message.mobs);
      }
      
      // Load boss types and bosses
      if (message.bossTypes) {
        BossManager.setBossTypes(message.bossTypes);
      }
      if (message.bosses && Array.isArray(message.bosses)) {
        BossManager.updateBosses(message.bosses);
      }
      // Set player level for boss name coloring
      BossManager.setPlayerLevel(message.character?.level || 1);
    });
    
    // Handle auth failure
    Connection.on(CONSTANTS.MSG_TYPES.AUTH_FAIL, (message) => {
      console.error('[Game] Auth failed:', message.error);
      GameUI.logError(`Authentication failed: ${message.error}`);
      
      // Check if kicked due to login from another location
      if (message.error === 'Logged in from another location') {
        alert('You have been disconnected because your account logged in from another location.');
        Auth.logout();
        return;
      }
      
      if (message.needsCharacter) {
        // Redirect to character creation
        Auth.showScreen('character-create');
      } else {
        // Token invalid, logout
        Auth.logout();
      }
    });
    
    // Handle zone state update (after zone change or ghost sync)
    Connection.on(CONSTANTS.MSG_TYPES.ZONE_STATE, (message) => {
      // Handle server position correction (from invalid move attempts)
      if (message.correctedPosition) {
        const cp = message.correctedPosition;
        console.log(`[Game] Position corrected by server to (${cp.x}, ${cp.y})`);
        if (typeof Player !== 'undefined') {
          Player.setPosition(cp.x, cp.y);
          if (cp.direction) Player.setDirection(cp.direction);
        }
        return;
      }
      
      // Only log zone entry if this is NOT a periodic ghost sync
      if (!message.isGhostSync) {
        console.log(`[Game] Zone state received for ${message.zoneId}`);
        GameUI.logServer(`Entered ${message.zoneId}`);
        
        // Apply server-authoritative entry point if provided
        if (message.entryX !== undefined && message.entryY !== undefined) {
          if (typeof Player !== 'undefined') {
            Player.setPosition(message.entryX, message.entryY);
          }
        }
        
        // Update zone name
        const zone = ZoneManager.getCurrentZone();
        if (zone) {
          GameUI.updateZoneName(zone.name);
        }
        
        // Clear mobs and bosses from old zone
        MobManager.clearMobs();
        BossManager.clearBosses();
        
        // Refresh world map if open (to update current zone marker)
        if (typeof WorldMap !== 'undefined') {
          WorldMap.refresh();
        }
      }
      
      // Update ghost players (for both zone change and sync)
      if (message.ghosts && Array.isArray(message.ghosts)) {
        GhostPlayers.updateGhosts(message.ghosts);
      }
      
      // Update mob types if provided (on zone entry)
      if (message.mobTypes) {
        MobManager.setMobTypes(message.mobTypes);
      }
      
      // Update mobs
      if (message.mobs && Array.isArray(message.mobs)) {
        MobManager.updateMobs(message.mobs);
      }
      
      // Update boss types if provided (on zone entry)
      if (message.bossTypes) {
        BossManager.setBossTypes(message.bossTypes);
      }
      
      // Update bosses
      if (message.bosses && Array.isArray(message.bosses)) {
        BossManager.updateBosses(message.bosses);
      }
    });
    
    // Handle mob sync (periodic updates)
    Connection.on(CONSTANTS.MSG_TYPES.MOB_SYNC, (message) => {
      if (message.mobs && Array.isArray(message.mobs)) {
        MobManager.updateMobs(message.mobs);
      }
    });
    
    // Handle boss sync (periodic updates)
    Connection.on(CONSTANTS.MSG_TYPES.BOSS_SYNC, (message) => {
      if (message.bosses && Array.isArray(message.bosses)) {
        BossManager.updateBosses(message.bosses);
      }
    });
    
    // ==========================================
    // ZONE DANGER MESSAGE HANDLERS
    // ==========================================
    
    // Handle zone danger notification (entering/leaving dangerous zone)
    Connection.on(CONSTANTS.MSG_TYPES.ZONE_DANGER, (message) => {
      console.log('[Game] Zone danger:', message);
      GameUI.handleZoneDanger(message);
    });
    
    // Handle zone damage (taking damage from dangerous zone)
    Connection.on(CONSTANTS.MSG_TYPES.ZONE_DAMAGE, (message) => {
      console.log('[Game] Zone damage:', message);
      GameUI.handleZoneDamage(message);
    });
    
    // Handle player entering zone
    Connection.on(CONSTANTS.MSG_TYPES.PLAYER_ENTER, (message) => {
      console.log(`[Game] ${message.name || message.playerId} entered zone`);
      GameUI.logServer(`${message.name || 'A player'} entered the area`);
      GhostPlayers.addGhost({
        id: message.playerId,
        name: message.name || message.playerId,
        x: message.x,
        y: message.y,
        direction: message.direction || 'down',
        equipment: message.equipment || {}
      });
    });
    
    // Handle player leaving zone
    Connection.on(CONSTANTS.MSG_TYPES.PLAYER_LEAVE, (message) => {
      console.log(`[Game] Player ${message.playerId} left zone`);
      // Get the ghost name before removing
      const ghost = GhostPlayers.getGhost(message.playerId);
      if (ghost) {
        GameUI.logServer(`${ghost.name || 'A player'} left the area`);
      }
      GhostPlayers.removeGhost(message.playerId);
    });
    
    // Handle other player movement broadcast
    Connection.on(CONSTANTS.MSG_TYPES.MOVE_BROADCAST, (message) => {
      // Could update ghost position in real-time (optional)
    });
    
    // Handle combat start - begin combat replay
    Connection.on(CONSTANTS.MSG_TYPES.COMBAT_START, (message) => {
      console.log('[Game] Combat started:', message);
      // Lock actions during combat replay
      GameUI.setActionsLocked(true);
      CombatManager.startCombat(message);
    });
    
    // Handle combat end - process results
    Connection.on(CONSTANTS.MSG_TYPES.COMBAT_END, (message) => {
      console.log('[Game] Combat ended:', message);
      CombatManager.endCombat(message);
      // Unlock actions after combat
      GameUI.setActionsLocked(false);
    });
    
    // Handle player death
    Connection.on(CONSTANTS.MSG_TYPES.PLAYER_DEATH, (message) => {
      console.log('[Game] Player died:', message);
      CombatManager.handlePlayerDeath(message);
    });
    
    // Handle spawn point set response
    Connection.on(CONSTANTS.MSG_TYPES.SET_SPAWN_RESPONSE, (message) => {
      console.log('[Game] Spawn point response:', message);
      GameUI.handleSetSpawnResponse(message);
    });
    
    // ==========================================
    // CASTLE WARS MESSAGE HANDLERS
    // ==========================================
    
    // Handle castle info response
    Connection.on(CONSTANTS.MSG_TYPES.CASTLE_INFO, (message) => {
      console.log('[Game] Castle info received:', message);
      GameUI.handleCastleInfo(message);
    });
    
    // Handle castle attack response (combat will start or error)
    Connection.on(CONSTANTS.MSG_TYPES.CASTLE_ATTACK_RESPONSE, (message) => {
      console.log('[Game] Castle attack response:', message);
      if (!message.success) {
        GameUI.logError(message.message || 'Cannot attack this castle');
      }
      // If success, combat will start via COMBAT_START message
    });
    
    // Handle castle conquered notification
    Connection.on(CONSTANTS.MSG_TYPES.CASTLE_CONQUERED, (message) => {
      console.log('[Game] Castle conquered notification:', message);
      GameUI.handleCastleConquered(message);
    });
    
    // Handle castle payout notification
    Connection.on(CONSTANTS.MSG_TYPES.CASTLE_PAYOUT, (message) => {
      console.log('[Game] Castle payout received:', message);
      GameUI.handleCastlePayout(message);
    });
    
    // Handle castle combat start (similar to PvP combat)
    Connection.on('castle_combat_start', (message) => {
      console.log('[Game] Castle combat started:', message);
      // Lock actions during combat replay
      GameUI.setActionsLocked(true);
      
      // Use CombatManager PvP combat with castle-specific data
      CombatManager.startPvPCombat({
        targetPlayerId: message.defender.id,
        target: message.defender,
        attacker: message.attacker,
        events: message.events,
        duration: message.duration,
        playerWon: message.playerWon,
        isCastleCombat: true,
        castleId: message.castleId
      });
    });
    
    // Handle castle combat end
    Connection.on('castle_combat_end', (message) => {
      console.log('[Game] Castle combat ended:', message);
      GameUI.handleCastleCombatEnd(message);
    });
    
    // ==========================================
    // BOSS BATTLE MESSAGE HANDLERS
    // ==========================================
    
    // Handle boss info response
    Connection.on(CONSTANTS.MSG_TYPES.BOSS_INFO, (message) => {
      if (message.success) {
        GameUI.handleBossInfo(message);
      } else {
        GameUI.logError(message.message || 'Boss not found');
      }
    });
    
    // Handle boss attack response
    Connection.on(CONSTANTS.MSG_TYPES.BOSS_ATTACK_RESPONSE, (message) => {
      if (!message.success) {
        GameUI.logError(message.message || 'Cannot attack this boss');
      }
    });
    
    // Handle boss combat start (PvP-style combat)
    Connection.on(CONSTANTS.MSG_TYPES.BOSS_COMBAT_START, (message) => {
      // Lock actions during combat replay
      GameUI.setActionsLocked(true);
      
      // Close boss info panel if open
      GameUI.closeBossInfoPanel();
      
      // Use CombatManager PvP combat with boss-specific data
      CombatManager.startPvPCombat({
        targetPlayerId: message.defender.id,
        target: message.defender,
        attacker: message.attacker,
        events: message.events,
        duration: message.duration,
        playerWon: message.playerWon,
        isBossCombat: true,
        bossId: message.bossId
      });
    });
    
    // Handle boss combat end
    Connection.on(CONSTANTS.MSG_TYPES.BOSS_COMBAT_END, (message) => {
      // End combat state in CombatManager (unlocks player movement)
      CombatManager.endBossCombat(message);
      
      // Handle rewards and UI updates
      GameUI.handleBossCombatEnd(message);
    });
    
    // ==========================================
    // SKILL MESSAGE HANDLERS
    // ==========================================
    
    // Handle skill data response (initial load or refresh)
    Connection.on('skills_data', (message) => {
      console.log('[Game] Skills data received:', message);
      GameUI.updatePlayerSkills(message.skills);
      GameUI.setSkillPoints(message.availablePoints);
      GameUI.updateSkillTrees();
    });
    
    // Handle skill learned response
    Connection.on('skill_learned', (message) => {
      console.log('[Game] Skill learned:', message);
      GameUI.updatePlayerSkills(message.skills);
      GameUI.setSkillPoints(message.availablePoints);
      GameUI.logSystem(`✨ Learned ${message.skillName} (Level ${message.newLevel})`);
      
      // Update character data
      if (characterData) {
        characterData.skillPoints = message.availablePoints;
      }
    });
    
    // Handle skill equipped response
    Connection.on('skill_equipped', (message) => {
      console.log('[Game] Skill equipped:', message);
      GameUI.updatePlayerSkills({ equipped: message.equipped });
      
      if (message.skillId !== null) {
        GameUI.logSystem(`⚔️ Skill equipped to slot ${message.slot + 1}`);
      } else {
        GameUI.logSystem(`Skill removed from slot ${message.slot + 1}`);
      }
    });
    
    // Handle skill trees data
    Connection.on('skill_trees', (message) => {
      console.log('[Game] Skill trees data received:', message);
      // Could be used to sync server skill definitions, but we're using client-side definitions
    });
    
    // Handle stats update (when derived stats change, like max_stamina from END)
    Connection.on('stats_update', (message) => {
      console.log('[Game] Stats update received:', message);
      if (characterData) {
        if (message.maxHp !== undefined) characterData.maxHp = message.maxHp;
        if (message.hp !== undefined) characterData.hp = message.hp;
        if (message.maxStamina !== undefined) characterData.maxStamina = message.maxStamina;
        if (message.stamina !== undefined) characterData.stamina = message.stamina;
        GameUI.setCharacterData(characterData);
      }
    });
    
    // Handle stat_allocate_response — server-authoritative stat allocation
    Connection.on('stat_allocate_response', (message) => {
      if (message.success && message.character) {
        const c = message.character;
        if (characterData) {
          characterData.level = c.level;
          characterData.experience = c.experience;
          characterData.hp = c.hp;
          characterData.maxHp = c.maxHp;
          characterData.stamina = c.stamina;
          characterData.maxStamina = c.maxStamina;
          characterData.statPoints = c.statPoints;
          characterData.skillPoints = c.skillPoints;
          characterData.str = c.str;
          characterData.vit = c.vit;
          characterData.agi = c.agi;
          characterData.dex = c.dex;
          characterData.def = c.def;
          characterData.int = c.int;
          characterData.end = c.end;
          GameUI.setCharacterData(characterData);
        }
        GameUI.logSystem(`+1 ${message.stat.toUpperCase()} allocated!`);
      } else {
        GameUI.logError(message.error || 'Stat allocation failed');
      }
    });
    
    // Handle errors
    Connection.on('error', (message) => {
      if (message.error) {
        GameUI.logError(message.error);
      }
    });
    
    // Handle admin heal response
    Connection.on('admin_heal_response', (message) => {
      if (message.success) {
        console.log('[Admin] Full heal successful');
        GameUI.logSystem(`❤️ Fully healed! HP: ${message.hp}/${message.maxHp}`);
        
        // Update character data
        if (characterData) {
          characterData.hp = message.hp;
          characterData.maxHp = message.maxHp;
          GameUI.setCharacterData(characterData);
        }
      } else {
        GameUI.logError(`Heal failed: ${message.message || 'Unknown error'}`);
      }
    });
    
    // Handle admin add level response
    Connection.on('admin_add_level_response', (message) => {
      if (message.success) {
        console.log('[Admin] Level up successful');
        GameUI.logSystem(`⬆️ LEVEL UP! You are now level ${message.level}!`);
        GameUI.logSystem(`You gained ${CONSTANTS.STAT_POINTS_PER_LEVEL} stat points and ${CONSTANTS.SKILL_POINTS_PER_LEVEL} skill points!`);
        
        // Update character data
        if (characterData) {
          characterData.level = message.level;
          characterData.statPoints = message.statPoints;
          characterData.skillPoints = message.skillPoints;
          characterData.hp = message.hp;
          characterData.maxHp = message.maxHp;
          GameUI.setCharacterData(characterData);
        }
      } else {
        GameUI.logError(`Level up failed: ${message.message || 'Unknown error'}`);
      }
    });
    
    // Handle admin reset character response
    Connection.on('admin_reset_response', (message) => {
      if (message.success) {
        console.log('[Admin] Character reset successful');
        GameUI.logSystem(`🔄 Character has been reset to Level 1!`);
        
        // Update character data with reset values
        if (characterData && message.character) {
          characterData.level = message.character.level;
          characterData.experience = message.character.experience;
          characterData.hp = message.character.hp;
          characterData.maxHp = message.character.maxHp;
          characterData.stamina = message.character.stamina;
          characterData.maxStamina = message.character.maxStamina;
          characterData.gold = message.character.gold;
          characterData.statPoints = message.character.statPoints;
          characterData.skillPoints = message.character.skillPoints;
          characterData.str = message.character.stats.str;
          characterData.vit = message.character.stats.vit;
          characterData.agi = message.character.stats.agi;
          characterData.dex = message.character.stats.dex;
          characterData.def = message.character.stats.def;
          characterData.int = message.character.stats.int;
          characterData.end = message.character.stats.end;
          
          GameUI.setCharacterData(characterData);
        }
        
        // Reset skills in UI
        if (message.skills) {
          GameUI.updatePlayerSkills(message.skills);
        }
        
        // Clear inventory and equipment in UI
        GameUI.updateInventory({
          inventory: message.inventory || [],
          equipment: message.equipment || {}
        });
      } else {
        GameUI.logError(`Reset failed: ${message.message || 'Unknown error'}`);
      }
    });
    
    // Handle admin teleport response
    Connection.on(CONSTANTS.MSG_TYPES.ADMIN_TELEPORT_RESPONSE, async (message) => {
      console.log('[Admin] Teleport response:', message);
      
      // Let GameUI handle the response (shows success/error messages)
      GameUI.handleTeleportResponse(message);
      
      // If successful, load the new zone and update player position
      if (message.success) {
        const zone = await ZoneManager.loadZone(message.zoneId);
        if (zone) {
          Player.setPosition(message.x, message.y);
          Player.setDirection('down');
          Camera.snapToPlayer(message.x * CONSTANTS.TILE_SIZE, message.y * CONSTANTS.TILE_SIZE);
        }
      }
    });
    
    // ==========================================
    // INVENTORY MESSAGE HANDLERS
    // ==========================================
    
    // Handle inventory update (sent on login, after equip/unequip/use)
    Connection.on('inventory_update', (message) => {
      console.log('[Game] Inventory update received');
      GameUI.updateInventory(message);
      
      // Update local player's visible equipment for paperdoll rendering
      if (message.equipment) {
        const visibleEquip = {};
        const visualSlots = ['headgear', 'chest', 'pants', 'boots', 'weapon1', 'weapon2'];
        for (const [slot, data] of Object.entries(message.equipment)) {
          if (visualSlots.includes(slot) && data && data.itemId) {
            visibleEquip[slot] = data.itemId;
          }
        }
        Player.setEquipment(visibleEquip);
      }
    });
    
    // Handle equipment changed broadcast from other players
    Connection.on('equipment_changed', (message) => {
      console.log(`[Game] Equipment changed for player ${message.playerId}`);
      GhostPlayers.updateGhostEquipment(message.playerId, message.equipment || {});
    });
    
    // Handle equip item response
    Connection.on('equip_item_response', (message) => {
      if (message.success) {
        console.log('[Game] Item equipped successfully');
        GameUI.logSystem('✅ Item equipped');
      } else {
        console.log('[Game] Equip failed:', message.message);
        GameUI.logError(`Failed to equip: ${message.message}`);
      }
    });
    
    // Handle unequip item response
    Connection.on('unequip_item_response', (message) => {
      if (message.success) {
        console.log('[Game] Item unequipped successfully');
        GameUI.logSystem('✅ Item unequipped');
      } else {
        console.log('[Game] Unequip failed:', message.message);
        GameUI.logError(`Failed to unequip: ${message.message}`);
      }
    });
    
    // Handle move inventory item response
    Connection.on('move_inventory_response', (message) => {
      if (!message.success) {
        console.log('[Game] Move item failed:', message.message);
        GameUI.logError(`Failed to move item: ${message.message}`);
      }
      // Success case is silent - UI updates from inventory_update
    });
    
    // Handle use item response (consumables)
    Connection.on('use_item_response', (message) => {
      if (message.success) {
        console.log('[Game] Item used:', message.itemName, '-', message.message);
        GameUI.logSystem(`🍴 Used ${message.itemName}: ${message.message}`);
        
        // Update character data with any stat changes
        if (message.updates && characterData) {
          if (message.updates.hp !== undefined) {
            characterData.hp = message.updates.hp;
          }
          if (message.updates.experience !== undefined) {
            characterData.experience = message.updates.experience;
          }
          GameUI.setCharacterData(characterData);
        }
      } else {
        console.log('[Game] Use item failed:', message.message);
        GameUI.logError(`Failed to use item: ${message.message}`);
      }
    });
    
    // Handle admin give items response
    Connection.on('admin_give_items_response', (message) => {
      if (message.success) {
        console.log('[Game] Admin random items received');
        if (message.items && message.items.length > 0) {
          const itemList = message.items.map(i => `${i.icon} ${i.name}`).join(', ');
          GameUI.logSystem(`🎲 Received ${message.itemCount} random items: ${itemList}`);
        } else {
          GameUI.logSystem(`🎲 Received ${message.itemCount} random items!`);
        }
      } else {
        GameUI.logError(`Failed to give items: ${message.message}`);
      }
    });
    
    // ==========================================
    // TRAINING MESSAGE HANDLERS
    // ==========================================
    
    // Handle training response (start)
    Connection.on('training_response', (message) => {
      console.log('[Game] Training response:', message);
      if (message.success) {
        GameUI.logSystem(`🎯 Training started! You'll gain ${message.expPercent}% EXP every ${message.cycleMinutes} minutes.`);
        GameUI.startTrainingUI(message);
      } else {
        GameUI.logError(message.message);
        GameUI.hideTrainingPanel();
      }
    });
    
    // Handle training stopped (manual stop)
    Connection.on('training_stopped', (message) => {
      console.log('[Game] Training stopped:', message);
      GameUI.stopTrainingUI();
      if (message.expGained > 0) {
        GameUI.logSystem(`🎯 ${message.message}`);
        if (message.levelUp) {
          GameUI.logSystem(`🎉 LEVEL UP! You are now level ${message.newLevel}!`);
        }
        // Update character data from server response
        if (message.character && characterData) {
          Object.assign(characterData, message.character);
          GameUI.setCharacterData(characterData);
        }
      } else {
        GameUI.logSystem(`🎯 ${message.message}`);
      }
    });
    
    // Handle training interrupted (moved/zone change)
    Connection.on('training_interrupted', (message) => {
      console.log('[Game] Training interrupted:', message);
      GameUI.stopTrainingUI();
      if (message.expGained > 0) {
        GameUI.logSystem(`🎯 ${message.message}`);
        if (message.levelUp) {
          GameUI.logSystem(`🎉 LEVEL UP! You are now level ${message.newLevel}!`);
        }
        // Update character data from server response
        if (message.character && characterData) {
          Object.assign(characterData, message.character);
          GameUI.setCharacterData(characterData);
        }
      } else {
        GameUI.logSystem(`🎯 Training interrupted. No complete cycles - no EXP gained.`);
      }
    });
    
    // Handle training status response
    Connection.on('training_status', (message) => {
      console.log('[Game] Training status:', message);
      if (message.isTraining) {
        GameUI.updateTrainingStatus(message);
      }
    });
    
    // Handle training result on login
    Connection.on('training_login_result', (message) => {
      console.log('[Game] Training login result:', message);
      if (message.expGained > 0) {
        GameUI.logSystem(`🎯 ${message.message}`);
        if (message.levelUp) {
          GameUI.logSystem(`🎉 LEVEL UP! You are now level ${message.newLevel}!`);
        }
        // Update character data from server response
        if (message.character && characterData) {
          Object.assign(characterData, message.character);
          GameUI.setCharacterData(characterData);
        }
      }
      if (message.continuing) {
        GameUI.logSystem(`🎯 Training continues...`);
        GameUI.startTrainingUI({
          startedAt: message.startedAt,
          cycleMinutes: CONSTANTS.TRAINING_CYCLE_MINUTES,
          expPercent: CONSTANTS.TRAINING_EXP_PERCENT
        });
      }
    });
    
    // ==========================================
    // SHOP MESSAGE HANDLERS
    // ==========================================
    
    // Handle gold update
    Connection.on('gold_update', (message) => {
      if (message.gold !== undefined && characterData) {
        characterData.gold = message.gold;
        GameUI.updateGold(message.gold);
      }
    });
    
    // Handle shop buy response
    Connection.on('shop_buy_response', (message) => {
      if (message.success) {
        console.log('[Game] Purchase successful');
        GameUI.logSystem(`💰 Purchased item for ${message.totalPrice} gold`);
      } else {
        console.log('[Game] Purchase failed:', message.message);
        GameUI.logError(`Purchase failed: ${message.message}`);
      }
    });
    
    // Handle shop sell response
    Connection.on('shop_sell_response', (message) => {
      if (message.success) {
        console.log('[Game] Sale successful');
        GameUI.logSystem(`💰 Sold item for ${message.totalPrice} gold`);
      } else {
        console.log('[Game] Sale failed:', message.message);
        GameUI.logError(`Sale failed: ${message.message}`);
      }
    });
    
    // ==========================================
    // MARKET HANDLERS
    // ==========================================
    
    // Handle market listings data (open market)
    Connection.on(CONSTANTS.MSG_TYPES.MARKET_LISTINGS, (message) => {
      GameUI.openMarket(message);
    });
    
    // Handle market list item response
    Connection.on(CONSTANTS.MSG_TYPES.MARKET_LIST_RESPONSE, (message) => {
      if (message.success) {
        GameUI.logSystem(`📦 ${message.message}`);
      } else {
        GameUI.logError(`Market: ${message.message}`);
      }
    });
    
    // Handle market buy response
    Connection.on(CONSTANTS.MSG_TYPES.MARKET_BUY_RESPONSE, (message) => {
      if (message.success) {
        GameUI.logSystem(`💰 ${message.message}`);
      } else {
        GameUI.logError(`Market: ${message.message}`);
      }
    });
    
    // Handle market cancel response
    Connection.on(CONSTANTS.MSG_TYPES.MARKET_CANCEL_RESPONSE, (message) => {
      if (message.success) {
        GameUI.logSystem(`📦 ${message.message}`);
      } else {
        GameUI.logError(`Market: ${message.message}`);
      }
    });
    
    // Handle market sale notification (seller gets notified)
    Connection.on('market_sale_notification', (message) => {
      GameUI.logSystem(`💰 Your ${message.itemName} was sold for ${message.price} gold! (Payout: ${message.payout} gold after tax)`);
    });
    
    // ==========================================
    // PLAYER INFO CARD HANDLERS
    // ==========================================
    
    // Handle player info response (when clicking another player)
    Connection.on('player_info_response', (message) => {
      if (message.success) {
        console.log('[Game] Player info received:', message.playerData);
        GameUI.showPlayerCard(message.playerData, message.playerId);
      } else {
        console.log('[Game] Failed to get player info:', message.message);
        GameUI.logError(message.message || 'Could not get player info');
      }
    });
    
    // ==========================================
    // PVP COMBAT HANDLERS
    // ==========================================
    
    // Handle PvP combat start
    Connection.on('pvp_combat_start', (message) => {
      console.log('[Game] PvP combat started:', message);
      console.log('[Game] PvP events count:', message.events?.length || 0);
      console.log('[Game] PvP duration:', message.duration);
      console.log('[Game] PvP target:', message.targetPlayerId);
      
      // Lock actions during combat replay
      GameUI.setActionsLocked(true);
      
      // Teleport the ghost to the combat position, face up, and set HP
      const ghost = GhostPlayers.getGhost(message.targetPlayerId);
      console.log('[Game] Found ghost:', ghost ? ghost.name : 'NOT FOUND');
      
      if (ghost) {
        // Teleport ghost below player and make them face up
        GhostPlayers.teleportGhost(message.targetPlayerId, message.target.x, message.target.y, 'up');
        // Initialize ghost HP for combat display
        GhostPlayers.updateGhostHp(message.targetPlayerId, message.target.hp, message.target.maxHp);
      } else {
        console.warn('[Game] Ghost not found for PvP! Available ghosts:', GhostPlayers.getAllGhosts().map(g => g.id));
      }
      
      // Make player face down towards the opponent
      Player.setDirection('down');
      
      // Start combat replay using the CombatManager with PvP flag
      CombatManager.startPvPCombat(message);
    });
    
    // Handle PvP combat end
    Connection.on('pvp_combat_end', (message) => {
      console.log('[Game] PvP combat ended:', message);
      
      // End combat state in CombatManager
      CombatManager.endPvPCombat(message);
      
      // Unlock actions after combat (unless player died)
      if (!message.died) {
        GameUI.setActionsLocked(false);
      }
      
      if (message.playerWon) {
        GameUI.logSystem(`⚔️ ${message.message}`);
        // Update HP
        if (characterData && message.newHp !== undefined) {
          characterData.hp = message.newHp;
          GameUI.setCharacterData(characterData);
        }
      } else {
        GameUI.logError(`💀 ${message.message}`);
        
        if (message.died) {
          // Show death overlay instead of immediate respawn
          GameUI.showDeathOverlay({
            killedBy: 'pvp',
            killerName: message.killerName,
            respawnZone: message.respawnZone,
            respawnZoneName: message.respawnZoneName,
            respawnX: message.respawnX,
            respawnY: message.respawnY,
            respawnHp: message.newHp
          });
        }
      }
    });
    
    // Handle PvP attack error response
    Connection.on('pvp_attack_response', (message) => {
      if (!message.success) {
        GameUI.logError(message.message || 'PvP attack failed');
      }
    });
  }
  
  /**
   * Update character info in UI
   */
  function updateCharacterUI() {
    if (!characterData) return;
    
    const nameEl = document.getElementById('char-name');
    const levelEl = document.getElementById('char-level');
    const hpEl = document.getElementById('char-hp');
    const goldEl = document.getElementById('char-gold');
    
    if (nameEl) nameEl.textContent = characterData.name;
    if (levelEl) levelEl.textContent = `Lv. ${characterData.level}`;
    if (hpEl) hpEl.textContent = `❤️ ${characterData.hp}/${characterData.maxHp}`;
    if (goldEl) goldEl.textContent = `💰 ${characterData.gold}`;
  }
  
  /**
   * Main game loop
   */
  function gameLoop(currentTime) {
    if (!isRunning) return;
    
    // Calculate delta time
    const deltaTime = currentTime - lastTime;
    lastTime = currentTime;
    
    // Update FPS counter
    frameCount++;
    fpsTime += deltaTime;
    if (fpsTime >= 1000) {
      currentFps = frameCount;
      frameCount = 0;
      fpsTime = 0;
      updateFpsDisplay();
    }
    
    // Update game state
    update(deltaTime);
    
    // Render
    render();
    
    // Schedule next frame
    requestAnimationFrame(gameLoop);
  }
  
  /**
   * Handle movement input from Input system
   */
  function handleMovementInput(direction) {
    if (isLoading) return;
    
    // Don't allow movement if player is dead
    if (GameUI.isPlayerDead()) return;
    
    // Try to move player
    Player.tryMove(direction);
  }
  
  /**
   * Handle attack input from Input system
   */
  function handleAttackInput() {
    if (isLoading) return;
    
    // Don't allow attack if player is dead or actions are locked
    if (GameUI.isPlayerDead() || GameUI.areActionsLocked()) return;
    
    const playerX = Player.getX();
    const playerY = Player.getY();
    const direction = Player.getDirection();
    
    // Try to attack
    const result = MobManager.tryAttack(playerX, playerY, direction);
    
    if (result.success) {
      // Send attack to server
      Connection.send({
        type: CONSTANTS.MSG_TYPES.ATTACK_MOB,
        mobId: result.mobId
      });
      
      GameUI.logCombat(`Attacking ${result.mob.name}!`);
    }
  }
  
  /**
   * Handle interact input from Input system (E key)
   */
  function handleInteractInput() {
    if (isLoading) return;
    
    // Don't allow interaction if player is dead or actions are locked
    if (GameUI.isPlayerDead()) return;
    if (GameUI.areActionsLocked()) return;
    
    const playerX = Player.getX();
    const playerY = Player.getY();
    const currentZone = ZoneManager.getCurrentZone();
    
    // Check for adjacent shop
    const adjacentShop = ZoneManager.getAdjacentShop(playerX, playerY);
    if (adjacentShop) {
      // Open shop UI
      GameUI.openShop(adjacentShop);
      
      return;
    }
    
    // Check for adjacent market NPC
    const adjacentMarketNpc = ZoneManager.getAdjacentMarketNpc(playerX, playerY);
    if (adjacentMarketNpc) {
      // Request market data from server
      Connection.send({ type: CONSTANTS.MSG_TYPES.MARKET_OPEN });
      return;
    }
    
    // Check for adjacent spawn beacon
    if (currentZone && currentZone.objects) {
      for (const obj of currentZone.objects) {
        if (obj.type === 'spawn_beacon') {
          const objWidth = obj.width || 1;
          const objHeight = obj.height || 1;
          
          // Check if player is adjacent to or on the beacon
          const isAdjacent = playerX >= obj.x - 1 && playerX <= obj.x + objWidth &&
                            playerY >= obj.y - 1 && playerY <= obj.y + objHeight;
          
          if (isAdjacent) {
            // Show beacon popup
            GameUI.showBeaconPopup({
              zoneId: currentZone.id,
              zoneName: currentZone.name,
              x: playerX,
              y: playerY
            });
            
            return;
          }
        }
      }
    }
    
    // Check for adjacent castle
    const adjacentCastle = ZoneManager.getAdjacentCastle(playerX, playerY);
    if (adjacentCastle) {
      // Request castle info from server
      Connection.send({
        type: CONSTANTS.MSG_TYPES.GET_CASTLE_INFO,
        castleId: adjacentCastle.id
      });
      
      return;
    }
    
    // Check for adjacent boss
    const adjacentBoss = BossManager.getAdjacentBoss(playerX, playerY);
    if (adjacentBoss) {
      // If boss panel is already open for this boss, trigger attack instead
      const existingPanel = document.getElementById('boss-info-panel');
      if (existingPanel) {
        GameUI.attackBoss();
        return;
      }
      
      // Request boss info from server
      Connection.send({
        type: CONSTANTS.MSG_TYPES.GET_BOSS_INFO,
        bossId: adjacentBoss.id
      });
      
      return;
    }
    
    // Check for adjacent training dummy
    const adjacentDummy = ZoneManager.getAdjacentTrainingDummy(playerX, playerY);
    if (adjacentDummy) {
      // Show training panel
      GameUI.showTrainingPanel(adjacentDummy);
      
      return;
    }
    
    // Future: Check for other interactables (NPCs, objects, etc.)
  }
  
  /**
   * Handle canvas click for player interaction
   */
  function handleCanvasClick(event) {
    if (isLoading) return;
    
    // Get click position relative to canvas (screen space)
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const screenX = (event.clientX - rect.left) * scaleX;
    const screenY = (event.clientY - rect.top) * scaleY;
    
    // Convert screen coordinates to world coordinates (accounts for camera zoom + offset)
    const world = Camera.screenToWorld(screenX, screenY);
    const clickX = world.x;
    const clickY = world.y;
    
    // Check if clicked on a ghost player (using world coordinates)
    const ghost = GhostPlayers.getGhostAtScreenPosition(clickX, clickY);
    if (ghost) {
      console.log('[Game] Clicked on player:', ghost.name);
      
      // Request player info from server
      Connection.send({
        type: 'get_player_info',
        playerId: ghost.id
      });
      
      return;
    }
    
    // Future: Could handle other click interactions here
  }
  
  /**
   * Update game state
   */
  function update(deltaTime) {
    if (isLoading) return;
    
    // Update player (handles smooth movement animation)
    Player.update(deltaTime);
    
    // Update camera to follow player (uses smooth pixel position)
    const pp = Player.getPixelPosition();
    Camera.update(pp.x, pp.y);
    
    // Update ghost players animation
    GhostPlayers.update(deltaTime);
    
    // Update mobs animation
    MobManager.update(deltaTime);
    
    // Update bosses animation
    BossManager.update(deltaTime);
    
    // Update combat replay
    CombatManager.update(deltaTime);
    
    // Check for continuous movement (held keys)
    // Only check when player is not currently moving and not in combat
    if (!Player.getIsMoving() && !Player.isInCombat()) {
      const heldDirection = Input.getHeldDirection();
      if (heldDirection) {
        Player.tryMove(heldDirection);
      }
    }
    
    // Check if castle card should close (player walked away)
    if (GameUI.isCastleCardOpen()) {
      const adjacentCastle = ZoneManager.getAdjacentCastle(Player.getX(), Player.getY());
      if (!adjacentCastle || adjacentCastle.id !== GameUI.getCurrentCastleId()) {
        GameUI.closeCastleCard();
      }
    }
  }
  
  /**
   * Render the game
   */
  function render() {
    // Clear canvas
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    if (isLoading) {
      // Draw loading screen
      renderLoadingScreen();
      return;
    }
    
    // Apply camera transform (zoom + follow player)
    ctx.save();
    Camera.applyTransform(ctx);
    
    // Render the tilemap
    TilemapRenderer.render(ctx);
    
    // Render shops on the map
    TilemapRenderer.renderShops(ctx);
    
    // Render market NPCs
    TilemapRenderer.renderMarketNpcs(ctx);
    
    // Render zone objects (spawn beacons, etc.)
    TilemapRenderer.renderZoneObjects(ctx);
    
    // Render mobs (behind player) — camera offset handled by ctx transform, pass 0,0
    MobManager.render(ctx, 0, 0);
    
    // Render bosses (behind player, but after mobs so they're more visible)
    BossManager.render(ctx, 0, 0);
    
    // Render ghost players (behind local player)
    GhostPlayers.render(ctx);
    
    // Render player
    Player.render(ctx);
    
    // Render damage numbers (on top of everything)
    MobManager.renderDamageNumbers(ctx, 0, 0);
    CombatManager.renderDamageNumbers(ctx, 0, 0);
    
    // Render debug grid if enabled
    if (DEBUG.showGrid) {
      TilemapRenderer.renderDebugGrid(ctx, DEBUG.showCoords);
    }
    
    // Restore original transform (back to screen space)
    ctx.restore();
    
    // Render all names/labels on the text overlay canvas (crisp, not affected by pixelated/blur)
    if (textCtx) {
      textCtx.clearRect(0, 0, textCanvas.width, textCanvas.height);
      const px = Player.getX();
      const py = Player.getY();
      TilemapRenderer.renderShopNames(textCtx, px, py);
      TilemapRenderer.renderObjectNames(textCtx, px, py);
      TilemapRenderer.renderMarketNpcNames(textCtx, px, py);
      MobManager.renderNames(textCtx);
      BossManager.renderNames(textCtx, px, py);
      GhostPlayers.renderNames(textCtx);
      Player.renderNameScreen(textCtx);
      
      // Render boss cooldown timers at top of screen
      BossManager.renderCooldownTimers(textCtx, textCanvas.width);
    }
  }
  
  /**
   * Render loading screen
   */
  function renderLoadingScreen() {
    ctx.fillStyle = '#ffffff';
    ctx.font = '24px Verdana';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Loading...', canvas.width / 2, canvas.height / 2);
  }
  
  /**
   * Update FPS display
   */
  function updateFpsDisplay() {
    const fpsEl = document.getElementById('fps');
    if (fpsEl) {
      fpsEl.textContent = `FPS: ${currentFps}`;
    }
  }
  
  /**
   * Toggle debug grid
   */
  function toggleDebugGrid() {
    DEBUG.showGrid = !DEBUG.showGrid;
    console.log(`[Game] Debug grid: ${DEBUG.showGrid ? 'ON' : 'OFF'}`);
    
    // Update checkbox if it exists
    const checkbox = document.getElementById('toggle-collision');
    if (checkbox) checkbox.checked = DEBUG.showGrid;
  }
  
  /**
   * Toggle coordinate display
   */
  function toggleCoords() {
    DEBUG.showCoords = !DEBUG.showCoords;
    console.log(`[Game] Coordinates: ${DEBUG.showCoords ? 'ON' : 'OFF'}`);
    
    // Update checkbox if it exists
    const checkbox = document.getElementById('toggle-coords');
    if (checkbox) checkbox.checked = DEBUG.showCoords;
  }
  
  /**
   * Initialize admin panel
   */
  function initAdminPanel() {
    const panel = document.getElementById('admin-panel');
    const toggleCollision = document.getElementById('toggle-collision');
    const toggleCoordsCheckbox = document.getElementById('toggle-coords');
    const minimizeBtn = document.getElementById('admin-minimize-btn');
    
    if (!panel) return;
    
    // Setup collision toggle
    if (toggleCollision) {
      toggleCollision.addEventListener('change', (e) => {
        DEBUG.showGrid = e.target.checked;
        console.log(`[Admin] Collision grid: ${DEBUG.showGrid ? 'ON' : 'OFF'}`);
      });
    }
    
    // Setup coords toggle
    if (toggleCoordsCheckbox) {
      toggleCoordsCheckbox.addEventListener('change', (e) => {
        DEBUG.showCoords = e.target.checked;
        console.log(`[Admin] Coordinates: ${DEBUG.showCoords ? 'ON' : 'OFF'}`);
      });
    }
    
    // Setup minimize/maximize button
    if (minimizeBtn) {
      minimizeBtn.addEventListener('click', () => {
        toggleAdminPanelMinimize();
      });
    }
    
    console.log("[Admin] Panel initialized");
  }
  
  /**
   * Toggle admin panel minimize state
   */
  function toggleAdminPanelMinimize() {
    const panel = document.getElementById('admin-panel');
    const minimizeBtn = document.getElementById('admin-minimize-btn');
    
    if (panel && minimizeBtn) {
      const isMinimized = panel.classList.toggle('minimized');
      minimizeBtn.textContent = isMinimized ? '+' : '−';
      minimizeBtn.title = isMinimized ? 'Expand' : 'Minimize';
    }
  }
  
  /**
   * Show admin panel (for admin users)
   */
  function showAdminPanel() {
    const panel = document.getElementById('admin-panel');
    if (panel) {
      panel.classList.remove('hidden');
    }
  }
  
  /**
   * Hide admin panel
   */
  function hideAdminPanel() {
    const panel = document.getElementById('admin-panel');
    if (panel) {
      panel.classList.add('hidden');
    }
  }
  
  /**
   * Set admin status (called from server auth or dev console)
   * In production, only the server should grant admin status
   * For dev: Game.setAdminStatus(true) in console
   */
  function setAdminStatus(isAdmin) {
    // Only allow enabling in development
    const isLocalDev = window.location.hostname === 'localhost' || 
                       window.location.hostname === '127.0.0.1';
    
    if (isAdmin && !isLocalDev) {
      console.warn('[Security] Admin status can only be set by server in production');
      // In production, this should come from server auth
      // For now, we'll allow it but log a warning
    }
    
    DEBUG.isAdmin = isAdmin;
    
    if (isAdmin) {
      initAdminPanel();
      showAdminPanel();
      console.log('[Admin] Admin mode enabled - Panel is now visible');
      GameUI.logSystem('Admin mode enabled');
    } else {
      hideAdminPanel();
    }
  }
  
  /**
   * Get canvas context (for other modules)
   */
  function getContext() {
    return ctx;
  }
  
  /**
   * Get canvas element (for other modules)
   */
  function getCanvas() {
    return canvas;
  }
  
  /**
   * Get character data
   */
  function getCharacterData() {
    return characterData;
  }
  
  // Public API
  return {
    init,
    start,
    getContext,
    getCanvas,
    getCharacterData,
    toggleDebugGrid,
    toggleCoords,
    toggleAdminPanelMinimize,
    showAdminPanel,
    hideAdminPanel,
    setAdminStatus
  };
})();

// Start auth system when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  Auth.init();
});
