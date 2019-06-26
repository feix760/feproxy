import { mount, configure } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';
import util from './util';
import Page from '../lib/frontend/page/admin';
import { getConfig, setConfig } from '../lib/frontend/page/admin/action/config';

configure({ adapter: new Adapter() });
describe('site router test', () => {
  let app;
  let page;
  let $root;
  const projects = [
    {
      id: '1',
      name: 'delay all',
      enable: true,
      rules: [{
        id: '2',
        enable: true,
        match: '.*',
        type: 'delay',
        param: {
          delay: 1000,
        },
      }],
    },
  ];
  beforeAll(async () => {
    app = await util.startApp();

    // page ajax url prefix
    global.publicPath = util.getURL(app);

    app.config.update({
      projects,
    });

    page = new Page();

    await page.loadData();

    $root = mount(page.render());
  });

  afterAll(async () => {
    await util.stopApp(app);
  });

  test('count project', async () => {
    expect($root.find('.project-item').length).toEqual(1);
  });

  const countProject = $root => $root.find('.project-item').length;

  test('add project', async () => {
    const oldLen = countProject($root);
    $root.find('.add-project').simulate('click');
    expect(countProject($root)).toEqual(oldLen + 1);
  });

  test('remove project', async () => {
    const oldLen = countProject($root);
    $root.find('.remove-project').at(0).simulate('click');
    expect(countProject($root)).toEqual(oldLen - 1);
  });

  test('add rule', async () => {
    const $project = $root.find('.project-item').at(0);
    const oldLen = $project.find('.rule-item').length;
    $project.find('.add-rule').simulate('click');
    expect($root.find('.project-item').at(0).find('.rule-item').length).toEqual(oldLen + 1);
  });

  test('remove rule', async () => {
    const $project = $root.find('.project-item').at(0);
    const oldLen = $project.find('.rule-item').length;
    $project.find('.remove-rule').at(0).simulate('click');
    expect($root.find('.project-item').at(0).find('.rule-item').length).toEqual(oldLen - 1);
  });

  test('set config', async () => {
    await page.store.dispatch(setConfig({
      https: false,
    }));

    expect(app.config.https).toEqual(false);

    await page.store.dispatch(getConfig());

    expect(page.store.getState().config.https).toEqual(false);
  });
});
