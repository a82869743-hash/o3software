const mysql = require('mysql2/promise');

async function testAll() {
  const ports = [3306, 33060, 3307, 8080];
  const hosts = ['127.0.0.1', 'localhost', '::1'];
  const users = ['root', 'admin', 'o3user', 'o3_user', 'dev', 'user', 'mysql'];
  const passes = [
    '1234',
    '',
    'root',
    'admin',
    'admin123',
    'qwerty',
    'qwe123',
    '123456',
    '12345678',
    'suryaansh9985',
    'Suryaansh9985',
    'o3carspa',
    'password',
    'Test1234'
  ];

  for (const port of ports) {
    for (const host of hosts) {
      for (const user of users) {
        for (const pass of passes) {
          try {
            const conn = await mysql.createConnection({
              host,
              port,
              user,
              password: pass,
              connectTimeout: 1000
            });
            console.log(`\n🎉 WORKING MYSQL CONNECTION FOUND!`);
            console.log(`Host: ${host}, Port: ${port}, User: ${user}, Password: "${pass}"\n`);
            await conn.end();
            return { host, port, user, pass };
          } catch (e) {
            // ignore
          }
        }
      }
    }
  }
  console.log('No combination matched.');
  return null;
}

testAll();
