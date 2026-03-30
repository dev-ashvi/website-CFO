export default function Background({ children, className = "" }) {
  return (
    <div
      className={`min-h-screen bg-[#0a1635] text-white font-sans relative selection:bg-[#fc7c23] selection:text-white ${className}`}
    >
      <div
        className="fixed inset-0 z-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: `linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)`,
          backgroundSize: "40px 40px",
        }}
      />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
