export function PageTitle({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return <section className="mb-7 flex flex-col justify-between gap-5 xl:flex-row xl:items-end"><div><div className="mb-3 flex items-center gap-2"><span className="rounded-md bg-indigo-brand/10 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-indigo-brand">{eyebrow}</span></div><h1 className="text-3xl font-semibold tracking-[-0.04em] text-ink sm:text-[38px]">{title}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{description}</p></div>{action}</section>;
}

export function StatCard({ label, value, detail, tone = 'ink' }: { label: string; value: string | number; detail: string; tone?: 'ink'|'green'|'amber'|'indigo'|'slate' }) {
  const colors = { ink:'text-ink',green:'text-emerald-600',amber:'text-amber-600',indigo:'text-indigo-brand',slate:'text-slate-500' };
  return <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-[0_6px_22px_rgba(15,23,42,0.035)]"><p className="text-[11px] font-medium text-slate-500">{label}</p><p className={`mt-3 text-[28px] font-semibold tracking-[-0.03em] ${colors[tone]}`}>{value}</p><p className="mt-1 text-[10px] text-slate-400">{detail}</p></div>;
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return <div className="grid min-h-[320px] place-items-center p-8 text-center"><div className="max-w-sm"><div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-indigo-brand/10 text-xl font-semibold text-indigo-brand ring-8 ring-indigo-brand/[0.035]">C</div><h3 className="mt-6 text-base font-semibold text-ink">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-500">{body}</p><div className="mt-5 inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500"><span className="h-1.5 w-1.5 rounded-full bg-slate-400"/>No simulated data</div></div></div>;
}

export function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_10px_40px_rgba(15,23,42,0.05)]"><div className="border-b border-slate-100 px-5 py-4 sm:px-6"><h2 className="text-sm font-semibold text-ink">{title}</h2>{subtitle && <p className="mt-1 text-xs text-slate-500">{subtitle}</p>}</div>{children}</section>;
}
