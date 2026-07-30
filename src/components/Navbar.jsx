import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import topLogo from "../assets/brand/adobe-express-file-1.png";

const ORANGE = "text-[#fc7d25]";
const NAVY = "text-[#1a3673]";

const nav = [
  { label: "Why WYZ", href: "#benefits" },
  { label: "Platform", href: "#wyz-platform" },
  {
    label: "Intelligence",
    children: [
      { label: "Ask WYZ", href: "#wyz-ai-chat" },
      { label: "Human in loop", href: "#human-in-the-loop" },
    ],
  },
  {
    label: "WYZ Tools",
    children: [{ label: "Cashflow Assessment", href: "/runway-simulator" }],
  },
  {
    label: "Trust",
    children: [
      { label: "Accuracy", href: "#accuracy" },
      { label: "Security", href: "#security" },
    ],
  },
];

const SECTION_IDS = [
  "benefits",
  "wyz-platform",
  "wyz-ai-chat",
  "human-in-the-loop",
  "accuracy",
  "security",
];

function hrefMatches(href, pathname, activeHash) {
  if (href.startsWith("/")) {
    return pathname === href || pathname.startsWith(`${href}/`);
  }
  return activeHash === href;
}

function isItemActive(item, pathname, activeHash) {
  if (item.href) return hrefMatches(item.href, pathname, activeHash);
  return item.children?.some((child) => hrefMatches(child.href, pathname, activeHash)) ?? false;
}

function scrollToHash(hash) {
  if (!hash || !hash.startsWith("#")) return false;
  const id = hash.slice(1);
  const el = document.getElementById(id);
  if (!el) return false;
  const navbar = document.querySelector("[data-site-navbar]");
  const offset = (navbar?.getBoundingClientRect().height ?? 0) + 24;
  const top = el.getBoundingClientRect().top + window.scrollY - offset;
  window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  window.history.replaceState(null, "", hash);
  return true;
}

function NavDropdown({
  label,
  items,
  compact = false,
  open,
  onOpen,
  onClose,
  active,
  pathname,
  activeHash,
}) {
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e) => {
      if (!rootRef.current?.contains(e.target)) onClose();
    };
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  const selected = active || open;
  const triggerCls = compact
    ? `inline-flex items-center gap-0.5 font-medium transition-colors ${selected ? ORANGE : NAVY} hover:text-[#fc7d25]`
    : `inline-flex items-center gap-1 font-medium transition-colors ${selected ? ORANGE : NAVY} hover:text-[#fc7d25]`;

  const menuCls = compact
    ? "absolute left-1/2 top-full z-50 mt-1 min-w-[11.5rem] -translate-x-1/2 rounded-lg border border-[rgba(26,54,115,0.12)] bg-white py-1.5 text-left shadow-[0_8px_24px_rgba(26,54,115,0.12)]"
    : "absolute left-1/2 top-full z-50 mt-1.5 min-w-[12.5rem] -translate-x-1/2 rounded-xl border border-[rgba(26,54,115,0.12)] bg-white py-1.5 text-left shadow-[0_12px_32px_rgba(26,54,115,0.14)]";

  const itemBaseCls = compact
    ? "block px-3 py-2 text-[11px] font-medium transition-colors hover:bg-[#f4f8ff]"
    : "block px-3.5 py-2.5 text-[13px] font-medium transition-colors hover:bg-[#f4f8ff]";

  const handleHashNav = (e, href) => {
    e.preventDefault();
    onClose();
    // Defer so the menu can close without swallowing navigation.
    requestAnimationFrame(() => {
      if (pathname === "/" || pathname === "/finance-team") {
        scrollToHash(href);
        return;
      }
      window.location.assign(`/${href}`);
    });
  };

  return (
    <div ref={rootRef} className="relative" data-nav-dropdown onMouseEnter={onOpen}>
      <button
        type="button"
        className={triggerCls}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => (open ? onClose() : onOpen())}
      >
        {label}
        <ChevronDown
          size={compact ? 11 : 14}
          className={`transition-transform duration-150 ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>
      {open ? (
        <div className={menuCls} role="menu">
          {items.map((child) => {
            const childActive = hrefMatches(child.href, pathname, activeHash);
            const childCls = `${itemBaseCls} ${childActive ? ORANGE : NAVY} hover:text-[#fc7d25]`;
            return child.href.startsWith("/") ? (
              <Link
                key={child.href}
                to={child.href}
                role="menuitem"
                className={childCls}
                onClick={onClose}
              >
                {child.label}
              </Link>
            ) : (
              <a
                key={child.href}
                href={child.href}
                role="menuitem"
                className={childCls}
                onClick={(e) => handleHashNav(e, child.href)}
              >
                {child.label}
              </a>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function NavItem({ item, compact = false, openMenu, setOpenMenu, pathname, activeHash }) {
  const active = isItemActive(item, pathname, activeHash);

  if (item.children) {
    return (
      <NavDropdown
        label={item.label}
        items={item.children}
        compact={compact}
        open={openMenu === item.label}
        onOpen={() => setOpenMenu(item.label)}
        onClose={() => setOpenMenu(null)}
        active={active}
        pathname={pathname}
        activeHash={activeHash}
      />
    );
  }

  const linkCls = `font-medium transition-colors ${active ? ORANGE : NAVY} hover:text-[#fc7d25]`;

  if (item.href.startsWith("/")) {
    return (
      <Link
        to={item.href}
        className={linkCls}
        onMouseEnter={() => setOpenMenu(null)}
      >
        {item.label}
      </Link>
    );
  }

  return (
    <a
      href={item.href}
      className={linkCls}
      onMouseEnter={() => setOpenMenu(null)}
      onClick={(e) => {
        e.preventDefault();
        setOpenMenu(null);
        requestAnimationFrame(() => {
          if (pathname === "/" || pathname === "/finance-team") {
            scrollToHash(item.href);
            return;
          }
          window.location.assign(`/${item.href}`);
        });
      }}
    >
      {item.label}
    </a>
  );
}

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(min-width: 768px)").matches : true,
  );

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const onChange = () => setIsDesktop(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return isDesktop;
}

export default function Navbar() {
  const { pathname } = useLocation();
  const isDesktop = useIsDesktop();
  const [hidden, setHidden] = useState(false);
  const [openMenu, setOpenMenu] = useState(null);
  const [activeHash, setActiveHash] = useState(() =>
    typeof window !== "undefined" ? window.location.hash || "" : "",
  );
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
      if (dy > 6) {
        setHidden(true);
        setOpenMenu(null);
      } else if (dy < -6) setHidden(false);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const syncFromLocation = () => {
      setActiveHash(window.location.hash || "");
    };

    const syncFromScroll = () => {
      if (pathname !== "/" && pathname !== "/finance-team") {
        return;
      }
      const offset = 140;
      let current = "";
      for (const id of SECTION_IDS) {
        const el = document.getElementById(id);
        if (!el) continue;
        if (el.getBoundingClientRect().top <= offset) current = `#${id}`;
      }
      if (current) setActiveHash(current);
    };

    syncFromLocation();
    syncFromScroll();

    window.addEventListener("hashchange", syncFromLocation);
    window.addEventListener("scroll", syncFromScroll, { passive: true });
    return () => {
      window.removeEventListener("hashchange", syncFromLocation);
      window.removeEventListener("scroll", syncFromScroll);
    };
  }, [pathname]);

  useEffect(() => {
    setOpenMenu(null);
  }, [pathname]);

  useEffect(() => {
    setOpenMenu(null);
  }, [isDesktop]);

  return (
    <nav
      data-site-navbar
      data-wyz-navbar
      className={`fixed top-0 z-50 w-full overflow-visible bg-white/95 px-3 pt-4 shadow-[0_1px_0_rgba(26,54,115,0.06)] backdrop-blur-md transition-transform duration-300 ease-out will-change-transform md:px-8 md:pt-5 ${
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

        {isDesktop ? (
          <div className="hidden items-center gap-8 text-[13px] font-medium md:flex">
            {nav.map((item) => (
              <NavItem
                key={item.label}
                item={item}
                openMenu={openMenu}
                setOpenMenu={setOpenMenu}
                pathname={pathname}
                activeHash={activeHash}
              />
            ))}
          </div>
        ) : null}

        <div className="shrink-0 flex items-center gap-2 sm:gap-3">
          <Link
            to="/login"
            className="hidden px-2 text-sm font-semibold text-[#1a3673] transition-colors hover:text-[#fc7d25] sm:block"
          >
            Login
          </Link>
          <Link
            to="/early-access"
            className="rounded-full bg-[#1a3673] px-3 py-1.5 text-[10px] font-medium text-white transition-colors hover:bg-[#122652] sm:px-5 sm:py-2.5 sm:text-xs"
          >
            Early Access
          </Link>
        </div>
      </div>

      {!isDesktop ? (
        <div className="mt-3 flex flex-wrap justify-center gap-x-5 gap-y-2 px-2 text-[11px] font-medium md:hidden">
          {nav.map((item) => (
            <NavItem
              key={item.label}
              item={item}
              compact
              openMenu={openMenu}
              setOpenMenu={setOpenMenu}
              pathname={pathname}
              activeHash={activeHash}
            />
          ))}
          <Link to="/login" className={`sm:hidden ${NAVY} transition-colors hover:text-[#fc7d25]`}>
            Login
          </Link>
        </div>
      ) : null}
    </nav>
  );
}
