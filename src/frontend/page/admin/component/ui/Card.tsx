import './Card.less';
import type { ReactNode } from 'react';

/**
 * devtools' settings card: a heading above a rounded box whose direct children are the rows.
 * `footer` holds the actions that sit below the box, still inside the card.
 */
export default function Card({ heading, className, footer, children }: {
  heading: string;
  className?: string;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return <div className={ `settings-card${className ? ` ${className}` : ''}` }>
    <div className="card-heading">{ heading }</div>
    <div className="card-content">{ children }</div>
    { footer }
  </div>;
}
