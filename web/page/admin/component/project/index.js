import React from 'react';
import { connect } from 'react-redux';
import { Button, Checkbox, Input, Collapse, Tabs, Table, Message, MessageBox } from 'element-react';
import { setConfig } from '../../action/config';
import './index.scss';

class Component extends React.Component {
  setProjects() {
    const { activeProjects, projects } = this.props.config;
    this.props.setConfig({
      projects,
      activeProjects,
    })
      .catch(() => {
        Message('save error');
      });
  }

  addProject = () => {
    const { config } = this.props;
    const { projects, activeProjects } = config;

    activeProjects.push(projects.length + '');

    projects.push({
      id: Date.now(),
      name: '',
      enable: false,
      rules: [],
      hosts: [],
    });

    this.setProjects();
  }

  onChange(obj, key) {
    return value => {
      const oldValue = obj[key];
      if (typeof value !== 'object' && value !== oldValue
        || (value instanceof Array && value.join(',') !== oldValue.join(','))
      ) {
        obj[key] = value;

        this.setProjects();
      }
    };
  }

  onDelete(list, item) {
    return () => {
      MessageBox.confirm('Are you sure to delete ?', 'Confirm', {
        type: 'warning',
      })
        .then(() => {
          list.splice(list.indexOf(item), 1);

          this.setProjects();
        });
    };
  }

  onAdd(list, type) {
    return () => {
      list.push(type === 'rule' ? {
        id: Date.now(),
        enable: false,
        match: '',
        to: '',
        hostname: '',
      } : {
        id: Date.now(),
        enable: false,
        match: '',
        to: '',
      });
      this.setProjects();
    };
  }

  renderCollapseTitle(item) {
    return (
      <span onClick={e => e.stopPropagation()}>
        <Checkbox checked={item.enable} onChange={this.onChange(item, 'enable')}></Checkbox>
        <Input value={item.name} onChange={this.onChange(item, 'name')}/>
        <Button
          type="text"
          size="small"
          onClick={this.onDelete(this.props.config.projects, item)}
        >Delete</Button>
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
        width: 90,
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
        width: 340,
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
        label: 'IP',
        prop: 'hostname',
        align: 'center',
        width: 160,
        render: row => {
          return <Input
            placeholder="请输入内容"
            value={row.hostname}
            onChange={this.onChange(row, 'hostname')}
          />;
        },
      },
      {
        label: 'Action',
        width: 90,
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
        width: 90,
        align: 'center',
        render: row => {
          return <Checkbox checked={row.enable} onChange={this.onChange(row, 'enable')}></Checkbox>;
        },
      },
      {
        label: 'Host',
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
        label: 'IP',
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
        width: 90,
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
    const { config } = this.props;
    const { projects, activeProjects } = config;
    return (
      <div>
        <div className="box project-box">
          <div className="box-header">
            Projects
            <Button type="primary" icon="plus" onClick={this.addProject}>ADD</Button>
          </div>
          { !projects || !projects.length ? null :
            <Collapse value={activeProjects} onChange={this.onChange(config, 'activeProjects')}>
              {
                projects.map((item, index) => (
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

export default connect(
  state => {
    const { config } = state;
    return {
      config,
    };
  },
  dispatch => {
    return {
      setConfig(data) {
        return dispatch(setConfig(data));
      },
    };
  }
)(Component);
