/**
 * 剔除对象里值为 undefined 的字段
 * 用于合并配置时避免用 undefined 覆盖掉默认值
 */
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

