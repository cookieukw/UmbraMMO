# Zone Background Assets

This folder contains background images for each zone/map.

## Format
- **File Type**: GIF (for animated backgrounds) or PNG (for static)
- **Size**: 960 x 720 pixels (20 tiles × 48px by 15 tiles × 48px)
- **Naming**: Match the zone ID (e.g., `town_01.gif` for zone `town_01`)

## How It Works
1. Each zone JSON file has a `background` property pointing to its image
2. The tilemap renderer loads and displays this as the full background
3. Tile data is invisible and only used for collision detection

## Tile Types (Collision Layer)
The JSON tile data defines collision/interaction zones:
- `0` = Walkable (player can move here)
- `1` = Blocked (walls, obstacles)
- `2` = Exit North
- `3` = Exit East
- `4` = Exit South
- `5` = Exit West
- `6` = Water (walkable in future with swimming/fishing)
- `7` = Interactable (NPCs, objects)

## Creating New Zone Backgrounds
1. Create a 960×720 image in your preferred editor
2. Design the visual layout (paths, buildings, decorations)
3. Save as GIF (animated) or PNG (static) in this folder
4. Update the zone JSON to reference it:
   ```json
   "background": "/assets/zones/your_zone.gif"
   ```
5. Edit the `tiles` array to match your walkable areas

## Debug Mode
Press the debug key in-game to see the collision overlay, which shows:
- 🟢 Green = Walkable
- 🔴 Red = Blocked
- 🔵 Blue = Water
- 🟡 Yellow = Interactable
- 🩵 Cyan = Exit points
