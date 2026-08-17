import './AddButton.less';
import Icon from './Icon';

/** The "＋ Add something" action below a list; `className` is the caller's own hook class. */
export default function AddButton({ label, className, onClick }: {
  label: string;
  className: string;
  onClick: () => void;
}) {
  return <button type="button"
    className={ `add-button text text-with-icon ${className}` }
    onClick={ onClick }
  >
    <Icon name="plus" />
    { label }
  </button>;
}
