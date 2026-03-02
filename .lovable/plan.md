


## Plan: Redesign Customer Section with Inline Spreadsheet-Style Entry

### Overview
Replace the current subcategory filter chips + popup sheet approach in the Customer accordion with an inline, spreadsheet-like entry system. Each row has a type dropdown as the first column, and subsequent columns change dynamically based on the selected type.

### Phase 1: New Component — `CustomerInlineEntry` ✅ DONE

Create `src/components/today/CustomerInlineEntry.tsx` that replaces `CategoryTransactionList` for the customer category.

**Layout:**
- Top-right corner: "+ Add Customer" button (opens the existing customer add from sidebar)
- Below: List of existing transactions displayed as compact rows (like an Excel sheet) with edit/delete
- Bottom: New entry row with dynamic columns

**Dynamic Column Logic per Type:**

| Type | Col 2 | Col 3 | Col 4 | Col 5 | Col 6 | Col 7 |
|------|-------|-------|-------|-------|-------|-------|
| **Sale** | Bill # (auto, editable) | Customer search | Amount | Payment modes (multi) | From Advance | Due |
| **Sales Return** | Bill search (by #/name/phone) | Amount | Payment/Adjust mode | Add bill items btn | — | — |
| **Balance Payment** | Search bill by #/name/phone → show due bills with tick select | Payment modes | Balance | — | — | — |
| **Customer Advance** | Customer search | Amount | Payment modes | — | — | — |

**Key behaviors:**
- Tab key moves to next column; Enter saves the row and auto-creates a new empty row
- Mobile keyboard shows "Next" button via `enterkeyhint="next"` and `inputMode`
- Sale & Sales Return rows include an "Add Bill" button that expands the existing `SaleBillItemsEntry` inline below the row
- Customer name/phone is mandatory when advance is used, balance is paid, or due exists
- When advance is available and customer is selected in Sale, show advance amount and auto-add to payment total
- Due amount auto-saves to customer ledger and creates due bill record

### Phase 2: Modify `CategoryTransactionList` & `TodayPage` ✅ DONE

- In `TodayPage.tsx`, when `categoryId === 'customer'`, render `CustomerInlineEntry` instead of `CategoryTransactionList`
- Pass `transactions`, `selectedDate`, and handlers for add/edit/delete
- Remove the subcategory chip filter for customer (no longer needed)

### Phase 3: Balance Payment — Multi-Bill Selection ✅ DONE

- When "Balance Payment" is selected and customer is searched, fetch all due bills for that customer
- Display as a checkbox list showing bill number, date, due amount
- Allow ticking multiple bills — payment fills first bill's due, overflow carries to next
- Payment mode selector with multi-mode support (cash + upi split)

### Phase 4: Transaction Display as Spreadsheet Rows ✅ DONE

- Existing customer transactions for the day shown as compact horizontal rows matching the column structure
- Each row has an edit icon (pencil) and delete icon (trash) on the right
- Clicking edit makes the row editable inline

### Technical Details

**Files to create:**
- `src/components/today/CustomerInlineEntry.tsx` — main new component

**Files to modify:**
- `src/pages/TodayPage.tsx` — route customer category to new component
- `src/components/today/CategoryAccordion.tsx` — add customer summary details (total sale, return, balance paid, advance)

**Reused existing code:**
- `CustomerSearchInput` for customer name/phone search
- `SaleBillItemsEntry` for bill item entry (manual + OCR capture/upload)
- `generateBillNumber` logic from `AddTransactionSheet`
- `saveBillToSupabase`, `updateCustomerBalance`, `deductFromBatch` from `useSupabaseData`
- `getDueBillsForCustomer` for balance payment bill selection

**No database changes needed** — all required tables and columns already exist.
