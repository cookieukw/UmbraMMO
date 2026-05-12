/**
 * UMBRA ONLINE - Input Handler
 * Handles keyboard and mouse input
 */

const Input = (function() {
  // Key states
  const keys = {
    up: false,
    down: false,
    left: false,
    right: false,
    attack: false,
    interact: false
  };
  
  // Key mappings
  const KEY_MAP = {
    'ArrowUp': 'up',
    'ArrowDown': 'down',
    'ArrowLeft': 'left',
    'ArrowRight': 'right',
    'KeyW': 'up',
    'KeyS': 'down',
    'KeyA': 'left',
    'KeyD': 'right',
    'w': 'up',
    's': 'down',
    'a': 'left',
    'd': 'right',
    'Space': 'attack',
    ' ': 'attack',
    'KeyE': 'interact',
    'e': 'interact'
  };
  
  // Movement queue (for buffering input)
  let queuedDirection = null;
  
  // Callbacks
  let onMoveCallback = null;
  let onAttackCallback = null;
  let onInteractCallback = null;
  
  // Enable/disable flag (for when typing in console)
  let enabled = true;
  
  /**
   * Initialize input handling
   */
  function init() {
    // Key down handler
    window.addEventListener('keydown', (e) => {
      // Debug: log ALL key presses unconditionally
      if (e.code === 'KeyE' || e.key === 'e') {
        console.log(`[Input] RAW E keydown detected. enabled=${enabled}, activeElement=${document.activeElement?.tagName}, code=${e.code}`);
      }
      
      // Skip if input is disabled (typing in console)
      if (!enabled) return;
      
      // Skip if user is typing in an input field
      const activeTag = document.activeElement?.tagName;
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') {
        return;
      }
      
      const action = KEY_MAP[e.code] || KEY_MAP[e.key];
      if (action) {
        e.preventDefault();
        
        // Handle attack separately
        if (action === 'attack') {
          if (!keys.attack) { // Only trigger once per press
            keys.attack = true;
            if (onAttackCallback) {
              onAttackCallback();
            }
          }
          return;
        }
        
        // Handle interact separately
        if (action === 'interact') {
          console.log('[Input] E key pressed (interact)');
          if (!keys.interact) { // Only trigger once per press
            keys.interact = true;
            if (onInteractCallback) {
              console.log('[Input] Firing interact callback');
              onInteractCallback();
            } else {
              console.warn('[Input] No interact callback registered!');
            }
          }
          return;
        }
        
        // Direction handling
        keys[action] = true;
        
        // Queue this direction for movement
        queuedDirection = action;
        
        // Trigger movement callback
        if (onMoveCallback) {
          onMoveCallback(action);
        }
      }
    });
    
    // Key up handler
    window.addEventListener('keyup', (e) => {
      const action = KEY_MAP[e.code] || KEY_MAP[e.key];
      if (action) {
        keys[action] = false;
      }
    });
    
    // Prevent arrow keys from scrolling page
    window.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyE'].includes(e.code)) {
        // Only prevent if we're not in an input field
        if (document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
          e.preventDefault();
        }
      }
    });
    
    console.log('[Input] Initialized');
  }
  
  /**
   * Enable or disable input (for when typing in console)
   */
  function setEnabled(isEnabled) {
    enabled = isEnabled;
    // Clear any held keys when disabling
    if (!enabled) {
      keys.up = false;
      keys.down = false;
      keys.left = false;
      keys.right = false;
      keys.attack = false;
      keys.interact = false;
      queuedDirection = null;
    }
  }
  
  /**
   * Check if input is enabled
   */
  function isEnabled() {
    return enabled;
  }
  
  /**
   * Check if a direction key is currently pressed
   */
  function isKeyDown(direction) {
    return enabled && (keys[direction] || false);
  }
  
  /**
   * Get the currently pressed direction (priority: last pressed)
   */
  function getQueuedDirection() {
    if (!enabled) return null;
    const dir = queuedDirection;
    queuedDirection = null;
    return dir;
  }
  
  /**
   * Get any currently held direction
   */
  function getHeldDirection() {
    if (!enabled) return null;
    if (keys.up) return 'up';
    if (keys.down) return 'down';
    if (keys.left) return 'left';
    if (keys.right) return 'right';
    return null;
  }
  
  /**
   * Register callback for movement input
   */
  function onMove(callback) {
    onMoveCallback = callback;
  }
  
  /**
   * Register callback for attack input
   */
  function onAttack(callback) {
    onAttackCallback = callback;
  }
  
  /**
   * Register callback for interact input (E key)
   */
  function onInteract(callback) {
    onInteractCallback = callback;
  }
  
  // Public API
  return {
    init,
    setEnabled,
    isEnabled,
    isKeyDown,
    getQueuedDirection,
    getHeldDirection,
    onMove,
    onAttack,
    onInteract
  };
})();
