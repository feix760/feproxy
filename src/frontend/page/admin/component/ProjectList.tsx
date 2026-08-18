import React, { useCallback, useState } from 'react';
import './ProjectList.less';
import { useConfig, useConfigActions } from '../config/ConfigContext';
import type { Project } from '../types';
import ProjectItem from './ProjectItem';
import AddButton from './ui/AddButton';
import Card from './ui/Card';

/** Which projects are expanded, remembered across reloads */
const OPENS_KEY = 'p_opens';

export default function ProjectList() {
  const { projects } = useConfig();
  const { update } = useConfigActions();

  const [ opens, setOpens ] = useState<Record<string, boolean>>(
    () => JSON.parse(localStorage.getItem(OPENS_KEY) || '{}') || {},
  );

  const toggleOpen = useCallback((key: string | number) => {
    setOpens(prev => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem(OPENS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const save = useCallback((next: Project[]) => {
    update({ projects: next })
      .catch(() => {
        alert('save error');
      });
  }, [ update ]);

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

  return <Card className="projects-card"
    heading="Projects"
    footer={ <AddButton className="add-project" label="Add project" onClick={ addProject } /> }
  >
    { projects.map(item => (
      <ProjectItem key={ item.id }
        project={ item }
        open={ !!opens[item.id] }
        onToggleOpen={ () => toggleOpen(item.id) }
        onChange={ patch => save(projects.map(p => (p.id === item.id ? { ...p, ...patch } : p))) }
        onRemove={ () => save(projects.filter(p => p.id !== item.id)) }
      />
    )) }
  </Card>;
}
