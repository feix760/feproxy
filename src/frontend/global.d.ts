declare module '*.less';
declare module '*.css';
declare module 'element-theme-default';
declare module 'isomorphic-fetch';

declare const publicPath: string | undefined;

interface Window {
  __initialState?: Record<string, any>;
}
