/** The enable checkbox used by every togglable row; styled globally in theme.less. */
export default function Checkbox({ checked, disabled, onChange }: {
  checked: boolean;
  /** Shows the value without letting it be edited, for fields the server refuses to write */
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return <input className="enable"
    type="checkbox"
    checked={ checked }
    disabled={ disabled }
    onChange={ e => onChange(e.target.checked) }
  />;
}
