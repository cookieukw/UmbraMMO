/**
 * UMBRA ONLINE - Security Utilities
 * Validation, sanitization, and security helpers
 */

const config = require('./config.js');

// ===================
// VALIDATION
// ===================

/**
 * Validate that a value is a safe integer within bounds
 */
function isValidInt(value, min = -Infinity, max = Infinity) {
  return Number.isInteger(value) && value >= min && value <= max;
}

/**
 * Validate that a value is a safe float within bounds
 */
function isValidFloat(value, min = -Infinity, max = Infinity) {
  return typeof value === 'number' && 
         !Number.isNaN(value) && 
         Number.isFinite(value) &&
         value >= min && 
         value <= max;
}

/**
 * Validate that a string matches expected format
 */
function isValidString(value, minLength = 0, maxLength = 1000, pattern = null) {
  if (typeof value !== 'string') return false;
  if (value.length < minLength || value.length > maxLength) return false;
  if (pattern && !pattern.test(value)) return false;
  return true;
}

/**
 * Validate player name format
 * - 3-16 characters
 * - Letters, numbers, underscore only
 * - Must start with letter
 */
function isValidPlayerName(name) {
  return isValidString(name, 3, 16, /^[a-zA-Z][a-zA-Z0-9_]{2,15}$/);
}

/**
 * Validate coordinate is within zone bounds
 */
function isValidCoordinate(x, y, zoneWidth = 20, zoneHeight = 15) {
  return isValidInt(x, 0, zoneWidth - 1) && isValidInt(y, 0, zoneHeight - 1);
}

// ===================
// SANITIZATION
// ===================

/**
 * Sanitize string - remove HTML, trim, limit length
 */
function sanitizeString(str, maxLength = 200) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/<[^>]*>/g, '')          // Remove HTML tags
    .replace(/[<>]/g, '')             // Remove remaining angle brackets
    .replace(/[\x00-\x1f\x7f]/g, '')  // Remove control characters
    .trim()
    .substring(0, maxLength);
}

/**
 * Sanitize player name - alphanumeric and underscore only
 */
function sanitizePlayerName(name) {
  if (typeof name !== 'string') return '';
  return name
    .replace(/[^a-zA-Z0-9_]/g, '')
    .substring(0, 16);
}

/**
 * Deep clone object without prototype pollution
 */
function safeClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

// ===================
// RATE LIMITING
// ===================

class RateLimiter {
  constructor(maxRequests, windowMs) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.requests = new Map();
  }
  
  /**
   * Check if request is allowed, returns true if allowed
   */
  isAllowed(key) {
    const now = Date.now();
    const record = this.requests.get(key);
    
    if (!record || now - record.windowStart > this.windowMs) {
      this.requests.set(key, { count: 1, windowStart: now });
      return true;
    }
    
    if (record.count >= this.maxRequests) {
      return false;
    }
    
    record.count++;
    return true;
  }
  
  /**
   * Clear old entries (call periodically)
   */
  cleanup() {
    const now = Date.now();
    for (const [key, record] of this.requests.entries()) {
      if (now - record.windowStart > this.windowMs) {
        this.requests.delete(key);
      }
    }
  }
}

// ===================
// LOGGING (Security-aware)
// ===================

/**
 * Log message (respects production mode)
 */
function log(level, message, ...args) {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
  
  if (config.isProd()) {
    // In production, only log warnings and errors
    if (level === 'error' || level === 'warn') {
      console[level](prefix, message, ...args);
    }
  } else {
    // In development, log everything
    console[level === 'debug' ? 'log' : level](prefix, message, ...args);
  }
}

const logger = {
  debug: (msg, ...args) => log('debug', msg, ...args),
  info: (msg, ...args) => log('info', msg, ...args),
  warn: (msg, ...args) => log('warn', msg, ...args),
  error: (msg, ...args) => log('error', msg, ...args)
};

// ===================
// EXPORTS
// ===================

module.exports = {
  // Validation
  isValidInt,
  isValidFloat,
  isValidString,
  isValidPlayerName,
  isValidCoordinate,
  
  // Sanitization
  sanitizeString,
  sanitizePlayerName,
  safeClone,
  
  // Rate limiting
  RateLimiter,
  
  // Logging
  logger
};
