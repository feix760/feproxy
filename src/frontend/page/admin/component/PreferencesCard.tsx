import React from 'react';
import './PreferencesCard.less';
import { useConfig, useConfigActions } from '../config/ConfigContext';
import type { ConfigState } from '../types';
import Card from './ui/Card';
import Checkbox from './ui/Checkbox';
import Tooltip from './ui/Tooltip';

// One switch per boolean config field, see src/defaultConfig.ts. Labels read as what turning the
// switch on does, and every hint spells out the effect — the field names alone ("https", "inspect")
// say nothing to someone who hasn't read the docs.
const SWITCHES: {
  key: string;
  label: string;
  /** Shown by the info icon next to the label */
  hint: React.ReactNode | ((config: ConfigState) => React.ReactNode);
  visible?: (config: ConfigState) => boolean;
  /** Where the value lives, when it isn't `config[key]` */
  value?: (config: ConfigState) => boolean;
  /** Only shows the effective value; ProxyConfig.update() refuses to write the field */
  readOnly?: boolean;
}[] = [
  {
    key: 'https',
    label: 'Decrypt https requests',
    hint: config => <>
      Re-sign https with FeProxy&apos;s root certificate so it can be captured and rewritten.
      When off, https is tunnelled through untouched.
      <br/>
      <a href={ config.crtURL } target="_blank" rel="noreferrer">
        Download root certificate
      </a>
    </>,
  },
  // Only means anything while https is on: without MITM there is no certificate to validate
  {
    key: 'ignoreCertError',
    label: 'Ignore certificate errors',
    hint: 'Sign with the trusted root even when the site\'s own certificate fails to validate,'
      + ' instead of letting the browser keep erroring.',
    visible: config => !!config.https,
  },
  {
    key: 'inspect',
    label: 'Capture requests',
    hint: 'Show proxied requests in the network panel. Set at startup only: --no-inspect.',
    readOnly: true,
  },
  {
    key: 'auth',
    label: 'Require proxy authentication',
    hint: 'Ask proxied traffic for credentials; this page and the certificate download stay open.'
      + ' Set at startup only: --auth / --no-auth, --username, --password.',
    // getConfig only reports whether it is on — the credentials stay on the server
    value: config => !!config.auth?.enable,
    readOnly: true,
  },
];

export default function PreferencesCard() {
  const config = useConfig();
  const { update } = useConfigActions();

  return <Card heading="Preferences">
    { SWITCHES.filter(item => !item.visible || item.visible(config)).map(item => (
      // The hint sits outside the label: inside it, clicking the icon would toggle the switch
      <div className="settings-item" key={ item.key }>
        <label className={ `settings-label${item.readOnly ? ' disabled' : ''}` }>
          <Checkbox checked={ item.value ? item.value(config) : !!config[item.key] }
            disabled={ item.readOnly }
            onChange={ checked => update({ [item.key]: checked }) }
          />
          { item.label }
        </label>
        <Tooltip text={ typeof item.hint === 'function' ? item.hint(config) : item.hint } />
      </div>
    )) }
  </Card>;
}
