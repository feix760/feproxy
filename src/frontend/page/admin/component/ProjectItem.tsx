import './ProjectItem.less';
import type { Project, Rule } from '../types';
import RuleItem from './RuleItem';
import AddButton from './ui/AddButton';
import Checkbox from './ui/Checkbox';
import IconButton from './ui/IconButton';
import TextField from './ui/TextField';

// Forwarding is what rules are used for most of the time, so a new rule starts there instead of on
// an empty protocol, which would only make it a no-op
const createRule = (): Rule => ({
  id: Date.now(),
  type: 'http',
  enable: true,
  match: '',
  param: {},
});

/** A project: its header row, plus the rule list shown while it is expanded. */
export default function ProjectItem({ project, open, onToggleOpen, onChange, onRemove }: {
  project: Project;
  open: boolean;
  onToggleOpen: () => void;
  onChange: (patch: Partial<Project>) => void;
  onRemove: () => void;
}) {
  const { rules } = project;
  const setRules = (next: Rule[]) => onChange({ rules: next });

  return <div className="project-item">
    <div className="header">
      <IconButton className="open-state micro"
        name={ open ? 'chevron-down' : 'chevron-right' }
        title={ open ? 'Collapse' : 'Expand' }
        onClick={ onToggleOpen }
      />
      <Checkbox checked={ project.enable } onChange={ enable => onChange({ enable }) } />
      <TextField className="text-input name"
        value={ project.name }
        placeholder="project name"
        onCommit={ name => onChange({ name }) }
      />
      <IconButton className="remove-project"
        name="bin"
        title="Remove project"
        onClick={ onRemove }
      />
    </div>
    <div className="content" style={{ display: open ? '' : 'none' }}>
      <ul>
        { rules.map(rule => (
          <RuleItem key={ rule.id }
            rule={ rule }
            onChange={ patch => setRules(rules.map(item => (item.id === rule.id ? { ...item, ...patch } : item))) }
            onRemove={ () => setRules(rules.filter(item => item.id !== rule.id)) }
          />
        )) }
      </ul>
      <AddButton className="add-rule" label="Add rule" onClick={ () => setRules([ ...rules, createRule() ]) } />
    </div>
  </div>;
}
