import './reset.scss';
import 'element-theme-default';
import './index.scss';

import React from 'react';
import ReactDOM from 'react-dom';
import { Provider, connect } from 'react-redux';
import Project from './component/Project';
import store from './store';
import { getConfig } from './action/config';

class Component extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      width: window.innerWidth,
      height: window.innerHeight,
      showSettings: false,
    };
  }

  componentDidMount() {
    this.props.dispatch(getConfig());
    window.addEventListener('resize', this.onResize);
  }

  onResize = () => {
    this.setState({
      width: window.innerWidth,
      height: window.innerHeight,
    });
  }

  onOpenSettings = () => {
    this.setState({
      showSettings: true,
    });
  }

  onCloseSettings = () => {
    this.setState({
      showSettings: false,
    });
  }

  render() {
    const { state } = this;
    const { config } = this.props;
    return (
      <div>
        <iframe className="devtools" src={config.devtoolsURL} frameBorder="0"
          style={{ width: state.width + 'px', height: state.height + 'px' }}></iframe>
        <div className="open-settings" onClick={this.onOpenSettings}></div>
        <div className="dialog" style={{ display: state.showSettings ? '' : 'none' }}>
          <div className="dialog-content">
            <div className="close-button el-icon-close" onClick={this.onCloseSettings}></div>
            <Project />
          </div>
        </div>
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
