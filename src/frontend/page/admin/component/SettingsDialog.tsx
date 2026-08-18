import React from 'react';
import './SettingsDialog.less';
import PreferencesCard from './PreferencesCard';
import ProjectList from './ProjectList';
import IconButton from './ui/IconButton';

/** The settings overlay: a devtools-style settings screen holding one card per settings group. */
export default function SettingsDialog({ open, onClose }: {
  open: boolean;
  onClose: () => void;
}) {
  return <div className="dialog" style={{ display: open ? '' : 'none' }}>
    <div className="dialog-content">
      <div className="settings-window-title">
        {/* Served from lib/public by koaStatic, so no webpack asset import is involved */}
        <img className="app-logo" src="/favicon.svg" alt="" />
        FeProxy Settings
        <IconButton className="close-button"
          name="cross"
          title="Close"
          onClick={ onClose }
        />
      </div>
      <div className="settings-card-container-wrapper">
        <div className="settings-card-container">
          <PreferencesCard />
          <ProjectList />
        </div>
      </div>
    </div>
  </div>;
}
