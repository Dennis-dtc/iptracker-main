import React from 'react';
import ReactDOM from 'react-dom/client';

import MainRoute from './MainRoute';
import './index.css';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <MainRoute />
  </React.StrictMode>
);