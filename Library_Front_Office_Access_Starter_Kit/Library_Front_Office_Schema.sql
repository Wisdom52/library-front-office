' LIBRARY FRONT OFFICE MANAGER — MICROSOFT ACCESS
' Run each CREATE TABLE statement separately in Create > Query Design > SQL View.
' If Access rejects a statement, use table Design View and create the same fields/types manually.
' Access types: COUNTER=AutoNumber, LONG=Number/Long Integer, TEXT(n)=Short Text, MEMO=Long Text,
' DATETIME=Date/Time, YESNO=Yes/No, CURRENCY=Currency, OLEOBJECT=Attachment/OLE Object (avoid for signatures).
' Digital signatures are stored as PNG file paths in SignaturePath, not as embedded binary blobs.

CREATE TABLE Schools (
    SchoolID COUNTER CONSTRAINT PK_Schools PRIMARY KEY,
    SchoolName TEXT(150) NOT NULL,
    SchoolCode TEXT(30),
    IsActive YESNO
);

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

CREATE TABLE StaffUsers (
    StaffID COUNTER CONSTRAINT PK_StaffUsers PRIMARY KEY,
    StaffName TEXT(100) NOT NULL,
    IsActive YESNO
);

' After creating tables, create these relationships in Database Tools > Relationships:
' Schools.SchoolID 1---many Students.SchoolID (Enforce Referential Integrity)
' Students.StudentID 1---many Visits.StudentID (Enforce Referential Integrity)
' Students.StudentID 1---many Loans.StudentID (Enforce Referential Integrity)
' Items.ItemID 1---many Loans.ItemID (Enforce Referential Integrity)
' Visits.VisitID 1---many Loans.VisitID (optional relationship; allow null VisitID)
' Use unique indexes for Students.StudentNumber and Items.AssetTag.
' Use validation rules on table fields in Design View as described in the setup guide.
