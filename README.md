# Theory Test Practice

A small static site for learning the Irish driver theory test. 805 questions with
explanations and sign images, a failed-questions bank, and a timed mock exam.

Questions come from [abdullahzia-6464/DTT-Practice-App](https://github.com/abdullahzia-6464/DTT-Practice-App)
(captured October 2025).

> **Please read [Source, licence and accuracy](#source-licence-and-accuracy) before
> relying on this to pass a real test.** This is unofficial material and the RSA
> warns against preparing with unofficial sources.

## Running it

Open `index.html` in a browser. That's it — no build step, no server, no
dependencies. The question data is a plain `<script>` file rather than a `fetch`,
specifically so it works over `file://` too.

## Modes

- **Practice** — pick a session length (10, 20, 40, 100 or all 805) from
  shuffled questions, with instant feedback and the official explanation after
  each answer. Your last choice is remembered.
- **Failed bank** — drills only the questions you have gotten wrong. A wrong
  answer in **any** mode (practice, drill or exam) puts a question in the bank.
  Only a **correct answer while drilling the bank** takes it out; getting it
  right in practice or an exam leaves it there.
- **Mock exam** — 40 questions, 45 minutes, pass mark 35, mirroring the real
  test. No feedback until you finish, then you can review what you missed.
  A checkbox on the setup screen turns on **per-question feedback**: your answer
  is marked right or wrong immediately with the explanation, while the timer
  keeps running and the score still only appears at the end. Off by default.

Note that with exam feedback off you can change your answer before pressing
Next; with it on, the question locks once answered.

## How progress is stored

Progress syncs across devices by nickname. Each profile is one JSON blob, held
by a small Cloudflare Worker keyed on the nickname (`worker/worker.js`). Log in
with the same nickname on your phone and your laptop and you see the same
progress. `localStorage` is now only a **cache** — it keeps the app instant and
lets it keep working through a dropped connection; the Worker is the source of
truth. Changes are pushed to the Worker debounced, and flushed when the tab is
hidden or closed.

There is deliberately **no password**:

- A nickname is a label, not a login. Anyone who knows a nickname can open and
  overwrite it. Fine for a personal study tool; don't put anything private in it.
- Offline, the app falls back to this device's cached copy. If you open a
  nickname you've never used on this device *while* the server is unreachable,
  login is refused rather than risk overwriting good server data with a blank.
- **Export progress** still saves a JSON backup; **Import** loads one back in.
- **Remove from this device** clears the nickname's local cache only; the server
  copy survives, so logging in again anywhere brings it back.

Every read and write goes through `js/storage.js`, and every write reaches the
Worker through the two endpoints in `worker/worker.js` (`GET /<nickname>` to
load, `PUT /<nickname>` to save). The Worker URL is the one constant at the top
of `js/storage.js`; change it there if you redeploy the Worker.

## Files

```
index.html        markup for all four screens
css/style.css     styling, light and dark
js/questions.js   generated question data - do not edit by hand
js/storage.js     profiles and progress; syncs to the Worker, caches locally
js/app.js         screens, quiz flow, exam timer and scoring
worker/worker.js  Cloudflare Worker: the cross-device progress store
img/              239 sign images, vendored from the source repo
dtt-2025.json     upstream source data, input to build.js
build.js          regenerates questions.js and re-downloads images
```

### Why the images are vendored

They are copied into `img/` rather than hotlinked so the site is self-contained,
works offline, and cannot be broken by a server we do not control. An earlier
version of this project pulled images from a third-party CDN belonging to
theory-tester.com; that site now returns `502`, which is exactly the failure
vendoring avoids.

Re-run `node build.js` to refresh them. It downloads to a `.part` file and
renames on completion, so an interrupted run never leaves a truncated image, and
it validates the source data before writing `js/questions.js`.

## Source, licence and accuracy

The question text, explanations and images in this repository are **not mine**.
They come from [abdullahzia-6464/DTT-Practice-App](https://github.com/abdullahzia-6464/DTT-Practice-App),
whose author states: *"I do not own any of the test material. I have found
everything publicly available online and only consolidated it here."* That
repository carries no licence. The questions ultimately originate with Ireland's
Road Safety Authority.

This repository exists as a **personal, non-commercial study aid**. No ownership
of the questions, explanations or images is claimed. If you hold rights to any
of this material and would prefer it not be hosted here, open an issue and it
will be removed.

Only the site code — `index.html`, `css/`, `js/app.js`, `js/storage.js` and
`build.js` — is my own work.

### This is unofficial material

The RSA is blunt about this:

> There are currently a number of unlicensed and unofficial revision material
> apps and websites on the market. These apps and websites are not licensed by
> the RSA and do not contain the official DTT questions. Research has shown that
> some candidates who prepare using the unofficial materials have been
> unsuccessful in their Driver Theory Test.

This site is one of those unofficial resources. The only official revision
material is sold by Prometric at [dttstore.prometric.com](https://dttstore.prometric.com/);
there is no free official PDF of the question bank.

What can be said for this dataset is that it matches the shape of the current
test — **805 questions across the five official categories**, where the official
bank is described as "almost 800 questions from five categories" — and it
contains post-2024 material such as e-scooter rules. It replaced an earlier 2018
dataset that had 890 questions, 18 obsolete category headings and no e-scooter
content at all.

That is evidence of currency, not proof of accuracy. Check anything touching
**penalties, limits, thresholds or documentation** against official material:

- [RSA Rules of the Road](https://www.rsa.ie/road-safety/road-users/rules-of-the-road) (free, current)
- [Official driver theory test](https://theorytest.ie/) (Prometric)

Use this to drill volume and recognise signs. Do not use it as your only source.

## Publishing to GitHub Pages

```sh
git init
git add .
git commit -m "Theory test practice site"
git remote add origin git@github.com:<you>/<repo>.git
git push -u origin main
```

Then in the repo: **Settings → Pages → Source: Deploy from a branch**, branch
`main`, folder `/ (root)`. The site appears at
`https://<you>.github.io/<repo>/` within a minute or two.
