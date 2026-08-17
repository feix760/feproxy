import 'isomorphic-fetch';
import type { ConfigState } from '../types';

/** How long edits are collected before they go out as one request, see saveConfig */
const SAVE_DELAY = 1000;

function getURL(path: string) {
  return `${typeof publicPath !== 'undefined' ? publicPath.replace(/\/$/, '') : ''}${path}`;
}

export function fetchConfig(): Promise<ConfigState> {
  return fetch(getURL('/getConfig')).then(response => response.json());
}

function postConfig(data: Partial<ConfigState>): Promise<ConfigState> {
  return fetch(getURL('/setConfig'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(data),
  }).then(response => response.json());
}

/** Patches collected for the next request, merged so an earlier field is never dropped */
let pending: Partial<ConfigState> | null = null;
/** The batch waiting out SAVE_DELAY, shared by every caller that joined it */
let queued: Promise<ConfigState> | null = null;
/** Sends the queued batch right away instead of waiting out the delay */
let sendNow: (() => void) | null = null;
/** The request currently on the wire, so flushConfig can wait for it */
let inflight: Promise<unknown> = Promise.resolve();

/**
 * Persist a partial config. Typing in the settings panel commits a patch per field, so patches are
 * batched: the first one opens a SAVE_DELAY window and everything committed inside it is merged
 * into a single request. The batch is released *before* the request goes out, so a patch made while
 * it is in flight opens a new window instead of being swallowed by the one already gone.
 */
export function saveConfig(data: Partial<ConfigState>): Promise<ConfigState> {
  pending = { ...pending, ...data };

  if (!queued) {
    queued = new Promise<void>(resolve => {
      const timer = setTimeout(resolve, SAVE_DELAY);
      sendNow = () => {
        clearTimeout(timer);
        resolve();
      };
    }).then(() => {
      const body = pending;
      pending = null;
      queued = null;
      sendNow = null;
      inflight = postConfig(body);
      return inflight as Promise<ConfigState>;
    });
  }

  return queued;
}

/** Send whatever is still queued and wait for the wire to go quiet. */
export function flushConfig(): Promise<void> {
  if (sendNow) {
    sendNow();
  }
  return Promise.resolve(queued)
    .then(() => inflight)
    .then(() => undefined);
}
