/** One editable entry of a rule param. */
export interface FieldDef {
  key: string;
  placeholder: string;
  /** Store the value as a number, the shape the proxy plugins expect */
  number?: boolean;
  /** Narrow fixed-width field (ports, status codes) instead of a stretching one */
  narrow?: boolean;
}

export interface TypeDef {
  fields?: FieldDef[];
  /** Free-form name/value pairs instead of fixed fields, and the label of its add button */
  pairs?: string;
}

// The protocol of a rule is its plugin type; the fields mirror the param each plugin reads, see
// src/proxy/*.ts. Order follows the select, cheapest-to-explain first.
export const RULE_TYPES: Record<string, TypeDef> = {
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

export const getTypeDef = (type: string) => RULE_TYPES[type] || UNKNOWN_TYPE;

/** Param values are whatever config.json holds — number, null, missing — but a field shows text */
export const toText = (value: any) => (value === null || value === undefined ? '' : String(value));

export const toNumber = (value: string) => {
  const num = parseInt(value, 10);
  return isNaN(num) ? '' : num;
};
