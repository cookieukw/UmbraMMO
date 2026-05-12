# Boss Data Files

This folder contains boss definitions for Umbra Online.

## Boss JSON Structure

```json
{
  "id": "unique_boss_id",
  "name": "Display Name",
  "title": "Optional Title (e.g., 'The Destroyer')",
  
  "sprite": "🐉",
  "color": "#FF4444",
  
  "level": 10,
  "hp": 5000,
  "maxHp": 5000,
  "stamina": 100,
  "maxStamina": 100,
  
  "str": 15,
  "vit": 20,
  "agi": 8,
  "dex": 10,
  "def": 12,
  "int": 5,
  "end": 10,
  
  "baseDamage": 25,
  "armor": 15,
  
  "skills": {
    "active": [
      { "treeId": "swordsmanship", "skillId": 1, "level": 3 },
      { "treeId": "defense", "skillId": 1, "level": 2 }
    ],
    "passive": [
      { "treeId": "vitality", "skillId": 2, "level": 5 }
    ]
  },
  
  "drops": [
    { "itemId": "boss_item_1", "chance": 100, "minQty": 1, "maxQty": 1 },
    { "itemId": "rare_material", "chance": 30, "minQty": 1, "maxQty": 3 },
    { "itemId": "common_drop", "chance": 80 }
  ],
  
  "expReward": 500,
  "goldReward": 100,
  
  "respawnTime": 3600000,
  "graceTime": 60000,
  
  "behavior": "patrol",
  "moveSpeed": 1200,
  "patrolRadius": 3,
  
  "description": "A fearsome creature that guards the ancient ruins."
}
```

## Field Descriptions

### Display
- `id` - Unique identifier for the boss
- `name` - Display name shown to players
- `title` - Optional title shown below the name
- `sprite` - Emoji or sprite reference
- `color` - Color for the sprite/name

### Stats
- Same stat system as players and mobs
- Bosses typically have much higher stats than regular mobs

### Skills
- `skills.active` - Array of active skills the boss can use in combat
- `skills.passive` - Array of passive skills always active
- Each skill entry: `{ treeId, skillId, level }`

### Drops
- `itemId` - Item to drop
- `chance` - Drop chance percentage (0-100)
- `minQty` / `maxQty` - Optional quantity range (default 1)

### Timing
- `respawnTime` - Time in ms before boss respawns after death (default: 1 hour)
- `graceTime` - Time in ms other players can still fight after someone kills (default: 1 min)

### Behavior
- `behavior` - "patrol" (walks around) or "stationary"
- `moveSpeed` - Movement speed in ms per tile
- `patrolRadius` - How far from spawn point boss will wander
