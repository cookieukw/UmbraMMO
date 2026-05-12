/**
 * UMBRA ONLINE - Server Configuration
 * Loads environment variables and provides defaults
 */

// Load environment variables in development
if (process.env.NODE_ENV !== 'production') {
  try {
    require('dotenv').config();
  } catch (e) {
    // dotenv not installed, use defaults
  }
}

const config = {
  // Server
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT, 10) || 3000,
  
  // Domain
  DOMAIN: process.env.DOMAIN || 'localhost',
  
  // WebSocket
  WS_PATH: process.env.WS_PATH || '/ws',
  
  // Admin/Development Features
  ENABLE_MAP_EDITOR: process.env.ENABLE_MAP_EDITOR === 'true', // Disabled by default — set to 'true' in .env to enable
  ADMIN_MAP_PASSWORD: process.env.ADMIN_MAP_PASSWORD || null, // REQUIRED — set in .env, no default for security
  
  // Security
  ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS 
    ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim())
    : null,
  MAX_CONNECTIONS_PER_IP: parseInt(process.env.MAX_CONNECTIONS_PER_IP, 10) || 5,
  RATE_LIMIT_MESSAGES: parseInt(process.env.RATE_LIMIT_MESSAGES, 10) || 10,
  RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 1000,
  
  // Helpers
  isProd: () => config.NODE_ENV === 'production',
  isDev: () => config.NODE_ENV === 'development'
};

module.exports = config;
