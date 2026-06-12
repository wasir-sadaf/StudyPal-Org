# Finance Section - Feature Overview

## 📊 Overview
The StudyPal finance section is a comprehensive personal finance management tool with budget tracking, expense logging, AI-powered categorization, and savings goals management.

---

## 🎯 Core Features

### 1. **Dashboard (Main Finance Page)**
**Path:** `frontend/src/pages/Finance.jsx`

**Features:**
- **Net Balance Display** - Shows current net balance with visual progress indicator
- **Monthly Income & Expenses** - Cards showing monthly totals
- **Category Breakdown Chart** - Pie chart visualization of spending by category
  - Categories: Housing, Food & Dining, Transport, Entertainment, Savings, Subscriptions, etc.
- **Recent Transactions** - Quick view of latest expenses with emojis
- **Quick Add Transaction Button** - Opens modal for rapid expense entry
- **Month Navigation** - Switch between different months

**Data Loaded:**
- Monthly summary (income, expenses, net balance)
- Expense list with category breakdown
- Savings goals
- Budget overview

---

### 2. **Expense Tracking**
**Path:** `frontend/src/pages/FinanceExpenses.jsx`

**Features:**
- **Add Expenses** - Quick form to log spending with:
  - Amount
  - Category (Food, Rent, Transport, Entertainment, Books, Health, Other)
  - Description
  - Date
- **Metrics Display:**
  - Total Spent Today
  - Total Spent This Month
  - Average Daily Spending
  - Highest Spending Category
- **Filter & Search** - By month, category, and date
- **Delete Expenses** - Remove individual transactions
- **Real-time Updates** - Optimistic UI updates

**Backend Endpoints:**
- `GET /expenses` - List expenses with filters
- `POST /expenses` - Create new expense
- `DELETE /expenses/:id` - Delete expense

---

### 3. **Budget Management**
**Path:** `frontend/src/pages/FinanceBudget.jsx`

**Features:**
- **Set Monthly Budgets** - Define spending limits per category
- **Budget Visualization** - Progress bars showing:
  - Spent vs. Limit
  - Remaining budget
  - Budget utilization percentage
- **Status Indicators:**
  - 🟢 OK (< 85% used)
  - 🟡 Near Limit (85-99%)
  - 🔴 Overbudget (> 100%)
- **Edit & Delete** - Update or remove budget limits
- **Monthly Breakdown** - View budgets by month

**Budget Metrics:**
- Total Monthly Budget
- Total Spent This Month
- Remaining Budget
- Budget Utilization %

**Backend Endpoints:**
- `GET /budget?month={YYYY-MM}` - Get budget overview
- `POST /budget` - Create budget
- `PUT /budget/{id}` - Update budget
- `DELETE /budget/{id}` - Delete budget

---

### 4. **Bill Reminders**
**Path:** `frontend/src/pages/FinanceBills.jsx`

**Features:**
- **Add Bills** - Quick entry with:
  - Bill Title
  - Amount
  - Due Date
- **Status Tracking:**
  - Pending (🟡 Amber)
  - Paid (🟢 Green)
  - Overdue (🔴 Red)
- **Upcoming Bills** - Filtered for next 7 days
- **Mark as Paid** - One-click status update
- **Delete Bills** - Remove completed bills

**Bill Metrics:**
- Upcoming Bills Count (next 7 days)
- Total Pending Amount
- Overdue Bills Count
- Paid This Month Count

**Backend Endpoints:**
- `GET /bills` - List all bills
- `POST /bills` - Create bill
- `PUT /bills/{id}` - Update bill status/details
- `DELETE /bills/{id}` - Delete bill

---

### 5. **AI-Powered Expense Capture** 🤖
**Path:** `frontend/src/pages/FinanceAIExpenses.jsx`

**Features:**
- **Text-to-Expense** - Natural language input:
  - Example: "Spent $15 on lunch at Gulshan"
  - Automatically categorizes and saves
- **Receipt OCR** - Upload receipt images:
  - Extracts amounts and vendors
  - Auto-categorizes
- **Clarification Flow** - AI asks for missing info if needed
- **Expense History** - View all AI-captured expenses
- **Summary View** - Aggregate AI expenses data

**Backend Integration:**
- `POST /ai-expenses` - Create AI expense
- `GET /ai-expenses` - List AI expenses
- `GET /ai-expenses/summary` - Get summary data
- `DELETE /ai-expenses/{id}` - Delete AI expense

**Stored Data (ai_expenses table):**
- Amount & Currency
- Item name
- Vendor & Location
- Category & Subcategory
- Academic flag (is this academic spending?)
- Exam week indicator
- Raw input text

---

### 6. **Savings Goals**
**Path:** Backend endpoints in `financeController.js`

**Features:**
- **Create Goals** - Set target savings with:
  - Title
  - Target Amount
  - Current Saved Amount (optional)
  - Deadline (optional)
- **Progress Tracking** - Percentage toward goal
- **Update Goals** - Modify saved amounts
- **View All Goals** - List of active/completed goals

**Backend Endpoints:**
- `GET /goals` - List savings goals
- `POST /goals` - Create goal
- `PUT /goals/{id}` - Update goal
- `GET /goals/{id}` - Get single goal

---

### 7. **Subscriptions Tracker**
**Path:** Backend endpoints in `financeController.js`

**Features:**
- **Add Subscriptions** - Track recurring costs:
  - Name
  - Cost
  - Billing Cycle (monthly, yearly, etc.)
  - Next Due Date
- **Upcoming Subscriptions** - Alert for next 7 days
- **Active/Inactive Toggle** - Pause subscriptions
- **Update & Delete** - Manage subscriptions

**Backend Endpoints:**
- `GET /subscriptions` - List subscriptions
- `POST /subscriptions` - Create subscription
- `PUT /subscriptions/{id}` - Update subscription
- `DELETE /subscriptions/{id}` - Delete subscription

---

## 🏗️ Architecture

### Frontend Stack
- **React.js** - Component-based UI
- **React Router** - Navigation between finance sections
- **Chart.js** - Data visualization (pie charts)
- **Lucide Icons** - UI icons
- **Tailwind CSS** - Styling with dark mode support

### Backend Stack
- **Node.js/Express** - REST API
- **SQLite** - Data persistence
- **Custom Middleware** - Authentication & validation

### Database Tables
- `expenses` - All expense/income transactions
- `budgets` - Monthly budget limits by category
- `bills` - Bill reminders
- `savings_goals` - Savings targets
- `subscriptions` - Recurring charges
- `ai_expenses` - AI-captured expenses (enhanced metadata)

---

## 🔄 Data Flow

### Adding an Expense
1. User clicks "Add Transaction" → Modal opens
2. Choose between Manual Entry or AI Capture
3. **Manual:** Fill form → `POST /expenses` → Auto-refresh dashboard
4. **AI Text:** Type naturally → `POST /agent/expense/text` → Saves to both `expenses` and `ai_expenses`
5. **AI Receipt:** Upload image → `POST /agent/expense/receipt` → Processes and saves

### Viewing Finance Dashboard
1. Load `Finance.jsx`
2. Parallel API calls:
   - `GET /finance/summary?month={current}` → Monthly overview
   - `GET /finance/expenses?month={current}` → Expense list
   - `GET /finance/goals` → Savings goals
3. Render cards, charts, and recent transactions
4. Show budget overview

### Budget Tracking
1. User sets monthly budget per category
2. System tracks expenses by category
3. Calculates remaining budget and utilization %
4. Flags near-limit and overbudget categories
5. Shows visual progress on dashboard

---

## 💡 Key Features Highlights

### ✅ Smart Categorization
- Predefined categories for consistency
- AI auto-categorization from text/receipts
- Sub-categories for detailed tracking

### ✅ Real-time Notifications
- Overbudget alerts
- Near-limit warnings (85%)
- Upcoming bills/subscriptions

### ✅ Multi-format Input
- Manual expense entry
- Natural language processing
- Receipt image parsing

### ✅ Flexible Filtering
- By month, category, date
- Today's spending
- Date range filtering

### ✅ Financial Insights
- Category breakdown pie charts
- Monthly trends
- Average daily spending
- Highest spending category

### ✅ Dark Mode Support
- All pages support light/dark themes
- Tailwind dark: prefix

---

## 📱 UI Components

### Shared Components Used
- **Card** - Container for sections
- **Input** - Text/number/date fields
- **Button** - Action buttons
- **ProgressBar** - Budget utilization
- **CircularProgress** - Goal progress visualization
- **EmptyState** - No data messaging

### Icons Used
- `Plus` - Add action
- `Trash2` - Delete action
- `Edit2` - Edit action
- `Check` - Mark complete
- `ArrowLeft` - Back navigation
- `Brain` - AI mode toggle
- `Receipt` - Upload receipt
- `Send` - Submit text
- `Bell` - Notifications

---

## 🔒 Security & Access Control

- All endpoints require authentication via `req.user.id`
- User data is isolated (scoped to user_id)
- Middleware validation on required fields
- No cross-user data access

---

## 📈 Future Enhancement Opportunities

1. **Recurring Expense Suggestions** - Based on history
2. **Budget Recommendations** - ML-powered suggestions
3. **Tax Category Tags** - For tax preparation
4. **Multi-currency Support** - Beyond BDT
5. **Investment Tracking** - Beyond expenses
6. **Financial Reports** - PDF export
7. **Budget Alerts** - Email/SMS notifications
8. **Expense Forecasting** - Predict future spending
9. **Sharing & Family Budgets** - Collaborative tracking
10. **Integration with Banks** - Auto-sync transactions

---

## 🎨 Currency & Formatting

**Current Settings:**
- Currency: Bangladeshi Taka (BDT) for display
- Formatter: `Intl.NumberFormat` with 'en-BD' locale
- US Dollar for some AI-powered sections

---

## 📊 Summary of All Finance Pages

| Page | Route | Purpose | Key Features |
|------|-------|---------|--------------|
| Finance (Dashboard) | `/finance` | Main overview | Income, expenses, charts, goals |
| Expenses | `/finance/expenses` | Detailed tracking | Add, filter, delete expenses |
| Budget | `/finance/budget` | Limit management | Set, edit, visualize budgets |
| Bills | `/finance/bills` | Reminders | Add, mark paid, track overdue |
| AI Expenses | `/finance/ai-expenses` | Smart capture | Text & receipt OCR parsing |

---

## 🚀 Getting Started with Finance Features

1. **Dashboard** - Start at `/finance` to see overview
2. **Add First Expense** - Click "Add Transaction" button
3. **Set Budget** - Go to Budget page and create limits
4. **Track Bills** - Add upcoming bills for reminders
5. **Try AI** - Use text/receipt capture for speed

