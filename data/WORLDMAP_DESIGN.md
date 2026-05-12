# Umbra Online - World Map Design

## Visual Map Layout

```
     A   B   C   D   E   F   G   H   I   J   K   L   M   N   O   P   Q   R
   +---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+
 1 |   | X |   | X |   | X |   |   | X |   |   | X |   | X |   |   | X |   |
   +---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+
 2 | X | X |   | X |   | X | X | X | X | X | X | X | X | X |   |   | Q | X |
   +---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+
 3 |   | X | X | X | X |   |   | X |   | X |   | X | X |   |   |   | X |   |
   +---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+
 4 |   | X |   | X |   | X | X | X | X |   | X |   | X | X |   | X | X | X |
   +---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+
 5 | X | X | X | X |   | X |   |   | X | X | X | X | X |   | X | X |   | X |
   +---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+
 6 | X |   |   | X | X | X | X | X |   |   | X | X |   |   |   | X |   | X |
   +---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+
 7 |   | X |   | X |   | X |   | X |   | X | X |   | X |   |   | X |   |   |
   +---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+
 8 | X | X | X | X |   |   |   | X | X |   | X |   | X | X | X | X | X | X |
   +---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+
 9 | X | X |   | X | X | X | X | X |   | X | X | X | X |   | X |   |   | X |
   +---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+
10 | X |   | X | X | X | X |   | X | X |   | X |   | X |   | X |   | X |   |
   +---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+
11 | X | X |   | X |   | X |   |   | X | X | X |   | X | X | X | X | X | X |
   +---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+
12 | X |   |   | X |   |   | X | X | X | X |   | X | X | X |   | X | X |   |
   +---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+
13 |   |   | X | X | X |   |   |   |   |   |   |   |   |   | X | X |   |   |
   +---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+
14 |   |   | X | X | X | X |   |   |   |   |   |   |   |   |   |   |   |   |
   +---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+
15 |   |   |   |   |   |   |   |   |   |   |   |   |   |   |   |   |   |   |
   +---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+---+

X = Map exists
(empty) = No map
```

---

## Creature Design Philosophy

### Level Progression Zones
- **Levels 1-5**: Starter areas near cities (rats, slimes, snakes, crabs)
- **Levels 5-15**: Early adventure areas (goblins, wolves, bats, spiders)
- **Levels 15-25**: Mid-game areas (bandits, kobolds, undead, scorpions)
- **Levels 25-35**: Advanced areas (orc variants, cave trolls, mummies)
- **Levels 35-50**: High-level areas (giants, elder undead, demons)
- **Levels 50-60**: End-game areas (elite variants, dark knights, tritons)

### Biome-Specific Creatures
- **Grasslands**: Rats, Wolves, Bandits, Wild Boars
- **Cave**: Bats, Spiders, Cave Trolls, Rock Golems
- **Snow**: Frost Wolves, Ice Elementals, Frost Giants
- **Desert**: Scorpions, Mummies, Sand Worms, Kobolds
- **Jungle**: Snakes, Jungle Spiders, Raptors, Tribal Warriors
- **Beach**: Crabs, Sea Serpents, Tritons, Sea Raiders

### Camp-Based Creatures
- **Goblin Camp**: Goblin Scouts, Goblin Warriors, Goblin Shamans
- **Giant's Camp**: Frost Giants, Ice Trolls
- **Kobold's Camp**: Kobold Miners, Kobold Warriors, Kobold Shamans
- **Graveyard**: Skeletons, Zombies, Wraiths
- **Sea Raiders Camp**: Sea Raider Scouts, Sea Raider Warriors, Sea Raider Captains
- **Tritons Camp**: Triton Scouts, Triton Warriors, Triton Mages
- **Dark Knights Camp**: Dark Squires, Dark Knights, Death Knights

---

## Complete Map List with Mobs & Bosses

### Row 1 (7 maps)
| Coord | Biome | Level | Boss | Camp | Mob | Boss Name |
|-------|-------|-------|------|------|-----|-----------|
| B1 | Cave | 10 | Yes | | | **King Gloopus** |
| D1 | Grasslands | 10 | Yes | Goblin Camp | | **Goblin Warlord** |
| F1 | Snow | | | Camp | | *(no mobs - camp only)* |
| I1 | Snow | 60 | Yes | Giant's Camp | | **Elder Titan** |
| L1 | Cave | 60 | Yes | | | **Dragon Lord** |
| N1 | Snow | | | | | *(no mobs)* |
| Q1 | Jungle | 1 | Yes | | | **Cocoon** |

### Row 2 (14 maps)
| Coord | Biome | Level | Boss | Camp | Mob | Boss Name |
|-------|-------|-------|------|------|-----|-----------|
| A2 | Grasslands | 1 | Yes | | | **Evil Bird** |
| B2 | Grasslands | 1 | | | Gloop | |
| D2 | Grasslands | 10 | | Goblin Camp | Goblin Warrior | |
| F2 | Snow | | | | | *(no mobs)* |
| G2 | Snow | 45 | | Giant's Camp | Mammoth Hunter | |
| H2 | Snow | 45 | | Giant's Camp | Giant Gatherer | |
| I2 | Snow | 50 | | Giant's Camp | Giant Legionary | |
| J2 | Snow | | | | | *(no mobs)* |
| K2 | Snow | 60 | | | Dragon Worshiper | |
| L2 | Snow | 60 | | | Dragon | |
| M2 | Snow | | | | | *(no mobs)* |
| N2 | Snow | | | Camp | | *(no mobs - camp only)* |
| Q2 | Jungle | 1 | | | Pupa | |
| R2 | Cave | 15 | Yes | | | **Lava Moth** |

### Row 3 (9 maps)
| Coord | Biome | Level | Boss | Camp | Mob | Boss Name |
|-------|-------|-------|------|------|-----|-----------|
| B3 | Grasslands | | | | | 🏠 Starting City (Plains) |
| C3 | Grasslands | | | | | *(no mobs - city outskirts)* |
| D3 | Grasslands | 5 | | Goblin Camp | Goblin Scout | |
| E3 | Cave | 10 | Yes | | | **Poison Widow** |
| H3 | Snow | 40 | | Giant's Camp | Small Giant | |
| J3 | Snow | 55 | | | Wyrm | |
| L3 | Snow | 55 | | | Kinguin | |
| M3 | Snow | 50 | | | Barialus | |
| Q3 | Jungle | | | | | *(no mobs - path to city)* |

### Row 4 (12 maps)
| Coord | Biome | Level | Boss | Camp | Mob | Boss Name |
|-------|-------|-------|------|------|-----|-----------|
| B4 | Grasslands | 1 | | | Jibui | |
| D4 | Grasslands | 5 | Yes | Goblin Camp | | **Goblin Raider** |
| F4 | Desert | 25 | | | Manado | |
| G4 | Grasslands | 35 | | | Cacolus | |
| H4 | Grasslands | | | | | *(no mobs - crossroads)* |
| I4 | Grasslands | 35 | | | Armor Husk | |
| K4 | Capital City | | | | | *(Capital City - no mobs)* |
| M4 | Grasslands | 50 | | | Hermetic Stone | |
| N4 | Cave | 50 | Yes | | | **Crystal Golem** |
| P4 | Jungle | 1 | | | Jungle Rat | |
| Q4 | Jungle | | | | | 🏠 Starting City (Caves) |
| R4 | Jungle | | | | | *(no mobs - city outskirts)* |

### Row 5 (13 maps)
| Coord | Biome | Level | Boss | Camp | Mob | Boss Name |
|-------|-------|-------|------|------|-----|-----------|
| A5 | Grasslands | 5 | Yes | | | **Alpha Boar** |
| B5 | Grasslands | 5 | | | Feral | |
| C5 | Cave | | | | | *(no mobs - passage)* |
| D5 | Desert | | | | | *(no mobs - passage)* |
| F5 | Desert | 25 | | | Spider Ant | |
| I5 | Grasslands | | | | | *(no mobs - capital approach)* |
| J5 | Capital City | | | | | *(Capital City - no mobs)* |
| K5 | Capital City | | | | | *(Capital City - no mobs)* |
| L5 | Capital City | | | | | *(Capital City - no mobs)* |
| M5 | Grasslands | | | | | *(no mobs - capital approach)* |
| O5 | Cave | 5 | Yes | | | **Giant Spider** |
| P5 | Jungle | 5 | | | Stump | |
| R5 | Jungle | 5 | | | Simian | |

### Row 6 (10 maps)
| Coord | Biome | Level | Boss | Camp | Mob | Boss Name |
|-------|-------|-------|------|------|-----|-----------|
| A6 | Grasslands | 15 | | | Wolf | |
| D6 | Desert | 15 | | | Pinboy | |
| E6 | Desert | 20 | | | Sand Seeker | |
| F6 | Desert | | | | | *(no mobs - passage)* |
| G6 | Desert | | | Camp | | *(no mobs - camp only)* |
| H6 | Desert | | | | | *(no mobs - passage)* |
| K6 | Capital City | | | | | *(Capital City - no mobs)* |
| L6 | Grasslands | 1 | | | Chicken | |
| P6 | Jungle | 10 | | | Kapokoka | |
| R6 | Jungle | 5 | Yes | | | **Kong Bong** |

### Row 7 (8 maps)
| Coord | Biome | Level | Boss | Camp | Mob | Boss Name |
|-------|-------|-------|------|------|-----|-----------|
| B7 | Cave | 30 | Yes | | | **Wearied Dragon** |
| D7 | Desert | 25 | | | Crawler | |
| F7 | Desert | 20 | Yes | | | **Emperor Scorpius** |
| H7 | Desert | 30 | | Kobold's Camp | Royal Kobold | |
| J7 | Grasslands | 20 | Yes | | | **Witch Latiarix** |
| K7 | Grasslands | | | | | *(no mobs - crossroads)* |
| M7 | Grasslands | | | Camp | | *(no mobs - camp only)* |
| P7 | Jungle | 10 | Yes | | | **Old Oak** |

### Row 8 (13 maps)
| Coord | Biome | Level | Boss | Camp | Mob | Boss Name |
|-------|-------|-------|------|------|-----|-----------|
| A8 | Grasslands | | | Camp | | *(no mobs - camp only)* |
| B8 | Grasslands | | | | | *(no mobs - passage)* |
| C8 | Cave | 30 | | | Cyclops | |
| D8 | Desert | | | | | *(no mobs - passage)* |
| H8 | Desert | 25 | | Kobold's Camp | Kobold Warrior | |
| I8 | Cave | 30 | Yes | Kobold's Camp | | **Kobold Leader** |
| K8 | Grasslands | 15 | | Graveyard | Cursed Head | |
| M8 | Grasslands | | | | | *(no mobs - passage)* |
| N8 | Grasslands | 30 | | | Heavy Hogman | |
| O8 | Grasslands | 25 | | | Hogman | |
| P8 | Cave | 15 | | | Familiar | |
| Q8 | Cave | 15 | | | Cave Dweller | |
| R8 | Jungle | 20 | | | Bog Fiend | |

### Row 9 (13 maps)
| Coord | Biome | Level | Boss | Camp | Mob | Boss Name |
|-------|-------|-------|------|------|-----|-----------|
| A9 | Grasslands | | | | | *(no mobs - passage)* |
| B9 | Grasslands | | | | | *(no mobs - passage)* |
| D9 | Desert | 30 | | | Suntan | |
| E9 | Desert | | | | | *(no mobs - passage)* |
| F9 | Desert | 35 | | | Zolmec | |
| G9 | Desert | | | | | *(no mobs - passage)* |
| H9 | Desert | 20 | | Kobold's Camp | Kobold Miner | |
| J9 | Cave | 10 | Yes | | | **Mimic (chest)** |
| K9 | Grasslands | 10 | | Graveyard | Bones | |
| L9 | Grasslands | 15 | | Graveyard | Haunting | |
| M9 | Grasslands | 25 | | | Badfoot | |
| O9 | Grasslands | 30 | | | Dung Roller | |
| R9 | Cave | 20 | Yes | | | **Fat Fur** |

### Row 10 (11 maps)
| Coord | Biome | Level | Boss | Camp | Mob | Boss Name |
|-------|-------|-------|------|------|-----|-----------|
| A10 | Grasslands | 45 | | Sea Raiders Camp | Raider Frontline | |
| C10 | Beach | | | | | *(no mobs - coastal path)* |
| D10 | Grasslands | 40 | | | Relic Holder | |
| E10 | Beach | | | | | *(no mobs - coastal path)* |
| F10 | Desert | | | | | *(no mobs - passage)* |
| H10 | Cave | 5 | Yes | | | **Cavern Slime** |
| I10 | Grasslands | 5 | | | Gruff | |
| K10 | Grasslands | 5 | Yes | | | **Hive Queen** |
| M10 | Grasslands | 30 | | | Excalibur | |
| O10 | Grasslands | 40 | | | Big Hat | |
| Q10 | Grasslands | | | Camp | | *(no mobs - camp only)* |

### Row 11 (13 maps)
| Coord | Biome | Level | Boss | Camp | Mob | Boss Name |
|-------|-------|-------|------|------|-----|-----------|
| A11 | Grasslands | 45 | | Sea Raiders Camp | Raider Crossbowman | |
| B11 | Beach | 45 | Yes | Sea Raiders Camp | | **Captain Chieftain** |
| D11 | Bridge | | | | | *(no mobs - bridge)* |
| F11 | Beach | 50 | Yes | | | **Leviathan** |
| I11 | Grasslands | | | | | *(no mobs - city approach)* |
| J11 | Grasslands | | | | | *(no mobs - crossroads)* |
| K11 | Grasslands | 5 | | | Drone | |
| M11 | Grasslands | 35 | | | Fallen Dread | |
| N11 | Grasslands | | | | | *(no mobs - passage)* |
| O11 | Grasslands | 40 | | | Big Shield | |
| P11 | Grasslands | 45 | | | Prototype  | |
| Q11 | Grasslands | | | | | *(no mobs - passage)* |
| R11 | | | | | | *(empty zone)* |

### Row 12 (11 maps)
| Coord | Biome | Level | Boss | Camp | Mob | Boss Name |
|-------|-------|-------|------|------|-----|-----------|
| A12 | Beach | 45 | Yes | Sea Raiders Camp | | **Tur's Anvil** |
| D12 | Bridge | | | | | *(no mobs - bridge)* |
| G12 | Beach | 1 | Yes | | | **Pistol Darter** |
| H12 | Beach | 1 | | | Hermit | |
| I12 | Beach | | | | | 🏠 Starting City (Jungle) |
| J12 | Beach | 1 | | | Sea Grazer | |
| L12 | Beach | | | Camp | | *(no mobs - camp only)* |
| M12 | Beach | | | | | *(no mobs - coastal path)* |
| N12 | Beach | 35 | Yes | | | **Abomination** |
| P12 | Grasslands | 50 | | Tritons Camp | Merman | |
| Q12 | Beach | | | | | *(no mobs - coastal path)* |

### Row 13 (5 maps)
| Coord | Biome | Level | Boss | Camp | Mob | Boss Name |
|-------|-------|-------|------|------|-----|-----------|
| C13 | Grasslands | | | | | *(no mobs - passage)* |
| D13 | Grasslands | 55 | | Dark Knights Camp | Dark Soldier | |
| E13 | Grasslands | 60 | | Dark Knights Camp | War Machine | |
| O13 | Beach | 60 | Yes | Tritons Camp | | **Neptunus** |
| P13 | Beach | 60 | | Tritons Camp | Triton Cavalier | |

### Row 14 (4 maps)
| Coord | Biome | Level | Boss | Camp | Mob | Boss Name |
|-------|-------|-------|------|------|-----|-----------|
| C14 | Grasslands | 60 | Yes | Dark Knights Camp | | **Death Knight Commander** |
| D14 | Grasslands | 60 | | Dark Knights Camp | Death Knight | |
| E14 | Grasslands | | | | | *(no mobs - passage)* |
| F14 | Grasslands | | | Camp | | *(no mobs - camp only)* |

---

## Creature Summary by Type

### Regular Mobs (by level range)

#### Level 1-5 (Starter)
| Mob | Level | Biome | Sprite |
|-----|-------|-------|--------|
| Gloop | 1 | Grasslands | A slime with a silly face |
| Jibui | 1 | Grasslands | A scared mouse with big eyes |
| Chicken | 1 | Grasslands | A chicken |
| Pupa | 1 | Jungle | A small orange larvae |
| Sprite | 1 | Jungle | A blueish light ball |
| Hermit | 1 | Beach | A cartoon hermit crab |
| Sea Grazer | 1 | Beach | A land turtle |
| Feral | 5 | Grasslands | Honey Badger |
| Gruff | 5 | Grasslands | A tired looking ox |
| Drone | 5 | Grasslands | A very angry bee with a spear |
| Stump | 5 | Jungle | Tree stump with face, hands and feet |
| Simian | 5 | Jungle | A cartoon monkey with a trickster face |
| Goblin Scout | 5 | Grasslands | A goblin with a spear |

#### Level 10-15 (Early)
| Mob | Level | Biome | Sprite |
|-----|-------|-------|--------|
| Goblin Warrior | 10 | Grasslands | A goblin with a scimitar and a shield |
| Kapokoka | 10 | Jungle | Tangled roots with a mask |
| Bones | 10 | Grasslands/Graveyard | A skeleton |
| Familiar | 15 | Cave | A walking giant bat |
| Cave Dweller | 15 | Cave | A white monkey-like creature |
| Cursed Head | 15 | Grasslands/Graveyard | A floating skeleton head |
| Haunting | 15 | Grasslands/Graveyard | A zombie yokai |
| Wolf | 15 | Grasslands | A ferocious wolf |
| Pinboy | 15 | Desert | A live cactus |

#### Level 20-25 (Mid)
| Mob | Level | Biome | Sprite |
|-----|-------|-------|--------|
| Sand Seeker | 20 | Desert | A raccoon wearing explorer googles with a pickaxe |
| Kobold Miner | 20 | Desert/Cave | ⛏️ |
| Bog Fiend | 20 | Jungle | A green creature with algae around it's body |
| Crawler | 25 | Desert | A desert worm/bug |
| Manado | 25 | Desert | A desert bird with stone body |
| Spider Ant | 25 | Desert | A red ant with more legs |
| Kobold Warrior | 25 | Desert/Cave | ⚔️ |
| Hogman | 25 | Grasslands | A fat man with the head of a boar |
| Badfoot | 25 | Grasslands | A big foot like brbrpatapim |

#### Level 30-35 (Advanced)
| Mob | Level | Biome | Sprite |
|-----|-------|-------|--------|
| Cyclops | 30 | Cave | A chubby creature with a single eye on the belly |
| Royal Kobold | 30 | Desert | A kobold in a fancy armor |
| Suntan | 30 | Desert | A werewolf with tanning glasses |
| Heavy Hogman | 30 | Grasslands | A hogman with plate armor |
| Dung Roller | 30 | Grasslands | A armored dung beetle |
| Excalibur | 30 | Grasslands | A zombie like creature with swords in the place of hands |
| Zolmec | 35 | Desert | A sand statue golem |
| Armor Husk | 35 | Grasslands | A armor without a head |
| Cacolus | 35 | Grasslands | A giant anteater |
| Fallen Dread | 35 | Grasslands | A zombie like creature with axes in the place of hands |
| Dire Wolf | 35 | Grasslands | 🐺 |

#### Level 40-50 (High)
| Mob | Level | Biome | Sprite |
|-----|-------|-------|--------|
| Small Giant | 40 | Snow | A muscular guy with a mask |
| Relic Holder | 40 | Grasslands | A muscular creature holding an ankh |
| Big Hat | 40 | Grasslands | A mage with a big hat |
| Big Shield | 40 | Grasslands | A warrior with a big shield |
| Raider Frontline | 45 | Beach/Grasslands | Viking like with a sword |
| Raider Crossbowman | 45 | Beach/Grasslands | Viking like with a crossbow |
| Giant Gatherer | 45 | Snow | A giant holding a bronze basket |
| Mammoth Hunter | 45 | Snow | A giant holding thick spears |
| Sea Raider Captain | 45 | Beach/Grasslands | ⚓ |
| Prototype | 45 | Grasslands | A killing bronze machine |
| Hermetic Stone | 50 | Grasslands | A floating stone device |
| Barialus | 50 | Snow | A blood-lust polar bear |
| Giant Legionary | 50 | Snow | A giant with armor and a club |
| Merman | 50 | Beach | A tired fishman |

#### Level 55-60 (End-game)
| Mob | Level | Biome | Sprite |
|-----|-------|-------|--------|
| Dark Soldier | 55 | Grasslands | A crooked soldier with steel armor |
| Wyrm | 55 | Snow | A wyrm |
| Kinguin | 55 | Snow | An evil emperor peguin |
| Dragon | 60 | Snow | A dragon|
| Dragon Worshipper | 60 | Snow | A giant warrior dressed as a dragon |
| Death Knight | 60 | Grasslands | A crooked knight with black armor |
| War Machine | 60 | Grasslands | A catapult like machine with chains |
| Triton Cavalier | 60 | Beach | An armored triton |
---

## Starting Cities

| Coord | Region | Nearby Mob Zones | Level Range |
|-------|--------|------------------|-------------|
| B3 | Plains Starting City | B2, B4, D3 | 1-5 |
| Q4 | Caves Starting City | P4, Q2, Q3, R4 | 1-5 |
| I12 | Jungle Starting City | H12, J12, G12 | 1 |

---

## Map Connection Analysis

### Row 1
| Map | North | East | South | West |
|-----|-------|------|-------|------|
| B1 | - | - | B2 | - |
| D1 | - | - | D2 | - |
| F1 | - | - | F2 | - |
| I1 | - | - | I2 | - |
| L1 | - | - | L2 | - |
| N1 | - | - | N2 | - |
| Q1 | - | - | Q2 | - |

### Row 2
| Map | North | East | South | West |
|-----|-------|------|-------|------|
| A2 | - | B2 | - | - |
| B2 | B1 | - | B3 | A2 |
| D2 | D1 | - | D3 | - |
| F2 | F1 | G2 | - | - |
| G2 | - | H2 | - | F2 |
| H2 | - | I2 | H3 | G2 |
| I2 | I1 | J2 | - | H2 |
| J2 | - | K2 | J3 | I2 |
| K2 | - | L2 | - | J2 |
| L2 | L1 | M2 | L3 | K2 |
| M2 | - | N2 | M3 | L2 |
| N2 | N1 | - | - | M2 |
| Q2 | Q1 | R2 | Q3 | - |
| R2 | - | - | - | Q2 |

### Row 3
| Map | North | East | South | West |
|-----|-------|------|-------|------|
| B3 | B2 | C3 | B4 | - |
| C3 | - | D3 | - | B3 |
| D3 | D2 | E3 | D4 | C3 |
| E3 | - | - | - | D3 |
| H3 | H2 | - | H4 | - |
| J3 | J2 | - | - | - |
| L3 | L2 | M3 | - | - |
| M3 | M2 | - | M4 | L3 |
| Q3 | Q2 | - | Q4 | - |

### Row 4
| Map | North | East | South | West |
|-----|-------|------|-------|------|
| B4 | B3 | - | B5 | - |
| D4 | D3 | - | D5 | - |
| F4 | - | G4 | F5 | - |
| G4 | - | H4 | - | F4 |
| H4 | H3 | I4 | - | G4 |
| I4 | - | - | I5 | H4 |
| K4 | - | - | K5 | - |
| M4 | M3 | N4 | M5 | - |
| N4 | - | - | - | M4 |
| P4 | - | Q4 | P5 | - |
| Q4 | Q3 | R4 | - | P4 |
| R4 | - | - | R5 | Q4 |

### Row 5
| Map | North | East | South | West |
|-----|-------|------|-------|------|
| A5 | - | B5 | A6 | - |
| B5 | B4 | C5 | - | A5 |
| C5 | - | D5 | - | B5 |
| D5 | D4 | - | D6 | C5 |
| F5 | F4 | - | F6 | - |
| I5 | I4 | J5 | - | - |
| J5 | - | K5 | - | I5 |
| K5 | K4 | L5 | K6 | J5 |
| L5 | - | M5 | L6 | K5 |
| M5 | M4 | - | - | L5 |
| O5 | - | P5 | - | - |
| P5 | P4 | - | P6 | O5 |
| R5 | R4 | - | R6 | - |

### Row 6
| Map | North | East | South | West |
|-----|-------|------|-------|------|
| A6 | A5 | - | - | - |
| D6 | D5 | E6 | - | - |
| E6 | - | F6 | - | D6 |
| F6 | F5 | G6 | F7 | E6 |
| G6 | - | H6 | - | F6 |
| H6 | - | - | H7 | G6 |
| K6 | K5 | L6 | K7 | - |
| L6 | L5 | - | - | K6 |
| P6 | P5 | - | P7 | - |
| R6 | R5 | - | - | - |

### Row 7
| Map | North | East | South | West |
|-----|-------|------|-------|------|
| B7 | - | - | B8 | - |
| D7 | - | - | D8 | - |
| F7 | F6 | - | - | - |
| H7 | H6 | - | H8 | - |
| J7 | - | K7 | - | - |
| K7 | K6 | - | K8 | J7 |
| M7 | - | - | M8 | - |
| P7 | P6 | - | P8 | - |

### Row 8
| Map | North | East | South | West |
|-----|-------|------|-------|------|
| A8 | - | B8 | A9 | - |
| B8 | B7 | C8 | B9 | A8 |
| C8 | - | D8 | - | B8 |
| D8 | D7 | - | D9 | C8 |
| H8 | H7 | I8 | H9 | - |
| I8 | - | - | - | H8 |
| K8 | K7 | - | K9 | - |
| M8 | M7 | N8 | M9 | - |
| N8 | - | O8 | - | M8 |
| O8 | - | P8 | O9 | N8 |
| P8 | P7 | Q8 | - | O8 |
| Q8 | - | R8 | - | P8 |
| R8 | - | - | R9 | Q8 |

### Row 9
| Map | North | East | South | West |
|-----|-------|------|-------|------|
| A9 | A8 | B9 | A10 | - |
| B9 | B8 | - | - | A9 |
| D9 | D8 | E9 | D10 | - |
| E9 | - | F9 | E10 | D9 |
| F9 | - | G9 | F10 | E9 |
| G9 | - | H9 | - | F9 |
| H9 | H8 | - | H10 | G9 |
| J9 | - | K9 | - | - |
| K9 | K8 | L9 | K10 | J9 |
| L9 | - | M9 | - | K9 |
| M9 | M8 | - | M10 | L9 |
| O9 | O8 | - | - | - |
| R9 | R8 | - | - | - |

### Row 10
| Map | North | East | South | West |
|-----|-------|------|-------|------|
| A10 | A9 | - | A11 | - |
| C10 | - | D10 | - | - |
| D10 | D9 | E10 | D11 | C10 |
| E10 | E9 | F10 | - | D10 |
| F10 | F9 | - | F11 | E10 |
| H10 | H9 | I10 | - | - |
| I10 | - | - | I11 | H10 |
| K10 | K9 | - | K11 | - |
| M10 | M9 | - | M11 | - |
| O10 | - | - | O11 | - |
| Q10 | - | - | Q11 | - |

### Row 11
| Map | North | East | South | West |
|-----|-------|------|-------|------|
| A11 | A10 | B11 | A12 | - |
| B11 | - | - | - | A11 |
| D11 | D10 | - | D12 | - |
| F11 | F10 | - | - | - |
| I11 | I10 | J11 | I12 | - |
| J11 | - | K11 | J12 | I11 |
| K11 | K10 | - | - | J11 |
| M11 | M10 | N11 | M12 | - |
| N11 | - | O11 | N12 | M11 |
| O11 | O10 | P11 | - | N11 |
| P11 | - | Q11 | P12 | O11 |
| Q11 | Q10 | R11 | Q12 | P11 |
| R11 | - | - | - | Q11 |

### Row 12
| Map | North | East | South | West |
|-----|-------|------|-------|------|
| A12 | A11 | - | - | - |
| D12 | D11 | - | - | - |
| G12 | - | H12 | - | - |
| H12 | - | I12 | - | G12 |
| I12 | I11 | J12 | - | H12 |
| J12 | J11 | - | - | I12 |
| L12 | - | M12 | - | - |
| M12 | M11 | N12 | - | L12 |
| N12 | N11 | - | - | M12 |
| P12 | P11 | Q12 | - | - |
| Q12 | Q11 | - | - | P12 |

### Row 13
| Map | North | East | South | West |
|-----|-------|------|-------|------|
| C13 | - | D13 | C14 | - |
| D13 | - | E13 | D14 | C13 |
| E13 | - | - | E14 | D13 |
| O13 | - | P13 | - | - |
| P13 | - | - | - | O13 |

### Row 14
| Map | North | East | South | West |
|-----|-------|------|-------|------|
| C14 | C13 | D14 | - | - |
| D14 | D13 | E14 | - | C14 |
| E14 | E13 | F14 | - | D14 |
| F14 | - | - | - | E14 |

---

## Map Count Summary
- **Total Maps: 139**
- Row 1: 7 maps
- Row 2: 14 maps
- Row 3: 9 maps
- Row 4: 12 maps
- Row 5: 13 maps
- Row 6: 10 maps
- Row 7: 8 maps
- Row 8: 13 maps
- Row 9: 13 maps
- Row 10: 11 maps
- Row 11: 13 maps
- Row 12: 11 maps
- Row 13: 5 maps
- Row 14: 4 maps

---

## Notes
- Maps connect orthogonally (N/S/E/W) to adjacent maps that exist
- Gray/empty cells have no maps and act as world boundaries
- Diagonal movement between maps is not supported
- **Bosses exist alone** - no regular mobs spawn on boss maps
- **Mobs only spawn on maps with a Level** - empty level means no mobs
- **Camps are rest areas** - typically no mobs, just facilities
- **Starting Cities and Capital** - safe zones with no mobs
