/**
 * UMBRA ONLINE - Skill Manager
 * Handles skill definitions, loading, and calculations
 */

const fs = require('fs');
const path = require('path');

// Skill definitions loaded from JSON files
const skillTrees = new Map();
const skillsById = new Map();

/**
 * Load all skill tree definitions from data/skills directory
 */
function loadSkills() {
  const skillsDir = path.join(__dirname, '../data/skills');
  
  if (!fs.existsSync(skillsDir)) {
    console.warn('[Skills] No skills directory found at', skillsDir);
    return;
  }
  
  const files = fs.readdirSync(skillsDir).filter(f => f.endsWith('.json'));
  
  for (const file of files) {
    try {
      const filePath = path.join(skillsDir, file);
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      
      if (data.tree && data.skills) {
        skillTrees.set(data.tree.id, data);
        
        // Index skills by ID for quick lookup
        for (const skill of data.skills) {
          skill.treeId = data.tree.id;
          skillsById.set(skill.id, skill);
        }
        
        console.log(`[Skills] Loaded ${data.skills.length} skills from ${data.tree.name} tree`);
      }
    } catch (err) {
      console.error(`[Skills] Error loading ${file}:`, err.message);
    }
  }
  
  console.log(`[Skills] Total: ${skillsById.size} skills across ${skillTrees.size} trees`);
}

/**
 * Get a skill definition by ID
 * @param {number|string} skillId - The skill ID
 * @returns {Object|null} - Skill definition or null
 */
function getSkill(skillId) {
  // Handle both number and string IDs
  const numId = parseInt(skillId);
  return skillsById.get(numId) || skillsById.get(skillId) || null;
}

/**
 * Get all skills in a tree
 * @param {string} treeId - The tree ID (e.g., 'swordsmanship')
 * @returns {Object|null} - Tree data with skills or null
 */
function getTree(treeId) {
  return skillTrees.get(treeId) || null;
}

/**
 * Get all skill trees
 * @returns {Array} - Array of tree data objects
 */
function getAllTrees() {
  return Array.from(skillTrees.values());
}

/**
 * Calculate the scaled value for a skill at a given level
 * @param {Object} skill - Skill definition
 * @param {number} level - Skill level (1-5)
 * @param {string} valueKey - Which value to calculate ('value1', 'value2', etc.)
 * @returns {number} - Calculated value
 */
function calculateSkillValue(skill, level, valueKey = 'value1') {
  if (!skill.scaling || !skill.scaling[valueKey]) {
    return 0;
  }
  
  const scaling = skill.scaling[valueKey];
  // Level 1 = base, Level 2 = base + perLevel, etc.
  return scaling.base + (scaling.perLevel * (level - 1));
}

/**
 * Get all active skills from a player's equipped skills
 * @param {Object} playerSkills - Player's skill data { learned: {skillId: level}, equipped: [skillId, ...] }
 * @returns {Array} - Array of { skill, level } for equipped active skills
 */
function getEquippedActiveSkills(playerSkills) {
  if (!playerSkills || !playerSkills.equipped) {
    console.log('[Skills] No playerSkills or equipped array');
    return [];
  }
  
  const activeSkills = [];
  
  console.log('[Skills] Checking equipped skills:', playerSkills.equipped);
  console.log('[Skills] Learned skills:', playerSkills.learned);
  
  for (const skillId of playerSkills.equipped) {
    if (skillId === null || skillId === undefined) continue;
    
    const skill = getSkill(skillId);
    console.log(`[Skills] Skill ${skillId}: found=${!!skill}, type=${skill?.type}`);
    if (!skill || skill.type !== 'active') continue;
    
    // Handle both string and number keys in learned object
    const level = playerSkills.learned[skillId] || playerSkills.learned[String(skillId)] || 0;
    console.log(`[Skills] Skill ${skillId} (${skill.name}) level: ${level}`);
    if (level <= 0) continue;
    
    activeSkills.push({ skill, level });
  }
  
  console.log(`[Skills] Returning ${activeSkills.length} active skills`);
  return activeSkills;
}

/**
 * Get all learned passive skills from a player
 * @param {Object} playerSkills - Player's skill data { learned: {skillId: level}, equipped: [skillId, ...] }
 * @returns {Array} - Array of { skill, level } for all learned passives
 */
function getLearnedPassiveSkills(playerSkills) {
  if (!playerSkills || !playerSkills.learned) {
    return [];
  }
  
  const passiveSkills = [];
  
  for (const [skillIdStr, level] of Object.entries(playerSkills.learned)) {
    const skillId = parseInt(skillIdStr);
    if (level <= 0) continue;
    
    const skill = getSkill(skillId);
    if (!skill || skill.type !== 'passive') continue;
    
    passiveSkills.push({ skill, level });
  }
  
  return passiveSkills;
}

/**
 * Calculate skill points available for a player level
 * @param {number} level - Player level
 * @returns {number} - Total skill points earned (1 per level up, starting at level 2)
 */
function calculateSkillPoints(level) {
  // Level 1 = 0 points, Level 2 = 1 point, Level 3 = 2 points, etc.
  return Math.max(0, level - 1);
}

/**
 * Calculate skill points spent by a player
 * @param {Object} playerSkills - Player's skill data
 * @returns {number} - Total points spent
 */
function calculateSpentPoints(playerSkills) {
  if (!playerSkills || !playerSkills.learned) {
    return 0;
  }
  
  let spent = 0;
  for (const level of Object.values(playerSkills.learned)) {
    spent += parseInt(level) || 0;
  }
  return spent;
}

/**
 * Check if a player can learn/upgrade a skill
 * @param {Object} playerSkills - Player's skill data
 * @param {number} playerLevel - Player's character level
 * @param {number} skillId - Skill to learn
 * @returns {Object} - { canLearn: boolean, reason: string }
 */
function canLearnSkill(playerSkills, playerLevel, skillId) {
  const skill = getSkill(skillId);
  if (!skill) {
    return { canLearn: false, reason: 'Skill not found' };
  }
  
  const tree = getTree(skill.treeId);
  if (!tree) {
    return { canLearn: false, reason: 'Skill tree not found' };
  }
  
  // Check level requirement
  if (playerLevel < tree.tree.unlockLevel) {
    return { canLearn: false, reason: `Requires level ${tree.tree.unlockLevel}` };
  }
  
  // Check available points
  const totalPoints = calculateSkillPoints(playerLevel);
  const spentPoints = calculateSpentPoints(playerSkills);
  if (spentPoints >= totalPoints) {
    return { canLearn: false, reason: 'No skill points available' };
  }
  
  // Check max level (handle both string and number keys)
  const currentLevel = (playerSkills?.learned?.[skillId]) || (playerSkills?.learned?.[String(skillId)]) || 0;
  if (currentLevel >= skill.maxLevel) {
    return { canLearn: false, reason: 'Skill already at max level' };
  }
  
  return { canLearn: true, reason: 'OK' };
}

/**
 * Get skill info by tree ID and skill ID
 * @param {string} treeId - The tree ID (e.g., 'swordsmanship')
 * @param {number|string} skillId - The skill ID within the tree
 * @param {number} level - The skill level (for formatting description)
 * @returns {Object|null} - Skill info with name, icon, description or null
 */
function getSkillInfo(treeId, skillId, level = 1) {
  const tree = getTree(treeId);
  if (!tree || !tree.skills) return null;
  
  const numId = parseInt(skillId);
  const skill = tree.skills.find(s => s.id === numId || s.id === skillId);
  
  if (!skill) return null;
  
  // Format description with actual values
  let description = skill.description || '';
  if (skill.scaling) {
    for (const [key, scaling] of Object.entries(skill.scaling)) {
      const value = scaling.base + (scaling.perLevel * (Math.max(1, level) - 1));
      const formattedValue = Number.isInteger(value) ? value : parseFloat(value.toFixed(2));
      description = description.replace(`{${key}}`, formattedValue);
    }
  }
  
  return {
    name: skill.name,
    icon: skill.icon || tree.tree?.icon || '⚔️',
    description: description,
    scaling: skill.scaling || null
  };
}

// Load skills on module initialization
loadSkills();

module.exports = {
  loadSkills,
  getSkill,
  getSkillInfo,
  getTree,
  getAllTrees,
  calculateSkillValue,
  getEquippedActiveSkills,
  getLearnedPassiveSkills,
  calculateSkillPoints,
  calculateSpentPoints,
  canLearnSkill
};
