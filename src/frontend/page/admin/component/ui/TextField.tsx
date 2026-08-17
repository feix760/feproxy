import { useEffect, useState } from 'react';
import type { KeyboardEvent } from 'react';

/**
 * Text input holding a local draft: typing must not go through the config state, since every update
 * schedules a (batched) save request. The draft is committed on blur or Enter, the same interaction
 * the rule row had when it was a contentEditable.
 */
export default function TextField({ className, value, placeholder, onCommit, name }: {
  className: string;
  value: string;
  placeholder: string;
  onCommit: (value: string) => void;
  /** Param key this field edits, exposed as the input name so it can be targeted */
  name?: string;
}) {
  const [ draft, setDraft ] = useState(value);

  // Pick up changes made elsewhere (a config reload while the panel is open)
  useEffect(() => setDraft(value), [ value ]);

  const commit = () => {
    const next = draft.trim();
    setDraft(next);
    if (next !== value) {
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
