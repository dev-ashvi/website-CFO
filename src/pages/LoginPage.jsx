import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import Background from "../components/Background.jsx";
import { ArrowLeft, Shield } from "lucide-react";
import { useAuth } from "../auth/AuthContext.jsx";
import topLogo from "../../dist/assets/Adobe Express - file (2).png";

export default function LoginPage() {
  const auth = useAuth();
  const location = useLocation();
  const [tenantSlug, setTenantSlug] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localError, setLocalError] = useState("");

  const from = location.state?.from?.pathname || "/app/chat";

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLocalError("");

    if (!tenantSlug.trim() || !email.trim() || !password.trim()) {
      setLocalError("Please fill in tenant, email, and password.");
      return;
    }

    if (isSubmitting) return;

    setIsSubmitting(true);
    try {
      await auth.login({
        tenantSlug: tenantSlug.trim(),
        email: email.trim(),
        password,
        redirectTo: from,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Background>
      <div
        className="pointer-events-none absolute inset-0 z-0"
        aria-hidden
        style={{
          backgroundColor: "#ffffff",
          backgroundImage: [
            "linear-gradient(rgba(26,54,115,0.04) 1px, transparent 1px)",
            "linear-gradient(90deg, rgba(26,54,115,0.04) 1px, transparent 1px)",
          ].join(", "),
          backgroundSize: "60px 60px",
        }}
      />
      <div className="relative z-50 mx-auto max-w-6xl px-4 pt-6">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm font-semibold text-[rgba(26,54,115,0.72)] transition-colors hover:text-[#1a3673]"
        >
          <ArrowLeft size={18} />
          Back to home
        </Link>
      </div>

      <div className="relative z-10 flex min-h-[calc(100vh-80px)] flex-col items-center justify-center px-4 py-16">
        <div className="pointer-events-none absolute left-1/2 top-[18%] h-64 w-[min(520px,90vw)] -translate-x-1/2 rounded-[60px] bg-[radial-gradient(circle_at_top,_rgba(252,125,37,0.24),_transparent_55%)] blur-[90px]" />
        <div className="pointer-events-none absolute bottom-[18%] right-[18%] h-64 w-72 rounded-[50px] bg-[radial-gradient(circle_at_bottom,_rgba(26,54,115,0.85),_transparent_55%)] opacity-60 blur-[80px]" />

        <div className="relative w-full max-w-md">
          <div className="pointer-events-none absolute -inset-px rounded-[28px] bg-gradient-to-b from-white/40 via-[#fef7f1]/40 to-transparent opacity-70 blur-[10px]" />
          <div className="relative overflow-hidden rounded-[26px] border border-white/70 bg-white/95 shadow-[0_22px_60px_rgba(15,23,42,0.45)]">
            <div className="px-8 pt-10 pb-2 text-center">
              <img src={topLogo} alt="Wyz logo" className="mx-auto mb-6 h-auto w-full max-w-[180px] object-contain" />
              <h1 className="mb-2 text-2xl font-semibold tracking-tight text-[#1a3673] sm:text-3xl">
                Access your CFO workspace
              </h1>
              <p className="text-sm leading-relaxed text-[rgba(26,54,115,0.75)]">
                Sign in to your WYZ environment to use AI CFO chat, artifacts, and reporting built on your own data.
              </p>
            </div>

            <form className="px-8 py-8 space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-1">
                <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-[rgba(15,23,42,0.55)]">
                  Tenant
                </label>
                <input
                  type="text"
                  autoComplete="organization"
                  value={tenantSlug}
                  onChange={(e) => setTenantSlug(e.target.value)}
                  className="w-full rounded-xl border border-[rgba(15,23,42,0.12)] bg-white px-3 py-2.5 text-sm text-[#0f172a] placeholder:text-slate-400 focus:border-[#1a3673] focus:outline-none focus:ring-1 focus:ring-[#1a3673]/70"
                  placeholder="your-tenant"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-[rgba(15,23,42,0.55)]">
                  Email
                </label>
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl border border-[rgba(15,23,42,0.12)] bg-white px-3 py-2.5 text-sm text-[#0f172a] placeholder:text-slate-400 focus:border-[#1a3673] focus:outline-none focus:ring-1 focus:ring-[#1a3673]/70"
                  placeholder="you@company.com"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-[rgba(15,23,42,0.55)]">
                  Password
                </label>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-[rgba(15,23,42,0.12)] bg-white px-3 py-2.5 text-sm text-[#0f172a] placeholder:text-slate-400 focus:border-[#1a3673] focus:outline-none focus:ring-1 focus:ring-[#1a3673]/70"
                  placeholder="••••••••"
                />
              </div>

              {(localError || auth.error) && (
                <p className="text-xs text-[#b91c1c]">
                  {localError || auth.error}
                </p>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-[rgba(252,125,37,0.2)] bg-[#fc7d25] px-5 py-3.5 text-sm font-semibold text-white shadow-[0_10px_32px_rgba(15,23,42,0.35)] transition-all duration-150 hover:-translate-y-0.5 hover:bg-[#e86f16] disabled:translate-y-0 disabled:opacity-70"
              >
                {isSubmitting ? "Signing in…" : "Sign in to WYZ"}
              </button>
            </form>

            <div className="flex flex-col items-center gap-3 px-8 pb-9">
              <div className="flex items-center gap-2 text-[11px] font-medium text-[rgba(15,23,42,0.6)]">
                <Shield size={14} className="shrink-0 text-[#fc7d25]" />
                Enterprise-grade security · Encrypted sessions · Role-based access
              </div>
              <p className="max-w-xs text-center text-[11px] leading-relaxed text-[rgba(15,23,42,0.55)]">
                By continuing you agree to secure processing of your financial data under our privacy and compliance
                frameworks.
              </p>
            </div>
          </div>
        </div>
      </div>
    </Background>
  );
}
