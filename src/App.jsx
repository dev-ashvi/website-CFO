import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import LandingPage from "./pages/LandingPage.jsx";
import FinanceTeamLandingPage from "./pages/FinanceTeamLandingPage.jsx";
import FounderLandingPage from "./pages/FounderLandingPage.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import AppLayout from "./layouts/AppLayout.jsx";
import AppChatPage from "./pages/AppChatPage.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";
import DashboardBuilderPage from "./pages/DashboardBuilderPage.jsx";
import { DashboardProvider } from "./dashboardBuilder/DashboardContext.jsx";
import AppArtifactsPage from "./pages/AppArtifactsPage.jsx";
import AppDataLayout from "./pages/data/AppDataLayout.jsx";
import DataFilesPage from "./pages/data/DataFilesPage.jsx";
import DataConnectPage from "./pages/data/DataConnectPage.jsx";
import DataHealthPage from "./pages/data/DataHealthPage.jsx";
import PlanningAssumptionsPage from "./pages/data/PlanningAssumptionsPage.jsx";
import PlanningScenariosPage from "./pages/data/PlanningScenariosPage.jsx";
import PlanningModelsPage from "./pages/data/PlanningModelsPage.jsx";
import PlanningPlansPage from "./pages/data/PlanningPlansPage.jsx";
import PlanningInsightsPage from "./pages/data/PlanningInsightsPage.jsx";
import PlanningWorkspacePage from "./pages/PlanningWorkspacePage.jsx";
import EarlyAccessPage from "./pages/EarlyAccessPage.jsx";
import { PlanningWorkspaceProvider } from "./planning/workspaceGuide/PlanningWorkspaceContext.jsx";
import { AuthProvider } from "./auth/AuthContext.jsx";
import RequireAuth from "./auth/RequireAuth.jsx";
import { AssumptionsProvider } from "./planning/AssumptionsContext.jsx";
import { ScenarioDraftProvider } from "./planning/ScenarioDraftContext.jsx";
import { PlanningViewProvider } from "./planning/PlanningViewContext.jsx";
import { PlanningAIProvider } from "./planning/PlanningAIContext.jsx";
import PlanningAIPanel from "./components/planning/PlanningAIPanel.jsx";

function PlanningLayout() {
  return (
    <PlanningAIProvider>
      <div className="relative flex min-h-0 min-w-0 w-full flex-1 flex-col overflow-hidden">
        <Outlet />
        <PlanningAIPanel />
      </div>
    </PlanningAIProvider>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AssumptionsProvider>
        <ScenarioDraftProvider>
        <PlanningViewProvider>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/finance-team" element={<FinanceTeamLandingPage />} />
          <Route path="/founder" element={<FounderLandingPage />} />
          <Route path="/early-access" element={<EarlyAccessPage />} />
          <Route path="/login" element={<LoginPage />} />

          <Route
            path="/app"
            element={
              <RequireAuth>
                <AppLayout />
              </RequireAuth>
            }
          >
            <Route index element={<Navigate to="/app/chat" replace />} />
            <Route
              path="workspace"
              element={
                <PlanningWorkspaceProvider>
                  <PlanningWorkspacePage />
                </PlanningWorkspaceProvider>
              }
            />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route
              path="dashboard/my-dashboards"
              element={
                <DashboardProvider>
                  <DashboardBuilderPage />
                </DashboardProvider>
              }
            />
            <Route path="dashboard/classic" element={<Navigate to="/app/dashboard" replace />} />
            <Route path="chat" element={<AppChatPage />} />
            <Route path="chat/:sessionId" element={<AppChatPage />} />
            <Route path="data" element={<AppDataLayout />}>
              <Route index element={<Navigate to="files" replace />} />
              <Route path="files" element={<DataFilesPage />} />
              <Route path="connect" element={<DataConnectPage />} />
              <Route path="health" element={<DataHealthPage />} />
              <Route path="planning" element={<PlanningLayout />}>
                <Route index element={<Navigate to="/app/data/planning/assumptions" replace />} />
                <Route path="assumptions" element={<PlanningAssumptionsPage />} />
                <Route path="scenarios" element={<PlanningScenariosPage />} />
                <Route path="models" element={<PlanningModelsPage />} />
                <Route path="plans" element={<PlanningPlansPage />} />
                <Route path="insights" element={<PlanningInsightsPage />} />
              </Route>
            </Route>
            <Route path="artifacts" element={<AppArtifactsPage />} />
          </Route>
        </Routes>
        </PlanningViewProvider>
        </ScenarioDraftProvider>
        </AssumptionsProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
