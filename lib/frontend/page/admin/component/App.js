import React from 'react';
import { connect } from 'react-redux';
import './App.less';
import Project from './Project';
import { getConfig, setConfig } from '../action/config';

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
    window.addEventListener('resize', this.onResize);
  }

  onResize = () => {
    this.setState({
      width: window.innerWidth,
      height: window.innerHeight,
    });
  }

  onOpenSettings = () => {
    this.props.dispatch(getConfig());

    this.setState({
      showSettings: true,
    });
  }

  onCloseSettings = () => {
    this.setState({
      showSettings: false,
    });
  }

  setSwitch = prop => e => {
    const enable = e.target.checked;

    this.props.dispatch(setConfig({
      [ prop ]: enable,
    }));
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
            <div className="box">
              <h3 className="box-header">
                FEProxy
              </h3>
              <div className="box-content">
                <div className="settings-item">
                  <input
                    className="enable"
                    type="checkbox"
                    checked={ config.https || false }
                    onChange={ this.setSwitch('https') }
                  />
                  https
                </div>
                {
                  config.https && (
                    <div className="settings-item">
                      <input
                        className="enable"
                        type="checkbox"
                        checked={ config.ignoreCertError || false }
                        onChange={ this.setSwitch('ignoreCertError') }
                      />
                      ignore certificate error
                    </div>
                  )
                }
              </div>
            </div>
            <Project />
          </div>
        </div>
      </div>
    );
  }
}

export default connect(
  state => ({
    ...state,
  }),
  dispatch => ({
    dispatch,
  })
)(Component);
