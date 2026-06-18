type SwitchProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  ariaLabel: string;
  disabled?: boolean;
};

export default function Switch({ checked, onChange, ariaLabel, disabled = false }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-label={ariaLabel}
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full ring-1 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-app-accent-ring disabled:cursor-not-allowed disabled:opacity-40 ${
        checked ? "bg-app-accent ring-app-accent-ring" : "bg-app-hover ring-app-border"
      }`}
    >
      <span
        className={`h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
          checked ? "translate-x-[18px]" : "translate-x-[3px]"
        }`}
      />
    </button>
  );
}
