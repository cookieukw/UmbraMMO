const fs = require('fs');
const f = 'e:/laragon/www/knight-game/Rebuild/data/zones/Q4.json';
let c = fs.readFileSync(f, 'utf8');

// Fix shops section: replace all old shop entries with single general_store_Q4
const shopsPattern = /"shops":\s*\[[\s\S]*?\],\s*"objects"/;
const newShops = `"shops":  [
                  {
                      "shopId":  "general_store_Q4",
                      "x":  3,
                      "y":  3,
                      "width":  1,
                      "height":  1,
                      "name":  "Gormund",
                      "icon":  "🏪"
                  }
              ],
    "objects"`;

if (shopsPattern.test(c)) {
  c = c.replace(shopsPattern, newShops);
  fs.writeFileSync(f, c);
  console.log('Fixed shops in Q4.json');
} else {
  console.log('Shops pattern not found');
}
