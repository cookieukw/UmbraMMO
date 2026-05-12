# Umbra Online - Sprite Format

## Tile Size
- **Size**: 48x48 pixels per tile

## Character Sprite Format (Simplified)

All character sprites (players, NPCs) use a simplified single-sprite format.

### Dimensions
- **Sprite Size**: 64x64 pixels (single frame)
- **Tile Size**: 48x48 pixels (sprite is centered, bleeds 8px on each side)

### Sprite Orientation
- Sprites should face **RIGHT** by default
- The game automatically flips the sprite horizontally when facing left
- When moving up/down, the sprite maintains its last horizontal facing direction

### Mirroring Behavior
- **Moving RIGHT**: Normal sprite (facing right)
- **Moving LEFT**: Sprite flipped horizontally
- **Moving UP/DOWN**: Uses last horizontal direction (defaults to right)

### Why Single Sprite?
This simplified system:
- Reduces art requirements (1 sprite instead of 9)
- Matches the mob sprite system
- Works well for pixel art style games
- Easier to create new characters/skins

## Mob Sprite Format

- **Canvas Size**: 128x128 pixels (single frame)
- **Render Size**: 64x64 pixels on screen (scaled down from 128x128)
- **Creature Size**: Varies within canvas (small mobs centered small, large mobs fill more of the frame)
- **Orientation**: Face RIGHT by default
- **Flipping**: Handled automatically based on movement/facing
- **File Location**: `client/assets/sprites/mobs/{mob_id}.png`
- **Background**: Transparent PNG

### Adding Sprite to Mob
In the mob's JSON file, add a `spriteUrl` field:
```json
{
  "id": "rat",
  "name": "Rat",
  "sprite": "🐀",
  "spriteUrl": "assets/sprites/mobs/rat.png",
  ...
}
```
If `spriteUrl` is not set, the game falls back to the emoji `sprite` field.
