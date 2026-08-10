/**
 * @jest-environment jsdom
 */
jest.mock('brotli', () => ({ decompress: () => Buffer.alloc(0) }));
import { render } from '@testing-library/react';
import Page from '../src/frontend/page/admin';
import * as util from './util/util';

test('dbg', async () => {
  const app = await util.startApp();
  (global as any).publicPath = util.getURL(app);
  app.config.update({ projects: [ { id: '1', name: 'delay all', enable: true, rules: [] } ] });
  const page = new Page();
  await page.loadData();
  const { container } = render(page.render());
  console.log(container.innerHTML.slice(0, 3000));
  await util.stopApp(app);
});
