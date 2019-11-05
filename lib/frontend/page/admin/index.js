import './reset.scss';
import 'element-theme-default';
import './index.scss';

import React from 'react';
import ReactDOM from 'react-dom';
import { Provider } from 'react-redux';
import createStore from './createStore';
import App from './component/App';
import { getConfig } from './action/config';

export default class Page {
  constructor() {
    this.store = createStore();
  }

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

if (typeof process === 'undefined' || process.title === 'browser') {
  const page = new Page();
  ReactDOM.render(
    page.render(),
    document.getElementById('app')
  );
  page.loadData();
}
