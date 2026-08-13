import './theme.less';
import './reset.less';
import './index.less';

import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { getConfig } from './action/config';
import App from './component/App';
import createStore from './createStore';

export default class Page {
  store = createStore();

  loadData() {
    return this.store.dispatch(getConfig());
  }

  render() {
    return (
      <Provider store={ this.store }>
        <App />
      </Provider>
    );
  }
}

const container = typeof document !== 'undefined' && document.getElementById('app');

if (container) {
  const page = new Page();
  createRoot(container).render(page.render());
  page.loadData();
}
