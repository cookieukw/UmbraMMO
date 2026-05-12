/**
 * UMBRA ONLINE - Paperdoll Manager
 * Handles loading and rendering equipment sprites overlaid on player characters.
 * 
 * Layer order (bottom to top):
 *   1. Boots       (lowest)
 *   2. Pants
 *   3. Headgear
 *   4. Chest
 *   5. Off-Hand (weapon2)
 *   6. Weapon (weapon1)  (highest)
 */

const PaperdollManager = (function() {
  
  // Cache of loaded paperdoll sprite images: itemId -> Image
  const spriteCache = {};
  // Set of item IDs that failed to load (don't retry)
  const failedSprites = new Set();
  
  // Paperdoll sprite path
  const PAPERDOLL_PATH = '/assets/sprites/items_paperdoll/';
  
  // Layer draw order (bottom to top)
  const LAYER_ORDER = ['boots', 'pants', 'headgear', 'chest', 'weapon2', 'weapon1'];
  
  // Sprite dimensions (must match player sprite)
  const SPRITE_WIDTH = 64;
  const SPRITE_HEIGHT = 64;
  
  /**
   * Preload a paperdoll sprite for an item ID
   * @param {string} itemId - The item's string ID (e.g. "leather_cap")
   * @returns {Image|null} The loaded image or null
   */
  function loadSprite(itemId) {
    if (!itemId) return null;
    
    // Already cached
    if (spriteCache[itemId]) return spriteCache[itemId];
    
    // Already failed, don't retry
    if (failedSprites.has(itemId)) return null;
    
    // Start loading
    const img = new Image();
    img.src = PAPERDOLL_PATH + itemId + '.png';
    
    img.onload = () => {
      spriteCache[itemId] = img;
    };
    
    img.onerror = () => {
      failedSprites.add(itemId);
    };
    
    // Store immediately so we don't start duplicate loads
    spriteCache[itemId] = img;
    return img;
  }
  
  /**
   * Preload all sprites for an equipment set
   * @param {Object} equipment - Map of slot -> itemId
   */
  function preloadEquipment(equipment) {
    if (!equipment) return;
    for (const [slot, itemId] of Object.entries(equipment)) {
      if (itemId && LAYER_ORDER.includes(slot)) {
        loadSprite(itemId);
      }
    }
  }
  
  /**
   * Render paperdoll equipment layers on a character
   * @param {CanvasRenderingContext2D} ctx - Canvas context
   * @param {number} renderX - Top-left X for the 64x64 sprite
   * @param {number} renderY - Top-left Y for the 64x64 sprite
   * @param {Object} equipment - Map of slot -> itemId
   * @param {boolean} shouldFlip - Whether to flip horizontally (facing left)
   */
  function render(ctx, renderX, renderY, equipment, shouldFlip) {
    if (!equipment || Object.keys(equipment).length === 0) return;
    
    // Draw each layer in order (bottom to top)
    for (const slot of LAYER_ORDER) {
      const itemId = equipment[slot];
      if (!itemId) continue;
      
      const img = spriteCache[itemId];
      if (!img || !img.complete || img.naturalWidth === 0) {
        // Try to load it if not yet loaded
        loadSprite(itemId);
        continue;
      }
      
      if (shouldFlip) {
        ctx.save();
        ctx.translate(renderX + SPRITE_WIDTH, renderY);
        ctx.scale(-1, 1);
        ctx.drawImage(img, 0, 0, SPRITE_WIDTH, SPRITE_HEIGHT);
        ctx.restore();
      } else {
        ctx.drawImage(img, renderX, renderY, SPRITE_WIDTH, SPRITE_HEIGHT);
      }
    }
  }
  
  /**
   * Check if a sprite is loaded for an item ID
   * @param {string} itemId
   * @returns {boolean}
   */
  function isSpriteLoaded(itemId) {
    const img = spriteCache[itemId];
    return img && img.complete && img.naturalWidth > 0;
  }
  
  /**
   * Clear the sprite cache
   */
  function clearCache() {
    Object.keys(spriteCache).forEach(key => delete spriteCache[key]);
    failedSprites.clear();
  }
  
  return {
    loadSprite,
    preloadEquipment,
    render,
    isSpriteLoaded,
    clearCache,
    LAYER_ORDER
  };
  
})();
