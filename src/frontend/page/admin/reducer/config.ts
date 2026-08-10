import { UPDATE_CONFIG } from '../action/config';
import type { ConfigAction } from '../action/config';
import type { ConfigState } from '../types';

const defaultState: ConfigState = {
  activeProjects: [],
  projects: [],
};

export default function (state = defaultState, action: ConfigAction): ConfigState {
  switch (action.type) {
    case UPDATE_CONFIG:
      state = {
        ...state,
        ...action.data,
      };
      break;
    default:
      break;
  }
  return state;
}
