# Perfexio — Multi-tenant Performance Management SaaS

Perfexio is a commercial-grade, multi-tenant performance management platform built with a "no-framework" architecture for maximum speed and maintainability. It enables organizations to manage goals (OKRs), conduct manager reviews, and analyze culture and values metrics.

## 🚀 Key Features

- **Multi-tenant Architecture:** Securely manages multiple client workspaces (tenants) within a single Firebase project using a custom data-path routing system.
- **Goal/OKR Management:** Set, track, and score performance goals with weighted achievement calculations.
- **Performance Reviews:** Structured manager review cycles with qualitative feedback and numeric scoring.
- **Culture & Values Scoring:** Integrated scoring for organizational values (e.g., Ownership, Quality, Communication).
- **Advanced Analytics:** Real-time dashboards and reports using Chart.js to visualize performance trends across teams and departments.
- **Platform Admin Suite:** Internal tools for Perfexio staff to provision new client companies and manage global settings.
- **Security-First Design:** Robust access control via Firestore Security Rules, preventing unauthorized data access or tenant cross-talk.

## 🛠️ Tech Stack

- **Frontend:** Plain JavaScript (ES6+), Tailwind CSS (for styling).
- **Backend/Database:** Firebase Firestore (multi-tenant data model).
- **Authentication:** Firebase Auth (Email/Password & Google Sign-in).
- **Infrastructure:** Firebase Hosting (multi-site deployment).
- **Testing:** Custom Node.js-based test harness for syntax, handlers, and logic verification.

## 🏗️ Architecture

Perfexio is designed for the **Firebase Spark (Free) plan**, avoiding costly Cloud Functions or complex build steps. It uses a clean, global-state architecture where modules are loaded via classic `<script>` tags, ensuring near-instant load times and zero-cost scaling.

### Environment Isolation
Data is isolated using a unique environment-based root:
`tenants/{production|staging|demo}/companies/{companyId}/...`

## 🚦 Deployment Pipeline

The project follows a strict staged deployment process:
1. `npm test` (Verify syntax and logic)
2. `firebase deploy --only firestore:rules`
3. `firebase deploy --only hosting:staging`
4. `firebase deploy --only hosting:demo`
5. `firebase deploy --only hosting:production`

---
*Created by Masud Parvej Prantik*
