const path = require('path');
const fs = require('fs');

async function testPairing() {
  const SESSION_DIR = path.join(__dirname, '..', 'sessions', 'whatsapp_test');
  if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });

  const baileys = await import('@whiskeysockets/baileys');
  const makeWASocket = baileys.default;
  const { useMultiFileAuthState, fetchLatestBaileysVersion } = baileys;
  const P = (await import('pino')).default;

  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
  const { version } = await fetchLatestBaileysVersion();

  console.log('Starting socket for 919316668760...');
  const sock = makeWASocket({
    version,
    auth: state,
    logger: P({ level: 'silent' }),
    printQRInTerminal: false,
    browser: ['Chrome (Windows)', 'Chrome', '122.0.6261.112'],
  });

  sock.ev.on('creds.update', saveCreds);

  if (!sock.authState.creds.registered) {
    console.log('Requesting 8-digit pairing code for 919316668760...');
    setTimeout(async () => {
      try {
        const code = await sock.requestPairingCode('919316668760');
        console.log('\n========================================');
        console.log('  YOUR WHATSAPP PAIRING CODE IS: ' + code);
        console.log('========================================\n');
        process.exit(0);
      } catch (err) {
        console.error('Failed to request pairing code:', err.message);
        process.exit(1);
      }
    }, 4000);
  } else {
    console.log('Already registered!');
    process.exit(0);
  }
}

testPairing().catch(err => {
  console.error(err);
  process.exit(1);
});
