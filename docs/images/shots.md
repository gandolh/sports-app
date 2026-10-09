# README images

How each image was made, so the next refresh is a re-run. Re-take an image when the screen it shows changes.

| File | Shows | How to reach that state | Viewport | Data | Taken |
|---|---|---|---|---|---|
| workout.gif | Today screen, Start workout, a knee push-up set logged and the dots filling, then the front plank countdown | demo data below, open `/sports-app/`, tap Start workout, Log 10, Next set ×3, Start 46s | 390×844 @2x, dark, scaled to 480 px wide | made-up `demo` account | 2026-10-09 |
| plan.webp | Plan: the month calendar and the next sessions | demo data, open `/sports-app/plan` | iPhone 14 (390×844 @3x), dark, scaled to 780 px wide | made-up `demo` account | 2026-10-09 |
| progress.webp | Progress: totals, milestones, the push target chart | demo data, open `/sports-app/progress` | same | made-up `demo` account | 2026-10-09 |
| exercise-reference.webp | Exercise reference with "pushups" searched and the Pushups entry open | demo data, open `/sports-app/library`, search `pushups`, open the first entry | same | free-exercise-db content, no user data | 2026-10-09 |

The theme follows the system setting; these use dark (`agent-browser set media dark`), the direction PRODUCT.md describes.

## Demo data

Every screen needs a username, and signing in loops at the time of writing (see [getting-started.md](../getting-started.md#signing-in-loops)). So the captures use a fresh browser profile, a made-up user called `demo`, and a history generated with the app's own pure functions. No state service is needed.

1. Save this as `seed-doc.ts` anywhere outside the repo, then run `node /path/to/seed-doc.ts > /tmp/demo-doc.json` from the repo root (keep the output out of the repo). It writes 27 sessions over the last seven weeks, most of them logged, so the next session is a Push day.

   ```ts
   const root = `file://${process.cwd()}`
   const { emptyDoc, serialise } = await import(`${root}/client/src/persistence/codec.ts`)
   const { prescribe, toSessionResult, recordSession } = await import(`${root}/client/src/domain/schedule.ts`)

   const daysAgo = [46, 44, 43, 41, 40, 38, 36, 35, 33, 31, 29, 28, 26, 22, 21, 19, 17, 15, 14, 12, 10, 8, 7, 5, 3, 2, 1]
   const variants = ['medium', 'medium', 'easy', 'medium', 'hard', 'medium']

   let doc = emptyDoc('demo')
   daysAgo.forEach((ago, i) => {
     const at = new Date()
     at.setUTCDate(at.getUTCDate() - ago)
     at.setUTCHours(6 + (i % 3), 10, 0, 0)
     let result = toSessionResult(prescribe(doc, variants[i % variants.length]), at.toISOString())
     if (i % 4 !== 2) {
       result = {
         ...result,
         exercises: result.exercises.map((e, j) => ({
           ...e,
           logged: Array.from({ length: e.sets }, (_, s) => Math.max(1, e.targetValue - ((i + j + s) % 3 === 0 ? 1 : 0))),
         })),
       }
     }
     doc = recordSession(doc, result)
   })
   process.stdout.write(serialise(doc))
   ```

2. Start `npm run dev`, open <http://localhost:5173/sports-app/icons/icon-192.png> (same origin, no redirect), and in the console set `localStorage['sports-app.session.v3'] = 'demo'` and `localStorage['sports-app.state.v3.demo']` to the text of `/tmp/demo-doc.json`.
3. Open <http://localhost:5173/sports-app/>.

## Capture

Stills: `agent-browser --session sports-app set device "iPhone 14"`, `set media dark`, open the page, wait two seconds, screenshot, then

```bash
ffmpeg -y -loglevel error -i shot.png -vf scale=780:-1:flags=lanczos -c:v libwebp -quality 82 shot.webp
```

GIF: `agent-browser record start` opens a new browser context, so start it on the icon URL, seed `localStorage` again inside it, then `set viewport 390 844 2` and `set media dark`. Recording at 3x drops frames, so use 2x. Click with `eval` (`button.click()`) rather than `find ... click`, which missed taps while recording. Convert, skipping the first blank half second:

```bash
ffmpeg -y -loglevel error -ss 0.6 -i flow.webm \
  -vf "fps=12,scale=480:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=256:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4" \
  -loop 0 workout.gif
```

The result is about 11.6 seconds and 1.5 MB.
