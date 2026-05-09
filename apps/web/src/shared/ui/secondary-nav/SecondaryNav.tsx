import type { LucideIcon } from "lucide-react";

export type SecondaryNavItem<TKey extends string = string> = {
  description?: string | undefined;
  icon?: LucideIcon | undefined;
  key: TKey;
  label: string;
};

type SecondaryNavProps<TKey extends string> = {
  activeKey: TKey;
  ariaLabel: string;
  items: Array<SecondaryNavItem<TKey>>;
  onChange: (key: TKey) => void;
};

export function SecondaryNav<TKey extends string>({
  activeKey,
  ariaLabel,
  items,
  onChange,
}: SecondaryNavProps<TKey>) {
  return (
    <nav aria-label={ariaLabel} className="secondary-nav">
      {items.map((item) => (
        <button
          aria-current={activeKey === item.key ? "page" : undefined}
          className={`secondary-nav-item ${activeKey === item.key ? "secondary-nav-item-active" : ""}`.trim()}
          key={item.key}
          onClick={() => onChange(item.key)}
          title={item.description}
          type="button"
        >
          {item.icon ? <item.icon size={16} /> : null}
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}
