/**
 * @jest-environment jsdom
 */
// brotli ships an emscripten bundle that takes the browser branch when `window`
// exists and then blows up; it is only a node<10 fallback and unused here.
jest.mock('brotli', () => ({ decompress: () => Buffer.alloc(0) }));

import { act, fireEvent, render } from '@testing-library/react';
import Page from '../src/frontend/page/admin';
import { getConfig, setConfig } from '../src/frontend/page/admin/action/config';
import type { FeproxyApp } from '../src/types';
import * as util from './util/util';

describe('site router test', () => {
  let app: FeproxyApp;
  let page: InstanceType<typeof Page>;
  let container: HTMLElement;
  const projects = [
    {
      id: '1',
      name: 'delay all',
      enable: true,
      rules: [ {
        id: '2',
        enable: true,
        match: '.*',
        type: 'delay',
        param: {
          delay: 1000,
        },
      } ],
    },
  ];

  const countProject = () => container.querySelectorAll('.project-item').length;
  const countRule = () => container.querySelectorAll('.project-item .rule-item').length;
  const click = (selector: string) => {
    fireEvent.click(container.querySelector(selector));
  };

  beforeAll(async () => {
    app = await util.startApp();

    // page ajax url prefix
    (global as any).publicPath = util.getURL(app);

    app.config.update({
      projects,
    });

    page = new Page();

    await page.loadData();
  });

  // RTL unmounts after every test, so remount each time; the store is shared so
  // state carries over between cases just like the previous single-mount setup.
  beforeEach(() => {
    ({ container } = render(page.render()));
  });

  afterAll(async () => {
    // flush the pending debounced setConfig so no request lands after teardown
    await page.store.dispatch(setConfig({}));
    await util.stopApp(app);
  });

  test('count project', async () => {
    expect(countProject()).toEqual(1);
  });

  test('add project', async () => {
    const oldLen = countProject();
    click('.add-project');
    expect(countProject()).toEqual(oldLen + 1);
  });

  test('remove project', async () => {
    const oldLen = countProject();
    click('.remove-project');
    expect(countProject()).toEqual(oldLen - 1);
  });

  test('add rule', async () => {
    const oldLen = countRule();
    click('.add-rule');
    expect(countRule()).toEqual(oldLen + 1);
  });

  test('remove rule', async () => {
    const oldLen = countRule();
    click('.remove-rule');
    expect(countRule()).toEqual(oldLen - 1);
  });

  test('set config', async () => {
    await act(() => page.store.dispatch(setConfig({
      https: false,
    })));

    expect(app.config.https).toEqual(false);

    await act(() => page.store.dispatch(getConfig()));

    expect(page.store.getState().config.https).toEqual(false);
  });
});
