

## Plan: Major Restructuring of Drawer, Home, Exchange, Purchase, Expense + Sidebar Cleanup

This is a large change touching 8+ files. Here's the breakdown:

---

### 1. Drawer Redesign (`DrawerAccordionContent.tsx`)

**New structure — show 5 rows:**
- **Cash**: Opening (Coin + Note, editable, auto-filled from prev day closing), Closing (manual Coin + Note count), System Cash, Error highlight
- **UPI**: Opening = 0 always, system-calculated balance
- **Customer Advance**: Live total from `customers.advance_balance` sum
- **Customer Due**: Live total from `customers.due_balance` sum  
- **Supplier Due**: Live total from `suppliers.balance` sum

Opening: Coin and Note (rename "cash" to "Note" for Indian banknotes). Remove "From Home" from opening (that moves to Home section). Cash = Coin + Note.

Closing: Manual count of Coin + Note. Compare (Coin + Note) vs system cash. If equal → green "0 Error". If not → red highlight with difference.

Remove Bank from drawer entirely. Remove homeAdvance from opening.

### 2. Home Section Redesign (`CategoryTransactionList.tsx` or new component)

Replace credit/debit with:
- **Dropdown 1**: "To Owner" / "From Owner" (cash only)
- **Dropdown 2**: Category (with "+ Add Category" button) — e.g., Advance, Closing, Bank, Chitty, Other
- **Column**: Details (text)
- **Column**: Amount (cash only, no UPI)

Home transactions affect cash in drawer: "From Owner" adds cash, "To Owner" subtracts cash.

Need a new table or reuse existing for home categories. Will create `home_categories` table.

### 3. Exchange Section Redesign

Simple two options only:
- Dropdown: "UPI to Cash" or "Cash to UPI"
- Amount column
- UPI to Cash: increase cash, decrease UPI
- Cash to UPI: decrease cash, increase UPI

### 4. Purchase Section Changes (`PurchaseInlineEntry.tsx`)

- **Bill A/B/C**: Amount only (no payment modes). Bills are credit purchases — they only add to supplier due.
- **Return A/B**: Amount only. Subtract from supplier due.
- **Bill C (N/G)**: Does NOT affect supplier due. Reports only.
- **Payment**: Has payment modes (cash/UPI). Reduces supplier due.
- **Delivered**: Select bill number for which bill was delivered. Link delivery date to bill.
- **Expenses**: Amount + details + payment modes (cash/UPI).

### 5. Expense Section

- "+ Add Category" button in corner
- Selection: category dropdown (from `expense_categories` table)
- Details text field
- Payment modes (cash + UPI)

### 6. Sale Overpayment Give-Back

In `CustomerInlineEntry.tsx`, when customer overpays, add give-back option with multiple payment modes.

### 7. Sidebar Cleanup

Remove these items from sidebar: Exchange, Customer, Customer Advance, Balance Paid, Employee, Supplier, Purchase.

Keep: Today, All Date, Bill, Items & Inventory, Commission, Reports, Settings, Home (remove if merged), Expenses (remove if merged), Customers (keep for master data).

**Final sidebar**: Today, All Date, Bill, Customers, Items & Inventory, Reports, Commission, Settings.

### 8. Summary Calculation Updates (`useTransactions.ts`)

- Home: only affects cash (not UPI)
- Purchase bills: no cash/UPI effect (amount only, adds to supplier due)
- Purchase payment/expenses: affects cash/UPI
- Exchange: simple cash↔UPI swap

---

### Files to Create:
- None (reuse existing components)

### Files to Modify:
1. `src/components/today/DrawerAccordionContent.tsx` — complete rewrite
2. `src/components/today/CategoryTransactionList.tsx` — for home/exchange/expense inline entry
3. `src/components/today/PurchaseInlineEntry.tsx` — remove payment from bills, add delivered logic
4. `src/components/today/CustomerInlineEntry.tsx` — add overpayment give-back
5. `src/components/today/EmployeeInlineEntry.tsx` — minor (add category button)
6. `src/components/today/CategoryAccordion.tsx` — update drawer summary display
7. `src/pages/TodayPage.tsx` — wire new home/exchange/expense inline components
8. `src/components/layout/Sidebar.tsx` — remove 7 menu items
9. `src/hooks/useTransactions.ts` — fix summary calculations (home=cash only, purchase bills=no payment)
10. `src/types/index.ts` — update HomeType, add home categories
11. `src/App.tsx` — remove unused routes

### Database Migration:
- Create `home_categories` table (id, name, created_at)
- Add `home_category_id` column to transactions table
- Add `delivered_date` column to bills table

