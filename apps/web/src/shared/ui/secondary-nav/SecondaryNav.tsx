import type { LucideIcon } from "lucide-react";
import type { KeyboardEvent } from "react";

export type SecondaryNavItem<TKey extends string = string> = {
  description?: string | undefined;
  disabled?: boolean | undefined;
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
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();

    const enabledItems = items
      .map((item, itemIndex) => ({ item, itemIndex }))
      .filter(({ item }) => !item.disabled);
    if (enabledItems.length === 0) return;

    const enabledIndex = enabledItems.findIndex(({ itemIndex }) => itemIndex === index);
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? enabledItems.length - 1
          : event.key === "ArrowRight"
            ? (enabledIndex + 1) % enabledItems.length
            : (enabledIndex - 1 + enabledItems.length) % enabledItems.length;
    const nextItem = enabledItems[nextIndex]?.item;
    if (nextItem) onChange(nextItem.key);
  };

  return (
    <nav aria-label={ariaLabel} className="secondary-nav">
      {items.map((item, index) => (
        <button
          aria-current={activeKey === item.key ? "page" : undefined}
          className={`secondary-nav-item ${activeKey === item.key ? "secondary-nav-item-active" : ""}`.trim()}
          disabled={item.disabled}
          key={item.key}
          onKeyDown={(event) => onKeyDown(event, index)}
          onClick={() => onChange(item.key)}
          title={item.description}
          type="button"
        >
          {item.icon ? (
            <span className="secondary-nav-icon">
              <item.icon size={16} />
            </span>
          ) : null}
          <span className="secondary-nav-copy">
            <span className="secondary-nav-label">{item.label}</span>
          </span>
        </button>
      ))}
    </nav>
  );
}
