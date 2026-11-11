import type { CapacitorConfig } from '@capacitor/cli';

// O3 Car Spaa phone app (Android).
// All screens are stored inside the app (built by "npm run build:app" into dist-app/).
// Data — logins, bookings, bills, attendance — comes from the live server https://o3carspa.cloud,
// the same server and database as the website, so the app and the website are always in sync.
const config: CapacitorConfig = {
  appId: 'cloud.o3carspa.app',
  appName: 'O3 Car Spaa',
  webDir: 'dist-app',
  // lets the server logs tell app traffic from website traffic
  appendUserAgent: 'O3CarSpaApp/1',
  backgroundColor: '#008DD2',
  server: {
    // the app's own address is https://localhost (allowed by the server's CORS list)
    androidScheme: 'https',
    hostname: 'localhost',
  },
  android: {
    allowMixedContent: false,
    captureInput: false,
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: true,
      backgroundColor: '#008DD2',
      showSpinner: false,
      androidScaleType: 'CENTER_CROP',
    },
    SystemBars: {
      insetsHandling: 'css',
      style: 'DARK',
    },
  },
};

export default config;
