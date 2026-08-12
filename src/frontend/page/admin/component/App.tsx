import { useCallback, useEffect, useState } from 'react';
import type { ChangeEvent } from 'react';
import './App.less';
import { getConfig, setConfig } from '../action/config';
import { useAppDispatch, useAppSelector } from '../hooks';
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
    <div className="open-settings" onClick={onOpenSettings}>⚙ FeProxy</div>
    <div className="dialog" style={{ display: showSettings ? '' : 'none' }}>
      <div className="dialog-content">
        <div className="close-button el-icon-close" onClick={onCloseSettings}></div>
        <div className="box">
          <h3 className="box-header">
            FeProxy
          </h3>
          <div className="box-content">
            <div className="settings-item">
              <input
                className="enable"
                type="checkbox"
                checked={ config.https || false }
                onChange={ setSwitch('https') }
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
                    onChange={ setSwitch('ignoreCertError') }
                  />
                  ignore certificate error
                </div>
              )
            }
            <div className="settings-item">
              <input
                className="enable"
                type="checkbox"
                checked={ config.inspect || false }
                onChange={ setSwitch('inspect') }
              />
              inspect
            </div>
          </div>
        </div>
        <Project />
      </div>
    </div>
  </>;
}
