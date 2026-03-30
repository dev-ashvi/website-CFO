import { Link } from "react-router-dom";
import topLogo from "../../ChatGPT_Image_Mar_30__2026__07_33_52_PM-removebg-preview.png";

const nav = [
  { label: "Benefits", href: "#benefits" },
  { label: "Services", href: "#services" },
  { label: "Research", href: "#vision" },
  { label: "Security", href: "#security" },
];

export default function Navbar() {
  return (
    <nav className="fixed top-0 z-50 w-full px-4 pt-5 transition-all duration-300 md:px-8">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-0 py-0 sm:px-1">
        <Link to="/" className="flex shrink-0 cursor-pointer items-center gap-2">
          <img
            src={topLogo}
            alt="Wyz logo"
            className="h-16 w-auto object-contain sm:h-20 md:h-24"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />

        </Link>

        <div className="hidden items-center gap-8 text-[13px] font-medium text-slate-600 md:flex">
          {nav.map((item) => (
            <a key={item.href} href={item.href} className="transition-colors hover:text-[#1a3673]">
              {item.label}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <Link
            to="/login"
            className="hidden px-2 text-sm font-semibold text-slate-600 transition-colors hover:text-[#1a3673] sm:block"
          >
            Login
          </Link>
          <a
            href="#final-cta"
            className="rounded-full bg-[#1a3673] px-3.5 py-2 text-[11px] font-medium text-white transition-colors hover:bg-[#122652] sm:px-5 sm:py-2.5 sm:text-xs"
          >
            Book Demo
          </a>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap justify-center gap-x-5 gap-y-2 px-2 text-[11px] font-medium text-slate-500 md:hidden">
        {nav.map((item) => (
          <a key={item.href} href={item.href} className="transition-colors hover:text-[#1a3673]">
            {item.label}
          </a>
        ))}
        <Link to="/login" className="transition-colors hover:text-[#1a3673] sm:hidden">
          Login
        </Link>
      </div>
    </nav>
  );
}
