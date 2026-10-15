import { BrowserRouter, Route, Routes } from "react-router-dom";
import { DocsLayout } from "./components/DocsLayout";
import { AuthProvider } from "./lib/auth";
import { DashboardPage } from "./pages/Dashboard";
import {
  ForgotPasswordPage,
  LoginPage,
  RegisterPage,
  ResetPasswordPage,
  VerifyEmailPage,
} from "./pages/Auth";
import { LandingPage } from "./pages/Landing";
import { NotFoundPage } from "./pages/NotFound";
import { DocsBrowserAttribution } from "./pages/docs/DocsBrowserAttribution";
import { DocsConvertApi } from "./pages/docs/DocsConvertApi";
import { DocsMcp } from "./pages/docs/DocsMcp";
import { DocsOverview } from "./pages/docs/DocsOverview";
import { DocsPostback } from "./pages/docs/DocsPostback";
import { DocsRouting } from "./pages/docs/DocsRouting";
import { DocsServerConversions } from "./pages/docs/DocsServerConversions";
import { DocsTrackingLinks } from "./pages/docs/DocsTrackingLinks";
import { DocsTrafficSources } from "./pages/docs/DocsTrafficSources";

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
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/app" element={<DashboardPage />} />
          <Route path="/docs" element={<DocsLayout />}>
            <Route index element={<DocsOverview />} />
            <Route path="mcp" element={<DocsMcp />} />
            <Route path="postback" element={<DocsPostback />} />
            <Route path="tracking-links" element={<DocsTrackingLinks />} />
            <Route path="traffic-sources" element={<DocsTrafficSources />} />
            <Route path="routing" element={<DocsRouting />} />
            <Route path="browser-attribution" element={<DocsBrowserAttribution />} />
            <Route path="server-conversions" element={<DocsServerConversions />} />
            <Route path="api/convert" element={<DocsConvertApi />} />
            <Route path="*" element={<NotFoundPage embedded />} />
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
