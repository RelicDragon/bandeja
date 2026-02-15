import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { setupCapacitor, setupBrowserKeyboardDetection } from './utils/capacitorSetup';
import { isCapacitor, isAndroid } from './utils/capacitor';
import { initializeSocialLogin } from './services/socialLoginInit.service';

const CACHE_VERSION = 'v1';

if (isCapacitor() && isAndroid()) {
  document.body.classList.add('capacitor-android');
}
setupCapacitor();
setupBrowserKeyboardDetection();
initializeSocialLogin();

// Only use service worker in web browsers, not in Capacitor apps
if ('serviceWorker' in navigator && !isCapacitor()) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        console.log('ServiceWorker registered:', registration.scope);
        
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'activated' && navigator.serviceWorker.controller) {
                console.log('New service worker activated');
                if (caches) {
                  caches.keys().then((names) => {
                    names.forEach((name) => {
                      if (!name.includes(CACHE_VERSION)) {
                        caches.delete(name);
                      }
                    });
                  });
                }
              }
            });
          }
        });
        
        setInterval(() => {
          registration.update();
        }, 60000);
      })
      .catch((error) => {
        console.log('ServiceWorker registration failed:', error);
        navigator.serviceWorker.getRegistrations().then((registrations) => {
          registrations.forEach((reg) => reg.unregister());
        });
      });
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <App />
);

