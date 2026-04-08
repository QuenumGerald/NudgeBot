import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "@/components/Layout/AppShell";
import { HomePage } from "@/pages/Home";
import { LoginPage } from "@/pages/Login";
import { SettingsPage } from "@/pages/Settings";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<AppShell />}>
        <Route index element={<HomePage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
