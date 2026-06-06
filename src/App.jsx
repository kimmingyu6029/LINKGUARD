import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import AppShell from "./components/AppShell.jsx";
import { AccountProvider } from "./lib/accountContext.jsx";
import AnalysisPage from "./pages/AnalysisPage.jsx";
import CharacterIntroPage from "./pages/CharacterIntroPage.jsx";
import DeveloperReportsPage from "./pages/DeveloperReportsPage.jsx";
import EducationPage from "./pages/EducationPage.jsx";
import HistoryPage from "./pages/HistoryPage.jsx";
import HomePage from "./pages/HomePage.jsx";
import PricingPage from "./pages/PricingPage.jsx";
import ReportPage from "./pages/ReportPage.jsx";
import WalletPage from "./pages/WalletPage.jsx";

function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [pathname]);

  return null;
}

export default function App() {
  return (
    <AccountProvider>
      <AppShell>
        <ScrollToTop />
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/analysis" element={<AnalysisPage />} />
          <Route path="/developer-reports" element={<DeveloperReportsPage />} />
          <Route path="/education" element={<EducationPage />} />
          <Route path="/education/characters" element={<CharacterIntroPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/report" element={<ReportPage />} />
          <Route path="/wallet" element={<WalletPage />} />
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/plans" element={<Navigate to="/pricing" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppShell>
    </AccountProvider>
  );
}
