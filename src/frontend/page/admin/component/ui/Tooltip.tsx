import React from 'react';
import './Tooltip.less';
import Icon from './Icon';

/**
 * devtools hangs a tooltip off an info icon wherever a control needs a sentence of explanation.
 */
export default function Tooltip({ text }: {
  text: React.ReactNode;
}) {
  return <div className="tooltip" tabIndex={ 0 }>
    <Icon name="info" />
    <div className="tooltip-content" role="tooltip">
      { text }
    </div>
  </div>;
}
