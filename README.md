# Husky Courses

An independent course browser for Northeastern University’s Boston campus, with Fall 2026 and Spring 2027 Semester snapshots.

## Browse

- [Fall 2026](https://luvata.github.io/husky-course-browser/?term=202710)
- [Spring 2027](https://luvata.github.io/husky-course-browser/?term=202730)

Choose a semester at the top of the page. Search by course, instructor, classroom, or CRN; filter by subject, level, class type, day, and start time. Build a weekly calendar with overlap warnings and `.ics` export. Calendar selections are stored separately for each semester on this device. Existing Fall 2026 selections are preserved.

## Data

The checked date, section count, and comparison with the previous snapshot appear under **Data verification & coverage** for each semester. Data comes from Northeastern’s public Banner search, covering every subject option with the campus restricted to Boston. Separate quarter terms, other campuses, and final-exam rows are excluded.

This is a snapshot, not a live registration feed. Seats and assignments may change. Calendar exports do not exclude university holidays or cancellations. Adding a class does not register you. This project is not affiliated with Northeastern University.

## Run locally

Serve this directory with any static HTTP server, for example `python3 -m http.server 8080`, then open http://localhost:8080. No package installation or build is required to serve the site. GitHub Pages publishes the root of `main`; all asset paths support a repository subpath.

## Refresh both semesters

Requires Python 3.9+, `curl`, and the parser dependency:

```sh
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python refresh-courses.py
.venv/bin/python compress-courses.py
```

The refresh script queries every subject in batches of ten, validates each response, and only writes the requested snapshots after every batch succeeds. It checks term/campus, unique CRNs, meeting columns, dates, and seat fields. `courses.json` remains the Fall 2026 source; `courses-202730.json` contains Spring 2027. The compression script regenerates content-addressed downloads and `terms.json`. Commit both JSON snapshots, `terms.json`, and the new compressed files together, including removal of old compressed files.

To refresh only one semester, pass `--terms 202730` or `--terms 202710`. Raw responses go in ignored `.banner-cache/`; normal runs fetch fresh pages. `--reuse-cache` is for debugging the parser and retains the original source fetch date.

## Checks

```sh
.venv/bin/python -m unittest discover -s tests -v
node --check app.js
npm install
npm test
```

Node dependencies are used only for tests. The app tests cover saved-calendar isolation, legacy Fall selections, Spring deep links, search, calendar dates, ICS output, compressed-download fallback, failed loads, and switching semesters while a previous request is still pending.
