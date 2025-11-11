import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { setupCapacitor } from './utils/capacitorSetup';
import { isCapacitor } from './utils/capacitor';

setupCapacitor();

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
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                console.log('New service worker available, reloading...');
                window.location.reload();
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

