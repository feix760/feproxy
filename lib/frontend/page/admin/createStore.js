
import { createStore, applyMiddleware, combineReducers } from 'redux';
import thunkMiddleware from 'redux-thunk';
import config from './reducer/config';

export default () => createStore(
  combineReducers({
    config,
  }),
  typeof window !== 'undefined' && window.__initialState || {},
  applyMiddleware(thunkMiddleware)
);
