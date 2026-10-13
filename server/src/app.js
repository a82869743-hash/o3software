const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const validateEnv = require('./config/validateEnv');
validateEnv();

// Process-level error resilience: prevents server crashes on unexpected runtime exceptions
process.on('uncaughtException', (err) => {
  console.error('[CRITICAL] Uncaught exception safely caught (server kept alive):', err.message);
  console.error(err.stack);
});
process.on('unhandledRejection', (reason) => {
  console.error('[CRITICAL] Unhandled promise rejection safely caught (server kept alive):', reason);
});

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const http = require('http');
const { Server } = require('socket.io');
const pool = require('./config/db');

const app = express();
const server = http.createServer(app);

// ─── Allowed Origins ────────────────────────────────
const allowedOrigins = [
  process.env.CLIENT_URL,
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
].filter(Boolean);

const isAllowedOrigin = (origin, callback) => {
  if (!origin || allowedOrigins.includes(origin) || (process.env.NODE_ENV !== 'production' && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin))) {
    return callback(null, true);
  }
  callback(null, true); // Allow all in dev for smooth experience
};

// Socket.io setup
const io = new Server(server, {
  cors: {
    origin: isAllowedOrigin,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingTimeout: 60000,
  pingInterval: 25000,
});

app.set('io', io);

// ─── Middleware ──────────────────────────────────────
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  origin: isAllowedOrigin,
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ─── Serve uploaded product images ──────────────────
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// ─── Global Audit Logger ────────────────────────────
const auditLogger = require('./middleware/auditLog');
app.use(auditLogger);

// ─── Static: Uploads (profile pictures etc.) ────────
const uploadsPath = path.join(__dirname, '..', 'uploads');
const fs = require('fs');
if (!fs.existsSync(uploadsPath)) fs.mkdirSync(uploadsPath, { recursive: true });
app.use('/uploads', express.static(uploadsPath));

// ─── Request logging (production-safe) ──────────────
if (process.env.NODE_ENV !== 'production') {
  app.use((req, _res, next) => {
    if (req.url !== '/api/v1/health') {
      const ts = new Date().toISOString().slice(11, 19);
      process.stdout.write(`[${ts}] ${req.method} ${req.url}\n`);
    }
    next();
  });
}

// ─── Health check (Liveness / Readiness Probe) ──────
app.get('/api/v1/health', async (req, res) => {
  let dbStatus = 'disconnected';
  let dbLatencyMs = null;
  let healthy = false;

  try {
    const t0 = Date.now();
    await pool.query('SELECT 1 AS ping');
    dbLatencyMs = Date.now() - t0;
    dbStatus = 'connected';
    healthy = true;
  } catch (err) {
    dbStatus = `error: ${err.message}`;
  }

  const mem = process.memoryUsage();
  const payload = {
    status: healthy ? 'healthy' : 'degraded',
    message: 'O3 Car Spaaa API is running',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    environment: process.env.NODE_ENV || 'development',
    version: '2.4.0',
    database: {
      status: dbStatus,
      latencyMs: dbLatencyMs,
    },
    memory: {
      rssMB: Math.round(mem.rss / (1024 * 1024)),
      heapUsedMB: Math.round(mem.heapUsed / (1024 * 1024)),
      heapTotalMB: Math.round(mem.heapTotal / (1024 * 1024)),
    },
  };

  res.status(healthy ? 200 : 503).json(payload);
});

// ─── Rate Limiting ──────────────────────────────────
const { apiLimiter, notificationLimiter } = require('./middleware/rateLimiter');
app.use('/api', apiLimiter);

// ─── Routes ─────────────────────────────────────────
const authRoutes = require('./routes/auth');
app.use('/api/auth', authRoutes);
const jobCartsRoutes = require('./routes/jobCarts');
app.use('/api/job-carts', jobCartsRoutes);
app.use('/api/job-cards', jobCartsRoutes); // Route alias for maximum compatibility
app.use('/api/inventory',  require('./routes/inventory'));
app.use('/api/slots',      require('./routes/slots'));
app.use('/api/bookings',   require('./routes/bookings'));
app.use('/api/services',   require('./routes/services'));
app.use('/api/packages',   require('./routes/packages'));
app.use('/api/loyalty',    require('./routes/loyalty'));
app.use('/api/staff',      require('./routes/staff'));
app.use('/api/accounts',   require('./routes/accounts'));
app.use('/api/buy-sell',   require('./routes/buySell'));
app.use('/api/messages',   notificationLimiter, require('./routes/messages'));
app.use('/api/inquiries',  require('./routes/inquiries'));
app.use('/api/import',     require('./routes/import'));
app.use('/api/deliveries', require('./routes/deliveries'));
app.use('/api/settings',   require('./routes/settings'));
app.use('/api/dashboard',  require('./routes/dashboard'));
app.use('/api/vehicles',   require('./routes/vehicles'));
app.use('/api/customers',  require('./routes/customers'));
app.use('/api/quotations', require('./routes/quotations'));

// ─── New Feature Routes ─────────────────────────────────────
app.use('/api/user-packages', require('./routes/userPackages'));
app.use('/api/reports',       require('./routes/reports'));
app.use('/api/incentives',    require('./routes/incentives'));
app.use('/api/billing',       require('./routes/billing'));
app.use('/api/vendors',       require('./routes/vendors'));
app.use('/api/salary',        require('./routes/salary'));
app.use('/api/invoices',      require('./routes/invoices'));
app.use('/api/archive',       require('./routes/archive'));

// ─── Phase 2 Routes ────────────────────────────────────────
app.use('/api/search',        require('./routes/search'));
app.use('/api/quick-wash',    require('./routes/quickWash'));

// ─── Phase 2 Extended Routes ───────────────────────────────
app.use('/api/payments',      require('./routes/payments'));
app.use('/api/feedback',      require('./routes/feedback'));
app.use('/api/balance-sheet', require('./routes/balanceSheet'));
app.use('/api/audit',         require('./routes/audit'));
app.use('/api/staff-hr',      require('./routes/staffHR'));
app.use('/api/whatsapp',      notificationLimiter, require('./routes/whatsapp'));
app.use('/api/leads',         require('./routes/leads'));
app.use('/api/admin/roles',   require('./routes/roles'));
app.use('/api/roles',         require('./routes/roles'));
app.use('/api/shared-files',  require('./routes/sharedFiles'));
app.get('/api/shared/:token', require('./controllers/fileSharingController').getSharedFile);
app.use('/api/purchase-bills', require('./routes/purchaseBills'));
app.use('/api/gst-reports',    require('./routes/gstReports'));
const rewardsRoutes = require('./routes/customerRewards');
app.use('/api/customer-rewards', rewardsRoutes);
app.use('/api/rewards', rewardsRoutes); // Route alias
app.use('/api/referrals',     require('./routes/referrals'));
app.use('/api/pickup-requests', require('./routes/pickup'));
app.use('/api/pickups',         require('./routes/pickup')); // Route alias
app.use('/api/products',      require('./routes/products'));
app.use('/api/wallets',       require('./routes/wallets'));
app.use('/api/franchises',    require('./routes/franchises'));
app.use('/api/stock-requests', require('./routes/stockRequests'));
app.use('/api/users',         authRoutes); // Alias for user profile/auth endpoints
app.use('/api/notifications',  require('./routes/notifications'));



// ─── Socket.io Auth + GPS ───────────────────────────
const jwt = require('jsonwebtoken');

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) {
    socket.user = { id: -1, role: 'guest' };
    return next();
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.user = decoded;
    next();
  } catch {
    socket.user = { id: -1, role: 'guest' };
    next();
  }
});

io.on('connection', (socket) => {
  socket.on('join_delivery', async ({ deliveryId }) => {
    try {
      const [rows] = await pool.query(
        'SELECT * FROM deliveries WHERE id = ?',
        [deliveryId]
      );
      if (!rows.length) return socket.emit('error', { message: 'Delivery not found' });
      const delivery = rows[0];
      if (socket.user.role !== 'admin' && socket.user.id !== delivery.staff_id && socket.user.id !== delivery.customer_id) {
        return socket.emit('error', { message: 'Not authorized' });
      }
      socket.join(`delivery_${deliveryId}`);
      socket.emit('joined', { deliveryId });
    } catch {
      socket.emit('error', { message: 'Failed to join delivery room' });
    }
  });

  socket.on('location_update', async ({ deliveryId, lat, lng }) => {
    try {
      const parsedLat = parseFloat(lat);
      const parsedLng = parseFloat(lng);
      if (isNaN(parsedLat) || isNaN(parsedLng)) return;

      const [rows] = await pool.query(
        'SELECT staff_id FROM deliveries WHERE id = ?',
        [deliveryId]
      );
      if (!rows.length) return;
      if (socket.user.role !== 'admin' && socket.user.id !== rows[0].staff_id) return;

      // Persist to database
      await pool.query(
        'UPDATE deliveries SET last_lat = ?, last_lng = ?, location_updated_at = NOW() WHERE id = ?',
        [parsedLat, parsedLng, deliveryId]
      );

      const locPayload = { deliveryId: parseInt(deliveryId), delivery_id: parseInt(deliveryId), lat: parsedLat, lng: parsedLng, timestamp: Date.now() };
      io.to(`delivery_${deliveryId}`).emit('location', locPayload);
      io.to(`delivery_${deliveryId}`).emit('location_update', locPayload);
    } catch (err) {
      console.error('[SOCKET] location_update error:', err.message);
    }
  });

  socket.on('disconnect', () => {});
});

// ─── Error handling ─────────────────────────────────
app.use((err, req, res, _next) => {
  console.error('Unhandled error:', err.message);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

// ─── Serve React frontend in production ─────────────
if (process.env.NODE_ENV === 'production') {
  const clientBuildPath = path.join(__dirname, '..', '..', 'client', 'dist');
  app.use(express.static(clientBuildPath));
  // React Router SPA fallback — any non-API route serves index.html
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientBuildPath, 'index.html'));
  });
}

// 404 handler (API routes only in production)
app.use((req, res) => {
  res.status(404).json({ success: false, error: `Route ${req.method} ${req.url} not found` });
});

// Central 500 error handler
app.use((err, req, res, next) => {
  console.error(`[SERVER ERROR] ${req.method} ${req.url}:`, err);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    success: false,
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// ─── Graceful shutdown ──────────────────────────────
const gracefulShutdown = (signal) => {
  console.log(`\n${signal} received — shutting down gracefully...`);
  server.close(() => {
    pool.end().then(() => {
      console.log('Database pool closed.');
      process.exit(0);
    });
  });
  // Force exit after 10s
  setTimeout(() => process.exit(1), 10_000);
};
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// ─── Start server ───────────────────────────────────
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`\n🚗 O3 Car Spaa API running on port ${PORT}`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`   Allowed origins: ${allowedOrigins.join(', ')}\n`);

  if (!process.env.MSG91_AUTH_KEY) {
    console.warn('[WARNING] MSG91_AUTH_KEY not set — messaging in mock mode');
  }
  if (!process.env.JWT_SECRET) {
    console.error('[FATAL] JWT_SECRET not set — authentication will fail');
  }

  // Initialize cron jobs
  const cronService = require('./services/cronService');
  cronService.initCronJobs();

  // Phase 5: Initialize notification queue worker with Socket.io
  const notificationQueue = require('./services/notificationQueue');
  notificationQueue.setIo(io);
  notificationQueue.startWorker(15000);

  // Phase 5: Initialize Baileys WhatsApp engine (free, auto-reconnecting)
  const baileys = require('./services/whatsappBaileys');
  baileys.setIo(io);
  baileys.connect().catch(err => {
    // Non-fatal: server still boots; admin can trigger reconnect from UI
    console.warn('[Baileys] Initial connect deferred:', err.message);
  });

  // Ensure all database schema columns & tables exist on startup
  const { runStartupMigrations } = require('../scripts/migrate_columns');
  runStartupMigrations(pool).catch((err) => {
    console.warn('[MIGRATIONS] Notice during startup migrations:', err.message);
  });
});

module.exports = { app, io };
