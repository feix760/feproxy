import { useCallback, useMemo, useState } from 'react';
import type { ChangeEvent, FocusEvent } from 'react';
import './Project.less';
import { setConfig } from '../action/config';
import { useAppDispatch, useAppSelector } from '../hooks';
import type { DisplayProject, DisplayRule, Project, Rule, RuleParam } from '../types';
import Icon from './Icon';

// querystring.stringify renders null/undefined as an empty value; URLSearchParams
// would render the literal string "undefined", so normalise before appending.
const stringifyParam = (param: RuleParam) => {
  const search = new URLSearchParams();
  Object.entries(param).forEach(([ key, value ]) => {
    search.append(key, value === null || value === undefined ? '' : String(value));
  });
  return search.toString();
};

const parseParam = (search: string): RuleParam => Object.fromEntries(new URLSearchParams(search));

const matchSearch = (to: string) => (/\?(.+)$/.test(to) ? RegExp.$1 : '');

const toDisplayRule = (rule: Rule): DisplayRule => {
  const { type, param = {} } = rule;
  const rest = { ...param };
  let to = '';

  if (type === 'http') {
    to = param.url;
  } else if (type === 'status') {
    delete rest.status;
    const search = stringifyParam(rest);
    to = `${type}://${param.status}${search ? '?' + search : ''}`;
  } else if (type === 'delay') {
    to = `${type}://${param.delay || 0}`;
  } else if (type === 'host') {
    to = `${type}://${param.hostname}${param.port ? ':' + param.port : ''}`;
  } else if (type === 'file') {
    to = `${type}://${param.path}`;
  } else if (type) {
    to = `${type}://?${stringifyParam(param)}`;
  }

  const { param: _param, ...display } = rule;
  return { ...display, to };
};

const toWireRule = (rule: DisplayRule): Rule => {
  const { to } = rule;
  let type = /^(\w+):\/\//.test(to) ? RegExp.$1 : '';
  let param: RuleParam;

  if (type === 'http' || type === 'https') {
    param = { url: to };
    type = 'http';
  } else if (type === 'status') {
    param = {
      status: /\/\/(\d+)/.test(to) ? +RegExp.$1 : 0,
      ...parseParam(matchSearch(to)),
    };
  } else if (type === 'delay') {
    param = {
      delay: /\/\/(\d+)/.test(to) ? +RegExp.$1 : '',
      ...parseParam(matchSearch(to)),
    };
  } else if (type === 'host') {
    param = {
      hostname: /\/\/([^:]+)/.test(to) ? RegExp.$1 : '',
      port: /:(\d+)/.test(to) ? +RegExp.$1 : '',
    };
  } else if (type === 'file') {
    param = {
      path: /\/\/(.+)$/.test(to) ? RegExp.$1 : '',
      ...parseParam(matchSearch(to)),
    };
  } else {
    param = parseParam(matchSearch(to));
  }

  const { to: _to, ...wire } = rule;
  return { ...wire, type, param };
};

const toDisplayProjects = (projects: Project[]): DisplayProject[] =>
  projects.map(item => ({ ...item, rules: item.rules.map(toDisplayRule) }));

const toWireProjects = (projects: DisplayProject[]): Project[] =>
  projects.map(item => ({ ...item, rules: item.rules.map(toWireRule) }));

// contentEditable keeps whatever the user typed; write the trimmed value back so the
// DOM matches what we store (React will not re-render an unchanged dangerouslySetInnerHTML).
const readEditable = (e: FocusEvent<HTMLElement>) => {
  const value = e.target.innerText.trim();
  e.target.innerHTML = value;
  return value;
};

export default function ProjectList() {
  const dispatch = useAppDispatch();
  const rawProjects = useAppSelector(state => state.config.projects);
  const projects = useMemo(() => toDisplayProjects(rawProjects), [ rawProjects ]);

  const [ opens, setOpens ] = useState<Record<string, boolean>>(
    () => JSON.parse(localStorage.getItem('p_opens') || '{}') || {},
  );

  const toggleOpen = useCallback((key: string | number) => {
    setOpens(prev => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem('p_opens', JSON.stringify(next));
      return next;
    });
  }, []);

  const save = useCallback((next: DisplayProject[]) => {
    dispatch(setConfig({ projects: toWireProjects(next) }))
      .catch(() => {
        alert('save error');
      });
  }, [ dispatch ]);

  const updateProject = useCallback((id: Project['id'], patch: Partial<DisplayProject>) => {
    save(projects.map(item => (item.id === id ? { ...item, ...patch } : item)));
  }, [ projects, save ]);

  const updateRule = useCallback((projectId: Project['id'], ruleId: Rule['id'], patch: Partial<DisplayRule>) => {
    updateProject(projectId, {
      rules: projects.find(item => item.id === projectId)
        .rules.map(rule => (rule.id === ruleId ? { ...rule, ...patch } : rule)),
    });
  }, [ projects, updateProject ]);

  const addProject = useCallback(() => {
    const item: DisplayProject = {
      id: Date.now(),
      name: '',
      enable: true,
      rules: [],
    };
    toggleOpen(item.id);
    save([ ...projects, item ]);
  }, [ projects, save, toggleOpen ]);

  const removeProject = useCallback((id: Project['id']) => {
    save(projects.filter(item => item.id !== id));
  }, [ projects, save ]);

  const addRule = useCallback((projectId: Project['id']) => {
    const project = projects.find(item => item.id === projectId);
    updateProject(projectId, {
      rules: [ ...project.rules, {
        id: Date.now(),
        type: '',
        enable: true,
        match: '',
        to: '',
      } ],
    });
  }, [ projects, updateProject ]);

  const removeRule = useCallback((projectId: Project['id'], ruleId: Rule['id']) => {
    updateProject(projectId, {
      rules: projects.find(item => item.id === projectId).rules.filter(rule => rule.id !== ruleId),
    });
  }, [ projects, updateProject ]);

  return (
    <div className="settings-card projects-card">
      <div className="card-heading">Projects</div>
      <div className="card-content">
        { projects.map(item => (
          <div className="project-item" key={ item.id }>
            <div className="header">
              <button type="button"
                className="open-state icon micro"
                title={ opens[item.id] ? 'Collapse' : 'Expand' }
                onClick={ () => toggleOpen(item.id) }
              >
                <Icon name={ opens[item.id] ? 'chevron-down' : 'chevron-right' } />
              </button>
              <input className="enable"
                type="checkbox"
                checked={ item.enable }
                onChange={ (e: ChangeEvent<HTMLInputElement>) =>
                  updateProject(item.id, { enable: e.target.checked }) }
              />

              <span className="name"
                contentEditable="true"
                data-placeholder="project name"
                onBlur={ e => updateProject(item.id, { name: readEditable(e) }) }
                dangerouslySetInnerHTML={{ __html: item.name }}
              ></span>

              <button type="button"
                className="icon remove-project"
                title="Remove project"
                onClick={ () => removeProject(item.id) }
              >
                <Icon name="bin" />
              </button>
            </div>
            <div className="content" style={{ display: opens[item.id] ? '' : 'none' }}>
              <ul>
                { item.rules.map(rule => (
                  <li key={rule.id} className="rule-item">
                    <input className="enable"
                      type="checkbox"
                      checked={ rule.enable }
                      onChange={ (e: ChangeEvent<HTMLInputElement>) =>
                        updateRule(item.id, rule.id, { enable: e.target.checked }) }
                    />
                    <div className="input"
                      contentEditable="true"
                      data-placeholder="match"
                      onBlur={ e => updateRule(item.id, rule.id, { match: readEditable(e) }) }
                      dangerouslySetInnerHTML={{ __html: rule.match }}
                    ></div>
                    <div className="input"
                      contentEditable="true"
                      data-placeholder="to"
                      onBlur={ e => updateRule(item.id, rule.id, { to: readEditable(e) }) }
                      dangerouslySetInnerHTML={{ __html: rule.to }}
                    ></div>
                    <button type="button"
                      className="icon remove-rule"
                      title="Remove rule"
                      onClick={ () => removeRule(item.id, rule.id) }
                    >
                      <Icon name="bin" />
                    </button>
                  </li>
                )) }
              </ul>
              <button type="button"
                className="add-rule text text-with-icon"
                onClick={ () => addRule(item.id) }
              >
                <Icon name="plus" />
                Add rule
              </button>
            </div>
          </div>
        ))}
      </div>
      <button type="button"
        className="add-project text text-with-icon"
        onClick={ addProject }
      >
        <Icon name="plus" />
        Add project
      </button>
    </div>
  );
}
