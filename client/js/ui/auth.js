/**
 * UMBRA ONLINE - Authentication UI
 * Handles login, register, and character creation screens
 */

const Auth = (function() {
  const TOKEN_KEY = 'umbra_token';
  
  let currentScreen = null;
  let authToken = null;
  let userData = null;
  
  /**
   * Initialize auth system
   */
  function init() {
    // Check for existing token
    authToken = localStorage.getItem(TOKEN_KEY);
    
    if (authToken) {
      // Validate existing token
      validateToken();
    } else {
      // Show login screen
      showScreen('login');
    }
  }
  
  /**
   * Validate stored token with server
   */
  async function validateToken() {
    showScreen('loading');
    
    try {
      const response = await fetch('/api/validate', {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });
      
      const data = await response.json();
      
      if (data.success) {
        userData = data;
        
        if (data.hasCharacter) {
          // Has character, start game
          startGame(data.character);
        } else {
          // Needs to create character
          showScreen('character-create');
        }
      } else {
        // Token invalid, clear and show login
        localStorage.removeItem(TOKEN_KEY);
        authToken = null;
        showScreen('login');
      }
    } catch (err) {
      console.error('[Auth] Validation error:', err);
      showScreen('login');
    }
  }
  
  /**
   * Handle login form submission
   */
  async function handleLogin(username, password) {
    showError('');
    
    if (!username || !password) {
      showError('Please enter username and password');
      return;
    }
    
    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, password })
      });
      
      const data = await response.json();
      
      if (data.success) {
        // Store token
        authToken = data.token;
        localStorage.setItem(TOKEN_KEY, authToken);
        userData = data;
        
        if (data.hasCharacter) {
          startGame(data.character);
        } else {
          showScreen('character-create');
        }
      } else {
        showError(data.error || 'Login failed');
      }
    } catch (err) {
      console.error('[Auth] Login error:', err);
      showError('Connection error. Please try again.');
    }
  }
  
  /**
   * Handle register form submission
   */
  async function handleRegister(username, email, password, confirmPassword) {
    showError('');
    
    if (!username || !email || !password) {
      showError('Please fill in all fields');
      return;
    }
    
    if (password !== confirmPassword) {
      showError('Passwords do not match');
      return;
    }
    
    if (password.length < 6) {
      showError('Password must be at least 6 characters');
      return;
    }
    
    try {
      const response = await fetch('/api/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, email, password })
      });
      
      const data = await response.json();
      
      if (data.success) {
        // Show login screen with success message
        showScreen('login');
        showMessage('Account created! Please log in.');
      } else {
        showError(data.error || 'Registration failed');
      }
    } catch (err) {
      console.error('[Auth] Register error:', err);
      showError('Connection error. Please try again.');
    }
  }
  
  /**
   * Handle character creation
   */
  async function handleCreateCharacter(name) {
    showError('');
    
    if (!name || name.length < 2) {
      showError('Character name must be at least 2 characters');
      return;
    }
    
    if (!/^[a-zA-Z]+$/.test(name)) {
      showError('Character name can only contain letters');
      return;
    }
    
    try {
      const response = await fetch('/api/character/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({ name })
      });
      
      const data = await response.json();
      
      if (data.success) {
        startGame(data.character);
      } else {
        showError(data.error || 'Failed to create character');
      }
    } catch (err) {
      console.error('[Auth] Character creation error:', err);
      showError('Connection error. Please try again.');
    }
  }
  
  /**
   * Start the game with character data
   */
  function startGame(character) {
    // Hide auth screens
    hideAllScreens();
    
    // Show game container
    const gameContainer = document.getElementById('game-container');
    if (gameContainer) {
      gameContainer.classList.remove('hidden');
    }
    
    // Initialize game with character data
    Game.start(authToken, character);
  }
  
  /**
   * Logout
   */
  async function logout() {
    try {
      await fetch('/api/logout', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });
    } catch (err) {
      // Ignore errors
    }
    
    localStorage.removeItem(TOKEN_KEY);
    authToken = null;
    userData = null;
    
    // Reload page
    window.location.reload();
  }
  
  /**
   * Show a specific screen
   */
  function showScreen(screenName) {
    hideAllScreens();
    currentScreen = screenName;
    
    const screen = document.getElementById(`${screenName}-screen`);
    if (screen) {
      screen.classList.remove('hidden');
    }
    
    // Hide game container when showing auth screens
    const gameContainer = document.getElementById('game-container');
    if (['login', 'register', 'character-create', 'loading'].includes(screenName)) {
      if (gameContainer) {
        gameContainer.classList.add('hidden');
      }
    }
    
    // Clear any previous error messages
    clearMessages();
  }
  
  /**
   * Hide all auth screens
   */
  function hideAllScreens() {
    const screens = ['login-screen', 'register-screen', 'character-create-screen', 'loading-screen'];
    screens.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.add('hidden');
    });
  }
  
  /**
   * Clear all error/success messages
   */
  function clearMessages() {
    const errorIds = ['login-error', 'register-error', 'character-create-error'];
    const msgIds = ['login-message'];
    
    errorIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.textContent = '';
        el.classList.add('hidden');
      }
    });
    
    msgIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.textContent = '';
        el.classList.add('hidden');
      }
    });
  }
  
  /**
   * Show error message on current screen
   */
  function showError(message) {
    const errorId = `${currentScreen}-error`;
    const errorEl = document.getElementById(errorId);
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.classList.toggle('hidden', !message);
    }
  }
  
  /**
   * Show success message on current screen
   */
  function showMessage(message) {
    const msgId = `${currentScreen}-message`;
    const msgEl = document.getElementById(msgId);
    if (msgEl) {
      msgEl.textContent = message;
      msgEl.classList.toggle('hidden', !message);
    }
  }
  
  /**
   * Get current auth token
   */
  function getToken() {
    return authToken;
  }
  
  /**
   * Get user data
   */
  function getUserData() {
    return userData;
  }
  
  // Public API
  return {
    init,
    handleLogin,
    handleRegister,
    handleCreateCharacter,
    logout,
    showScreen,
    getToken,
    getUserData
  };
})();
