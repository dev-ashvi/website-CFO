import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Shield } from "lucide-react";
import Background from "../components/Background.jsx";
import topLogo from "../assets/brand/adobe-express-file-1.png";

const initialForm = {
  email: "",
  companyName: "",
  designation: "",
  phone: "",
};

export default function EarlyAccessPage() {
  const [form, setForm] = useState(initialForm);
  const [submitted, setSubmitted] = useState(false);

  const onChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const onSubmit = (e) => {
    e.preventDefault();
    setSubmitted(true);
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
            <div className="px-8 pt-9 pb-2 text-center">
              <div className="mb-5 flex justify-center">
                <img src={topLogo} alt="Wyz logo" className="h-auto w-full max-w-[200px] object-contain" />
              </div>
              <h1 className="mb-2 text-2xl font-semibold tracking-tight text-[#1a3673] sm:text-3xl">Get Early Access</h1>
              <p className="text-sm leading-relaxed text-[rgba(26,54,115,0.75)]">
                Share your details and our team will reach out with workspace access.
              </p>
            </div>

            <form onSubmit={onSubmit} className="space-y-4 px-8 py-8">
              <div className="space-y-1">
                <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-[rgba(15,23,42,0.55)]">
                  Email ID
                </label>
                <input
                  name="email"
                  type="email"
                  required
                  value={form.email}
                  onChange={onChange}
                  className="w-full rounded-xl border border-[rgba(15,23,42,0.12)] bg-white px-3 py-2.5 text-sm text-[#0f172a] placeholder:text-slate-400 focus:border-[#1a3673] focus:outline-none focus:ring-1 focus:ring-[#1a3673]/70"
                  placeholder="name@company.com"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-[rgba(15,23,42,0.55)]">
                  Company Name
                </label>
                <input
                  name="companyName"
                  type="text"
                  required
                  value={form.companyName}
                  onChange={onChange}
                  className="w-full rounded-xl border border-[rgba(15,23,42,0.12)] bg-white px-3 py-2.5 text-sm text-[#0f172a] placeholder:text-slate-400 focus:border-[#1a3673] focus:outline-none focus:ring-1 focus:ring-[#1a3673]/70"
                  placeholder="Company Pvt Ltd"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-[rgba(15,23,42,0.55)]">
                  Designation
                </label>
                <input
                  name="designation"
                  type="text"
                  required
                  value={form.designation}
                  onChange={onChange}
                  className="w-full rounded-xl border border-[rgba(15,23,42,0.12)] bg-white px-3 py-2.5 text-sm text-[#0f172a] placeholder:text-slate-400 focus:border-[#1a3673] focus:outline-none focus:ring-1 focus:ring-[#1a3673]/70"
                  placeholder="Founder / CFO / Finance Lead"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-[rgba(15,23,42,0.55)]">
                  Phone Number (optional)
                </label>
                <input
                  name="phone"
                  type="tel"
                  value={form.phone}
                  onChange={onChange}
                  className="w-full rounded-xl border border-[rgba(15,23,42,0.12)] bg-white px-3 py-2.5 text-sm text-[#0f172a] placeholder:text-slate-400 focus:border-[#1a3673] focus:outline-none focus:ring-1 focus:ring-[#1a3673]/70"
                  placeholder="+91 98765 43210"
                />
              </div>

              {submitted ? (
                <p className="text-xs text-emerald-700">Thanks. Your request has been captured.</p>
              ) : null}

              <button
                type="submit"
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-[rgba(252,125,37,0.2)] bg-[#fc7d25] px-5 py-3.5 text-sm font-semibold text-white shadow-[0_10px_32px_rgba(15,23,42,0.35)] transition-all duration-150 hover:-translate-y-0.5 hover:bg-[#e86f16]"
              >
                Submit request
              </button>
            </form>

            <div className="flex flex-col items-center gap-3 px-8 pb-9">
              <div className="flex items-center gap-2 text-[11px] font-medium text-[rgba(15,23,42,0.6)]">
                <Shield size={14} className="shrink-0 text-[#fc7d25]" />
                Enterprise-grade security · Encrypted sessions · Role-based access
              </div>
            </div>
          </div>
        </div>
      </div>
    </Background>
  );
}
