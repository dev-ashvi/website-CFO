import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext.jsx";

export default function RequireAuth({ children }) {
  const auth = useAuth();
  const location = useLocation();

  if (auth.status === "checking") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white text-sm text-slate-600">
        Checking your session…
      </div>
    );
  }

  if (auth.status !== "authenticated" || !auth.token) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location }}
      />
    );
  }

  return children;
}

