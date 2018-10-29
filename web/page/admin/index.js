import React from 'react';
import ReactDOM from 'react-dom';
import { Provider, connect } from 'react-redux';
import { Button } from 'element-react';
import 'element-theme-default';
import store from './store';

class Component extends React.Component {
  constructor() {
    super(...arguments);
    this.state = {
    };
  }

  componentDidMount() {
  }

  render() {
    const { state, props } = this;
    return (
      <div>
        admin
        <Button>默认按钮</Button>
        <Button type="primary">主要按钮</Button>
        <Button type="text">文字按钮</Button>
      </div>
    );
  }
}

const Root = connect(state => {
  return state;
})(Component);

ReactDOM.render(
  <Provider store={ store }>
    <Root />
  </Provider>,
  document.getElementById('app')
);
