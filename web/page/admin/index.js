import React from 'react';
import ReactDOM from 'react-dom';
import { Provider, connect } from 'react-redux';
import { Button, Checkbox, Input, Collapse, Tabs, Table, Message } from 'element-react';
import store from './store';

import './reset.scss';
import 'element-theme-default';
import './index.scss';

class Component extends React.Component {
  constructor() {
    super(...arguments);
    this.state = {
      activeProjects: [],
      projects: null,
    };
  }

  componentDidMount() {
    this.getProjects();
  }

  getProjects() {
    fetch('/getConfig')
      .then(response => response.json())
      .then(({ projects, activeProjects }) => {
        this.setState({
          projects,
          activeProjects,
        });
      });
  }

  dispathSetProjects() {
    if (this._setProjects) {
      clearTimeout(this._setProjects);
    }
    this._setProjects = setTimeout(() => this.setProjects(), 500);
  }

  setProjects() {
    const { activeProjects, projects } = this.state;
    fetch('/setConfig', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        projects,
        activeProjects,
      }),
    })
      .then(response => response.json())
      .catch(() => {
        Message('保存配置失败');
      });
  }

  addProject = () => {
    const { projects, activeProjects } = this.state;
    this.setState({
      projects: [
        ...projects,
        {
          id: Date.now(),
          name: '',
          enable: false,
          rules: [],
          hosts: [],
        },
      ],
      activeProjects: [
        ...activeProjects,
        projects.length + '',
      ],
    });
    this.dispathSetProjects();
  }

  onChange(obj, key) {
    return value => {
      const oldValue = obj[key];
      if (typeof value !== 'object' && value !== oldValue
        || (value instanceof Array && value.join(',') !== oldValue.join(','))
      ) {
        obj[key] = value;
        this.setState({
          ...this.state,
        });
        this.dispathSetProjects();
      }
    };
  }

  onDelete(list, item) {
    return () => {
      list.splice(list.indexOf(item), 1);
      this.setState({
        projects: this.state.projects,
      });
      this.dispathSetProjects();
    };
  }

  onAdd(list, type) {
    return () => {
      list.push(type === 'rule' ? {
        id: Date.now(),
        enable: false,
        match: '',
        to: '',
      } : {
        id: Date.now(),
        enable: false,
        host: '',
        ip: '',
      });
      this.setState({
        projects: this.state.projects,
      });
      this.dispathSetProjects();
    };
  }

  renderCollapseTitle(item) {
    return (
      <span onClick={e => e.stopPropagation()}>
        <Checkbox checked={item.enable} onChange={this.onChange(item, 'enable')}></Checkbox>
        <Input value={item.name} onChange={this.onChange(item, 'name')}/>
        <Button type="text" size="small" onClick={this.onDelete(this.state.projects, item)}>Delete</Button>
      </span>
    );
  }

  renderCollapseItem(item) {
    return (
      <Tabs activeName="1">
        <Tabs.Pane label="Rule" name="1">
          { this.renderRulePane(item) }
        </Tabs.Pane>
        <Tabs.Pane label="Host" name="2">
          { this.renderHostPane(item) }
        </Tabs.Pane>
      </Tabs>
    );
  }

  renderRulePane(item) {
    const columns = [
      {
        label: 'Enable',
        prop: 'enable',
        width: 100,
        align: 'center',
        render: row => {
          return <Checkbox checked={row.enable} onChange={this.onChange(row, 'enable')}></Checkbox>;
        },
      },
      {
        label: 'Match',
        prop: 'match',
        align: 'center',
        render: row => {
          return <Input
            placeholder="请输入内容"
            value={row.match}
            onChange={this.onChange(row, 'match')}
          />;
        },
      },
      {
        label: 'To',
        prop: 'to',
        align: 'center',
        render: row => {
          return <Input
            placeholder="请输入内容"
            value={row.to}
            onChange={this.onChange(row, 'to')}
          />;
        },
      },
      {
        label: 'Action',
        width: 100,
        align: 'center',
        render: row => {
          return <span>
            <Button
              type="text"
              size="small"
              onClick={this.onDelete(item.rules, row)}>Delete</Button>
          </span>;
        },
      },
    ];

    return (
      <div>
        <Table
          style={{ width: '100%' }}
          columns={columns}
          data={item.rules}
          border={true}
          rowKey={ row => row.id }
        />
        <div className="add-row" onClick={this.onAdd(item.rules, 'rule')}>
          <i className="el-icon-plus"></i>
        </div>
      </div>
    );
  }

  renderHostPane(item) {
    const columns = [
      {
        label: 'Enable',
        prop: 'enable',
        width: 100,
        align: 'center',
        render: row => {
          return <Checkbox checked={row.enable} onChange={this.onChange(row, 'enable')}></Checkbox>;
        },
      },
      {
        label: 'Host',
        prop: 'host',
        align: 'center',
        render: row => {
          return <Input
            placeholder="请输入内容"
            value={row.host}
            onChange={this.onChange(row, 'host')}
          />;
        },
      },
      {
        label: 'IP',
        prop: 'ip',
        align: 'center',
        render: row => {
          return <Input
            placeholder="请输入内容"
            value={row.ip}
            onChange={this.onChange(row, 'ip')}
          />;
        },
      },
      {
        label: 'Action',
        width: 100,
        align: 'center',
        render: row => {
          return <span>
            <Button
              type="text"
              size="small"
              onClick={this.onDelete(item.hosts, row)}>Delete</Button>
          </span>;
        },
      },
    ];

    return (
      <div>
        <Table
          style={{ width: '100%' }}
          columns={columns}
          data={item.hosts}
          border={true}
          rowKey={ row => row.id }
        />
        <div className="add-row" onClick={this.onAdd(item.hosts, 'host')}>
          <i className="el-icon-plus"></i>
        </div>
      </div>
    );
  }

  render() {
    const { state } = this;
    return (
      <div>
        <div className="box project-box">
          <div className="box-header">
            Projects
            <Button type="primary" icon="plus" onClick={this.addProject}>新增</Button>
          </div>
          { !state.projects || !state.projects.length ? null :
            <Collapse value={state.activeProjects} onChange={this.onChange(state, 'activeProjects')}>
              {
                state.projects.map((item, index) => (
                  <Collapse.Item title={this.renderCollapseTitle(item)} key={index} name={index + ''}>
                    { this.renderCollapseItem(item) }
                  </Collapse.Item>
                ))
              }
            </Collapse>
          }
        </div>
      </div>
    );
  }
}

var Root = connect(state => {
  return state;
})(Component);

ReactDOM.render(
  <Provider store={ store }>
    <Root />
  </Provider>,
  document.getElementById('app')
);
