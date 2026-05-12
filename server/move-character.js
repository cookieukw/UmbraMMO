/**
 * UMBRA ONLINE - Move Character to Starting City
 * 
 * Usage: node move-character.js <character_name> [city]
 * 
 * Cities:
 *   plains  - B3: Plains Starting City (Western)
 *   caves   - Q4: Caves Starting City (Eastern)
 *   beach   - I12: Seaside Haven (Southern)
 *   random  - Randomly pick one of the three cities
 * 
 * Examples:
 *   node move-character.js Azimut plains
 *   node move-character.js Azimut random
 *   node move-character.js Azimut
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, '../data/umbra.db');

const STARTING_CITIES = {
  plains: { zoneId: 'B3', x: 10, y: 7, name: 'Plains Starting City' },
  caves: { zoneId: 'Q4', x: 10, y: 7, name: 'Caves Starting City' },
  beach: { zoneId: 'I12', x: 20, y: 15, name: 'Seaside Haven' }
};

function getRandomCity() {
  const cities = Object.keys(STARTING_CITIES);
  return cities[Math.floor(Math.random() * cities.length)];
}

function moveCharacter(characterName, cityKey) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        reject(new Error(`Failed to connect to database: ${err.message}`));
        return;
      }

      // Get the city configuration
      const city = STARTING_CITIES[cityKey];
      if (!city) {
        db.close();
        reject(new Error(`Unknown city: ${cityKey}. Valid options: plains, caves, beach, random`));
        return;
      }

      // First, check if the character exists
      db.get('SELECT id, name, zone_id, x, y FROM characters WHERE name = ?', [characterName], (err, character) => {
        if (err) {
          db.close();
          reject(new Error(`Database error: ${err.message}`));
          return;
        }

        if (!character) {
          db.close();
          reject(new Error(`Character "${characterName}" not found`));
          return;
        }

        console.log(`Found character: ${character.name} (ID: ${character.id})`);
        console.log(`Current location: ${character.zone_id} (${character.x}, ${character.y})`);

        // Update the character's position
        db.run(
          'UPDATE characters SET zone_id = ?, x = ?, y = ?, last_played = CURRENT_TIMESTAMP WHERE id = ?',
          [city.zoneId, city.x, city.y, character.id],
          function(err) {
            if (err) {
              db.close();
              reject(new Error(`Failed to update character: ${err.message}`));
              return;
            }

            if (this.changes === 0) {
              db.close();
              reject(new Error(`No rows updated - character may not exist`));
              return;
            }

            console.log(`\n✓ Successfully moved "${characterName}" to ${city.name}!`);
            console.log(`  New location: ${city.zoneId} (${city.x}, ${city.y})`);
            
            db.close();
            resolve({ character: characterName, city: city.name, zoneId: city.zoneId, x: city.x, y: city.y });
          }
        );
      });
    });
  });
}

// Main execution
const args = process.argv.slice(2);

if (args.length < 1) {
  console.log('Usage: node move-character.js <character_name> [city]');
  console.log('');
  console.log('Cities:');
  console.log('  plains  - B3: Plains Starting City (Western)');
  console.log('  caves   - Q4: Caves Starting City (Eastern)');
  console.log('  beach   - I12: Seaside Haven (Southern)');
  console.log('  random  - Randomly pick one of the three cities');
  console.log('');
  console.log('Examples:');
  console.log('  node move-character.js Azimut plains');
  console.log('  node move-character.js Azimut random');
  process.exit(1);
}

const characterName = args[0];
let cityKey = args[1] || 'random';

if (cityKey === 'random') {
  cityKey = getRandomCity();
  console.log(`Randomly selected city: ${cityKey}`);
}

console.log(`Moving character "${characterName}" to ${cityKey}...`);
console.log('');

moveCharacter(characterName, cityKey)
  .then((result) => {
    console.log('\nDone!');
    process.exit(0);
  })
  .catch((error) => {
    console.error(`\n✗ Error: ${error.message}`);
    process.exit(1);
  });
