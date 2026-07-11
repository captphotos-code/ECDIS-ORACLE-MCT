# ECDIS ORACLE - M.CT.

A self-contained, static web app that runs a randomized 50-question ECDIS assessment from your 150-question bank, with a 40-minute timer, auto-submit, PDF result reports, and an admin dashboard with CSV export.

No build step, no server, no database required — it's plain HTML/CSS/JS and can be hosted for free on **GitHub Pages** or **Netlify**.

## What's in this folder

```
index.html        ← the test itself (landing → register → quiz → results)
admin.html         ← admin login + attempt log + CSV export
css/style.css      ← all styling
js/questions.js    ← your 150 questions, converted from the CSV you provided
js/app.js          ← quiz logic (selection, timer, scoring, PDF)
js/admin.js        ← admin dashboard logic
```

## How the 50-question test is built

Every time someone clicks **Register & Begin**, the app randomly draws 50 questions from the 150-question bank using two layers of balancing, so every attempt is different but similarly fair:

- **Difficulty mix**: 10 Easy, 33 Medium, 7 Hard (matching the bank's own difficulty proportions), arranged so the same difficulty never appears more than twice in a row.
- **Topic spread**: within each difficulty tier, questions are drawn round-robin across all 31 topic areas before repeating a topic, so the test isn't dominated by one or two subjects.

If a question has more than one correct answer, checkboxes are shown instead of radio buttons, and a small warning line appears above the options. Scoring requires every correct option to be selected and no incorrect one, for full credit on that question.

## Deploying it for free

### Option A — Netlify (drag and drop)
1. Go to [app.netlify.com/drop](https://app.netlify.com/drop).
2. Drag this whole folder onto the page.
3. Netlify gives you a live URL immediately (e.g. `random-name.netlify.app`). You can rename it for free in Site settings.

### Option B — GitHub Pages
1. Create a new GitHub repository and upload all the files in this folder to it (keep the folder structure).
2. Go to **Settings → Pages**, set the source to your main branch, root folder.
3. GitHub gives you a URL like `https://yourusername.github.io/your-repo-name/`.

Either way, share the link with candidates — no installation needed on their end, just a browser.

## The admin dashboard

Go to `admin.html` (there's also a link at the bottom of the landing page) and log in with:

```
Password: CAPT.PHOTOS
```

From there you can see every attempt taken **on that device/browser**, with HKID, name, rank, score, pass/fail, time taken, and whether it auto-submitted — and export it all as a CSV with one click.

### Important limitation to be aware of

GitHub Pages and Netlify's free tier are **static hosting only** — there's no database or server behind them. This means:

- Every candidate's attempt is saved in their own browser's local storage, and the admin dashboard only shows attempts taken **on the same browser/device** it's opened on.
- This works well if candidates all take the test on a shared kiosk/office computer that the admin also uses. It will **not** automatically collect attempts taken on different phones/laptops into one central list.

**If you need all attempts centralized across every candidate's own device**, the simplest free fix is a small Google Sheets webhook:

1. Create a Google Sheet, open **Extensions → Apps Script**, and paste in a short script that accepts POST requests and appends a row (there are many free copy-paste templates for "Google Apps Script form to sheet webhook" if you search for one).
2. Deploy it as a Web App and copy the URL it gives you.
3. Paste that URL into `js/app.js` at the top, in `CONFIG.REMOTE_WEBHOOK_URL`.
4. Every attempt will then also be sent there automatically, in addition to being saved locally — giving you one shared, exportable sheet across every device.

This step is optional and the test works fully without it; it only affects how attempts are centralized for admin review.

## A note on the admin password

The password check happens in the browser (in `js/admin.js`), which is normal for a simple static site but means anyone who views the page's source code could find it. This is fine for keeping casual/candidate access out of the admin area, but don't rely on it to protect sensitive data — don't put anything you wouldn't want a technically curious person to see behind it.

## Customizing

- **Change the pass mark, time limit, or question count**: edit the `CONFIG` object at the top of `js/app.js`.
- **Change the difficulty mix**: edit `CONFIG.DIFFICULTY_TARGET` (must sum to `TOTAL_QUESTIONS`).
- **Add or edit questions**: edit `js/questions.js` directly — it's a plain JSON array, each entry with `topic`, `question`, `options` (A–D), `correct` (array of letters), and `difficulty`.
- **Rank options**: edit `CONFIG.RANK_OPTIONS` in `js/app.js`.
- **Colors/fonts**: all in `css/style.css` under the `:root` variables at the top.
