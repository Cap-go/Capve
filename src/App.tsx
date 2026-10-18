import { DOC_CONTENT } from "./lib/docs-content";
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
            {Object.entries(DOC_CONTENT).map(([slug, Page]) =>
              slug ? (
                <Route key={slug} path={slug} element={<Page />} />
              ) : (
                <Route key="index" index element={<Page />} />
              ),
            )}
            <Route path="*" element={<NotFoundPage embedded />} />
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
