import React, { createContext, useContext, useMemo, useReducer } from 'react';
import type { ReactNode } from 'react';
import type { ConfigState } from '../types';
import { fetchConfig, saveConfig } from './configApi';

const DEFAULT_CONFIG: ConfigState = {
  projects: [],
};

// The whole page state is one config object and both endpoints answer with a whole one, so every
// update is a partial merge
const merge = (state: ConfigState, patch: Partial<ConfigState>): ConfigState => ({ ...state, ...patch });

interface ConfigActions {
  /** Merge a patch locally, then persist it; resolves with the config the server answers with */
  update: (patch: Partial<ConfigState>) => Promise<ConfigState>;
  /** Re-read the config from the server, e.g. when the settings dialog opens */
  reload: () => Promise<ConfigState>;
}

// State and actions are separate contexts: actions never change, so a component that only writes
// (nothing does today, but that is the point of the split) is not re-rendered by unrelated edits.
const StateContext = createContext<ConfigState>(DEFAULT_CONFIG);
const ActionsContext = createContext<ConfigActions>(null);

export function ConfigProvider({ children }: { children: ReactNode }) {
  // Starts out empty; App loads the real config on mount
  const [ config, patch ] = useReducer(merge, DEFAULT_CONFIG);

  const actions = useMemo<ConfigActions>(() => ({
    // Apply the patch right away — a checkbox has to tick before the request comes back — and take
    // the server's answer as the truth once it does
    update: data => {
      patch(data);
      return saveConfig(data).then(config => {
        patch(config);
        return config;
      });
    },
    reload: () => fetchConfig().then(config => {
      patch(config);
      return config;
    }),
  }), []);

  return <StateContext.Provider value={ config }>
    <ActionsContext.Provider value={ actions }>
      { children }
    </ActionsContext.Provider>
  </StateContext.Provider>;
}

export const useConfig = () => useContext(StateContext);

export const useConfigActions = () => useContext(ActionsContext);
