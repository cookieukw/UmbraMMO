/**
 * UMBRA ONLINE - Map Editor Module
 * Admin tool for editing zone tiles, placing objects, and managing zone data
 */

const MapEditor = (function() {
  // Editor state
  let enabled = false;
  let currentTool = 'brush';      // 'brush', 'fill', 'eraser', 'picker', 'object', 'delete'
  let currentTileType = 0;        // Selected tile type from CONSTANTS.TILE_TYPES
  let currentObjectType = null;   // Selected object type for placement
  let brushSize = 1;              // Brush radius
  let gridVisible = true;
  let isDragging = false;
  let lastPaintedTile = null;
  
  // Undo/Redo stacks
  let undoStack = [];
  let redoStack = [];
  const MAX_UNDO_STATES = 50;
  
  // Canvas references
  let overlayCanvas = null;
  let overlayCtx = null;
  
  // Available bosses (loaded from server)
  let availableBosses = [];
  let pendingBossPlacement = null; // {x, y} - tile waiting for boss selection
  
  // Object types that can be placed
  const OBJECT_TYPES = {
    spawn_beacon: { name: 'Spawn Beacon', icon: '🔥', width: 2, height: 1 },
    shop: { name: 'Shop', icon: '🏪', width: 1, height: 1 },
    training_dummy: { name: 'Training Dummy', icon: '🎯', width: 1, height: 1 },
    castle: { name: 'Castle', icon: '🏰', width: 2, height: 2 },
    mob_spawn: { name: 'Mob Spawn', icon: '👾', width: 1, height: 1 },
    boss_spawn: { name: 'Boss Spawn', icon: '💀', width: 1, height: 1 }
  };
  
  // Tile type info for palette
  const TILE_INFO = {
    0: { name: 'Walkable', color: 'rgba(0, 255, 0, 0.4)', icon: '🚶' },
    1: { name: 'Blocked', color: 'rgba(255, 0, 0, 0.4)', icon: '🧱' },
    2: { name: 'Exit North', color: 'rgba(0, 255, 255, 0.4)', icon: '⬆️' },
    3: { name: 'Exit East', color: 'rgba(0, 255, 255, 0.4)', icon: '➡️' },
    4: { name: 'Exit South', color: 'rgba(0, 255, 255, 0.4)', icon: '⬇️' },
    5: { name: 'Exit West', color: 'rgba(0, 255, 255, 0.4)', icon: '⬅️' },
    6: { name: 'Water', color: 'rgba(0, 100, 255, 0.4)', icon: '🌊' },
    7: { name: 'Interactable', color: 'rgba(255, 255, 0, 0.4)', icon: '⭐' }
  };
  
  /**
   * Initialize the map editor
   */
  function init() {
    createEditorUI();
    createOverlayCanvas();
    setupEventListeners();
    loadAvailableBosses();
    console.log('[MapEditor] Initialized');
  }
  
  /**
   * Load available bosses from the server
   */
  async function loadAvailableBosses() {
    try {
      const response = await fetch('/api/bosses');
      if (response.ok) {
        availableBosses = await response.json();
        console.log(`[MapEditor] Loaded ${availableBosses.length} bosses`);
      }
    } catch (err) {
      console.warn('[MapEditor] Could not load bosses, using fallback list');
      // Fallback: common boss IDs
      availableBosses = [
        { id: 'evil_bird', name: 'Evil Bird', level: 1 },
        { id: 'cocoon', name: 'Cocoon', level: 1 },
        { id: 'pistol_darter', name: 'Pistol Darter', level: 1 },
        { id: 'alpha_boar', name: 'Alpha Boar', level: 5 },
        { id: 'kong_bong', name: 'Kong Bong', level: 5 },
        { id: 'giant_spider', name: 'Silk Mother', level: 5 },
        { id: 'cavern_slime', name: 'Mutant Snail', level: 5 },
        { id: 'hive_queen', name: 'Hive Queen', level: 5 },
        { id: 'giant_rat_king', name: 'Giant Rat King', level: 5 },
        { id: 'goblin_raider', name: 'Goblin Raider', level: 5 },
        { id: 'goblin_warlord', name: 'Goblin Warlord', level: 10 },
        { id: 'king_gloopus', name: 'King Gloopus', level: 10 },
        { id: 'poison_widow', name: 'Poison Widow', level: 10 },
        { id: 'old_oak', name: 'Old Oak', level: 10 },
        { id: 'mimic', name: 'Mimic', level: 10 },
        { id: 'lava_moth', name: 'Lava Moth', level: 15 },
        { id: 'emperor_scorpius', name: 'Emperor Scorpius', level: 20 },
        { id: 'fat_fur', name: 'Fat Fur', level: 20 },
        { id: 'witch_latiarix', name: 'Witch Latiarix', level: 20 },
        { id: 'wearied_dragon', name: 'Wearied Dragon', level: 30 },
        { id: 'kobold_leader', name: 'Kobold Leader', level: 30 },
        { id: 'abomination', name: 'Abomination', level: 35 },
        { id: 'captain_chieftain', name: 'Admiral Ulfric', level: 45 },
        { id: 'turs_anvil', name: "Tur's Anvil", level: 45 },
        { id: 'crystal_golem', name: 'Crystal Golem', level: 50 },
        { id: 'leviathan', name: 'Leviathan', level: 50 },
        { id: 'elder_titan', name: 'Elder Titan', level: 60 },
        { id: 'dragon_lord', name: 'Dragon Lord', level: 60 },
        { id: 'neptunus', name: 'Neptunus', level: 60 },
        { id: 'death_knight_commander', name: 'Fallen Hero Benjamin', level: 60 }
      ];
    }
  }
  
  /**
   * Show boss selection dialog
   */
  function showBossSelectionDialog(tile) {
    // Remove existing dialog if any
    const existing = document.getElementById('boss-selection-dialog');
    if (existing) existing.remove();
    
    const dialog = document.createElement('div');
    dialog.id = 'boss-selection-dialog';
    dialog.className = 'boss-selection-dialog';
    dialog.innerHTML = `
      <div class="boss-selection-content">
        <div class="boss-selection-header">
          <span>Select Boss for (${tile.x}, ${tile.y})</span>
          <button class="boss-selection-close" onclick="MapEditor.closeBossDialog()">✕</button>
        </div>
        <div class="boss-selection-search">
          <input type="text" id="boss-search-input" placeholder="Search bosses..." oninput="MapEditor.filterBosses(this.value)">
        </div>
        <div class="boss-selection-list" id="boss-list">
          ${availableBosses.map(boss => `
            <div class="boss-selection-item" data-boss-id="${boss.id}" onclick="MapEditor.selectBoss('${boss.id}')">
              <span class="boss-name">${boss.name}</span>
              <span class="boss-level">Lv.${boss.level}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
    
    document.body.appendChild(dialog);
    pendingBossPlacement = tile;
    
    // Focus search input
    setTimeout(() => {
      const input = document.getElementById('boss-search-input');
      if (input) input.focus();
    }, 100);
  }
  
  /**
   * Filter bosses in the selection dialog
   */
  function filterBosses(query) {
    const listItems = document.querySelectorAll('.boss-selection-item');
    const lowerQuery = query.toLowerCase();
    
    listItems.forEach(item => {
      const name = item.querySelector('.boss-name').textContent.toLowerCase();
      const id = item.dataset.bossId.toLowerCase();
      item.style.display = (name.includes(lowerQuery) || id.includes(lowerQuery)) ? '' : 'none';
    });
  }
  
  /**
   * Select a boss for placement
   */
  function selectBoss(bossId) {
    if (!pendingBossPlacement) return;
    
    const zone = typeof ZoneManager !== 'undefined' ? ZoneManager.getCurrentZone() : null;
    if (!zone) return;
    
    // Save state for undo
    saveUndoState();
    
    // Add the boss spawn
    if (!zone.bossSpawns) zone.bossSpawns = [];
    zone.bossSpawns.push({ 
      bossType: bossId, 
      x: pendingBossPlacement.x, 
      y: pendingBossPlacement.y 
    });
    
    const boss = availableBosses.find(b => b.id === bossId);
    const bossName = boss ? boss.name : bossId;
    
    console.log(`[MapEditor] Placed boss "${bossName}" (${bossId}) at (${pendingBossPlacement.x}, ${pendingBossPlacement.y})`);
    
    if (typeof GameUI !== 'undefined' && GameUI.logSystem) {
      GameUI.logSystem(`Placed boss "${bossName}" at (${pendingBossPlacement.x}, ${pendingBossPlacement.y})`);
    }
    
    closeBossDialog();
    render();
  }
  
  /**
   * Close the boss selection dialog
   */
  function closeBossDialog() {
    const dialog = document.getElementById('boss-selection-dialog');
    if (dialog) dialog.remove();
    pendingBossPlacement = null;
  }

  /**
   * Create the overlay canvas for editor rendering
   */
  function createOverlayCanvas() {
    // Remove existing overlay if present
    const existing = document.getElementById('map-editor-overlay');
    if (existing) {
      existing.remove();
    }
    
    const gameCanvas = document.getElementById('game-canvas');
    if (!gameCanvas) {
      console.warn('[MapEditor] Game canvas not found');
      return;
    }
    
    // Get the actual zone dimensions
    const zone = typeof ZoneManager !== 'undefined' ? ZoneManager.getCurrentZone() : null;
    const width = zone ? zone.width * CONSTANTS.TILE_SIZE : gameCanvas.width;
    const height = zone ? zone.height * CONSTANTS.TILE_SIZE : gameCanvas.height;
    
    // Get the displayed size of the game canvas (may be scaled)
    const displayWidth = gameCanvas.offsetWidth || gameCanvas.clientWidth || width;
    const displayHeight = gameCanvas.offsetHeight || gameCanvas.clientHeight || height;
    
    // Create overlay canvas
    overlayCanvas = document.createElement('canvas');
    overlayCanvas.id = 'map-editor-overlay';
    overlayCanvas.className = 'map-editor-overlay';
    // Internal resolution matches zone size
    overlayCanvas.width = width;
    overlayCanvas.height = height;
    // Display size matches the game canvas display
    overlayCanvas.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: ${displayWidth}px;
      height: ${displayHeight}px;
      pointer-events: auto;
      z-index: 50;
      display: none;
      cursor: crosshair;
    `;
    
    // Position it over the game canvas
    const canvasContainer = gameCanvas.parentElement;
    if (canvasContainer) {
      canvasContainer.style.position = 'relative';
      canvasContainer.appendChild(overlayCanvas);
    }
    
    overlayCtx = overlayCanvas.getContext('2d');
    console.log(`[MapEditor] Overlay canvas created: ${width}x${height} (displayed: ${displayWidth}x${displayHeight})`);
  }
  
  /**
   * Sync overlay canvas size with zone
   */
  function syncOverlaySize() {
    if (!overlayCanvas) return;
    
    const zone = typeof ZoneManager !== 'undefined' ? ZoneManager.getCurrentZone() : null;
    if (!zone) return;
    
    const gameCanvas = document.getElementById('game-canvas');
    const width = zone.width * CONSTANTS.TILE_SIZE;
    const height = zone.height * CONSTANTS.TILE_SIZE;
    const displayWidth = gameCanvas ? (gameCanvas.offsetWidth || width) : width;
    const displayHeight = gameCanvas ? (gameCanvas.offsetHeight || height) : height;
    
    overlayCanvas.width = width;
    overlayCanvas.height = height;
    overlayCanvas.style.width = `${displayWidth}px`;
    overlayCanvas.style.height = `${displayHeight}px`;
    
    console.log(`[MapEditor] Overlay synced to zone: ${width}x${height}`);
  }
  
  /**
   * Create the editor UI panel
   */
  function createEditorUI() {
    // Check if UI already exists
    if (document.getElementById('map-editor-panel')) return;
    
    const panel = document.createElement('div');
    panel.id = 'map-editor-panel';
    panel.className = 'map-editor-panel hidden';
    
    panel.innerHTML = `
      <div class="map-editor-header">
        <span class="map-editor-title">🗺️ Map Editor</span>
        <button class="map-editor-close" onclick="MapEditor.toggle()">✕</button>
      </div>
      <div class="map-editor-body">
        <!-- Tools -->
        <div class="map-editor-section">
          <div class="map-editor-section-title">Tools</div>
          <div class="map-editor-tools">
            <button class="map-editor-tool-btn active" data-tool="brush" title="Brush (B)">🖌️</button>
            <button class="map-editor-tool-btn" data-tool="fill" title="Fill (F)">🪣</button>
            <button class="map-editor-tool-btn" data-tool="eraser" title="Eraser (E)">🧹</button>
            <button class="map-editor-tool-btn" data-tool="picker" title="Picker (I)">💉</button>
            <button class="map-editor-tool-btn" data-tool="object" title="Objects (O)">📦</button>
            <button class="map-editor-tool-btn" data-tool="delete" title="Delete Object (X)">❌</button>
          </div>
        </div>
        
        <!-- Brush Size -->
        <div class="map-editor-section">
          <div class="map-editor-section-title">Brush Size: <span id="brush-size-value">1</span></div>
          <input type="range" id="brush-size-slider" min="1" max="5" value="1" class="map-editor-slider">
        </div>
        
        <!-- Tile Palette -->
        <div class="map-editor-section" id="tile-palette-section">
          <div class="map-editor-section-title">Tile Palette</div>
          <div class="map-editor-palette" id="tile-palette">
            <!-- Tiles added dynamically -->
          </div>
        </div>
        
        <!-- Object Palette (hidden by default) -->
        <div class="map-editor-section hidden" id="object-palette-section">
          <div class="map-editor-section-title">Objects</div>
          <div class="map-editor-palette" id="object-palette">
            <!-- Objects added dynamically -->
          </div>
        </div>
        
        <!-- Actions -->
        <div class="map-editor-section">
          <div class="map-editor-section-title">Actions</div>
          <div class="map-editor-actions">
            <button class="map-editor-action-btn" onclick="MapEditor.undo()" title="Undo (Ctrl+Z)">↩️ Undo</button>
            <button class="map-editor-action-btn" onclick="MapEditor.redo()" title="Redo (Ctrl+Y)">↪️ Redo</button>
            <button class="map-editor-action-btn" onclick="MapEditor.clearZone()">🗑️ Clear</button>
            <button class="map-editor-action-btn map-editor-save-btn" onclick="MapEditor.saveZone()">💾 Save</button>
          </div>
        </div>
        
        <!-- Zone Info -->
        <div class="map-editor-section">
          <div class="map-editor-section-title">Zone Info</div>
          <div class="map-editor-zone-info" id="zone-info">
            <div>Zone: <span id="editor-zone-id">--</span></div>
            <div>Size: <span id="editor-zone-size">--</span></div>
            <div>Cursor: <span id="editor-cursor-pos">--</span></div>
          </div>
        </div>
        
        <!-- Options -->
        <div class="map-editor-section">
          <div class="map-editor-section-title">Options</div>
          <div class="map-editor-options">
            <label class="map-editor-option">
              <input type="checkbox" id="editor-show-grid" checked>
              <span>Show Grid</span>
            </label>
            <label class="map-editor-option">
              <input type="checkbox" id="editor-show-objects" checked>
              <span>Show Objects</span>
            </label>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(panel);
    
    // Populate tile palette
    populateTilePalette();
    populateObjectPalette();
  }
  
  /**
   * Populate the tile palette
   */
  function populateTilePalette() {
    const palette = document.getElementById('tile-palette');
    if (!palette) return;
    
    palette.innerHTML = '';
    
    for (const [type, info] of Object.entries(TILE_INFO)) {
      const tile = document.createElement('div');
      tile.className = 'map-editor-palette-item';
      if (parseInt(type) === currentTileType) {
        tile.classList.add('selected');
      }
      tile.dataset.type = type;
      tile.title = info.name;
      tile.innerHTML = `
        <div class="palette-item-preview" style="background: ${info.color}">${info.icon}</div>
        <div class="palette-item-name">${info.name}</div>
      `;
      tile.addEventListener('click', () => selectTileType(parseInt(type)));
      palette.appendChild(tile);
    }
  }
  
  /**
   * Populate the object palette
   */
  function populateObjectPalette() {
    const palette = document.getElementById('object-palette');
    if (!palette) return;
    
    palette.innerHTML = '';
    
    for (const [type, info] of Object.entries(OBJECT_TYPES)) {
      const obj = document.createElement('div');
      obj.className = 'map-editor-palette-item';
      obj.dataset.type = type;
      obj.title = info.name;
      obj.innerHTML = `
        <div class="palette-item-preview">${info.icon}</div>
        <div class="palette-item-name">${info.name}</div>
      `;
      obj.addEventListener('click', () => selectObjectType(type));
      palette.appendChild(obj);
    }
  }
  
  /**
   * Setup event listeners
   */
  function setupEventListeners() {
    // Tool buttons
    document.querySelectorAll('.map-editor-tool-btn').forEach(btn => {
      btn.addEventListener('click', () => setTool(btn.dataset.tool));
    });
    
    // Brush size slider
    const brushSlider = document.getElementById('brush-size-slider');
    if (brushSlider) {
      brushSlider.addEventListener('input', (e) => {
        brushSize = parseInt(e.target.value);
        document.getElementById('brush-size-value').textContent = brushSize;
      });
    }
    
    // Grid toggle
    const gridToggle = document.getElementById('editor-show-grid');
    if (gridToggle) {
      gridToggle.addEventListener('change', (e) => {
        gridVisible = e.target.checked;
        render();
      });
    }
    
    // Keyboard shortcuts
    document.addEventListener('keydown', handleKeyDown);
  }
  
  /**
   * Handle keyboard shortcuts
   */
  function handleKeyDown(e) {
    if (!enabled) return;
    
    // Don't handle if typing in input
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    
    const key = e.key.toLowerCase();
    
    // Tool shortcuts
    if (key === 'b') setTool('brush');
    else if (key === 'f') setTool('fill');
    else if (key === 'e') setTool('eraser');
    else if (key === 'i') setTool('picker');
    else if (key === 'o') setTool('object');
    else if (key === 'x') setTool('delete');
    
    // Undo/Redo
    else if (key === 'z' && e.ctrlKey) {
      e.preventDefault();
      undo();
    }
    else if (key === 'y' && e.ctrlKey) {
      e.preventDefault();
      redo();
    }
    
    // Number keys for tile types 1-8
    else if (key >= '1' && key <= '8') {
      const type = parseInt(key) - 1;
      if (TILE_INFO[type]) {
        selectTileType(type);
      }
    }
    
    // Bracket keys for brush size
    else if (key === '[') {
      brushSize = Math.max(1, brushSize - 1);
      updateBrushSizeUI();
    }
    else if (key === ']') {
      brushSize = Math.min(5, brushSize + 1);
      updateBrushSizeUI();
    }
  }
  
  /**
   * Update brush size UI elements
   */
  function updateBrushSizeUI() {
    const slider = document.getElementById('brush-size-slider');
    const value = document.getElementById('brush-size-value');
    if (slider) slider.value = brushSize;
    if (value) value.textContent = brushSize;
  }
  
  /**
   * Set the current tool
   */
  function setTool(tool) {
    currentTool = tool;
    
    // Update UI
    document.querySelectorAll('.map-editor-tool-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tool === tool);
    });
    
    // Show/hide object palette
    const tilePalette = document.getElementById('tile-palette-section');
    const objectPalette = document.getElementById('object-palette-section');
    
    if (tool === 'object' || tool === 'delete') {
      tilePalette?.classList.add('hidden');
      objectPalette?.classList.remove('hidden');
    } else {
      tilePalette?.classList.remove('hidden');
      objectPalette?.classList.add('hidden');
    }
    
    console.log(`[MapEditor] Tool: ${tool}`);
  }
  
  /**
   * Select a tile type
   */
  function selectTileType(type) {
    currentTileType = type;
    
    // Update UI
    document.querySelectorAll('#tile-palette .map-editor-palette-item').forEach(item => {
      item.classList.toggle('selected', parseInt(item.dataset.type) === type);
    });
    
    console.log(`[MapEditor] Tile type: ${TILE_INFO[type]?.name || type}`);
  }
  
  /**
   * Select an object type
   */
  function selectObjectType(type) {
    currentObjectType = type;
    
    // Update UI
    document.querySelectorAll('#object-palette .map-editor-palette-item').forEach(item => {
      item.classList.toggle('selected', item.dataset.type === type);
    });
    
    console.log(`[MapEditor] Object type: ${OBJECT_TYPES[type]?.name || type}`);
  }
  
  /**
   * Toggle the editor on/off
   */
  function toggle() {
    enabled = !enabled;
    
    const panel = document.getElementById('map-editor-panel');
    
    if (enabled) {
      // Revert camera zoom to 1x for editing
      if (typeof Camera !== 'undefined' && Camera.setZoom) {
        Camera.setZoom(1);
      }

      // Create/recreate overlay canvas to ensure correct size
      createOverlayCanvas();
      
      const overlay = document.getElementById('map-editor-overlay');
      
      panel?.classList.remove('hidden');
      if (overlay) overlay.style.display = 'block';
      
      // Setup canvas event listeners
      setupCanvasListeners();
      
      // Update zone info
      updateZoneInfo();
      
      console.log('[MapEditor] Enabled');
      if (typeof GameUI !== 'undefined' && GameUI.logSystem) {
        GameUI.logSystem('Map Editor enabled - Click tiles to edit');
      }
      
      render();
    } else {
      // Restore camera zoom to default
      if (typeof Camera !== 'undefined' && Camera.resetZoom) {
        Camera.resetZoom();
      }

      const overlay = document.getElementById('map-editor-overlay');
      
      panel?.classList.add('hidden');
      if (overlay) overlay.style.display = 'none';
      
      // Remove canvas event listeners
      removeCanvasListeners();
      
      console.log('[MapEditor] Disabled');
      if (typeof GameUI !== 'undefined' && GameUI.logSystem) {
        GameUI.logSystem('Map Editor disabled');
      }
    }
    
    return enabled;
  }
  
  /**
   * Setup canvas event listeners for editing
   */
  function setupCanvasListeners() {
    if (!overlayCanvas) return;
    
    overlayCanvas.addEventListener('mousedown', handleMouseDown);
    overlayCanvas.addEventListener('mousemove', handleMouseMove);
    overlayCanvas.addEventListener('mouseup', handleMouseUp);
    overlayCanvas.addEventListener('mouseleave', handleMouseLeave);
    overlayCanvas.addEventListener('contextmenu', handleContextMenu);
  }
  
  /**
   * Remove canvas event listeners
   */
  function removeCanvasListeners() {
    if (!overlayCanvas) return;
    
    overlayCanvas.removeEventListener('mousedown', handleMouseDown);
    overlayCanvas.removeEventListener('mousemove', handleMouseMove);
    overlayCanvas.removeEventListener('mouseup', handleMouseUp);
    overlayCanvas.removeEventListener('mouseleave', handleMouseLeave);
    overlayCanvas.removeEventListener('contextmenu', handleContextMenu);
  }
  
  /**
   * Get tile coordinates from mouse event
   */
  function getTileFromMouse(e) {
    const rect = overlayCanvas.getBoundingClientRect();
    
    // Calculate the scale factor between displayed size and internal resolution
    const scaleX = overlayCanvas.width / rect.width;
    const scaleY = overlayCanvas.height / rect.height;
    
    // Get the mouse position relative to the canvas and scale it
    const canvasX = (e.clientX - rect.left) * scaleX;
    const canvasY = (e.clientY - rect.top) * scaleY;
    
    // Convert to tile coordinates
    const x = Math.floor(canvasX / CONSTANTS.TILE_SIZE);
    const y = Math.floor(canvasY / CONSTANTS.TILE_SIZE);
    
    return { x, y };
  }
  
  /**
   * Handle mouse down on canvas
   */
  function handleMouseDown(e) {
    if (e.button !== 0) return; // Left click only
    
    isDragging = true;
    const tile = getTileFromMouse(e);
    
    // Save state for undo before starting paint
    saveUndoState();
    
    handleTileAction(tile);
    lastPaintedTile = tile;
  }
  
  /**
   * Handle mouse move on canvas
   */
  function handleMouseMove(e) {
    const tile = getTileFromMouse(e);
    
    // Update cursor position display
    updateCursorPosition(tile);
    
    // Paint while dragging
    if (isDragging && currentTool !== 'fill' && currentTool !== 'object') {
      // Don't repaint the same tile
      if (!lastPaintedTile || tile.x !== lastPaintedTile.x || tile.y !== lastPaintedTile.y) {
        handleTileAction(tile);
        lastPaintedTile = tile;
      }
    }
    
    // Render preview
    render(tile);
  }
  
  /**
   * Handle mouse up on canvas
   */
  function handleMouseUp(e) {
    isDragging = false;
    lastPaintedTile = null;
  }
  
  /**
   * Handle mouse leave
   */
  function handleMouseLeave(e) {
    isDragging = false;
    lastPaintedTile = null;
    updateCursorPosition(null);
    render();
  }
  
  /**
   * Handle right click (context menu)
   */
  function handleContextMenu(e) {
    e.preventDefault();
    
    // Right-click to pick tile type
    const tile = getTileFromMouse(e);
    const zone = typeof ZoneManager !== 'undefined' ? ZoneManager.getCurrentZone() : null;
    
    if (zone && zone.tiles && zone.tiles[tile.y] && zone.tiles[tile.y][tile.x] !== undefined) {
      selectTileType(zone.tiles[tile.y][tile.x]);
    }
  }
  
  /**
   * Handle tile action based on current tool
   */
  function handleTileAction(tile) {
    const zone = typeof ZoneManager !== 'undefined' ? ZoneManager.getCurrentZone() : null;
    if (!zone || !zone.tiles) return;
    
    switch (currentTool) {
      case 'brush':
        paintTiles(tile, currentTileType);
        break;
      case 'eraser':
        paintTiles(tile, 0); // Walkable
        break;
      case 'fill':
        floodFill(tile, currentTileType);
        break;
      case 'picker':
        if (zone.tiles[tile.y] && zone.tiles[tile.y][tile.x] !== undefined) {
          selectTileType(zone.tiles[tile.y][tile.x]);
          setTool('brush');
        }
        break;
      case 'object':
        placeObject(tile);
        break;
      case 'delete':
        deleteObjectAt(tile);
        break;
    }
    
    render();
  }
  
  /**
   * Paint tiles with brush
   */
  function paintTiles(center, tileType) {
    const zone = typeof ZoneManager !== 'undefined' ? ZoneManager.getCurrentZone() : null;
    if (!zone || !zone.tiles) return;
    
    const radius = brushSize - 1;
    
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const x = center.x + dx;
        const y = center.y + dy;
        
        // Check bounds
        if (x >= 0 && x < zone.width && y >= 0 && y < zone.height) {
          // Safety check for row
          if (!zone.tiles[y]) continue;
          
          // For brush size > 1, use circular shape
          if (brushSize === 1 || (dx * dx + dy * dy) <= radius * radius + radius) {
            zone.tiles[y][x] = tileType;
          }
        }
      }
    }
  }
  
  /**
   * Flood fill algorithm
   */
  function floodFill(start, newType) {
    const zone = typeof ZoneManager !== 'undefined' ? ZoneManager.getCurrentZone() : null;
    if (!zone || !zone.tiles) return;
    
    const oldType = zone.tiles[start.y]?.[start.x];
    if (oldType === undefined || oldType === newType) return;
    
    const stack = [start];
    const visited = new Set();
    
    while (stack.length > 0) {
      const { x, y } = stack.pop();
      const key = `${x},${y}`;
      
      if (visited.has(key)) continue;
      visited.add(key);
      
      // Check bounds and tile type
      if (x < 0 || x >= zone.width || y < 0 || y >= zone.height) continue;
      // Safety check for row
      if (!zone.tiles[y]) continue;
      if (zone.tiles[y][x] !== oldType) continue;
      
      // Fill this tile
      zone.tiles[y][x] = newType;
      
      // Add neighbors
      stack.push({ x: x + 1, y });
      stack.push({ x: x - 1, y });
      stack.push({ x, y: y + 1 });
      stack.push({ x, y: y - 1 });
    }
  }
  
  /**
   * Place an object
   */
  function placeObject(tile) {
    const zone = typeof ZoneManager !== 'undefined' ? ZoneManager.getCurrentZone() : null;
    if (!zone) return;
    if (!currentObjectType) {
      if (typeof GameUI !== 'undefined' && GameUI.logSystem) {
        GameUI.logSystem('Select an object type first');
      }
      return;
    }
    
    const objInfo = OBJECT_TYPES[currentObjectType];
    if (!objInfo) return;
    
    // Create object
    const obj = {
      type: currentObjectType,
      x: tile.x,
      y: tile.y,
      width: objInfo.width,
      height: objInfo.height,
      name: objInfo.name,
      icon: objInfo.icon
    };
    
    // Add to appropriate array
    if (currentObjectType === 'mob_spawn') {
      if (!zone.mobSpawns) zone.mobSpawns = [];
      zone.mobSpawns.push({ x: tile.x, y: tile.y });
    } else if (currentObjectType === 'boss_spawn') {
      // Show boss selection dialog instead of placing immediately
      showBossSelectionDialog(tile);
      return; // Don't log placement yet - will be done after boss selection
    } else {
      if (!zone.objects) zone.objects = [];
      zone.objects.push(obj);
    }
    
    console.log(`[MapEditor] Placed ${objInfo.name} at (${tile.x}, ${tile.y})`);
    
    if (typeof GameUI !== 'undefined' && GameUI.logSystem) {
      GameUI.logSystem(`Placed ${objInfo.name} at (${tile.x}, ${tile.y})`);
    }
  }
  
  /**
   * Delete an object at the given tile position
   */
  function deleteObjectAt(tile) {
    const zone = typeof ZoneManager !== 'undefined' ? ZoneManager.getCurrentZone() : null;
    if (!zone) return;
    
    let deleted = false;
    let deletedName = '';
    
    // Check mob spawns
    if (zone.mobSpawns) {
      const idx = zone.mobSpawns.findIndex(s => s.x === tile.x && s.y === tile.y);
      if (idx !== -1) {
        zone.mobSpawns.splice(idx, 1);
        deleted = true;
        deletedName = 'Mob Spawn';
      }
    }
    
    // Check boss spawns
    if (!deleted && zone.bossSpawns) {
      const idx = zone.bossSpawns.findIndex(s => s.x === tile.x && s.y === tile.y);
      if (idx !== -1) {
        zone.bossSpawns.splice(idx, 1);
        deleted = true;
        deletedName = 'Boss Spawn';
      }
    }
    
    // Check objects (may span multiple tiles)
    if (!deleted && zone.objects) {
      const idx = zone.objects.findIndex(obj => {
        const objWidth = obj.width || 1;
        const objHeight = obj.height || 1;
        return tile.x >= obj.x && tile.x < obj.x + objWidth &&
               tile.y >= obj.y && tile.y < obj.y + objHeight;
      });
      if (idx !== -1) {
        deletedName = zone.objects[idx].name || zone.objects[idx].type || 'Object';
        zone.objects.splice(idx, 1);
        deleted = true;
      }
    }
    
    // Check spawns array (player spawns)
    if (!deleted && zone.spawns) {
      const idx = zone.spawns.findIndex(s => s.x === tile.x && s.y === tile.y);
      if (idx !== -1) {
        zone.spawns.splice(idx, 1);
        deleted = true;
        deletedName = 'Player Spawn';
      }
    }
    
    // Check shops
    if (!deleted && zone.shops) {
      const idx = zone.shops.findIndex(s => s.x === tile.x && s.y === tile.y);
      if (idx !== -1) {
        deletedName = zone.shops[idx].name || 'Shop';
        zone.shops.splice(idx, 1);
        deleted = true;
      }
    }
    
    // Check NPCs
    if (!deleted && zone.npcs) {
      const idx = zone.npcs.findIndex(n => n.x === tile.x && n.y === tile.y);
      if (idx !== -1) {
        deletedName = zone.npcs[idx].name || 'NPC';
        zone.npcs.splice(idx, 1);
        deleted = true;
      }
    }
    
    if (deleted) {
      console.log(`[MapEditor] Deleted ${deletedName} at (${tile.x}, ${tile.y})`);
      if (typeof GameUI !== 'undefined' && GameUI.logSystem) {
        GameUI.logSystem(`Deleted ${deletedName} at (${tile.x}, ${tile.y})`);
      }
    } else {
      console.log(`[MapEditor] No object found at (${tile.x}, ${tile.y})`);
    }
  }
  
  /**
   * Save current state for undo
   */
  function saveUndoState() {
    const zone = typeof ZoneManager !== 'undefined' ? ZoneManager.getCurrentZone() : null;
    if (!zone || !zone.tiles) return;
    
    // Deep copy tiles
    const state = {
      tiles: zone.tiles.map(row => [...row]),
      objects: zone.objects ? JSON.parse(JSON.stringify(zone.objects)) : [],
      mobSpawns: zone.mobSpawns ? JSON.parse(JSON.stringify(zone.mobSpawns)) : [],
      bossSpawns: zone.bossSpawns ? JSON.parse(JSON.stringify(zone.bossSpawns)) : []
    };
    
    undoStack.push(state);
    
    // Limit stack size
    if (undoStack.length > MAX_UNDO_STATES) {
      undoStack.shift();
    }
    
    // Clear redo stack on new action
    redoStack = [];
  }
  
  /**
   * Undo last action
   */
  function undo() {
    const zone = typeof ZoneManager !== 'undefined' ? ZoneManager.getCurrentZone() : null;
    if (!zone || undoStack.length === 0) return;
    
    // Save current state to redo
    redoStack.push({
      tiles: zone.tiles.map(row => [...row]),
      objects: zone.objects ? JSON.parse(JSON.stringify(zone.objects)) : [],
      mobSpawns: zone.mobSpawns ? JSON.parse(JSON.stringify(zone.mobSpawns)) : [],
      bossSpawns: zone.bossSpawns ? JSON.parse(JSON.stringify(zone.bossSpawns)) : []
    });
    
    // Restore previous state
    const state = undoStack.pop();
    zone.tiles = state.tiles;
    zone.objects = state.objects;
    zone.mobSpawns = state.mobSpawns;
    zone.bossSpawns = state.bossSpawns;
    
    render();
    console.log('[MapEditor] Undo');
  }
  
  /**
   * Redo last undone action
   */
  function redo() {
    const zone = typeof ZoneManager !== 'undefined' ? ZoneManager.getCurrentZone() : null;
    if (!zone || redoStack.length === 0) return;
    
    // Save current state to undo
    undoStack.push({
      tiles: zone.tiles.map(row => [...row]),
      objects: zone.objects ? JSON.parse(JSON.stringify(zone.objects)) : [],
      mobSpawns: zone.mobSpawns ? JSON.parse(JSON.stringify(zone.mobSpawns)) : [],
      bossSpawns: zone.bossSpawns ? JSON.parse(JSON.stringify(zone.bossSpawns)) : []
    });
    
    // Restore next state
    const state = redoStack.pop();
    zone.tiles = state.tiles;
    zone.objects = state.objects;
    zone.mobSpawns = state.mobSpawns;
    zone.bossSpawns = state.bossSpawns;
    
    render();
    console.log('[MapEditor] Redo');
  }
  
  /**
   * Clear the zone (make all tiles walkable)
   */
  function clearZone() {
    const zone = typeof ZoneManager !== 'undefined' ? ZoneManager.getCurrentZone() : null;
    if (!zone || !zone.tiles) return;
    
    if (!confirm('Clear all tiles? This cannot be undone.')) return;
    
    saveUndoState();
    
    for (let y = 0; y < zone.height; y++) {
      // Safety check for row - create it if missing
      if (!zone.tiles[y]) {
        zone.tiles[y] = [];
      }
      for (let x = 0; x < zone.width; x++) {
        zone.tiles[y][x] = 0;
      }
    }
    
    render();
    console.log('[MapEditor] Zone cleared');
    
    if (typeof GameUI !== 'undefined' && GameUI.logSystem) {
      GameUI.logSystem('Zone cleared');
    }
  }
  
  /**
   * Save the zone data
   */
  function saveZone() {
    const zone = typeof ZoneManager !== 'undefined' ? ZoneManager.getCurrentZone() : null;
    if (!zone) {
      alert('No zone loaded');
      return;
    }
    
    // Create zone data object
    const zoneData = {
      id: zone.id,
      name: zone.name,
      width: zone.width,
      height: zone.height,
      background: zone.background,
      tiles: zone.tiles,
      shops: zone.shops || [],
      exits: zone.exits || {},
      entryPoints: zone.entryPoints || {},
      spawns: zone.spawns || [],
      mobType: zone.mobType || null,
      mobSpawns: zone.mobSpawns || [],
      bossSpawns: zone.bossSpawns || [],
      objects: zone.objects || [],
      npcs: zone.npcs || []
    };
    
    // Convert to JSON
    const json = JSON.stringify(zoneData, null, 2);
    
    // Create download link
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${zone.id}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    console.log(`[MapEditor] Zone saved: ${zone.id}.json`);
    
    if (typeof GameUI !== 'undefined' && GameUI.logSystem) {
      GameUI.logSystem(`Zone saved: ${zone.id}.json`);
    }
  }
  
  /**
   * Update zone info display
   */
  function updateZoneInfo() {
    const zone = typeof ZoneManager !== 'undefined' ? ZoneManager.getCurrentZone() : null;
    
    const zoneIdEl = document.getElementById('editor-zone-id');
    const zoneSizeEl = document.getElementById('editor-zone-size');
    
    if (zone) {
      if (zoneIdEl) zoneIdEl.textContent = zone.id || 'Unknown';
      if (zoneSizeEl) zoneSizeEl.textContent = `${zone.width}x${zone.height}`;
    } else {
      if (zoneIdEl) zoneIdEl.textContent = '--';
      if (zoneSizeEl) zoneSizeEl.textContent = '--';
    }
  }
  
  /**
   * Update cursor position display
   */
  function updateCursorPosition(tile) {
    const cursorEl = document.getElementById('editor-cursor-pos');
    if (cursorEl) {
      if (tile) {
        cursorEl.textContent = `(${tile.x}, ${tile.y})`;
      } else {
        cursorEl.textContent = '--';
      }
    }
  }
  
  /**
   * Render the editor overlay
   */
  function render(hoverTile = null) {
    if (!enabled || !overlayCtx) return;
    
    const zone = typeof ZoneManager !== 'undefined' ? ZoneManager.getCurrentZone() : null;
    if (!zone) return;
    
    const tileSize = CONSTANTS.TILE_SIZE;
    const canvasWidth = zone.width * tileSize;
    const canvasHeight = zone.height * tileSize;
    
    // Clear canvas
    overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    
    // Draw tile overlays
    for (let y = 0; y < zone.height; y++) {
      for (let x = 0; x < zone.width; x++) {
        const tileType = zone.tiles[y]?.[x];
        const tileInfo = TILE_INFO[tileType];
        
        if (tileInfo) {
          overlayCtx.fillStyle = tileInfo.color;
          overlayCtx.fillRect(x * tileSize, y * tileSize, tileSize, tileSize);
        }
      }
    }
    
    // Draw grid
    if (gridVisible) {
      overlayCtx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      overlayCtx.lineWidth = 1;
      
      for (let y = 0; y <= zone.height; y++) {
        overlayCtx.beginPath();
        overlayCtx.moveTo(0, y * tileSize);
        overlayCtx.lineTo(canvasWidth, y * tileSize);
        overlayCtx.stroke();
      }
      
      for (let x = 0; x <= zone.width; x++) {
        overlayCtx.beginPath();
        overlayCtx.moveTo(x * tileSize, 0);
        overlayCtx.lineTo(x * tileSize, canvasHeight);
        overlayCtx.stroke();
      }
    }
    
    // Draw objects
    const showObjects = document.getElementById('editor-show-objects')?.checked ?? true;
    if (showObjects) {
      // Mob spawns
      if (zone.mobSpawns) {
        overlayCtx.font = '16px Arial';
        overlayCtx.textAlign = 'center';
        overlayCtx.textBaseline = 'middle';
        
        zone.mobSpawns.forEach(spawn => {
          overlayCtx.fillStyle = 'rgba(255, 100, 100, 0.5)';
          overlayCtx.fillRect(spawn.x * tileSize, spawn.y * tileSize, tileSize, tileSize);
          overlayCtx.fillStyle = '#fff';
          overlayCtx.fillText('👾', spawn.x * tileSize + tileSize / 2, spawn.y * tileSize + tileSize / 2);
        });
      }
      
      // Boss spawns
      if (zone.bossSpawns) {
        zone.bossSpawns.forEach(spawn => {
          overlayCtx.fillStyle = 'rgba(200, 50, 200, 0.5)';
          overlayCtx.fillRect(spawn.x * tileSize, spawn.y * tileSize, tileSize, tileSize);
          overlayCtx.fillStyle = '#fff';
          overlayCtx.fillText('💀', spawn.x * tileSize + tileSize / 2, spawn.y * tileSize + tileSize / 2);
        });
      }
      
      // Objects
      if (zone.objects) {
        zone.objects.forEach(obj => {
          const objW = (obj.width || 1) * tileSize;
          const objH = (obj.height || 1) * tileSize;
          
          overlayCtx.fillStyle = 'rgba(255, 200, 50, 0.5)';
          overlayCtx.fillRect(obj.x * tileSize, obj.y * tileSize, objW, objH);
          overlayCtx.strokeStyle = '#ffc832';
          overlayCtx.lineWidth = 2;
          overlayCtx.strokeRect(obj.x * tileSize, obj.y * tileSize, objW, objH);
          
          if (obj.icon) {
            overlayCtx.fillStyle = '#fff';
            overlayCtx.fillText(obj.icon, obj.x * tileSize + objW / 2, obj.y * tileSize + objH / 2);
          }
        });
      }
    }
    
    // Draw brush preview
    if (hoverTile && (currentTool === 'brush' || currentTool === 'eraser')) {
      const previewType = currentTool === 'eraser' ? 0 : currentTileType;
      const previewInfo = TILE_INFO[previewType];
      const radius = brushSize - 1;
      
      overlayCtx.fillStyle = previewInfo ? previewInfo.color.replace('0.4', '0.6') : 'rgba(255, 255, 255, 0.3)';
      
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const x = hoverTile.x + dx;
          const y = hoverTile.y + dy;
          
          if (x >= 0 && x < zone.width && y >= 0 && y < zone.height) {
            if (brushSize === 1 || (dx * dx + dy * dy) <= radius * radius + radius) {
              overlayCtx.fillRect(x * tileSize + 2, y * tileSize + 2, tileSize - 4, tileSize - 4);
            }
          }
        }
      }
    }
    
    // Draw object placement preview
    if (hoverTile && currentTool === 'object' && currentObjectType) {
      const objInfo = OBJECT_TYPES[currentObjectType];
      if (objInfo) {
        const objW = (objInfo.width || 1) * tileSize;
        const objH = (objInfo.height || 1) * tileSize;
        
        overlayCtx.fillStyle = 'rgba(100, 255, 100, 0.4)';
        overlayCtx.fillRect(hoverTile.x * tileSize, hoverTile.y * tileSize, objW, objH);
        overlayCtx.strokeStyle = '#64ff64';
        overlayCtx.lineWidth = 2;
        overlayCtx.strokeRect(hoverTile.x * tileSize, hoverTile.y * tileSize, objW, objH);
        
        overlayCtx.fillStyle = '#fff';
        overlayCtx.fillText(objInfo.icon, hoverTile.x * tileSize + objW / 2, hoverTile.y * tileSize + objH / 2);
      }
    }
    
    // Draw fill preview
    if (hoverTile && currentTool === 'fill') {
      overlayCtx.fillStyle = 'rgba(255, 255, 100, 0.5)';
      overlayCtx.fillRect(hoverTile.x * tileSize + 4, hoverTile.y * tileSize + 4, tileSize - 8, tileSize - 8);
      overlayCtx.fillStyle = '#fff';
      overlayCtx.fillText('🪣', hoverTile.x * tileSize + tileSize / 2, hoverTile.y * tileSize + tileSize / 2);
    }
    
    // Draw delete preview (highlight object under cursor in red)
    if (hoverTile && currentTool === 'delete') {
      let foundObject = false;
      
      // Check mob spawns
      if (zone.mobSpawns) {
        const spawn = zone.mobSpawns.find(s => s.x === hoverTile.x && s.y === hoverTile.y);
        if (spawn) {
          overlayCtx.fillStyle = 'rgba(255, 0, 0, 0.5)';
          overlayCtx.fillRect(spawn.x * tileSize, spawn.y * tileSize, tileSize, tileSize);
          overlayCtx.strokeStyle = '#ff0000';
          overlayCtx.lineWidth = 3;
          overlayCtx.strokeRect(spawn.x * tileSize, spawn.y * tileSize, tileSize, tileSize);
          foundObject = true;
        }
      }
      
      // Check boss spawns
      if (!foundObject && zone.bossSpawns) {
        const spawn = zone.bossSpawns.find(s => s.x === hoverTile.x && s.y === hoverTile.y);
        if (spawn) {
          overlayCtx.fillStyle = 'rgba(255, 0, 0, 0.5)';
          overlayCtx.fillRect(spawn.x * tileSize, spawn.y * tileSize, tileSize, tileSize);
          overlayCtx.strokeStyle = '#ff0000';
          overlayCtx.lineWidth = 3;
          overlayCtx.strokeRect(spawn.x * tileSize, spawn.y * tileSize, tileSize, tileSize);
          foundObject = true;
        }
      }
      
      // Check objects
      if (!foundObject && zone.objects) {
        const obj = zone.objects.find(o => {
          const objWidth = o.width || 1;
          const objHeight = o.height || 1;
          return hoverTile.x >= o.x && hoverTile.x < o.x + objWidth &&
                 hoverTile.y >= o.y && hoverTile.y < o.y + objHeight;
        });
        if (obj) {
          const objW = (obj.width || 1) * tileSize;
          const objH = (obj.height || 1) * tileSize;
          overlayCtx.fillStyle = 'rgba(255, 0, 0, 0.5)';
          overlayCtx.fillRect(obj.x * tileSize, obj.y * tileSize, objW, objH);
          overlayCtx.strokeStyle = '#ff0000';
          overlayCtx.lineWidth = 3;
          overlayCtx.strokeRect(obj.x * tileSize, obj.y * tileSize, objW, objH);
          foundObject = true;
        }
      }
      
      // If no object found, show a subtle X indicator
      if (!foundObject) {
        overlayCtx.fillStyle = 'rgba(255, 100, 100, 0.3)';
        overlayCtx.fillRect(hoverTile.x * tileSize + 4, hoverTile.y * tileSize + 4, tileSize - 8, tileSize - 8);
        overlayCtx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        overlayCtx.fillText('❌', hoverTile.x * tileSize + tileSize / 2, hoverTile.y * tileSize + tileSize / 2);
      }
    }
  }
  
  /**
   * Check if editor is enabled
   */
  function isEnabled() {
    return enabled;
  }
  
  // Public API
  return {
    init,
    toggle,
    undo,
    redo,
    clearZone,
    saveZone,
    render,
    isEnabled,
    setTool,
    selectTileType,
    selectObjectType,
    deleteObjectAt,
    // Boss selection dialog
    filterBosses,
    selectBoss,
    closeBossDialog
  };
})();

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => MapEditor.init());
} else {
  MapEditor.init();
}
