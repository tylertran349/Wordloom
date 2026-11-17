import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { AppProvider } from './context/AppContext';
import { captureReturningConnection } from './lib/sheetConnect';
import './index.css';

// Read a Google Sheets connection before React routes, and remove it from the
// address bar so the secret never sits in the URL.
captureReturningConnection();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </StrictMode>,
);
