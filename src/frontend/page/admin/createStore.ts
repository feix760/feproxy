import { applyMiddleware, combineReducers, createStore } from 'redux';
import { thunk } from 'redux-thunk';
import type { ThunkDispatch } from 'redux-thunk';
import type { ConfigAction } from './action/config';
import config from './reducer/config';

const rootReducer = combineReducers({
  config,
});

export type RootState = ReturnType<typeof rootReducer>;

export type AppDispatch = ThunkDispatch<RootState, unknown, ConfigAction>;

export default () => createStore(
  rootReducer,
  typeof window !== 'undefined' && (window as any).__initialState || {},
  applyMiddleware(thunk),
);
