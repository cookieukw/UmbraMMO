/**
 * UMBRA ONLINE - Camera Module
 * Handles zoom, follow-player, and edge-clamping so the camera
 * never reveals anything outside the zone map.
 *
 * The camera works in "world pixel" space.  The canvas has a fixed
 * pixel size (ZONE_WIDTH * TILE_SIZE  x  ZONE_HEIGHT * TILE_SIZE).
 * When zoom > 1 only a portion of the world fits on screen, so we
 * translate the context so the player stays centred while clamping
 * at map edges.
 */

const Camera = (function () {
  // ------ tunables ------
  const DEFAULT_ZOOM = 1.25;  // default zoom level
  let zoom = DEFAULT_ZOOM;    // current zoom level (1 = full map visible)
  const LERP_SPEED = 0.12;  // smoothing factor (0-1, higher = snappier)

  // ------ derived / state ------
  let canvasW = 0;           // canvas pixel width
  let canvasH = 0;           // canvas pixel height
  let worldW = 0;            // full world width in pixels
  let worldH = 0;            // full world height in pixels

  // Camera top-left in world-pixel coords (what we translate by)
  let camX = 0;
  let camY = 0;

  // Target values for smooth follow
  let targetX = 0;
  let targetY = 0;

  /**
   * Call once after the canvas is created / sized.
   */
  function init(canvas) {
    canvasW = canvas.width;
    canvasH = canvas.height;
    worldW = CONSTANTS.ZONE_WIDTH * CONSTANTS.TILE_SIZE;
    worldH = CONSTANTS.ZONE_HEIGHT * CONSTANTS.TILE_SIZE;
  }

  /**
   * Immediately snap the camera (no lerp) — use on zone change / teleport.
   */
  function snapToPlayer(playerPixelX, playerPixelY) {
    const tileSize = CONSTANTS.TILE_SIZE;
    // Centre of the player tile
    const cx = playerPixelX + tileSize / 2;
    const cy = playerPixelY + tileSize / 2;

    // Viewport size in world pixels at the current zoom
    const viewW = canvasW / zoom;
    const viewH = canvasH / zoom;

    targetX = cx - viewW / 2;
    targetY = cy - viewH / 2;

    // Clamp so we never show outside the map
    targetX = clamp(targetX, 0, worldW - viewW);
    targetY = clamp(targetY, 0, worldH - viewH);

    camX = targetX;
    camY = targetY;
  }

  /**
   * Call every frame before rendering.
   * Smoothly moves the camera toward the player.
   */
  function update(playerPixelX, playerPixelY) {
    const tileSize = CONSTANTS.TILE_SIZE;
    const cx = playerPixelX + tileSize / 2;
    const cy = playerPixelY + tileSize / 2;

    const viewW = canvasW / zoom;
    const viewH = canvasH / zoom;

    targetX = cx - viewW / 2;
    targetY = cy - viewH / 2;

    // Clamp
    targetX = clamp(targetX, 0, worldW - viewW);
    targetY = clamp(targetY, 0, worldH - viewH);

    // Lerp for smooth follow
    camX += (targetX - camX) * LERP_SPEED;
    camY += (targetY - camY) * LERP_SPEED;

    // Final clamp (avoids sub-pixel overshoot)
    camX = clamp(camX, 0, worldW - viewW);
    camY = clamp(camY, 0, worldH - viewH);
  }

  /**
   * Apply the camera transform to the canvas context.
   * Call ctx.save() before this and ctx.restore() after all world drawing.
   */
  function applyTransform(ctx) {
    ctx.imageSmoothingEnabled = false;
    ctx.scale(zoom, zoom);
    ctx.translate(-Math.round(camX), -Math.round(camY));
  }

  /**
   * Convert screen (canvas) coordinates to world coordinates.
   * Needed for click / hover detection.
   */
  function screenToWorld(screenX, screenY) {
    return {
      x: screenX / zoom + camX,
      y: screenY / zoom + camY
    };
  }

  /**
   * Convert world coordinates to screen (canvas) coordinates.
   */
  function worldToScreen(worldX, worldY) {
    return {
      x: (worldX - camX) * zoom,
      y: (worldY - camY) * zoom
    };
  }

  /**
   * Override the zoom level (e.g. for map editor mode).
   */
  function setZoom(z) {
    zoom = z;
  }

  /**
   * Reset zoom back to the default level.
   */
  function resetZoom() {
    zoom = DEFAULT_ZOOM;
  }

  function getZoom() {
    return zoom;
  }

  function getOffset() {
    return { x: Math.round(camX), y: Math.round(camY) };
  }

  // ------ util ------

  function clamp(val, min, max) {
    if (max < min) return min; // viewport larger than world at zoom=1
    return Math.max(min, Math.min(max, val));
  }

  // Public API
  return {
    init,
    update,
    snapToPlayer,
    applyTransform,
    screenToWorld,
    worldToScreen,
    getZoom,
    getOffset,
    setZoom,
    resetZoom
  };
})();
