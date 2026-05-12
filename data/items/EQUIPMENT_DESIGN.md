# Equipment Design Document

This document outlines the equipment system for Umbra Online, including shop sets for starting cities and mob drops.

---

## Internal Rarity System (Guidance Only)

| Rarity | Color | Drop Chance | Stat Multiplier | Description |
|--------|-------|-------------|-----------------|-------------|
| Common | ⬜ White | 5% | 1.0x | Basic gear, shop items |
| Uncommon | 🟩 Green | 2% | 1.25x | Better stats, common drops |
| Rare | 🟦 Blue | 1% | 1.5x | Specialized stats, rare drops |
| Epic | 🟪 Purple | 0.5% | 2.0x | Boss drops only |

> **Drop System:** Each drop entry is rolled **independently** — chances do
> NOT need to sum to 100%. If multiple drops succeed on the same kill, only
> the **rarest** one is awarded (ties broken by lowest chance value).
> It is perfectly valid for a mob to have 0 drops on a kill.

---

## Equipment Stat Philosophy

| Armor Type | Primary Stats | Secondary Stats | Description |
|------------|---------------|-----------------|-------------|
| **Heavy** | DEF, VIT | END | Tank gear, high protection |
| **Light** | AGI, DEX | STR | Agile gear, dodge/crit focus |
| **Cloth** | INT | END, VIT | Magic gear, spellcaster focus |
| **Balanced** | DEF | STR or AGI | All-rounder gear |

### Weapon Types
| Type | Slot | Primary Stat | Description |
|------|------|--------------|-------------|
| 1H Sword | weapon1 | STR | Balanced damage |
| 1H Axe | weapon1 | STR | High damage, slow |
| 1H Mace | weapon1 | STR, VIT | Tank weapon |
| Dagger | weapon1 | AGI, DEX | Fast, crit-focused |
| Staff | weapon1 | INT | Magic weapon |
| Wand | weapon1 | INT | Magic, fast |
| 2H Sword | weapon1 (2h) | STR | High damage |
| 2H Axe | weapon1 (2h) | STR | Very high damage |
| Spear | weapon1 (2h) | STR, AGI | Balanced 2H |
| Bow | weapon1 (2h) | DEX, AGI | Ranged |

---

## Starting City Shop Equipment

### B3 - Plains Starting City (Grasslands Theme)
*A humble farming town, equipment reflects militia and peasant origins*

#### Level 5 Set - "Leather Set" (Common)
| Slot | Item Name | ID | NumericID | Stats | Price |
|------|-----------|----|-----------| ------|-------|
| Headgear | Leather Cap | leather_cap | 101 | ARM +1 | 25g |
| Chest | Leather Tunic | leather_tunic | 201 | ARM +2 | 40g |
| Pants | Leather Trousers | leather_trousers | 301 | ARM +2 | 30g |
| Boots | Leather Boots | leather_boots | 401 | ARM +1 | 20g |
| Weapon | Wooden Sword | wooden_sword | 1001 | STR +2 | 50g |

#### Level 10 Set - "Guard Set" (Common)
| Slot | Item Name | ID | NumericID | Stats | Price |
|------|-----------|----|-----------| ------|-------|
| Headgear | Guard Helmet | guard_helmet | 102 | ARM +3 | 60g |
| Chest | Guard Mail | guard_mail | 202 | ARM +5 | 100g |
| Pants | Guard Leggings | guard_leggings | 302 | ARM +4 | 75g |
| Boots | Guard Boots | guard_boots | 402 | ARM +2 | 50g |
| Weapon | Longsword (2H) | longsword | 1002 | STR +7 | 240g |

---

### Q4 - Caves Starting City (Underground/Mining Theme)
*A subterranean settlement of miners and spelunkers*

#### Level 5 Set - "Pirate Set" (Common)
| Slot | Item Name | ID | NumericID | Stats | Price |
|------|-----------|----|-----------| ------|-------|
| Headgear | Fihserman Hat | fisherman_helm | 103 | ARM +1 | 25g |
| Chest | Cotton Shirt | cotton_shirt | 203 | ARM +2 | 40g |
| Pants | Cotton Pants | cotton_pants | 303 | ARM +2 | 30g |
| Boots | Beach Sandals | beach_sandals | 403 | ARM +1 | 20g |
| Weapon | Machete | machete | 1003 | STR +2 | 50g | 

#### Level 10 Set - "Captain Set" (Common)
| Slot | Item Name | ID | NumericID | Stats | Price |
|------|-----------|----|-----------| ------|-------|
| Headgear | Corsair Hat | corsair_hat | 104 | ARM +3 | 60g |
| Chest | Studded Shirt | studded_shirt | 204 | ARM +5 | 100g |
| Pants | Studded Pants | studded_pants | 304 | ARM +4 | 75g |
| Boots | Fine Shoes | fine_shoes | 404 | ARM +2 | 50g |
| Weapon | Cutlass | cutlass | 1004 | STR +4 | 120g |

---

### I12 - Jungle Starting City (Tropical/Tribal Theme)
*A coastal jungle settlement with tribal influences*

#### Level 5 Set - "Clay Set" (Common)
| Slot | Item Name | ID | NumericID | Stats | Price |
|------|-----------|----|-----------| ------|-------|
| Headgear | Headband | headband | 105 | ARM +1 | 25g |
| Chest | Clay Armor | clay_armor | 205 | ARM +2 | 40g |
| Pants | Clay Shinguards | clay_shinguards | 305 | ARM +2 | 30g |
| Boots | Clay Sandals | clay_sandals | 405 | ARM +1 | 20g |
| Weapon | Wooden Club | wooden_club | 1101 | STR +2 | 50g |

#### Level 10 Set - "Wooden Set" (Common)
| Slot | Item Name | ID | NumericID | Stats | Price |
|------|-----------|----|-----------| ------|-------|
| Headgear | Wooden Mask | wooden_mask | 106 | ARM +3 | 60g |
| Chest | Wooden Chest | wooden_chest | 206 | ARM +5 | 100g |
| Pants | Wooden Shinguards | wooden_shinguards | 306 | ARM +4 | 75g |
| Boots | Wooden Boots | wooden_boots | 406 | ARM +2 | 50g |
| Weapon | Hand Axe | hand_axe | 1005 | STR +4 | 120g |

---

## Mob Equipment Drops

### Level 1-5 Mobs (Starter Area)

| Mob | Level | Biome | Drop Item | Slot | Rarity | Stats | NumericID |
|-----|-------|-------|-----------|------|--------|-------|-----------|
| Gloop | 1 | Grasslands | Gloop Hat | Headgear | Common | ARM +2 | 107 |
| Jibui | 1 | Grasslands | Furry Shoes | Boots | Common | ARM +2 | 407 |
| Pupa | 1 | Jungle | Insect Shell | Chest | Common | ARM +3 | 208 |
| Sprite | 1 | Jungle | Glowing Orb | Off-Hand (Relic) | Uncommon | INT +3 | 806 |
| Hermit | 1 | Beach | Bug Helmet | Headgear | Uncommon | ARM +3 | 109 |
| Sea Grazer | 1 | Beach | Turtle Shield | Off-Hand (Shield) | Rare | DEF +3, VIT +2 | 807 |
| Feral | 5 | Grasslands | Claw Blade | Weapon (1H) | Uncommon | AGI +4 | 1007 |
| Gruff | 5 | Grasslands | Hide Cape | Chest | Common | ARM +3 | 207 |
| Drone | 5 | Grasslands | Stinger Spear | Weapon (2H) | Uncommon | STR +3, DEX +2 | 1102 |
| Stump | 5 | Jungle | Bark Armor | Chest | Uncommon | ARM +3, VIT +2 | 210 |
| Simian | 5 | Jungle | Monkey Feet | Boots | Uncommon | ARM +2, DEX +2 | 408 |
| Goblin Scout | 5 | Grasslands | Leather Shorts | Pants | Common | ARM +4 | 307 |

---

### Level 10-15 Mobs (Early Game)

| Mob | Level | Biome | Drop Item | Slot | Rarity | Stats | NumericID |
|-----|-------|-------|-----------|------|--------|-------|-----------|
| Goblin Warrior | 10 | Grasslands | Goblin Scimitar | Weapon (1H) | Uncommon | STR +4, AGI +2 | 1008 |
| Kapokoka | 10 | Jungle | Root Crown | Headgear | Uncommon | ARM +3, END +3 | 110 |
| Bones | 10 | Graveyard | Bone Mail | Chest | Common | ARM +5 | 211 |
| Familiar | 15 | Cave | Dark Cloak | Chest | Rare | AGI +3, DEX +3 | 212 |
| Cave Dweller | 15 | Cave | Loincloth | Pants | Common | ARM +5 | 308 |
| Cursed Head | 15 | Graveyard | Cursed Eyes | Headgear | Rare | INT +5 | 111 |
| Haunting | 15 | Graveyard | Ghost Haste | Boots | Uncommon | ARM +2, AGI +4 | 409 |
| Pinboy | 15 | Desert | Flame Sword | Weapon (1H) | Rare | STR +6, DEX +3 | 1009 |

---

### Level 20-25 Mobs (Mid-Early Game)

| Mob | Level | Biome | Drop Item | Slot | Rarity | Stats | NumericID |
|-----|-------|-------|-----------|------|--------|-------|-----------|
| Sand Seeker | 20 | Desert | Clay Mask | Headgear | Uncommon | ARM +7 | 112 |
| Kobold Miner | 20 | Cave | Kobold Leather | Chest | Common | ARM +7 | 213 |
| Bog Fiend | 20 | Jungle | Algae Boots | Boots | Rare | ARM +6, VIT +4 | 411 |
| Crawler | 25 | Desert | Carapace | Chest | Common | ARM +8 | 214 |
| Manado | 25 | Desert | Cobra Head | Headgear | Rare | ARM +4, DEX +8 | 113 |
| Spider Ant | 25 | Desert | Desert Legs | Pants | Common | ARM +7 | 309 |
| Kobold Warrior | 25 | Cave | Kobold Blade | Weapon (1H) | Uncommon | STR +8, END +5 | 1010 |
| Hogman | 25 | Grasslands | Tusk Mace | Weapon (1H) | Common | STR +8 | 1011 |
| Badfoot | 25 | Grasslands | Bad Feet | Boots | Rare | ARM +7, STR +4 | 412 |

---

### Level 30-35 Mobs (Mid Game)

| Mob | Level | Biome | Drop Item | Slot | Rarity | Stats | NumericID |
|-----|-------|-------|-----------|------|--------|-------|-----------|
| Cyclops | 30 | Cave | Greatclub | Weapon (2H) | Common | STR +18 | 1103 |
| Royal Kobold | 30 | Desert | Kobold Crown | Headgear | Uncommon | ARM +7, END +6 | 114 |
| Suntan | 30 | Desert | Horns | Headgear | Rare | ARM +4, STR +9 | 115 |
| Heavy Hogman | 30 | Grasslands | Broken Shield | Off-Hand (Shield) | Uncommon | DEF +12 | 215 |
| Dung Roller | 30 | Grasslands | Chroma Shinguards | Pants | Uncommon | ARM +8, END +5 | 310 |
| Zolmec | 35 | Desert | Rock Armor | Chest | Uncommon | ARM +12, VIT +4 | 413 |
| Armor Husk | 35 | Grasslands | Plate Mail | Chest | Common | ARM +14 | 216 |
| Cacolus | 35 | Grasslands | Tusk Shield | Off-Hand (Shield) | Rare | DEF +12, END +6 | 116 |

---

### Level 40-50 Mobs (High-Mid Game)

| Mob | Level | Biome | Drop Item | Slot | Rarity | Stats | NumericID |
|-----|-------|-------|-----------|------|--------|-------|-----------|
| Small Giant | 40 | Snow | Giant's Mask | Off-Hand (Shield) | Rare | DEF +14, VIT +5 | 117 |
| Relic Holder | 40 | Grasslands | Dark Staff | Weapon (2H) | Uncommon | INT +24 | 1104 |
| Big Hat | 40 | Grasslands | Archmage Hat | Headgear | Common | ARM +6, INT +12 | 118 |
| Big Shield | 40 | Grasslands | Tower Shield | Off-Hand (Shield) | Common | DEF +14 | 801 |
| Raider Frontline | 45 | Beach | Berserker Armor | Chest | Uncommon | ARM +10, STR +8 | 217 |
| Raider Crossbowman | 45 | Beach | Raider Helmet | Headgear | Uncommon | ARM +8, DEX +6 | 1201 |
| Giant Gatherer | 45 | Snow | Snow Boots | Boots | Common | ARM +8 | 414 |
| Mammoth Hunter | 45 | Snow | Mammoth Spear | Weapon (2H) | Common | STR +16, AGI +10 | 1105 |
| Prototype | 45 | Grasslands | Sabatons | Boots | Uncommon | ARM +8, VIT +5 | 415 |
| Hermetic Stone | 50 | Grasslands | Emerald Stone | Off-Hand (Relic) | Rare | INT +16 | 219 |
| Barialus | 50 | Snow | Magic Mane | Headgear | Rare | ARM +12, DEF +8 | 1014 |
| Giant Legionary | 50 | Snow | Double-Axe | Weapon (1H) | Common | STR +16 | 312 |
| Merman | 50 | Beach | Trident | Weapon (2H) | Rare | STR +22, INT +10 | 1106 |

---

### Level 55-60 Mobs (End Game)

| Mob | Level | Biome | Drop Item | Slot | Rarity | Stats | NumericID |
|-----|-------|-------|-----------|------|--------|-------|-----------|
| Dark Soldier | 55 | Grasslands | Blessed Sword | Weapon (1H) | Rare | STR +15, AGI +7 | 119 |
| Wyrm | 55 | Snow | Scale Mail | Chest | Rare | ARM +14, VIT +10 | 220 |
| Kinguin | 55 | Snow | Ice Heart | Off-Hand | Rare | DEX +10, END +10 | 120 |
| Dragon | 60 | Snow | Scale Leggings | Pants | Rare | ARM +12, VIT +6 | 313 |
| Dragon Worshipper | 60 | Snow | Dragon Mask | Headgear | Rare | ARM +12, VIT +8 | 221 |
| War Machine | 60 | Grasslands | Golden Axe| Weapon (1H) | Rare | STR +22 | 416 |
| Triton Cavalier | 60 | Beach | Sea Lance | Weapon (2H) | Rare | STR +20, AGI +20 | 1108 |

---


## Implementation Notes

### File Naming Convention
```
{numericId}_{item_id}.json
Example: 101_militia_cap.json
```

### JSON Structure Template
```json
{
  "id": "militia_cap",
  "numericId": 101,
  "name": "Militia Cap",
  "type": "equipment",
  "slot": "headgear",
  "rarity": "common",
  "icon": "🪖",
  "description": "A simple cloth cap worn by the town militia.",
  "stats": {
    "def": 2
  },
  "levelGuide": 5,
  "stackable": false,
  "maxStack": 1,
  "sellPrice": 12,
  "buyPrice": 25
}
```

### Mob Drop Entry Format
Each entry in a mob's `"drops"` array uses **independent** percentage chances.
Chances do NOT need to sum to 100%. The `rarity` field is optional (resolved
from the item JSON if omitted).

```json
"drops": [
  { "itemId": "goblin_scimitar", "chance": 2,  "rarity": "uncommon" },
  { "itemId": "goblin_ear",      "chance": 40, "rarity": "common" },
  { "itemId": "goblin_tooth",    "chance": 25, "rarity": "common" }
]
```

**Rules:**
- Each drop is rolled independently (`Math.random() * 100 < chance`).
- If multiple drops succeed, only the **rarest** one is awarded.
- Ties in rarity are broken by lowest chance (harder-to-get item wins).
- It is possible for a kill to produce **no** drop at all.

### Stat Scaling Reference
| Level | Common DEF | Uncommon DEF | Rare DEF |
|-------|------------|--------------|----------|
| 1 | 1 | 1-2 | 2 |
| 5 | 2-3 | 3-4 | 4-5 |
| 10 | 4-6 | 5-7 | 6-8 |
| 15 | 5-7 | 6-9 | 8-10 |
| 20 | 6-8 | 8-10 | 10-12 |
| 30 | 8-10 | 10-12 | 12-15 |
| 40 | 10-12 | 12-15 | 15-18 |
| 50 | 12-14 | 15-18 | 18-22 |
| 60 | 14-16 | 18-20 | 22-26 |

### Price Scaling Reference
- **Sell Price** = Level × 2 + (Rarity Bonus: Common +0, Uncommon +5, Rare +15)
- **Buy Price** = Sell Price × 2.5 (for shop items)

---

## Next Steps

1. Create JSON files for all shop items (29 items)
2. Create JSON files for all mob drop items (64 items)
3. Update shop configurations to include new items
4. Update mob JSON files with drop tables
5. Test equipment in-game
