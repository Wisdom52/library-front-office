-- LIBRARY FRONT OFFICE MANAGER -- POSTGRESQL INITIALIZATION SCHEMA
-- Matches Microsoft Access Starter Kit schema and queries

CREATE TABLE IF NOT EXISTS Schools (
    SchoolID SERIAL PRIMARY KEY,
    SchoolName VARCHAR(150) NOT NULL,
    SchoolCode VARCHAR(30),
    IsActive BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS Students (
    StudentID SERIAL PRIMARY KEY,
    StudentNumber VARCHAR(30) UNIQUE NOT NULL,
    FullName VARCHAR(150) NOT NULL,
    SchoolID INTEGER NOT NULL REFERENCES Schools(SchoolID) ON DELETE RESTRICT,
    Gender VARCHAR(30),
    SchoolLevel VARCHAR(30),
    DateRegistered TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    IsActive BOOLEAN DEFAULT TRUE,
    Notes TEXT
);

CREATE TABLE IF NOT EXISTS Visits (
    VisitID SERIAL PRIMARY KEY,
    StudentID INTEGER NOT NULL REFERENCES Students(StudentID) ON DELETE RESTRICT,
    CheckInTime TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CheckOutTime TIMESTAMP,
    SignaturePath VARCHAR(255),
    SignatureCapturedAt TIMESTAMP,
    CheckInStaff VARCHAR(100),
    CheckOutStaff VARCHAR(100),
    VisitNotes TEXT,
    CONSTRAINT chk_visit_checkout CHECK (CheckOutTime IS NULL OR CheckOutTime >= CheckInTime)
);

CREATE TABLE IF NOT EXISTS Items (
    ItemID SERIAL PRIMARY KEY,
    AssetTag VARCHAR(30) UNIQUE NOT NULL,
    ItemType VARCHAR(30) NOT NULL,
    TitleOrModel VARCHAR(150) NOT NULL,
    SerialNumber VARCHAR(100),
    ItemCondition VARCHAR(30) DEFAULT 'Good',
    IsActive BOOLEAN DEFAULT TRUE,
    Notes TEXT
);

CREATE TABLE IF NOT EXISTS Loans (
    LoanID SERIAL PRIMARY KEY,
    StudentID INTEGER NOT NULL REFERENCES Students(StudentID) ON DELETE RESTRICT,
    ItemID INTEGER NOT NULL REFERENCES Items(ItemID) ON DELETE RESTRICT,
    VisitID INTEGER REFERENCES Visits(VisitID) ON DELETE SET NULL,
    DateIssued TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    DueDate TIMESTAMP,
    DateReturned TIMESTAMP,
    ConditionOut VARCHAR(30) DEFAULT 'Good',
    ConditionIn VARCHAR(30),
    IssueSignaturePath VARCHAR(255),
    ReturnSignaturePath VARCHAR(255),
    IssuedBy VARCHAR(100),
    ReceivedBy VARCHAR(100),
    LoanNotes TEXT,
    CONSTRAINT chk_loan_return CHECK (DateReturned IS NULL OR DateReturned >= DateIssued)
);

CREATE TABLE IF NOT EXISTS StaffUsers (
    StaffID SERIAL PRIMARY KEY,
    StaffName VARCHAR(100) NOT NULL,
    IsActive BOOLEAN DEFAULT TRUE
);

-- CREATE INDEXES FOR FAST SEARCH
CREATE INDEX IF NOT EXISTS idx_students_fullname ON Students(FullName);
CREATE INDEX IF NOT EXISTS idx_visits_student ON Visits(StudentID);
CREATE INDEX IF NOT EXISTS idx_visits_checkin ON Visits(CheckInTime);
CREATE INDEX IF NOT EXISTS idx_loans_item ON Loans(ItemID);
CREATE INDEX IF NOT EXISTS idx_loans_student ON Loans(StudentID);
CREATE INDEX IF NOT EXISTS idx_loans_datereturned ON Loans(DateReturned);

-- SAVED VIEWS MATCHING ACCESS QUERIES

-- 1. qryVisitsToday
CREATE OR REPLACE VIEW qryVisitsToday AS
SELECT 
    v.VisitID,
    s.StudentID,
    s.StudentNumber,
    s.FullName,
    sch.SchoolName,
    s.SchoolLevel,
    v.CheckInTime,
    v.CheckOutTime,
    v.CheckInStaff,
    v.CheckOutStaff,
    v.SignaturePath,
    v.VisitNotes,
    CASE 
        WHEN v.CheckOutTime IS NOT NULL THEN 
            ROUND(EXTRACT(EPOCH FROM (v.CheckOutTime - v.CheckInTime)) / 60)
        ELSE 
            ROUND(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - v.CheckInTime)) / 60)
    END AS DurationMinutes
FROM Visits v
JOIN Students s ON v.StudentID = s.StudentID
JOIN Schools sch ON s.SchoolID = sch.SchoolID
WHERE DATE(v.CheckInTime) = CURRENT_DATE
ORDER BY v.CheckInTime DESC;

-- 2. qryCurrentlyPresent
CREATE OR REPLACE VIEW qryCurrentlyPresent AS
SELECT 
    v.VisitID,
    s.StudentID,
    s.StudentNumber,
    s.FullName,
    sch.SchoolName,
    s.SchoolLevel,
    s.Gender,
    v.CheckInTime,
    v.CheckInStaff,
    v.SignaturePath,
    ROUND(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - v.CheckInTime)) / 60) AS MinutesInLibrary
FROM Visits v
JOIN Students s ON v.StudentID = s.StudentID
JOIN Schools sch ON s.SchoolID = sch.SchoolID
WHERE v.CheckOutTime IS NULL
ORDER BY v.CheckInTime ASC;

-- 3. qryAttendanceBySchool
CREATE OR REPLACE VIEW qryAttendanceBySchool AS
SELECT 
    sch.SchoolID,
    sch.SchoolName,
    COUNT(v.VisitID) AS TotalVisits,
    COUNT(DISTINCT v.StudentID) AS UniqueStudents,
    MAX(v.CheckInTime) AS LastVisitTime
FROM Schools sch
LEFT JOIN Students s ON sch.SchoolID = s.SchoolID
LEFT JOIN Visits v ON s.StudentID = v.StudentID
GROUP BY sch.SchoolID, sch.SchoolName
ORDER BY TotalVisits DESC;

-- 4. qryOpenLoans
CREATE OR REPLACE VIEW qryOpenLoans AS
SELECT 
    l.LoanID,
    s.StudentID,
    s.StudentNumber,
    s.FullName,
    sch.SchoolName,
    i.ItemID,
    i.AssetTag,
    i.ItemType,
    i.TitleOrModel,
    i.SerialNumber,
    l.DateIssued,
    l.DueDate,
    l.ConditionOut,
    l.IssuedBy,
    l.IssueSignaturePath,
    CASE 
        WHEN l.DueDate IS NOT NULL AND l.DueDate < CURRENT_TIMESTAMP THEN TRUE
        ELSE FALSE
    END AS IsOverdue,
    ROUND(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - l.DateIssued)) / 86400, 1) AS DaysOut
FROM Loans l
JOIN Students s ON l.StudentID = s.StudentID
JOIN Schools sch ON s.SchoolID = sch.SchoolID
JOIN Items i ON l.ItemID = i.ItemID
WHERE l.DateReturned IS NULL
ORDER BY l.DateIssued DESC;

-- 5. qryItemAvailability
CREATE OR REPLACE VIEW qryItemAvailability AS
SELECT 
    i.ItemID,
    i.AssetTag,
    i.ItemType,
    i.TitleOrModel,
    i.SerialNumber,
    i.ItemCondition,
    i.IsActive,
    CASE 
        WHEN NOT i.IsActive THEN 'INACTIVE'
        WHEN ol.LoanID IS NOT NULL THEN 'ISSUED'
        ELSE 'AVAILABLE'
    END AS AvailabilityStatus,
    ol.LoanID AS CurrentLoanID,
    ol.FullName AS BorrowedBy,
    ol.StudentNumber AS BorrowerNumber,
    ol.DateIssued AS BorrowedAt,
    ol.DueDate
FROM Items i
LEFT JOIN (
    SELECT l.LoanID, l.ItemID, s.FullName, s.StudentNumber, l.DateIssued, l.DueDate
    FROM Loans l
    JOIN Students s ON l.StudentID = s.StudentID
    WHERE l.DateReturned IS NULL
) ol ON i.ItemID = ol.ItemID
ORDER BY i.AssetTag ASC;

-- SEED DATA
INSERT INTO StaffUsers (StaffName, IsActive) VALUES 
('Jane M. Doe (Head Librarian)', TRUE),
('David K. Omondi (Circulation Officer)', TRUE),
('Sarah N. Wambui (Reception Desk)', TRUE)
ON CONFLICT DO NOTHING;

INSERT INTO Schools (SchoolName, SchoolCode, IsActive) VALUES 
('Nairobi National Academy', 'NNA-01', TRUE),
('Alliance High School', 'AHS-02', TRUE),
('St. Mary''s School', 'SMS-03', TRUE),
('Lenana Academy', 'LEN-04', TRUE),
('Loreto Convent Valley Road', 'LCV-05', TRUE)
ON CONFLICT DO NOTHING;

INSERT INTO Students (StudentNumber, FullName, SchoolID, Gender, SchoolLevel, DateRegistered, IsActive, Notes) VALUES 
('STU-241001-081520', 'Faith Mwangi', 1, 'Female', 'Form 3', NOW() - INTERVAL '14 days', TRUE, 'Regular reader, coding club lead'),
('STU-241002-092211', 'Brian Kiprop', 2, 'Male', 'Form 4', NOW() - INTERVAL '30 days', TRUE, 'Robotics team member'),
('STU-241003-104500', 'Amina Hassan', 3, 'Female', 'Form 2', NOW() - INTERVAL '10 days', TRUE, 'Science & STEM club participant'),
('STU-241004-113045', 'Kevin Otieno', 4, 'Male', 'Form 3', NOW() - INTERVAL '5 days', TRUE, 'Debate Society captain'),
('STU-241005-142010', 'Grace Nyambura', 5, 'Female', 'Form 1', NOW() - INTERVAL '2 days', TRUE, 'Enjoys historical fiction')
ON CONFLICT DO NOTHING;

INSERT INTO Items (AssetTag, ItemType, TitleOrModel, SerialNumber, ItemCondition, IsActive, Notes) VALUES 
('AST-BK-001', 'Book', 'Introduction to Algorithms (CLRS 4th Ed)', 'ISBN-9780262046305', 'Good', TRUE, 'Core computer science reference'),
('AST-BK-002', 'Book', 'Advanced Physics for High Schools', 'ISBN-9780198392927', 'Fair', TRUE, 'Slight shelf wear on spine'),
('AST-BK-003', 'Book', 'Things Fall Apart - Chinua Achebe', 'ISBN-9780385474542', 'Good', TRUE, 'Literature set book'),
('AST-KD-101', 'Kindle', 'Amazon Kindle Paperwhite 11th Gen 16GB', 'SN-KD8829104', 'Good', TRUE, 'Preloaded with 45 science and literature titles'),
('AST-KD-102', 'Kindle', 'Amazon Kindle Paperwhite 11th Gen 16GB', 'SN-KD8829105', 'Good', TRUE, 'Preloaded with Form 1-4 curriculum guides'),
('AST-TB-201', 'Tablet', 'Samsung Galaxy Tab A8 10.5 64GB', 'SN-SMT295-9921', 'Good', TRUE, 'Interactive physics & mathematics simulations'),
('AST-TB-202', 'Tablet', 'Lenovo Tab M10 Plus Gen 3', 'SN-ZA880010KE', 'Good', TRUE, 'Configured in library kiosk mode'),
('AST-LP-301', 'Laptop', 'HP ProBook 450 G9 (i5/16GB/512GB)', 'SN-5CD239109L', 'Good', TRUE, 'Research workstation laptop for senior students')
ON CONFLICT DO NOTHING;

-- Seed an active visit and historical visit
INSERT INTO Visits (StudentID, CheckInTime, CheckOutTime, SignaturePath, CheckInStaff, CheckOutStaff, VisitNotes) VALUES 
(1, NOW() - INTERVAL '45 minutes', NULL, 'signatures/sig_demo_1.png', 'Sarah N. Wambui (Reception Desk)', NULL, 'Working on physics assignment'),
(2, NOW() - INTERVAL '3 hours', NOW() - INTERVAL '1 hour', 'signatures/sig_demo_2.png', 'David K. Omondi (Circulation Officer)', 'Sarah N. Wambui (Reception Desk)', 'Completed robotics documentation')
ON CONFLICT DO NOTHING;

-- Seed an active loan and a returned loan
INSERT INTO Loans (StudentID, ItemID, DateIssued, DueDate, DateReturned, ConditionOut, ConditionIn, IssuedBy, ReceivedBy, LoanNotes) VALUES 
(1, 4, NOW() - INTERVAL '2 days', NOW() + INTERVAL '5 days', NULL, 'Good', NULL, 'Jane M. Doe (Head Librarian)', NULL, 'Borrowed for weekend reading'),
(3, 1, NOW() - INTERVAL '8 days', NOW() - INTERVAL '1 day', NOW() - INTERVAL '2 hours', 'Good', 'Good', 'David K. Omondi (Circulation Officer)', 'Jane M. Doe (Head Librarian)', 'Returned on time and in good condition')
ON CONFLICT DO NOTHING;
