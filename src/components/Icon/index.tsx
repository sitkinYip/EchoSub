import type { IconName } from "@/config";

interface Props { name: IconName; className?: string; }

// All icons (<2KB total) bundled for simplicity; desktop app — bundle size not a concern.
// For web targets, replace PATHS with dynamic imports per icon.
export default function Icon({ name, className }: Props) {
  const paths = PATHS[name];
  const isSpinner = name === "spinner";
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={isSpinner ? undefined : 1.5}
      strokeLinecap="round" strokeLinejoin="round">{paths}</svg>
  );
}

const PATHS: Record<IconName, React.ReactNode> = {
  logo: <path d="M4 19.5v-15A2.5 2.5 0 016.5 2H17a2.5 2.5 0 012.5 2.5v15M4 19.5a2.5 2.5 0 002.5 2.5H17a2.5 2.5 0 002.5-2.5M10 6l-2 6h4l-2 6" />,
  translate: <><path d="M5 8l6 6" /><path d="M4 14l6-6 2-3" /><path d="M2 5h12" /><path d="M7 2h1" /><path d="M14.5 9a3.5 3.5 0 013.5 3.5v3" /><path d="M18 16l2.5-2.5" /><path d="M18 11l2.5 2.5" /></>,
  history: <><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></>,
  player: <polygon points="5 3 19 12 5 21 5 3" />,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" /></>,
  download: <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />,
  "arrow-right": <path d="M5 12h14M12 5l7 7-7 7" />,
  check: <path d="M20 6L9 17l-5-5" />,
  close: <path d="M6 18L18 6M6 6l12 12" />,
  video: <path d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />,
  "chevron-right": <path d="M14 5l7 7m0 0l-7 7m7-7H3" />,
  upload: <path d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />,
  chat: <path d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />,
  spinner: <><circle cx="12" cy="12" r="10" strokeWidth="3" opacity="0.25" /><path d="M4 12a8 8 0 018-8" strokeWidth="3" /></>,
  moon: <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />,
  sun: <><circle cx="12" cy="12" r="5" /><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" /></>,
  warning: <><path d="M12 2L2 22h20L12 2z" /><line x1="12" y1="10" x2="12" y2="16" /><circle cx="12" cy="19" r="0.5" fill="currentColor" /></>,
  help: <><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></>,
};
