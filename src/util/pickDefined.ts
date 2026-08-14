/** Drop undefined fields, so merging configs can't override defaults with undefined */
export default function pickDefined<T extends Record<string, any>>(obj?: T): Partial<T> {
  const result: Partial<T> = {};

  if (!obj) {
    return result;
  }

  (Object.keys(obj) as (keyof T)[]).forEach(key => {
    if (typeof obj[key] !== 'undefined') {
      result[key] = obj[key];
    }
  });

  return result;
}

