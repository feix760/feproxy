import React, { useCallback, useEffect, useState } from 'react';
import './App.less';
import { useConfig, useConfigActions } from '../config/ConfigContext';
import SettingsDialog from './SettingsDialog';
import Icon from './ui/Icon';

/** Full-screen devtools iframe with the settings overlay floating above it. */
export default function App() {
  const { devtoolsURL } = useConfig();
  const { reload } = useConfigActions();

  const [ size, setSize ] = useState({ width: window.innerWidth, height: window.innerHeight });
  const [ showSettings, setShowSettings ] = useState(false);

  useEffect(() => {
    const onResize = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // The provider starts out empty, so the first thing the page does is read the config; a failure
  // just leaves the panel blank, there is nothing to fall back to
  useEffect(() => {
    reload().catch(() => {});
  }, [ reload ]);

  const onOpenSettings = useCallback(() => {
    // The config may have changed elsewhere (another tab, a CLI restart) while the panel was closed
    reload().catch(() => {});
    setShowSettings(true);
  }, [ reload ]);

  const onCloseSettings = useCallback(() => setShowSettings(false), []);

  return <>
    {/* Held back until the config is in: mounting the iframe without a src would load about:blank
        first and boot devtools twice */}
    { devtoolsURL && <iframe className="devtools"
      src={ devtoolsURL }
      frameBorder="0"
      style={{ width: size.width + 'px', height: size.height + 'px' }}
    ></iframe> }
    {/* Sibling of the devtools iframe, floated above it by z-index */}
    <button type="button" className="open-settings tonal text-with-icon" onClick={ onOpenSettings }>
      <Icon name="gear" />
      FeProxy
    </button>
    <SettingsDialog open={ showSettings } onClose={ onCloseSettings } />
  </>;
}
