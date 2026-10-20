# 📚 Library Front Office Manager

> A full-stack Library Front Office management system with **Docker PostgreSQL** backend, **Microsoft Access** desktop integration, and a premium dark-themed web interface featuring digital signature capture, real-time student attendance tracking, and resource circulation management.

![Node.js](https://img.shields.io/badge/Node.js-20-339933?logo=nodedotjs&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)
![MS Access](https://img.shields.io/badge/MS_Access-2016+-A4373A?logo=microsoftaccess&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green)

---

## ✨ Features

### Command Center Dashboard
- **Live attendance metrics** — students currently present, visits today, active loans, available assets
- **Real-time roster** refreshed every 15 seconds
- **Active loans tracker** with overdue detection

### Reception & Attendance Desk
- Student search by name or student number
- **Check-in / Check-out** with time recording
- **HTML5 Canvas digital signature capture** — saved as PNG files and linked to visit records
- Prevents duplicate check-ins (guards against already-open visits)
- Full daily attendance log with duration tracking

### Resource Circulation (Loans)
- Issue books, Kindles, tablets, and laptops to students
- Return processing with condition inspection (Good / Fair / Damaged / Missing parts)
- Due date tracking with automatic **overdue detection**
- Borrower acknowledgment signatures on issue

### Student Directory
- Auto-generated student numbers (`STU-YYMMDD-HHMMSS`)
- School and level assignment with combo filters
- Full per-student visit history and loan history viewer

### Asset & Inventory Register
- Unique asset tags per item (e.g., `AST-BK-001`, `AST-KD-101`)
- Type filtering (Book, Kindle, Tablet, Laptop, Other)
- Real-time availability status (Available / Issued / Inactive)
- Current holder tracking

### Reports & Analytics
- **Attendance by school** — total visits and unique student counts
- **Outstanding resources** — items still issued with days-out counter
- **Circulation history log** — full audit trail of all issues and returns
- **CSV export** — one-click download for Students, Visits, Loans, Items, and Schools

### Microsoft Access Integration
- Auto-generated `LibraryFrontOffice.accdb` via PowerShell COM automation
- Matching schemas, queries, unique indexes, and VBA workflow module
- CSV export from PostgreSQL for import into Access or Excel

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────┐
│              Docker Compose                  │
│                                              │
│  ┌──────────────────┐  ┌──────────────────┐ │
│  │  PostgreSQL 16   │  │  Node.js Express  │ │
│  │  (Alpine)        │←─│  Web Application  │ │
│  │  Port: 5434      │  │  Port: 3000       │ │
│  └──────────────────┘  └──────────────────┘ │
└─────────────────────────────────────────────┘
                              │
                    ┌─────────┴─────────┐
                    │  Browser Client   │
                    │  (HTML/CSS/JS)    │
                    └───────────────────┘

  ┌─────────────────────────────────────┐
  │  Windows Host (Optional)            │
  │  LibraryFrontOffice.accdb           │
  │  MS Access 2016+ Desktop Client     │
  │  CSV Import/Export Bridge           │
  └─────────────────────────────────────┘
```

---

## 🚀 Quick Start

### Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running
- [Node.js 18+](https://nodejs.org/) (only needed for local development without Docker)
- [Microsoft Access 2016+](https://www.microsoft.com/en-us/microsoft-365/access) (optional, for `.accdb` generation)

### 1. Clone the Repository

```bash
git clone https://github.com/YOUR_USERNAME/library-front-office.git
cd library-front-office
```

### 2. Configure Environment

Create a `.env` file in the project root:

```env
PORT=3000
DATABASE_URL=postgres://library_user:library_secret_pw@localhost:5434/library_front_office
NODE_ENV=development
SIGNATURE_DIR=signatures
```

### 3. Start with Docker (Recommended)

```bash
docker compose up -d
```

This will:
- Pull and start **PostgreSQL 16 Alpine** on port `5434`
- Automatically run the database schema and seed data from `database/init.sql`
- Build and start the **Node.js web application** on port `3000`

### 4. Open the Application

Navigate to **[http://localhost:3000](http://localhost:3000)** in your browser.

---

## 🖥️ Local Development (Without Docker)

```bash
# 1. Install dependencies
npm install

# 2. Ensure PostgreSQL is running on port 5434
#    (or update DATABASE_URL in .env)

# 3. Run the init script against your database
psql -U library_user -d library_front_office -f database/init.sql

# 4. Start the development server
npm run dev
```

---

## 🗄️ Microsoft Access Database Generation

If you have MS Access 2016+ installed on Windows:

```powershell
# Generate LibraryFrontOffice.accdb with all tables, queries, VBA, and seed data
powershell -ExecutionPolicy Bypass -File .\build_access_db.ps1
```

This creates a fully populated `.accdb` file with:
- 6 tables matching the PostgreSQL schema
- 4 saved queries (`qryVisitsToday`, `qryCurrentlyPresent`, `qryOpenLoans`, `qryItemAvailability`)
- VBA module `mdlLibraryWorkflows` with check-in/out and issue/return business logic
- Sample seed data (3 schools, 3 students, 4 items, 2 staff)

---

## 📁 Project Structure

```
library-front-office/
├── database/
│   └── init.sql                 # PostgreSQL schema, views, indexes, and seed data
├── Library_Front_Office_Access_Starter_Kit/
│   ├── Access_Setup_Guide.docx  # Step-by-step Access setup instructions
│   ├── Access_VBA_Code.txt      # VBA workflow module source code
│   ├── Library_Front_Office_Schema.sql  # Original Access SQL schema
│   ├── Sample_Data.csv          # Sample school data for import
│   └── README.txt               # Kit overview
├── public/
│   ├── index.html               # Single-page application HTML
│   ├── style.css                # Premium dark glassmorphism design system
│   └── app.js                   # Client-side application logic
├── server/
│   ├── db.js                    # PostgreSQL connection pool with retry logic
│   └── index.js                 # Express REST API server (all routes)
├── signatures/                  # Runtime-generated digital signature PNGs
├── build_access_db.ps1          # PowerShell script to generate .accdb file
├── docker-compose.yml           # Docker services (PostgreSQL + Web App)
├── Dockerfile                   # Web application container definition
├── package.json                 # Node.js dependencies and scripts
└── .gitignore
```

---

## 🔌 API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Database connection health check |
| `GET` | `/api/stats` | Dashboard summary metrics |
| `GET` | `/api/schools` | List all schools with student counts |
| `POST` | `/api/schools` | Register a new school |
| `GET` | `/api/students` | List students (supports `?search=` and `?schoolId=`) |
| `GET` | `/api/students/:id` | Student profile with visit and loan history |
| `POST` | `/api/students` | Register a new student |
| `GET` | `/api/visits/currently-present` | Students currently in library |
| `GET` | `/api/visits/today` | All visits for today |
| `POST` | `/api/visits/check-in` | Check in a student (with optional signature) |
| `POST` | `/api/visits/check-out/:visitId` | Check out a student |
| `GET` | `/api/items` | List items (supports `?type=` and `?availability=`) |
| `POST` | `/api/items` | Add a new library asset |
| `GET` | `/api/loans/open` | All currently outstanding loans |
| `POST` | `/api/loans/issue` | Issue an item to a student |
| `POST` | `/api/loans/return/:loanId` | Process item return |
| `GET` | `/api/reports/daily-attendance` | Daily attendance report (supports `?date=`) |
| `GET` | `/api/reports/by-school` | Attendance summary grouped by school |
| `GET` | `/api/reports/loan-history` | Complete circulation audit trail |
| `GET` | `/api/export/:table` | Download CSV export (`students`, `visits`, `loans`, `items`, `schools`) |

---

## 🐳 Docker Commands

| Action | Command |
|--------|---------|
| Start all services | `docker compose up -d` |
| Stop all services | `docker compose down` |
| Rebuild after code changes | `docker compose up -d --build` |
| View web app logs | `docker logs library_front_office_web` |
| View database logs | `docker logs library_postgres` |
| Reset database (delete volume) | `docker compose down -v && docker compose up -d` |
| Access PostgreSQL shell | `docker exec -it library_postgres psql -U library_user -d library_front_office` |

---

## 🗃️ Database Schema

### Tables

| Table | Description |
|-------|-------------|
| **Schools** | School registry (name, code, active status) |
| **Students** | Student profiles linked to schools |
| **Visits** | Attendance check-in/out records with signature paths |
| **Items** | Library asset inventory (books, Kindles, tablets, laptops) |
| **Loans** | Resource circulation records (issue/return with condition tracking) |
| **StaffUsers** | Library staff directory |

### Key Constraints
- `Students.StudentNumber` — unique index
- `Items.AssetTag` — unique index
- Foreign keys with `ON DELETE RESTRICT` for data integrity
- `CHECK` constraints on visit checkout and loan return dates

---

## 🔒 Security Notes

- This system is designed for a **single-site, trusted network** environment (school library).
- The `.env` file containing database credentials is excluded from version control via `.gitignore`.
- Digital signatures are stored as file paths, not embedded binary blobs, following the Access starter kit design.
- For production deployment, configure proper authentication, HTTPS, and restrict database access.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
