import { HashRouter, Routes, Route } from "react-router-dom";
import RootLayout from "@/layouts/RootLayout";
import TranslatePage from "@/pages/TranslatePage";
import HistoryPage from "@/pages/HistoryPage";
import PlayerPage from "@/pages/PlayerPage";
import ModalRenderer from "@/components/Modal";
import ToastRenderer from "@/components/Toast";

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<RootLayout />}>
          <Route index element={<TranslatePage />} />
          <Route path="history" element={<HistoryPage />} />
          <Route path="player" element={<PlayerPage />} />
        </Route>
      </Routes>
      <ModalRenderer />
      <ToastRenderer />
    </HashRouter>
  );
}
