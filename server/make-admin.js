/**
 * UMBRA ONLINE - Make Admin Script
 * Usage: node make-admin.js <email>
 * Example: node make-admin.js myemail@example.com
 * 
 * Run this from the server directory
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, '../data/umbra.db');

// Get email from command line argument
const email = process.argv[2];

if (!email) {
  console.log('\n❌ Error: Please provide an email address');
  console.log('\nUsage: node make-admin.js <email>');
  console.log('Example: node make-admin.js myemail@example.com\n');
  process.exit(1);
}

// Connect to database
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('\n❌ Failed to connect to database:', err.message);
    console.error('Database path:', DB_PATH);
    process.exit(1);
  }
  
  console.log('\n🔌 Connected to Umbra Online database');
  console.log('Database path:', DB_PATH);
  
  // First, check if the account exists
  db.get('SELECT id, username, email, is_admin FROM accounts WHERE email = ?', [email], (err, row) => {
    if (err) {
      console.error('❌ Database error:', err.message);
      db.close();
      process.exit(1);
    }
    
    if (!row) {
      console.log(`\n❌ No account found with email: ${email}`);
      console.log('Please check the email and try again.\n');
      db.close();
      process.exit(1);
    }
    
    if (row.is_admin === 1) {
      console.log(`\n✅ Account "${row.username}" (${row.email}) is already an admin!\n`);
      db.close();
      process.exit(0);
    }
    
    // Update the account to be admin
    db.run('UPDATE accounts SET is_admin = 1 WHERE email = ?', [email], function(err) {
      if (err) {
        console.error('❌ Failed to update account:', err.message);
        db.close();
        process.exit(1);
      }
      
      if (this.changes === 0) {
        console.log(`\n❌ Failed to update account. No changes made.\n`);
      } else {
        console.log(`\n✅ Success! Account "${row.username}" (${row.email}) is now an admin!`);
        console.log('The admin panel will be visible next time you log in.\n');
      }
      
      db.close();
    });
  });
});
