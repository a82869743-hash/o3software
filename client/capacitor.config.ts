import type { CapacitorConfig } from '@capacitor/cli';

// O3 Car Spaa phone app (Android).
// The app opens the live site, so the app and the website always show the same, current version.
// native-shell/ holds only the offline screen that is shown when there is no internet.
const config: CapacitorConfig = {
  appId: 'cloud.o3carspa.app',
  appName: 'O3 Car Spaa',
  webDir: 'native-shell',
  // lets the website know it is running inside the app (used by src/native/nativeApp.ts and for logs)
  appendUserAgent: 'O3CarSpaApp/1',
  backgroundColor: '#008DD2',
  server: {
    url: 'https://o3carspa.cloud',
    androidScheme: 'https',
    errorPath: 'offline.html',
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
