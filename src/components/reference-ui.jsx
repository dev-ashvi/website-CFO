export function SectionHeading({ title, subtitle, centered = true }) {
  return (
    <div className={`mb-12 md:mb-16 ${centered ? "text-center" : "text-left"} relative z-10`}>
      <h2 className="text-3xl md:text-5xl font-bold text-[#f8fafc] mb-6 tracking-tight leading-tight">{title}</h2>
      {subtitle && (
        <p className="text-lg text-[#a3b8d7] max-w-2xl font-light leading-relaxed mx-auto">{subtitle}</p>
      )}
    </div>
  );
}

export function GlassCard({ children, className = "" }) {
  return (
    <div
      className={`bg-white/5 backdrop-blur-md border border-white/10 rounded-3xl p-8 hover:bg-white/10 transition-colors duration-300 ${className}`}
    >
      {children}
    </div>
  );
}

export function DecorativeGlow({ color = "bg-[#fc7c23]", className = "" }) {
  return (
    <div className={`absolute rounded-full blur-[120px] pointer-events-none z-0 ${color} ${className}`} />
  );
}
