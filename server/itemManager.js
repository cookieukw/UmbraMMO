/**
 * UMBRA ONLINE - Item Manager
 * Handles loading and managing item definitions
 */

const fs = require('fs');
const path = require('path');

// Item database
let items = {};

/**
 * Initialize item manager - load all items from individual JSON files
 */
function init() {
  const itemsDir = path.join(__dirname, '..', 'data', 'items');
  
  try {
    const files = fs.readdirSync(itemsDir);
    let loadedCount = 0;
    
    files.forEach(file => {
      // Skip non-JSON files and the old items.json
      if (!file.endsWith('.json') || file === 'items.json') return;
      
      try {
        const filePath = path.join(itemsDir, file);
        const itemData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        
        if (itemData.id) {
          items[itemData.id] = itemData;
          loadedCount++;
        }
      } catch (err) {
        console.error(`[ItemManager] Error loading item file ${file}:`, err.message);
      }
    });
    
    console.log(`[ItemManager] Loaded ${loadedCount} items`);
  } catch (err) {
    console.error('[ItemManager] Error loading items:', err);
  }
}

/**
 * Get item by ID
 * @param {string} itemId
 * @returns {Object|null}
 */
function getItem(itemId) {
  return items[itemId] || null;
}

/**
 * Get all items
 * @returns {Object}
 */
function getAllItems() {
  return items;
}

/**
 * Get items by type
 * @param {string} type
 * @returns {Array}
 */
function getItemsByType(type) {
  return Object.values(items).filter(item => item.type === type);
}

/**
 * Get equipment for a specific slot
 * @param {string} slot
 * @returns {Array}
 */
function getEquipmentForSlot(slot) {
  return Object.values(items).filter(item => 
    item.type === 'equipment' && item.slot === slot
  );
}

/**
 * Check if item can be equipped in slot
 * @param {string} itemId
 * @param {string} slot
 * @returns {boolean}
 */
function canEquipInSlot(itemId, slot) {
  const item = items[itemId];
  if (!item || item.type !== 'equipment') return false;
  
  // Ring can go in ring1 or ring2
  if (item.slot === 'ring') {
    return slot === 'ring1' || slot === 'ring2';
  }
  
  return item.slot === slot;
}

/**
 * Check if item is usable (consumable)
 * @param {string} itemId
 * @returns {boolean}
 */
function isUsable(itemId) {
  const item = items[itemId];
  if (!item) return false;
  return item.type === 'food' || item.type === 'consumable';
}

/**
 * Get item use effect
 * @param {string} itemId
 * @returns {Object|null}
 */
function getUseEffect(itemId) {
  const item = items[itemId];
  if (!item || !item.useEffect) return null;
  return item.useEffect;
}

/**
 * Calculate stat bonuses from equipment
 * @param {Object} equipment - Map of slot -> itemId
 * @returns {Object} - Total stat bonuses
 */
function calculateEquipmentBonuses(equipment) {
  const bonuses = {
    str: 0,
    agi: 0,
    dex: 0,
    vit: 0,
    end: 0,
    int: 0,
    def: 0,
    armor: 0,
    bonusSlots: 0
  };
  
  for (const [slot, itemId] of Object.entries(equipment)) {
    const item = items[itemId];
    if (!item) continue;
    
    // Add stat bonuses
    if (item.stats) {
      for (const [stat, value] of Object.entries(item.stats)) {
        if (bonuses.hasOwnProperty(stat)) {
          bonuses[stat] += value;
        }
      }
    }
    
    // Add armor
    if (item.armor) {
      bonuses.armor += item.armor;
    }
    
    // Add bonus inventory slots (from backpack)
    if (item.bonusSlots) {
      bonuses.bonusSlots += item.bonusSlots;
    }
  }
  
  return bonuses;
}

/**
 * Get all starter items for testing
 * @returns {Array} Array of {itemId, quantity}
 */
function getStarterItems() {
  return [
    { itemId: 'worn_sword', quantity: 1 },
    { itemId: 'dented_helmet', quantity: 1 },
    { itemId: 'tattered_shirt', quantity: 1 },
    { itemId: 'patched_pants', quantity: 1 },
    { itemId: 'scuffed_boots', quantity: 1 },
    { itemId: 'cracked_pendant', quantity: 1 },
    { itemId: 'small_pouch', quantity: 1 },
    { itemId: 'wooden_shield', quantity: 1 },
    { itemId: 'tarnished_ring', quantity: 2 },  // 2 rings
    { itemId: 'apple', quantity: 5 },
    { itemId: 'exp_shard', quantity: 3 }
  ];
}

module.exports = {
  init,
  getItem,
  getAllItems,
  getItemsByType,
  getEquipmentForSlot,
  canEquipInSlot,
  isUsable,
  getUseEffect,
  calculateEquipmentBonuses,
  getStarterItems
};
