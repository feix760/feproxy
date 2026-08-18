import React, { useEffect, useRef, useState } from 'react';
import './PairFields.less';
import type { RuleParam } from '../types';
import { toText } from './ruleTypes';
import AddButton from './ui/AddButton';
import IconButton from './ui/IconButton';
import TextField from './ui/TextField';

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
export default function PairFields({ label, param, onChange }: {
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
        <IconButton className="remove-pair micro"
          name="cross"
          title="Remove"
          onClick={ () => commit(pairs.filter(item => item.id !== pair.id)) }
        />
      </div>
    )) }
    <AddButton className="add-pair"
      label={ label }
      onClick={ () => setPairs([ ...pairs, { id: ++pairId, name: '', value: '' } ]) }
    />
  </div>;
}
