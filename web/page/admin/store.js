
import { createStore, applyMiddleware, combineReducers } from 'redux';
import thunkMiddleware from 'redux-thunk';

export default createStore(
  combineReducers({
  }),
  typeof window !== 'undefined' && window.__initialState || {},
  applyMiddleware(thunkMiddleware)
);
