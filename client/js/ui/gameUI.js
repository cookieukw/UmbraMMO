/**
 * UMBRA ONLINE - Game UI Module
 * Handles the Tibia-style HUD panels, inventory, stats, equipment, skills, and console
 */

const GameUI = (function() {
  // UI state
  let characterData = null;
  let inventorySlots = [];
  let consoleMessages = [];
  let activeConsoleTab = 'default';
  
  // Inventory settings
  const INVENTORY_MAX_SIZE = 36;      // Maximum possible slots
  const INVENTORY_DEFAULT_SIZE = 8;   // Starting slots for all players
  let currentInventorySize = INVENTORY_DEFAULT_SIZE;
  
  // Inventory data
  let inventoryItems = [];      // Array of {itemId, quantity, slotIndex, item}
  let equippedItems = {};       // Map of slot -> {itemId, item}
  let equipmentBonuses = {};    // Calculated bonuses from equipment
  
  // Drag and drop state
  let draggedItem = null;
  let draggedFromSlot = null;
  let draggedFromType = null;   // 'inventory' or 'equipment'
  
  // Death and action lock state
  let isDead = false;
  let actionsLocked = false;
  
  // Item icon paths
  const ICON_PATH = '/assets/sprites/items_icons/';
  
  /**
   * Get icon HTML for an item. Uses PNG icon if available, falls back to emoji.
   * @param {Object} item - Item data object (must have .id and .icon)
   * @param {string} [extraClass] - Optional extra CSS class
   * @returns {string} HTML string
   */
  function getItemIconHtml(item, extraClass) {
    const cls = extraClass ? `item-icon ${extraClass}` : 'item-icon';
    if (item && item.id) {
      const fallbackIcon = (item.icon || '?').replace(/'/g, '&#39;');
      return `<img class="${cls}" src="${ICON_PATH}${item.id}.png" alt="${item.name || item.id}" onerror="this.style.display='none';this.insertAdjacentHTML('afterend','<span class=&quot;${cls}&quot;>${fallbackIcon}</span>')" draggable="false">`;
    }
    return `<span class="${cls}">${item?.icon || '?'}</span>`;
  }
  let pendingDeathData = null;      // Stores death data for respawn
  let pendingBeaconData = null;     // Stores beacon data for confirmation
  
  // Tooltip system
  let tooltipElement = null;
  let tooltipOriginalHTML = ''; // Store original tooltip structure
  let tooltipTimeout = null;
  const TOOLTIP_DELAY = 150; // ms delay before showing tooltip
  
  // Stat definitions for tooltips (base stats only)
  const STAT_DEFINITIONS = {
    str: {
      name: 'Strength',
      icon: '💪',
      description: 'Increases attack damage.'
    },
    agi: {
      name: 'Agility',
      icon: '🏃',
      description: 'Increases attack speed. 2.0s → 1.0s from AGI 1-50, then diminishing returns to 0.3s minimum.'
    },
    dex: {
      name: 'Dexterity',
      icon: '🎯',
      description: 'Increases critical chance and dodge chance.'
    },
    vit: {
      name: 'Vitality',
      icon: '❤️',
      description: 'Increases HP.'
    },
    end: {
      name: 'Endurance',
      icon: '⚡',
      description: 'Increases max stamina.'
    },
    int: {
      name: 'Intelligence',
      icon: '🔮',
      description: 'Increases magic damage and cooldown reduction.'
    },
    def: {
      name: 'Defense',
      icon: '🛡️',
      description: 'Increases block chance. Blocking mitigates 50% damage. +1% per point, diminishing returns after 50 DEF. Max: 75%.'
    },
    arm: {
      name: 'Armor',
      icon: '🪖',
      description: 'Reduces incoming damage. Obtained from equipped armor pieces.'
    }
  };

  // ==========================================
  // UNIVERSAL TOOLTIP SYSTEM
  // ==========================================
  
  /**
   * Initialize the tooltip system
   */
  function initTooltips() {
    tooltipElement = document.getElementById('game-tooltip');
    if (!tooltipElement) {
      console.warn('[GameUI] Tooltip element not found');
      return;
    }
    
    // Save original tooltip structure so it can be restored after item tooltips
    tooltipOriginalHTML = tooltipElement.innerHTML;
    
    // Setup tooltip triggers for stat items
    setupStatTooltips();
    
    // Hide tooltip when clicking anywhere
    document.addEventListener('click', hideTooltip);
    
    console.log('[GameUI] Tooltip system initialized');
  }
  
  /**
   * Setup tooltips for stat items in the stats panel
   */
  function setupStatTooltips() {
    const statItems = document.querySelectorAll('[data-tooltip="stat"]');
    
    statItems.forEach(item => {
      const statKey = item.dataset.stat;
      if (!statKey || !STAT_DEFINITIONS[statKey]) return;
      
      // Remove default title tooltip
      item.removeAttribute('title');
      
      // Mouse enter - show tooltip after delay
      item.addEventListener('mouseenter', function(e) {
        const target = this; // Capture the element reference
        if (tooltipTimeout) clearTimeout(tooltipTimeout);
        tooltipTimeout = setTimeout(() => {
          showStatTooltip(statKey, target);
        }, TOOLTIP_DELAY);
      });
      
      // Mouse leave - hide tooltip
      item.addEventListener('mouseleave', () => {
        if (tooltipTimeout) clearTimeout(tooltipTimeout);
        hideTooltip();
      });
      
      // Mouse move - update position
      item.addEventListener('mousemove', (e) => {
        if (tooltipElement && tooltipElement.classList.contains('visible')) {
          positionTooltip(e.clientX, e.clientY);
        }
      });
    });
  }
  
  /**
   * Restore the tooltip's original DOM structure (after showItemTooltip replaced it)
   */
  function restoreTooltipStructure() {
    if (tooltipElement && tooltipOriginalHTML) {
      tooltipElement.innerHTML = tooltipOriginalHTML;
    }
  }
  
  /**
   * Show tooltip for a stat
   */
  function showStatTooltip(statKey, targetElement) {
    const stat = STAT_DEFINITIONS[statKey];
    if (!stat || !tooltipElement || !targetElement) return;
    
    // Restore original tooltip structure in case item tooltip replaced it
    restoreTooltipStructure();
    
    // Get current stat value if available
    let currentValue = '';
    if (characterData) {
      const valueEl = targetElement.querySelector('.stat-value');
      if (valueEl) {
        currentValue = valueEl.textContent;
      }
    }
    
    // Build tooltip content
    const iconEl = tooltipElement.querySelector('.tooltip-icon');
    const titleEl = tooltipElement.querySelector('.tooltip-title');
    const subtitleEl = tooltipElement.querySelector('.tooltip-subtitle');
    const bodyEl = tooltipElement.querySelector('.tooltip-body');
    const statsEl = tooltipElement.querySelector('.tooltip-stats');
    const footerEl = tooltipElement.querySelector('.tooltip-footer');
    
    if (iconEl) iconEl.textContent = stat.icon || '';
    if (titleEl) titleEl.textContent = stat.name;
    if (subtitleEl) subtitleEl.textContent = statKey.toUpperCase();
    if (bodyEl) bodyEl.textContent = stat.description;
    
    // Hide stats and footer sections for base stats
    if (statsEl) statsEl.style.display = 'none';
    if (footerEl) footerEl.style.display = 'none';
    
    // Set tooltip type class
    tooltipElement.className = 'game-tooltip tooltip-stat';
    
    // Position and show
    const rect = targetElement.getBoundingClientRect();
    positionTooltip(rect.right + 10, rect.top);
    tooltipElement.classList.add('visible');
  }
  
  /**
   * Show a generic tooltip with custom content
   * @param {Object} options - Tooltip options
   * @param {string} options.icon - Emoji or icon
   * @param {string} options.title - Title text
   * @param {string} options.subtitle - Subtitle text
   * @param {string} options.body - Body description
   * @param {Array} options.stats - Array of {name, value, positive?} objects
   * @param {string} options.footer - Footer text
   * @param {string} options.type - Tooltip type class (stat, item, skill)
   * @param {number} x - X position
   * @param {number} y - Y position
   */
  function showTooltip(options, x, y) {
    if (!tooltipElement) return;
    
    // Restore original tooltip structure in case item tooltip replaced it
    restoreTooltipStructure();
    
    const iconEl = tooltipElement.querySelector('.tooltip-icon');
    const titleEl = tooltipElement.querySelector('.tooltip-title');
    const subtitleEl = tooltipElement.querySelector('.tooltip-subtitle');
    const bodyEl = tooltipElement.querySelector('.tooltip-body');
    const statsEl = tooltipElement.querySelector('.tooltip-stats');
    const footerEl = tooltipElement.querySelector('.tooltip-footer');
    
    // Set content
    if (iconEl) iconEl.textContent = options.icon || '';
    if (titleEl) titleEl.textContent = options.title || '';
    if (subtitleEl) {
      subtitleEl.textContent = options.subtitle || '';
      subtitleEl.style.display = options.subtitle ? 'block' : 'none';
    }
    if (bodyEl) {
      bodyEl.textContent = options.body || '';
      bodyEl.style.display = options.body ? 'block' : 'none';
    }
    
    // Build stats section
    if (statsEl) {
      if (options.stats && options.stats.length > 0) {
        statsEl.innerHTML = options.stats.map(stat => `
          <div class="tooltip-stat-row">
            <span class="tooltip-stat-name">${stat.name}</span>
            <span class="tooltip-stat-value ${stat.positive === true ? 'positive' : stat.positive === false ? 'negative' : ''}">${stat.value}</span>
          </div>
        `).join('');
        statsEl.style.display = 'block';
      } else {
        statsEl.style.display = 'none';
      }
    }
    
    // Footer
    if (footerEl) {
      footerEl.textContent = options.footer || '';
      footerEl.style.display = options.footer ? 'block' : 'none';
    }
    
    // Set type class
    tooltipElement.className = `game-tooltip ${options.type || ''}`;
    
    // Position and show
    positionTooltip(x, y);
    tooltipElement.classList.add('visible');
  }
  
  /**
   * Position the tooltip, keeping it within viewport bounds
   */
  function positionTooltip(x, y) {
    if (!tooltipElement) return;
    
    const padding = 10;
    const tooltipRect = tooltipElement.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // Default position to the right and below cursor
    let left = x + padding;
    let top = y + padding;
    
    // Check right boundary
    if (left + tooltipRect.width > viewportWidth - padding) {
      left = x - tooltipRect.width - padding;
    }
    
    // Check bottom boundary
    if (top + tooltipRect.height > viewportHeight - padding) {
      top = y - tooltipRect.height - padding;
    }
    
    // Ensure not off-screen left or top
    left = Math.max(padding, left);
    top = Math.max(padding, top);
    
    tooltipElement.style.left = `${left}px`;
    tooltipElement.style.top = `${top}px`;
  }
  
  /**
   * Hide the tooltip
   */
  function hideTooltip() {
    if (tooltipTimeout) {
      clearTimeout(tooltipTimeout);
      tooltipTimeout = null;
    }
    if (tooltipElement) {
      tooltipElement.classList.remove('visible');
    }
  }
  
  /**
   * Initialize the UI system
   */
  function init(character) {
    characterData = character;
    
    // Initialize tooltip system
    initTooltips();
    
    // Generate inventory slots
    generateInventorySlots();
    
    // Initialize equipment slot drag/drop
    initEquipmentSlots();
    
    // Initialize status bars as drop zone for consumables
    initStatusBarsDropZone();
    
    // Setup console tabs
    setupConsoleTabs();
    
    // Update all UI elements with character data
    updateAllUI();
    
    console.log('[GameUI] Initialized');
  }
  
  /**
   * Generate inventory slot elements
   */
  function generateInventorySlots() {
    const grid = document.getElementById('inventory-grid');
    if (!grid) return;
    
    grid.innerHTML = '';
    inventorySlots = [];
    
    for (let i = 0; i < currentInventorySize; i++) {
      const slot = document.createElement('div');
      slot.className = 'inv-slot';
      slot.dataset.slot = i;
      // Don't set title - we use custom tooltips
      
      // Drag and drop handlers
      slot.addEventListener('dragover', handleDragOver);
      slot.addEventListener('drop', (e) => handleInventoryDrop(e, i));
      slot.addEventListener('dragleave', handleDragLeave);
      
      // Click handler for item use
      slot.addEventListener('click', () => handleInventoryClick(i));
      slot.addEventListener('contextmenu', (e) => handleInventoryRightClick(e, i));
      
      grid.appendChild(slot);
      inventorySlots.push(slot);
    }
    
    updateInventoryCapacity();
    renderInventory();
  }
  
  /**
   * Initialize equipment slot drag and drop
   */
  function initEquipmentSlots() {
    const equipSlots = document.querySelectorAll('.equip-slot');
    equipSlots.forEach(slot => {
      const slotType = slot.dataset.slot;
      
      // Drag and drop handlers
      slot.addEventListener('dragover', handleDragOver);
      slot.addEventListener('drop', (e) => handleEquipmentDrop(e, slotType));
      slot.addEventListener('dragleave', handleDragLeave);
      
      // Click to unequip
      slot.addEventListener('contextmenu', (e) => handleEquipmentRightClick(e, slotType));
    });
  }
  
  /**
   * Initialize status bars as a drop zone for consumable items
   */
  function initStatusBarsDropZone() {
    const statusBars = document.getElementById('status-bars');
    if (!statusBars) return;
    
    statusBars.addEventListener('dragover', (e) => {
      if (draggedItem && draggedFromType === 'inventory') {
        const item = draggedItem.item;
        if (item && (item.type === 'food' || item.type === 'consumable')) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          statusBars.classList.add('consumable-drop-hover');
        }
      }
    });
    
    statusBars.addEventListener('dragleave', (e) => {
      statusBars.classList.remove('consumable-drop-hover');
    });
    
    statusBars.addEventListener('drop', (e) => {
      e.preventDefault();
      statusBars.classList.remove('consumable-drop-hover');
      
      if (draggedItem && draggedFromType === 'inventory') {
        const item = draggedItem.item;
        if (item && (item.type === 'food' || item.type === 'consumable')) {
          // Use the consumable item
          Connection.send({
            type: 'use_item',
            itemId: draggedItem.itemId
          });
        }
      }
    });
  }
  
  /**
   * Handle inventory update from server
   */
  function updateInventory(data) {
    if (data.inventory) {
      inventoryItems = data.inventory;
    }
    if (data.equipment) {
      equippedItems = data.equipment;
    }
    if (data.equipmentBonuses) {
      equipmentBonuses = data.equipmentBonuses;
    }
    
    // Update inventory size from server if provided
    if (data.inventorySize && data.inventorySize !== currentInventorySize) {
      setInventorySize(data.inventorySize);
    }
    
    // Hide any open tooltip since items may have moved
    hideTooltip();
    
    renderInventory();
    renderEquipment();
    updateEquipmentBonuses();
  }
  
  /**
   * Render inventory items
   */
  function renderInventory() {
    // Clear all slots first
    inventorySlots.forEach((slot, index) => {
      slot.innerHTML = '';
      slot.classList.remove('has-item');
      slot.draggable = false;
      slot.title = '';  // Clear title to prevent native tooltip
      slot.style.borderColor = '';  // Reset rarity border color
      slot.ondragstart = null;
      slot.ondragend = null;
      slot.onmouseenter = null;
      slot.onmouseleave = null;
    });
    
    // Place items in slots
    inventoryItems.forEach(invItem => {
      const slotIndex = invItem.slotIndex;
      if (slotIndex >= 0 && slotIndex < inventorySlots.length) {
        const slot = inventorySlots[slotIndex];
        const item = invItem.item;
        
        if (item) {
          slot.innerHTML = `
            ${getItemIconHtml(item)}
            ${invItem.quantity > 1 ? `<span class="item-quantity">${invItem.quantity}</span>` : ''}
          `;
          slot.classList.add('has-item');
          slot.draggable = true;
          slot.title = '';  // No native tooltip, we use custom tooltip
          
          // Add rarity color
          if (item.rarity && CONSTANTS.RARITY[item.rarity.toUpperCase()]) {
            slot.style.borderColor = CONSTANTS.RARITY[item.rarity.toUpperCase()].color;
          }
          
          // Drag start handler
          slot.ondragstart = (e) => handleDragStart(e, invItem, slotIndex, 'inventory');
          slot.ondragend = handleDragEnd;
          
          // Tooltip
          slot.onmouseenter = () => showItemTooltip(item, invItem.quantity, slot);
          slot.onmouseleave = hideTooltip;
        }
      }
    });
    
    updateInventoryCapacity();
  }
  
  /**
   * Render equipped items
   */
  function renderEquipment() {
    const equipSlots = document.querySelectorAll('.equip-slot');
    
    equipSlots.forEach(slot => {
      const slotType = slot.dataset.slot;
      const equipped = equippedItems[slotType];
      
      // Reset slot
      const defaultIcons = {
        headgear: '🪖', chest: '🎽', weapon1: '⚔️', pants: '👖', boots: '👢',
        amulet: '📿', backpack: '🎒', weapon2: '🛡️', ring1: '💍', ring2: '💍'
      };
      
      if (equipped && equipped.item) {
        slot.innerHTML = getItemIconHtml(equipped.item, 'equipped');
        slot.classList.add('has-item');
        slot.draggable = true;
        slot.title = equipped.item.name;
        
        // Add rarity color
        if (equipped.item.rarity && CONSTANTS.RARITY[equipped.item.rarity.toUpperCase()]) {
          slot.style.borderColor = CONSTANTS.RARITY[equipped.item.rarity.toUpperCase()].color;
        }
        
        // Drag start handler
        slot.ondragstart = (e) => handleDragStart(e, equipped, slotType, 'equipment');
        slot.ondragend = handleDragEnd;
        
        // Tooltip
        slot.onmouseenter = () => showItemTooltip(equipped.item, 1, slot);
        slot.onmouseleave = hideTooltip;
      } else {
        slot.innerHTML = `<span class="slot-icon">${defaultIcons[slotType] || '?'}</span>`;
        slot.classList.remove('has-item');
        slot.draggable = false;
        slot.style.borderColor = '';
        slot.ondragstart = null;
        slot.onmouseenter = null;
        slot.onmouseleave = null;
      }
    });
  }
  
  /**
   * Update equipment stat bonuses display
   */
  function updateEquipmentBonuses() {
    // Update inventory size based on bonusSlots from equipment (e.g., backpack)
    const bonusSlots = equipmentBonuses.bonusSlots || 0;
    const newSize = INVENTORY_DEFAULT_SIZE + bonusSlots;
    if (newSize !== currentInventorySize) {
      setInventorySize(newSize);
    }
    
    // Refresh stat display so bonuses appear as "base + bonus"
    updateStats();
  }
  
  /**
   * Show item tooltip
   */
  function showItemTooltip(item, quantity, element) {
    if (!tooltipElement || !item) return;
    
    let content = `<div class="item-tooltip">`;
    const iconHtml = item.id ? `<img class="tooltip-icon" src="${ICON_PATH}${item.id}.png" onerror="this.style.display='none'" draggable="false">` : '';
    content += `<div class="item-name" style="color: ${CONSTANTS.RARITY[item.rarity?.toUpperCase()]?.color || '#fff'}">${iconHtml} ${item.name}</div>`;
    content += `<div class="item-type">${item.type}${item.slot ? ` (${item.slot})` : ''}</div>`;
    
    // Stats
    if (item.stats && Object.keys(item.stats).length > 0) {
      content += `<div class="item-stats">`;
      for (const [stat, value] of Object.entries(item.stats)) {
        content += `<div>+${value} ${stat.toUpperCase()}</div>`;
      }
      content += `</div>`;
    }
    
    // Armor
    if (item.armor) {
      content += `<div class="item-armor">+${item.armor} Armor</div>`;
    }
    
    // Bonus slots
    if (item.bonusSlots) {
      content += `<div class="item-bonus">+${item.bonusSlots} Inventory Slots</div>`;
    }
    
    // Use effect
    if (item.useEffect) {
      if (item.useEffect.type === 'heal') {
        content += `<div class="item-effect">Heals ${item.useEffect.value} HP</div>`;
      } else if (item.useEffect.type === 'exp') {
        content += `<div class="item-effect">Grants ${item.useEffect.value} EXP</div>`;
      }
    }
    
    content += `<div class="item-desc">${item.description || ''}</div>`;
    
    if (quantity > 1) {
      content += `<div class="item-quantity-tip">Quantity: ${quantity}</div>`;
    }
    
    content += `</div>`;
    
    tooltipElement.innerHTML = content;
    tooltipElement.classList.remove('hidden');
    tooltipElement.classList.add('visible');
    
    // Position tooltip to the right of the element
    const rect = element.getBoundingClientRect();
    positionTooltip(rect.right + 10, rect.top);
  }
  
  // ==========================================
  // DRAG AND DROP
  // ==========================================
  
  function handleDragStart(e, itemData, fromSlot, fromType) {
    draggedItem = itemData;
    draggedFromSlot = fromSlot;
    draggedFromType = fromType;
    
    e.target.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'all';
    e.dataTransfer.setData('text/plain', JSON.stringify({
      itemId: itemData.itemId,
      fromSlot: fromSlot,
      fromType: fromType
    }));
    
    // If dragging equipment from inventory, highlight valid/invalid equipment slots
    if (fromType === 'inventory' && itemData.item && itemData.item.type === 'equipment') {
      highlightEquipmentSlots(itemData.item.slot);
    }
    
    // If dragging consumable/food, highlight the status bars drop zone
    if (fromType === 'inventory' && itemData.item && 
        (itemData.item.type === 'food' || itemData.item.type === 'consumable')) {
      highlightStatusBarsDropZone(true);
    }
    
    // If shop is open and we're dragging from inventory, highlight the sell zone
    if (fromType === 'inventory' && currentShop) {
      highlightShopSellZone(true);
    }
    
    // If market is open and we're dragging equipment, highlight the market dropzone
    if (fromType === 'inventory' && itemData.item && itemData.item.type === 'equipment') {
      highlightMarketDropZone(true);
    }
  }
  
  /**
   * Highlight the shop sell zone when dragging items
   */
  function highlightShopSellZone(highlight) {
    const sellZone = document.getElementById('shop-sell-zone');
    if (sellZone) {
      if (highlight) {
        sellZone.classList.add('can-drop');
      } else {
        sellZone.classList.remove('can-drop', 'drag-over');
      }
    }
  }
  
  /**
   * Highlight the market sell dropzone when dragging equipment
   */
  function highlightMarketDropZone(highlight) {
    const dropzone = document.getElementById('market-sell-dropzone');
    if (dropzone) {
      if (highlight) {
        dropzone.classList.add('can-drop');
      } else {
        dropzone.classList.remove('can-drop', 'drag-over');
      }
    }
  }
  
  /**
   * Highlight equipment slots based on item slot compatibility
   */
  function highlightEquipmentSlots(itemSlot) {
    const equipSlots = document.querySelectorAll('.equip-slot');
    equipSlots.forEach(slot => {
      const slotType = slot.dataset.slot;
      const isValid = (itemSlot === slotType) || 
                     (itemSlot === 'ring' && (slotType === 'ring1' || slotType === 'ring2'));
      
      if (isValid) {
        slot.classList.add('valid-drop');
      } else {
        slot.classList.add('invalid-drop');
      }
    });
  }
  
  /**
   * Highlight the status bars area for consumable items
   */
  function highlightStatusBarsDropZone(highlight) {
    const statusBars = document.getElementById('status-bars');
    if (statusBars) {
      if (highlight) {
        statusBars.classList.add('consumable-drop-target');
      } else {
        statusBars.classList.remove('consumable-drop-target', 'consumable-drop-hover');
      }
    }
  }
  
  /**
   * Clear all equipment slot highlights
   */
  function clearEquipmentSlotHighlights() {
    const equipSlots = document.querySelectorAll('.equip-slot');
    equipSlots.forEach(slot => {
      slot.classList.remove('valid-drop', 'invalid-drop', 'drag-over', 'drag-over-invalid');
    });
  }
  
  function handleDragEnd(e) {
    e.target.classList.remove('dragging');
    draggedItem = null;
    draggedFromSlot = null;
    draggedFromType = null;
    
    // Remove all drag-over styling
    document.querySelectorAll('.drag-over, .drag-over-invalid').forEach(el => {
      el.classList.remove('drag-over', 'drag-over-invalid');
    });
    
    // Clear equipment slot highlights
    clearEquipmentSlotHighlights();
    
    // Clear status bars highlight
    highlightStatusBarsDropZone(false);
    
    // Clear shop sell zone highlight
    highlightShopSellZone(false);
    
    // Clear market dropzone highlight
    highlightMarketDropZone(false);
  }
  
  function handleDragOver(e) {
    e.preventDefault();
    const target = e.currentTarget;
    
    // Check if this is an equipment slot and if the drop would be valid
    if (target.classList.contains('equip-slot') && draggedItem && draggedFromType === 'inventory') {
      const item = draggedItem.item;
      if (item && item.type === 'equipment') {
        const slotType = target.dataset.slot;
        const itemSlot = item.slot;
        const isValid = (itemSlot === slotType) || 
                       (itemSlot === 'ring' && (slotType === 'ring1' || slotType === 'ring2'));
        
        if (isValid) {
          e.dataTransfer.dropEffect = 'move';
          target.classList.add('drag-over');
          target.classList.remove('drag-over-invalid');
        } else {
          e.dataTransfer.dropEffect = 'none';
          target.classList.add('drag-over-invalid');
          target.classList.remove('drag-over');
        }
        return;
      }
    }
    
    // Default behavior for inventory slots
    e.dataTransfer.dropEffect = 'move';
    target.classList.add('drag-over');
  }
  
  function handleDragLeave(e) {
    e.currentTarget.classList.remove('drag-over', 'drag-over-invalid');
  }
  
  function handleInventoryDrop(e, slotIndex) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    
    if (!draggedItem) return;
    
    if (draggedFromType === 'equipment') {
      // Unequip item to inventory
      Connection.send({
        type: 'unequip_item',
        slot: draggedFromSlot,
        targetSlot: slotIndex  // Unequip to specific inventory slot
      });
    } else if (draggedFromType === 'inventory') {
      // Move/swap items within inventory
      if (draggedFromSlot !== slotIndex) {
        Connection.send({
          type: 'move_inventory_item',
          fromSlot: draggedFromSlot,
          toSlot: slotIndex
        });
      }
    }
  }
  
  function handleEquipmentDrop(e, slotType) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    
    if (!draggedItem || draggedFromType !== 'inventory') return;
    
    const item = draggedItem.item;
    if (!item || item.type !== 'equipment') {
      addConsoleMessage('error', 'This item cannot be equipped');
      return;
    }
    
    // Check if item can go in this slot
    const itemSlot = item.slot;
    const canEquip = (itemSlot === slotType) || 
                    (itemSlot === 'ring' && (slotType === 'ring1' || slotType === 'ring2'));
    
    if (!canEquip) {
      addConsoleMessage('error', `This item goes in the ${itemSlot} slot`);
      return;
    }
    
    // Send equip request to server
    Connection.send({
      type: 'equip_item',
      itemId: draggedItem.itemId,
      slot: slotType
    });
  }
  
  /**
   * Handle inventory slot click (use consumables)
   */
  function handleInventoryClick(slotIndex) {
    const invItem = inventoryItems.find(i => i.slotIndex === slotIndex);
    if (!invItem || !invItem.item) return;
    
    const item = invItem.item;
    
    // Double-click to use consumables or equip equipment
    // For now, single click does nothing special
  }
  
  /**
   * Handle inventory right-click (use item)
   */
  function handleInventoryRightClick(e, slotIndex) {
    e.preventDefault();
    
    const invItem = inventoryItems.find(i => i.slotIndex === slotIndex);
    if (!invItem || !invItem.item) return;
    
    const item = invItem.item;
    
    // Use consumable
    if (item.type === 'food' || item.type === 'consumable') {
      Connection.send({
        type: 'use_item',
        itemId: invItem.itemId
      });
    }
    // Quick-equip equipment
    else if (item.type === 'equipment') {
      let targetSlot = item.slot;
      // For rings, try ring1 first, then ring2
      if (item.slot === 'ring') {
        targetSlot = equippedItems['ring1'] ? 'ring2' : 'ring1';
      }
      
      Connection.send({
        type: 'equip_item',
        itemId: invItem.itemId,
        slot: targetSlot
      });
    }
  }
  
  /**
   * Handle equipment right-click (unequip)
   */
  function handleEquipmentRightClick(e, slotType) {
    e.preventDefault();
    
    if (!equippedItems[slotType]) return;
    
    Connection.send({
      type: 'unequip_item',
      slot: slotType
    });
  }
  
  /**
   * Admin: Give 5 random items
   */
  function giveRandomItemsAdmin() {
    if (!isAdmin) {
      addConsoleMessage('error', 'Admin only');
      return;
    }
    
    Connection.send({
      type: 'admin_give_items'
    });
    addConsoleMessage('system', '🎲 Rolling for random items...');
  }
  
  /**
   * Set inventory size (called when admin status changes or from character data)
   */
  function setInventorySize(size) {
    currentInventorySize = Math.min(size, INVENTORY_MAX_SIZE);
    generateInventorySlots();
  }
  
  /**
   * Upgrade inventory to max size (for admins)
   */
  function upgradeInventoryToMax() {
    setInventorySize(INVENTORY_MAX_SIZE);
  }
  
  /**
   * Setup console tab switching
   */
  function setupConsoleTabs() {
    const tabs = document.querySelectorAll('.console-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        // Remove active from all tabs
        tabs.forEach(t => t.classList.remove('active'));
        // Add active to clicked tab
        tab.classList.add('active');
        // Update active tab
        activeConsoleTab = tab.dataset.tab;
        // Filter messages
        filterConsoleMessages();
      });
    });
  }
  
  /**
   * Handle console commands
   */
  function handleCommand(command) {
    const parts = command.slice(1).split(' ');
    const cmd = parts[0].toLowerCase();

    switch (cmd) {
      case 'help':
        addConsoleMessage('system', 'Available commands: /help, /clear, /debug');
        break;
        
      case 'clear':
        clearConsole();
        break;
        
      case 'debug':
        toggleDebugInfo();
        break;
        
      case 'pos':
      case 'position':
        if (typeof Player !== 'undefined') {
          const pos = Player.getPosition();
          addConsoleMessage('system', `Position: X: ${pos.x}, Y: ${pos.y}`);
        }
        break;
        
      default:
        addConsoleMessage('error', `Unknown command: /${cmd}`);
    }
  }
  
  /**
   * Add a message to the console
   */
  function addConsoleMessage(type, content, timestamp = true) {
    const messagesContainer = document.getElementById('console-messages');
    if (!messagesContainer) return;
    
    const msg = document.createElement('div');
    msg.className = `console-msg ${type}`;
    
    if (timestamp) {
      const time = new Date().toLocaleTimeString('en-US', { 
        hour12: false, 
        hour: '2-digit', 
        minute: '2-digit' 
      });
      msg.innerHTML = `<span class="timestamp">[${time}]</span>${content}`;
    } else {
      msg.innerHTML = content;
    }
    
    messagesContainer.appendChild(msg);
    
    // Store message
    consoleMessages.push({ type, content, timestamp: Date.now() });
    
    // Scroll to bottom
    const consoleContent = document.querySelector('.console-content');
    if (consoleContent) {
      consoleContent.scrollTop = consoleContent.scrollHeight;
    }
    
    // Limit messages
    if (consoleMessages.length > 200) {
      consoleMessages.shift();
      if (messagesContainer.firstChild) {
        messagesContainer.removeChild(messagesContainer.firstChild);
      }
    }
  }
  
  /**
   * Filter console messages by active tab
   */
  function filterConsoleMessages() {
    // For now, show all messages in all tabs
    // In future, can filter by type
  }
  
  /**
   * Clear console messages
   */
  function clearConsole() {
    const messagesContainer = document.getElementById('console-messages');
    if (messagesContainer) {
      messagesContainer.innerHTML = '';
    }
    consoleMessages = [];
    addConsoleMessage('system', 'Console cleared.', false);
  }
  
  /**
   * Toggle debug info display
   */
  function toggleDebugInfo() {
    const debug = document.getElementById('debug-info');
    if (debug) {
      debug.classList.toggle('hidden');
      addConsoleMessage('system', `Debug info ${debug.classList.contains('hidden') ? 'hidden' : 'shown'}.`);
    }
  }
  
  /**
   * Toggle a UI panel (collapse/expand)
   */
  function togglePanel(panelId) {
    const panel = document.getElementById(`${panelId}-panel`);
    if (!panel) return;
    
    panel.classList.toggle('collapsed');
    
    // Update toggle arrow
    const toggle = panel.querySelector('.panel-toggle');
    if (toggle) {
      toggle.textContent = panel.classList.contains('collapsed') ? '▶' : '▼';
    }
    
    // Special handling for skills panel overlay
    if (panelId === 'skills') {
      handleSkillsPanelOverlay(panel.classList.contains('collapsed'));
    }
  }
  
  // Store original parent for skills panel
  let skillsPanelOriginalParent = null;
  let skillsPanelOriginalNextSibling = null;
  
  /**
   * Handle skills panel overlay
   */
  function handleSkillsPanelOverlay(isCollapsed) {
    const backdrop = document.getElementById('skills-overlay-backdrop');
    const panel = document.getElementById('skills-panel');
    
    if (isCollapsed) {
      // Hide backdrop
      if (backdrop) backdrop.classList.remove('visible');
      
      // Move panel back to sidebar if it was moved
      if (skillsPanelOriginalParent && panel && panel.parentElement === document.body) {
        if (skillsPanelOriginalNextSibling) {
          skillsPanelOriginalParent.insertBefore(panel, skillsPanelOriginalNextSibling);
        } else {
          skillsPanelOriginalParent.appendChild(panel);
        }
      }
      
      // Reset to tree list view when closing
      closeSkillTree();
    } else {
      // Show backdrop
      if (backdrop) backdrop.classList.add('visible');
      
      // Move panel to body to escape overflow:hidden containers
      if (panel && panel.parentElement !== document.body) {
        skillsPanelOriginalParent = panel.parentElement;
        skillsPanelOriginalNextSibling = panel.nextElementSibling;
        document.body.appendChild(panel);
      }
    }
  }
  
  /**
   * Close skills panel (for external calls)
   */
  function closeSkillsPanel() {
    const panel = document.getElementById('skills-panel');
    if (panel && !panel.classList.contains('collapsed')) {
      togglePanel('skills');
    }
  }
  
  /**
   * Update all UI elements
   */
  function updateAllUI() {
    if (!characterData) return;
    
    updateCharacterInfo();
    updateStats();
    updateStatusBars();
    updateGold();
    updateZoneName();
    updateSkillTrees();
    updateSkillSlots();
    updateNotificationBadges();
  }
  
  /**
   * Update character info (name, level, exp)
   */
  function updateCharacterInfo() {
    if (!characterData) return;
    
    const nameEl = document.getElementById('ui-char-name');
    const levelEl = document.getElementById('ui-char-level');
    const expFill = document.getElementById('exp-bar-fill');
    const expText = document.getElementById('exp-text');
    
    if (nameEl) nameEl.textContent = characterData.name;
    if (levelEl) levelEl.textContent = `Level ${characterData.level}`;
    
    // Calculate exp for display
    const expInfo = calculateExpInfo(characterData.level, characterData.experience || 0);
    if (expFill) expFill.style.width = `${expInfo.percent}%`;
    if (expText) expText.textContent = `${expInfo.current}/${expInfo.needed}`;
  }
  
  /**
   * Calculate experience info for current level
   * EXP resets to 0 on level up (classic RPG style)
   * currentExp is the EXP since last level-up, needed is EXP to reach next level
   */
  function calculateExpInfo(level, currentExp) {
    // EXP needed to level up from current level
    const expNeeded = calculateExpForLevel(level);
    
    // Percentage towards next level
    const percent = expNeeded > 0 ? Math.min(100, Math.max(0, (currentExp / expNeeded) * 100)) : 0;
    
    return {
      current: Math.max(0, currentExp),
      needed: expNeeded,
      percent: percent
    };
  }
  
  /**
   * Calculate EXP needed to level up from a given level
   * Formula: 50 * level^1.5, rounded to nearest 10
   * Level 1->2: ~50 EXP, Level 2->3: ~140, Level 10->11: ~1580
   */
  function calculateExpForLevel(level) {
    if (level <= 1) return 50; // Level 1 needs 50 EXP to reach level 2
    return Math.round(50 * Math.pow(level, 1.5) / 10) * 10;
  }
  
  /**
   * Calculate experience percentage for current level (legacy, kept for compatibility)
   */
  function calculateExpPercent(level, exp) {
    return calculateExpInfo(level, exp).percent;
  }
  
  /**
   * Calculate derived stats from base stats
   */
  function calculateDerivedStats(stats) {
    const str = stats.str || 1;
    const agi = stats.agi || 1;
    const dex = stats.dex || 1;
    const vit = stats.vit || 1;
    const end = stats.end || 1;
    const int = stats.int || 1;
    const def = stats.def || 0;
    const arm = stats.arm || 0; // Armor from equipment, defaults to 0
    
    // Max HP: 45 + (VIT × 5) = 50 at VIT 1
    const maxHp = 45 + (vit * 5);
    
    // Max Stamina: 45 + (END × 5) = 50 at END 1
    const maxStamina = 45 + (end * 5);
    
    // Attack Damage: 1 + (STR - 1)
    const attackDmg = 1 + (str - 1);
    
    // Magic Damage: INT
    const magicDmg = int;
    
    // Attack Speed Cooldown calculation:
    // AGI 1-50: Linear scaling from 2.0s to 1.0s
    // AGI 50+: Diminishing returns toward 0.3s minimum
    const baseCooldown = 2.0;
    const softCapAgi = 50;
    const minCooldown = 0.3;
    const softCapCooldown = 1.0;
    
    let attackSpd;
    
    if (agi <= softCapAgi) {
      // Linear scaling from 2.0s (AGI 1) to 1.0s (AGI 50)
      const reduction = (baseCooldown - softCapCooldown) * (agi - 1) / (softCapAgi - 1);
      attackSpd = baseCooldown - reduction;
    } else {
      // Diminishing returns after soft cap
      const overCap = agi - softCapAgi;
      const remainingReduction = softCapCooldown - minCooldown;
      const diminishedReduction = remainingReduction * (overCap / (overCap + softCapAgi));
      attackSpd = softCapCooldown - diminishedReduction;
    }
    
    attackSpd = Math.max(attackSpd, minCooldown);
    
    // Crit Chance: DEX × 0.5% (with diminishing returns after 35%)
    const rawCrit = dex * 0.5;
    const critChance = applyDiminishingReturns(rawCrit);
    
    // Dodge Chance: DEX × 0.5% (with diminishing returns after 35%)
    const rawDodge = dex * 0.5;
    const dodgeChance = applyDiminishingReturns(rawDodge);
    
    // Block Chance: DEF × 1% (with diminishing returns after 50%, hard cap 75%)
    // Blocking mitigates 50% damage
    const defSoftCap = 50;
    const blockHardCap = 75;
    let blockChance = 0;
    
    if (def <= defSoftCap) {
      blockChance = def * 1.0;
    } else {
      blockChance = defSoftCap * 1.0;
      const overCap = def - defSoftCap;
      blockChance += overCap * 1.0 * 0.5;
    }
    blockChance = Math.min(blockChance, blockHardCap);
    
    // Cooldown Reduction: INT × 0.5% (aggressive diminishing returns)
    const rawCdr = int * 0.5;
    const cdr = Math.min(50, applyDiminishingReturns(rawCdr)); // Hard cap at 50%
    
    // Damage Mitigation from Armor: 0.5% per ARM point
    // Soft cap at 40%, diminishing returns up to hard cap of 70%
    const rawMitigation = arm * 0.5;
    const mitigation = applyMitigationDiminishingReturns(rawMitigation);
    
    return {
      maxHp,
      maxStamina,
      attackDmg,
      magicDmg,
      attackSpd,
      critChance,
      dodgeChance,
      blockChance,
      cdr,
      mitigation
    };
  }
  
  /**
   * Apply diminishing returns (soft cap 35%, hard cap 70%)
   */
  function applyDiminishingReturns(rawValue) {
    const softCap = 35;
    const hardCap = 70;
    
    if (rawValue <= softCap) {
      return rawValue;
    }
    
    const finalValue = softCap + ((rawValue - softCap) * 0.5);
    return Math.min(finalValue, hardCap);
  }
  
  /**
   * Apply diminishing returns for mitigation (soft cap 40%, hard cap 70%)
   */
  function applyMitigationDiminishingReturns(rawValue) {
    const softCap = 40;
    const hardCap = 70;
    
    if (rawValue <= softCap) {
      return rawValue;
    }
    
    const finalValue = softCap + ((rawValue - softCap) * 0.5);
    return Math.min(finalValue, hardCap);
  }
  
  /**
   * Update character stats display (base stats + derived stats)
   */
  function updateStats() {
    if (!characterData) return;
    
    const bonuses = equipmentBonuses || {};
    
    // Update base stats with equipment bonus display
    const stats = ['str', 'agi', 'dex', 'vit', 'end', 'int', 'def'];
    stats.forEach(stat => {
      const el = document.getElementById(`stat-${stat}`);
      if (el && characterData[stat] !== undefined) {
        const base = characterData[stat];
        const bonus = bonuses[stat] || 0;
        if (bonus > 0) {
          el.innerHTML = `${base}<span class="stat-bonus">+${bonus}</span>`;
        } else {
          el.textContent = base;
        }
      }
    });
    
    // Build stats with equipment bonuses for derived calculations
    const totalStats = {};
    stats.forEach(stat => {
      totalStats[stat] = (characterData[stat] || (stat === 'def' ? 0 : 1)) + (bonuses[stat] || 0);
    });
    totalStats.arm = (bonuses.armor || 0);
    
    // Calculate and display derived stats using totals (base + equipment)
    const derived = calculateDerivedStats(totalStats);
    
    // Attack Damage (from STR)
    const attackDmgEl = document.getElementById('derived-attackdmg');
    if (attackDmgEl) attackDmgEl.textContent = derived.attackDmg;
    
    // Attack Speed (from AGI)
    const attackSpdEl = document.getElementById('derived-attackspd');
    if (attackSpdEl) attackSpdEl.textContent = derived.attackSpd.toFixed(2) + 's';
    
    // Crit/Dodge (from DEX) - now separate elements
    const critEl = document.getElementById('derived-crit');
    const dodgeEl = document.getElementById('derived-dodge');
    if (critEl) critEl.textContent = derived.critChance.toFixed(1) + '%';
    if (dodgeEl) dodgeEl.textContent = derived.dodgeChance.toFixed(1) + '%';
    
    // Max HP (from VIT)
    const maxHpEl = document.getElementById('derived-maxhp');
    if (maxHpEl) maxHpEl.textContent = derived.maxHp;
    
    // Max Stamina (from END)
    const maxStaminaEl = document.getElementById('derived-maxstamina');
    if (maxStaminaEl) maxStaminaEl.textContent = derived.maxStamina;
    
    // Magic Damage/CDR (from INT) - now separate elements
    const magEl = document.getElementById('derived-mag');
    const cdrEl = document.getElementById('derived-cdr');
    if (magEl) magEl.textContent = derived.magicDmg;
    if (cdrEl) cdrEl.textContent = derived.cdr.toFixed(1) + '%';
    
    // Block Chance (from DEF)
    const blockEl = document.getElementById('derived-block');
    if (blockEl) blockEl.textContent = derived.blockChance.toFixed(1) + '%';
    
    // Armor (from equipment) - display the ARM value
    const armEl = document.getElementById('stat-arm');
    if (armEl) armEl.textContent = bonuses.armor || 0;
    
    // Damage Mitigation (from ARM)
    const mitigationEl = document.getElementById('derived-mitigation');
    if (mitigationEl) mitigationEl.textContent = derived.mitigation.toFixed(1) + '%';
    
    // Stat points
    const pointsRow = document.getElementById('stat-points-row');
    const pointsEl = document.getElementById('stat-points');
    if (pointsRow && pointsEl) {
      if (characterData.statPoints > 0) {
        pointsRow.classList.remove('hidden');
        pointsEl.textContent = characterData.statPoints;
      } else {
        pointsRow.classList.add('hidden');
      }
    }
    
    // Show/hide upgrade buttons based on available stat points
    updateStatUpgradeButtons();
  }
  
  /**
   * Update stat upgrade buttons visibility
   */
  function updateStatUpgradeButtons() {
    const hasPoints = (characterData?.statPoints || 0) > 0;
    const upgradableStats = ['str', 'agi', 'dex', 'vit', 'end', 'int', 'def']; // ARM not included
    
    upgradableStats.forEach(stat => {
      const btn = document.querySelector(`.stat-upgrade-btn[data-stat="${stat}"]`);
      if (btn) {
        if (hasPoints) {
          btn.classList.remove('hidden');
        } else {
          btn.classList.add('hidden');
        }
      }
    });
  }
  
  /**
   * Update notification badges for stats and skills panels
   */
  function updateNotificationBadges() {
    // Stats notification
    const statsNotif = document.getElementById('stats-notification');
    const statPoints = characterData?.statPoints || 0;
    if (statsNotif) {
      if (statPoints > 0) {
        statsNotif.textContent = statPoints;
        statsNotif.classList.remove('hidden');
      } else {
        statsNotif.classList.add('hidden');
      }
    }
    
    // Skills notification
    const skillsNotif = document.getElementById('skills-notification');
    const skillPoints = characterData?.skillPoints || 0;
    if (skillsNotif) {
      if (skillPoints > 0) {
        skillsNotif.textContent = skillPoints;
        skillsNotif.classList.remove('hidden');
      } else {
        skillsNotif.classList.add('hidden');
      }
    }
  }
  
  /**
   * Upgrade a stat by 1 point — sends request to server
   * Server validates, applies, and responds with authoritative state
   */
  function upgradeStat(statName) {
    if (!characterData) return;
    
    const statPoints = characterData.statPoints || 0;
    if (statPoints <= 0) {
      addConsoleMessage('system', 'No stat points available');
      return;
    }
    
    // ARM cannot be upgraded this way
    if (statName === 'arm') {
      addConsoleMessage('system', 'Armor cannot be upgraded with stat points');
      return;
    }
    
    const validStats = ['str', 'agi', 'dex', 'vit', 'end', 'int', 'def'];
    if (!validStats.includes(statName)) {
      addConsoleMessage('error', 'Invalid stat');
      return;
    }
    
    // Send only the stat name to the server — server handles everything
    Connection.send({
      type: CONSTANTS.MSG_TYPES.STAT_ALLOCATE,
      stat: statName
    });
  }
  
  // saveCharacterStats removed — stat allocation is now server-authoritative.
  // The client sends only { type: "stat_allocate", stat: "str" } and the server
  // validates, applies, and responds with the full authoritative character state.
  
  /**
   * Admin function to add +1 level
   */
  function addLevelAdmin() {
    if (!isAdmin) {
      addConsoleMessage('error', 'Admin only');
      return;
    }
    
    if (!characterData) return;
    
    // Send level up request to server
    if (typeof Connection !== 'undefined') {
      Connection.send({
        type: 'admin_add_level'
      });
      addConsoleMessage('system', `⬆️ Level up requested...`);
    }
  }
  
  /**
   * Admin function to fully heal character
   */
  function healAdmin() {
    if (!isAdmin) {
      addConsoleMessage('error', 'Admin only');
      return;
    }
    
    if (!characterData) return;
    
    // Send heal request to server
    if (typeof Connection !== 'undefined') {
      Connection.send({
        type: 'admin_heal'
      });
      addConsoleMessage('system', '❤️ Full heal requested...');
    }
  }
  
  /**
   * Admin function to reset character to level 1
   */
  function resetCharacterAdmin() {
    if (!isAdmin) {
      addConsoleMessage('error', 'Admin only');
      return;
    }
    
    if (!characterData) return;
    
    // Confirm before resetting
    if (!confirm('⚠️ Are you sure you want to reset your character?\n\nThis will:\n- Reset to Level 1\n- Set all stats to 1\n- Set HP and Stamina to 50\n- Remove all skill points\n- Reset all learned skills\n- Clear all inventory items\n- Remove all equipped items\n\nThis cannot be undone!')) {
      return;
    }
    
    // Send reset request to server
    if (typeof Connection !== 'undefined') {
      Connection.send({
        type: 'admin_reset_character'
      });
      addConsoleMessage('system', '🔄 Character reset requested...');
    }
  }
  
  /**
   * Admin function to teleport to a specific zone
   */
  function teleportAdmin() {
    if (!isAdmin) {
      addConsoleMessage('error', 'Admin only');
      return;
    }
    
    const input = document.getElementById('teleport-zone-input');
    const zoneId = input?.value?.trim();
    
    console.log('[GameUI] Teleport requested, zoneId:', zoneId);
    
    if (!zoneId) {
      addConsoleMessage('error', 'Please enter a zone ID');
      return;
    }
    
    // Send teleport request to server
    if (typeof Connection !== 'undefined') {
      const msg = {
        type: CONSTANTS.MSG_TYPES.ADMIN_TELEPORT,
        zoneId: zoneId
      };
      console.log('[GameUI] Sending teleport message:', msg);
      console.log('[GameUI] MSG_TYPE value:', CONSTANTS.MSG_TYPES.ADMIN_TELEPORT);
      Connection.send(msg);
      addConsoleMessage('system', `⚡ Teleporting to ${zoneId}...`);
    }
  }
  
  /**
   * Handle teleport response from server
   */
  function handleTeleportResponse(message) {
    if (message.success) {
      addConsoleMessage('system', `✅ Teleported to ${message.zoneId}`);
      
      // Clear input
      const input = document.getElementById('teleport-zone-input');
      if (input) input.value = '';
      
      // Load the new zone
      if (typeof ZoneManager !== 'undefined' && typeof Player !== 'undefined') {
        ZoneManager.loadZone(message.zoneId).then(() => {
          // Set player position
          Player.setPosition(message.x, message.y);
          Player.setZone(message.zoneId);
          
          // Request ghosts for new zone
          if (typeof GhostPlayers !== 'undefined') {
            GhostPlayers.requestGhosts();
          }
        });
      }
    } else {
      addConsoleMessage('error', `❌ Teleport failed: ${message.error}`);
    }
  }
  
  // checkLevelUp removed — leveling is now fully server-authoritative.
  // The server calculates level-ups in processCombatEnd/awardExperience and sends
  // the authoritative state back to the client. The client just applies it.
  
  /**
   * Update HP bar (stamina bar removed)
   */
  function updateStatusBars() {
    if (!characterData) return;
    
    // HP Bar
    const hp = characterData.hp || 50;
    const maxHp = characterData.maxHp || 50;
    const hpFill = document.getElementById('hp-bar-fill');
    const hpText = document.getElementById('hp-bar-text');
    
    if (hpFill) hpFill.style.width = `${(hp / maxHp) * 100}%`;
    if (hpText) hpText.textContent = `${hp}/${maxHp}`;
    
    // Stamina Bar
    const stamina = characterData.stamina || characterData.maxStamina || 50;
    const maxStamina = characterData.maxStamina || 50;
    const staminaFill = document.getElementById('stamina-bar-fill');
    const staminaText = document.getElementById('stamina-bar-text');
    
    if (staminaFill) staminaFill.style.width = `${(stamina / maxStamina) * 100}%`;
    if (staminaText) staminaText.textContent = `${Math.floor(stamina)}/${maxStamina}`;
  }
  
  /**
   * Update HP display directly (for combat)
   * Supports overflow HP (e.g., 70/50 from Mana Shield) - bar shows full, text shows actual
   */
  function updateHp(hp, maxHp) {
    if (characterData) {
      characterData.hp = hp;
      if (maxHp !== undefined) characterData.maxHp = maxHp;
    }
    
    const hpFill = document.getElementById('hp-bar-fill');
    const hpText = document.getElementById('hp-bar-text');
    const max = maxHp || (characterData ? characterData.maxHp : 50);
    
    // Calculate fill percentage - cap at 100% but allow overflow visually
    const fillPercent = Math.min(100, (hp / max) * 100);
    const hasOverflow = hp > max;
    
    if (hpFill) {
      hpFill.style.width = `${fillPercent}%`;
      // Add special styling for overflow HP (shield effect)
      if (hasOverflow) {
        hpFill.classList.add('hp-overflow');
      } else {
        hpFill.classList.remove('hp-overflow');
      }
    }
    // Always show actual HP value even if it exceeds max (e.g., "70/50")
    if (hpText) hpText.textContent = `${Math.floor(hp)}/${max}`;
  }
  
  /**
   * Update stamina display (for combat)
   */
  function updateStamina(stamina, maxStamina) {
    if (characterData) {
      characterData.stamina = stamina;
      if (maxStamina !== undefined) characterData.maxStamina = maxStamina;
    }
    
    const max = maxStamina || (characterData ? characterData.maxStamina : 50);
    const staminaFill = document.getElementById('stamina-bar-fill');
    const staminaText = document.getElementById('stamina-bar-text');
    
    if (staminaFill) staminaFill.style.width = `${(stamina / max) * 100}%`;
    if (staminaText) staminaText.textContent = `${Math.floor(stamina)}/${max}`;
  }
  
  /**
   * Update character data and refresh UI
   */
  function updateCharacterData(data) {
    if (!data) return;
    
    // Merge new data with existing
    characterData = { ...characterData, ...data };
    
    // Refresh all UI elements
    updateAllUI();
  }
  
  /**
   * Update gold display
   * @param {number} [gold] - Optional gold amount, uses characterData.gold if not provided
   */
  function updateGold(gold) {
    // If gold parameter is provided, update characterData
    if (gold !== undefined && characterData) {
      characterData.gold = gold;
    }
    
    const goldEl = document.getElementById('ui-gold');
    if (goldEl && characterData) {
      goldEl.textContent = formatNumber(characterData.gold || 0);
    }
    
    // Also update shop gold display if shop is open
    if (currentShop) {
      updateShopGold();
    }
    
    // Also update market gold display if market is open
    if (marketOpen) {
      const marketGoldEl = document.getElementById('market-gold-amount');
      if (marketGoldEl && characterData) {
        marketGoldEl.textContent = characterData.gold || 0;
      }
    }
  }
  
  /**
   * Update zone name display
   */
  function updateZoneName(zoneName) {
    const el = document.getElementById('zone-name-display');
    if (el) {
      if (zoneName) {
        el.textContent = zoneName;
      } else if (typeof ZoneManager !== 'undefined') {
        const zone = ZoneManager.getCurrentZone();
        if (zone) {
          el.textContent = zone.name;
        }
      }
    }
  }
  
  /**
   * Update inventory capacity display
   */
  function updateInventoryCapacity() {
    const el = document.getElementById('inventory-capacity');
    if (el) {
      // Count unique item stacks in inventory
      const itemCount = inventoryItems.length;
      el.textContent = `${itemCount}/${currentInventorySize}`;
    }
  }
  
  /**
   * Set character data and update UI
   */
  function setCharacterData(data) {
    characterData = data;
    updateAllUI();
  }
  
  /**
   * Update a specific stat
   */
  function updateStat(stat, value) {
    if (characterData) {
      characterData[stat] = value;
    }
    
    const el = document.getElementById(`stat-${stat}`);
    if (el) {
      el.textContent = value;
    }
  }
  
  /**
   * Update HP
   */
  function updateHP(current, max) {
    if (characterData) {
      characterData.hp = current;
      if (max) characterData.maxHp = max;
    }
    updateStatusBars();
  }
  
  /**
   * Update stamina
   */
  function updateStamina(current, max) {
    if (characterData) {
      characterData.stamina = current;
      if (max) characterData.maxStamina = max;
    }
    updateStatusBars();
  }
  
  /**
   * Format large numbers (e.g., 1000 -> 1,000)
   */
  function formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
  
  /**
   * Escape HTML to prevent XSS
   */
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  
  /**
   * Log a server message to console
   */
  function logServer(message) {
    addConsoleMessage('server', message);
  }
  
  /**
   * Log an error message to console
   */
  function logError(message) {
    addConsoleMessage('error', message);
  }
  
  /**
   * Log a system message to console
   */
  function logSystem(message) {
    addConsoleMessage('system', message);
  }
  
  // =====================
  // SKILL SYSTEM
  // =====================
  
  // Skill tree definitions per GDD Section 6
  const SKILL_TREES = {
    swordsmanship: {
      name: 'Swordsmanship',
      icon: '⚔️',
      unlockLevel: 1,
      skills: [
        // Active skills (first 3)
        { id: 1, name: 'Strike', type: 'active', icon: '⚔️', staminaCost: 15, cooldown: 6000, initialCooldown: 4000,
          description: 'A powerful attack dealing +{value1} bonus damage.',
          scaling: { value1: { base: 10, perLevel: 5 } } },
        { id: 4, name: 'Second Wind', type: 'active', icon: '💨', staminaCost: 10, cooldown: 4000, initialCooldown: 1000,
          description: 'Increase your attack speed by {value1}% for the rest of the battle.',
          scaling: { value1: { base: 10, perLevel: 5 } } },
        { id: 7, name: 'Bash', type: 'active', icon: '💥', staminaCost: 20, cooldown: 15000, initialCooldown: 5000,
          description: 'Stun your opponent for {value1}s. Stunned opponents cannot act, but their passive skills keep working.',
          scaling: { value1: { base: 1, perLevel: 0.5 } } },
        // Passive skills (next 6)
        { id: 2, name: 'Riposte', type: 'passive', icon: '↩️',
          description: 'When you dodge an attack, deal {value1}% of the enemy\'s attack damage back to them.',
          scaling: { value1: { base: 40, perLevel: 20 } } },
        { id: 3, name: 'En Garde', type: 'passive', icon: '⚡',
          description: 'Your attacks restore {value1}% of your maximum stamina.',
          scaling: { value1: { base: 1, perLevel: 0.5 } } },
        { id: 5, name: 'Bloodletting', type: 'passive', icon: '🩸',
          description: 'Your attacks deal an extra {value1}% of the enemy\'s Max HP as true damage.',
          scaling: { value1: { base: 0.5, perLevel: 0.25 } } },
        { id: 6, name: 'Punish', type: 'passive', icon: '👊',
          description: '{value1}% chance to strike twice with each attack.',
          scaling: { value1: { base: 5, perLevel: 2.5 } } },
        { id: 8, name: 'Precision', type: 'passive', icon: '🎯',
          description: 'Your critical hits deal {value1}% additional damage.',
          scaling: { value1: { base: 20, perLevel: 10 } } },
        { id: 9, name: 'Unbalance', type: 'passive', icon: '⚖️',
          description: 'When an enemy dodges or blocks, deal {value1}% of your AGI as damage anyway.',
          scaling: { value1: { base: 50, perLevel: 25 } } }
      ]
    },
    defense: {
      name: 'Defense',
      icon: '🛡️',
      unlockLevel: 1,
      skills: [
        { id: 10, name: 'Reflect', type: 'active', icon: '🪞', staminaCost: 15, cooldown: 3000, initialCooldown: 3000,
          description: 'Block the next attack and reflect {value1}% of the damage back.',
          scaling: { value1: { base: 50, perLevel: 25 } } },
        { id: 13, name: 'Shield Wall', type: 'active', icon: '🧱', staminaCost: 23, cooldown: 20000, initialCooldown: 10000,
          description: 'Become invulnerable for {value1}s.',
          scaling: { value1: { base: 2, perLevel: 1 } } },
        { id: 16, name: 'Stomp', type: 'active', icon: '🦶', staminaCost: 17, cooldown: 8000, initialCooldown: 3000,
          description: 'Deal {value1}% of your DEF as damage.',
          scaling: { value1: { base: 50, perLevel: 25 } } },
        { id: 11, name: 'Poise', type: 'passive', icon: '🧘',
          description: 'Each successful block restores {value1}% of your Max HP.',
          scaling: { value1: { base: 2, perLevel: 1 } } },
        { id: 12, name: 'Sturdiness', type: 'passive', icon: '💪',
          description: 'Every 3 seconds, gain permanent +{value1}% DEF for the battle.',
          scaling: { value1: { base: 3, perLevel: 1.5 } } },
        { id: 14, name: 'Undermine', type: 'passive', icon: '⛏️',
          description: 'Enemy loses {value1} stamina when it attacks you.',
          scaling: { value1: { base: 1, perLevel: 0.5 } } },
        { id: 15, name: 'Parry', type: 'passive', icon: '🤺',
          description: 'Blocking has a {value1}% chance to stun the enemy for 1s.',
          scaling: { value1: { base: 15, perLevel: 7.5 } } },
        { id: 17, name: 'Spikes', type: 'passive', icon: '📌',
          description: 'When hit, deal {value1} fixed damage back to the attacker.',
          scaling: { value1: { base: 4, perLevel: 2 } } },
        { id: 18, name: 'Mana Shield', type: 'passive', icon: '🔮',
          description: 'Start battle with +{value1}% of your INT as bonus HP (overflow).',
          scaling: { value1: { base: 50, perLevel: 25 } } }
      ]
    },
    vitality: {
      name: 'Vitality',
      icon: '❤️',
      unlockLevel: 10,
      skills: [
        { id: 19, name: 'Heal', type: 'active', icon: '💚', staminaCost: 20, cooldown: 10000, initialCooldown: 5000,
          description: 'Heal {value1}% of your Max HP.',
          scaling: { value1: { base: 10, perLevel: 5 } } },
        { id: 22, name: 'Unfair Exchange', type: 'active', icon: '💱', staminaCost: 30, cooldown: 10000, initialCooldown: 2000,
          description: 'Sacrifice {value1} HP to deal {value1}+INT damage to the enemy.',
          scaling: { value1: { base: 20, perLevel: 10 } } },
        { id: 25, name: 'Disrupt', type: 'active', icon: '🚫', staminaCost: 15, cooldown: 12000, initialCooldown: 5000,
          description: 'Prevent enemy healing for {value1}s.',
          scaling: { value1: { base: 2, perLevel: 1 } } },
        { id: 20, name: 'Regeneration', type: 'passive', icon: '♻️',
          description: 'Regenerate {value1}% of your Max HP per second.',
          scaling: { value1: { base: 1, perLevel: 0.5 } } },
        { id: 21, name: 'Berserk', type: 'passive', icon: '😤',
          description: 'Below 50% HP, gain +{value1}% STR for each 1% of health missing.',
          scaling: { value1: { base: 1, perLevel: 0.5 } } },
        { id: 23, name: 'Life Steal', type: 'passive', icon: '🧛',
          description: 'Basic attacks heal {value1}% of the damage dealt.',
          scaling: { value1: { base: 2, perLevel: 1 } } },
        { id: 24, name: 'Divine Punishment', type: 'passive', icon: '⚡',
          description: 'When healed, deal {value1} true damage to the enemy.',
          scaling: { value1: { base: 4, perLevel: 2 } } },
        { id: 26, name: 'Giant', type: 'passive', icon: '🗿',
          description: 'Start battle with +{value1}% Max HP.',
          scaling: { value1: { base: 10, perLevel: 5 } } },
        { id: 27, name: 'Rust', type: 'passive', icon: '🔧',
          description: 'Reduces enemy damage mitigation by {value1}%.',
          scaling: { value1: { base: 20, perLevel: 10 } } }
      ]
    },
    roguery: {
      name: 'Roguery',
      icon: '🏹',
      unlockLevel: 10,
      skills: [
        { id: 28, name: 'Analyze', type: 'active', icon: '🔍', staminaCost: 20, cooldown: 8000, initialCooldown: 3000,
          description: 'Next attack is a guaranteed crit with +{value1}% bonus damage.',
          scaling: { value1: { base: 30, perLevel: 15 } } },
        { id: 31, name: 'Multi-Strike', type: 'active', icon: '✨', staminaCost: 30, cooldown: 12000, initialCooldown: 5000,
          description: 'Next attack hits {value1} extra times.',
          scaling: { value1: { base: 2, perLevel: 1 } } },
        { id: 34, name: 'Cleanse', type: 'active', icon: '🧹', staminaCost: 17, cooldown: 15000, initialCooldown: 5000,
          description: 'Remove all negative effects from yourself.',
          scaling: {} },
        { id: 29, name: 'Counter-Attack', type: 'passive', icon: '↪️',
          description: 'After dodging, your next attack deals +{value1}% damage (stacks).',
          scaling: { value1: { base: 5, perLevel: 2.5 } } },
        { id: 30, name: 'Light Feet', type: 'passive', icon: '🦶',
          description: 'Auto-dodge all basic attacks for the first {value1}s of battle.',
          scaling: { value1: { base: 2, perLevel: 1 } } },
        { id: 32, name: 'Poisonous Blade', type: 'passive', icon: '🗡️',
          description: '{value1}% chance to apply +1 Poison stack on hit. Poison deals stack damage per second.',
          scaling: { value1: { base: 10, perLevel: 5 } } },
        { id: 33, name: 'Grand Opening', type: 'passive', icon: '🎭',
          description: 'Your first successful attack deals +{value1}% damage.',
          scaling: { value1: { base: 100, perLevel: 50 } } },
        { id: 35, name: 'Battle Rhythm', type: 'passive', icon: '🥁',
          description: 'Skills cost {value1}% less stamina.',
          scaling: { value1: { base: 20, perLevel: 10 } } },
        { id: 36, name: 'Shuriken', type: 'passive', icon: '⭐',
          description: 'Every 3s, deal {value1}% of your DEX as damage.',
          scaling: { value1: { base: 20, perLevel: 10 } } }
      ]
    },
    magic: {
      name: 'Magic',
      icon: '✨',
      unlockLevel: 20,
      skills: [
        { id: 37, name: 'Fireball', type: 'active', icon: '🔥', staminaCost: 25, cooldown: 8000, initialCooldown: 3000,
          description: 'Deal {value1}% of your INT as damage.',
          scaling: { value1: { base: 100, perLevel: 50 } } },
        { id: 40, name: 'Frozen Bolt', type: 'active', icon: '❄️', staminaCost: 16, cooldown: 10000, initialCooldown: 4000,
          description: 'Reduce enemy attack speed by 50% for {value1}s.',
          scaling: { value1: { base: 4, perLevel: 2 } } },
        { id: 43, name: 'Hidden Force', type: 'active', icon: '👁️', staminaCost: 27, cooldown: 20000, initialCooldown: 0,
          description: 'Increase your STR by +{value1}% of your INT until the end of the battle.',
          scaling: { value1: { base: 20, perLevel: 10 } } },
        { id: 38, name: 'Meditation', type: 'passive', icon: '🧘',
          description: 'Recover {value1}% max stamina per second.',
          scaling: { value1: { base: 2, perLevel: 1 } } },
        { id: 39, name: 'Time Bend', type: 'passive', icon: '⏰',
          description: 'Increases enemy\'s initial cooldowns by {value1}%.',
          scaling: { value1: { base: 20, perLevel: 10 } } },
        { id: 41, name: 'Shards', type: 'passive', icon: '💎',
          description: 'When using an active skill, deal {value1} extra damage.',
          scaling: { value1: { base: 10, perLevel: 5 } } },
        { id: 42, name: 'Quick Cast', type: 'passive', icon: '⚡',
          description: 'Your first cast of each skill has {value1}% less cooldown.',
          scaling: { value1: { base: 30, perLevel: 15 } } },
        { id: 44, name: 'Dispelling', type: 'passive', icon: '🚫',
          description: 'When an enemy uses a skill, it loses {value1}% stamina.',
          scaling: { value1: { base: 6, perLevel: 3 } } },
        { id: 45, name: 'Chant', type: 'passive', icon: '🎵',
          description: 'Every 3s, gain +{value1}% INT until the end of the battle.',
          scaling: { value1: { base: 2, perLevel: 1 } } }
      ]
    },
    windmaster: {
      name: 'Windmaster',
      icon: '🌬️',
      unlockLevel: 20,
      skills: [
        { id: 46, name: 'Wind Blast', type: 'active', icon: '💨', staminaCost: 26, cooldown: 12000, initialCooldown: 5000,
          description: 'Deal {value1}% of enemy Max HP as true damage.',
          scaling: { value1: { base: 5, perLevel: 2.5 } } },
        { id: 49, name: 'Heavy Cloud', type: 'active', icon: '☁️', staminaCost: 17, cooldown: 12000, initialCooldown: 4000,
          description: 'Prevent enemy from dodging or blocking for {value1}s.',
          scaling: { value1: { base: 2, perLevel: 1 } } },
        { id: 52, name: 'Suffocate', type: 'active', icon: '😵', staminaCost: 20, cooldown: 12000, initialCooldown: 5000,
          description: 'Drain {value1}% of enemy\'s current stamina.',
          scaling: { value1: { base: 25, perLevel: 12.5 } } },
        { id: 47, name: 'Rebalance', type: 'passive', icon: '⚖️',
          description: 'Dodging or blocking heals {value1} HP.',
          scaling: { value1: { base: 5, perLevel: 2.5 } } },
        { id: 48, name: 'Vigor', type: 'passive', icon: '💪',
          description: 'Every time stamina is recovered, deal {value1} damage.',
          scaling: { value1: { base: 1, perLevel: 0.5 } } },
        { id: 50, name: 'Fatigue', type: 'passive', icon: '😴',
          description: '+{value1}% damage if enemy is below 20% stamina.',
          scaling: { value1: { base: 20, perLevel: 10 } } },
        { id: 51, name: 'Cushion', type: 'passive', icon: '🛋️',
          description: 'Reduce basic attack damage taken by {value1}%.',
          scaling: { value1: { base: 3, perLevel: 1.5 } } },
        { id: 53, name: 'Concentration', type: 'passive', icon: '🎯',
          description: 'Above 70% HP, gain +{value1}% block chance.',
          scaling: { value1: { base: 5, perLevel: 2.5 } } },
        { id: 54, name: 'Aegis', type: 'passive', icon: '🛡️',
          description: 'When HP is below 20% Max HP, all healing is {value1}% stronger.',
          scaling: { value1: { base: 50, perLevel: 25 } } }
      ]
    },
    shadow: {
      name: 'Shadow',
      icon: '🌑',
      unlockLevel: 30,
      skills: [
        { id: 55, name: 'Assassinate', type: 'active', icon: '🗡️', staminaCost: 12, cooldown: 15000, initialCooldown: 5000,
          description: 'Attack with +{value1}% bonus damage. If enemy HP is below 50%, damage is doubled.',
          scaling: { value1: { base: 20, perLevel: 10 } } },
        { id: 58, name: 'Poison Cloud', type: 'active', icon: '☠️', staminaCost: 30, cooldown: 8000, initialCooldown: 0,
          description: 'Apply {value1} poison stacks instantly.',
          scaling: { value1: { base: 4, perLevel: 2 } } },
        { id: 61, name: 'Metamorph', type: 'active', icon: '🦋', staminaCost: 10, cooldown: 3000, initialCooldown: 1000,
          description: 'Gain +{value1} to your current lowest attribute until the end of the battle.',
          scaling: { value1: { base: 2, perLevel: 1 } } },
        { id: 56, name: 'Shadow Form', type: 'passive', icon: '👤',
          description: 'After {value1} attacks received, auto-dodge the next one.',
          scaling: { value1: { base: 6, perLevel: -1 } } },
        { id: 57, name: 'Weakness', type: 'passive', icon: '📉',
          description: 'Each crit increases your DEX by {value1}% until the end of the battle.',
          scaling: { value1: { base: 2, perLevel: 1 } } },
        { id: 59, name: 'Hasty', type: 'passive', icon: '⏩',
          description: 'Reduce initial cooldown of your skill in slot 1 by {value1}s.',
          scaling: { value1: { base: 2, perLevel: 1 } } },
        { id: 60, name: 'Putrid', type: 'passive', icon: '🤢',
          description: 'Every 2s, apply {value1} poison to the enemy.',
          scaling: { value1: { base: 2, perLevel: 1 } } },
        { id: 62, name: 'Binding', type: 'passive', icon: '⛓️',
          description: 'The first enemy active skill that hits you has +{value1}s cooldown for the battle.',
          scaling: { value1: { base: 2, perLevel: 1 } } },
        { id: 63, name: 'Ooze', type: 'passive', icon: '🟢',
          description: 'Enemy starts battle stunned for {value1} seconds.',
          scaling: { value1: { base: 1, perLevel: 0.5 } } }
      ]
    },
    arcane: {
      name: 'Arcane',
      icon: '🔮',
      unlockLevel: 30,
      skills: [
        { id: 64, name: 'Mirror Strike', type: 'active', icon: '🪞', staminaCost: 16, cooldown: 12000, initialCooldown: 5000,
          description: 'Stun both yourself and the enemy for {value1}s.',
          scaling: { value1: { base: 1, perLevel: 0.5 } } },
        { id: 67, name: 'Light Missile', type: 'active', icon: '✨', staminaCost: 7, cooldown: 2000, initialCooldown: 2000,
          description: 'Deal {value1} true damage.',
          scaling: { value1: { base: 5, perLevel: 2.5 } } },
        { id: 70, name: 'Avatar', type: 'active', icon: '👼', staminaCost: 35, cooldown: 15000, initialCooldown: 5000,
          description: '+{value1}% to all base attributes for the battle.',
          scaling: { value1: { base: 5, perLevel: 2.5 } } },
        { id: 65, name: 'Banish', type: 'passive', icon: '🚪',
          description: 'If the enemy has 100% HP, increase your damage by {value1}%.',
          scaling: { value1: { base: 200, perLevel: 100 } } },
        { id: 66, name: 'Normalize', type: 'passive', icon: '📊',
          description: 'At battle start, reduce your enemy\'s highest stat by {value1}%.',
          scaling: { value1: { base: 20, perLevel: 10 } } },
        { id: 68, name: 'Blessing', type: 'passive', icon: '🙏',
          description: 'Using an active skill heals {value1} HP.',
          scaling: { value1: { base: 10, perLevel: 5 } } },
        { id: 69, name: 'Illuminate', type: 'passive', icon: '💡',
          description: 'Permanently reduce enemy dodge by {value1}%.',
          scaling: { value1: { base: 10, perLevel: 5 } } },
        { id: 71, name: 'Reactivation', type: 'passive', icon: '🔄',
          description: '{value1}% chance to cast a skill twice (uses stamina twice).',
          scaling: { value1: { base: 6, perLevel: 3 } } },
        { id: 72, name: 'Momentum', type: 'passive', icon: '🚀',
          description: 'Each consecutive hit increases attack speed by {value1}%.',
          scaling: { value1: { base: 2, perLevel: 1 } } }
      ]
    }
  };
  
  // Player's learned skills (skill_id -> level 0-5)
  let playerSkills = {};
  // Player's equipped active skills (slot 1-5 -> skill_id or null)
  let equippedSkills = [null, null, null, null, null];
  // Admin status (bypasses level restrictions)
  let isAdmin = false;
  
  /**
   * Set admin status for UI
   */
  function setAdminStatus(admin) {
    isAdmin = admin;
    updateSkillTrees(); // Refresh skill trees lock status
  }
  
  /**
   * Open a skill tree to show its skills
   */
  function openSkillTree(treeName) {
    const tree = SKILL_TREES[treeName];
    if (!tree) return;
    
    const playerLevel = characterData?.level || 1;
    
    // Check if tree is locked (admins bypass this)
    if (!isAdmin && playerLevel < tree.unlockLevel) {
      addConsoleMessage('system', `${tree.name} unlocks at level ${tree.unlockLevel}`);
      return;
    }
    
    // Hide trees view, show detail view
    const treesView = document.getElementById('skill-trees-view');
    const detailView = document.getElementById('skill-tree-detail');
    if (treesView) treesView.classList.add('hidden');
    if (detailView) detailView.classList.remove('hidden');
    
    // Set title
    const titleEl = document.getElementById('tree-detail-title');
    if (titleEl) titleEl.textContent = `${tree.icon} ${tree.name}`;
    
    // Populate active skills (first 3)
    const activeRow = document.getElementById('active-skills-row');
    if (activeRow) {
      activeRow.innerHTML = '';
      tree.skills.slice(0, 3).forEach(skill => {
        activeRow.appendChild(createSkillBox(skill));
      });
    }
    
    // Populate passive skills row 1 (skills 4-6)
    const passiveRow1 = document.getElementById('passive-skills-row-1');
    if (passiveRow1) {
      passiveRow1.innerHTML = '';
      tree.skills.slice(3, 6).forEach(skill => {
        passiveRow1.appendChild(createSkillBox(skill));
      });
    }
    
    // Populate passive skills row 2 (skills 7-9)
    const passiveRow2 = document.getElementById('passive-skills-row-2');
    if (passiveRow2) {
      passiveRow2.innerHTML = '';
      tree.skills.slice(6, 9).forEach(skill => {
        passiveRow2.appendChild(createSkillBox(skill));
      });
    }
  }
  
  /**
   * Create a skill box element
   */
  function createSkillBox(skill) {
    const box = document.createElement('div');
    box.className = `skill-box ${skill.type}-skill`;
    box.dataset.skillId = skill.id;
    
    // Handle both string and number keys for skill levels
    const level = playerSkills[skill.id] || playerSkills[String(skill.id)] || 0;
    if (level > 0) box.classList.add('learned');
    
    // Check if this active skill is equipped (handle both string and number in array)
    const isEquipped = skill.type === 'active' && 
      (equippedSkills.includes(skill.id) || equippedSkills.includes(String(skill.id)));
    if (isEquipped) box.classList.add('equipped');
    
    // Icon
    const icon = document.createElement('span');
    icon.className = 'skill-icon';
    icon.textContent = skill.icon;
    box.appendChild(icon);
    
    // Name
    const name = document.createElement('span');
    name.className = 'skill-name';
    name.textContent = skill.name;
    box.appendChild(name);
    
    // Level dots (5 dots)
    const dots = document.createElement('div');
    dots.className = 'skill-level-dots';
    for (let i = 0; i < 5; i++) {
      const dot = document.createElement('span');
      dot.className = `level-dot${i < level ? ' filled' : ''}`;
      dots.appendChild(dot);
    }
    box.appendChild(dots);
    
    // Action buttons container - only for active skills
    if (skill.type === 'active' && level > 0) {
      const actions = document.createElement('div');
      actions.className = 'skill-actions';
      
      // Equip/Unequip button (+/−)
      const equipBtn = document.createElement('button');
      equipBtn.className = `skill-btn equip-btn ${isEquipped ? 'unequip' : ''}`;
      equipBtn.textContent = isEquipped ? '−' : '+';
      equipBtn.title = isEquipped ? 'Remove from Skill Bar' : 'Add to Skill Bar';
      equipBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (isEquipped) {
          handleSkillUnequip(skill);
        } else {
          handleSkillEquip(skill);
        }
      });
      actions.appendChild(equipBtn);
      box.appendChild(actions);
    }
    
    // Tooltip events
    box.addEventListener('mouseenter', (e) => {
      if (tooltipTimeout) clearTimeout(tooltipTimeout);
      const target = box;
      tooltipTimeout = setTimeout(() => {
        showSkillTooltipBox(skill, level, target);
      }, TOOLTIP_DELAY);
    });
    
    box.addEventListener('mouseleave', () => {
      if (tooltipTimeout) clearTimeout(tooltipTimeout);
      hideTooltip();
    });
    
    box.addEventListener('mousemove', (e) => {
      if (tooltipElement && tooltipElement.classList.contains('visible')) {
        positionTooltip(e.clientX, e.clientY);
      }
    });
    
    // Click on the box itself levels up the skill (if not at max)
    box.addEventListener('click', () => {
      if (level < 5) {
        handleSkillLevelUp(skill);
      }
    });
    
    return box;
  }
  
  /**
   * Calculate a skill's scaled value at a given level
   */
  function calculateSkillValue(scaling, level) {
    if (!scaling || level <= 0) {
      return scaling ? scaling.base : 0;
    }
    return scaling.base + (scaling.perLevel * (level - 1));
  }
  
  /**
   * Format skill description with colored values
   * Replaces {value1}, {value2}, etc. with actual calculated values
   */
  function formatSkillDescription(skill, level) {
    let description = skill.description || '';
    
    if (skill.scaling) {
      // Replace each {valueN} placeholder with the calculated value
      for (const [key, scaling] of Object.entries(skill.scaling)) {
        const value = calculateSkillValue(scaling, Math.max(1, level));
        // Format the number nicely (remove trailing zeros for decimals)
        const formattedValue = Number.isInteger(value) ? value : parseFloat(value.toFixed(2));
        // Replace with a span that has a special class for coloring
        description = description.replace(
          `{${key}}`,
          `<span class="skill-value">${formattedValue}</span>`
        );
      }
    }
    
    return description;
  }
  
  /**
   * Show skill tooltip using the universal tooltip system
   */
  function showSkillTooltipBox(skill, level, targetElement) {
    if (!tooltipElement || !targetElement) return;
    
    const currentLevel = level || playerSkills[skill.id] || playerSkills[String(skill.id)] || 0;
    
    // Build tooltip content
    const iconEl = tooltipElement.querySelector('.tooltip-icon');
    const titleEl = tooltipElement.querySelector('.tooltip-title');
    const subtitleEl = tooltipElement.querySelector('.tooltip-subtitle');
    const bodyEl = tooltipElement.querySelector('.tooltip-body');
    const statsEl = tooltipElement.querySelector('.tooltip-stats');
    const footerEl = tooltipElement.querySelector('.tooltip-footer');
    
    if (iconEl) iconEl.textContent = skill.icon || '';
    if (titleEl) titleEl.textContent = skill.name;
    if (subtitleEl) {
      subtitleEl.textContent = `${skill.type === 'active' ? 'Active' : 'Passive'} Skill • Level ${currentLevel}/5`;
      subtitleEl.style.display = 'block';
    }
    
    // Format description with colored values
    if (bodyEl) {
      bodyEl.innerHTML = formatSkillDescription(skill, currentLevel);
      bodyEl.style.display = 'block';
    }
    
    // Build stats section for active skills
    if (statsEl) {
      if (skill.type === 'active') {
        let statsHtml = '';
        if (skill.staminaCost) {
          statsHtml += `<div class="tooltip-stat-row">
            <span class="tooltip-stat-name">Stamina Cost</span>
            <span class="tooltip-stat-value">${skill.staminaCost}</span>
          </div>`;
        }
        if (skill.cooldown) {
          statsHtml += `<div class="tooltip-stat-row">
            <span class="tooltip-stat-name">Cooldown</span>
            <span class="tooltip-stat-value">${(skill.cooldown / 1000).toFixed(1)}s</span>
          </div>`;
        }
        if (skill.initialCooldown) {
          statsHtml += `<div class="tooltip-stat-row">
            <span class="tooltip-stat-name">Initial Delay</span>
            <span class="tooltip-stat-value">${(skill.initialCooldown / 1000).toFixed(1)}s</span>
          </div>`;
        }
        statsEl.innerHTML = statsHtml;
        statsEl.style.display = statsHtml ? 'block' : 'none';
      } else {
        statsEl.style.display = 'none';
      }
    }
    
    // Footer with next level preview
    if (footerEl) {
      if (currentLevel > 0 && currentLevel < 5) {
        const nextLevelDesc = formatSkillDescription(skill, currentLevel + 1);
        footerEl.innerHTML = `<span class="tooltip-next-level">Next: ${nextLevelDesc}</span>`;
        footerEl.style.display = 'block';
      } else {
        footerEl.style.display = 'none';
      }
    }
    
    // Set tooltip type class
    tooltipElement.className = 'game-tooltip tooltip-skill';
    
    // Position and show
    const rect = targetElement.getBoundingClientRect();
    positionTooltip(rect.right + 10, rect.top);
    tooltipElement.classList.add('visible');
  }
  
  /**
   * Show skill tooltip/info (legacy - kept for compatibility)
   */
  function showSkillTooltip(skill, level) {
    const currentLevel = level || playerSkills[skill.id] || playerSkills[String(skill.id)] || 0;
    let info = `${skill.icon} ${skill.name}`;
    info += `\nLevel: ${currentLevel}/5`;
    info += `\nType: ${skill.type === 'active' ? 'Active' : 'Passive'}`;
    
    if (skill.type === 'active') {
      info += `\nStamina: ${skill.stamina || '?'}`;
      info += `\nCooldown: ${skill.cooldown || '?'}`;
    }
    
    addConsoleMessage('info', info);
  }
  
  /**
   * Handle skill level up click
   */
  function handleSkillLevelUp(skill) {
    const currentLevel = playerSkills[skill.id] || playerSkills[String(skill.id)] || 0;
    const skillPoints = characterData?.skillPoints || 0;
    
    if (currentLevel >= 5) {
      addConsoleMessage('system', `${skill.name} is already at max level`);
      return;
    }
    
    if (skillPoints <= 0) {
      addConsoleMessage('system', 'No skill points available');
      return;
    }
    
    // Send to server
    if (typeof Connection !== 'undefined') {
      Connection.send({
        type: CONSTANTS.MSG_TYPES.SKILL_LEARN,
        skillId: skill.id
      });
      addConsoleMessage('system', `Learning ${skill.name}...`);
    }
  }
  
  /**
   * Handle equipping an active skill to the skill bar
   */
  function handleSkillEquip(skill) {
    // Find first empty slot
    let emptySlot = equippedSkills.findIndex(s => s === null);
    
    if (emptySlot === -1) {
      addConsoleMessage('system', 'All skill slots are full! Remove a skill first.');
      return;
    }
    
    // Send to server
    if (typeof Connection !== 'undefined') {
      Connection.send({
        type: CONSTANTS.MSG_TYPES.SKILL_EQUIP,
        skillId: skill.id,
        slot: emptySlot
      });
      addConsoleMessage('system', `Equipping ${skill.name} to slot ${emptySlot + 1}...`);
    }
  }
  
  /**
   * Handle unequipping an active skill from the skill bar
   */
  function handleSkillUnequip(skill) {
    // Find slot index handling both number and string skill IDs
    let slotIndex = equippedSkills.indexOf(skill.id);
    if (slotIndex === -1) {
      slotIndex = equippedSkills.indexOf(String(skill.id));
    }
    if (slotIndex === -1) return;
    
    // Send to server
    if (typeof Connection !== 'undefined') {
      Connection.send({
        type: CONSTANTS.MSG_TYPES.SKILL_EQUIP,
        skillId: null,
        slot: slotIndex
      });
      addConsoleMessage('system', `Removing ${skill.name} from skill bar...`);
    }
  }
  
  /**
   * Update player skills data (called when server sends skill updates)
   */
  function updatePlayerSkills(skillsData) {
    if (skillsData.learned) {
      playerSkills = skillsData.learned;
    }
    if (skillsData.equipped) {
      equippedSkills = skillsData.equipped;
    }
    
    // Refresh the skill tree view if it's open
    const detailView = document.getElementById('skill-tree-detail');
    if (detailView && !detailView.classList.contains('hidden')) {
      // Re-render the current tree
      const titleEl = document.getElementById('tree-detail-title');
      if (titleEl) {
        const treeName = Object.keys(SKILL_TREES).find(key => {
          const tree = SKILL_TREES[key];
          return titleEl.textContent.includes(tree.name);
        });
        if (treeName) openSkillTree(treeName);
      }
    }
    
    // Update skill slots display
    updateSkillSlots();
  }
  
  /**
   * Set available skill points and update display
   */
  function setSkillPoints(points) {
    if (characterData) {
      characterData.skillPoints = points;
    }
    const spEl = document.getElementById('skill-points-available');
    if (spEl) {
      spEl.textContent = points;
    }
    // Update the notification badge
    updateNotificationBadges();
  }
  
  /**
   * Close skill tree detail view
   */
  function closeSkillTree() {
    const treesView = document.getElementById('skill-trees-view');
    const detailView = document.getElementById('skill-tree-detail');
    if (treesView) treesView.classList.remove('hidden');
    if (detailView) detailView.classList.add('hidden');
  }
  
  /**
   * Update skill trees based on player level (lock/unlock)
   * Admins see all trees unlocked
   */
  function updateSkillTrees() {
    const playerLevel = characterData?.level || 1;
    
    document.querySelectorAll('.skill-tree-item').forEach(item => {
      const unlockLevel = parseInt(item.dataset.unlock) || 0;
      // Admins bypass level restrictions
      if (isAdmin || playerLevel >= unlockLevel) {
        item.classList.remove('locked');
        item.classList.add('unlocked');
      } else {
        item.classList.add('locked');
        item.classList.remove('unlocked');
      }
    });
    
    // Update skill points display
    const spEl = document.getElementById('skill-points-available');
    if (spEl) {
      spEl.textContent = characterData?.skillPoints || 0;
    }
  }
  
  /**
   * Update equipped skill slots display
   */
  function updateSkillSlots() {
    for (let i = 0; i < 5; i++) {
      const slot = document.getElementById(`skill-slot-${i + 1}`);
      if (!slot) continue;
      const skillId = equippedSkills[i];
      if (skillId !== null && skillId !== undefined) {
        // Find skill data - handle both number and string skill IDs
        let skillData = null;
        const numericId = parseInt(skillId);
        for (const tree of Object.values(SKILL_TREES)) {
          skillData = tree.skills.find(s => s.id === numericId || s.id === skillId);
          if (skillData) break;
        }
        
        if (skillData) {
          slot.classList.add('has-skill');
          slot.innerHTML = `<span class="skill-icon-img">${skillData.icon}</span>`;
          slot.title = skillData.name;
        }
      } else {
        slot.classList.remove('has-skill');
        slot.innerHTML = `<span class="slot-number">${i + 1}</span>`;
        slot.title = `Skill Slot ${i + 1}`;
      }
    }
  }

  // ==========================================
  // MARKET SYSTEM
  // ==========================================
  
  let marketOpen = false;
  let marketListings = [];
  let marketMyListings = [];
  let marketMaxListings = 3;
  let marketCurrentTab = 'browse'; // 'browse' or 'sell'
  
  /**
   * Open the market panel with data from server
   */
  function openMarket(data) {
    if (data.listings) marketListings = data.listings;
    if (data.myListings !== undefined) marketMyListings = data.myListings;
    if (data.maxListings) marketMaxListings = data.maxListings;
    
    const panel = document.getElementById('market-panel');
    if (!panel) return;
    
    // If market is already open, just refresh the current tab
    if (marketOpen) {
      if (marketCurrentTab === 'browse') {
        renderMarketBrowse();
      } else {
        renderMarketSell();
      }
      return;
    }
    
    marketOpen = true;
    panel.classList.remove('hidden');
    
    // Update gold display
    const goldEl = document.getElementById('market-gold-amount');
    if (goldEl) goldEl.textContent = characterData?.gold || 0;
    
    // Default to browse tab
    switchMarketTab('browse');
  }
  
  /**
   * Close the market panel
   */
  function closeMarket() {
    marketOpen = false;
    marketListings = [];
    marketMyListings = [];
    
    const panel = document.getElementById('market-panel');
    if (panel) panel.classList.add('hidden');
  }
  
  /**
   * Check if market is open
   */
  function isMarketOpen() {
    return marketOpen;
  }
  
  /**
   * Switch market tab
   */
  function switchMarketTab(tab) {
    marketCurrentTab = tab;
    
    document.querySelectorAll('.market-tab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    
    document.getElementById('market-browse-tab').classList.toggle('hidden', tab !== 'browse');
    document.getElementById('market-sell-tab').classList.toggle('hidden', tab !== 'sell');
    
    if (tab === 'browse') {
      renderMarketBrowse();
    } else {
      renderMarketSell();
    }
  }
  
  /**
   * Render the browse tab listings
   */
  function renderMarketBrowse() {
    const grid = document.getElementById('market-listings-grid');
    if (!grid) return;
    
    grid.innerHTML = '';
    
    if (marketListings.length === 0) {
      grid.innerHTML = '<div class="market-empty">No items listed on the market.</div>';
      return;
    }
    
    for (const listing of marketListings) {
      const item = listing.item;
      if (!item) continue;
      
      const canAfford = (characterData?.gold || 0) >= listing.price;
      const isOwn = listing.sellerName === characterData?.name;
      const rarityColor = CONSTANTS.RARITY[item.rarity?.toUpperCase()]?.color || '#a4a4a4';
      
      const el = document.createElement('div');
      el.className = 'market-listing-row' + (!canAfford ? ' cannot-afford' : '') + (isOwn ? ' own-listing' : '');
      
      el.innerHTML = `
        <div class="market-listing-icon">${getItemIconHtml(item)}</div>
        <div class="market-listing-info">
          <div class="market-listing-name" style="color:${rarityColor}">${item.name}</div>
          <div class="market-listing-seller">by ${listing.sellerName}</div>
        </div>
        <div class="market-listing-price">
          <span class="market-gold-icon">💰</span>${listing.price.toLocaleString()}
        </div>
        ${!isOwn ? '<button class="market-buy-btn" title="Buy">Buy</button>' : '<span class="market-own-tag">Yours</span>'}
      `;
      
      // Tooltip on icon
      const iconEl = el.querySelector('.market-listing-icon');
      if (iconEl) {
        iconEl.onmouseenter = () => showItemTooltip(item, 1, iconEl);
        iconEl.onmouseleave = hideTooltip;
      }
      
      // Buy button
      if (!isOwn) {
        const buyBtn = el.querySelector('.market-buy-btn');
        if (buyBtn) {
          buyBtn.onclick = (e) => {
            e.stopPropagation();
            marketBuyItem(listing.id);
          };
        }
      }
      
      grid.appendChild(el);
    }
  }
  
  /**
   * Render the sell tab (my listings + sell form)
   */
  function renderMarketSell() {
    const myListingsGrid = document.getElementById('market-my-listings');
    const sellForm = document.getElementById('market-sell-form');
    if (!myListingsGrid) return;
    
    // Render my active listings
    myListingsGrid.innerHTML = '';
    
    const headerEl = document.createElement('div');
    headerEl.className = 'market-sell-header';
    headerEl.innerHTML = `<span>Your Listings (${marketMyListings.length}/${marketMaxListings})</span>`;
    myListingsGrid.appendChild(headerEl);
    
    if (marketMyListings.length === 0) {
      const emptyEl = document.createElement('div');
      emptyEl.className = 'market-empty';
      emptyEl.textContent = 'You have no active listings.';
      myListingsGrid.appendChild(emptyEl);
    } else {
      for (const listing of marketMyListings) {
        const item = listing.item;
        if (!item) continue;
        
        const listedDate = new Date(listing.listedAt);
        const daysAgo = Math.floor((Date.now() - listedDate.getTime()) / (1000 * 60 * 60 * 24));
        const daysText = daysAgo === 0 ? 'Today' : daysAgo === 1 ? '1 day ago' : `${daysAgo} days ago`;
        const rarityColor = CONSTANTS.RARITY[item.rarity?.toUpperCase()]?.color || '#a4a4a4';
        
        const el = document.createElement('div');
        el.className = 'market-listing-row own-listing';
        el.innerHTML = `
          <div class="market-listing-icon">${getItemIconHtml(item)}</div>
          <div class="market-listing-info">
            <div class="market-listing-name" style="color:${rarityColor}">${item.name}</div>
            <div class="market-listing-seller">${daysText} · 💰${listing.price.toLocaleString()}</div>
          </div>
          <button class="market-cancel-btn" title="Cancel listing">✕</button>
        `;
        
        const iconEl = el.querySelector('.market-listing-icon');
        if (iconEl) {
          iconEl.onmouseenter = () => showItemTooltip(item, 1, iconEl);
          iconEl.onmouseleave = hideTooltip;
        }
        
        const cancelBtn = el.querySelector('.market-cancel-btn');
        if (cancelBtn) {
          cancelBtn.onclick = (e) => {
            e.stopPropagation();
            marketCancelListing(listing.id);
          };
        }
        
        myListingsGrid.appendChild(el);
      }
    }
    
    // Show/hide sell form based on listing count
    if (sellForm) {
      if (marketMyListings.length >= marketMaxListings) {
        sellForm.innerHTML = '<div class="market-empty">Maximum listings reached.</div>';
      } else {
        renderMarketSellForm();
      }
    }
  }
  
  /**
   * Render the sell form with drag-and-drop area for equipment
   */
  function renderMarketSellForm() {
    const sellForm = document.getElementById('market-sell-form');
    if (!sellForm) return;
    
    sellForm.innerHTML = `
      <div class="market-sell-section-title">Drag an equipment item here to list:</div>
      <div class="market-sell-dropzone" id="market-sell-dropzone">
        <div class="market-sell-dropzone-hint">🎒 Drag equipment from inventory</div>
      </div>
      <div class="market-sell-selected hidden" id="market-sell-selected">
        <div class="market-sell-selected-item" id="market-sell-selected-item"></div>
        <div class="market-sell-price-row">
          <label for="market-sell-price">Price:</label>
          <input type="number" id="market-sell-price" min="1" max="10000000" value="100" class="market-price-input">
          <span class="market-gold-label">gold</span>
        </div>
        <button class="market-confirm-sell-btn" id="market-confirm-sell-btn">List Item</button>
      </div>
    `;
    
    // Setup drag-and-drop zone on the dropzone AND its parent containers
    // The market panel needs dragover preventDefault at multiple levels for browser DnD to work
    const dropzone = document.getElementById('market-sell-dropzone');
    const marketPanel = document.getElementById('market-panel');
    
    // Allow dragover on the entire market panel so the browser doesn't block the drag
    if (marketPanel && !marketPanel._marketDragSetup) {
      marketPanel._marketDragSetup = true;
      marketPanel.addEventListener('dragover', (e) => {
        if (draggedItem && draggedFromType === 'inventory' && draggedItem.item && draggedItem.item.type === 'equipment') {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'none';
        }
      });
      marketPanel.addEventListener('drop', (e) => {
        e.preventDefault();
      });
    }
    
    if (dropzone) {
      dropzone.addEventListener('dragover', (e) => {
        if (draggedItem && draggedFromType === 'inventory' && draggedItem?.item && draggedItem.item.type === 'equipment') {
          e.preventDefault();
          e.stopPropagation();
          e.dataTransfer.dropEffect = 'move';
          dropzone.classList.add('drag-over');
        }
      });
      dropzone.addEventListener('dragleave', (e) => {
        dropzone.classList.remove('drag-over');
      });
      dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.remove('drag-over');
        if (draggedItem && draggedFromType === 'inventory' && draggedItem.item && draggedItem.item.type === 'equipment') {
          selectMarketSellItem(draggedItem);
        }
      });
    }
  }
  
  let selectedMarketSellItem = null;
  
  /**
   * Select an item to sell on the market
   */
  function selectMarketSellItem(invItem) {
    selectedMarketSellItem = invItem;
    
    const selectedEl = document.getElementById('market-sell-selected');
    const itemInfoEl = document.getElementById('market-sell-selected-item');
    if (!selectedEl || !itemInfoEl) return;
    
    const item = invItem.item;
    const rarityColor = CONSTANTS.RARITY[item.rarity?.toUpperCase()]?.color || '#a4a4a4';
    
    itemInfoEl.innerHTML = `
      ${getItemIconHtml(item)}
      <span style="color:${rarityColor};font-weight:bold">${item.name}</span>
    `;
    
    selectedEl.classList.remove('hidden');
    
    // Set default price based on sellPrice
    const priceInput = document.getElementById('market-sell-price');
    if (priceInput && item.sellPrice) {
      priceInput.value = Math.max(1, Math.floor(item.sellPrice * 2));
    }
    
    // Wire up confirm button
    const confirmBtn = document.getElementById('market-confirm-sell-btn');
    if (confirmBtn) {
      confirmBtn.onclick = () => marketListItem();
    }
    
    // Update dropzone to show the selected item
    const dropzone = document.getElementById('market-sell-dropzone');
    if (dropzone) {
      dropzone.innerHTML = `
        <div class="market-sell-dropzone-item">
          ${getItemIconHtml(item)}
          <span style="color:${rarityColor};font-weight:bold">${item.name}</span>
          <button class="market-sell-dropzone-clear" id="market-sell-dropzone-clear" title="Clear selection">✕</button>
        </div>
      `;
      dropzone.classList.add('has-item');
      const clearBtn = document.getElementById('market-sell-dropzone-clear');
      if (clearBtn) {
        clearBtn.onclick = (e) => {
          e.stopPropagation();
          clearMarketSellSelection();
        };
      }
    }
  }
  
  /**
   * Clear the market sell selection and reset the dropzone
   */
  function clearMarketSellSelection() {
    selectedMarketSellItem = null;
    const selectedEl = document.getElementById('market-sell-selected');
    if (selectedEl) selectedEl.classList.add('hidden');
    const dropzone = document.getElementById('market-sell-dropzone');
    if (dropzone) {
      dropzone.innerHTML = '<div class="market-sell-dropzone-hint">🎒 Drag equipment from inventory</div>';
      dropzone.classList.remove('has-item');
    }
  }
  
  /**
   * List the selected item on the market
   */
  function marketListItem() {
    if (!selectedMarketSellItem) return;
    
    const priceInput = document.getElementById('market-sell-price');
    const price = parseInt(priceInput?.value || '0');
    
    if (!price || price < 1) {
      addConsoleMessage('error', 'Please enter a valid price');
      return;
    }
    
    if (price > 10000000) {
      addConsoleMessage('error', 'Maximum price is 10,000,000 gold');
      return;
    }
    
    Connection.send({
      type: CONSTANTS.MSG_TYPES.MARKET_LIST_ITEM,
      itemId: selectedMarketSellItem.itemId,
      slotIndex: selectedMarketSellItem.slotIndex,
      price: price
    });
    
    selectedMarketSellItem = null;
  }
  
  /**
   * Buy an item from the market
   */
  function marketBuyItem(listingId) {
    Connection.send({
      type: CONSTANTS.MSG_TYPES.MARKET_BUY_ITEM,
      listingId: listingId
    });
  }
  
  /**
   * Cancel a market listing
   */
  function marketCancelListing(listingId) {
    Connection.send({
      type: CONSTANTS.MSG_TYPES.MARKET_CANCEL,
      listingId: listingId
    });
  }
  
  /**
   * Search market listings
   */
  function marketSearch() {
    const searchInput = document.getElementById('market-search-input');
    const searchTerm = searchInput?.value?.trim() || '';
    
    Connection.send({
      type: CONSTANTS.MSG_TYPES.MARKET_SEARCH,
      searchTerm: searchTerm
    });
  }

  // ==========================================
  // SHOP SYSTEM
  // ==========================================
  
  // Shop state
  let currentShop = null;         // Current shop data from zone
  let currentShopData = null;     // Full shop data from shops.json
  let shopItems = [];             // Items available in current shop
  let currentShopTab = 'buy';     // 'buy' or 'sell'
  let pendingTransaction = null;  // {type: 'buy'|'sell', item, itemId, price, maxQuantity}
  
  /**
   * Open shop UI
   * @param {object} shop - Shop data from zone (shopId, x, y, name, icon)
   */
  async function openShop(shop) {
    console.log('[GameUI] openShop called with:', JSON.stringify(shop));
    if (!shop || !shop.shopId) {
      console.error('[GameUI] Cannot open shop: invalid shop data', shop);
      return;
    }
    
    currentShop = shop;
    
    // Load shop data and all items (cached by server)
    try {
      const shopUrl = `/data/shops/${shop.shopId}.json`;
      console.log('[GameUI] Fetching shop data from:', shopUrl);
      const [shopResponse, itemsResponse] = await Promise.all([
        fetch(shopUrl),
        fetch('/api/items')
      ]);
      
      console.log('[GameUI] Shop response status:', shopResponse.status, 'Items response status:', itemsResponse.status);
      
      if (!shopResponse.ok) {
        addConsoleMessage('error', `Shop data not found: ${shop.shopId}`);
        console.error('[GameUI] Shop fetch failed:', shopResponse.status, shopResponse.statusText);
        return;
      }
      
      currentShopData = await shopResponse.json();
      
      // Cache all item definitions globally
      if (itemsResponse.ok) {
        window.itemDefinitions = await itemsResponse.json();
      }
    } catch (err) {
      console.error('[GameUI] Error loading shop data:', err);
      addConsoleMessage('error', 'Failed to load shop data');
      return;
    }
    
    // Update shop panel UI
    const shopPanel = document.getElementById('shop-panel');
    const shopIcon = shopPanel.querySelector('.shop-icon');
    const shopName = shopPanel.querySelector('.shop-name');
    const goldAmountEl = document.getElementById('shop-gold-amount');
    
    shopIcon.textContent = currentShopData.icon || '🏪';
    shopName.textContent = currentShopData.name || 'Shop';
    goldAmountEl.textContent = characterData?.gold || 0;
    
    // Render shop items
    renderShopItems();
    
    // Switch to buy tab by default
    switchShopTab('buy');
    
    // Show shop panel
    shopPanel.classList.remove('hidden');
    
    // Setup sell zone drag and drop
    setupShopSellZone();
    
    addConsoleMessage('system', `📦 Opened ${currentShopData.name}`);
  }
  
  /**
   * Close shop UI
   */
  function closeShop() {
    const shopPanel = document.getElementById('shop-panel');
    shopPanel.classList.add('hidden');
    
    currentShop = null;
    currentShopData = null;
    shopItems = [];
    
    closeShopConfirm();
  }
  
  /**
   * Check if shop is open
   */
  function isShopOpen() {
    return currentShop !== null;
  }
  
  /**
   * Get current shop
   */
  function getCurrentShop() {
    return currentShop;
  }
  
  /**
   * Switch shop tab (buy/sell)
   */
  function switchShopTab(tab) {
    currentShopTab = tab;
    
    // Update tab buttons
    document.querySelectorAll('.shop-tab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    
    // Update tab content
    document.getElementById('shop-buy-tab').classList.toggle('hidden', tab !== 'buy');
    document.getElementById('shop-sell-tab').classList.toggle('hidden', tab !== 'sell');
  }
  
  /**
   * Render shop items in the buy grid
   */
  function renderShopItems() {
    const grid = document.getElementById('shop-items-grid');
    if (!grid || !currentShopData) return;
    
    grid.innerHTML = '';
    
    currentShopData.inventory.forEach(shopItem => {
      // Get full item data
      const itemDef = getItemDefinition(shopItem.itemId);
      if (!itemDef) return;
      
      const canAfford = (characterData?.gold || 0) >= shopItem.price;
      
      const itemEl = document.createElement('div');
      itemEl.className = 'shop-item';
      if (!canAfford) itemEl.classList.add('cannot-afford');
      
      itemEl.innerHTML = `
        ${getItemIconHtml(itemDef)}
        <span class="item-price">💰${shopItem.price}</span>
      `;
      
      // Click to buy
      itemEl.onclick = () => openBuyConfirm(shopItem, itemDef);
      
      // Tooltip
      itemEl.onmouseenter = () => showItemTooltip(itemDef, 1, itemEl);
      itemEl.onmouseleave = hideTooltip;
      
      grid.appendChild(itemEl);
    });
  }
  
  /**
   * Get item definition by ID (client-side cache or fetch)
   */
  function getItemDefinition(itemId) {
    // Check if we have the item in inventory already
    const invItem = inventoryItems.find(i => i.itemId === itemId);
    if (invItem && invItem.item) return invItem.item;
    
    // Check equipped items
    for (const slot of Object.values(equippedItems)) {
      if (slot && slot.itemId === itemId && slot.item) return slot.item;
    }
    
    // Fallback: we need to load items on startup
    // For now, return null and load items on demand
    return window.itemDefinitions?.[itemId] || null;
  }
  
  /**
   * Setup sell zone drag and drop
   */
  function setupShopSellZone() {
    const sellZone = document.getElementById('shop-sell-zone');
    if (!sellZone) return;
    
    sellZone.ondragover = (e) => {
      e.preventDefault();
      if (draggedItem && draggedFromType === 'inventory') {
        sellZone.classList.add('drag-over');
      }
    };
    
    sellZone.ondragleave = () => {
      sellZone.classList.remove('drag-over');
    };
    
    sellZone.ondrop = (e) => {
      e.preventDefault();
      sellZone.classList.remove('drag-over');
      
      if (draggedItem && draggedFromType === 'inventory') {
        // If Ctrl or Shift is held, sell the entire stack instantly
        if (e.ctrlKey || e.shiftKey) {
          sellItemInstantly(draggedItem, draggedItem.quantity);
        } else if (draggedItem.quantity === 1) {
          // If quantity is 1, sell immediately without confirm dialog
          sellItemInstantly(draggedItem);
        } else {
          openSellConfirm(draggedItem);
        }
      }
    };
  }
  
  /**
   * Sell an item instantly (for single quantity items or Ctrl/Shift quick-sell)
   */
  function sellItemInstantly(invItem, quantity) {
    if (!invItem || !invItem.item || !currentShopData) return;
    
    const qty = quantity || 1;
    
    // Send sell request to server (server will confirm and update)
    if (typeof Connection !== 'undefined') {
      Connection.send({
        type: 'shop_sell',
        shopId: currentShop.shopId,
        itemId: invItem.itemId,
        slotIndex: invItem.slotIndex,
        quantity: qty
      });
    }
  }
  
  /**
   * Open buy confirmation dialog
   */
  function openBuyConfirm(shopItem, itemDef) {
    const dialog = document.getElementById('shop-confirm-dialog');
    const title = dialog.querySelector('.shop-confirm-title');
    const iconEl = document.getElementById('confirm-item-icon');
    const nameEl = document.getElementById('confirm-item-name');
    const priceEl = document.getElementById('confirm-item-price');
    const quantityEl = document.getElementById('confirm-quantity');
    const actionBtn = document.getElementById('confirm-action-btn');
    
    title.textContent = 'Confirm Purchase';
    iconEl.innerHTML = getItemIconHtml(itemDef);
    nameEl.textContent = itemDef.name;
    nameEl.style.color = CONSTANTS.RARITY[itemDef.rarity?.toUpperCase()]?.color || '#fff';
    priceEl.textContent = `💰 ${shopItem.price} gold each`;
    
    // Set max quantity based on affordability (all items have unlimited stock)
    const maxByGold = Math.floor((characterData?.gold || 0) / shopItem.price);
    const maxQuantity = Math.min(maxByGold, 99);
    
    quantityEl.value = 1;
    quantityEl.max = maxQuantity;
    
    actionBtn.textContent = 'Buy';
    actionBtn.className = 'shop-confirm-btn buy-btn';
    
    pendingTransaction = {
      type: 'buy',
      item: itemDef,
      itemId: shopItem.itemId,
      price: shopItem.price,
      maxQuantity: maxQuantity
    };
    
    updateShopConfirmTotal();
    dialog.classList.remove('hidden');
  }
  
  // Shop sell multiplier (players sell at 80% of item's sellPrice)
  const SHOP_SELL_MULTIPLIER = 0.8;
  
  /**
   * Open sell confirmation dialog
   */
  function openSellConfirm(invItem) {
    if (!invItem || !invItem.item) return;
    
    const item = invItem.item;
    const sellPrice = Math.floor((item.sellPrice || 1) * SHOP_SELL_MULTIPLIER);
    
    const dialog = document.getElementById('shop-confirm-dialog');
    const title = dialog.querySelector('.shop-confirm-title');
    const iconEl = document.getElementById('confirm-item-icon');
    const nameEl = document.getElementById('confirm-item-name');
    const priceEl = document.getElementById('confirm-item-price');
    const quantityEl = document.getElementById('confirm-quantity');
    const actionBtn = document.getElementById('confirm-action-btn');
    
    title.textContent = 'Confirm Sale';
    iconEl.innerHTML = getItemIconHtml(item);
    nameEl.textContent = item.name;
    nameEl.style.color = CONSTANTS.RARITY[item.rarity?.toUpperCase()]?.color || '#fff';
    priceEl.textContent = `💰 ${sellPrice} gold each`;
    
    quantityEl.value = 1;
    quantityEl.max = invItem.quantity;
    
    actionBtn.textContent = 'Sell';
    actionBtn.className = 'shop-confirm-btn sell-btn';
    
    pendingTransaction = {
      type: 'sell',
      item: item,
      itemId: invItem.itemId,
      slotIndex: invItem.slotIndex,
      price: sellPrice,
      maxQuantity: invItem.quantity
    };
    
    updateShopConfirmTotal();
    dialog.classList.remove('hidden');
  }
  
  /**
   * Close shop confirm dialog
   */
  function closeShopConfirm() {
    const dialog = document.getElementById('shop-confirm-dialog');
    dialog.classList.add('hidden');
    pendingTransaction = null;
  }
  
  /**
   * Update total in confirm dialog
   */
  function updateShopConfirmTotal() {
    if (!pendingTransaction) return;
    
    const quantityEl = document.getElementById('confirm-quantity');
    const totalEl = document.getElementById('confirm-total-amount');
    const actionBtn = document.getElementById('confirm-action-btn');
    
    let quantity = parseInt(quantityEl.value) || 1;
    quantity = Math.max(1, Math.min(quantity, pendingTransaction.maxQuantity));
    quantityEl.value = quantity;
    
    const total = quantity * pendingTransaction.price;
    totalEl.textContent = `💰 ${total}`;
    
    // Disable buy button if can't afford, enable sell button always
    if (pendingTransaction.type === 'buy') {
      const canAfford = (characterData?.gold || 0) >= total;
      actionBtn.disabled = !canAfford;
    } else {
      // Sell button should always be enabled
      actionBtn.disabled = false;
    }
  }
  
  /**
   * Confirm the pending shop transaction
   */
  function confirmShopTransaction() {
    if (!pendingTransaction) return;
    
    const quantity = parseInt(document.getElementById('confirm-quantity').value) || 1;
    
    if (pendingTransaction.type === 'buy') {
      // Send buy request to server
      if (typeof Connection !== 'undefined') {
        Connection.send({
          type: 'shop_buy',
          shopId: currentShop.shopId,
          itemId: pendingTransaction.itemId,
          quantity: quantity
        });
      }
    } else if (pendingTransaction.type === 'sell') {
      // Send sell request to server
      if (typeof Connection !== 'undefined') {
        Connection.send({
          type: 'shop_sell',
          shopId: currentShop.shopId,
          itemId: pendingTransaction.itemId,
          slotIndex: pendingTransaction.slotIndex,
          quantity: quantity
        });
      }
    }
    
    closeShopConfirm();
  }
  
  /**
   * Update shop gold display
   */
  function updateShopGold() {
    const goldEl = document.getElementById('shop-gold-amount');
    if (goldEl && characterData) {
      goldEl.textContent = characterData.gold || 0;
    }
    
    // Re-render shop items to update affordability
    if (currentShopData) {
      renderShopItems();
    }
  }

  // ==========================================
  // PLAYER INFO CARD
  // ==========================================
  
  // Currently selected player for the info card
  let selectedPlayerData = null;
  let selectedPlayerId = null;
  
  // Default equipment slot icons
  const EQUIPMENT_SLOT_ICONS = {
    headgear: '🪖',
    chest: '🎽',
    weapon1: '⚔️',
    pants: '👖',
    boots: '👢',
    amulet: '📿',
    backpack: '🎒',
    weapon2: '🛡️',
    ring1: '💍',
    ring2: '💍'
  };
  
  // Equipment slot order for display
  const EQUIPMENT_SLOT_ORDER = [
    'headgear', 'chest', 'weapon1', 'pants', 'boots',
    'amulet', 'backpack', 'weapon2', 'ring1', 'ring2'
  ];
  
  /**
   * Show player info card for another player
   * @param {Object} playerData - Player data from server
   * @param {string} playerId - The player's ID (truncated)
   */
  function showPlayerCard(playerData, playerId) {
    const card = document.getElementById('player-info-card');
    if (!card) return;
    
    // Store selected player data
    selectedPlayerData = playerData;
    selectedPlayerId = playerId;
    
    // Update name and level
    const nameEl = document.getElementById('player-card-name');
    const levelEl = document.getElementById('player-card-level');
    if (nameEl) nameEl.textContent = playerData.name || 'Unknown';
    if (levelEl) levelEl.textContent = `Level ${playerData.level || 1}`;
    
    // Render equipment
    renderPlayerCardEquipment(playerData.equipment || {});
    
    // Render skills
    renderPlayerCardSkills(playerData.equippedSkills || []);
    
    // Show the card
    card.classList.remove('hidden');
  }
  
  /**
   * Close player info card
   */
  function closePlayerCard() {
    const card = document.getElementById('player-info-card');
    if (card) {
      card.classList.add('hidden');
    }
    selectedPlayerData = null;
    selectedPlayerId = null;
  }
  
  // ==========================================
  // ZONE DANGER SYSTEM
  // ==========================================
  
  // Zone danger state
  let isInDangerousZone = false;
  let zoneDangerWarningShown = false;
  
  /**
   * Handle zone danger notification from server
   * @param {Object} message - Zone danger message
   */
  function handleZoneDanger(message) {
    isInDangerousZone = message.inDanger;
    
    if (message.inDanger) {
      // Show danger warning
      showZoneDangerWarning(message);
      zoneDangerWarningShown = true;
      
      // Add visual indicator to game container
      const gameContainer = document.getElementById('game-container');
      if (gameContainer) {
        gameContainer.classList.add('zone-danger');
      }
      
      // Log warning to console
      addConsoleMessage('error', `⚠️ DANGER: ${message.message}`);
      addConsoleMessage('error', `You will take ${message.damage} damage every 2 seconds!`);
    } else {
      // Remove danger warning
      hideZoneDangerWarning();
      zoneDangerWarningShown = false;
      
      // Remove visual indicator
      const gameContainer = document.getElementById('game-container');
      if (gameContainer) {
        gameContainer.classList.remove('zone-danger');
      }
      
      // Only log safe message if we were previously in danger
      if (zoneDangerWarningShown) {
        addConsoleMessage('system', '✅ You have entered a safe area.');
      }
    }
  }
  
  /**
   * Handle zone damage notification from server
   * @param {Object} message - Zone damage message
   */
  function handleZoneDamage(message) {
    // Update player HP display
    if (characterData) {
      characterData.hp = message.currentHp;
      characterData.maxHp = message.maxHp;
      updateStatusBars();
    }
    
    // Show damage notification
    addConsoleMessage('error', `💀 ${message.message}`);
    
    // Flash the screen red
    flashDamageScreen();
    
    // Update danger warning HP
    updateZoneDangerHP(message.currentHp, message.maxHp);
  }
  
  /**
   * Show zone danger warning overlay
   * @param {Object} message - Danger info
   */
  function showZoneDangerWarning(message) {
    // Create warning element if it doesn't exist
    let warning = document.getElementById('zone-danger-warning');
    if (!warning) {
      warning = document.createElement('div');
      warning.id = 'zone-danger-warning';
      warning.className = 'zone-danger-warning';
      warning.innerHTML = `
        <div class="danger-icon">⚠️</div>
        <div class="danger-title">DANGEROUS ZONE</div>
        <div class="danger-info">
          <div>Mob Level: <span id="danger-mob-level">${message.mobLevel || '?'}</span></div>
          <div>Your Level: <span id="danger-player-level">${message.playerLevel || '?'}</span></div>
          <div class="danger-damage">Damage: <span id="danger-damage">${message.damage || '?'}</span>/2s</div>
        </div>
        <div class="danger-hp">HP: <span id="danger-current-hp">${characterData?.hp || '?'}</span>/<span id="danger-max-hp">${characterData?.maxHp || '?'}</span></div>
        <div class="danger-advice">Leave immediately!</div>
      `;
      document.getElementById('game-container')?.appendChild(warning);
    } else {
      // Update existing warning
      const mobLevelEl = document.getElementById('danger-mob-level');
      const playerLevelEl = document.getElementById('danger-player-level');
      const damageEl = document.getElementById('danger-damage');
      
      if (mobLevelEl) mobLevelEl.textContent = message.mobLevel || '?';
      if (playerLevelEl) playerLevelEl.textContent = message.playerLevel || '?';
      if (damageEl) damageEl.textContent = message.damage || '?';
      
      updateZoneDangerHP(characterData?.hp, characterData?.maxHp);
    }
    
    warning.classList.remove('hidden');
  }
  
  /**
   * Hide zone danger warning overlay
   */
  function hideZoneDangerWarning() {
    const warning = document.getElementById('zone-danger-warning');
    if (warning) {
      warning.classList.add('hidden');
    }
  }
  
  /**
   * Update HP display in danger warning
   */
  function updateZoneDangerHP(currentHp, maxHp) {
    const currentHpEl = document.getElementById('danger-current-hp');
    const maxHpEl = document.getElementById('danger-max-hp');
    
    if (currentHpEl) currentHpEl.textContent = currentHp || '?';
    if (maxHpEl) maxHpEl.textContent = maxHp || '?';
  }
  
  /**
   * Flash the screen red to indicate damage
   */
  function flashDamageScreen() {
    const gameContainer = document.getElementById('game-container');
    if (!gameContainer) return;
    
    gameContainer.classList.add('damage-flash');
    setTimeout(() => {
      gameContainer.classList.remove('damage-flash');
    }, 200);
  }
  
  // ==========================================
  // DEATH OVERLAY & RESPAWN
  // ==========================================
  
  /**
   * Show death overlay (called when player dies)
   * @param {Object} deathData - Death data from server
   */
  function showDeathOverlay(deathData) {
    isDead = true;
    pendingDeathData = deathData;
    
    // Lock all actions
    setActionsLocked(true);
    
    // Add dead state to game container (for greyscale effect)
    const gameContainer = document.getElementById('game-container');
    if (gameContainer) {
      gameContainer.classList.add('dead-state');
    }
    
    // Update death message based on cause
    const deathMessage = document.querySelector('.death-message');
    if (deathMessage) {
      if (deathData.killedBy === 'pvp') {
        deathMessage.textContent = `You were slain by ${deathData.killerName || 'an opponent'}...`;
      } else if (deathData.killedBy === 'zone_danger') {
        deathMessage.textContent = deathData.message || 'You were overwhelmed by the dangerous environment...';
      } else if (deathData.killedBy === 'boss') {
        deathMessage.textContent = `You were crushed by ${deathData.killerName || 'the boss'}...`;
      } else {
        deathMessage.textContent = `You were defeated by ${deathData.mobName || deathData.killerName || 'a creature'}...`;
      }
    }
    
    // Hide zone danger warning on death
    hideZoneDangerWarning();
    
    // Show death overlay
    const overlay = document.getElementById('death-overlay');
    if (overlay) {
      overlay.classList.remove('hidden');
    }
    
    console.log('[GameUI] Death overlay shown');
  }
  
  /**
   * Hide death overlay
   */
  function hideDeathOverlay() {
    isDead = false;
    pendingDeathData = null;
    
    // Remove dead state from game container
    const gameContainer = document.getElementById('game-container');
    if (gameContainer) {
      gameContainer.classList.remove('dead-state');
    }
    
    // Hide death overlay
    const overlay = document.getElementById('death-overlay');
    if (overlay) {
      overlay.classList.add('hidden');
    }
    
    // Unlock actions
    setActionsLocked(false);
    
    console.log('[GameUI] Death overlay hidden');
  }
  
  /**
   * Handle respawn button click
   * Refreshes the page to respawn player at their spawn point
   */
  function respawn() {
    console.log('[GameUI] Respawning...');
    // Simply refresh the page - server has already updated position
    window.location.reload();
  }
  
  // ==========================================
  // SPAWN BEACON
  // ==========================================
  
  /**
   * Show spawn beacon popup
   * @param {Object} beaconData - Beacon data (zone, position, name)
   */
  function showBeaconPopup(beaconData) {
    pendingBeaconData = beaconData;
    
    // Show popup
    const popup = document.getElementById('spawn-beacon-popup');
    if (popup) {
      popup.classList.remove('hidden');
    }
    
    console.log('[GameUI] Beacon popup shown for', beaconData.zoneName);
  }
  
  /**
   * Close spawn beacon popup
   */
  function closeBeaconPopup() {
    const popup = document.getElementById('spawn-beacon-popup');
    if (popup) {
      popup.classList.add('hidden');
    }
    pendingBeaconData = null;
  }
  
  /**
   * Confirm setting spawn point at beacon
   */
  function confirmSetSpawn() {
    if (!pendingBeaconData) {
      closeBeaconPopup();
      return;
    }
    
    // Send request to server
    if (typeof Connection !== 'undefined') {
      Connection.send({
        type: CONSTANTS.MSG_TYPES.SET_SPAWN,
        zoneId: pendingBeaconData.zoneId,
        x: pendingBeaconData.x,
        y: pendingBeaconData.y
      });
    }
    
    closeBeaconPopup();
  }
  
  /**
   * Handle spawn point set response from server
   * @param {Object} response - Server response
   */
  function handleSetSpawnResponse(response) {
    if (response.success) {
      addConsoleMessage('system', `🔥 ${response.message}`);
    } else {
      addConsoleMessage('error', response.message || 'Failed to set spawn point');
    }
  }
  
  // ==========================================
  // CASTLE WARS
  // ==========================================
  
  // Castle state
  let currentCastleId = null;
  let currentCastleData = null;
  
  /**
   * Show castle info card
   * @param {Object} castleInfo - Castle info from server
   */
  function showCastleCard(castleInfo) {
    const card = document.getElementById('castle-info-card');
    if (!card) return;
    
    currentCastleId = castleInfo.castleId;
    currentCastleData = castleInfo;
    
    const noOwnerSection = document.getElementById('castle-no-owner');
    const ownerInfoSection = document.getElementById('castle-owner-info');
    const yoursNotice = document.getElementById('castle-yours-notice');
    const attackSection = document.getElementById('castle-attack-section');
    
    if (!castleInfo.hasOwner) {
      // No owner - show claim button with guardian info
      if (noOwnerSection) noOwnerSection.classList.remove('hidden');
      if (ownerInfoSection) ownerInfoSection.classList.add('hidden');
      
      // Update guardian info if available
      const guardianInfoEl = document.getElementById('castle-guardian-info');
      if (castleInfo.guardian && guardianInfoEl) {
        guardianInfoEl.classList.remove('hidden');
        const spriteEl = document.getElementById('castle-guardian-sprite');
        const nameEl = document.getElementById('castle-guardian-name');
        const levelEl = document.getElementById('castle-guardian-level');
        
        if (spriteEl) spriteEl.textContent = castleInfo.guardian.sprite || '👹';
        if (nameEl) nameEl.textContent = castleInfo.guardian.name || 'Guardian';
        if (levelEl) levelEl.textContent = `Level ${castleInfo.guardian.level || 1}`;
      } else if (guardianInfoEl) {
        guardianInfoEl.classList.add('hidden');
      }
    } else {
      // Has owner - show owner info
      if (noOwnerSection) noOwnerSection.classList.add('hidden');
      if (ownerInfoSection) ownerInfoSection.classList.remove('hidden');
      
      // Update owner details
      const nameEl = document.getElementById('castle-owner-name');
      const levelEl = document.getElementById('castle-owner-level');
      const durationEl = document.getElementById('castle-duration');
      const goldEl = document.getElementById('castle-gold-earned');
      
      if (nameEl) nameEl.textContent = castleInfo.owner?.name || 'Unknown';
      if (levelEl) levelEl.textContent = `Level ${castleInfo.owner?.level || 1}`;
      
      // Format duration
      if (durationEl && castleInfo.ownershipDuration) {
        const hours = castleInfo.ownershipDuration.hours || 0;
        const minutes = castleInfo.ownershipDuration.minutes || 0;
        durationEl.textContent = `${hours}h ${minutes}m`;
      }
      
      // Show gold earned if player owns it
      if (castleInfo.isOwner) {
        if (yoursNotice) yoursNotice.classList.remove('hidden');
        if (attackSection) attackSection.classList.add('hidden');
        if (goldEl) goldEl.textContent = castleInfo.totalGoldEarned || 0;
      } else {
        if (yoursNotice) yoursNotice.classList.add('hidden');
        if (attackSection) attackSection.classList.remove('hidden');
      }
      
      // Render equipment
      renderCastleCardEquipment(castleInfo.owner?.equipment || {});
      
      // Render skills
      renderCastleCardSkills(castleInfo.owner?.equippedSkills || []);
    }
    
    card.classList.remove('hidden');
    console.log('[GameUI] Castle card shown for', castleInfo.castleId);
  }
  
  /**
   * Close castle info card
   */
  function closeCastleCard() {
    const card = document.getElementById('castle-info-card');
    if (card) {
      card.classList.add('hidden');
    }
    currentCastleId = null;
    currentCastleData = null;
  }
  
  /**
   * Check if castle card is open
   */
  function isCastleCardOpen() {
    return currentCastleId !== null;
  }
  
  /**
   * Get current castle ID
   */
  function getCurrentCastleId() {
    return currentCastleId;
  }
  
  /**
   * Attack the current castle
   */
  function attackCastle() {
    if (!currentCastleId) {
      console.log('[GameUI] No castle selected to attack');
      return;
    }
    
    // Close the card
    const castleId = currentCastleId;
    closeCastleCard();
    
    // Send attack request to server
    if (typeof Connection !== 'undefined') {
      Connection.send({
        type: CONSTANTS.MSG_TYPES.ATTACK_CASTLE,
        castleId: castleId
      });
      
      addConsoleMessage('info', `⚔️ Challenging for the castle!`);
    }
  }
  
  /**
   * Render equipment in castle card
   * @param {Object} equipment - Map of slot -> item data
   */
  function renderCastleCardEquipment(equipment) {
    const container = document.getElementById('castle-card-equipment');
    if (!container) return;
    
    container.innerHTML = '';
    
    for (const slotName of EQUIPMENT_SLOT_ORDER) {
      const slot = document.createElement('div');
      slot.className = 'castle-equip-slot';
      
      const item = equipment[slotName];
      if (item) {
        slot.classList.add('has-item');
        slot.innerHTML = item.id ? getItemIconHtml(item) : `<span class="slot-icon">${item.icon || EQUIPMENT_SLOT_ICONS[slotName]}</span>`;
        slot.title = item.name || slotName;
      } else {
        slot.innerHTML = `<span class="slot-icon">${EQUIPMENT_SLOT_ICONS[slotName]}</span>`;
        slot.title = slotName.charAt(0).toUpperCase() + slotName.slice(1);
      }
      
      container.appendChild(slot);
    }
  }
  
  /**
   * Render skills in castle card
   * @param {Array} equippedSkills - Array of {slot, skillId}
   */
  function renderCastleCardSkills(equippedSkills) {
    const container = document.getElementById('castle-card-skills');
    if (!container) return;
    
    container.innerHTML = '';
    
    // Create 5 skill slots
    for (let i = 1; i <= 5; i++) {
      const slot = document.createElement('div');
      slot.className = 'castle-skill-slot';
      
      const skillData = equippedSkills.find(s => s.slot === i);
      if (skillData && skillData.skillId) {
        slot.classList.add('has-skill');
        // For now just show a generic icon - could be enhanced to show actual skill icons
        slot.innerHTML = `<span class="slot-icon">⚡</span>`;
        slot.title = skillData.skillId;
      } else {
        slot.innerHTML = `<span class="slot-number">${i}</span>`;
        slot.title = `Skill Slot ${i}`;
      }
      
      container.appendChild(slot);
    }
  }
  
  /**
   * Handle castle info response from server
   * @param {Object} response - Server response
   */
  function handleCastleInfo(response) {
    if (response.success) {
      showCastleCard(response);
    } else {
      addConsoleMessage('error', response.message || 'Failed to get castle info');
    }
  }
  
  /**
   * Handle castle combat end
   * @param {Object} result - Combat result from server
   */
  function handleCastleCombatEnd(result) {
    // Unlock actions
    setActionsLocked(false);
    
    if (result.playerWon && result.conquered) {
      addConsoleMessage('system', `🏰 ${result.message}`);
    } else if (!result.playerWon) {
      addConsoleMessage('info', `⚔️ ${result.message}`);
    }
    
    // Update HP
    if (result.newHp !== undefined) {
      const charData = getCharacterData();
      if (charData) {
        charData.hp = result.newHp;
        setCharacterData(charData);
      }
    }
  }
  
  /**
   * Handle castle conquered notification
   * @param {Object} data - Conquest data from server
   */
  function handleCastleConquered(data) {
    addConsoleMessage('system', `🏰 ${data.message}`);
  }
  
  /**
   * Handle castle payout notification
   * @param {Object} data - Payout data from server
   */
  function handleCastlePayout(data) {
    addConsoleMessage('system', data.message);
  }

  // ==========================================
  // BOSS BATTLES
  // ==========================================
  
  // Boss state
  let currentBossId = null;
  let currentBossInfo = null;
  
  /**
   * Handle boss info response from server
   * @param {Object} response - Server response with boss data
   */
  function handleBossInfo(response) {
    if (response.success && response.boss) {
      currentBossId = response.boss.id;
      currentBossInfo = response.boss;
      showBossInfoPanel(response.boss, response.playerLevel);
    } else {
      addConsoleMessage('error', response.message || 'Boss not found');
    }
  }
  
  /**
   * Show boss info panel
   * @param {Object} boss - Boss data from server
   * @param {number} playerLevel - Player's current level
   */
  function showBossInfoPanel(boss, playerLevel) {
    // Remove existing panel DOM if any (but don't clear state — we're about to set it)
    const existingPanel = document.getElementById('boss-info-panel');
    if (existingPanel) existingPanel.remove();
    
    const isHigherLevel = boss.level > playerLevel;
    const nameColor = isHigherLevel ? '#FF4444' : '#FFD700';
    
    // Build skill slots HTML (5 slots, like player)
    let skillSlotsHtml = '';
    for (let i = 0; i < 5; i++) {
      const skill = boss.activeSkills && boss.activeSkills[i];
      if (skill) {
        skillSlotsHtml += `
          <div class="boss-skill-slot has-skill" 
               data-skill-index="${i}"
               data-skill-name="${skill.name || 'Unknown'}"
               data-skill-desc="${skill.description || ''}"
               data-skill-level="${skill.level || 1}">
            <span class="boss-skill-icon">${skill.icon || '⚔️'}</span>
          </div>
        `;
      } else {
        skillSlotsHtml += `
          <div class="boss-skill-slot empty">
            <span class="boss-slot-number">${i + 1}</span>
          </div>
        `;
      }
    }
    
    // Build drop icons HTML
    let dropsHtml = '';
    if (boss.drops && boss.drops.length > 0) {
      dropsHtml = boss.drops.map((drop, index) => {
        const rarityColor = CONSTANTS.RARITY[drop.rarity?.toUpperCase()]?.color || '#aaa';
        return `
          <div class="boss-drop-icon" 
               data-drop-index="${index}"
               data-item-id="${drop.itemId}"
               data-item-name="${drop.name || drop.itemId}"
               data-item-rarity="${drop.rarity || 'common'}"
               data-item-chance="${drop.chance}"
               data-item-minqty="${drop.minQty || 1}"
               data-item-maxqty="${drop.maxQty || 1}">
            <div class="drop-icon-img" style="border-color: ${rarityColor}">${drop.icon || '📦'}</div>
            <span class="drop-chance-text">${drop.chance}%</span>
          </div>
        `;
      }).join('');
    }
    
    // Create panel HTML
    const panel = document.createElement('div');
    panel.id = 'boss-info-panel';
    panel.className = 'boss-info-panel';
    panel.innerHTML = `
      <div class="boss-info-content">
      <div class="boss-info-header">
        <div class="boss-name-section">
          <span class="boss-icon">👑</span>
          <div class="boss-name-wrapper">
            <span class="boss-name" style="color: ${nameColor}">${boss.name}</span>
            ${boss.title ? `<span class="boss-title">${boss.title}</span>` : ''}
          </div>
        </div>
        <button class="boss-close-btn" onclick="GameUI.closeBossInfoPanel()">✕</button>
      </div>
      
      <div class="boss-info-body">
        <div class="boss-level-hp">
          <span class="boss-level" style="color: ${nameColor}">Level ${boss.level}</span>
          <div class="boss-hp-bar">
            <div class="boss-hp-fill" style="width: ${(boss.hp / boss.maxHp) * 100}%"></div>
            <span class="boss-hp-text">${boss.hp} / ${boss.maxHp}</span>
          </div>
        </div>
        
        <div class="boss-stats-section">
          <h4>Stats</h4>
          <div class="boss-stats-grid">
            <div class="boss-stat"><span class="stat-label">STR</span> <span class="stat-value">${boss.stats?.str || 1}</span></div>
            <div class="boss-stat"><span class="stat-label">VIT</span> <span class="stat-value">${boss.stats?.vit || 1}</span></div>
            <div class="boss-stat"><span class="stat-label">AGI</span> <span class="stat-value">${boss.stats?.agi || 1}</span></div>
            <div class="boss-stat"><span class="stat-label">DEX</span> <span class="stat-value">${boss.stats?.dex || 1}</span></div>
            <div class="boss-stat"><span class="stat-label">DEF</span> <span class="stat-value">${boss.stats?.def || 0}</span></div>
            <div class="boss-stat"><span class="stat-label">END</span> <span class="stat-value">${boss.stats?.end || 1}</span></div>
          </div>
        </div>
        
        <div class="boss-skills-section">
          <h4>Active Skills</h4>
          <div class="boss-skills-bar">
            ${skillSlotsHtml}
          </div>
        </div>
        
        ${boss.drops && boss.drops.length > 0 ? `
        <div class="boss-drops-section">
          <h4>Drops</h4>
          <div class="boss-drops-bar">
            ${dropsHtml}
          </div>
        </div>
        ` : ''}
        
        <div class="boss-rewards-section">
          <h4>Rewards</h4>
          <div class="boss-rewards">
            <span class="reward-exp">✨ ${boss.expReward || 0} EXP</span>
            <span class="reward-gold">💰 ${boss.goldReward || 0} Gold</span>
          </div>
        </div>
      </div>
      
      <div class="boss-info-footer">
        ${boss.canAttack ? `
          <button class="boss-attack-btn" data-boss-id="${boss.id}" onclick="GameUI.attackBoss('${boss.id}')">⚔️ Attack Boss</button>
        ` : `
          <div class="boss-unavailable">
            <p>⏰ Cooldown: ${formatTime(boss.cooldownRemaining)}</p>
          </div>
        `}
      </div>
      </div>
    `;
    
    document.body.appendChild(panel);
    
    // Click outside the content box to close
    panel.addEventListener('click', (e) => {
      if (e.target === panel) closeBossInfoPanel();
    });
    
    // Add tooltip handlers for skills
    panel.querySelectorAll('.boss-skill-slot.has-skill').forEach(slot => {
      slot.addEventListener('mouseenter', (e) => showBossSkillTooltip(e, slot));
      slot.addEventListener('mouseleave', hideBossTooltip);
    });
    
    // Add tooltip handlers for drops
    panel.querySelectorAll('.boss-drop-icon').forEach(drop => {
      drop.addEventListener('mouseenter', (e) => showBossDropTooltip(e, drop));
      drop.addEventListener('mouseleave', hideBossTooltip);
    });
  }
  
  /**
   * Show tooltip for boss skill
   */
  function showBossSkillTooltip(e, slot) {
    const name = slot.dataset.skillName;
    const desc = slot.dataset.skillDesc;
    const level = slot.dataset.skillLevel;
    
    if (!tooltipElement) return;
    
    let content = `<div class="boss-skill-tooltip">`;
    content += `<div class="skill-tooltip-name">${name} <span class="skill-tooltip-level">Lv.${level}</span></div>`;
    if (desc) {
      content += `<div class="skill-tooltip-desc">${desc}</div>`;
    }
    content += `</div>`;
    
    tooltipElement.innerHTML = content;
    tooltipElement.classList.remove('hidden');
    tooltipElement.classList.add('visible');
    
    const rect = slot.getBoundingClientRect();
    positionTooltip(rect.left + rect.width / 2, rect.top - 5);
  }
  
  /**
   * Show tooltip for boss drop
   */
  function showBossDropTooltip(e, drop) {
    const name = drop.dataset.itemName;
    const rarity = drop.dataset.itemRarity;
    const chance = drop.dataset.itemChance;
    const minQty = drop.dataset.itemMinqty;
    const maxQty = drop.dataset.itemMaxqty;
    
    if (!tooltipElement) return;
    
    const rarityColor = CONSTANTS.RARITY[rarity?.toUpperCase()]?.color || '#aaa';
    
    let content = `<div class="boss-drop-tooltip">`;
    content += `<div class="drop-tooltip-name" style="color: ${rarityColor}">${name}</div>`;
    content += `<div class="drop-tooltip-chance">Drop Rate: ${chance}%</div>`;
    if (minQty && maxQty) {
      content += `<div class="drop-tooltip-qty">Quantity: ${minQty}-${maxQty}</div>`;
    }
    content += `</div>`;
    
    tooltipElement.innerHTML = content;
    tooltipElement.classList.remove('hidden');
    tooltipElement.classList.add('visible');
    
    const rect = drop.getBoundingClientRect();
    positionTooltip(rect.left + rect.width / 2, rect.top - 5);
  }
  
  /**
   * Hide boss tooltip
   */
  function hideBossTooltip() {
    if (tooltipElement) {
      tooltipElement.classList.remove('visible');
      tooltipElement.classList.add('hidden');
    }
  }
  
  /**
   * Get skill display info from skill trees
   * @param {string} treeId - Skill tree ID
   * @param {number} skillId - Skill ID within tree
   * @returns {Object} - Skill display info {name, icon}
   */
  function getSkillDisplayInfo(treeId, skillId) {
    // Try to get from loaded skill trees
    if (typeof SKILL_TREES !== 'undefined' && SKILL_TREES[treeId]) {
      const tree = SKILL_TREES[treeId];
      const skill = tree.skills?.find(s => s.id === skillId);
      if (skill) {
        return { name: skill.name, icon: tree.tree?.icon || '⚔️' };
      }
    }
    return { name: `${treeId}:${skillId}`, icon: '⚔️' };
  }
  
  /**
   * Format seconds into mm:ss or hh:mm:ss
   * @param {number} seconds - Time in seconds
   * @returns {string} - Formatted time string
   */
  function formatTime(seconds) {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${mins}m ${secs}s`;
    }
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${mins}m`;
  }
  
  /**
   * Close boss info panel
   */
  function closeBossInfoPanel() {
    const panel = document.getElementById('boss-info-panel');
    if (panel) {
      panel.remove();
    }
    currentBossId = null;
    currentBossInfo = null;
  }
  
  /**
   * Attack the currently displayed boss
   * @param {string} [bossIdParam] - Optional boss ID passed directly from the button
   */
  function attackBoss(bossIdParam) {
    // Priority: direct parameter > state variable > DOM fallback
    let bossId = bossIdParam || currentBossId;
    if (!bossId) {
      const btn = document.querySelector('.boss-attack-btn[data-boss-id]');
      if (btn) bossId = btn.dataset.bossId;
    }
    
    if (!bossId) {
      return; // Silently ignore — no boss context available
    }
    
    // Close the info panel before starting combat
    closeBossInfoPanel();
    
    // Send attack request
    if (typeof Connection !== 'undefined') {
      Connection.send({
        type: CONSTANTS.MSG_TYPES.ATTACK_BOSS,
        bossId: bossId
      });
    }
  }
  
  /**
   * Handle boss combat end
   * @param {Object} result - Combat result from server
   */
  function handleBossCombatEnd(result) {
    // Unlock actions
    setActionsLocked(false);
    
    if (result.playerWon) {
      addConsoleMessage('system', `👑 ${result.message}`);
      
      // Show rewards
      if (result.expGained > 0) {
        addConsoleMessage('system', `✨ Gained ${result.expGained} experience!`);
      }
      if (result.goldGained > 0) {
        addConsoleMessage('system', `💰 Gained ${result.goldGained} gold!`);
      }
      
      // Show drops
      if (result.drops && result.drops.length > 0) {
        result.drops.forEach(drop => {
          addConsoleMessage('system', `📦 Received: ${drop.icon || '❓'} ${drop.name} x${drop.quantity}`);
        });
        
        // Refresh inventory
        if (typeof Connection !== 'undefined') {
          Connection.send({ type: 'get_inventory' });
        }
      }
      
      // Update character data
      const charData = getCharacterData();
      if (charData) {
        if (result.newLevel !== undefined) charData.level = result.newLevel;
        if (result.newExp !== undefined) charData.experience = result.newExp;
        if (result.newGold !== undefined) charData.gold = result.newGold;
        if (result.newHp !== undefined) charData.hp = result.newHp;
        setCharacterData(charData);
      }
      
      // Update player level for boss name coloring
      if (typeof BossManager !== 'undefined' && result.newLevel) {
        BossManager.setPlayerLevel(result.newLevel);
      }
      
      // Show cooldown message
      if (result.cooldownMs) {
        const hours = Math.floor(result.cooldownMs / 3600000);
        addConsoleMessage('info', `⏰ ${result.bossName} is now on a ${hours}h cooldown for you.`);
      }
      
    } else {
      addConsoleMessage('info', `⚔️ ${result.message}`);
      
      // Update HP
      if (result.newHp !== undefined) {
        const charData = getCharacterData();
        if (charData) {
          charData.hp = result.newHp;
          setCharacterData(charData);
        }
      }
    }
  }

  // ==========================================
  // TRAINING
  // ==========================================
  
  // Training state
  let currentTrainingDummy = null;
  let isTraining = false;
  let trainingStartTime = null;
  let trainingTimerInterval = null;
  let trainingCyclesCompleted = 0;
  
  /**
   * Show the training panel
   * @param {Object} dummy - Training dummy data from zone
   */
  function showTrainingPanel(dummy) {
    const panel = document.getElementById('training-panel');
    if (!panel) return;
    
    currentTrainingDummy = dummy;
    
    // Update panel name
    const nameEl = document.getElementById('training-panel-name');
    if (nameEl) nameEl.textContent = dummy.name || 'Training Dummy';
    
    // Update constants in UI
    const cycleTimeEl = document.getElementById('training-cycle-time');
    const expPercentEl = document.getElementById('training-exp-percent');
    const maxLevelEl = document.getElementById('training-max-level');
    
    if (cycleTimeEl) cycleTimeEl.textContent = CONSTANTS.TRAINING_CYCLE_MINUTES || 20;
    if (expPercentEl) expPercentEl.textContent = CONSTANTS.TRAINING_EXP_PERCENT || 2;
    if (maxLevelEl) maxLevelEl.textContent = CONSTANTS.TRAINING_MAX_LEVEL || 50;
    
    // Show info state by default
    const infoSection = document.getElementById('training-info');
    const activeSection = document.getElementById('training-active');
    
    if (infoSection) infoSection.classList.remove('hidden');
    if (activeSection) activeSection.classList.add('hidden');
    
    // Show panel
    panel.classList.remove('hidden');
  }
  
  /**
   * Hide the training panel
   */
  function hideTrainingPanel() {
    const panel = document.getElementById('training-panel');
    if (panel) panel.classList.add('hidden');
    
    currentTrainingDummy = null;
  }
  
  /**
   * Start training (send request to server)
   */
  function startTraining() {
    if (!currentTrainingDummy) {
      addConsoleMessage('error', 'No training dummy selected');
      return;
    }
    
    // Send training start request
    if (typeof Connection !== 'undefined') {
      Connection.send({
        type: CONSTANTS.MSG_TYPES.TRAINING_START,
        dummyId: currentTrainingDummy.id
      });
    }
  }
  
  /**
   * Stop training (send request to server)
   */
  function stopTraining() {
    if (typeof Connection !== 'undefined') {
      Connection.send({
        type: CONSTANTS.MSG_TYPES.TRAINING_STOP
      });
    }
  }
  
  /**
   * Start the training UI (after server confirms)
   * @param {Object} data - Training data from server
   */
  function startTrainingUI(data) {
    isTraining = true;
    trainingStartTime = new Date(data.startedAt).getTime();
    trainingCyclesCompleted = 0;
    
    // Switch to active state
    const infoSection = document.getElementById('training-info');
    const activeSection = document.getElementById('training-active');
    
    if (infoSection) infoSection.classList.add('hidden');
    if (activeSection) activeSection.classList.remove('hidden');
    
    // Start timer update
    updateTrainingTimer();
    if (trainingTimerInterval) clearInterval(trainingTimerInterval);
    trainingTimerInterval = setInterval(updateTrainingTimer, 1000);
  }
  
  /**
   * Stop the training UI
   */
  function stopTrainingUI() {
    isTraining = false;
    trainingStartTime = null;
    
    if (trainingTimerInterval) {
      clearInterval(trainingTimerInterval);
      trainingTimerInterval = null;
    }
    
    // Switch back to info state
    const infoSection = document.getElementById('training-info');
    const activeSection = document.getElementById('training-active');
    
    if (infoSection) infoSection.classList.remove('hidden');
    if (activeSection) activeSection.classList.add('hidden');
    
    // Hide panel
    hideTrainingPanel();
  }
  
  /**
   * Update training timer display
   */
  function updateTrainingTimer() {
    if (!isTraining || !trainingStartTime) return;
    
    const now = Date.now();
    const elapsed = now - trainingStartTime;
    const cycleMs = (CONSTANTS.TRAINING_CYCLE_MINUTES || 20) * 60 * 1000;
    
    // Calculate current cycle progress
    const currentCycleElapsed = elapsed % cycleMs;
    const timeRemaining = cycleMs - currentCycleElapsed;
    const completedCycles = Math.floor(elapsed / cycleMs);
    
    // Update cycles completed
    if (completedCycles > trainingCyclesCompleted) {
      trainingCyclesCompleted = completedCycles;
      const cyclesEl = document.getElementById('training-cycles-count');
      if (cyclesEl) cyclesEl.textContent = trainingCyclesCompleted;
    }
    
    // Update timer display
    const minutes = Math.floor(timeRemaining / 60000);
    const seconds = Math.floor((timeRemaining % 60000) / 1000);
    const timerEl = document.getElementById('training-timer');
    if (timerEl) {
      timerEl.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    
    // Update progress bar
    const progressPercent = (currentCycleElapsed / cycleMs) * 100;
    const progressBar = document.getElementById('training-progress-bar');
    if (progressBar) {
      progressBar.style.width = `${progressPercent}%`;
    }
  }
  
  /**
   * Update training status (from server)
   * @param {Object} data - Training status data
   */
  function updateTrainingStatus(data) {
    if (data.isTraining) {
      trainingStartTime = new Date(data.startedAt).getTime();
      trainingCyclesCompleted = data.completedCycles || 0;
      
      const cyclesEl = document.getElementById('training-cycles-count');
      if (cyclesEl) cyclesEl.textContent = trainingCyclesCompleted;
    }
  }

  // ==========================================
  // ACTION LOCKING (Combat/Death)
  // ==========================================
  
  /**
   * Set action lock state
   * When locked, player cannot: move, equip/unequip items, use items,
   * learn/equip skills, spend stat points, etc.
   * @param {boolean} locked - Whether actions should be locked
   */
  function setActionsLocked(locked) {
    actionsLocked = locked;
    
    const gameContainer = document.getElementById('game-container');
    if (gameContainer) {
      if (locked) {
        gameContainer.classList.add('actions-locked');
      } else {
        gameContainer.classList.remove('actions-locked');
      }
    }
    
    console.log('[GameUI] Actions locked:', locked);
  }
  
  /**
   * Check if actions are currently locked
   * @returns {boolean}
   */
  function areActionsLocked() {
    return actionsLocked || isDead;
  }
  
  /**
   * Check if player is dead
   * @returns {boolean}
   */
  function isPlayerDead() {
    return isDead;
  }
  
  /**
   * Attack the selected player (PvP)
   */
  function attackPlayer() {
    if (!selectedPlayerId || !selectedPlayerData) {
      console.log('[GameUI] No player selected to attack');
      return;
    }
    
    // Close the player card
    const playerId = selectedPlayerId;
    const playerName = selectedPlayerData.name;
    closePlayerCard();
    
    // Send attack request to server
    if (typeof Connection !== 'undefined') {
      Connection.send({
        type: 'pvp_attack',
        targetPlayerId: playerId
      });
      
      addConsoleMessage('info', `⚔️ Attacking ${playerName}!`);
    }
  }
  
  /**
   * Get the selected player ID (for external use)
   */
  function getSelectedPlayerId() {
    return selectedPlayerId;
  }
  
  /**
   * Render equipment in player card
   * @param {Object} equipment - Map of slot -> item data
   */
  function renderPlayerCardEquipment(equipment) {
    const container = document.getElementById('player-card-equipment');
    if (!container) return;
    
    container.innerHTML = '';
    
    for (const slotName of EQUIPMENT_SLOT_ORDER) {
      const slot = document.createElement('div');
      slot.className = 'player-card-equip-slot';
      
      const item = equipment[slotName];
      if (item) {
        slot.classList.add('has-item');
        slot.innerHTML = item.id ? getItemIconHtml(item) : `<span class="slot-icon">${item.icon || EQUIPMENT_SLOT_ICONS[slotName]}</span>`;
        slot.title = item.name || slotName;
      } else {
        slot.innerHTML = `<span class="slot-icon">${EQUIPMENT_SLOT_ICONS[slotName]}</span>`;
        slot.title = slotName.charAt(0).toUpperCase() + slotName.slice(1);
      }
      
      container.appendChild(slot);
    }
  }
  
  /**
   * Render skills in player card
   * @param {Array} skills - Array of equipped skill data
   */
  function renderPlayerCardSkills(skills) {
    const container = document.getElementById('player-card-skills');
    if (!container) return;
    
    container.innerHTML = '';
    
    // Filter to only show non-null skills
    const activeSkills = skills.filter(s => s !== null);
    
    if (activeSkills.length === 0) {
      container.innerHTML = '<div class="player-card-no-skills">No active skills equipped</div>';
      return;
    }
    
    for (const skill of activeSkills) {
      const skillSlot = document.createElement('div');
      skillSlot.className = 'player-card-skill-slot has-skill';
      skillSlot.innerHTML = skill.icon || '⚡';
      skillSlot.title = skill.name || 'Unknown Skill';
      container.appendChild(skillSlot);
    }
  }

  // ==========================================
  // PUBLIC API
  // ==========================================
  
  return {
    init,
    togglePanel,
    closeSkillsPanel,
    openSkillTree,
    closeSkillTree,
    addConsoleMessage,
    clearConsole,
    setCharacterData,
    updateCharacterData,
    updateStats,
    updateStatusBars,
    updateHp,
    updateStamina,
    updateGold,
    updateZoneName,
    setInventorySize,
    upgradeInventoryToMax,
    setAdminStatus,
    upgradeStat,
    addLevelAdmin,
    healAdmin,
    resetCharacterAdmin,
    giveRandomItemsAdmin,
    teleportAdmin,
    handleTeleportResponse,
    
    // Inventory
    updateInventory,
    renderInventory,
    renderEquipment,
    
    // Skills
    updatePlayerSkills,
    setSkillPoints,
    updateSkillSlots,
    updateSkillTrees,
    
    // Shop
    openShop,
    closeShop,
    isShopOpen,
    getCurrentShop,
    switchShopTab,
    closeShopConfirm,
    updateShopConfirmTotal,
    confirmShopTransaction,
    
    // Market
    openMarket,
    closeMarket,
    isMarketOpen,
    switchMarketTab,
    marketSearch,
    marketBuyItem,
    marketCancelListing,
    marketListItem,
    
    // Player Info Card
    showPlayerCard,
    closePlayerCard,
    attackPlayer,
    getSelectedPlayerId,
    
    // Death & Respawn
    showDeathOverlay,
    hideDeathOverlay,
    respawn,
    
    // Zone Danger
    handleZoneDanger,
    handleZoneDamage,
    
    // Spawn Beacon
    showBeaconPopup,
    closeBeaconPopup,
    confirmSetSpawn,
    handleSetSpawnResponse,
    
    // Castle Wars
    showCastleCard,
    closeCastleCard,
    isCastleCardOpen,
    getCurrentCastleId,
    attackCastle,
    handleCastleInfo,
    handleCastleCombatEnd,
    handleCastleConquered,
    handleCastlePayout,
    
    // Boss Battles
    handleBossInfo,
    showBossInfoPanel,
    closeBossInfoPanel,
    attackBoss,
    handleBossCombatEnd,
    
    // Training
    showTrainingPanel,
    hideTrainingPanel,
    startTraining,
    stopTraining,
    startTrainingUI,
    stopTrainingUI,
    updateTrainingStatus,
    
    // Action Locking
    setActionsLocked,
    areActionsLocked,
    isPlayerDead,
    
    // Convenience logging methods
    logSystem: (msg) => addConsoleMessage('system', msg),
    logError: (msg) => addConsoleMessage('error', msg),
    logInfo: (msg) => addConsoleMessage('info', msg),
    logServer: (msg) => addConsoleMessage('server', msg),
    logCombat: (msg) => addConsoleMessage('info', `⚔️ ${msg}`),
    
    // Tooltip system
    showTooltip,
    hideTooltip,
    
    // Getters
    getCharacterData: () => characterData,
    isAdmin: () => isAdmin,
    getPlayerSkills: () => ({ learned: playerSkills, equipped: equippedSkills }),
    getEquipmentBonuses: () => equipmentBonuses
  };
  
})();
