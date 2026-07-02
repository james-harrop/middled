import Link from "next/link";

const PACKS = [
  {
    name: "One swing",
    price: "£5",
    bullets: ["One full analysis", "One fix, one drill", "Shareable report link"],
  },
  {
    name: "Range session",
    price: "£12",
    bullets: ["Three analyses", "Track the same fix", "Best for a practice block"],
    featured: true,
  },
  {
    name: "Season ticket",
    price: "£30",
    bullets: ["Ten analyses", "A season of check-ins", "60p cheaper per swing"],
  },
];

const FAQS = [
  {
    q: "Where does my video go?",
    a: "Nowhere. The pose analysis runs in your browser, on your phone. Only four still frames (address, top, impact, finish) and the measured angles are sent for coaching.",
  },
  {
    q: "What do I need to film?",
    a: "One full swing, face-on (camera pointing at your chest), phone upright, whole body in frame. Pause for a beat at address. Normal speed, under 45 seconds.",
  },
  {
    q: "Why only one fix?",
    a: "Because that's how golfers actually improve. Five swing thoughts is zero swing thoughts. We find the highest-leverage change and give you a drill for exactly that.",
  },
  {
    q: "Is this a subscription?",
    a: "No. Your first swing is free, then you pay per swing or grab a pack. No app to download, no account to manage, nothing renewing quietly in the background.",
  },
];

export default function Home() {
  return (
    <div className="max-w-5xl mx-auto px-6">
      {/* Hero */}
      <section className="py-20 sm:py-28 text-center">
        <p className="wordmark text-sm text-[var(--brass)] mb-6">
          AI swing analysis · no app · first swing free
        </p>
        <h1 className="display text-5xl sm:text-7xl mb-6">
          One swing.
          <br />
          One fix.
        </h1>
        <p className="dim text-lg max-w-xl mx-auto mb-10">
          Film one swing on your phone. Get the single change that matters most —
          with a drill and three checkpoints — in about a minute.
        </p>
        <Link href="/analyze" className="btn-brass text-lg">
          Analyse my swing — free
        </Link>
        <p className="dim text-sm mt-4">Your video never leaves your phone.</p>
      </section>

      {/* How it works */}
      <section className="py-16 border-t border-[var(--pine-3)]">
        <div className="brass-rule mb-4" />
        <h2 className="display text-3xl mb-10">Filmed to fixed in three steps.</h2>
        <div className="grid sm:grid-cols-3 gap-6">
          {[
            {
              n: "1",
              t: "Film face-on",
              d: "One swing, camera at chest height pointing at you, whole body in frame.",
            },
            {
              n: "2",
              t: "We measure it",
              d: "Your browser tracks 33 body points through the swing — spine tilt, sway, weight shift, tempo.",
            },
            {
              n: "3",
              t: "Get your fix",
              d: "A coach's read of your numbers: one fix, why it matters, one drill, three checkpoints.",
            },
          ].map((s) => (
            <div key={s.n} className="card p-6">
              <div className="wordmark text-[var(--brass)] text-2xl mb-3">{s.n}</div>
              <h3 className="font-extrabold text-lg mb-2">{s.t}</h3>
              <p className="dim text-sm leading-relaxed">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section className="py-16 border-t border-[var(--pine-3)]">
        <div className="brass-rule mb-4" />
        <h2 className="display text-3xl mb-2">First swing free. Then pay per swing.</h2>
        <p className="dim mb-10">No subscription. Credits tied to your email.</p>
        <div className="grid sm:grid-cols-3 gap-6">
          {PACKS.map((p) => (
            <div
              key={p.name}
              className={`card p-6 ${p.featured ? "outline-2 outline-[var(--brass)]" : ""}`}
            >
              <h3 className="font-extrabold text-lg">{p.name}</h3>
              <div className="display text-4xl my-3">{p.price}</div>
              <ul className="dim text-sm space-y-2">
                {p.bullets.map((b) => (
                  <li key={b}>· {b}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* FAQs */}
      <section className="py-16 border-t border-[var(--pine-3)]">
        <div className="brass-rule mb-4" />
        <h2 className="display text-3xl mb-10">Questions, answered.</h2>
        <div className="grid sm:grid-cols-2 gap-6">
          {FAQS.map((f) => (
            <div key={f.q} className="card p-6">
              <h3 className="font-extrabold mb-2">{f.q}</h3>
              <p className="dim text-sm leading-relaxed">{f.a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="py-20 text-center">
        <h2 className="display text-4xl mb-6">You know the feeling when you middle one.</h2>
        <Link href="/analyze" className="btn-brass text-lg">
          Find your fix — free
        </Link>
      </section>
    </div>
  );
}
