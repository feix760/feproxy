/**
 * @jest-environment <rootDir>/test/util/jsdomEnvironment.js
 */
// brotli ships an emscripten bundle that takes the browser branch when `window`
// exists and then blows up; it is only a node<10 fallback and unused here.
jest.mock('brotli', () => ({ decompress: () => Buffer.alloc(0) }));

import { act, fireEvent, render, waitFor } from '@testing-library/react';
import App from '../src/frontend/page/admin/component/App';
import { ConfigProvider } from '../src/frontend/page/admin/config/ConfigContext';
import { fetchConfig, flushConfig } from '../src/frontend/page/admin/config/configApi';
import type { FeproxyApp } from '../src/types';
import * as util from './util/util';

describe('site router test', () => {
  let app: FeproxyApp;
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
  });

  // RTL unmounts after every test, so remount each time. App reads the config on mount, so every
  // case starts from whatever the server holds — including what the case before it saved.
  beforeEach(async () => {
    ({ container } = render(
      <ConfigProvider>
        <App />
      </ConfigProvider>,
    ));

    // The iframe is what waits for the config, so its src appearing means the load landed
    await waitFor(() => expect(container.querySelector('.devtools')).toBeTruthy());
  });

  // Saves are batched and opening the panel kicks off a reload, so let both round trips land while
  // the tree is still mounted — otherwise their state updates escape the case that caused them
  afterEach(async () => {
    await act(async () => {
      await flushConfig();
      await new Promise(resolve => setTimeout(resolve, 50));
    });
  });

  afterAll(async () => {
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

  test('open and close settings', async () => {
    const dialog = container.querySelector('.dialog') as HTMLElement;
    expect(dialog.style.display).toEqual('none');

    act(() => {
      click('.open-settings');
    });
    expect(dialog.style.display).toEqual('');

    act(() => {
      click('.close-button');
    });
    expect(dialog.style.display).toEqual('none');
  });

  test('resize devtools iframe', () => {
    const iframe = container.querySelector('.devtools') as HTMLElement;

    act(() => {
      (window as any).innerWidth = 1000;
      (window as any).innerHeight = 800;
      fireEvent(window, new Event('resize'));
    });

    expect(iframe.style.width).toEqual('1000px');
    expect(iframe.style.height).toEqual('800px');
  });

  test('toggle settings switch', async () => {
    // https is on by default, so the ignoreCertError switch is there from the start
    const switches = () => container.querySelectorAll('.settings-item .enable');
    expect(switches().length).toEqual(3);

    fireEvent.click(switches()[1]);
    expect((switches()[1] as HTMLInputElement).checked).toEqual(true);

    fireEvent.click(switches()[2]);
    expect((switches()[2] as HTMLInputElement).checked).toEqual(false);

    fireEvent.click(switches()[0]);
    // Turning https off makes the ignoreCertError switch disappear
    expect(switches().length).toEqual(2);

    await act(async () => {
      await flushConfig();
    });
    expect(app.config.https).toEqual(false);
    expect(app.config.ignoreCertError).toEqual(true);
    expect(app.config.inspect).toEqual(false);
  });

  test('set config', async () => {
    // Loaded from the server, so it shows what the previous case turned off
    const https = container.querySelector('.settings-item .enable') as HTMLInputElement;
    expect(https.checked).toEqual(false);

    fireEvent.click(https);
    await act(async () => {
      await flushConfig();
    });

    expect(app.config.https).toEqual(true);
    // ...and the server hands the same value back
    expect((await fetchConfig()).https).toEqual(true);
  });
});
