const pool = require('../src/config/db');

async function update() {
  const [cols] = await pool.query('DESCRIBE users');
  console.log('Users columns:', cols.map(c => c.Field));

  const [res] = await pool.query(
    "INSERT INTO users (name, mobile, email, role, password_hash) VALUES ('Demo Customer', '8238538098', 'customer.demo@o3carspaa.com', 'customer', '$2a$10$wT8KjTz81sJkX11111111111111111111111111111111111111111')"
  );
  console.log('Created demo customer ID:', res.insertId);

  const [settings] = await pool.query('SELECT * FROM settings WHERE key_name IN ("admin_whatsapp", "studio_mobile")');
  console.log('Verified settings:', settings);

  process.exit(0);
}

update().catch(err => {
  console.error(err);
  process.exit(1);
});
