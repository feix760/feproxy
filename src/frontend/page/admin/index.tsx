import './reset.less';
import './theme.less';

import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './component/App';
import { ConfigProvider } from './config/ConfigContext';

const container = document.getElementById('app');

createRoot(container).render(
  <ConfigProvider>
    <App />
  </ConfigProvider>,
);
