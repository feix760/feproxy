import 'isomorphic-fetch';
import type { ThunkAction } from 'redux-thunk';
import type { RootState } from '../createStore';
import type { ConfigState } from '../types';

export const UPDATE_CONFIG = 'UPDATE_CONFIG';

export interface ConfigAction {
  type: string;
  data?: Partial<ConfigState>;
}

export type AppThunk<R = void> = ThunkAction<R, RootState, unknown, ConfigAction>;

function getURL(path: string) {
  return `${typeof publicPath !== 'undefined' ? publicPath.replace(/\/$/, '') : ''}${path}`;
}

export function getConfig(): AppThunk<Promise<ConfigState>> {
  return dispatch => {
    return fetch(getURL('/getConfig'))
      .then(response => response.json())
      .then(data => {
        dispatch({
          type: UPDATE_CONFIG,
          data,
        });
        return data;
      });
  };
}

let setConfigRequest: Promise<ConfigState> | null;
let setConfigRequestData: Partial<ConfigState>;

export function setConfig(data: Partial<ConfigState>): AppThunk<Promise<ConfigState>> {
  return dispatch => {
    dispatch({
      type: UPDATE_CONFIG,
      data,
    });
    setConfigRequestData = data;

    if (!setConfigRequest) {
      setConfigRequest = new Promise(resolve => setTimeout(resolve, 1000))
        .then(() => {
          return fetch(getURL('/setConfig'), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json; charset=utf-8',
            },
            body: JSON.stringify(setConfigRequestData),
          });
        })
        .then(response => response.json())
        .then(data => {
          dispatch({
            type: UPDATE_CONFIG,
            data,
          });
          setConfigRequest = null;
          return data;
        });
    }
    return setConfigRequest;
  };
}
