import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';

const fmtINR = (n: number) => `₹${Math.abs(n).toLocaleString('en-IN')}`;

function billTypeLabel(bt: string | null) {
  if (!bt) return '';
  if (bt === 'g_bill') return 'A';
  if (bt === 'n_bill') return 'B';
  return 'C';
}

export function generateDetailedDailyPDF(date: Date, txns: any[], opening: any, closing: any) {
  const doc = new jsPDF();
  const pw = doc.internal.pageSize.getWidth();
  
  doc.setFontSize(18);
  doc.text('Daily Report', pw / 2, 18, { align: 'center' });
  doc.setFontSize(11);
  doc.text(format(date, 'EEEE, MMMM d, yyyy'), pw / 2, 25, { align: 'center' });

  // Summary
  const sections = ['sale', 'purchase', 'expenses', 'employee', 'home', 'exchange'];
  const labels: Record<string, string> = { sale: 'Sales', purchase: 'Purchase', expenses: 'Expenses', employee: 'Employee', home: 'Home', exchange: 'Exchange' };
  
  const summaryRows = sections.map(s => {
    const sTxns = txns.filter(t => t.section === s);
    const total = sTxns.reduce((sum, t) => sum + Number(t.amount), 0);
    const cash = sTxns.reduce((sum, t) => {
      const p = Array.isArray(t.payments) ? t.payments : [];
      return sum + p.filter((x: any) => x.mode === 'cash').reduce((s2: number, x: any) => s2 + Number(x.amount), 0);
    }, 0);
    const upi = sTxns.reduce((sum, t) => {
      const p = Array.isArray(t.payments) ? t.payments : [];
      return sum + p.filter((x: any) => x.mode === 'upi').reduce((s2: number, x: any) => s2 + Number(x.amount), 0);
    }, 0);
    const due = sTxns.reduce((sum, t) => sum + (Number(t.due) || 0), 0);
    return [labels[s], sTxns.length.toString(), fmtINR(total), fmtINR(cash), fmtINR(upi), due > 0 ? fmtINR(due) : '-'];
  }).filter(r => r[1] !== '0');

  autoTable(doc, {
    startY: 32,
    head: [['Section', 'Count', 'Total', 'Cash', 'UPI', 'Due']],
    body: summaryRows,
    theme: 'striped',
    headStyles: { fillColor: [66, 66, 66] },
  });

  // Drawer info
  let y = (doc as any).lastAutoTable.finalY + 10;
  if (opening || closing) {
    doc.setFontSize(12);
    doc.text('Drawer', 14, y);
    y += 5;
    const drawerRows: string[][] = [];
    if (opening) {
      drawerRows.push(['Opening Cash', fmtINR(Number(opening.shop_coin || 0) + Number(opening.shop_cash || 0))]);
    }
    if (closing) {
      drawerRows.push(['System Cash', fmtINR(Number(closing.system_cash))]);
      drawerRows.push(['Manual Count', fmtINR(Number(closing.manual_coin) + Number(closing.manual_cash))]);
      drawerRows.push(['Difference', fmtINR(Number(closing.difference))]);
    }
    autoTable(doc, { startY: y, body: drawerRows, theme: 'plain' });
    y = (doc as any).lastAutoTable.finalY + 10;
  }

  // All transactions detailed
  doc.setFontSize(12);
  doc.text('All Transactions', 14, y);
  y += 5;

  const txnRows = txns.map(t => {
    const payments = Array.isArray(t.payments) ? t.payments : [];
    const payStr = payments.map((p: any) => `${p.mode}: ${fmtINR(Number(p.amount))}`).join(', ');
    const bt = billTypeLabel(t.bill_type);
    return [
      t.type.replace(/_/g, ' '),
      t.customer_name || t.supplier_name || t.reference || '-',
      t.bill_number || '-',
      bt ? `[${bt}]` : '-',
      fmtINR(Number(t.amount)),
      payStr,
      t.due > 0 ? fmtINR(Number(t.due)) : '-',
    ];
  });

  autoTable(doc, {
    startY: y,
    head: [['Type', 'Name', 'Bill#', 'Bill Type', 'Amount', 'Payment', 'Due']],
    body: txnRows,
    theme: 'striped',
    headStyles: { fillColor: [66, 66, 66] },
    styles: { fontSize: 7 },
    columnStyles: { 5: { cellWidth: 40 } },
  });

  doc.save(`Daily_Report_${format(date, 'yyyy-MM-dd')}.pdf`);
}

export function generateFullMonthlyPDF(month: Date, txns: any[]) {
  const doc = new jsPDF();
  const pw = doc.internal.pageSize.getWidth();

  doc.setFontSize(18);
  doc.text('MONTHLY REPORT', pw / 2, 18, { align: 'center' });
  doc.setFontSize(11);
  doc.text(format(month, 'MMMM yyyy'), pw / 2, 25, { align: 'center' });

  const sum = (arr: any[]) => arr.reduce((s, t) => s + Number(t.amount), 0);
  const cashSum = (arr: any[]) => arr.reduce((s, t) => {
    const p = Array.isArray(t.payments) ? t.payments : [];
    return s + p.filter((x: any) => x.mode === 'cash').reduce((s2: number, x: any) => s2 + Number(x.amount), 0);
  }, 0);
  const upiSum = (arr: any[]) => arr.reduce((s, t) => {
    const p = Array.isArray(t.payments) ? t.payments : [];
    return s + p.filter((x: any) => x.mode === 'upi').reduce((s2: number, x: any) => s2 + Number(x.amount), 0);
  }, 0);

  const sales = txns.filter(t => t.type === 'sale');
  const salesReturn = txns.filter(t => t.type === 'sales_return');
  const balancePaid = txns.filter(t => t.type === 'balance_paid');
  const custAdv = txns.filter(t => t.type === 'customer_advance');
  const billA = txns.filter(t => t.type === 'purchase_bill' && t.bill_type === 'g_bill');
  const billB = txns.filter(t => t.type === 'purchase_bill' && t.bill_type === 'n_bill');
  const billC = txns.filter(t => t.type === 'purchase_bill' && t.bill_type === 'ng_bill');
  const retA = txns.filter(t => t.type === 'purchase_return' && t.bill_type === 'g_bill');
  const retB = txns.filter(t => t.type === 'purchase_return' && t.bill_type === 'n_bill');
  const retC = txns.filter(t => t.type === 'purchase_return' && t.bill_type === 'ng_bill');
  const purchPaid = txns.filter(t => t.type === 'purchase_payment');
  const purchExp = txns.filter(t => t.type === 'purchase_expenses');
  const empTxns = txns.filter(t => t.section === 'employee');
  const expTxns = txns.filter(t => t.section === 'expenses');

  const netBillA = sum(billA) - sum(retA) + sum(billC) - sum(retC);
  const netBillB = sum(billB) - sum(retB) - sum(billC) + sum(retC);

  // Credits & Debits table
  const rows = [
    ['SALES', fmtINR(sum(sales))],
    ['RETURN', fmtINR(sum(salesReturn))],
    ['BALANCE PAID', fmtINR(sum(balancePaid))],
    ['CUSTOMER ADVANCE', fmtINR(sum(custAdv))],
    ['', ''],
    ['BILL A', fmtINR(sum(billA))],
    ['BILL B', fmtINR(sum(billB))],
    ['BILL C', fmtINR(sum(billC))],
    ['RETURN A', `-${fmtINR(sum(retA))}`],
    ['RETURN B', `-${fmtINR(sum(retB))}`],
    ['RETURN C', `-${fmtINR(sum(retC))}`],
    ['NET BILL A', fmtINR(netBillA)],
    ['NET BILL B', fmtINR(netBillB)],
    ['PURCHASE PAID', fmtINR(sum(purchPaid))],
    ['PURCHASE EXPENSE', fmtINR(sum(purchExp))],
    ['', ''],
    ['TOTAL SALARY PAID', fmtINR(sum(empTxns))],
    ['TO EXPENSES', fmtINR(sum(expTxns))],
  ];

  autoTable(doc, {
    startY: 32,
    head: [['CREDITS AND DEBITS', 'Amount']],
    body: rows,
    theme: 'striped',
    headStyles: { fillColor: [33, 33, 33] },
  });

  // Cash/UPI breakdown
  let y = (doc as any).lastAutoTable.finalY + 10;
  doc.setFontSize(12);
  doc.text('CASH / UPI BREAKDOWN', pw / 2, y, { align: 'center' });
  y += 5;

  const creditCash = cashSum(sales) + cashSum(balancePaid) + cashSum(custAdv);
  const creditUpi = upiSum(sales) + upiSum(balancePaid) + upiSum(custAdv);
  const debitCash = cashSum(salesReturn) + cashSum(purchPaid) + cashSum(purchExp) + cashSum(empTxns) + cashSum(expTxns);
  const debitUpi = upiSum(salesReturn) + upiSum(purchPaid) + upiSum(purchExp) + upiSum(empTxns) + upiSum(expTxns);

  const modeRows = [
    ['CREDIT', '', ''],
    ['Sale', fmtINR(cashSum(sales)), fmtINR(upiSum(sales))],
    ['Balance Paid', fmtINR(cashSum(balancePaid)), fmtINR(upiSum(balancePaid))],
    ['Customer Advance', fmtINR(cashSum(custAdv)), fmtINR(upiSum(custAdv))],
    ['Total Credit', fmtINR(creditCash), fmtINR(creditUpi)],
    ['', '', ''],
    ['DEBIT', '', ''],
    ['Sales Return', fmtINR(cashSum(salesReturn)), fmtINR(upiSum(salesReturn))],
    ['Supplier Paid', fmtINR(cashSum(purchPaid)), fmtINR(upiSum(purchPaid))],
    ['Supplier Exp', fmtINR(cashSum(purchExp)), fmtINR(upiSum(purchExp))],
    ['Employee', fmtINR(cashSum(empTxns)), fmtINR(upiSum(empTxns))],
    ['Expenses', fmtINR(cashSum(expTxns)), fmtINR(upiSum(expTxns))],
    ['Total Debit', fmtINR(debitCash), fmtINR(debitUpi)],
    ['', '', ''],
    ['NET AMOUNT', fmtINR(creditCash - debitCash), fmtINR(creditUpi - debitUpi)],
  ];

  autoTable(doc, {
    startY: y,
    head: [['', 'CASH', 'UPI']],
    body: modeRows,
    theme: 'striped',
    headStyles: { fillColor: [33, 33, 33] },
  });

  doc.save(`Monthly_Report_${format(month, 'yyyy-MM')}.pdf`);
}
