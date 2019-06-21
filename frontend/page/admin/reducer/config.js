
import { UPDATE_CONFIG } from '../action/config';

const defaultState = {
  activeProjects: [],
  projects: [],
};

export default function(state = defaultState, { type, data }) {
  switch (type) {
    case UPDATE_CONFIG:
      state = {
        ...state,
        ...data,
      };
      break;
    default:
      break;
  }
  return state;
}
