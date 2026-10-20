# Automated Microsoft Access Database Builder
# Creates LibraryFrontOffice.accdb with all tables, constraints, queries, and VBA modules.

param (
    [string]$DbPath = "$PSScriptRoot\LibraryFrontOffice.accdb"
)

Write-Host "Creating Microsoft Access database at: $DbPath" -ForegroundColor Cyan

# Remove old database if exists
if (Test-Path $DbPath) {
    Remove-Item $DbPath -Force
    Write-Host "Removed existing database file." -ForegroundColor Yellow
}

$access = New-Object -ComObject Access.Application
$access.Visible = $false

try {
    # 1. Create new .accdb database
    $access.NewCurrentDatabase($DbPath)
    $db = $access.CurrentDb()
    Write-Host "Initialized blank Access database successfully." -ForegroundColor Green

    # 2. Execute table creation queries
    $queries = @(
        # Schools
        @"
CREATE TABLE Schools (
    SchoolID COUNTER CONSTRAINT PK_Schools PRIMARY KEY,
    SchoolName TEXT(150) NOT NULL,
    SchoolCode TEXT(30),
    IsActive YESNO
);
"@,
        # Students
        @"
CREATE TABLE Students (
    StudentID COUNTER CONSTRAINT PK_Students PRIMARY KEY,
    StudentNumber TEXT(20) NOT NULL,
    FullName TEXT(150) NOT NULL,
    SchoolID LONG NOT NULL,
    Gender TEXT(30),
    SchoolLevel TEXT(30),
    DateRegistered DATETIME,
    IsActive YESNO,
    Notes MEMO
);
"@,
        # Visits
        @"
CREATE TABLE Visits (
    VisitID COUNTER CONSTRAINT PK_Visits PRIMARY KEY,
    StudentID LONG NOT NULL,
    CheckInTime DATETIME NOT NULL,
    CheckOutTime DATETIME,
    SignaturePath TEXT(255),
    SignatureCapturedAt DATETIME,
    CheckInStaff TEXT(100),
    CheckOutStaff TEXT(100),
    VisitNotes MEMO
);
"@,
        # Items
        @"
CREATE TABLE Items (
    ItemID COUNTER CONSTRAINT PK_Items PRIMARY KEY,
    AssetTag TEXT(30) NOT NULL,
    ItemType TEXT(30) NOT NULL,
    TitleOrModel TEXT(150) NOT NULL,
    SerialNumber TEXT(100),
    ItemCondition TEXT(30),
    IsActive YESNO,
    Notes MEMO
);
"@,
        # Loans
        @"
CREATE TABLE Loans (
    LoanID COUNTER CONSTRAINT PK_Loans PRIMARY KEY,
    StudentID LONG NOT NULL,
    ItemID LONG NOT NULL,
    VisitID LONG,
    DateIssued DATETIME NOT NULL,
    DueDate DATETIME,
    DateReturned DATETIME,
    ConditionOut TEXT(30),
    ConditionIn TEXT(30),
    IssueSignaturePath TEXT(255),
    ReturnSignaturePath TEXT(255),
    IssuedBy TEXT(100),
    ReceivedBy TEXT(100),
    LoanNotes MEMO
);
"@,
        # StaffUsers
        @"
CREATE TABLE StaffUsers (
    StaffID COUNTER CONSTRAINT PK_StaffUsers PRIMARY KEY,
    StaffName TEXT(100) NOT NULL,
    IsActive YESNO
);
"@
    )

    foreach ($q in $queries) {
        $db.Execute($q)
    }
    Write-Host "Created all 6 core tables in Access." -ForegroundColor Green

    # 3. Create Unique Indexes
    try {
        $db.Execute("CREATE UNIQUE INDEX idx_StudentNumber ON Students (StudentNumber);")
        $db.Execute("CREATE UNIQUE INDEX idx_AssetTag ON Items (AssetTag);")
        Write-Host "Created unique indexes on StudentNumber and AssetTag." -ForegroundColor Green
    } catch {
        Write-Host "Notice on unique index creation: $_" -ForegroundColor Yellow
    }

    # 4. Create Saved Queries matching the Access Setup Guide
    $savedQueries = @{
        "qryVisitsToday" = "SELECT Visits.VisitID, Students.StudentNumber, Students.FullName, Schools.SchoolName, Students.SchoolLevel, Visits.CheckInTime, Visits.CheckOutTime, Visits.CheckInStaff FROM (Visits INNER JOIN Students ON Visits.StudentID = Students.StudentID) INNER JOIN Schools ON Students.SchoolID = Schools.SchoolID WHERE DateValue(Visits.CheckInTime) = DateValue(Now());"
        "qryCurrentlyPresent" = "SELECT Visits.VisitID, Students.StudentID, Students.StudentNumber, Students.FullName, Schools.SchoolName, Visits.CheckInTime, Visits.CheckInStaff FROM (Visits INNER JOIN Students ON Visits.StudentID = Students.StudentID) INNER JOIN Schools ON Students.SchoolID = Schools.SchoolID WHERE Visits.CheckOutTime IS NULL;"
        "qryOpenLoans" = "SELECT Loans.LoanID, Students.StudentNumber, Students.FullName, Items.AssetTag, Items.ItemType, Items.TitleOrModel, Loans.DateIssued, Loans.DueDate, Loans.ConditionOut, Loans.IssuedBy FROM (Loans INNER JOIN Students ON Loans.StudentID = Students.StudentID) INNER JOIN Items ON Loans.ItemID = Items.ItemID WHERE Loans.DateReturned IS NULL;"
        "qryItemAvailability" = "SELECT Items.ItemID, Items.AssetTag, Items.ItemType, Items.TitleOrModel, Items.ItemCondition, IIF(Loans.LoanID IS NOT NULL, 'ISSUED', 'AVAILABLE') AS AvailabilityStatus FROM Items LEFT JOIN Loans ON (Items.ItemID = Loans.ItemID AND Loans.DateReturned IS NULL) WHERE Items.IsActive = True;"
    }

    foreach ($queryName in $savedQueries.Keys) {
        try {
            $qDef = $db.CreateQueryDef($queryName, $savedQueries[$queryName])
            Write-Host "Created query: $queryName" -ForegroundColor Green
        } catch {
            Write-Host "Query $queryName error: $_" -ForegroundColor Yellow
        }
    }

    # 5. Insert Sample Seed Data into Access
    $db.Execute("INSERT INTO StaffUsers (StaffName, IsActive) VALUES ('Jane M. Doe (Librarian)', True);")
    $db.Execute("INSERT INTO StaffUsers (StaffName, IsActive) VALUES ('David K. Omondi (Desk Officer)', True);")

    $db.Execute("INSERT INTO Schools (SchoolName, SchoolCode, IsActive) VALUES ('Nairobi National Academy', 'NNA-01', True);")
    $db.Execute("INSERT INTO Schools (SchoolName, SchoolCode, IsActive) VALUES ('Alliance High School', 'AHS-02', True);")
    $db.Execute("INSERT INTO Schools (SchoolName, SchoolCode, IsActive) VALUES ('St. Marys School', 'SMS-03', True);")

    $db.Execute("INSERT INTO Students (StudentNumber, FullName, SchoolID, Gender, SchoolLevel, DateRegistered, IsActive, Notes) VALUES ('STU-241001-081520', 'Faith Mwangi', 1, 'Female', 'Form 3', Now(), True, 'Regular reader');")
    $db.Execute("INSERT INTO Students (StudentNumber, FullName, SchoolID, Gender, SchoolLevel, DateRegistered, IsActive, Notes) VALUES ('STU-241002-092211', 'Brian Kiprop', 2, 'Male', 'Form 4', Now(), True, 'Robotics team member');")
    $db.Execute("INSERT INTO Students (StudentNumber, FullName, SchoolID, Gender, SchoolLevel, DateRegistered, IsActive, Notes) VALUES ('STU-241003-104500', 'Amina Hassan', 3, 'Female', 'Form 2', Now(), True, 'STEM club');")

    $db.Execute("INSERT INTO Items (AssetTag, ItemType, TitleOrModel, SerialNumber, ItemCondition, IsActive, Notes) VALUES ('AST-BK-001', 'Book', 'Introduction to Algorithms, 4th Ed.', 'ISBN-9780262046305', 'Good', True, 'Reserved desk copy');")
    $db.Execute("INSERT INTO Items (AssetTag, ItemType, TitleOrModel, SerialNumber, ItemCondition, IsActive, Notes) VALUES ('AST-KD-101', 'Kindle', 'Amazon Kindle Paperwhite 11th Gen', 'SN-KD8829104', 'Good', True, 'Preloaded with curriculum ebooks');")
    $db.Execute("INSERT INTO Items (AssetTag, ItemType, TitleOrModel, SerialNumber, ItemCondition, IsActive, Notes) VALUES ('AST-TB-201', 'Tablet', 'Samsung Galaxy Tab A8 10.5', 'SN-SMT295-9921', 'Good', True, 'Library interactive study tablet');")
    $db.Execute("INSERT INTO Items (AssetTag, ItemType, TitleOrModel, SerialNumber, ItemCondition, IsActive, Notes) VALUES ('AST-BK-002', 'Book', 'Advanced Physics for High Schools', 'ISBN-9780198392927', 'Fair', True, 'Cover slightly worn');")

    Write-Host "Sample seed data inserted into Access database." -ForegroundColor Green

    # 6. Add VBA Module from Access_VBA_Code.txt
    $vbaPath = "$PSScriptRoot\Library_Front_Office_Access_Starter_Kit\Access_VBA_Code.txt"
    if (Test-Path $vbaPath) {
        $vbaCode = Get-Content $vbaPath -Raw
        $module = $access.VBE.ActiveVBProject.VBComponents.Add(1) # 1 = vbext_ct_StdModule
        $module.Name = "mdlLibraryWorkflows"
        $module.CodeModule.AddFromString($vbaCode)
        Write-Host "VBA module 'mdlLibraryWorkflows' created and loaded into Access." -ForegroundColor Green
    }

    # Save and close
    $access.CloseCurrentDatabase()
    Write-Host "Successfully built LibraryFrontOffice.accdb!" -ForegroundColor Cyan
}
catch {
    Write-Error "Error building Access database: $_"
}
finally {
    $access.Quit()
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($access) | Out-Null
    [System.GC]::Collect()
    [System.GC]::WaitForPendingFinalizers()
}
