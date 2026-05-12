/**
 * UMBRA ONLINE - World Map UI
 * Displays a full world map showing all zones with biome colors
 */

const WorldMap = (function() {
  'use strict';
  
  // Map grid dimensions (based on WORLDMAP_DESIGN.md)
  const COLUMNS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R'];
  const ROWS = 15;
  
  // City coordinates (tiles with castle emoji)
  const CITY_COORDS = ['B3', 'I12', 'Q4', 'K5'];
  
  // Biome color mappings
  const BIOME_COLORS = {
    grasslands: { bg: '#4a7c4e', border: '#3d6640', label: 'Grasslands' },
    cave: { bg: '#5c5c5c', border: '#404040', label: 'Cave' },
    snow: { bg: '#b8d4e8', border: '#8fb8d4', label: 'Snow' },
    desert: { bg: '#d4a76a', border: '#b8925a', label: 'Desert' },
    jungle: { bg: '#2d5a2d', border: '#1f4420', label: 'Jungle' },
    beach: { bg: '#e8d4a0', border: '#d4c090', label: 'Beach' },
    swamp: { bg: '#4a5c3d', border: '#3d4d32', label: 'Swamp' },
    volcanic: { bg: '#8b2500', border: '#6b1c00', label: 'Volcanic' },
    bridge: { bg: '#8b7355', border: '#6b5a45', label: 'Bridge' },
    town: { bg: '#8b7355', border: '#705c44', label: 'Town' },
    dungeon: { bg: '#3d2d4a', border: '#2d1f3a', label: 'Dungeon' },
    unknown: { bg: '#2a2a3a', border: '#1a1a2a', label: 'Unknown' }
  };
  
  // Zone data cache
  let zoneDataCache = new Map();
  let isLoading = false;
  let isOpen = false;
  
  /**
   * Initialize the world map
   */
  function init() {
    createModal();
    loadZoneData();
    console.log('[WorldMap] Initialized');
  }
  
  /**
   * Create the world map modal HTML
   */
  function createModal() {
    // Check if modal already exists
    if (document.getElementById('worldmap-modal')) return;
    
    const modal = document.createElement('div');
    modal.id = 'worldmap-modal';
    modal.className = 'worldmap-modal hidden';
    modal.innerHTML = `
      <div class="worldmap-backdrop" onclick="WorldMap.close()"></div>
      <div class="worldmap-container">
        <div class="worldmap-header">
          <h2>🗺️ World Map</h2>
          <button class="worldmap-close-btn" onclick="WorldMap.close()">✕</button>
        </div>
        <div class="worldmap-content">
          <div class="worldmap-grid-wrapper">
            <div class="worldmap-grid" id="worldmap-grid"></div>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
  }
  
  /**
   * Load zone data from server
   */
  async function loadZoneData() {
    if (isLoading) return;
    isLoading = true;
    
    try {
      // Load all zone files by fetching from the data endpoint
      const response = await fetch('/api/debug/zones');
      if (!response.ok) {
        throw new Error('Failed to fetch zone list');
      }
      
      const data = await response.json();
      const zoneIds = data.zones || [];
      
      // Load each zone's basic info
      for (const zoneId of zoneIds) {
        try {
          const zoneResponse = await fetch(`/data/zones/${zoneId}.json`);
          if (zoneResponse.ok) {
            const zoneData = await zoneResponse.json();
            zoneDataCache.set(zoneId, {
              id: zoneId,
              name: zoneData.name || zoneId,
              coord: zoneData.coord || zoneId,
              biome: zoneData.biome || 'unknown',
              level: zoneData.level || null,
              mobType: zoneData.mobType || null
            });
          }
        } catch (err) {
          // Skip zones that fail to load
          console.warn(`[WorldMap] Failed to load zone ${zoneId}:`, err.message);
        }
      }
      
      console.log(`[WorldMap] Loaded ${zoneDataCache.size} zones`);
    } catch (err) {
      console.error('[WorldMap] Failed to load zone data:', err);
    } finally {
      isLoading = false;
    }
  }
  
  /**
   * Render the world map grid
   */
  function renderGrid() {
    const grid = document.getElementById('worldmap-grid');
    if (!grid) return;
    
    // Get current zone from ZoneManager
    const currentZone = typeof ZoneManager !== 'undefined' ? ZoneManager.getCurrentZone() : null;
    const currentZoneId = currentZone ? (currentZone.coord || currentZone.id) : null;
    
    let html = '';
    
    // Grid rows (no header row with letters)
    for (let row = 1; row <= ROWS; row++) {
      html += '<div class="worldmap-row">';
      
      for (const col of COLUMNS) {
        const coord = `${col}${row}`;
        const zone = zoneDataCache.get(coord);
        
        if (zone) {
          const colors = BIOME_COLORS[zone.biome] || BIOME_COLORS.unknown;
          const isCurrentZone = coord === currentZoneId || zone.id === currentZoneId;
          const isCity = CITY_COORDS.includes(coord);
          const currentClass = isCurrentZone ? 'worldmap-current' : '';
          
          html += `
            <div class="worldmap-cell worldmap-zone ${currentClass}" 
                 style="background: ${colors.bg}; border-color: ${colors.border};"
                 data-coord="${coord}"
                 data-zone-id="${zone.id}">
              <span class="zone-coord">${coord}</span>
              ${isCity ? '<span class="zone-city">🏰</span>' : ''}
              ${isCurrentZone ? '<span class="zone-marker">📍</span>' : ''}
            </div>
          `;
        } else {
          // Empty cell (no zone)
          html += '<div class="worldmap-cell worldmap-empty"></div>';
        }
      }
      
      html += '</div>';
    }
    
    grid.innerHTML = html;
  }
  
  /**
   * Open the world map modal
   */
  function open() {
    const modal = document.getElementById('worldmap-modal');
    if (!modal) {
      createModal();
    }
    
    // Reload zone data if needed
    if (zoneDataCache.size === 0) {
      loadZoneData().then(() => {
        renderGrid();
      });
    } else {
      renderGrid();
    }
    
    document.getElementById('worldmap-modal').classList.remove('hidden');
    isOpen = true;
    console.log('[WorldMap] Opened');
  }
  
  /**
   * Close the world map modal
   */
  function close() {
    const modal = document.getElementById('worldmap-modal');
    if (modal) {
      modal.classList.add('hidden');
    }
    isOpen = false;
    console.log('[WorldMap] Closed');
  }
  
  /**
   * Toggle the world map modal
   */
  function toggle() {
    if (isOpen) {
      close();
    } else {
      open();
    }
  }
  
  /**
   * Check if map is currently open
   */
  function isMapOpen() {
    return isOpen;
  }
  
  /**
   * Refresh the map (update current zone marker)
   */
  function refresh() {
    if (isOpen) {
      renderGrid();
    }
  }
  
  // Public API
  return {
    init,
    open,
    close,
    toggle,
    isMapOpen,
    refresh
  };
})();

// Auto-init when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => WorldMap.init());
} else {
  WorldMap.init();
}
