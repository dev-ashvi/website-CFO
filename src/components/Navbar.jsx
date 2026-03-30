import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import topLogo from "../../ChatGPT_Image_Mar_30__2026__07_33_52_PM-removebg-preview.png";

const nav = [
  { label: "Benefits", href: "#benefits" },
  { label: "Services", href: "#services" },
  { label: "Research", href: "#vision" },
  { label: "Security", href: "#security" },
];

export default function Navbar() {
  const [hidden, setHidden] = useState(false);
  const lastY = useRef(0);

  useEffect(() => {
    lastY.current = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      const dy = y - lastY.current;
      lastY.current = y;
      if (y < 48) {
        setHidden(false);
        return;
      }
      if (dy > 6) setHidden(true);
      else if (dy < -6) setHidden(false);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav
      className={`fixed top-0 z-50 w-full overflow-x-clip bg-white/95 px-3 pt-4 shadow-[0_1px_0_rgba(26,54,115,0.06)] backdrop-blur-md transition-transform duration-300 ease-out will-change-transform md:px-8 md:pt-5 ${
        hidden ? "-translate-y-full pointer-events-none" : "translate-y-0"
      }`}
    >
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-2 px-0 py-0 sm:px-1">
        <Link to="/" className="flex min-w-0 shrink cursor-pointer items-center gap-2">
          <img
            src={topLogo}
            alt="Wyz logo"
            className="h-12 w-auto max-w-[150px] object-contain sm:h-20 sm:max-w-none md:h-24"
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

        <div className="shrink-0 flex items-center gap-2 sm:gap-3">
          <Link
            to="/login"
            className="hidden px-2 text-sm font-semibold text-slate-600 transition-colors hover:text-[#1a3673] sm:block"
          >
            Login
          </Link>
          <a
            href="#final-cta"
            className="rounded-full bg-[#1a3673] px-3 py-1.5 text-[10px] font-medium text-white transition-colors hover:bg-[#122652] sm:px-5 sm:py-2.5 sm:text-xs"
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
