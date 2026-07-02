# Launch drafts — for James to review and post himself

All drafts below follow the house rule: **nothing gets posted directly — these are
drafts for approval.** Post only after the real-device pass and live keys.

---

## r/GolfSwing (primary — people literally post swings here asking for feedback)

**Title:** I built a free tool that gives you ONE fix from a face-on swing video — analysed in your browser, video never uploads

**Body:**
I got tired of swing apps that bury you in 15 metrics and a subscription. So I built
Middled: you film one face-on swing on your phone, it tracks your body in the browser
(the video never leaves your phone — only four still frames are analysed), and you get
one fix, why it matters based on your measured numbers, one drill, and three
checkpoints.

First swing is free, no app to download: middled.golf

Would genuinely love this sub's feedback — especially where the fix it picks disagrees
with what your coach says. It measures spine tilt, hip sway, weight shift, lead-arm
angle and tempo ratio from the pose data, so it argues from numbers, not vibes.

---

## r/golf (softer angle)

**Title:** Made a thing: one swing in, one fix out. Free first swing, no app.

**Body:**
Weekend project that got out of hand. Film one face-on swing → browser measures your
positions → you get the single highest-leverage fix plus a drill. Privacy-first: the
video is analysed on your phone and never uploaded. middled.golf — first one's free,
tear it apart.

---

## LinkedIn (builder angle)

48 hours ago middled.golf didn't exist.

It's a golf swing analyser with a difference: the AI coaching runs on measured
biomechanics (pose estimation in your browser — your video never uploads), and instead
of drowning you in metrics it gives you ONE fix, one drill, three checkpoints.

Built solo with Claude: on-device MediaPipe pose tracking, swing-phase detection from
the wrist trajectory, and Claude reasoning over the measured joint angles rather than
eyeballing pixels.

First swing free — middled.golf. If you play, I'd love your honest read.

---

## Short-form video scripts (screen-record a real analysis)

**1. "One fix" (15s)**
- Hook (on-screen): "Your swing doesn't need 15 fixes."
- Screen-record: upload swing → four frames appear → report lands.
- VO: "Film one swing. It measures your positions in your browser. One fix, one
  drill, three checkpoints. First swing free."

**2. "Privacy" (12s)**
- Hook: "This app never sees your video."
- Show airplane-mode-style demo of pose extraction running, then the report.
- VO: "The tracking happens on your phone. Only four stills get analysed. middled.golf."

**3. "The pub test" (15s)**
- Hook: "What a £150-an-hour coach and my phone agreed on."
- Side-by-side: coach note vs Middled report saying the same fix.
- VO: "Numbers don't lie. One swing, one fix, free. middled.golf."

---

## GolfWRX / forum post (longer, technical crowd)

Same body as r/GolfSwing plus one paragraph on method: "It finds address, top, impact
and finish from the wrist trajectory (anchored on the downswing speed peak), measures
spine tilt / sway / weight shift / lead-arm angle / tempo in shoulder-width units so
it's camera-distance independent, and the coaching model is required to argue from
those measurements — with confidence downgraded when tracking quality drops."
