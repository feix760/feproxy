import './RuleItem.less';
import type { Rule } from '../types';
import RuleInput from './RuleInput';
import Checkbox from './ui/Checkbox';
import IconButton from './ui/IconButton';

/** One row of a project's rule list. */
export default function RuleItem({ rule, onChange, onRemove }: {
  rule: Rule;
  onChange: (patch: Partial<Rule>) => void;
  onRemove: () => void;
}) {
  return <li className="rule-item">
    <Checkbox checked={ rule.enable } onChange={ enable => onChange({ enable }) } />
    <RuleInput rule={ rule } onChange={ onChange } />
    <IconButton className="remove-rule"
      name="bin"
      title="Remove rule"
      onClick={ onRemove }
    />
  </li>;
}
