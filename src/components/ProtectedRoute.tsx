import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { canSeeFinance } from "@/lib/finance-access";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredPage?: string; // the route path this component guards
}

export function ProtectedRoute({ children, requiredPage }: ProtectedRouteProps) {
  const { session, loading, role, allowedPages, user } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  // Finance is gated by a hard email allowlist — even admins must be on it.
  // Checked BEFORE the admin pass-through so admins can't bypass it.
  if (requiredPage === "/finance" && !canSeeFinance(user?.email)) {
    const fallback = role === "admin" ? "/" : (allowedPages[0] ?? "/worker");
    return <Navigate to={fallback} replace />;
  }

  // Admins always pass through
  if (role === "admin") {
    return <>{children}</>;
  }

  // Documentation is available to every signed-in user, regardless of which
  // pages their role can access.
  if (requiredPage === "/docs") {
    return <>{children}</>;
  }

  // Non-admins: check if this page is in their allowed list
  if (requiredPage && !allowedPages.includes(requiredPage)) {
    // Redirect to the first page they're allowed on, or /worker as last resort
    const fallback = allowedPages[0] ?? "/worker";
    return <Navigate to={fallback} replace />;
  }

  return <>{children}</>;
}
