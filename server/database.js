/**
 * UMBRA ONLINE - Database Layer
 * SQLite database for accounts and characters
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

const DB_PATH = path.join(__dirname, '../data/umbra.db');
const SALT_ROUNDS = 10;

let db = null;

/**
 * Initialize database connection and create tables
 */
function init() {
  return new Promise((resolve, reject) => {
    db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        console.error('[Database] Failed to connect:', err);
        reject(err);
        return;
      }
      
      console.log('[Database] Connected to SQLite database');
      createTables()
        .then(resolve)
        .catch(reject);
    });
  });
}

/**
 * Create database tables if they don't exist
 */
function createTables() {
  return new Promise((resolve, reject) => {
    const accountsTable = `
      CREATE TABLE IF NOT EXISTS accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_login DATETIME,
        is_admin INTEGER DEFAULT 0,
        is_banned INTEGER DEFAULT 0
      )
    `;
    
    const charactersTable = `
      CREATE TABLE IF NOT EXISTS characters (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id INTEGER UNIQUE NOT NULL,
        name TEXT UNIQUE NOT NULL,
        level INTEGER DEFAULT 1,
        experience INTEGER DEFAULT 0,
        zone_id TEXT DEFAULT 'town_01',
        x INTEGER DEFAULT 10,
        y INTEGER DEFAULT 7,
        direction TEXT DEFAULT 'down',
        hp INTEGER DEFAULT 50,
        max_hp INTEGER DEFAULT 50,
        stamina INTEGER DEFAULT 50,
        max_stamina INTEGER DEFAULT 50,
        gold INTEGER DEFAULT 100,
        stat_points INTEGER DEFAULT 0,
        skill_points INTEGER DEFAULT 0,
        str INTEGER DEFAULT 1,
        vit INTEGER DEFAULT 1,
        agi INTEGER DEFAULT 1,
        dex INTEGER DEFAULT 1,
        def INTEGER DEFAULT 1,
        int INTEGER DEFAULT 1,
        end INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_played DATETIME,
        FOREIGN KEY (account_id) REFERENCES accounts(id)
      )
    `;
    
    const sessionsTable = `
      CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id INTEGER NOT NULL,
        token TEXT UNIQUE NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME NOT NULL,
        FOREIGN KEY (account_id) REFERENCES accounts(id)
      )
    `;
    
    const inventoryTable = `
      CREATE TABLE IF NOT EXISTS inventory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id INTEGER NOT NULL,
        item_id TEXT NOT NULL,
        quantity INTEGER DEFAULT 1,
        slot_index INTEGER,
        FOREIGN KEY (account_id) REFERENCES accounts(id)
      )
    `;
    
    const equipmentTable = `
      CREATE TABLE IF NOT EXISTS equipment (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id INTEGER NOT NULL,
        slot TEXT NOT NULL,
        item_id TEXT NOT NULL,
        FOREIGN KEY (account_id) REFERENCES accounts(id),
        UNIQUE(account_id, slot)
      )
    `;
    
    const castlesTable = `
      CREATE TABLE IF NOT EXISTS castles (
        id TEXT PRIMARY KEY,
        owner_account_id INTEGER,
        owner_name TEXT,
        conquered_at DATETIME,
        last_payout_at DATETIME,
        total_gold_earned INTEGER DEFAULT 0,
        FOREIGN KEY (owner_account_id) REFERENCES accounts(id)
      )
    `;
    
    const trainingTable = `
      CREATE TABLE IF NOT EXISTS training_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id INTEGER UNIQUE NOT NULL,
        started_at DATETIME NOT NULL,
        dummy_id TEXT NOT NULL,
        zone_id TEXT NOT NULL,
        FOREIGN KEY (account_id) REFERENCES accounts(id)
      )
    `;

    const bossDefeatsTable = `
      CREATE TABLE IF NOT EXISTS boss_defeats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id INTEGER NOT NULL,
        boss_key TEXT NOT NULL,
        defeated_at INTEGER NOT NULL,
        FOREIGN KEY (account_id) REFERENCES accounts(id),
        UNIQUE(account_id, boss_key)
      )
    `;

    const marketListingsTable = `
      CREATE TABLE IF NOT EXISTS market_listings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        seller_account_id INTEGER NOT NULL,
        seller_name TEXT NOT NULL,
        item_id TEXT NOT NULL,
        price INTEGER NOT NULL,
        listed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (seller_account_id) REFERENCES accounts(id)
      )
    `;
    
    db.serialize(() => {
      db.run(accountsTable, (err) => {
        if (err) console.error('[Database] Error creating accounts table:', err);
      });
      db.run(charactersTable, (err) => {
        if (err) console.error('[Database] Error creating characters table:', err);
      });
      db.run(sessionsTable, (err) => {
        if (err) console.error('[Database] Error creating sessions table:', err);
      });
      db.run(inventoryTable, (err) => {
        if (err) console.error('[Database] Error creating inventory table:', err);
      });
      db.run(equipmentTable, (err) => {
        if (err) console.error('[Database] Error creating equipment table:', err);
      });
      db.run(castlesTable, (err) => {
        if (err) console.error('[Database] Error creating castles table:', err);
      });
      db.run(trainingTable, (err) => {
        if (err) console.error('[Database] Error creating training_sessions table:', err);
      });
      db.run(bossDefeatsTable, (err) => {
        if (err) console.error('[Database] Error creating boss_defeats table:', err);
      });
      db.run(marketListingsTable, (err) => {
        if (err) console.error('[Database] Error creating market_listings table:', err);
      });
      
      // Migrations for existing databases - add new columns if they don't exist
      db.run('ALTER TABLE characters ADD COLUMN skill_points INTEGER DEFAULT 0', () => {});
      db.run('ALTER TABLE characters ADD COLUMN end INTEGER DEFAULT 1', () => {});
      db.run('ALTER TABLE characters ADD COLUMN skills_data TEXT DEFAULT NULL', () => {});
      db.run('ALTER TABLE characters ADD COLUMN spawn_zone TEXT DEFAULT "town_01"', () => {});
      db.run('ALTER TABLE characters ADD COLUMN spawn_x INTEGER DEFAULT 10', () => {});
      db.run('ALTER TABLE characters ADD COLUMN spawn_y INTEGER DEFAULT 7', () => {});
      
      // Fix: Update default stats from 5 to 1 for level 1 characters with 0 stat points spent
      // This fixes characters created with old schema defaults
      db.run(`UPDATE characters SET str = 1, vit = 1, agi = 1, dex = 1, def = 1, int = 1 
              WHERE level = 1 AND stat_points = 0 AND experience = 0 
              AND str = 5 AND vit = 5 AND agi = 5 AND dex = 5 AND def = 5 AND int = 5`, 
        (err) => {
          if (!err) console.log('[Database] Fixed old default stats (5 -> 1) for new characters');
        });
      
      console.log('[Database] Tables initialized');
      resolve();
    });
  });
}

// ===================
// ACCOUNT FUNCTIONS
// ===================

/**
 * Create a new account
 */
async function createAccount(username, email, password) {
  // Validate inputs
  if (!username || username.length < 3 || username.length > 20) {
    return { success: false, error: 'Username must be 3-20 characters' };
  }
  if (!email || !email.includes('@')) {
    return { success: false, error: 'Invalid email address' };
  }
  if (!password || password.length < 6) {
    return { success: false, error: 'Password must be at least 6 characters' };
  }
  
  // Check for valid username (alphanumeric + underscore)
  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    return { success: false, error: 'Username can only contain letters, numbers, and underscores' };
  }
  
  try {
    // Hash password
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    
    return new Promise((resolve) => {
      db.run(
        'INSERT INTO accounts (username, email, password_hash) VALUES (?, ?, ?)',
        [username.toLowerCase(), email.toLowerCase(), passwordHash],
        function(err) {
          if (err) {
            if (err.message.includes('UNIQUE constraint failed: accounts.username')) {
              resolve({ success: false, error: 'Username already taken' });
            } else if (err.message.includes('UNIQUE constraint failed: accounts.email')) {
              resolve({ success: false, error: 'Email already registered' });
            } else {
              console.error('[Database] Create account error:', err);
              resolve({ success: false, error: 'Failed to create account' });
            }
            return;
          }
          
          console.log(`[Database] Account created: ${username} (ID: ${this.lastID})`);
          resolve({ success: true, accountId: this.lastID });
        }
      );
    });
  } catch (err) {
    console.error('[Database] Password hash error:', err);
    return { success: false, error: 'Failed to create account' };
  }
}

/**
 * Login to an account
 */
async function login(username, password) {
  return new Promise((resolve) => {
    db.get(
      'SELECT * FROM accounts WHERE username = ? OR email = ?',
      [username.toLowerCase(), username.toLowerCase()],
      async (err, account) => {
        if (err) {
          console.error('[Database] Login error:', err);
          resolve({ success: false, error: 'Login failed' });
          return;
        }
        
        if (!account) {
          resolve({ success: false, error: 'Invalid username or password' });
          return;
        }
        
        if (account.is_banned) {
          resolve({ success: false, error: 'Account is banned' });
          return;
        }
        
        // Verify password
        const validPassword = await bcrypt.compare(password, account.password_hash);
        if (!validPassword) {
          resolve({ success: false, error: 'Invalid username or password' });
          return;
        }
        
        // Update last login
        db.run('UPDATE accounts SET last_login = CURRENT_TIMESTAMP WHERE id = ?', [account.id]);
        
        // Create session token
        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
        
        db.run(
          'INSERT INTO sessions (account_id, token, expires_at) VALUES (?, ?, ?)',
          [account.id, token, expiresAt.toISOString()],
          (err) => {
            if (err) {
              console.error('[Database] Session creation error:', err);
              resolve({ success: false, error: 'Login failed' });
              return;
            }
            
            console.log(`[Database] Login successful: ${account.username}`);
            resolve({
              success: true,
              accountId: account.id,
              username: account.username,
              isAdmin: account.is_admin === 1,
              token: token
            });
          }
        );
      }
    );
  });
}

/**
 * Validate a session token
 */
function validateSession(token) {
  return new Promise((resolve) => {
    db.get(
      `SELECT s.*, a.username, a.is_admin 
       FROM sessions s 
       JOIN accounts a ON s.account_id = a.id 
       WHERE s.token = ? AND s.expires_at > datetime('now')`,
      [token],
      (err, session) => {
        if (err || !session) {
          resolve(null);
          return;
        }
        
        resolve({
          accountId: session.account_id,
          username: session.username,
          isAdmin: session.is_admin === 1
        });
      }
    );
  });
}

/**
 * Delete a session (logout)
 */
function logout(token) {
  return new Promise((resolve) => {
    db.run('DELETE FROM sessions WHERE token = ?', [token], (err) => {
      resolve(!err);
    });
  });
}

/**
 * Clean up expired sessions
 */
function cleanupSessions() {
  db.run("DELETE FROM sessions WHERE expires_at < datetime('now')", (err) => {
    if (!err) console.log('[Database] Cleaned up expired sessions');
  });
}

// ===================
// CHARACTER FUNCTIONS
// ===================

/**
 * Create a character for an account
 */
/**
 * Starting cities configuration
 * Players are randomly assigned to one of these cities on character creation
 */
const STARTING_CITIES = [
  { zoneId: 'B3', x: 10, y: 7, name: 'Plains Starting City' },   // Western Plains
  { zoneId: 'Q4', x: 10, y: 7, name: 'Caves Starting City' },    // Eastern Jungle/Caves
  { zoneId: 'I12', x: 20, y: 15, name: 'Seaside Haven' }         // Southern Beach
];

function createCharacter(accountId, name) {
  // Validate name
  if (!name || name.length < 2 || name.length > 16) {
    return Promise.resolve({ success: false, error: 'Character name must be 2-16 characters' });
  }
  if (!/^[a-zA-Z]+$/.test(name)) {
    return Promise.resolve({ success: false, error: 'Character name can only contain letters' });
  }
  
  return new Promise((resolve) => {
    // Check if account already has a character
    db.get('SELECT id FROM characters WHERE account_id = ?', [accountId], (err, existing) => {
      if (existing) {
        resolve({ success: false, error: 'Account already has a character' });
        return;
      }
      
      // Randomly select a starting city
      const startingCity = STARTING_CITIES[Math.floor(Math.random() * STARTING_CITIES.length)];
      
      // Explicitly set all starting stats to ensure correct values
      const insertSql = `INSERT INTO characters (account_id, name, level, experience, zone_id, x, y, hp, max_hp, stamina, max_stamina, 
         gold, stat_points, skill_points, str, vit, agi, dex, def, int, end) 
         VALUES (?, ?, 1, 0, ?, ?, ?, 50, 50, 50, 50, 100, 0, 0, 1, 1, 1, 1, 1, 1, 1)`;
      console.log('[Database] Creating character with SQL:', insertSql);
      console.log('[Database] Params:', [accountId, name, startingCity.zoneId, startingCity.x, startingCity.y]);
      console.log(`[Database] Assigning new character to starting city: ${startingCity.name} (${startingCity.zoneId})`);
      
      db.run(
        insertSql,
        [accountId, name, startingCity.zoneId, startingCity.x, startingCity.y],
        function(err) {
          if (err) {
            if (err.message.includes('UNIQUE constraint failed: characters.name')) {
              resolve({ success: false, error: 'Character name already taken' });
            } else {
              console.error('[Database] Create character error:', err);
              resolve({ success: false, error: 'Failed to create character' });
            }
            return;
          }
          
          console.log(`[Database] Character created: ${name} (ID: ${this.lastID}) in ${startingCity.name}`);
          
          // Give new player a wooden sword as starting equipment
          addToInventory(accountId, 'wooden_sword', 1).then((success) => {
            if (success) {
              console.log(`[Database] Gave starting wooden sword to ${name}`);
            } else {
              console.error(`[Database] Failed to give starting wooden sword to ${name}`);
            }
            resolve({ success: true, characterId: this.lastID, startingCity: startingCity.name });
          });
        }
      );
    });
  });
}

/**
 * Get character for an account
 */
function getCharacter(accountId) {
  return new Promise((resolve) => {
    db.get(
      'SELECT * FROM characters WHERE account_id = ?',
      [accountId],
      (err, character) => {
        if (err) {
          console.error('[Database] Get character error:', err);
          resolve(null);
          return;
        }
        if (character) {
          console.log('[Database] Retrieved character stats:', {
            str: character.str,
            vit: character.vit,
            agi: character.agi,
            dex: character.dex,
            def: character.def,
            int: character.int,
            end: character.end
          });
        }
        resolve(character || null);
      }
    );
  });
}

/**
 * Update character position
 */
function updateCharacterPosition(accountId, zoneId, x, y, direction) {
  return new Promise((resolve) => {
    db.run(
      'UPDATE characters SET zone_id = ?, x = ?, y = ?, direction = ?, last_played = CURRENT_TIMESTAMP WHERE account_id = ?',
      [zoneId, x, y, direction, accountId],
      (err) => resolve(!err)
    );
  });
}

/**
 * Update character stats
 */
function updateCharacterStats(accountId, stats) {
  const fields = [];
  const values = [];
  
  const allowedFields = ['level', 'experience', 'hp', 'max_hp', 'stamina', 'max_stamina', 
                         'gold', 'stat_points', 'skill_points', 'str', 'vit', 'agi', 'dex', 'def', 'int', 'end'];
  
  for (const [key, value] of Object.entries(stats)) {
    if (allowedFields.includes(key)) {
      fields.push(`${key} = ?`);
      values.push(value);
    }
  }
  
  if (fields.length === 0) return Promise.resolve(false);
  
  values.push(accountId);
  
  return new Promise((resolve) => {
    db.run(
      `UPDATE characters SET ${fields.join(', ')}, last_played = CURRENT_TIMESTAMP WHERE account_id = ?`,
      values,
      (err) => resolve(!err)
    );
  });
}

/**
 * Update character HP only (for zone danger damage)
 * @param {number} accountId - Account ID
 * @param {number} hp - New HP value
 */
function updateCharacterHp(accountId, hp) {
  return new Promise((resolve) => {
    db.run(
      'UPDATE characters SET hp = ?, last_played = CURRENT_TIMESTAMP WHERE account_id = ?',
      [hp, accountId],
      (err) => resolve(!err)
    );
  });
}

/**
 * Get character by name (for ghost display)
 */
function getCharacterByName(name) {
  return new Promise((resolve) => {
    db.get(
      'SELECT name, level, zone_id, x, y, direction FROM characters WHERE name = ?',
      [name],
      (err, character) => resolve(err ? null : character)
    );
  });
}

/**
 * Update character skills data
 * @param {number} accountId - Account ID
 * @param {Object} skillsData - Skills data { learned: {skillId: level}, equipped: [skillId, ...] }
 */
function updateCharacterSkills(accountId, skillsData) {
  return new Promise((resolve) => {
    const skillsJson = JSON.stringify(skillsData);
    db.run(
      'UPDATE characters SET skills_data = ?, last_played = CURRENT_TIMESTAMP WHERE account_id = ?',
      [skillsJson, accountId],
      (err) => resolve(!err)
    );
  });
}

/**
 * Get character skills data
 * @param {number} accountId - Account ID
 * @returns {Object} - Skills data or default empty object
 */
function getCharacterSkills(accountId) {
  return new Promise((resolve) => {
    db.get(
      'SELECT skills_data FROM characters WHERE account_id = ?',
      [accountId],
      (err, row) => {
        if (err || !row || !row.skills_data) {
          resolve({ learned: {}, equipped: [null, null, null, null, null] });
          return;
        }
        try {
          const data = JSON.parse(row.skills_data);
          // Ensure equipped array has 5 slots
          if (!data.equipped) {
            data.equipped = [null, null, null, null, null];
          }
          while (data.equipped.length < 5) {
            data.equipped.push(null);
          }
          if (!data.learned) {
            data.learned = {};
          }
          resolve(data);
        } catch (e) {
          resolve({ learned: {}, equipped: [null, null, null, null, null] });
        }
      }
    );
  });
}

/**
 * Reset character skills to default (empty)
 * @param {number} accountId 
 * @returns {Promise<boolean>}
 */
function resetCharacterSkills(accountId) {
  return new Promise((resolve) => {
    const emptySkills = JSON.stringify({ learned: {}, equipped: [null, null, null, null] });
    db.run(
      'UPDATE characters SET skills_data = ?, last_played = CURRENT_TIMESTAMP WHERE account_id = ?',
      [emptySkills, accountId],
      (err) => resolve(!err)
    );
  });
}

// ===================
// INVENTORY FUNCTIONS
// ===================

/**
 * Get player's inventory
 * @param {number} accountId
 * @returns {Promise<Array>}
 */
function getInventory(accountId) {
  return new Promise((resolve) => {
    db.all(
      'SELECT item_id, quantity, slot_index FROM inventory WHERE account_id = ? ORDER BY slot_index',
      [accountId],
      (err, rows) => {
        if (err) {
          console.error('[Database] Error getting inventory:', err);
          resolve([]);
          return;
        }
        resolve(rows || []);
      }
    );
  });
}

/**
 * Get player's equipped items
 * @param {number} accountId
 * @returns {Promise<Object>}
 */
function getEquipment(accountId) {
  return new Promise((resolve) => {
    db.all(
      'SELECT slot, item_id FROM equipment WHERE account_id = ?',
      [accountId],
      (err, rows) => {
        if (err) {
          console.error('[Database] Error getting equipment:', err);
          resolve({});
          return;
        }
        const equipment = {};
        if (rows) {
          rows.forEach(row => {
            equipment[row.slot] = row.item_id;
          });
        }
        resolve(equipment);
      }
    );
  });
}

/**
 * Add item to inventory (stacks if item exists)
 * @param {number} accountId
 * @param {string} itemId
 * @param {number} quantity
 * @returns {Promise<boolean>}
 */
function addToInventory(accountId, itemId, quantity = 1) {
  return new Promise((resolve) => {
    // Check if item already exists in inventory
    db.get(
      'SELECT id, quantity FROM inventory WHERE account_id = ? AND item_id = ?',
      [accountId, itemId],
      (err, row) => {
        if (err) {
          console.error('[Database] Error checking inventory:', err);
          resolve(false);
          return;
        }
        
        if (row) {
          // Update quantity
          db.run(
            'UPDATE inventory SET quantity = quantity + ? WHERE id = ?',
            [quantity, row.id],
            (err) => resolve(!err)
          );
        } else {
          // Find next available slot
          db.get(
            'SELECT COALESCE(MAX(slot_index), -1) + 1 as next_slot FROM inventory WHERE account_id = ?',
            [accountId],
            (err, slotRow) => {
              if (err) {
                resolve(false);
                return;
              }
              const slotIndex = slotRow ? slotRow.next_slot : 0;
              db.run(
                'INSERT INTO inventory (account_id, item_id, quantity, slot_index) VALUES (?, ?, ?, ?)',
                [accountId, itemId, quantity, slotIndex],
                (err) => resolve(!err)
              );
            }
          );
        }
      }
    );
  });
}

/**
 * Check if player has space for an item (either existing stack or free slot)
 * @param {number} accountId
 * @param {string} itemId
 * @param {number} inventorySize - Current player's inventory size (default 8, max 36)
 * @returns {Promise<{hasSpace: boolean, existingStack: boolean}>}
 */
function canAddToInventory(accountId, itemId, inventorySize = 8) {
  return new Promise((resolve) => {
    // Check if item already exists in inventory (can stack)
    db.get(
      'SELECT id FROM inventory WHERE account_id = ? AND item_id = ?',
      [accountId, itemId],
      (err, row) => {
        if (err) {
          console.error('[Database] Error checking inventory:', err);
          resolve({ hasSpace: false, existingStack: false });
          return;
        }
        
        if (row) {
          // Item exists, can stack
          resolve({ hasSpace: true, existingStack: true });
        } else {
          // Check if there's a free slot
          db.get(
            'SELECT COUNT(*) as count FROM inventory WHERE account_id = ?',
            [accountId],
            (err, countRow) => {
              if (err) {
                resolve({ hasSpace: false, existingStack: false });
                return;
              }
              const usedSlots = countRow ? countRow.count : 0;
              resolve({ 
                hasSpace: usedSlots < inventorySize, 
                existingStack: false 
              });
            }
          );
        }
      }
    );
  });
}

/**
 * Remove item from inventory
 * @param {number} accountId
 * @param {string} itemId
 * @param {number} quantity
 * @returns {Promise<boolean>}
 */
function removeFromInventory(accountId, itemId, quantity = 1) {
  return new Promise((resolve) => {
    db.get(
      'SELECT id, quantity FROM inventory WHERE account_id = ? AND item_id = ?',
      [accountId, itemId],
      (err, row) => {
        if (err || !row) {
          resolve(false);
          return;
        }
        
        if (row.quantity <= quantity) {
          // Remove entire stack
          db.run(
            'DELETE FROM inventory WHERE id = ?',
            [row.id],
            (err) => resolve(!err)
          );
        } else {
          // Reduce quantity
          db.run(
            'UPDATE inventory SET quantity = quantity - ? WHERE id = ?',
            [quantity, row.id],
            (err) => resolve(!err)
          );
        }
      }
    );
  });
}

/**
 * Equip an item
 * @param {number} accountId
 * @param {string} slot
 * @param {string} itemId
 * @returns {Promise<boolean>}
 */
function equipItem(accountId, slot, itemId) {
  return new Promise((resolve) => {
    db.run(
      'INSERT OR REPLACE INTO equipment (account_id, slot, item_id) VALUES (?, ?, ?)',
      [accountId, slot, itemId],
      (err) => resolve(!err)
    );
  });
}

/**
 * Unequip an item
 * @param {number} accountId
 * @param {string} slot
 * @returns {Promise<boolean>}
 */
function unequipItem(accountId, slot) {
  return new Promise((resolve) => {
    db.run(
      'DELETE FROM equipment WHERE account_id = ? AND slot = ?',
      [accountId, slot],
      (err) => resolve(!err)
    );
  });
}

/**
 * Update inventory slot index
 * @param {number} accountId
 * @param {string} itemId
 * @param {number} newSlotIndex
 * @returns {Promise<boolean>}
 */
function updateInventorySlot(accountId, itemId, newSlotIndex) {
  return new Promise((resolve) => {
    db.run(
      'UPDATE inventory SET slot_index = ? WHERE account_id = ? AND item_id = ?',
      [newSlotIndex, accountId, itemId],
      (err) => resolve(!err)
    );
  });
}

/**
 * Move/swap inventory items between slots
 * @param {number} accountId
 * @param {number} fromSlot
 * @param {number} toSlot
 * @returns {Promise<boolean>}
 */
function moveInventoryItem(accountId, fromSlot, toSlot) {
  return new Promise((resolve) => {
    // Get items at both slots
    db.all(
      'SELECT id, item_id, quantity, slot_index FROM inventory WHERE account_id = ? AND slot_index IN (?, ?)',
      [accountId, fromSlot, toSlot],
      (err, rows) => {
        if (err) {
          console.error('[Database] Error getting inventory slots:', err);
          resolve(false);
          return;
        }
        
        const fromItem = rows?.find(r => r.slot_index === fromSlot);
        const toItem = rows?.find(r => r.slot_index === toSlot);
        
        if (!fromItem) {
          // No item in the source slot
          resolve(false);
          return;
        }
        
        db.serialize(() => {
          if (toItem) {
            // Swap: update both items
            // Use a temporary slot (-1) to avoid unique constraint issues
            db.run('UPDATE inventory SET slot_index = -1 WHERE id = ?', [fromItem.id]);
            db.run('UPDATE inventory SET slot_index = ? WHERE id = ?', [fromSlot, toItem.id]);
            db.run('UPDATE inventory SET slot_index = ? WHERE id = ?', [toSlot, fromItem.id], (err) => {
              resolve(!err);
            });
          } else {
            // Move to empty slot
            db.run(
              'UPDATE inventory SET slot_index = ? WHERE id = ?',
              [toSlot, fromItem.id],
              (err) => resolve(!err)
            );
          }
        });
      }
    );
  });
}

/**
 * Clear entire inventory (for testing)
 * @param {number} accountId
 * @returns {Promise<boolean>}
 */
function clearInventory(accountId) {
  return new Promise((resolve) => {
    db.run(
      'DELETE FROM inventory WHERE account_id = ?',
      [accountId],
      (err) => resolve(!err)
    );
  });
}

/**
 * Clear all equipped items
 * @param {number} accountId
 * @returns {Promise<boolean>}
 */
function clearEquipment(accountId) {
  return new Promise((resolve) => {
    db.run(
      'DELETE FROM equipment WHERE account_id = ?',
      [accountId],
      (err) => resolve(!err)
    );
  });
}

/**
 * Update character spawn point
 */
function updateSpawnPoint(accountId, zoneId, x, y) {
  return new Promise((resolve) => {
    db.run(
      'UPDATE characters SET spawn_zone = ?, spawn_x = ?, spawn_y = ? WHERE account_id = ?',
      [zoneId, x, y, accountId],
      (err) => {
        if (err) {
          console.error('[Database] Update spawn point error:', err);
          resolve(false);
        } else {
          console.log(`[Database] Spawn point updated for account ${accountId}: ${zoneId} (${x}, ${y})`);
          resolve(true);
        }
      }
    );
  });
}

/**
 * Get character spawn point
 */
function getSpawnPoint(accountId) {
  return new Promise((resolve) => {
    db.get(
      'SELECT spawn_zone, spawn_x, spawn_y FROM characters WHERE account_id = ?',
      [accountId],
      (err, row) => {
        if (err || !row) {
          // Return default spawn point
          resolve({ zone: 'town_01', x: 10, y: 7 });
        } else {
          resolve({
            zone: row.spawn_zone || 'town_01',
            x: row.spawn_x || 10,
            y: row.spawn_y || 7
          });
        }
      }
    );
  });
}

// ===================
// CASTLE FUNCTIONS
// ===================

/**
 * Get castle ownership info
 * @param {string} castleId - The castle ID
 */
function getCastle(castleId) {
  return new Promise((resolve) => {
    db.get(
      'SELECT * FROM castles WHERE id = ?',
      [castleId],
      (err, row) => {
        if (err) {
          console.error('[Database] Get castle error:', err);
          resolve(null);
        } else {
          resolve(row || null);
        }
      }
    );
  });
}

/**
 * Get owner character data for a castle
 * @param {number} accountId - The owner's account ID
 */
function getCastleOwnerData(accountId) {
  return new Promise((resolve) => {
    db.get(
      'SELECT * FROM characters WHERE account_id = ?',
      [accountId],
      async (err, character) => {
        if (err || !character) {
          resolve(null);
          return;
        }
        
        // Get equipment
        const equipment = await getEquipment(accountId);
        
        // Get skills
        const skills = await getCharacterSkills(accountId);
        
        resolve({
          character,
          equipment,
          skills
        });
      }
    );
  });
}

/**
 * Conquer a castle (set new owner)
 * IMPORTANT: A player can only own ONE castle at a time.
 * When conquering a new castle, any previously owned castle is automatically released.
 * @param {string} castleId - The castle ID
 * @param {number} accountId - The new owner's account ID
 * @param {string} ownerName - The new owner's character name
 * @returns {Promise<{success: boolean, previousCastleId: string|null}>}
 */
function conquerCastle(castleId, accountId, ownerName) {
  return new Promise((resolve) => {
    const now = new Date().toISOString();
    // Set last_payout_at to 1 hour ago so the first payout is eligible on the next hourly cycle
    // The payout check looks for castles where last_payout_at <= (now - 1 hour)
    // This ensures owners get their first payout within ~1 hour of conquest
    const lastPayoutAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    
    // Use serialize to ensure atomic operation: release old castle, then claim new one
    db.serialize(() => {
      let previousCastleId = null;
      
      // First, find and release any castle the player currently owns (one castle per player rule)
      db.get(
        `SELECT id FROM castles WHERE owner_account_id = ? AND id != ?`,
        [accountId, castleId],
        (err, existingCastle) => {
          if (err) {
            console.error('[Database] Error checking existing castle ownership:', err);
          } else if (existingCastle) {
            previousCastleId = existingCastle.id;
            console.log(`[Database] Player ${ownerName} releasing castle ${previousCastleId} (one castle per player rule)`);
            
            // Release the old castle (set owner to null)
            db.run(
              `UPDATE castles SET owner_account_id = NULL, owner_name = NULL WHERE id = ?`,
              [previousCastleId],
              (releaseErr) => {
                if (releaseErr) {
                  console.error('[Database] Error releasing previous castle:', releaseErr);
                }
              }
            );
          }
        }
      );
      
      // Then claim the new castle
      db.run(
        `INSERT INTO castles (id, owner_account_id, owner_name, conquered_at, last_payout_at, total_gold_earned)
         VALUES (?, ?, ?, ?, ?, 0)
         ON CONFLICT(id) DO UPDATE SET 
           owner_account_id = excluded.owner_account_id,
           owner_name = excluded.owner_name,
           conquered_at = excluded.conquered_at,
           last_payout_at = excluded.last_payout_at,
           total_gold_earned = 0`,
        [castleId, accountId, ownerName, now, lastPayoutAt],
        function(err) {
          if (err) {
            console.error('[Database] Conquer castle error:', err);
            resolve({ success: false, previousCastleId: null });
          } else {
            console.log(`[Database] Castle ${castleId} conquered by ${ownerName}`);
            resolve({ success: true, previousCastleId });
          }
        }
      );
    });
  });
}

/**
 * Process castle payouts (called every hour)
 * Returns list of payouts to notify players
 */
function processCastlePayouts() {
  return new Promise((resolve) => {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const now = new Date().toISOString();
    const goldPerHour = 10;
    
    console.log(`[Castle Payout] Running payout check at ${now}`);
    console.log(`[Castle Payout] Looking for castles with last_payout_at <= ${oneHourAgo}`);
    
    // First, let's see ALL castles for debugging
    db.all(`SELECT * FROM castles`, [], (debugErr, allCastles) => {
      if (allCastles && allCastles.length > 0) {
        console.log(`[Castle Payout] All castles in database:`, allCastles.map(c => ({
          id: c.id,
          owner: c.owner_name,
          last_payout: c.last_payout_at,
          conquered: c.conquered_at
        })));
      } else {
        console.log(`[Castle Payout] No castles found in database`);
      }
    });
    
    // Get all castles that are due for payout
    db.all(
      `SELECT c.*, ch.gold as owner_gold 
       FROM castles c 
       LEFT JOIN characters ch ON c.owner_account_id = ch.account_id
       WHERE c.owner_account_id IS NOT NULL 
       AND c.last_payout_at <= ?`,
      [oneHourAgo],
      async (err, castles) => {
        if (err) {
          console.error('[Database] Get castle payouts error:', err);
          resolve([]);
          return;
        }
        
        console.log(`[Castle Payout] Found ${castles ? castles.length : 0} castles due for payout`);
        
        const payouts = [];
        
        if (!castles || castles.length === 0) {
          resolve([]);
          return;
        }
        
        for (const castle of castles) {
          // Calculate hours since last payout
          const lastPayout = new Date(castle.last_payout_at);
          const hoursPassed = Math.floor((Date.now() - lastPayout.getTime()) / (60 * 60 * 1000));
          
          console.log(`[Castle Payout] Castle ${castle.id}: last_payout=${castle.last_payout_at}, hoursPassed=${hoursPassed}`);
          
          if (hoursPassed >= 1) {
            const goldEarned = goldPerHour * hoursPassed;
            
            // Update castle and character gold
            await new Promise((res) => {
              db.run(
                `UPDATE castles SET last_payout_at = ?, total_gold_earned = total_gold_earned + ? WHERE id = ?`,
                [now, goldEarned, castle.id],
                () => res()
              );
            });
            
            await new Promise((res) => {
              db.run(
                `UPDATE characters SET gold = gold + ? WHERE account_id = ?`,
                [goldEarned, castle.owner_account_id],
                () => res()
              );
            });
            
            payouts.push({
              castleId: castle.id,
              accountId: castle.owner_account_id,
              ownerName: castle.owner_name,
              goldEarned,
              hoursPassed
            });
            
            console.log(`[Database] Castle ${castle.id} payout: ${goldEarned} gold to ${castle.owner_name}`);
          }
        }
        
        resolve(payouts);
      }
    );
  });
}

/**
 * Get all castles owned by an account
 * @param {number} accountId - The account ID
 */
function getCastlesByOwner(accountId) {
  return new Promise((resolve) => {
    db.all(
      'SELECT * FROM castles WHERE owner_account_id = ?',
      [accountId],
      (err, rows) => {
        if (err) {
          console.error('[Database] Get castles by owner error:', err);
          resolve([]);
        } else {
          resolve(rows || []);
        }
      }
    );
  });
}

// ===================
// TRAINING FUNCTIONS
// ===================

/**
 * Start a training session
 * @param {number} accountId - The account ID
 * @param {string} dummyId - The training dummy ID
 * @param {string} zoneId - The zone ID where training started
 */
function startTrainingSession(accountId, dummyId, zoneId) {
  return new Promise((resolve) => {
    const now = new Date().toISOString();
    db.run(
      `INSERT OR REPLACE INTO training_sessions (account_id, started_at, dummy_id, zone_id) 
       VALUES (?, ?, ?, ?)`,
      [accountId, now, dummyId, zoneId],
      function(err) {
        if (err) {
          console.error('[Database] Start training session error:', err);
          resolve({ success: false, error: err.message });
        } else {
          console.log(`[Database] Training session started for account ${accountId}`);
          resolve({ success: true, startedAt: now });
        }
      }
    );
  });
}

/**
 * Get active training session for an account
 * @param {number} accountId - The account ID
 */
function getTrainingSession(accountId) {
  return new Promise((resolve) => {
    db.get(
      'SELECT * FROM training_sessions WHERE account_id = ?',
      [accountId],
      (err, row) => {
        if (err) {
          console.error('[Database] Get training session error:', err);
          resolve(null);
        } else {
          resolve(row || null);
        }
      }
    );
  });
}

/**
 * End a training session and return the elapsed time
 * @param {number} accountId - The account ID
 */
function endTrainingSession(accountId) {
  return new Promise((resolve) => {
    db.get(
      'SELECT * FROM training_sessions WHERE account_id = ?',
      [accountId],
      (err, row) => {
        if (err || !row) {
          resolve({ success: false, session: null });
          return;
        }
        
        // Delete the session
        db.run(
          'DELETE FROM training_sessions WHERE account_id = ?',
          [accountId],
          (deleteErr) => {
            if (deleteErr) {
              console.error('[Database] End training session error:', deleteErr);
              resolve({ success: false, session: null });
            } else {
              console.log(`[Database] Training session ended for account ${accountId}`);
              resolve({ success: true, session: row });
            }
          }
        );
      }
    );
  });
}

// ===================
// BOSS DEFEAT FUNCTIONS
// ===================

/**
 * Record a boss defeat for a player
 * Uses REPLACE to upsert (update if exists)
 */
function recordBossDefeat(accountId, bossKey) {
  return new Promise((resolve, reject) => {
    const now = Date.now();
    db.run(
      `INSERT OR REPLACE INTO boss_defeats (account_id, boss_key, defeated_at) VALUES (?, ?, ?)`,
      [accountId, bossKey, now],
      function(err) {
        if (err) {
          console.error('[Database] Error recording boss defeat:', err);
          reject(err);
        } else {
          resolve(now);
        }
      }
    );
  });
}

/**
 * Get all active boss cooldowns for a player (defeats within the cooldown window)
 * @param {number} accountId
 * @param {number} cooldownMs - Cooldown duration in ms
 * @returns {Promise<Object>} Map of bossKey -> defeatTime
 */
function getBossDefeats(accountId, cooldownMs) {
  return new Promise((resolve, reject) => {
    const cutoff = Date.now() - cooldownMs;
    db.all(
      `SELECT boss_key, defeated_at FROM boss_defeats WHERE account_id = ? AND defeated_at > ?`,
      [accountId, cutoff],
      (err, rows) => {
        if (err) {
          console.error('[Database] Error getting boss defeats:', err);
          reject(err);
        } else {
          const defeats = {};
          (rows || []).forEach(row => {
            defeats[row.boss_key] = row.defeated_at;
          });
          resolve(defeats);
        }
      }
    );
  });
}

/**
 * Clean up expired boss defeats (older than cooldown)
 * @param {number} cooldownMs
 */
function cleanupBossDefeats(cooldownMs) {
  const cutoff = Date.now() - cooldownMs;
  db.run(
    `DELETE FROM boss_defeats WHERE defeated_at < ?`,
    [cutoff],
    (err) => {
      if (err) {
        console.error('[Database] Error cleaning up boss defeats:', err);
      }
    }
  );
}

// Periodic cleanup of expired sessions
setInterval(cleanupSessions, 60 * 60 * 1000);

// ===================
// MARKET FUNCTIONS
// ===================

/**
 * Get the number of active listings for a player
 */
function getMarketListingCount(accountId) {
  return new Promise((resolve, reject) => {
    db.get(
      'SELECT COUNT(*) as count FROM market_listings WHERE seller_account_id = ?',
      [accountId],
      (err, row) => {
        if (err) {
          console.error('[Database] Error getting market listing count:', err);
          reject(err);
        } else {
          resolve(row ? row.count : 0);
        }
      }
    );
  });
}

/**
 * Create a new market listing
 */
function createMarketListing(accountId, sellerName, itemId, price) {
  return new Promise((resolve, reject) => {
    db.run(
      'INSERT INTO market_listings (seller_account_id, seller_name, item_id, price) VALUES (?, ?, ?, ?)',
      [accountId, sellerName, itemId, price],
      function(err) {
        if (err) {
          console.error('[Database] Error creating market listing:', err);
          reject(err);
        } else {
          resolve(this.lastID);
        }
      }
    );
  });
}

/**
 * Get all market listings (newest first), optionally filtered by search term
 */
function getMarketListings(searchTerm = null, limit = 50) {
  return new Promise((resolve, reject) => {
    let query = 'SELECT * FROM market_listings ORDER BY listed_at DESC LIMIT ?';
    let params = [limit];
    
    if (searchTerm) {
      // We'll filter by item name on the server side after fetching,
      // since item names are in JSON files, not in the DB.
      // For now get all and filter in the handler.
      query = 'SELECT * FROM market_listings ORDER BY listed_at DESC';
      params = [];
    }
    
    db.all(query, params, (err, rows) => {
      if (err) {
        console.error('[Database] Error getting market listings:', err);
        reject(err);
      } else {
        resolve(rows || []);
      }
    });
  });
}

/**
 * Get a player's own market listings
 */
function getMyMarketListings(accountId) {
  return new Promise((resolve, reject) => {
    db.all(
      'SELECT * FROM market_listings WHERE seller_account_id = ? ORDER BY listed_at DESC',
      [accountId],
      (err, rows) => {
        if (err) {
          console.error('[Database] Error getting player market listings:', err);
          reject(err);
        } else {
          resolve(rows || []);
        }
      }
    );
  });
}

/**
 * Get a single market listing by ID
 */
function getMarketListing(listingId) {
  return new Promise((resolve, reject) => {
    db.get(
      'SELECT * FROM market_listings WHERE id = ?',
      [listingId],
      (err, row) => {
        if (err) {
          console.error('[Database] Error getting market listing:', err);
          reject(err);
        } else {
          resolve(row || null);
        }
      }
    );
  });
}

/**
 * Delete a market listing (after purchase or cancellation)
 */
function deleteMarketListing(listingId) {
  return new Promise((resolve, reject) => {
    db.run(
      'DELETE FROM market_listings WHERE id = ?',
      [listingId],
      function(err) {
        if (err) {
          console.error('[Database] Error deleting market listing:', err);
          reject(err);
        } else {
          resolve(this.changes > 0);
        }
      }
    );
  });
}

/**
 * Credit gold to a player (even if offline) - used for market sales
 */
function creditGold(accountId, amount) {
  return new Promise((resolve, reject) => {
    db.run(
      'UPDATE characters SET gold = gold + ? WHERE account_id = ?',
      [amount, accountId],
      function(err) {
        if (err) {
          console.error('[Database] Error crediting gold:', err);
          reject(err);
        } else {
          resolve(this.changes > 0);
        }
      }
    );
  });
}

module.exports = {
  init,
  createAccount,
  login,
  validateSession,
  logout,
  createCharacter,
  getCharacter,
  updateCharacterPosition,
  updateCharacterStats,
  updateCharacterHp,
  getCharacterByName,
  updateCharacterSkills,
  getCharacterSkills,
  resetCharacterSkills,
  updateSpawnPoint,
  getSpawnPoint,
  // Inventory functions
  getInventory,
  getEquipment,
  addToInventory,
  canAddToInventory,
  removeFromInventory,
  equipItem,
  unequipItem,
  updateInventorySlot,
  moveInventoryItem,
  clearInventory,
  clearEquipment,
  // Castle functions
  getCastle,
  getCastleOwnerData,
  conquerCastle,
  processCastlePayouts,
  getCastlesByOwner,
  // Training functions
  startTrainingSession,
  getTrainingSession,
  endTrainingSession,
  // Boss defeat functions
  recordBossDefeat,
  getBossDefeats,
  cleanupBossDefeats,
  // Market functions
  getMarketListingCount,
  createMarketListing,
  getMarketListings,
  getMyMarketListings,
  getMarketListing,
  deleteMarketListing,
  creditGold
};
