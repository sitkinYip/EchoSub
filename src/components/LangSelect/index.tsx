import Icon from "@/components/Icon";

interface Props { value: string; onChange: (l: string) => void; options: readonly string[]; }

export default function LangSelect({ value, onChange, options }: Props) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className="px-2.5 py-1.5 bg-app-surface ring-1 ring-app-border rounded-lg text-app-text-secondary text-xs focus:outline-none focus:ring-app-border transition-all cursor-pointer">
      {options.map((lang) => (<option key={lang} value={lang}>{lang}</option>))}
    </select>
  );
}
