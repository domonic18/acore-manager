import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { loadRemoteDebug } from './debug-bootstrap';
import '../styles/globals.css';

loadRemoteDebug();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
