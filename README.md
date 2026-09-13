# Husky Courses

An independent course browser for Northeastern University’s Boston campus, Fall 2026 Semester.

## Features

- Search all 4,259 sections by course, instructor, classroom, or CRN.
- Filter by subject, level, class type, meeting day, and start time.
- Personal weekly calendar, overlap warnings, and .ics export.
- Compressed data download and progressive table rendering.

## Data

Official Northeastern Banner snapshot checked September 10, 2026. This is not a live registration feed. Separate quarter terms and other campuses are excluded. Seat counts and assignments may change. Calendar exports do not exclude university holidays or cancellations.

This project is not affiliated with Northeastern University.

## Run locally

Serve this directory with any static HTTP server, for example `python3 -m http.server 8080`, then open http://localhost:8080. No package installation or build is required.

## GitHub Pages

Published from the root of the `main` branch. All asset paths are relative, so the site also works under a repository subpath.

## Update the compressed data

After updating `courses.json`, run `python3 compress-courses.py` and commit the JSON, generated binary, and updated `app.js` together.
