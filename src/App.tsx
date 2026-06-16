import { HashRouter, Routes, Route } from "react-router-dom";
import RootLayout from "@/layouts/RootLayout";
import TranslatePage from "@/pages/TranslatePage";
import HistoryPage from "@/pages/HistoryPage";
import PlayerPage from "@/pages/PlayerPage";
import ModalRenderer from "@/components/Modal";
import ToastRenderer from "@/components/Toast";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import Icon from "@/components/Icon";

function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-full px-6">
      <div className="max-w-sm text-center">
        <div className="mx-auto mb-6 w-16 h-16 rounded-2xl bg-app-surface-alt ring-1 ring-app-border-light flex items-center justify-center">
          <Icon name="close" className="w-7 h-7 text-app-text-tertiary" />
        </div>
        <h2 className="text-lg font-medium text-app-text-secondary mb-2">页面不存在</h2>
        <p className="text-sm text-app-text-tertiary leading-relaxed">请检查 URL 是否正确。</p>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <HashRouter>
        <Routes>
          <Route path="/" element={<RootLayout />}>
            <Route index element={<TranslatePage />} />
            <Route path="history" element={<HistoryPage />} />
            <Route path="player" element={<PlayerPage />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
        <ModalRenderer />
        <ToastRenderer />
      </HashRouter>
    </ErrorBoundary>
  );
}
