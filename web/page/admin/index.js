import React from 'react';
import ReactDOM from 'react-dom';
import { Provider, connect } from 'react-redux';
import { Button, Input, Message } from 'element-react';
import Project from './component/project';
import store from './store';
import { getConfig } from './action/config';

import './reset.scss';
import 'element-theme-default';
import './index.scss';

class Component extends React.Component {
  componentDidMount() {
    this.props.dispatch(getConfig());
  }

  copy = () => {
    this.devtoolsURL.querySelector('input').select();
    document.execCommand('copy');
    Message('Copyed');
  }

  render() {
    const { config } = this.props;
    return (
      <div>
        <div className="box">
          <div className="box-header">
            FEProxy
          </div>
          <div className="devtools-url" ref={e => (this.devtoolsURL = e)}>
            <Input
              readOnly
              value={`chrome-devtools://devtools/bundled/inspector.html?ws=127.0.0.1:${config.port}/ws`}
              prepend="Inspect URL"
              append={<Button type="primary" icon="document" onClick={this.copy}>Copy</Button>} />
          </div>
        </div>
        <Project />
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
