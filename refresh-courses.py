"""Refresh Boston semester snapshots from Northeastern's public Banner search.

Install requirements.txt, then run this script and compress-courses.py.
All requested terms are fetched and validated before replacing any snapshots.
"""
import argparse
import json
import re
import subprocess
import time
from datetime import datetime, timedelta
from pathlib import Path
from urllib.parse import urlencode
from zoneinfo import ZoneInfo

from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parent
BASE = 'https://bnrordsp.neu.edu/ssb-prod/'
TERMS = {'202710': ('Fall 2026', 'courses.json'),
         '202730': ('Spring 2027', 'courses-202730.json')}


def text(node):
    return ' '.join(node.get_text(' ', strip=True).split())


def download(url, cache, params=None, reuse=False):
    if reuse and cache.exists():
        return cache.read_text()
    command = ['curl', '--fail', '--silent', '--show-error', '--location',
               '--max-time', '120', '--retry', '3', url]
    if params is not None:
        command += ['--data-binary', '@-']
    result = subprocess.run(command, input=urlencode(params) if params else None,
                            capture_output=True, text=True, check=True)
    if '</html>' not in result.stdout.lower():
        raise ValueError(f'Incomplete Banner response: {url}')
    cache.parent.mkdir(parents=True, exist_ok=True)
    cache.write_text(result.stdout)
    time.sleep(0.3)
    return result.stdout


def search_form(html, term):
    soup = BeautifulSoup(html, 'html.parser')
    form = soup.find('form', action='NEUCLSS.p_class_search')
    if not form or form.find('input', attrs={'name': 'STU_TERM_IN'})['value'] != term:
        raise ValueError(f'Missing search form for {term}')
    subjects = {o['value']: text(o) for o in form.select('select[name=sel_subj] option')
                if o['value'] != '%'}
    if not subjects or not form.select('select[name=sel_camp] option[value=BOS]'):
        raise ValueError('Missing subjects or Boston campus')
    params = []
    for element in form.find_all(['input', 'select']):
        name = element.get('name')
        if not name:
            continue
        if element.name == 'select':
            options = element.select('option[selected]') or element.select('option')[:1]
            values = ['BOS'] if name == 'sel_camp' else [o['value'] for o in options]
            if name != 'sel_subj':
                params.extend((name, value) for value in values)
        elif element.get('type') not in ('checkbox', 'radio', 'submit', 'reset'):
            params.append((name, element.get('value', '')))
    return subjects, params


def label_value(detail, label):
    span = next((s for s in detail.select('span.fieldlabeltext') if text(s) == label), None)
    if span is None:
        return ''
    parts = []
    for node in span.next_siblings:
        if getattr(node, 'name', None) == 'br':
            break
        parts.append(node.get_text(' ', strip=True) if hasattr(node, 'get_text') else str(node))
    return ' '.join(' '.join(parts).split())


def parse_sections(html, term, label, subjects):
    soup = BeautifulSoup(html, 'html.parser')
    if label + ' Semester' not in soup.get_text():
        raise ValueError('Response has the wrong semester')
    titles = soup.select('th.ddtitle')
    if not titles and 'No classes were found' not in soup.get_text():
        raise ValueError('Response is neither a section listing nor an explicit empty result')
    courses, excluded_exams = [], 0
    for title in titles:
        match = re.fullmatch(r'(.+) - (\d+) - (\w+) (\w+) - (.+?)- \((.+)\) - Credits (.+)', text(title))
        if not match:
            raise ValueError(f'Unrecognized course heading: {text(title)}')
        name, crn, subject, number, section, campus, credits = match.groups()
        if campus != 'Boston' or subject not in subjects:
            raise ValueError(f'Out-of-scope section {crn}: {campus}/{subject}')
        detail = title.find_parent('tr').find_next_sibling('tr')
        if label_value(detail, 'Associated Term:') != label + ' Semester':
            raise ValueError(f'Wrong associated term for {crn}')
        instructor = re.sub(r'\s*\(\s*P\s*\)', '', label_value(detail, 'Instructors:')).strip()
        table = next((t for t in detail.find_all('table')
                      if t.caption and text(t.caption) == 'Scheduled Meeting Times'), None)
        if table is None:
            raise ValueError(f'Missing meeting table for {crn}')
        headers = [text(th) for th in table.select('tr')[0].find_all('th')]
        required = {'Type', 'Time', 'Days', 'Where', 'Date Range', 'Capacity', 'Actual', 'WL Act', 'Seats'}
        if not required.issubset(headers):
            raise ValueError(f'Unexpected meeting columns: {headers}')
        meetings = []
        for row in table.select('tr')[1:]:
            cells = [text(td) for td in row.find_all('td', recursive=False)]
            if len(cells) != len(headers):
                raise ValueError(f'Malformed meeting row for {crn}')
            values = dict(zip(headers, cells))
            if values['Type'] == 'Final Exam':
                excluded_exams += 1
                continue
            start = end = ''
            if values['Time'] not in ('TBA', ''):
                start, end = [datetime.strptime(t.strip(), '%I:%M %p').strftime('%H:%M')
                              for t in values['Time'].split(' - ')]
            date_start = date_end = ''
            if values['Date Range'] not in ('TBA', ''):
                date_start, date_end = [datetime.strptime(d.strip(), '%b %d, %Y').date().isoformat()
                                        for d in values['Date Range'].split(' - ')]
                if date_start > date_end:
                    raise ValueError(f'Reversed dates for {crn}')
            for key in ('Capacity', 'Actual', 'WL Act', 'Seats'):
                if values[key] and not re.fullmatch(r'-?\d+', values[key]):
                    raise ValueError(f'Unexpected {key} for {crn}: {values[key]}')
            meetings.append(dict(time=values['Time'], days=values['Days'], room=values['Where'],
                                 dates=values['Date Range'], instructor=instructor, start=start, end=end,
                                 dateStart=date_start, dateEnd=date_end,
                                 capacity=values['Capacity'] or None, actual=values['Actual'] or None,
                                 waitlist=values['WL Act'] or None, seats=values['Seats'] or None))
        if not meetings:
            raise ValueError(f'No regular meeting records for {crn}')
        courses.append(dict(title=name, crn=crn, subject=subject, number=number, section=section.strip(),
                            campus=campus, credits=credits, level=label_value(detail, 'Levels:'),
                            type=label_value(detail, 'Schedule Type:'), meetings=meetings,
                            url=BASE + f'bwckschd.p_disp_detail_sched?term_in={term}&crn_in={crn}'))
    return courses, excluded_exams


def refresh(term, cache, reuse=False):
    label, filename = TERMS[term]
    source = BASE + f'NEUCLSS.p_class_select?STU_TERM_IN={term}'
    subjects, params = search_form(download(source, cache / f'{term}-form.html', reuse=reuse), term)
    courses, audit, exams = [], [], 0
    codes = list(subjects)
    for offset in range(0, len(codes), 10):
        batch = codes[offset:offset + 10]
        html = download(BASE + 'NEUCLSS.p_class_search', cache / f'{term}-{offset}.html',
                        params + [('sel_subj', s) for s in batch], reuse)
        sections, excluded = parse_sections(html, term, label, batch)
        courses.extend(sections)
        exams += excluded
        audit.append(dict(subjects=batch, sections=len(sections), complete=True))
        print(f'{label}: {offset + len(batch)}/{len(codes)} subjects, {len(courses)} sections', flush=True)
    if not courses or len({c['crn'] for c in courses}) != len(courses):
        raise ValueError(f'Empty or duplicate sections for {term}')
    old = json.loads((ROOT / filename).read_text()) if (ROOT / filename).exists() else {'courses': []}
    before = {c['crn']: c for c in old['courses']}
    after = {c['crn']: c for c in courses}
    added, removed = sorted(after.keys() - before.keys()), sorted(before.keys() - after.keys())
    changed = sorted(k for k in before.keys() & after.keys() if before[k] != after[k])
    # Use source fetch times, including when replaying cached pages for parser debugging.
    source_files = [cache / f'{term}-form.html'] + [cache / f'{term}-{i}.html' for i in range(0, len(codes), 10)]
    now = datetime.fromtimestamp(min(p.stat().st_mtime for p in source_files), ZoneInfo('America/New_York'))
    dates = [m['dateStart'] for c in courses for m in c['meetings'] if m['dateStart']]
    # Start the calendar in the week containing the most common first meeting date.
    first = datetime.fromisoformat(max(set(dates), key=dates.count)).date()
    week = first - timedelta(days=first.weekday())
    return filename, dict(retrieved=now.strftime('%B %d, %Y'), checkedAt=now.strftime('%B %d, %Y at %I:%M %p ET'),
        term=term, termLabel=label, calendarStart=week.isoformat(), source=source, subjects=subjects,
        audit=audit, courses=courses, verification=dict(
            summary=f'Fetched all {len(courses):,} Boston sections across all {len(subjects)} subject options from the official Banner search.',
            detailSummary=f'Validated unique CRNs, term, campus, meeting columns, dates and seat fields. Compared with the previous snapshot: {len(changed):,} changed, {len(added):,} added, {len(removed):,} removed. {exams:,} final-exam rows excluded from the regular meeting calendar.',
            changedCrns=changed, addedCrns=added, removedCrns=removed))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--terms', nargs='+', choices=TERMS, default=list(TERMS))
    parser.add_argument('--cache-dir', type=Path, default=ROOT / '.banner-cache')
    parser.add_argument('--reuse-cache', action='store_true', help='For parser debugging only; does not refresh cached source pages.')
    args = parser.parse_args()
    snapshots = [refresh(term, args.cache_dir, args.reuse_cache) for term in args.terms]
    for filename, snapshot in snapshots:
        temporary = ROOT / (filename + '.tmp')
        temporary.write_text(json.dumps(snapshot, ensure_ascii=False, separators=(',', ':')) + '\n')
        temporary.replace(ROOT / filename)
        print(f'Wrote {filename}: {len(snapshot["courses"]):,} sections')
