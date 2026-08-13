import { useCallback, useEffect, useState } from 'react';
import type { ChangeEvent } from 'react';
import './App.less';
import { getConfig, setConfig } from '../action/config';
import { useAppDispatch, useAppSelector } from '../hooks';
import Icon from './Icon';
import Project from './Project';

export default function App() {
  const dispatch = useAppDispatch();
  const config = useAppSelector(state => state.config);

  const [ size, setSize ] = useState({ width: window.innerWidth, height: window.innerHeight });
  const [ showSettings, setShowSettings ] = useState(false);

  useEffect(() => {
    const onResize = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const onOpenSettings = useCallback(() => {
    dispatch(getConfig());
    setShowSettings(true);
  }, [ dispatch ]);

  const onCloseSettings = useCallback(() => setShowSettings(false), []);

  const setSwitch = useCallback((prop: string) => (e: ChangeEvent<HTMLInputElement>) => {
    dispatch(setConfig({
      [prop]: e.target.checked,
    }));
  }, [ dispatch ]);

  return <>
    <iframe className="devtools"
      src={config.devtoolsURL}
      frameBorder="0"
      style={{ width: size.width + 'px', height: size.height + 'px' }}
    ></iframe>
    {/* 和 devtools iframe 同级, 靠 z-index 浮在它上面 */}
    <button type="button" className="open-settings tonal text-with-icon" onClick={onOpenSettings}>
      <Icon name="gear" />
      FeProxy
    </button>
    <div className="dialog" style={{ display: showSettings ? '' : 'none' }}>
      <div className="dialog-content">
        <div className="settings-window-title">
          <Icon name="gear" />
          FeProxy Settings
          <button type="button"
            className="close-button icon"
            title="Close"
            onClick={onCloseSettings}
          >
            <Icon name="cross" />
          </button>
        </div>
        <div className="settings-card-container-wrapper">
          <div className="settings-card-container">
            <div className="settings-card">
              <div className="card-heading">Preferences</div>
              <div className="card-content">
                <label className="settings-item">
                  <input
                    className="enable"
                    type="checkbox"
                    checked={ config.https || false }
                    onChange={ setSwitch('https') }
                  />
                  https
                </label>
                {
                  config.https && (
                    <label className="settings-item">
                      <input
                        className="enable"
                        type="checkbox"
                        checked={ config.ignoreCertError || false }
                        onChange={ setSwitch('ignoreCertError') }
                      />
                      ignore certificate error
                    </label>
                  )
                }
                <label className="settings-item">
                  <input
                    className="enable"
                    type="checkbox"
                    checked={ config.inspect || false }
                    onChange={ setSwitch('inspect') }
                  />
                  inspect
                </label>
              </div>
            </div>
            <Project />
          </div>
        </div>
      </div>
    </div>
  </>;
}
