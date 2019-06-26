import React from 'react';
import { connect } from 'react-redux';
import './App.scss';
import Project from './Project';

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

export default connect(
  state => ({
    ...state,
  })
)(Component);
