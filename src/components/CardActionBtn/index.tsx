import Icon from "@/components/Icon";
import type { IconName } from "@/config";

interface Props {
  label: string;
  icon: IconName;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}

export default function CardActionBtn({ label, icon, onClick, disabled, danger }: Props) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all duration-200 active:scale-95
        ${
          disabled
            ? "text-app-text-tertiary/40 cursor-not-allowed"
            : danger
              ? "text-app-error hover:bg-app-error-bg"
              : "text-app-text-secondary hover:text-app-text hover:bg-app-hover"
        }`}
    >
      <Icon name={icon} className="w-3 h-3" />
      {label}
    </button>
  );
}
