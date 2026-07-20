# Theory Test Practice

A small static site for learning the Irish driver theory test. 890 questions with
explanations and sign images, a failed-questions bank, and a timed mock exam.

Questions come from [adamisntdead/theory-test-questions](https://github.com/adamisntdead/theory-test-questions).

## Running it

Open `index.html` in a browser. That's it — no build step, no server, no
dependencies. The question data is a plain `<script>` file rather than a `fetch`,
specifically so it works over `file://` too.

## Modes

- **Practice** — pick a session length (10, 20, 40, 100 or all 890) from
  shuffled questions, with instant feedback and the official explanation after
  each answer. Your last choice is remembered.
- **Failed bank** — drills only the questions you have gotten wrong. A question
  leaves the bank after **2 correct answers in a row**, so a lucky guess on a
  1-in-4 multiple choice doesn't clear it.
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
img/              240 sign images, vendored from the source CDN
data.json         upstream source data, input to build.js
build.js          regenerates questions.js and re-downloads images
```

### Why the images are vendored

The source data points at `http://d1fohtyzq6kn2t.cloudfront.net/...`, a CDN
belonging to an unrelated quiz site. They are copied into `img/` because:

- The URLs are plain `http://`, which browsers block on an HTTPS page like
  GitHub Pages. Every sign question would render blank.
- The CDN could disappear or add hotlink protection at any time, and the failure
  would be silent.
- Local images work offline, which is when you are most likely to be revising.

Re-run `node build.js` to refresh them. It downloads to a `.part` file and
renames on completion, so an interrupted run never leaves a truncated image.

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
