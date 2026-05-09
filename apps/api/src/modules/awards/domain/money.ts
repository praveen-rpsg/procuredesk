export type MoneyAmount = string;

export class MoneyPolicy {
  normalizeNullable(value: number | string | null | undefined): MoneyAmount | null | undefined {
    if (value === undefined) return undefined;
    if (value === null) return null;

    const raw = typeof value === "number" ? String(value) : value.trim();
    if (!/^\d+(\.\d{1,2})?$/.test(raw)) {
      return null;
    }

    const [whole = "", fractional = ""] = raw.split(".");
    const normalizedWhole = whole.replace(/^0+(?=\d)/, "") || "0";
    return `${normalizedWhole}.${fractional.padEnd(2, "0")}`;
  }
}
