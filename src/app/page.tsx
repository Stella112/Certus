/**
 * Phase 1 scaffold placeholder. The operator console and oversight dashboard are Phase 6.
 * Deliberately shows no payment state: nothing here is backed by real records yet, and
 * PART V forbids displaying state that is not.
 */
export default function Home() {
  return (
    <main className="mx-auto max-w-2xl p-10">
      <h1 className="text-2xl font-semibold">Certus</h1>
      <p className="mt-2 text-sm opacity-70">Policy-gated intent settlement for verified finance</p>
      <p className="mt-8 text-sm">
        Phase 1 spine is in place: the four-check pipeline, the Cleanverse adapter boundary, and the
        append-only audit store. The operator console and oversight dashboard arrive in Phase 6.
      </p>
    </main>
  );
}
