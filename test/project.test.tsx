/**
 * @jest-environment <rootDir>/test/util/jsdomEnvironment.js
 */
// Only the UI's rule editing interactions are under test, so no real server is needed: the network
// layer is replaced by a stub that records what would have been saved and hands back a promise the
// case controls. It stays pending by default — merging the server's answer back is another case's
// business, and leaving it out keeps every assertion here synchronous.
const mockSaveConfig = jest.fn();
let mockSaveResult: () => Promise<any> = () => new Promise(() => {});

jest.mock('../src/frontend/page/admin/config/configApi', () => ({
  fetchConfig: () => Promise.resolve({}),
  saveConfig: (data: any) => {
    mockSaveConfig(data);
    return mockSaveResult();
  },
  flushConfig: () => Promise.resolve(),
}));

import { act, fireEvent, render } from '@testing-library/react';
import ProjectList from '../src/frontend/page/admin/component/ProjectList';
import { ConfigProvider, useConfig, useConfigActions } from '../src/frontend/page/admin/config/ConfigContext';
import type { ConfigState, Project, Rule, RuleParam } from '../src/frontend/page/admin/types';

describe('project rule input test', () => {
  let container: HTMLElement;
  let config: ConfigState;
  let update: (patch: Partial<ConfigState>) => Promise<ConfigState>;

  // Reads the config and its update() from inside the tree, the way a component would, so a case
  // can seed state and assert on it without a store handle
  function Probe() {
    config = useConfig();
    ({ update } = useConfigActions());
    return null;
  }

  const setProjects = (rules: Partial<Rule>[]) => {
    const project = {
      id: 'p1',
      name: 'project',
      enable: true,
      rules: rules.map((rule, index) => ({
        id: `r${index}`,
        enable: true,
        match: '.*',
        ...rule,
      })),
    } as Project;

    act(() => {
      // Seeding goes through update() like any edit would; whether the save works is another case
      update({ projects: [ project ] }).catch(() => {});
    });
  };

  const getProjects = (): Project[] => config.projects;
  const getRule = (index = 0): Rule => getProjects()[0].rules[index];
  const query = (selector: string) => container.querySelectorAll(selector);
  const row = (index = 0) => query('.rule-item')[index];
  const field = (name: string, index = 0) =>
    row(index).querySelector(`input[name="${name}"]`) as HTMLInputElement;
  const select = (index = 0) => row(index).querySelector('.rule-type') as HTMLSelectElement;
  // Text fields hold a local draft and only commit it on blur
  const edit = (el: HTMLInputElement, value: string) => {
    fireEvent.change(el, { target: { value } });
    fireEvent.blur(el);
  };

  beforeEach(() => {
    localStorage.clear();
    mockSaveConfig.mockClear();
    mockSaveResult = () => new Promise(() => {});
    ({ container } = render(
      <ConfigProvider>
        <Probe />
        <ProjectList />
      </ConfigProvider>,
    ));
  });

  test('render one field per protocol argument', () => {
    setProjects([
      { type: 'http', param: { url: 'https://a.com/b' } },
      { type: 'host', param: { hostname: '1.2.3.4', port: 8080 } },
      { type: 'file', param: { path: '/a/b.js' } },
      { type: 'delay', param: { delay: 1000 } },
      { type: 'status', param: { status: 404, location: null } },
      { type: 'header', param: { 'x-a': '1' } },
      { type: '' },
    ]);

    expect(select(0).value).toEqual('http');
    expect(field('url', 0).value).toEqual('https://a.com/b');
    expect(field('hostname', 1).value).toEqual('1.2.3.4');
    expect(field('port', 1).value).toEqual('8080');
    expect(field('path', 2).value).toEqual('/a/b.js');
    expect(field('delay', 3).value).toEqual('1000');
    expect(field('status', 4).value).toEqual('404');
    // null renders as an empty field, not as the string "null"
    expect(field('location', 4).value).toEqual('');
    expect(field('name', 5).value).toEqual('x-a');
    expect(field('value', 5).value).toEqual('1');
    // A protocol-less rule (hand-written config.json) keeps its empty placeholder option
    expect(select(6).value).toEqual('');
    expect(select(6).options[0].value).toEqual('');
    expect(row(6).querySelectorAll('.rule-param *').length).toEqual(0);
  });

  test('commit a field into param', () => {
    const cases: [Partial<Rule>, string, string, RuleParam][] = [
      [ { type: 'http', param: {} }, 'url', 'https://a.com/b', { url: 'https://a.com/b' } ],
      [ { type: 'host', param: { hostname: '1.2.3.4' } }, 'port', '8080',
        { hostname: '1.2.3.4', port: 8080 } ],
      [ { type: 'file', param: {} }, 'path', ' /a/b.js ', { path: '/a/b.js' } ],
      [ { type: 'delay', param: { delay: 1 } }, 'delay', '1000', { delay: 1000 } ],
      // A number field that can't be parsed falls back to empty, never to NaN
      [ { type: 'status', param: { status: 404 } }, 'status', 'abc', { status: '' } ],
      [ { type: 'status', param: { status: 302 } }, 'location', 'https://a.com/',
        { status: 302, location: 'https://a.com/' } ],
    ];

    cases.forEach(([ rule, name, value, expected ]) => {
      setProjects([ rule ]);
      edit(field(name), value);

      expect(getRule().param).toEqual(expected);
    });
  });

  test('commit a field on Enter', () => {
    setProjects([ { type: 'file', param: {} } ]);

    const input = field('path');
    // Enter commits by blurring the field, so it has to hold focus like it would in a browser
    input.focus();
    fireEvent.change(input, { target: { value: '/a/b.js' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(getRule().param).toEqual({ path: '/a/b.js' });
  });

  test('skip an unchanged field', () => {
    setProjects([ { type: 'file', param: { path: '/a/b.js' } } ]);
    mockSaveConfig.mockClear();

    edit(field('path'), '/a/b.js');

    expect(mockSaveConfig).not.toHaveBeenCalled();
  });

  test('pick the protocol first, which clears the param', () => {
    setProjects([ { type: 'delay', param: { delay: 1000 } } ]);

    fireEvent.change(select(), { target: { value: 'host' } });

    expect(getRule()).toEqual({
      id: 'r0', enable: true, match: '.*', type: 'host', param: {},
    });
    expect(field('hostname').value).toEqual('');
    // Once a protocol is set the empty placeholder option is gone
    expect(Array.from(select().options).map(item => item.value))
      .toEqual([ 'http', 'host', 'file', 'delay', 'status', 'header' ]);
  });

  test('keep an unknown protocol selectable', () => {
    setProjects([ { type: 'websocket', param: { a: '1' } } ]);

    expect(select().value).toEqual('websocket');
    expect(Array.from(select().options).map(item => item.value))
      .toEqual([ 'http', 'host', 'file', 'delay', 'status', 'header', 'websocket' ]);
    // Unknown protocols fall back to the free-form name/value editor
    expect(field('name').value).toEqual('a');
    expect(row().querySelector('.add-pair').textContent).toContain('Add param');
  });

  test('add, edit and remove free-form pairs', () => {
    setProjects([ { type: 'header', param: { 'x-a': '1' } } ]);

    // An unnamed pair can't be sent anywhere, so adding a row alone saves nothing
    mockSaveConfig.mockClear();
    fireEvent.click(row().querySelector('.add-pair'));
    expect(row().querySelectorAll('.rule-pair').length).toEqual(2);
    expect(mockSaveConfig).not.toHaveBeenCalled();

    const names = row().querySelectorAll('input[name="name"]');
    const values = row().querySelectorAll('input[name="value"]');
    edit(names[1] as HTMLInputElement, 'x-b');
    expect(getRule().param).toEqual({ 'x-a': '1', 'x-b': '' });

    edit(values[1] as HTMLInputElement, '2');
    expect(getRule().param).toEqual({ 'x-a': '1', 'x-b': '2' });

    edit(names[0] as HTMLInputElement, 'x-c');
    expect(getRule().param).toEqual({ 'x-c': '1', 'x-b': '2' });

    fireEvent.click(row().querySelectorAll('.remove-pair')[0]);
    expect(getRule().param).toEqual({ 'x-b': '2' });
  });

  test('rebuild pairs when the config changes elsewhere', () => {
    setProjects([ { type: 'header', param: { 'x-a': '1' } } ]);
    edit(field('name'), 'x-b');
    expect(getRule().param).toEqual({ 'x-b': '1' });

    // e.g. the config was saved in another tab and getConfig brought it back
    setProjects([ { type: 'header', param: { 'x-c': '3' } } ]);

    expect(field('name').value).toEqual('x-c');
    expect(field('value').value).toEqual('3');
  });

  test('edit project name and rule match', () => {
    setProjects([ { type: 'delay', param: { delay: 1 } } ]);

    edit(query('.project-item .name')[0] as HTMLInputElement, '  renamed  ');
    expect(getProjects()[0].name).toEqual('renamed');

    edit(field('match'), 'a\\.com');
    expect(getRule().match).toEqual('a\\.com');
  });

  test('toggle enable checkbox', () => {
    setProjects([ { type: 'delay', param: { delay: 1 } } ]);

    fireEvent.click(query('.project-item > .header .enable')[0]);
    expect(getProjects()[0].enable).toEqual(false);

    fireEvent.click(query('.rule-item .enable')[0]);
    expect(getRule().enable).toEqual(false);
  });

  test('toggle open state', () => {
    setProjects([ { type: 'delay', param: { delay: 1 } } ]);

    const content = query('.project-item .content')[0] as HTMLElement;
    expect(content.style.display).toEqual('none');

    fireEvent.click(query('.project-item .open-state')[0]);
    expect(content.style.display).toEqual('');
    expect(JSON.parse(localStorage.getItem('p_opens'))).toEqual({ p1: true });

    fireEvent.click(query('.project-item .open-state')[0]);
    expect(content.style.display).toEqual('none');
  });

  test('add project keeps it open', () => {
    setProjects([]);

    fireEvent.click(query('.add-project')[0]);

    const saved = mockSaveConfig.mock.calls.pop()[0].projects;
    expect(saved.length).toEqual(2);
    expect(saved[1]).toEqual({ id: expect.anything(), name: '', enable: true, rules: [] });
    expect(JSON.parse(localStorage.getItem('p_opens'))[saved[1].id]).toEqual(true);
  });

  test('add and remove rule', () => {
    setProjects([]);

    fireEvent.click(query('.add-rule')[0]);
    expect(getProjects()[0].rules).toEqual([
      { id: expect.anything(), enable: true, match: '', type: 'http', param: {} },
    ]);

    fireEvent.click(query('.remove-rule')[0]);
    expect(getProjects()[0].rules).toEqual([]);
  });

  test('alert when save failed', async () => {
    const alertFn = jest.fn();
    (window as any).alert = alertFn;
    mockSaveResult = () => Promise.reject(new Error('save error'));

    setProjects([ { type: 'delay', param: { delay: 1 } } ]);
    fireEvent.click(query('.remove-project')[0]);

    await new Promise(resolve => setTimeout(resolve));
    expect(alertFn).toHaveBeenCalledWith('save error');
  });
});
