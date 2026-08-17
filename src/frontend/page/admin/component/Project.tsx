import { useCallback, useState } from 'react';
import type { ChangeEvent, FocusEvent } from 'react';
import './Project.less';
import { setConfig } from '../action/config';
import { useAppDispatch, useAppSelector } from '../hooks';
import type { Project, Rule } from '../types';
import Icon from './Icon';
import RuleInput from './RuleInput';

// contentEditable keeps whatever the user typed; write the trimmed value back so the
// DOM matches what we store (React will not re-render an unchanged dangerouslySetInnerHTML).
const readEditable = (e: FocusEvent<HTMLElement>) => {
  const value = e.target.innerText.trim();
  e.target.innerHTML = value;
  return value;
};

export default function ProjectList() {
  const dispatch = useAppDispatch();
  const projects = useAppSelector(state => state.config.projects);

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

  const save = useCallback((next: Project[]) => {
    dispatch(setConfig({ projects: next }))
      .catch(() => {
        alert('save error');
      });
  }, [ dispatch ]);

  const updateProject = useCallback((id: Project['id'], patch: Partial<Project>) => {
    save(projects.map(item => (item.id === id ? { ...item, ...patch } : item)));
  }, [ projects, save ]);

  const updateRule = useCallback((projectId: Project['id'], ruleId: Rule['id'], patch: Partial<Rule>) => {
    updateProject(projectId, {
      rules: projects.find(item => item.id === projectId)
        .rules.map(rule => (rule.id === ruleId ? { ...rule, ...patch } : rule)),
    });
  }, [ projects, updateProject ]);

  const addProject = useCallback(() => {
    const item: Project = {
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
      // Forwarding is what rules are used for most of the time, so start there instead of on an
      // empty protocol, which would only make the rule a no-op
      rules: [ ...project.rules, {
        id: Date.now(),
        type: 'http',
        enable: true,
        match: '',
        param: {},
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
                    <RuleInput rule={ rule }
                      onChange={ patch => updateRule(item.id, rule.id, patch) }
                    />
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
