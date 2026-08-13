/**
 * @jest-environment <rootDir>/test/util/jsdomEnvironment.js
 */
// 只测 UI 的规则编解码与交互, 不需要真的起服务,
// 所以把 setConfig 换成同步 dispatch 的替身, 顺带能造出保存失败的分支。
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
import type { Project, Rule } from '../src/frontend/page/admin/types';

describe('project rule display test', () => {
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
  const query = (selector: string) => container.querySelectorAll(selector);
  const toInputs = () => Array.from(query('.rule-item .input[data-placeholder="to"]'));
  // jsdom 没实现 innerText, 手动挂一个再触发 focusout(React 17+ 的 onBlur 监听的是它)
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

  test('render param as to string', () => {
    setProjects([
      { type: 'http', param: { url: 'https://a.com/b' } },
      { type: 'status', param: { status: 302, location: 'https://a.com/' } },
      { type: 'status', param: { status: 404, location: null } },
      { type: 'delay', param: { delay: 1000 } },
      { type: 'delay', param: {} },
      { type: 'host', param: { hostname: '1.2.3.4', port: 8080 } },
      { type: 'host', param: { hostname: '1.2.3.4' } },
      { type: 'file', param: { path: '/a/b.js' } },
      { type: 'unknown', param: { a: '1' } },
      { type: 'http' },
      { type: '', param: {} },
    ]);

    expect(toInputs().map(el => el.textContent)).toEqual([
      'https://a.com/b',
      'status://302?location=https%3A%2F%2Fa.com%2F',
      'status://404?location=',
      'delay://1000',
      'delay://0',
      'host://1.2.3.4:8080',
      'host://1.2.3.4',
      'file:///a/b.js',
      'unknown://?a=1',
      '',
      '',
    ]);
  });

  test('parse to string back to param', () => {
    const cases: [string, Partial<Rule>][] = [
      [ 'https://a.com/b', { type: 'http', param: { url: 'https://a.com/b' } } ],
      [ 'http://a.com/b', { type: 'http', param: { url: 'http://a.com/b' } } ],
      [ 'status://302?location=https%3A%2F%2Fa.com%2F',
        { type: 'status', param: { status: 302, location: 'https://a.com/' } } ],
      [ 'status://', { type: 'status', param: { status: 0 } } ],
      [ 'delay://1000', { type: 'delay', param: { delay: 1000 } } ],
      [ 'delay://', { type: 'delay', param: { delay: '' } } ],
      [ 'host://1.2.3.4:8080', { type: 'host', param: { hostname: '1.2.3.4', port: 8080 } } ],
      [ 'host://1.2.3.4', { type: 'host', param: { hostname: '1.2.3.4', port: '' } } ],
      [ 'host://', { type: 'host', param: { hostname: '', port: '' } } ],
      [ 'file:///a/b.js', { type: 'file', param: { path: '/a/b.js' } } ],
      [ 'unknown://?a=1', { type: 'unknown', param: { a: '1' } } ],
      [ '', { type: '', param: {} } ],
    ];

    cases.forEach(([ to, expected ]) => {
      setProjects([ { type: 'delay', param: { delay: 1 } } ]);
      editBlur(toInputs()[0], to);

      expect(getProjects()[0].rules[0]).toEqual({
        id: 'r0',
        enable: true,
        match: '.*',
        ...expected,
      });
    });
  });

  test('edit project name and rule match', () => {
    setProjects([ { type: 'delay', param: { delay: 1 } } ]);

    editBlur(query('.project-item .name')[0], '  renamed  ');
    expect(getProjects()[0].name).toEqual('renamed');

    editBlur(query('.rule-item .input[data-placeholder="match"]')[0], 'a\\.com');
    expect(getProjects()[0].rules[0].match).toEqual('a\\.com');
  });

  test('toggle enable checkbox', () => {
    setProjects([ { type: 'delay', param: { delay: 1 } } ]);

    fireEvent.click(query('.project-item > .header .enable')[0]);
    expect(getProjects()[0].enable).toEqual(false);

    fireEvent.click(query('.rule-item .enable')[0]);
    expect(getProjects()[0].rules[0].enable).toEqual(false);
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
      { id: expect.anything(), enable: true, match: '', type: '', param: {} },
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
