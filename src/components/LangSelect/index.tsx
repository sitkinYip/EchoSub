import type { Language } from "@/types";
import { LANGUAGES } from "@/config";

interface Props { value: Language; onChange: (l: Language) => void; options: readonly Language[]; }

export default function LangSelect({ value, onChange, options }: Props) {
  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const v = e.target.value;
    if (LANGUAGES.includes(v as any)) {
      onChange(v as Language);
    }
  };

  return (
    <select value={value} onChange={handleChange}
      className="px-2.5 py-1.5 bg-app-surface ring-1 ring-app-border rounded-lg text-app-text-secondary text-xs focus:outline-none focus:ring-app-border transition-all cursor-pointer">
      {options.map((lang) => (<option key={lang} value={lang}>{lang}</option>))}
    </select>
  );
}
