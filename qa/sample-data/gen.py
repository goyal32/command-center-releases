#!/usr/bin/env python3
"""Synthetic Command Center test data (no real students). Today = 2026-09-25 (Fri)."""
import csv, datetime as dt, random, sys, os
random.seed(7)
TODAY = dt.date(2026, 9, 25)
def us(d): return f"{d.month}/{d.day}/{d.year}"
def usdt(d, h=10, m=15): return f"{d.month}/{d.day}/{d.year} {h}:{m:02d} AM"
def days(n): return TODAY - dt.timedelta(days=n)

# counselor (school) / advisor codes. Chiawana counselors: MG TH; Pasco HS: JQ AZ
ADV = ['GH', 'STA', 'KL']          # advisor tokens (2-3 letters)
ADV_ALE = {'GH': 'GARCIA, HELEN', 'STA': 'STAHL, MARK', 'KL': 'KIM, LENA'}
TEACHERS = ['Bastin Hernandez', 'Ortiz', 'Nguyen']
# name, uid, sid, counselor, advisor, grade, scenario
S = [
 ('Alvarez, Diego',        'dalvarez',  '412001', 'MG', 'GH',  '11', 'on_pace'),
 ('Baker, Priya',          'pbaker',    '412002', 'MG', 'GH',  '10', 'slightly_behind'),
 ('Chen, Marcus',          'mchen',     '412003', 'TH', 'GH',  '11', 'severely_behind'),
 ('Dawson, Kayla',         'kdawson',   '412004', 'TH', 'STA', '12', 'expired'),
 ('Espinoza, Luis',        'lespinoza', '412005', 'JQ', 'STA', '10', 'no_activity'),
 ('Foster, Emma',          'efoster',   '412006', 'JQ', 'STA', '9',  'new_student'),
 ('Gutierrez, Sofia',      'sgutierrez','412007', 'MG', 'KL',  '12', 'senior'),
 ('Hale, Jordan',          'jhale',     '412008', 'AZ', 'KL',  '11', 'missing_contact'),
 ('Ibarra, Mateo',         'mibarra',   '412009', 'AZ', 'KL',  '10', 'archived'),
 ('Johnson, Aaliyah',      'ajohnson',  '412010', 'TH', 'GH',  '11', 'no_email'),
 ('Kowalski, Ben',         'bkowalski', '412011', 'JQ', 'STA', '12', 'two_teachers'),
 ('Lopez, Isabella',       'ilopez',    '412012', 'MG', 'KL',  '9',  'ahead'),
]
COURSES = {
 'on_pace':        [('Algebra 1 A', 22.0, 1.5, 88, 'Bastin Hernandez'), ('English 10 A', 20.5, 0.4, 91, 'Ortiz')],
 'slightly_behind':[('Geometry A', 12.0, -7.2, 76, 'Ortiz'), ('Biology A', 15.5, -6.1, 74, 'Nguyen'), ('World History A', 19.0, -2.0, 82, 'Ortiz')],
 'severely_behind':[('Algebra 2 A', 3.0, -35.4, 52, 'Bastin Hernandez'), ('Chemistry A', 5.5, -31.0, 58, 'Nguyen')],
 'expired':        [('US History B', 81.0, -19.0, 71, 'Ortiz'), ('Precalculus A', 18.0, -3.5, 85, 'Bastin Hernandez')],
 'no_activity':    [('English 9 A', 4.0, -16.3, 65, 'Ortiz'), ('Physical Science A', 6.0, -14.0, 70, 'Nguyen')],
 'new_student':    [('Algebra 1 A', 0.0, 0.0, 0, 'Bastin Hernandez'), ('Health', 0.0, 0.0, 0, 'Nguyen')],
 'senior':         [('Economics', 98.5, 12.0, 93, 'Ortiz'), ('Government', 24.0, 2.5, 90, 'Ortiz')],
 'missing_contact':[('Spanish 1 A', 21.0, 0.8, 84, 'Nguyen'), ('Geometry A', 19.5, -1.2, 79, 'Ortiz')],
 'archived':       [('Biology A', 40.0, -8.0, 60, 'Nguyen')],
 'no_email':       [('English 11 A', 14.0, -9.5, 72, 'Ortiz'), ('Algebra 2 A', 10.0, -12.0, 69.4, 'Bastin Hernandez')],
 'two_teachers':   [('Financial Literacy', 30.0, 5.5, 95, 'two teachers'), ('Physics A', 16.0, -4.9, 77, 'Nguyen')],
 'ahead':          [('English 9 A', 35.0, 14.2, 96, 'Ortiz'), ('Earth Science A', 31.0, 9.9, 92, 'Nguyen')],
}
START = dt.date(2026, 8, 26); TARGET = dt.date(2027, 1, 22)
def last_entry(scn):
    return {'on_pace': days(1), 'slightly_behind': days(2), 'severely_behind': days(15), 'expired': days(3),
            'no_activity': days(28), 'new_student': None, 'senior': days(1), 'missing_contact': days(1),
            'archived': days(40), 'no_email': days(4), 'two_teachers': days(1), 'ahead': days(0)}[scn]
def att_row(scn):  # attendance course: (progress, grade, last entry, assignment status)
    return {'on_pace': (100, 100, days(2), ''), 'slightly_behind': (40, 100, days(1), ''), 'severely_behind': (20, 100, days(15), ''),
            'expired': (35, 100, days(3), 'Pending Grading'), 'no_activity': (10, 100, days(28), ''), 'new_student': (0, 0, None, ''),
            'senior': (45, 100, days(1), ''), 'missing_contact': (30, 100, days(9), ''), 'archived': None,
            'no_email': (25, 100, days(4), ''), 'two_teachers': (100, 100, days(1), ''), 'ahead': (50, 100, days(0), '')}[scn]
HDR = ['Name','User ID','External ID','Student Grade Level','Course Name','Teacher','Progress','Target Progress','Actual Grade','Overall Grade','Relative Grade','Pacing','Complete','Start Date','Target Date','Last Gradebook Entry','Active Time','Enrollment Status','Assignment Status']
def edg_rows(shift_days=0, pacing_shift=0.0):
    rows = []
    for name, uid, sid, cns, adv, grade, scn in S:
        ext = f"{cns} {adv} {sid}"
        start = dt.date(2026, 9, 21) if scn == 'new_student' else START
        status = 'Archived' if scn == 'archived' else 'Active'
        le = last_entry(scn)
        for i, (cname, prog, pac, gr, teacher) in enumerate(COURSES[scn]):
            tgt = dt.date(2026, 9, 15) if (scn == 'expired' and i == 0) else TARGET
            p = max(0.0, prog - shift_days * 0.6); pc = pac + pacing_shift
            act = f"{random.randint(0,40)}:{random.randint(0,59):02d}:{random.randint(0,59):02d}" if p > 0 else '0:00:00'
            rows.append({'Name': name, 'User ID': uid, 'External ID': ext, 'Student Grade Level': grade,
                'Course Name': f"IC 26-27 {cname}", 'Teacher': teacher, 'Progress': f"{p:.1f}", 'Target Progress': f"{max(0.0, p - pc):.1f}",
                'Actual Grade': f"{gr:.1f}", 'Overall Grade': f"{gr:.1f}", 'Relative Grade': f"{gr:.1f}", 'Pacing': f"{pc:.1f}",
                'Complete': 'Yes' if p >= 100 else 'No', 'Start Date': us(start), 'Target Date': us(tgt),
                'Last Gradebook Entry': usdt(le - dt.timedelta(days=shift_days)) if le else '', 'Active Time': act,
                'Enrollment Status': status, 'Assignment Status': ''})
        a = att_row(scn)
        if a:
            ap, ag, al, asgn = a
            rows.append({'Name': name, 'User ID': uid, 'External ID': ext, 'Student Grade Level': grade,
                'Course Name': 'IC 26-27 Attendance Course', 'Teacher': 'Goyal', 'Progress': f"{ap:.1f}", 'Target Progress': f"{ap:.1f}",
                'Actual Grade': f"{ag:.1f}", 'Overall Grade': f"{ag:.1f}", 'Relative Grade': f"{ag:.1f}", 'Pacing': '0.0',
                'Complete': 'No', 'Start Date': us(start), 'Target Date': us(dt.date(2027, 6, 10)),
                'Last Gradebook Entry': usdt(al) if al else '', 'Active Time': '0:12:00' if ap else '0:00:00',
                'Enrollment Status': status, 'Assignment Status': asgn})
    return rows
def write(fn, hdr, rows):
    with open(fn, 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=hdr); w.writeheader(); [w.writerow(r) for r in rows]
    print(fn, len(rows))
write('EdgenuityEnrollments_09_25_2026.csv', HDR, edg_rows())
write('EdgenuityEnrollments_09_18_2026.csv', HDR, edg_rows(shift_days=7, pacing_shift=+3.0))
write('EdgenuityEnrollments_09_11_2026.csv', HDR, edg_rows(shift_days=14, pacing_shift=+6.0))
# a NEWER file where everyone slipped (for testing the Weekly Snapshot compare)
write('EdgenuityEnrollments_09_26_2026.csv', HDR, edg_rows(shift_days=0, pacing_shift=-12.0))
write('EdgenuityEnrollments_09_27_2026.csv', HDR, edg_rows(shift_days=0, pacing_shift=-24.0))

# ALE Student Enrollment
AHDR = ['student_number','student_name','school','grade_level','student_email','guardian_email','counselor','learning_plan_status','advisor','learning_plan_start_date','learning_plan_end_date','dropped_date']
arows = []
for name, uid, sid, cns, adv, grade, scn in S:
    school = 'Chiawana High School' if cns in ('MG','TH') else 'Pasco High School'
    arows.append({'student_number': sid, 'student_name': name, 'school': school, 'grade_level': grade,
        'student_email': '' if scn == 'no_email' else f"{uid}@students.example.org",
        'guardian_email': '' if scn in ('no_email',) else f"parent.{uid}@example.org",
        'counselor': f"{cns.lower()}@example.org", 'learning_plan_status': 'Closed' if scn == 'archived' else 'Active',
        'advisor': ADV_ALE[adv], 'learning_plan_start_date': us(dt.date(2026, 9, 21) if scn == 'new_student' else dt.date(2026, 8, 24)),
        'learning_plan_end_date': us(dt.date(2027, 6, 10)), 'dropped_date': us(dt.date(2026, 9, 10)) if scn == 'archived' else ''})
write('ALE_Student_Enrollment.csv', AHDR, arows)

# ALE Contact Log — weekly student-type contacts except the scenarios that miss
LHDR = ['student_number','student_name','contact_date','created_by','type','notes']
lrows = []
def add(sid, name, d, typ, who='GARCIA, HELEN', note='Weekly check-in'):
    lrows.append({'student_number': sid, 'student_name': name, 'contact_date': d.isoformat() + ' 10:30:00', 'created_by': who, 'type': typ, 'notes': f"<p>{note}</p>"})
for name, uid, sid, cns, adv, grade, scn in S:
    who = ADV_ALE[adv]
    if scn in ('on_pace','slightly_behind','senior','two_teachers','ahead','no_email'):
        for wk in range(0, 5): add(sid, name, days(2 + 7*wk), random.choice(['Email','Phone','Teams']), who)
    elif scn == 'severely_behind':
        add(sid, name, days(23), 'Phone', who, 'Called; no answer'); add(sid, name, days(30), 'Email', who)
        add(sid, name, days(5), 'Teacher Initiated', who, 'Emailed student about pacing')  # non-student type: must NOT count
    elif scn == 'expired':
        for wk in range(0, 5): add(sid, name, days(3 + 7*wk), 'Zoom', who)
    elif scn == 'no_activity':
        add(sid, name, days(27), 'Email', who); add(sid, name, days(6), 'Parent', who, 'Spoke with mom')  # parent contact only
    elif scn == 'missing_contact':
        add(sid, name, days(13), 'Email', who); add(sid, name, days(20), 'Phone', who); add(sid, name, days(27), 'Email', who)
    elif scn == 'new_student':
        pass
    elif scn == 'archived':
        add(sid, name, days(40), 'Email', who)
write('ALE_Contact_Log.csv', LHDR, lrows)
# Excel-resaved variant: same log with US-format dates (what Excel writes when a teacher opens and saves the CSV)
write('ALE_Contact_Log_excel_dates.csv', LHDR, [dict(r, contact_date=us(dt.date.fromisoformat(r['contact_date'][:10]))) for r in lrows])

# Edgenuity Students report (emails + birthdays)
SHDR = ['Name','User Name','External ID','Email','Parent/Guardian','Parent/Guardian Email','Date of Birth','Grade','Home School','Last Login','Active Courses']
srows = []
for name, uid, sid, cns, adv, grade, scn in S:
    dob = dt.date(2008, 9, 25) if scn == 'senior' else dt.date(2009 + (12 - int(grade)), random.randint(1,12), random.randint(1,28))
    srows.append({'Name': name, 'User Name': uid, 'External ID': f"{cns} {adv} {sid}", 'Email': f"{uid}@students.example.org",
        'Parent/Guardian': 'Guardian ' + name.split(',')[0], 'Parent/Guardian Email': f"parent.{uid}@example.org", 'Date of Birth': us(dob),
        'Grade': grade, 'Home School': 'Chiawana High School' if cns in ('MG','TH') else 'Pasco High School', 'Last Login': us(days(2)), 'Active Courses': str(len(COURSES[scn]))})
write('Students_09_25_2026.csv', SHDR, srows)
