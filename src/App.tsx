import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { DocsLayout } from "./components/DocsLayout";
import { AuthProvider } from "./lib/auth";
import { DashboardPage } from "./pages/Dashboard";
import { ForgotPasswordPage, LoginPage, RegisterPage, ResetPasswordPage } from "./pages/Auth";
import { LandingPage } from "./pages/Landing";
import { DocsBrowserAttribution } from "./pages/docs/DocsBrowserAttribution";
import { DocsConvertApi } from "./pages/docs/DocsConvertApi";
import { DocsMcp } from "./pages/docs/DocsMcp";
import { DocsOverview } from "./pages/docs/DocsOverview";
import { DocsPostback } from "./pages/docs/DocsPostback";
import { DocsServerConversions } from "./pages/docs/DocsServerConversions";
import { DocsTrackingLinks } from "./pages/docs/DocsTrackingLinks";

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/app" element={<DashboardPage />} />
          <Route path="/docs" element={<DocsLayout />}>
            <Route index element={<DocsOverview />} />
            <Route path="mcp" element={<DocsMcp />} />
            <Route path="postback" element={<DocsPostback />} />
            <Route path="tracking-links" element={<DocsTrackingLinks />} />
            <Route path="browser-attribution" element={<DocsBrowserAttribution />} />
            <Route path="server-conversions" element={<DocsServerConversions />} />
            <Route path="api/convert" element={<DocsConvertApi />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
