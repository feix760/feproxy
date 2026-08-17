import './RuleInput.less';
import type { Rule } from '../types';
import PairFields from './PairFields';
import { getTypeDef, RULE_TYPES, toNumber, toText } from './ruleTypes';
import TextField from './ui/TextField';

/**
 * Editor of a single rule: the match regex, then the protocol (= plugin type) and the fields that
 * protocol needs. Picking the protocol first is what makes the rest of the row meaningful, so the
 * param is cleared whenever it changes.
 */
export default function RuleInput({ rule, onChange }: {
  rule: Rule;
  onChange: (patch: Partial<Rule>) => void;
}) {
  const type = rule.type || '';
  const param = rule.param || {};
  const def = getTypeDef(type);
  // Keep an unknown type in the list, otherwise picking it back would be impossible
  const known = Object.keys(RULE_TYPES);
  const types = type && !RULE_TYPES[type] ? [ ...known, type ] : known;

  return <>
    <TextField className="text-input rule-match"
      name="match"
      value={ toText(rule.match) }
      placeholder="match, e.g. ^https?://host/(.*)"
      onCommit={ match => onChange({ match }) }
    />
    <select className={ `rule-type${type ? '' : ' placeholder'}` }
      title="protocol"
      value={ type }
      onChange={ e => onChange({ type: e.target.value, param: {} }) }
    >
      { !type && <option value="">protocol</option> }
      { types.map(item => <option key={ item } value={ item }>{ item === 'http' ? 'http(s)' : item }://</option>) }
    </select>
    <div className="rule-param">
      { type && (def.pairs
        ? <PairFields label={ def.pairs } param={ param } onChange={ next => onChange({ param: next }) } />
        : def.fields.map(field => (
          <TextField key={ field.key }
            className={ `text-input rule-field${field.narrow ? ' narrow' : ''}` }
            name={ field.key }
            value={ toText(param[field.key]) }
            placeholder={ field.placeholder }
            onCommit={ value => onChange({
              param: { ...param, [field.key]: field.number ? toNumber(value) : value },
            }) }
          />
        ))) }
    </div>
  </>;
}
