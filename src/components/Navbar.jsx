import { Link } from "react-router-dom";

const nav = [
  { label: "Benefits", href: "#benefits" },
  { label: "Services", href: "#services" },
  { label: "Research", href: "#vision" },
  { label: "Security", href: "#security" },
];

export default function Navbar() {
  return (
    <nav className="fixed top-0 z-50 w-full px-4 pt-6 transition-all duration-300 md:px-8">
      <div className="mx-auto flex max-w-5xl items-center justify-between rounded-full border border-white/20 bg-white/95 px-5 py-2.5 shadow-[0_8px_30px_rgb(0,0,0,0.12)] backdrop-blur-md">
        <Link to="/" className="flex shrink-0 cursor-pointer items-center gap-2">
          <svg width="24" height="24" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
            <path
              d="M20 0C8.954 0 0 8.954 0 20C0 31.046 8.954 40 20 40C31.046 40 40 31.046 40 20C40 8.954 31.046 0 20 0ZM28.5 28C26 29.5 22.5 30 20 30C15.5 30 12 27.5 12 25C12 22 15.5 20.5 19 20C22.5 19.5 25 18.5 25 16C25 14 22.5 12.5 20 12.5C17.5 12.5 14.5 13.5 12 15V11C14.5 9.5 17.5 9 20 9C24.5 9 28 11.5 28 14C28 17 24.5 18.5 21 19C17.5 19.5 15 20.5 15 23C15 25 17.5 26.5 20 26.5C22.5 26.5 26 25.5 28.5 24V28Z"
              fill="url(#paint0_linear_nav)"
            />
            <defs>
              <linearGradient id="paint0_linear_nav" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
                <stop stopColor="#fc7c23" />
                <stop offset="1" stopColor="#fca054" />
              </linearGradient>
            </defs>
          </svg>
          <span className="text-lg font-bold text-[#fc7c23]">Cfo</span>
        </Link>

        <div className="hidden items-center gap-8 text-[13px] font-semibold text-gray-600 md:flex">
          {nav.map((item) => (
            <a key={item.href} href={item.href} className="transition-colors hover:text-[#fc7c23]">
              {item.label}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <Link
            to="/login"
            className="hidden px-2 text-sm font-semibold text-gray-600 transition-colors hover:text-gray-900 sm:block"
          >
            Login
          </Link>
          <a
            href="#final-cta"
            className="bg-[#fc7c23] px-5 py-2.5 text-xs font-semibold text-white shadow-md shadow-orange-500/20 transition-all hover:bg-[#e66c1b] hover:shadow-orange-500/40 rounded-full"
          >
            Contact Us
          </a>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap justify-center gap-x-5 gap-y-2 px-2 text-[11px] font-semibold text-[#a3b8d7] md:hidden">
        {nav.map((item) => (
          <a key={item.href} href={item.href} className="transition-colors hover:text-white">
            {item.label}
          </a>
        ))}
        <Link to="/login" className="transition-colors hover:text-white sm:hidden">
          Login
        </Link>
      </div>
    </nav>
  );
}
