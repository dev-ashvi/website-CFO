import { Link } from "react-router-dom";
import Background from "../components/Background.jsx";
import { ArrowLeft, Lock, Shield } from "lucide-react";

export default function LoginPage() {
  return (
    <Background>
      <div className="relative z-50 px-4 pt-6 max-w-6xl mx-auto">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm font-semibold text-mist hover:text-white transition-colors"
        >
          <ArrowLeft size={18} />
          Back to home
        </Link>
      </div>

      <div className="relative z-10 min-h-[calc(100vh-80px)] flex flex-col items-center justify-center px-4 py-16">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[min(520px,90vw)] h-64 bg-accent/15 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 w-72 h-72 bg-[#1a3875] rounded-full blur-[90px] opacity-60 pointer-events-none" />

        <div className="relative w-full max-w-md">
          <div className="absolute -inset-px bg-gradient-to-b from-white/20 via-accent/20 to-transparent rounded-[28px] blur-sm opacity-60" />
          <div className="relative bg-navy-950/80 backdrop-blur-xl border border-white/10 rounded-[26px] shadow-card overflow-hidden">
            <div className="px-8 pt-10 pb-2 text-center">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-accent to-[#fca054] shadow-lg shadow-accent/35 mb-6">
                <Lock className="text-white" size={28} strokeWidth={2} />
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight mb-3">Access Your CFO Workspace</h1>
              <p className="text-sm text-mist leading-relaxed">
                Secure login to your personalized financial intelligence — dashboards, AI CFO chat, MIS, and planning in one
                command center.
              </p>
            </div>

            <div className="px-8 py-8 space-y-3">
              <button
                type="button"
                className="w-full flex items-center justify-center gap-3 rounded-xl border border-white/15 bg-white text-navy-900 px-5 py-3.5 text-sm font-bold hover:bg-gray-50 transition-all hover:-translate-y-0.5"
              >
                <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" aria-hidden>
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                Continue with Google
              </button>
              <button
                type="button"
                className="w-full flex items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/5 text-white px-5 py-3.5 text-sm font-bold hover:bg-white/10 transition-all hover:-translate-y-0.5"
              >
                Continue with Email
              </button>
            </div>

            <div className="px-8 pb-10 flex flex-col items-center gap-3">
              <div className="flex items-center gap-2 text-[11px] text-mist/90 font-medium">
                <Shield size={14} className="text-accent shrink-0" />
                Enterprise-grade security · Encrypted sessions · Role-based access
              </div>
              <p className="text-[11px] text-mist/60 text-center max-w-xs leading-relaxed">
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
