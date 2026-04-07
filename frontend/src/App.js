import "@/App.css";
import "@fontsource/outfit/400.css";
import "@fontsource/outfit/500.css";
import "@fontsource/outfit/600.css";
import "@fontsource/outfit/700.css";
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import { BrowserRouter, Routes, Route, useLocation, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider, useAuth } from "@/context/AuthContext";

// Pages
import LandingPage from "@/pages/LandingPage";
import LoginPage from "@/pages/LoginPage";
import RegisterPage from "@/pages/RegisterPage";
import ClientDashboard from "@/pages/ClientDashboard";
import ExpertDashboard from "@/pages/ExpertDashboard";
import AdminDashboard from "@/pages/AdminDashboard";
import PostIssuePage from "@/pages/PostIssuePage";
import BrowseIssuesPage from "@/pages/BrowseIssuesPage";
import IssueDetailPage from "@/pages/IssueDetailPage";
import ExpertProfilePage from "@/pages/ExpertProfilePage";
import BookingPage from "@/pages/BookingPage";
import ChatRoom from "@/pages/ChatRoom";
import MyBookingsPage from "@/pages/MyBookingsPage";
import ProfilePage from "@/pages/ProfilePage";
import BrowseExpertsPage from "@/pages/BrowseExpertsPage";

// Protected Route Component
const ProtectedRoute = ({ children, allowedRoles }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse-soft text-lg text-slate-600">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    // Redirect to appropriate dashboard
    if (user.role === "admin") return <Navigate to="/admin" replace />;
    if (user.role === "expert") return <Navigate to="/expert" replace />;
    return <Navigate to="/dashboard" replace />;
  }

  return children;
};

const AppRouter = () => {
  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/experts" element={<BrowseExpertsPage />} />
      <Route path="/experts/:userId" element={<ExpertProfilePage />} />
      <Route path="/issues" element={<BrowseIssuesPage />} />
      <Route path="/issues/:issueId" element={<IssueDetailPage />} />

      {/* Client Routes */}
      <Route path="/dashboard" element={
        <ProtectedRoute allowedRoles={["client"]}>
          <ClientDashboard />
        </ProtectedRoute>
      } />
      <Route path="/post-issue" element={
        <ProtectedRoute allowedRoles={["client"]}>
          <PostIssuePage />
        </ProtectedRoute>
      } />
      <Route path="/my-bookings" element={
        <ProtectedRoute allowedRoles={["client", "expert"]}>
          <MyBookingsPage />
        </ProtectedRoute>
      } />
      <Route path="/booking/:bookingId" element={
        <ProtectedRoute allowedRoles={["client", "expert"]}>
          <BookingPage />
        </ProtectedRoute>
      } />
      <Route path="/chat/:bookingId" element={
        <ProtectedRoute allowedRoles={["client", "expert"]}>
          <ChatRoom />
        </ProtectedRoute>
      } />
      <Route path="/profile" element={
        <ProtectedRoute>
          <ProfilePage />
        </ProtectedRoute>
      } />

      {/* Expert Routes */}
      <Route path="/expert" element={
        <ProtectedRoute allowedRoles={["expert"]}>
          <ExpertDashboard />
        </ProtectedRoute>
      } />

      {/* Admin Routes */}
      <Route path="/admin" element={
        <ProtectedRoute allowedRoles={["admin"]}>
          <AdminDashboard />
        </ProtectedRoute>
      } />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <div className="min-h-screen bg-white">
          <AppRouter />
          <Toaster position="top-right" richColors />
        </div>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
