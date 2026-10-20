const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const SIGNATURES_DIR = path.resolve(process.env.SIGNATURE_DIR || path.join(__dirname, '..', 'signatures'));

// Ensure signatures folder exists
if (!fs.existsSync(SIGNATURES_DIR)) {
  fs.mkdirSync(SIGNATURES_DIR, { recursive: true });
}

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static signatures and public assets
app.use('/signatures', express.static(SIGNATURES_DIR));
app.use(express.static(path.join(__dirname, '..', 'public')));

// Helper: generate STU-yymmdd-hhmmss student number matching Access VBA MakeStudentNumber()
function makeStudentNumber() {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const nn = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return `STU-${yy}${mm}${dd}-${hh}${nn}${ss}`;
}

// Helper: save Base64 PNG to file
function saveBase64Signature(base64Data, prefix = 'sig') {
  if (!base64Data || !base64Data.startsWith('data:image')) {
    return null;
  }
  const matches = base64Data.match(/^data:image\/([A-Za-z-+\/]+);base64,(.+)$/);
  if (!matches || matches.length !== 3) {
    return null;
  }
  const buffer = Buffer.from(matches[2], 'base64');
  const fileName = `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1000)}.png`;
  const filePath = path.join(SIGNATURES_DIR, fileName);
  fs.writeFileSync(filePath, buffer);
  return `signatures/${fileName}`;
}

// ================= API ROUTES =================

// 1. Health check & DB status
app.get('/api/health', async (req, res) => {
  try {
    const result = await db.query('SELECT NOW() AS server_time, version()');
    res.json({
      status: 'UP',
      database: 'Connected',
      serverTime: result.rows[0].server_time,
      postgresVersion: result.rows[0].version.split(' ')[1] || '16',
    });
  } catch (err) {
    res.status(500).json({ status: 'ERROR', database: 'Disconnected', error: err.message });
  }
});

// 2. Dashboard Statistics
app.get('/api/stats', async (req, res) => {
  try {
    const [currentlyPresent, visitsToday, activeLoans, itemsStats, studentsTotal] = await Promise.all([
      db.query('SELECT COUNT(*) AS count FROM Visits WHERE CheckOutTime IS NULL'),
      db.query('SELECT COUNT(*) AS count FROM Visits WHERE DATE(CheckInTime) = CURRENT_DATE'),
      db.query('SELECT COUNT(*) AS count FROM Loans WHERE DateReturned IS NULL'),
      db.query(`
        SELECT 
          COUNT(*) AS total_items,
          COUNT(*) FILTER (WHERE l.LoanID IS NULL AND i.IsActive = TRUE) AS available_items,
          COUNT(*) FILTER (WHERE l.LoanID IS NOT NULL) AS issued_items
        FROM Items i
        LEFT JOIN Loans l ON i.ItemID = l.ItemID AND l.DateReturned IS NULL
        WHERE i.IsActive = TRUE
      `),
      db.query('SELECT COUNT(*) AS count FROM Students WHERE IsActive = TRUE'),
    ]);

    res.json({
      currentlyPresent: parseInt(currentlyPresent.rows[0].count, 10),
      visitsToday: parseInt(visitsToday.rows[0].count, 10),
      activeLoans: parseInt(activeLoans.rows[0].count, 10),
      availableItems: parseInt(itemsStats.rows[0].available_items, 10),
      issuedItems: parseInt(itemsStats.rows[0].issued_items, 10),
      totalItems: parseInt(itemsStats.rows[0].total_items, 10),
      totalStudents: parseInt(studentsTotal.rows[0].count, 10),
    });
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 3. Staff Users
app.get('/api/staff', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM StaffUsers WHERE IsActive = TRUE ORDER BY StaffName ASC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/staff', async (req, res) => {
  const { staffName } = req.body;
  if (!staffName || !staffName.trim()) {
    return res.status(400).json({ error: 'Staff name is required.' });
  }
  try {
    const result = await db.query(
      'INSERT INTO StaffUsers (StaffName, IsActive) VALUES ($1, TRUE) RETURNING *',
      [staffName.trim()]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Schools
app.get('/api/schools', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT s.*, COUNT(st.StudentID) as student_count
      FROM Schools s
      LEFT JOIN Students st ON s.SchoolID = st.SchoolID
      GROUP BY s.SchoolID
      ORDER BY s.SchoolName ASC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/schools', async (req, res) => {
  const { schoolName, schoolCode } = req.body;
  if (!schoolName || !schoolName.trim()) {
    return res.status(400).json({ error: 'School name is required.' });
  }
  try {
    const result = await db.query(
      'INSERT INTO Schools (SchoolName, SchoolCode, IsActive) VALUES ($1, $2, TRUE) RETURNING *',
      [schoolName.trim(), schoolCode ? schoolCode.trim() : null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Students
app.get('/api/students', async (req, res) => {
  const { search, schoolId } = req.query;
  try {
    let sql = `
      SELECT 
        s.*,
        sch.SchoolName,
        sch.SchoolCode,
        (SELECT COUNT(*) > 0 FROM Visits v WHERE v.StudentID = s.StudentID AND v.CheckOutTime IS NULL) AS has_open_visit,
        (SELECT v.VisitID FROM Visits v WHERE v.StudentID = s.StudentID AND v.CheckOutTime IS NULL LIMIT 1) AS active_visit_id,
        (SELECT COUNT(*) > 0 FROM Loans l WHERE l.StudentID = s.StudentID AND l.DateReturned IS NULL) AS has_open_loan
      FROM Students s
      JOIN Schools sch ON s.SchoolID = sch.SchoolID
      WHERE s.IsActive = TRUE
    `;
    const params = [];

    if (search && search.trim()) {
      params.push(`%${search.trim()}%`);
      sql += ` AND (s.FullName ILIKE $${params.length} OR s.StudentNumber ILIKE $${params.length})`;
    }

    if (schoolId) {
      params.push(schoolId);
      sql += ` AND s.SchoolID = $${params.length}`;
    }

    sql += ' ORDER BY s.FullName ASC';
    const result = await db.query(sql, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Single student profile with full visit and loan history
app.get('/api/students/:id', async (req, res) => {
  const studentId = parseInt(req.params.id, 10);
  try {
    const studentRes = await db.query(`
      SELECT s.*, sch.SchoolName, sch.SchoolCode
      FROM Students s
      JOIN Schools sch ON s.SchoolID = sch.SchoolID
      WHERE s.StudentID = $1
    `, [studentId]);

    if (studentRes.rows.length === 0) {
      return res.status(404).json({ error: 'Student not found.' });
    }

    const visitsRes = await db.query(`
      SELECT * FROM Visits WHERE StudentID = $1 ORDER BY CheckInTime DESC LIMIT 20
    `, [studentId]);

    const loansRes = await db.query(`
      SELECT l.*, i.AssetTag, i.ItemType, i.TitleOrModel
      FROM Loans l
      JOIN Items i ON l.ItemID = i.ItemID
      WHERE l.StudentID = $1
      ORDER BY l.DateIssued DESC LIMIT 20
    `, [studentId]);

    res.json({
      student: studentRes.rows[0],
      visits: visitsRes.rows,
      loans: loansRes.rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/students', async (req, res) => {
  const { studentNumber, fullName, schoolId, gender, schoolLevel, notes } = req.body;
  if (!fullName || !fullName.trim()) {
    return res.status(400).json({ error: 'Student full name is required.' });
  }
  if (!schoolId) {
    return res.status(400).json({ error: 'School selection is required.' });
  }

  const finalStudentNumber = (studentNumber && studentNumber.trim()) ? studentNumber.trim() : makeStudentNumber();

  try {
    const result = await db.query(`
      INSERT INTO Students (StudentNumber, FullName, SchoolID, Gender, SchoolLevel, DateRegistered, IsActive, Notes)
      VALUES ($1, $2, $3, $4, $5, NOW(), TRUE, $6)
      RETURNING *
    `, [finalStudentNumber, fullName.trim(), schoolId, gender || 'Not recorded', schoolLevel || 'Form 1', notes || null]);

    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ error: `Student Number "${finalStudentNumber}" already exists.` });
    }
    res.status(500).json({ error: err.message });
  }
});

// 6. Visits & Reception Desk
// qryCurrentlyPresent
app.get('/api/visits/currently-present', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM qryCurrentlyPresent');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// qryVisitsToday
app.get('/api/visits/today', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM qryVisitsToday');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Student Check-In
app.post('/api/visits/check-in', async (req, res) => {
  const { studentId, staffName, notes, signatureData } = req.body;
  if (!studentId) {
    return res.status(400).json({ error: 'Student ID is required.' });
  }

  try {
    // 1. Verify student exists and is active
    const studentCheck = await db.query('SELECT StudentID, FullName, IsActive FROM Students WHERE StudentID = $1', [studentId]);
    if (studentCheck.rows.length === 0 || !studentCheck.rows[0].isactive) {
      return res.status(400).json({ error: 'Student record not found or inactive.' });
    }

    // 2. Prevent double check-in: HasOpenVisit rule
    const openVisitCheck = await db.query('SELECT VisitID, CheckInTime FROM Visits WHERE StudentID = $1 AND CheckOutTime IS NULL', [studentId]);
    if (openVisitCheck.rows.length > 0) {
      return res.status(400).json({
        error: `This student is already checked in (since ${new Date(openVisitCheck.rows[0].checkintime).toLocaleTimeString()}). Check them out first.`,
        openVisitId: openVisitCheck.rows[0].visitid,
      });
    }

    // 3. Process optional signature PNG
    let signaturePath = null;
    let signatureCapturedAt = null;
    if (signatureData) {
      signaturePath = saveBase64Signature(signatureData, `sig_visit_s${studentId}`);
      if (signaturePath) {
        signatureCapturedAt = new Date();
      }
    }

    // 4. Create visit record
    const insertRes = await db.query(`
      INSERT INTO Visits (StudentID, CheckInTime, SignaturePath, SignatureCapturedAt, CheckInStaff, VisitNotes)
      VALUES ($1, NOW(), $2, $3, $4, $5)
      RETURNING *
    `, [studentId, signaturePath, signatureCapturedAt, staffName || 'Reception Staff', notes || null]);

    res.status(201).json({
      message: 'Student checked in successfully.',
      visit: insertRes.rows[0],
      studentName: studentCheck.rows[0].fullname,
    });
  } catch (err) {
    console.error('CheckIn error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Student Check-Out
app.post('/api/visits/check-out/:visitId', async (req, res) => {
  const visitId = parseInt(req.params.visitId, 10);
  const { staffName, notes } = req.body;

  try {
    // Verify open visit
    const checkRes = await db.query('SELECT * FROM Visits WHERE VisitID = $1 AND CheckOutTime IS NULL', [visitId]);
    if (checkRes.rows.length === 0) {
      return res.status(400).json({ error: 'Open visit not found or already checked out.' });
    }

    const updateRes = await db.query(`
      UPDATE Visits 
      SET 
        CheckOutTime = NOW(),
        CheckOutStaff = $1,
        VisitNotes = COALESCE($2, VisitNotes)
      WHERE VisitID = $3
      RETURNING *
    `, [staffName || 'Reception Staff', notes ? notes.trim() : null, visitId]);

    res.json({
      message: 'Student checked out successfully.',
      visit: updateRes.rows[0],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 7. Items / Assets
app.get('/api/items', async (req, res) => {
  const { type, availability } = req.query;
  try {
    let sql = 'SELECT * FROM qryItemAvailability WHERE 1=1';
    const params = [];

    if (type) {
      params.push(type);
      sql += ` AND ItemType = $${params.length}`;
    }

    if (availability) {
      params.push(availability);
      sql += ` AND AvailabilityStatus = $${params.length}`;
    }

    sql += ' ORDER BY AssetTag ASC';
    const result = await db.query(sql, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/items', async (req, res) => {
  const { assetTag, itemType, titleOrModel, serialNumber, itemCondition, notes } = req.body;
  if (!assetTag || !assetTag.trim()) {
    return res.status(400).json({ error: 'Asset tag is required.' });
  }
  if (!itemType || !itemType.trim()) {
    return res.status(400).json({ error: 'Item type is required.' });
  }
  if (!titleOrModel || !titleOrModel.trim()) {
    return res.status(400).json({ error: 'Title or model is required.' });
  }

  try {
    const result = await db.query(`
      INSERT INTO Items (AssetTag, ItemType, TitleOrModel, SerialNumber, ItemCondition, IsActive, Notes)
      VALUES ($1, $2, $3, $4, $5, TRUE, $6)
      RETURNING *
    `, [assetTag.trim().toUpperCase(), itemType.trim(), titleOrModel.trim(), serialNumber ? serialNumber.trim() : null, itemCondition || 'Good', notes || null]);

    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ error: `Asset Tag "${assetTag}" is already registered.` });
    }
    res.status(500).json({ error: err.message });
  }
});

// 8. Loans & Circulation Desk
// qryOpenLoans
app.get('/api/loans/open', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM qryOpenLoans');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Issue Item
app.post('/api/loans/issue', async (req, res) => {
  const { studentId, itemId, visitId, dueDate, conditionOut, staffName, loanNotes, signatureData } = req.body;

  if (!studentId || !itemId) {
    return res.status(400).json({ error: 'Student and Item are required.' });
  }

  try {
    // 1. Verify student
    const studentCheck = await db.query('SELECT StudentID, FullName, IsActive FROM Students WHERE StudentID = $1', [studentId]);
    if (studentCheck.rows.length === 0 || !studentCheck.rows[0].isactive) {
      return res.status(400).json({ error: 'Student record not found or inactive.' });
    }

    // 2. Verify item exists and is active
    const itemCheck = await db.query('SELECT ItemID, TitleOrModel, IsActive FROM Items WHERE ItemID = $1', [itemId]);
    if (itemCheck.rows.length === 0 || !itemCheck.rows[0].isactive) {
      return res.status(400).json({ error: 'Item not found or inactive.' });
    }

    // 3. HasOpenLoan rule: verify item is not already issued
    const loanCheck = await db.query('SELECT LoanID FROM Loans WHERE ItemID = $1 AND DateReturned IS NULL', [itemId]);
    if (loanCheck.rows.length > 0) {
      return res.status(400).json({ error: 'This item is already issued and has not been returned yet.' });
    }

    // 4. Handle optional issue signature
    let issueSigPath = null;
    if (signatureData) {
      issueSigPath = saveBase64Signature(signatureData, `sig_loan_issue_i${itemId}`);
    }

    // 5. Default due date (e.g. 7 days if not provided)
    const due = dueDate ? new Date(dueDate) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const insertRes = await db.query(`
      INSERT INTO Loans (StudentID, ItemID, VisitID, DateIssued, DueDate, ConditionOut, IssueSignaturePath, IssuedBy, LoanNotes)
      VALUES ($1, $2, $3, NOW(), $4, $5, $6, $7, $8)
      RETURNING *
    `, [studentId, itemId, visitId || null, due, conditionOut || 'Good', issueSigPath, staffName || 'Librarian', loanNotes || null]);

    res.status(201).json({
      message: 'Resource issued successfully.',
      loan: insertRes.rows[0],
      itemTitle: itemCheck.rows[0].titleormodel,
      studentName: studentCheck.rows[0].fullname,
    });
  } catch (err) {
    console.error('IssueItem error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Return Item
app.post('/api/loans/return/:loanId', async (req, res) => {
  const loanId = parseInt(req.params.loanId, 10);
  const { conditionIn, staffName, loanNotes, signatureData } = req.body;

  try {
    // 1. Check open loan
    const checkRes = await db.query('SELECT * FROM Loans WHERE LoanID = $1 AND DateReturned IS NULL', [loanId]);
    if (checkRes.rows.length === 0) {
      return res.status(400).json({ error: 'Outstanding loan not found or already returned.' });
    }

    // 2. Handle optional return signature
    let returnSigPath = null;
    if (signatureData) {
      returnSigPath = saveBase64Signature(signatureData, `sig_loan_return_l${loanId}`);
    }

    const updateRes = await db.query(`
      UPDATE Loans
      SET 
        DateReturned = NOW(),
        ConditionIn = $1,
        ReceivedBy = $2,
        ReturnSignaturePath = COALESCE($3, ReturnSignaturePath),
        LoanNotes = CASE 
          WHEN $4 IS NOT NULL THEN COALESCE(LoanNotes || ' | Return Note: ' || $4, $4)
          ELSE LoanNotes
        END
      WHERE LoanID = $5
      RETURNING *
    `, [conditionIn || 'Good', staffName || 'Librarian', returnSigPath, loanNotes || null, loanId]);

    // Also update item condition if changed
    if (conditionIn) {
      await db.query('UPDATE Items SET ItemCondition = $1 WHERE ItemID = $2', [conditionIn, checkRes.rows[0].itemid]);
    }

    res.json({
      message: 'Item return recorded successfully.',
      loan: updateRes.rows[0],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 9. Reports
app.get('/api/reports/daily-attendance', async (req, res) => {
  const date = req.query.date || null;
  try {
    const result = await db.query(`
      SELECT 
        v.VisitID,
        s.StudentNumber,
        s.FullName,
        sch.SchoolName,
        s.SchoolLevel,
        v.CheckInTime,
        v.CheckOutTime,
        v.CheckInStaff,
        v.CheckOutStaff,
        v.SignaturePath,
        CASE 
          WHEN v.CheckOutTime IS NOT NULL THEN 
            ROUND(EXTRACT(EPOCH FROM (v.CheckOutTime - v.CheckInTime)) / 60)
          ELSE 
            ROUND(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - v.CheckInTime)) / 60)
        END AS DurationMinutes
      FROM Visits v
      JOIN Students s ON v.StudentID = s.StudentID
      JOIN Schools sch ON s.SchoolID = sch.SchoolID
      WHERE DATE(v.CheckInTime) = ${date ? '$1' : 'CURRENT_DATE'}
      ORDER BY v.CheckInTime DESC
    `, date ? [date] : []);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/reports/by-school', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM qryAttendanceBySchool');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/reports/loan-history', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT 
        l.LoanID,
        s.StudentNumber,
        s.FullName,
        sch.SchoolName,
        i.AssetTag,
        i.ItemType,
        i.TitleOrModel,
        l.DateIssued,
        l.DueDate,
        l.DateReturned,
        l.ConditionOut,
        l.ConditionIn,
        l.IssuedBy,
        l.ReceivedBy,
        l.IssueSignaturePath,
        l.ReturnSignaturePath,
        CASE 
          WHEN l.DateReturned IS NULL AND l.DueDate < CURRENT_TIMESTAMP THEN 'OVERDUE'
          WHEN l.DateReturned IS NULL THEN 'ISSUED'
          ELSE 'RETURNED'
        END AS Status
      FROM Loans l
      JOIN Students s ON l.StudentID = s.StudentID
      JOIN Schools sch ON s.SchoolID = sch.SchoolID
      JOIN Items i ON l.ItemID = i.ItemID
      ORDER BY l.DateIssued DESC
      LIMIT 100
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 10. Data Export (CSV) for Microsoft Access or Excel
app.get('/api/export/:table', async (req, res) => {
  const allowed = ['students', 'visits', 'items', 'loans', 'schools'];
  const table = req.params.table.toLowerCase();

  if (!allowed.includes(table)) {
    return res.status(400).json({ error: `Invalid table for export. Allowed: ${allowed.join(', ')}` });
  }

  try {
    const data = await db.query(`SELECT * FROM ${table}`);
    if (data.rows.length === 0) {
      return res.status(200).send('');
    }

    const headers = Object.keys(data.rows[0]);
    const csvRows = [headers.join(',')];

    for (const row of data.rows) {
      const values = headers.map((header) => {
        const val = row[header];
        if (val === null || val === undefined) return '';
        const escaped = String(val).replace(/"/g, '""');
        return `"${escaped}"`;
      });
      csvRows.push(values.join(','));
    }

    const csvContent = csvRows.join('\r\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${table}_export.csv"`);
    res.send(csvContent);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Catch-all route to serve SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Start Express server
const server = app.listen(PORT, async () => {
  console.log(`[Library Front Office] Web Application running on port ${PORT}`);
  console.log(`[Library Front Office] UI available at: http://localhost:${PORT}`);
  await db.testConnection();
});

module.exports = { app, server };
