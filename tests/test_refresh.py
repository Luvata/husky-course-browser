import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('refresh', Path(__file__).parents[1] / 'refresh-courses.py')
refresh = importlib.util.module_from_spec(spec)
spec.loader.exec_module(refresh)

HTML = '''<html>Spring 2027 Semester<table><tr><th class="ddtitle">Design - Research - 31234 - EECE 7398 - 01- (Boston) - Credits 4</th></tr>
<tr><td><span class="fieldlabeltext">Associated Term: </span>Spring 2027 Semester<br>
<span class="fieldlabeltext">Levels: </span>Graduate, Undergraduate<br>
<span class="fieldlabeltext">Instructors: </span>Example Instructor (<abbr>P</abbr>)<br>
<span class="fieldlabeltext">Schedule Type: </span>Lecture<br>
<table><caption>Scheduled Meeting Times</caption><tr><th>Type</th><th>Time</th><th>Days</th><th>Where</th><th>Date Range</th><th>Capacity</th><th>Actual</th><th>WL Act</th><th>Seats</th><th>Room Size</th></tr>
<tr><td>Class</td><td>1:35 pm - 3:15 pm</td><td>MW</td><td>Example Hall 100</td><td>Jan 11, 2027 - Apr 28, 2027</td><td>40</td><td>41</td><td>2</td><td>-1</td><td>42</td></tr>
<tr><td>Final Exam</td><td>8:00 am - 10:00 am</td><td>R</td><td>Example Hall 100</td><td>Apr 29, 2027 - Apr 29, 2027</td><td></td><td></td><td></td><td></td><td></td></tr>
</table></td></tr></table></html>'''


class ParseTests(unittest.TestCase):
    def parse(self, html=HTML):
        return refresh.parse_sections(html, '202730', 'Spring 2027', ['EECE'])

    def test_regular_meetings_and_seats(self):
        courses, exams = self.parse()
        self.assertEqual(exams, 1)
        self.assertEqual(len(courses[0]['meetings']), 1)
        self.assertEqual(courses[0]['title'], 'Design - Research')
        self.assertEqual(courses[0]['level'], 'Graduate, Undergraduate')
        self.assertIn('term_in=202730', courses[0]['url'])
        meeting = courses[0]['meetings'][0]
        self.assertEqual((meeting['start'], meeting['end']), ('13:35', '15:15'))
        self.assertEqual(meeting['dateStart'], '2027-01-11')
        self.assertEqual(meeting['instructor'], 'Example Instructor')
        self.assertEqual(meeting['seats'], '-1')

    def test_tba_and_missing_seats(self):
        courses, _ = self.parse(HTML.replace('1:35 pm - 3:15 pm', 'TBA').replace('<td>-1</td>', '<td>&nbsp;</td>'))
        self.assertEqual(courses[0]['meetings'][0]['start'], '')
        self.assertIsNone(courses[0]['meetings'][0]['seats'])

    def test_reject_wrong_term_campus_or_columns(self):
        for html in [HTML.replace('Spring 2027', 'Fall 2026'), HTML.replace('(Boston)', '(Seattle)'),
                     HTML.replace('<th>Seats</th>', '<th>Other</th>'),
                     HTML.replace('<td>40</td>', '<td>invalid</td>')]:
            with self.subTest(html=html[:30]), self.assertRaises(ValueError):
                self.parse(html)

    def test_only_accept_explicit_empty_result(self):
        self.assertEqual(self.parse('<html>Spring 2027 Semester. No classes were found</html>'), ([], 0))
        with self.assertRaises(ValueError):
            self.parse('<html>Spring 2027 Semester. Temporarily unavailable</html>')


if __name__ == '__main__':
    unittest.main()
