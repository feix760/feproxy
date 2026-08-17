import Icon from './Icon';
import type { IconName } from './Icon';

/**
 * Icon-only button (see the .icon variant in theme.less). `className` carries the caller's own hook
 * class plus optional variants, e.g. "open-state micro".
 */
export default function IconButton({ name, title, className, onClick }: {
  name: IconName;
  title: string;
  className?: string;
  onClick: () => void;
}) {
  return <button type="button"
    className={ `icon${className ? ` ${className}` : ''}` }
    title={ title }
    onClick={ onClick }
  >
    <Icon name={ name } />
  </button>;
}
