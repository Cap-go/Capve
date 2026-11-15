import { DOC_CONTENT } from "./lib/docs-content";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useParams } from "react-router-dom";
import { DocsLayout } from "./components/DocsLayout";
import { AuthProvider } from "./lib/auth";
import { DashboardPage } from "./pages/Dashboard";
import { DASHBOARD_PATHS, legacyDashboardHref, type DashboardView } from "./lib/dashboard-route";
import {
  ForgotPasswordPage,
  LoginPage,
  RegisterPage,
  ResetPasswordPage,
  VerifyEmailPage,
} from "./pages/Auth";
import { ImprintPage, PrivacyPage, TermsPage } from "./pages/Legal";
import { NotFoundPage } from "./pages/NotFound";
import {
  CompareIndexPage,
  ComparePage,
  MigrateIndexPage,
  MigratePage,
} from "./marketing/pages/CompetitorPages";
import {
  FeaturePage,
  FeaturesIndexPage,
  SolutionPage,
  SolutionsIndexPage,
} from "./marketing/pages/FeaturePages";
import { HomePage } from "./marketing/pages/HomePage";
import { PricingPage } from "./marketing/pages/PricingPage";
import { SecurityPage } from "./marketing/pages/SecurityPage";
import { RouteMeta } from "./marketing/RouteMeta";

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}

/** Every route. scripts/prerender.tsx renders the same tree inside a StaticRouter. */
export function AppRoutes() {
  return (
    <>
      <RouteMeta />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/features" element={<FeaturesIndexPage />} />
        <Route path="/features/:slug" element={<FeaturePage />} />
        <Route path="/solutions" element={<SolutionsIndexPage />} />
        <Route path="/solutions/:slug" element={<SolutionPage />} />
        <Route path="/compare" element={<CompareIndexPage />} />
        <Route path="/compare/:slug" element={<ComparePage />} />
        <Route path="/migrate" element={<MigrateIndexPage />} />
        <Route path="/migrate/:slug" element={<MigratePage />} />
        <Route path="/security" element={<SecurityPage />} />
        <Route path="/imprint" element={<ImprintPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/app" element={<LegacyDashboardRedirect />} />
        <Route path="/app/campaign/:section" element={<LegacyDashboardRedirect />} />
        <Route path="/app/campaigns/:campaignId/:section?" element={<DashboardPage page="campaigns" />} />
        {Object.entries(DASHBOARD_PATHS).map(([page, path]) => (
          <Route key={page} path={path} element={<DashboardPage page={page as DashboardView} />} />
        ))}
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
    </>
  );
}

function LegacyDashboardRedirect() {
  const { search, hash } = useLocation();
  const { section } = useParams();
  return <Navigate to={legacyDashboardHref(search, section) + hash} replace />;
}
