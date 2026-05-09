export type RadioOption = {
  disabled?: boolean;
  label: string;
  value: string;
};

type RadioGroupProps = {
  name: string;
  onChange: (value: string) => void;
  options: RadioOption[];
  value: string;
};

export function RadioGroup({ name, onChange, options, value }: RadioGroupProps) {
  return (
    <div className="radio-group" role="radiogroup">
      {options.map((option) => (
        <label className="radio-option" key={option.value}>
          <input
            checked={value === option.value}
            disabled={option.disabled ?? false}
            name={name}
            onChange={() => onChange(option.value)}
            type="radio"
            value={option.value}
          />
          <span>{option.label}</span>
        </label>
      ))}
    </div>
  );
}
