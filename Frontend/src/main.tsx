import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { setupCapacitor } from './utils/capacitorSetup';

setupCapacitor();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        console.log('ServiceWorker registered:', registration.scope);
      })
      .catch((error) => {
        console.log('ServiceWorker registration failed:', error);
      });
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <App />
);

