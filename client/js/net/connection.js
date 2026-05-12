/**
 * UMBRA ONLINE - WebSocket Connection Manager
 * Handles connection to game server
 */

const Connection = (function() {
  let ws = null;
  let playerId = null;
  let isConnected = false;
  let reconnectAttempts = 0;
  const MAX_RECONNECT_ATTEMPTS = 5;
  const RECONNECT_DELAY = 3000;
  
  // Debug mode - disable in production for security
  const DEBUG_MODE = window.location.hostname === 'localhost' || 
                     window.location.hostname === '127.0.0.1';
  
  // Message handlers registered by other modules
  const messageHandlers = new Map();
  
  // Ready callback
  let readyCallback = null;
  
  /**
   * Initialize connection to server
   */
  function init() {
    connect();
  }
  
  /**
   * Register callback for when connection is ready
   */
  function onReady(callback) {
    readyCallback = callback;
    // If already connected, call immediately
    if (isConnected && readyCallback) {
      readyCallback();
    }
  }
  
  /**
   * Connect to WebSocket server
   */
  function connect() {
    // Automatically detect protocol and host
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host; // includes port if non-standard
    const wsUrl = `${protocol}//${host}${CONSTANTS.WEBSOCKET_PATH}`;
    
    if (DEBUG_MODE) {
      console.log('[Connection] Connecting to:', wsUrl);
    }
    updateStatus('connecting');
    
    try {
      ws = new WebSocket(wsUrl);
      
      ws.onopen = onOpen;
      ws.onmessage = onMessage;
      ws.onclose = onClose;
      ws.onerror = onError;
    } catch (err) {
      console.error('[Connection] Failed to create WebSocket:', err);
      scheduleReconnect();
    }
  }
  
  /**
   * Handle connection open
   */
  function onOpen() {
    if (DEBUG_MODE) {
      console.log('[Connection] Connected to server');
    }
    isConnected = true;
    reconnectAttempts = 0;
    updateStatus('connected');
    
    // Call ready callback
    if (readyCallback) {
      readyCallback();
    }
  }
  
  /**
   * Handle incoming message
   */
  function onMessage(event) {
    try {
      const message = JSON.parse(event.data);
      
      if (DEBUG_MODE) {
        console.log('[Connection] Received:', message.type);
      }
      
      // Handle auth success specially
      if (message.type === CONSTANTS.MSG_TYPES.AUTH_SUCCESS) {
        playerId = message.playerId;
        updatePlayerInfo(playerId);
        if (DEBUG_MODE) {
          console.log('[Connection] Authenticated as Player', playerId);
        }
      }
      
      // Call registered handlers
      if (messageHandlers.has(message.type)) {
        const handlers = messageHandlers.get(message.type);
        handlers.forEach(handler => handler(message));
      }
      
      // Call global handler if registered
      if (messageHandlers.has('*')) {
        const handlers = messageHandlers.get('*');
        handlers.forEach(handler => handler(message));
      }
      
    } catch (err) {
      console.error('[Connection] Failed to parse message:', err);
    }
  }
  
  /**
   * Handle connection close
   */
  function onClose(event) {
    if (DEBUG_MODE) {
      console.log('[Connection] Disconnected from server. Code:', event.code);
    }
    isConnected = false;
    playerId = null;
    updateStatus('disconnected');
    updatePlayerInfo(null);
    
    // Attempt reconnect
    scheduleReconnect();
  }
  
  /**
   * Handle connection error
   */
  function onError(error) {
    if (DEBUG_MODE) {
      console.error('[Connection] WebSocket error:', error);
    }
  }
  
  /**
   * Schedule reconnection attempt
   */
  function scheduleReconnect() {
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      if (DEBUG_MODE) {
        console.log('[Connection] Max reconnect attempts reached');
      }
      updateStatus('disconnected');
      return;
    }
    
    reconnectAttempts++;
    if (DEBUG_MODE) {
      console.log(`[Connection] Reconnecting in ${RECONNECT_DELAY/1000}s... (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
    }
    
    setTimeout(() => {
      if (!isConnected) {
        connect();
      }
    }, RECONNECT_DELAY);
  }
  
  /**
   * Send message to server
   */
  function send(message) {
    if (!isConnected || !ws) {
      if (DEBUG_MODE) {
        console.warn('[Connection] Cannot send - not connected');
      }
      return false;
    }
    
    try {
      ws.send(JSON.stringify(message));
      if (DEBUG_MODE) {
        console.log('[Connection] Sent:', message.type);
      }
      return true;
    } catch (err) {
      if (DEBUG_MODE) {
        console.error('[Connection] Failed to send message:', err);
      }
      return false;
    }
  }
  
  /**
   * Register a message handler
   * @param {string} type - Message type to handle (or '*' for all)
   * @param {function} handler - Handler function
   */
  function on(type, handler) {
    if (!messageHandlers.has(type)) {
      messageHandlers.set(type, []);
    }
    messageHandlers.get(type).push(handler);
  }
  
  /**
   * Remove a message handler
   */
  function off(type, handler) {
    if (messageHandlers.has(type)) {
      const handlers = messageHandlers.get(type);
      const index = handlers.indexOf(handler);
      if (index !== -1) {
        handlers.splice(index, 1);
      }
    }
  }
  
  /**
   * Update connection status UI
   */
  function updateStatus(status) {
    const statusEl = document.getElementById('connection-status');
    if (!statusEl) return;
    
    statusEl.className = status;
    
    // Set tooltip text
    switch (status) {
      case 'connected':
        statusEl.title = 'Connected';
        break;
      case 'disconnected':
        statusEl.title = 'Disconnected';
        break;
      case 'connecting':
        statusEl.title = 'Connecting...';
        break;
    }
  }
  
  /**
   * Update player info UI (truncated for security)
   */
  function updatePlayerInfo(id) {
    const infoEl = document.getElementById('player-info');
    if (!infoEl) return;
    
    // Only show first 6 chars of ID for security
    infoEl.textContent = id ? `Player: ${id.substring(0, 6)}...` : 'Player: -';
  }
  
  /**
   * Get current player ID
   */
  function getPlayerId() {
    return playerId;
  }
  
  /**
   * Check if connected
   */
  function getIsConnected() {
    return isConnected;
  }
  
  // Public API
  return {
    init,
    onReady,
    send,
    on,
    off,
    getPlayerId,
    isConnected: getIsConnected
  };
})();
