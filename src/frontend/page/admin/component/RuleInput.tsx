import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import './RuleInput.less';
import type { Rule, RuleParam } from '../types';
import Icon from './Icon';

/** One editable entry of a rule param. */
interface FieldDef {
  key: string;
  placeholder: string;
  /** Store the value as a number, the shape the proxy plugins expect */
  number?: boolean;
  /** Narrow fixed-width field (ports, status codes) instead of a stretching one */
  narrow?: boolean;
}

interface TypeDef {
  fields?: FieldDef[];
  /** Free-form name/value pairs instead of fixed fields, and the label of its add button */
  pairs?: string;
}

// The protocol of a rule is its plugin type; the fields mirror the param each plugin reads, see
// src/proxy/*.ts. Order follows the select, cheapest-to-explain first.
const RULE_TYPES: Record<string, TypeDef> = {
  http: { fields: [ { key: 'url', placeholder: 'http://host/path, $1 for a capture group' } ] },
  host: {
    fields: [
      { key: 'hostname', placeholder: 'hostname or ip' },
      { key: 'port', placeholder: 'port', number: true, narrow: true },
    ],
  },
  file: { fields: [ { key: 'path', placeholder: 'local file path' } ] },
  delay: { fields: [ { key: 'delay', placeholder: 'milliseconds', number: true } ] },
  status: {
    fields: [
      { key: 'status', placeholder: 'code', number: true, narrow: true },
      { key: 'location', placeholder: 'location, 3xx only' },
    ],
  },
  header: { pairs: 'Add header' },
};

// Types we don't know (a hand-written config.json, or `websocket`, which takes no param) still have
// to be editable, so they fall back to the generic name/value editor.
const UNKNOWN_TYPE: TypeDef = { pairs: 'Add param' };

const getTypeDef = (type: string) => RULE_TYPES[type] || UNKNOWN_TYPE;

const toText = (value: any) => (value === null || value === undefined ? '' : String(value));

const toNumber = (value: string) => {
  const num = parseInt(value, 10);
  return isNaN(num) ? '' : num;
};

interface TextFieldProps {
  className: string;
  value: any;
  placeholder: string;
  onCommit: (value: string) => void;
  /** Param key this field edits, exposed as the input name so it can be targeted */
  name?: string;
}

/**
 * Text input holding a local draft: typing must not go through redux, since every store update
 * schedules a (debounced) setConfig request. The draft is committed on blur or Enter, the same
 * interaction the rule row had when it was a contentEditable.
 */
function TextField({ className, value, placeholder, onCommit, name }: TextFieldProps) {
  const text = toText(value);
  const [ draft, setDraft ] = useState(text);

  // Pick up changes made elsewhere (a config reload while the panel is open)
  useEffect(() => setDraft(text), [ text ]);

  const commit = () => {
    const next = draft.trim();
    setDraft(next);
    if (next !== text) {
      onCommit(next);
    }
  };

  return <input className={ className }
    type="text"
    name={ name }
    value={ draft }
    placeholder={ placeholder }
    spellCheck={ false }
    onChange={ e => setDraft(e.target.value) }
    onBlur={ commit }
    onKeyDown={ (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.currentTarget.blur();
      }
    } }
  />;
}

interface Pair {
  id: number;
  name: string;
  value: string;
}

let pairId = 0;

const toPairs = (param: RuleParam): Pair[] =>
  Object.keys(param || {}).map(name => ({ id: ++pairId, name, value: toText(param[name]) }));

const toPairParam = (pairs: Pair[]): RuleParam => {
  const param: RuleParam = {};
  // A pair without a name can't be sent anywhere, so it only lives in the UI
  pairs.filter(pair => pair.name).forEach(pair => {
    param[pair.name] = pair.value;
  });
  return param;
};

/** Name/value list for params with no fixed shape, e.g. the response headers of the header rule. */
function PairFields({ label, param, onChange }: {
  label: string;
  param: RuleParam;
  onChange: (param: RuleParam) => void;
}) {
  const [ pairs, setPairs ] = useState(() => toPairs(param));
  // Our own commits hand back the very object we built, so identity tells them apart from an
  // outside change — only the latter may rebuild the list (and drop unnamed pairs being typed).
  const committed = useRef(param);

  useEffect(() => {
    if (param !== committed.current) {
      setPairs(toPairs(param));
    }
  }, [ param ]);

  const commit = (next: Pair[]) => {
    setPairs(next);
    const wire = toPairParam(next);
    committed.current = wire;
    onChange(wire);
  };

  const patch = (id: number, values: Partial<Pair>) =>
    commit(pairs.map(pair => (pair.id === id ? { ...pair, ...values } : pair)));

  return <div className="rule-pairs">
    { pairs.map(pair => (
      <div className="rule-pair" key={ pair.id }>
        <TextField className="text-input pair-name"
          name="name"
          value={ pair.name }
          placeholder="name"
          onCommit={ name => patch(pair.id, { name }) }
        />
        <TextField className="text-input pair-value"
          name="value"
          value={ pair.value }
          placeholder="value"
          onCommit={ value => patch(pair.id, { value }) }
        />
        <button type="button"
          className="icon micro remove-pair"
          title="Remove"
          onClick={ () => commit(pairs.filter(item => item.id !== pair.id)) }
        >
          <Icon name="cross" />
        </button>
      </div>
    )) }
    <button type="button"
      className="add-pair text text-with-icon"
      onClick={ () => setPairs([ ...pairs, { id: ++pairId, name: '', value: '' } ]) }
    >
      <Icon name="plus" />
      { label }
    </button>
  </div>;
}

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
      value={ rule.match }
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
            value={ param[field.key] }
            placeholder={ field.placeholder }
            onCommit={ value => onChange({
              param: { ...param, [field.key]: field.number ? toNumber(value) : value },
            }) }
          />
        ))) }
    </div>
  </>;
}

