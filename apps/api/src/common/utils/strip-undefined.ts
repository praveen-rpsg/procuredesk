type NonUndefined<T> = Exclude<T, undefined>;

export type StripUndefined<T> = T extends (...args: unknown[]) => unknown
  ? T
  : T extends readonly (infer Item)[]
    ? StripUndefined<Item>[]
    : T extends object
      ? {
          [Key in keyof T as undefined extends T[Key] ? Key : never]?: StripUndefined<NonUndefined<T[Key]>>;
        } & {
          [Key in keyof T as undefined extends T[Key] ? never : Key]: StripUndefined<T[Key]>;
        }
      : T;

export function stripUndefined<T>(value: T): StripUndefined<T> {
  if (Array.isArray(value)) {
    const items = value as unknown[];
    return items.map((item) => stripUndefined(item)) as StripUndefined<T>;
  }

  if (value && typeof value === "object") {
    const prototype: unknown = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      return value as StripUndefined<T>;
    }

    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entryValue]) => entryValue !== undefined)
        .map(([key, entryValue]) => [key, stripUndefined(entryValue)]),
    ) as StripUndefined<T>;
  }

  return value as StripUndefined<T>;
}
