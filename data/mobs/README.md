# Mob Data Format

Each mob/NPC/boss is defined in its own JSON file in this directory. The server automatically loads all `.json` files from this directory at startup.

Mobs use the **same stat system as players**, making it easy to create balanced encounters and allowing this structure to be reused for simulated players and bosses.

## File Structure

```json
{
  "id": "mob_id",
  "name": "Display Name",
  "type": "mob",

  "=== DISPLAY ===": "",
  "sprite": "🐀",
  "color": "#8B7355",

  "=== CORE STATS ===": "",
  "level": 1,
  "exp": 0,
  "gold": 0,

  "=== RESOURCES ===": "",
  "hp": 20,
  "maxHp": 20,
  "stamina": 15,
  "maxStamina": 15,

  "=== ATTRIBUTES (same as player) ===": "",
  "str": 1,
  "vit": 1,
  "agi": 2,
  "dex": 1,
  "def": 0,
  "int": 1,
  "end": 1,

  "=== COMBAT ===": "",
  "baseDamage": 2,
  "armor": 0,

  "=== REWARDS ===": "",
  "expReward": 10,
  "drops": [
    { "itemId": "rat_tail", "chance": 60 },
    { "itemId": "rat_meat", "chance": 40 }
  ],

  "=== BEHAVIOR ===": "",
  "behavior": "wander",
  "aggroRange": 3,
  "leashRange": 8,
  "moveSpeed": 800,
  "respawnTime": 30000,

  "=== FLAGS ===": "",
  "isBoss": false,
  "isAggressive": false,
  "canFlee": true,
  "fleeHealthPercent": 0.15
}
```

## Stat Descriptions

### Core Stats
| Stat | Description |
|------|-------------|
| `level` | Mob level - affects combat calculations |
| `exp` | Current experience (usually 0 for mobs) |
| `gold` | Gold carried (usually 0, goldReward is for drops) |

### Resources
| Stat | Description |
|------|-------------|
| `hp` / `maxHp` | Current and maximum health points |
| `stamina` / `maxStamina` | Current and maximum stamina |

### Attributes (Same as Player)
| Stat | Effect |
|------|--------|
| `str` | Strength: +1 physical damage per point |
| `vit` | Vitality: +5 max HP per point |
| `agi` | Agility: +0.05 attacks/sec per point |
| `dex` | Dexterity: +0.5% crit & dodge per point |
| `def` | Defense: +0.5% damage mitigation per point |
| `int` | Intelligence: +1 magic damage, +0.5% CDR per point |
| `end` | Endurance: +5 max stamina per point |

### Combat
| Stat | Description |
|------|-------------|
| `baseDamage` | Base damage before STR bonus |
| `armor` | Flat damage reduction |

### Rewards
| Stat | Description |
|------|-------------|
| `expReward` | Experience given on kill |
| `drops` | Array of possible item drops with chances (must sum to 100%) |

### Drop Table Format
```json
"drops": [
  { "itemId": "item_id_1", "chance": 60 },
  { "itemId": "item_id_2", "chance": 40 }
]
```
- Each mob drops exactly ONE item on death
- `chance` values should sum to 100
- If player's inventory is full, item is auto-sold for 80% of its sell value

### Behavior
| Stat | Description |
|------|-------------|
| `behavior` | AI type: `wander`, `patrol`, `stationary`, `aggressive` |
| `aggroRange` | Tiles range to detect and chase players |
| `leashRange` | Max tiles from spawn before returning |
| `moveSpeed` | Movement delay in ms (lower = faster) |
| `respawnTime` | Respawn delay in ms after death |

### Flags
| Flag | Description |
|------|-------------|
| `isBoss` | Boss mobs have special UI/mechanics |
| `isAggressive` | Will attack players on sight |
| `canFlee` | Can run away when low HP |
| `fleeHealthPercent` | HP % threshold to start fleeing |

## Type Values

- `mob` - Standard enemy
- `boss` - Boss enemy (special mechanics)
- `npc` - Non-combat NPC (future)
- `simulated` - AI-controlled player-like entity

## Adding New Mobs

1. Create a new `.json` file with the mob's id as the filename
2. Copy the structure from an existing mob
3. Adjust stats based on intended difficulty
4. Add the mob to zone spawn lists in `data/zones/[zone].json`
5. Restart the server to load the new mob type
