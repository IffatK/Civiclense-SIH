import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth.jsx";
import { homeFor } from "./lib/auth-routing.js";
import { I18nProvider } from "./lib/i18n.jsx";
import { ToastProvider } from "./lib/toast.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";

import Landing from "./pages/public/Landing.jsx";
import PublicReports from "./pages/public/PublicReports.jsx";
import PublicReport from "./pages/public/PublicReport.jsx";
import Leaderboard from "./pages/public/Leaderboard.jsx";
import Solutions from "./pages/public/Solutions.jsx";
import SolutionDetail from "./pages/public/SolutionDetail.jsx";
import PublicChallenges from "./pages/public/Challenges.jsx";
import ChallengeDetail from "./pages/public/ChallengeDetail.jsx";
import Community from "./pages/public/Community.jsx";
import SignIn from "./pages/auth/SignIn.jsx";
import Register from "./pages/auth/Register.jsx";
import Callback from "./pages/auth/Callback.jsx";
import GovLogin from "./pages/gov/GovLogin.jsx";
import GovRegister from "./pages/gov/GovRegister.jsx";
import GovStatus from "./pages/gov/GovStatus.jsx";

import CitizenLayout from "./pages/citizen/CitizenLayout.jsx";
import Dashboard from "./pages/citizen/Dashboard.jsx";
import CityMapPage from "./pages/citizen/CityMapPage.jsx";
import Report from "./pages/citizen/Report.jsx";
import MyReports from "./pages/citizen/MyReports.jsx";
import Notifications from "./pages/citizen/Notifications.jsx";
import Profile from "./pages/citizen/Profile.jsx";
import Settings from "./pages/citizen/Settings.jsx";

import OfficerLayout from "./pages/officer/OfficerLayout.jsx";
import Queue from "./pages/officer/Queue.jsx";
import JobDetail from "./pages/officer/JobDetail.jsx";
import Performance from "./pages/officer/Performance.jsx";

import AdminLayout from "./pages/admin/AdminLayout.jsx";
import CommandCentre from "./pages/admin/CommandCentre.jsx";
import Clusters from "./pages/admin/Clusters.jsx";
import Comments from "./pages/admin/Comments.jsx";
import Institutions from "./pages/admin/Institutions.jsx";
import AiPerformance from "./pages/admin/AiPerformance.jsx";
import AskAssistant from "./pages/admin/AskAssistant.jsx";
import DuplicateTest from "./pages/admin/DuplicateTest.jsx";
import ChallengeApplicants from "./pages/admin/ChallengeApplicants.jsx";
import AdminChallenges from "./pages/admin/Challenges.jsx";
import InstitutionLayout from "./pages/institution/InstitutionLayout.jsx";
import InstChallenges from "./pages/institution/Challenges.jsx";
import InstProjects from "./pages/institution/Projects.jsx";
import InstTeam from "./pages/institution/Team.jsx";
import InstQuote from "./pages/institution/Quote.jsx";
import InstQuotations from "./pages/institution/Quotations.jsx";
import Join from "./pages/institution/Join.jsx";
import CampusLogin from "./pages/campus/CampusLogin.jsx";
import CampusRegister from "./pages/campus/CampusRegister.jsx";
import CampusStatus from "./pages/campus/CampusStatus.jsx";
import CampusLayout from "./pages/campus/CampusLayout.jsx";
import { CampusDashboard, CampusChallenges, CampusChallengeDetail, CampusProposals } from "./pages/campus/CampusWorkspace.jsx";
import CampusProposalEditor from "./pages/campus/ProposalEditor.jsx";
import { MyChallenges, CampusProjects, CampusDepartments, CampusPeople, CampusProfile, CampusAnalytics, CampusDocuments, CampusPartners, CampusMessages, CampusNotifications, CampusTeams } from "./pages/campus/CampusManagement.jsx";
import Zones from "./pages/admin/Zones.jsx";
import ClusterDetail from "./pages/admin/ClusterDetail.jsx";
import ComplaintDetail from "./pages/admin/ComplaintDetail.jsx";
import Officers from "./pages/admin/Officers.jsx";
import OfficerDetail from "./pages/admin/OfficerDetail.jsx";
import Categories from "./pages/admin/Categories.jsx";
import Contracts from "./pages/admin/Contracts.jsx";
import Analytics from "./pages/admin/Analytics.jsx";
import Insights from "./pages/admin/Insights.jsx";
import Agent from "./pages/admin/Agent.jsx";
import Complaints from "./pages/admin/Complaints.jsx";
import StaffApprovals from "./pages/admin/StaffApprovals.jsx";
import ReviewQueue from "./pages/admin/ReviewQueue.jsx";
import Reports from "./pages/admin/Reports.jsx";
import AuditLog from "./pages/admin/AuditLog.jsx";
import ProposalApprovals, { ProposalApprovalDetail } from "./pages/admin/ProposalApprovals.jsx";

const ADMIN = ["super_admin", "global_admin"];
const FIELD = ["officer", "super_admin", "global_admin"];

/** Signed-in visitors skip the marketing page and land in their own product. */
function Root() {
  const { session, profile, loading } = useAuth();
  if (loading) return <div className="label" style={{ padding: 40 }}>Loading</div>;
  if (session) return <Navigate to={homeFor(profile?.role)} replace />;
  return <Landing />;
}

export default function App() {
  return (
    <I18nProvider>
      <AuthProvider>
        <ToastProvider><Shell /></ToastProvider>
      </AuthProvider>
    </I18nProvider>
  );
}

/**
 * The boundary sits inside the router so it can reset on navigation. One
 * component throwing should cost you that component, not the whole screen.
 */
function Shell() {
  const location = useLocation();

  return (
    <ErrorBoundary resetKey={location.pathname}>
      <Routes>
          <Route path="/" element={<Root />} />

          {/* Open to anyone, signed in or not. A transparency tool that only
              shows you your own report is asking to be taken on trust. */}
          <Route path="/reports" element={<PublicReports />} />
          <Route path="/reports/:ref" element={<PublicReport />} />
          <Route path="/challenges" element={<PublicChallenges />} />
          <Route path="/challenges/:ref" element={<ChallengeDetail />} />
          <Route path="/community" element={<Community />} />
          <Route path="/leaderboard" element={<Leaderboard />} />

          {/* Universities and companies. Public so somebody can read what
              applying involves before creating an account. */}
          {/* Institutions have their own door, like /gov for municipal staff.
              /join stays for a resident who turns out to be faculty. */}
          <Route path="/campus" element={<CampusLogin />} />
          <Route path="/campus/register" element={<CampusRegister />} />
          <Route path="/campus/status" element={<ProtectedRoute><CampusStatus /></ProtectedRoute>} />
          <Route path="/campus" element={<ProtectedRoute roles={["university_admin", "faculty", "student", "industry_partner"]}><CampusLayout /></ProtectedRoute>}>
            <Route path="dashboard" element={<CampusDashboard />} />
            <Route path="challenges" element={<CampusChallenges />} />
            <Route path="challenges/:ref" element={<CampusChallengeDetail />} />
            <Route path="my-challenges" element={<MyChallenges />} />
            <Route path="proposals" element={<CampusProposals />} />
            <Route path="proposals/new" element={<CampusProposalEditor />} />
            <Route path="proposals/:ref" element={<CampusProposalEditor />} />
            <Route path="projects" element={<CampusProjects />} />
            <Route path="team" element={<CampusTeams />} />
            <Route path="students" element={<CampusPeople role="student" title="Students" />} />
            <Route path="faculty" element={<CampusPeople role="faculty" title="Faculty" />} />
            <Route path="departments" element={<CampusDepartments />} />
            <Route path="documents" element={<CampusDocuments />} />
            <Route path="partners" element={<CampusPartners />} />
            <Route path="messages" element={<CampusMessages />} />
            <Route path="notifications" element={<CampusNotifications />} />
            <Route path="analytics" element={<CampusAnalytics />} />
            <Route path="profile" element={<CampusProfile />} />
            <Route path="settings" element={<Settings />} />
          </Route>
          <Route path="/join" element={<Join />} />

          <Route
            path="/work"
            element={
              <ProtectedRoute roles={["university_admin", "faculty", "student", "industry_partner"]}>
                <InstitutionLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<InstChallenges />} />
            <Route path="projects" element={<InstProjects />} />
            <Route path="team" element={<InstTeam />} />
            <Route path="quotations" element={<InstQuotations />} />
            <Route path="quote/:ref" element={<InstQuote />} />
          </Route>
          <Route path="/solutions" element={<Solutions />} />
          <Route path="/solutions/:ref" element={<SolutionDetail />} />
          <Route path="/signin" element={<SignIn />} />
          <Route path="/register" element={<Register />} />
          <Route path="/auth/callback" element={<Callback />} />
          {/* Government portal — a separate entrance, not the resident form with a checkbox. */}
          <Route path="/gov" element={<GovLogin />} />
          <Route path="/gov/register" element={<GovRegister />} />
          <Route path="/gov/status" element={<ProtectedRoute><GovStatus /></ProtectedRoute>} />

          <Route path="/app" element={<ProtectedRoute><CitizenLayout /></ProtectedRoute>}>
            <Route index element={<Dashboard />} />
            <Route path="map" element={<CityMapPage />} />
            <Route path="report" element={<Report />} />
            <Route path="reports" element={<MyReports />} />
            <Route path="notifications" element={<Notifications />} />
            <Route path="profile" element={<Profile />} />
            <Route path="settings" element={<Settings />} />
          </Route>

          <Route path="/officer" element={<ProtectedRoute roles={FIELD}><OfficerLayout /></ProtectedRoute>}>
            <Route index element={<Queue />} />
            <Route path="jobs/:ref" element={<JobDetail />} />
            <Route path="performance" element={<Performance />} />
          </Route>

          <Route path="/admin" element={<ProtectedRoute roles={ADMIN}><AdminLayout /></ProtectedRoute>}>
            <Route index element={<CommandCentre />} />
            <Route path="complaints" element={<Complaints />} />
            <Route path="staff" element={<StaffApprovals />} />
            <Route path="clusters" element={<Clusters />} />
            <Route path="comments" element={<Comments />} />
            <Route path="institutions" element={<Institutions />} />
            <Route path="proposals" element={<ProposalApprovals />} />
            <Route path="proposals/:ref" element={<ProposalApprovalDetail />} />
            <Route path="ai" element={<AiPerformance />} />
            <Route path="ask" element={<AskAssistant />} />
            <Route path="duplicates" element={<DuplicateTest />} />
            <Route path="challenges" element={<AdminChallenges />} />
            <Route path="challenges/:ref/applicants" element={<ChallengeApplicants />} />
            <Route path="zones" element={<Zones />} />
            <Route path="clusters/:id" element={<ClusterDetail />} />
            <Route path="complaints/:ref" element={<ComplaintDetail />} />
            <Route path="officers" element={<Officers />} />
            <Route path="officers/:id" element={<OfficerDetail />} />
            <Route path="categories" element={<Categories />} />
            <Route path="contracts" element={<Contracts />} />
            <Route path="analytics" element={<Analytics />} />
            <Route path="agent" element={<Agent />} />
            <Route path="insights" element={<Insights />} />
            <Route path="review" element={<ReviewQueue />} />
            <Route path="reports" element={<Reports />} />
            <Route path="audit" element={<AuditLog />} />
          </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ErrorBoundary>
  );
}
