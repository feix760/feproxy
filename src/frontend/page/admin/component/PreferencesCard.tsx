import './PreferencesCard.less';
import { useConfig, useConfigActions } from '../config/ConfigContext';
import type { ConfigState } from '../types';
import Card from './ui/Card';
import Checkbox from './ui/Checkbox';

// One switch per boolean config field, see src/defaultConfig.ts
const SWITCHES: { key: string; label: string; visible?: (config: ConfigState) => boolean }[] = [
  { key: 'https', label: 'https' },
  // Only means anything while https is on: without MITM there is no certificate to validate
  { key: 'ignoreCertError', label: 'ignore certificate error', visible: config => !!config.https },
  { key: 'inspect', label: 'inspect' },
];

export default function PreferencesCard() {
  const config = useConfig();
  const { update } = useConfigActions();

  return <Card heading="Preferences">
    { SWITCHES.filter(item => !item.visible || item.visible(config)).map(item => (
      <label className="settings-item" key={ item.key }>
        <Checkbox checked={ !!config[item.key] } onChange={ checked => update({ [item.key]: checked }) } />
        { item.label }
      </label>
    )) }
  </Card>;
}
