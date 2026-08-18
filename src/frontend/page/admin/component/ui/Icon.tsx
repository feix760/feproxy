import React from 'react';

// devtools' 20x20 Material Symbols icons; path data taken straight from
// node_modules/@chrome-devtools/inspector/{cross,plus,bin,chevron-down,chevron-right,gear,info}.svg.
// Inlined rather than pulled from an icon font, so we share devtools' shapes and can tint them
// with currentColor. The path data is copied verbatim — wrapping it would only make it
// impossible to diff against the upstream svg, hence max-len is off for this block.
/* eslint-disable max-len */
const ICONS: Record<string, { d: string; evenOdd?: boolean }[]> = {
  cross: [ { d: 'M6.062 15 5 13.938 8.938 10 5 6.062 6.062 5 10 8.938 13.938 5 15 6.062 11.062 10 15 13.938 13.938 15 10 11.062z' } ],
  plus: [ { d: 'M9.25 16v-5.25H4v-1.5h5.25V4h1.5v5.25H16v1.5h-5.25V16z' } ],
  bin: [ { d: 'M6.5 17q-.625 0-1.062-.438A1.44 1.44 0 0 1 5 15.5v-10H4V4h4V3h4v1h4v1.5h-1v10q0 .625-.438 1.062A1.44 1.44 0 0 1 13.5 17zm7-11.5h-7v10h7zM8 14h1.5V7H8zm2.5 0H12V7h-1.5z' } ],
  'chevron-down': [ { d: 'm10 13.063-5-5L6.063 7 10 10.938 13.938 7 15 8.063z' } ],
  'chevron-right': [ { d: 'm8 15-1.062-1.062L10.875 10 6.938 6.062 8 5l5 5z' } ],
  info: [ { d: 'M9.25 14h1.5V9h-1.5zM10 7.5a.72.72 0 0 0 .531-.219.72.72 0 0 0 .219-.531.72.72 0 0 0-.219-.531A.72.72 0 0 0 10 6a.72.72 0 0 0-.531.219.72.72 0 0 0-.219.531q0 .312.219.531A.72.72 0 0 0 10 7.5M10 18a7.8 7.8 0 0 1-3.104-.625 8.1 8.1 0 0 1-2.552-1.719 8.1 8.1 0 0 1-1.719-2.552A7.8 7.8 0 0 1 2 10q0-1.667.625-3.115a8.066 8.066 0 0 1 4.271-4.26A7.8 7.8 0 0 1 10 2q1.667 0 3.115.625a8.1 8.1 0 0 1 4.26 4.26Q18 8.333 18 10a7.8 7.8 0 0 1-.625 3.104 8.07 8.07 0 0 1-4.26 4.271A7.8 7.8 0 0 1 10 18m0-1.5q2.708 0 4.604-1.896T16.5 10t-1.896-4.604T10 3.5 5.396 5.396 3.5 10t1.896 4.604T10 16.5' } ],
  gear: [
    { d: 'M8.935 16.094h2.14l.252-1.786.626-.338c.166-.089.32-.178.468-.275l.612-.4 1.72.688 1.063-1.84-1.465-1.147.05-.742c.008-.115.011-.18.011-.243s-.004-.128-.011-.243l-.05-.742 1.466-1.148-1.065-1.84-1.726.69-.612-.4a5 5 0 0 0-.457-.266l-.642-.333-.26-1.823H8.934l-.256 1.808-.626.337a6 6 0 0 0-.468.276l-.615.402-1.72-.694L4.19 7.86l1.47 1.15-.049.743a4 4 0 0 0-.011.243c0 .064.003.128.011.243l.05.746-1.473 1.145 1.057 1.83 1.719-.687.612.4c.148.096.297.182.456.265l.643.333zm-3.446-.717a1.08 1.08 0 0 1-1.325-.476l-1.34-2.32c-.256-.484-.146-1.055.264-1.377l1.12-.87c-.007-.11-.015-.22-.015-.338 0-.11.008-.227.015-.336l-1.113-.872a1.053 1.053 0 0 1-.27-1.376l1.354-2.335a1.05 1.05 0 0 1 1.31-.461l1.325.534q.285-.184.571-.337l.198-1.398c.066-.512.52-.915 1.054-.915h2.709c.541 0 .995.395 1.061.93l.198 1.383q.294.153.578.337l1.318-.527c.52-.19 1.083.022 1.332.476l1.347 2.328a1.076 1.076 0 0 1-.263 1.376l-1.113.871q.012.163.014.337-.002.174-.014.337l1.113.87c.41.33.527.901.27 1.363l-1.361 2.357a1.06 1.06 0 0 1-1.318.461l-1.318-.527q-.285.184-.57.337l-.198 1.398c-.073.498-.527.893-1.069.893H8.644c-.541 0-.995-.395-1.061-.93l-.198-1.383a7 7 0 0 1-.578-.337z', evenOdd: true },
    { d: 'M9.999 12.559a2.562 2.562 0 1 0 0-5.125 2.562 2.562 0 0 0 0 5.125' },
  ],
};
/* eslint-enable max-len */

export type IconName = keyof typeof ICONS;

export default function Icon({ name }: { name: IconName }) {
  return <svg className="devtools-icon"
    width="20"
    height="20"
    viewBox="0 0 20 20"
    aria-hidden="true"
    focusable="false"
  >
    { ICONS[name].map(path => (
      <path key={ path.d.slice(0, 12) }
        d={ path.d }
        fill="currentColor"
        fillRule={ path.evenOdd ? 'evenodd' : undefined }
        clipRule={ path.evenOdd ? 'evenodd' : undefined }
      />
    )) }
  </svg>;
}
