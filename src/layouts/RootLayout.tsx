import { useEffect, useRef, useState } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { getCurrentWindow } from "@tauri-apps/api/window";
import Icon from "@/components/Icon";
import { NAV_ITEMS } from "@/config";
import { useSettingsStore } from "@/stores/settingsStore";

export default function RootLayout() {
  const nav = useNavigate();
  const loc = useLocation();
  const theme = useSettingsStore((s) => s.theme);
  const update = useSettingsStore((s) => s.update);
  const [ind, setInd] = useState({ top: 0, height: 0 });
  const navRef = useRef<HTMLDivElement>(null);

  // Sync theme class to <html>
  useEffect(() => {
    document.documentElement.classList.toggle("light", theme === "light");
  }, [theme]);

  // Sync native window theme so the OS-drawn title bar (Windows / macOS) follows the app theme.
  useEffect(() => {
    getCurrentWindow()
      .setTheme(theme)
      .catch((err) => console.warn("无法同步窗口主题:", err));
  }, [theme]);

  useEffect(() => {
    const idx = NAV_ITEMS.findIndex((n) => n.path === loc.pathname);
    const btns = navRef.current?.querySelectorAll("button");
    const btn = btns?.[idx >= 0 ? idx : 0] as HTMLElement | undefined;
    if (btn) setInd({ top: btn.offsetTop, height: btn.offsetHeight });
  }, [loc.pathname]);

  const toggleTheme = () => update({ theme: theme === "dark" ? "light" : "dark" });

  return (
    <div className="flex h-screen max-h-screen bg-app-bg overflow-hidden">
      {/* bg orbs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div
          className="absolute -top-[30%] -right-[20%] w-[60%] aspect-square rounded-full opacity-50"
          style={{
            background:
              "radial-gradient(circle, rgba(59,130,246,0.08) 0%, rgba(59,130,246,0.02) 50%, transparent 70%)",
          }}
        />
        <div
          className="absolute -bottom-[20%] -left-[15%] w-[50%] aspect-square rounded-full opacity-50"
          style={{
            background:
              "radial-gradient(circle, rgba(168,85,247,0.06) 0%, rgba(168,85,247,0.02) 50%, transparent 70%)",
          }}
        />
      </div>

      <aside className="relative z-10 flex flex-col w-[72px] py-6 items-center border-r border-app-border-light">
        <button
          onClick={() => nav("/")}
          className="mb-8 w-10 h-10 rounded-2xl flex items-center justify-center text-app-text-tertiary hover:text-app-text hover:bg-app-hover hover:ring-1 hover:ring-app-border transition-all duration-300 active:scale-95"
        >
          <Icon name="logo" className="w-5 h-5" />
        </button>

        <nav ref={navRef} className="relative flex flex-col gap-1">
          <div
            className="absolute left-0 w-0.5 rounded-full bg-app-text-tertiary transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]"
            style={{ top: ind.top + 8, height: ind.height - 16 }}
          />
          {NAV_ITEMS.map(({ path, label, icon }) => (
            <button
              key={path}
              onClick={() => nav(path)}
              className="relative flex items-center justify-center w-12 h-12 rounded-xl transition-all duration-300 group active:scale-95"
            >
              <Icon
                name={icon}
                className={`w-5 h-5 transition-all duration-300 ${loc.pathname === path ? "text-app-text" : "text-app-text-tertiary group-hover:text-app-text-secondary"}`}
              />
              <div className="absolute left-full ml-3 px-2.5 py-1 rounded-lg bg-app-btn backdrop-blur-2xl text-[11px] text-app-text-secondary whitespace-nowrap opacity-0 translate-x-[-4px] group-hover:opacity-100 group-hover:translate-x-0 pointer-events-none transition-all duration-200">
                {label}
              </div>
            </button>
          ))}
        </nav>

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="mt-auto w-10 h-10 rounded-xl bg-app-surface hover:bg-app-hover ring-1 ring-app-border-light flex items-center justify-center text-app-text-tertiary hover:text-app-text-secondary transition-all duration-300 active:scale-95"
        >
          <Icon name={theme === "dark" ? "sun" : "moon"} className="w-4 h-4" />
        </button>
      </aside>

      <main className="relative z-10 flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
