/**
 * @jest-environment <rootDir>/test/util/jsdomEnvironment.js
 */
// Only the UI's rule editing interactions are under test, so no real server is needed: setConfig is
// replaced by a synchronous dispatching stub, which also lets us fake a failed save.
const mockSetConfig = jest.fn();
let mockSetConfigResult: () => Promise<any> = () => Promise.resolve({});

jest.mock('../src/frontend/page/admin/action/config', () => ({
  UPDATE_CONFIG: 'UPDATE_CONFIG',
  getConfig: () => () => Promise.resolve({}),
  setConfig: (data: any) => (dispatch: any) => {
    mockSetConfig(data);
    dispatch({ type: 'UPDATE_CONFIG', data });
    return mockSetConfigResult();
  },
}));

import { act, fireEvent, render } from '@testing-library/react';
import { Provider } from 'react-redux';
import ProjectList from '../src/frontend/page/admin/component/Project';
import createStore from '../src/frontend/page/admin/createStore';
import type { Project, Rule, RuleParam } from '../src/frontend/page/admin/types';

describe('project rule input test', () => {
  let store: ReturnType<typeof createStore>;
  let container: HTMLElement;

  const setProjects = (rules: Partial<Rule>[]) => {
    act(() => {
      store.dispatch({
        type: 'UPDATE_CONFIG',
        data: {
          projects: [ {
            id: 'p1',
            name: 'project',
            enable: true,
            rules: rules.map((rule, index) => ({
              id: `r${index}`,
              enable: true,
              match: '.*',
              ...rule,
            })),
          } ],
        },
      } as any);
    });
  };

  const getProjects = (): Project[] => (store.getState() as any).config.projects;
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
  // jsdom has no innerText: set one by hand, then fire focusout (what React 17+ onBlur listens to)
  const editBlur = (el: Element, value: string) => {
    (el as any).innerText = value;
    fireEvent.focusOut(el);
  };

  beforeEach(() => {
    localStorage.clear();
    mockSetConfig.mockClear();
    mockSetConfigResult = () => Promise.resolve({});
    store = createStore();
    ({ container } = render(
      <Provider store={ store }>
        <ProjectList />
      </Provider>,
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
    mockSetConfig.mockClear();

    edit(field('path'), '/a/b.js');

    expect(mockSetConfig).not.toHaveBeenCalled();
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
    mockSetConfig.mockClear();
    fireEvent.click(row().querySelector('.add-pair'));
    expect(row().querySelectorAll('.rule-pair').length).toEqual(2);
    expect(mockSetConfig).not.toHaveBeenCalled();

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

    editBlur(query('.project-item .name')[0], '  renamed  ');
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

    const saved = mockSetConfig.mock.calls.pop()[0].projects;
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
    mockSetConfigResult = () => Promise.reject(new Error('save error'));

    setProjects([ { type: 'delay', param: { delay: 1 } } ]);
    fireEvent.click(query('.remove-project')[0]);

    await Promise.resolve();
    expect(alertFn).toHaveBeenCalledWith('save error');
  });
});

