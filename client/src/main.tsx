import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './api/queryClient';
import { Toaster } from 'react-hot-toast';
import ErrorBoundary from './components/shared/ErrorBoundary';
import App from './App';
import './index.css';
import { installStrictFields } from './utils/strictFields';
import { startLiveUpdates } from './utils/liveUpdates';
import { installNativeApp, isNativeApp } from './native/nativeApp';

installStrictFields();
startLiveUpdates();
installNativeApp(); // phone app only; does nothing in a browser


ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 3500,
            style: {
              background: '#212121',
              color: '#fff',
              fontSize: '14px',
              fontFamily: 'Manrope, system-ui, sans-serif',
            },
            success: {
              iconTheme: { primary: '#4CAF50', secondary: '#fff' },
            },
            error: {
              iconTheme: { primary: '#2563EB', secondary: '#fff' },
            },
          }}
        />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);

// Register progressive web app service worker in production
// (not in the phone app: its screens are already stored on the phone)
if ('serviceWorker' in navigator && import.meta.env.PROD && !isNativeApp()) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('ServiceWorker registration error:', err);
    });
  });
}
