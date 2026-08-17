/** The enable checkbox used by every togglable row; styled globally in theme.less. */
export default function Checkbox({ checked, onChange }: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return <input className="enable"
    type="checkbox"
    checked={ checked }
    onChange={ e => onChange(e.target.checked) }
  />;
}
