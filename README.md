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
- **Failed bank** — drills only the questions you have gotten wrong. A question
  leaves the bank after **2 correct answers in a row**, so a lucky guess on a
  multiple choice doesn't clear it.
- **Mock exam** — 40 questions, 45 minutes, pass mark 35, mirroring the real
  test. No feedback until you finish, then you can review what you missed.
  A checkbox on the setup screen turns on **per-question feedback**: your answer
  is marked right or wrong immediately with the explanation, while the timer
  keeps running and the score still only appears at the end. Off by default.

Note that with exam feedback off you can change your answer before pressing
Next; with it on, the question locks once answered.

## How progress is stored

Progress lives in the browser's `localStorage`, one JSON blob per profile. There
is deliberately **no password and no server**:

- Profiles are a convenience for sharing a device, *not* security. Anyone using
  the browser can open any profile.
- Progress does not sync between devices. Your phone and your laptop keep
  separate records.
- Clearing site data wipes it. Use **Export progress** to save a JSON backup,
  and **Import** to restore it or move it to another device.

Importing never overwrites an existing profile — a name collision is renamed to
`Name (2)`.

Every read and write goes through `js/storage.js`. If you ever want real accounts
with cross-device sync, that one file is the thing to replace.

## Files

```
index.html        markup for all four screens
css/style.css     styling, light and dark
js/questions.js   generated question data - do not edit by hand
js/storage.js     profiles and progress; the only code touching localStorage
js/app.js         screens, quiz flow, exam timer and scoring
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
