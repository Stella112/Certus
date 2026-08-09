'use client';

import { useEffect, useState } from 'react';

export function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => setDark(document.documentElement.classList.contains('dark')), []);
  function toggle() {
    const next = !dark;
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('certus-theme', next ? 'dark' : 'light');
    setDark(next);
  }
  return <button onClick={toggle} aria-label={`Switch to ${dark ? 'light' : 'dark'} mode`} className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 bg-white text-sm text-slate-600 shadow-sm transition hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">{dark ? '☀' : '◐'}</button>;
}
