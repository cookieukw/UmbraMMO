/**
 * UMBRA ONLINE - Authentication Routes
 * HTTP endpoints for login, register, character creation
 */

const database = require('./database.js');

/**
 * Setup auth routes on Express app
 */
function setupRoutes(app) {
  // Parse JSON body
  app.use(require('express').json());
  
  // ===================
  // ACCOUNT ENDPOINTS
  // ===================
  
  /**
   * POST /api/register
   * Create a new account
   */
  app.post('/api/register', async (req, res) => {
    const { username, email, password } = req.body;
    
    if (!username || !email || !password) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }
    
    const result = await database.createAccount(username, email, password);
    
    if (result.success) {
      res.json({ success: true, message: 'Account created successfully' });
    } else {
      res.status(400).json(result);
    }
  });
  
  /**
   * POST /api/login
   * Login to an account
   */
  app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'Missing username or password' });
    }
    
    const result = await database.login(username, password);
    
    if (result.success) {
      // Check if account has a character
      const character = await database.getCharacter(result.accountId);
      
      res.json({
        success: true,
        token: result.token,
        username: result.username,
        isAdmin: result.isAdmin,
        hasCharacter: !!character,
        character: character ? {
          name: character.name,
          level: character.level,
          zoneId: character.zone_id,
          x: character.x,
          y: character.y,
          direction: character.direction
        } : null
      });
    } else {
      res.status(401).json(result);
    }
  });
  
  /**
   * POST /api/logout
   * Logout (invalidate session)
   */
  app.post('/api/logout', async (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (token) {
      await database.logout(token);
    }
    
    res.json({ success: true });
  });
  
  /**
   * GET /api/validate
   * Validate session token
   */
  app.get('/api/validate', async (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ success: false, error: 'No token provided' });
    }
    
    const session = await database.validateSession(token);
    
    if (session) {
      const character = await database.getCharacter(session.accountId);
      
      res.json({
        success: true,
        username: session.username,
        isAdmin: session.isAdmin,
        hasCharacter: !!character,
        character: character ? {
          name: character.name,
          level: character.level,
          zoneId: character.zone_id,
          x: character.x,
          y: character.y,
          direction: character.direction
        } : null
      });
    } else {
      res.status(401).json({ success: false, error: 'Invalid or expired token' });
    }
  });
  
  // ===================
  // CHARACTER ENDPOINTS
  // ===================
  
  /**
   * POST /api/character/create
   * Create a character for the logged-in account
   */
  app.post('/api/character/create', async (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const { name } = req.body;
    
    if (!token) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }
    
    const session = await database.validateSession(token);
    if (!session) {
      return res.status(401).json({ success: false, error: 'Invalid session' });
    }
    
    if (!name) {
      return res.status(400).json({ success: false, error: 'Character name required' });
    }
    
    const result = await database.createCharacter(session.accountId, name);
    
    if (result.success) {
      const character = await database.getCharacter(session.accountId);
      res.json({
        success: true,
        character: {
          name: character.name,
          level: character.level,
          zoneId: character.zone_id,
          x: character.x,
          y: character.y
        }
      });
    } else {
      res.status(400).json(result);
    }
  });
  
  /**
   * GET /api/character
   * Get character data for logged-in account
   */
  app.get('/api/character', async (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }
    
    const session = await database.validateSession(token);
    if (!session) {
      return res.status(401).json({ success: false, error: 'Invalid session' });
    }
    
    const character = await database.getCharacter(session.accountId);
    
    if (character) {
      res.json({
        success: true,
        character: {
          name: character.name,
          level: character.level,
          experience: character.experience,
          zoneId: character.zone_id,
          x: character.x,
          y: character.y,
          direction: character.direction,
          hp: character.hp,
          maxHp: character.max_hp,
          stamina: character.stamina,
          maxStamina: character.max_stamina,
          gold: character.gold,
          statPoints: character.stat_points,
          stats: {
            str: character.str,
            vit: character.vit,
            agi: character.agi,
            dex: character.dex,
            def: character.def,
            int: character.int
          }
        }
      });
    } else {
      res.status(404).json({ success: false, error: 'No character found' });
    }
  });
  
  console.log('[Auth] Routes initialized');
}

module.exports = { setupRoutes };
