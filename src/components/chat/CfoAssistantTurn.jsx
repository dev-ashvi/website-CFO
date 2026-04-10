function TimeStamp({ created_at }) {
  if (!created_at) return null;
  return (
    <p className="mt-6 text-[10px] font-medium text-slate-400">
      {new Date(created_at).toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
      })}
    </p>
  );
}

export default function CfoAssistantTurn({ blocks, created_at }) {
  if (!blocks) return null;

  const { lead, bullets, warning, metrics, actions, closing } = blocks;

  return (
    <article className="w-full max-w-[min(100%,42rem)] rounded-2xl bg-white px-7 py-7 text-slate-800 shadow-sm">
      <p className="text-[11px] font-medium text-slate-400">Wyz CFO</p>

      {lead && <p className="mt-4 text-[15px] leading-[1.75] text-slate-800">{lead}</p>}

      {bullets && bullets.length > 0 && (
        <ul className="mt-5 space-y-3 border-l-2 border-[#fc7d25]/30 pl-4">
          {bullets.map((item) => (
            <li key={item} className="text-[14px] leading-relaxed text-slate-700">
              {item}
            </li>
          ))}
        </ul>
      )}

      {warning && (
        <div className="mt-6 rounded-lg bg-amber-50 px-4 py-3 text-[13px] leading-relaxed text-amber-950">
          <span className="text-[11px] font-semibold text-amber-800">Signal · </span>
          <span className="font-medium">{warning}</span>
        </div>
      )}

      {metrics && metrics.length > 0 && (
        <div className="mt-6">
          <table className="w-full text-left text-[13px]">
            <tbody className="divide-y divide-gray-100">
              {metrics.map((row) => (
                <tr key={row.label}>
                  <th scope="row" className="py-2.5 pr-4 font-medium text-slate-600">
                    {row.label}
                  </th>
                  <td className="py-2.5 text-right font-semibold tabular-nums text-[#1a3673]">{row.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {actions && actions.length > 0 && (
        <div className="mt-6 border-t border-gray-100 pt-6">
          <p className="text-[11px] font-semibold text-slate-500">Recommended actions</p>
          <ol className="mt-3 list-decimal space-y-2.5 pl-4 text-[14px] leading-relaxed text-slate-800 marker:text-slate-300">
            {actions.map((item) => (
              <li key={item} className="pl-1">
                {item}
              </li>
            ))}
          </ol>
        </div>
      )}

      {closing && <p className="mt-6 text-[14px] leading-relaxed text-slate-600">{closing}</p>}

      <TimeStamp created_at={created_at} />
    </article>
  );
}
