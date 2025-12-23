import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Transaction, Bill, Item, Customer, Supplier, DrawerOpening, DrawerClosing } from '@/types';
import { format } from 'date-fns';

const formatCurrency = (amount: number) => `₹${amount.toLocaleString('en-IN')}`;

export function generateDailyReport(
  date: Date,
  transactions: Transaction[],
  opening?: DrawerOpening,
  closing?: DrawerClosing
) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  
  // Title
  doc.setFontSize(20);
  doc.text('Daily Report', pageWidth / 2, 20, { align: 'center' });
  doc.setFontSize(12);
  doc.text(format(date, 'MMMM d, yyyy'), pageWidth / 2, 28, { align: 'center' });
  
  // Summary
  let yPos = 40;
  const saleTransactions = transactions.filter(t => t.section === 'sale' && t.type !== 'sales_return');
  const totalSales = saleTransactions.reduce((sum, t) => sum + t.amount, 0);
  const expenseTransactions = transactions.filter(t => t.section === 'expenses');
  const totalExpenses = expenseTransactions.reduce((sum, t) => sum + t.amount, 0);
  
  doc.setFontSize(14);
  doc.text('Summary', 14, yPos);
  yPos += 10;
  
  autoTable(doc, {
    startY: yPos,
    head: [['Category', 'Amount']],
    body: [
      ['Total Sales', formatCurrency(totalSales)],
      ['Total Expenses', formatCurrency(totalExpenses)],
      ['Net', formatCurrency(totalSales - totalExpenses)],
      ['Transactions', transactions.length.toString()],
    ],
    theme: 'striped',
  });
  
  // Transactions Table
  yPos = (doc as any).lastAutoTable.finalY + 15;
  doc.setFontSize(14);
  doc.text('Transactions', 14, yPos);
  yPos += 10;
  
  autoTable(doc, {
    startY: yPos,
    head: [['Section', 'Type', 'Amount', 'Payment', 'Reference']],
    body: transactions.map(t => [
      t.section.charAt(0).toUpperCase() + t.section.slice(1),
      t.type.replace(/_/g, ' '),
      formatCurrency(t.amount),
      t.payments.map(p => `${p.mode}: ${formatCurrency(p.amount)}`).join(', '),
      t.customerName || t.supplierName || t.reference || '-',
    ]),
    theme: 'striped',
  });
  
  return doc;
}

export function generateBillPDF(bill: Bill, transaction?: Transaction) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  
  // Header
  doc.setFontSize(20);
  doc.text('BILL', pageWidth / 2, 20, { align: 'center' });
  
  // Bill Info
  doc.setFontSize(10);
  doc.text(`Bill No: ${bill.billNumber || bill.id.slice(0, 8)}`, 14, 35);
  doc.text(`Date: ${format(new Date(bill.createdAt), 'MMM d, yyyy')}`, pageWidth - 14, 35, { align: 'right' });
  
  if (bill.customerName) {
    doc.text(`Customer: ${bill.customerName}`, 14, 42);
  }
  if (bill.supplierName) {
    doc.text(`Supplier: ${bill.supplierName}`, 14, 42);
  }
  
  // Items Table
  autoTable(doc, {
    startY: 50,
    head: [['#', 'Item Name', 'Primary Qty', 'Secondary Qty', 'Rate', 'Total']],
    body: bill.items.map((item, idx) => [
      (idx + 1).toString(),
      item.itemName,
      item.primaryQuantity.toString(),
      item.secondaryQuantity.toString(),
      formatCurrency(item.rate),
      formatCurrency(item.totalAmount),
    ]),
    theme: 'striped',
  });
  
  // Total
  const finalY = (doc as any).lastAutoTable.finalY + 10;
  doc.setFontSize(14);
  doc.text(`Total: ${formatCurrency(bill.totalAmount)}`, pageWidth - 14, finalY, { align: 'right' });
  
  return doc;
}

export function generateInventoryReport(items: Item[]) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  
  doc.setFontSize(20);
  doc.text('Inventory Report', pageWidth / 2, 20, { align: 'center' });
  doc.setFontSize(10);
  doc.text(`Generated: ${format(new Date(), 'MMM d, yyyy HH:mm')}`, pageWidth / 2, 28, { align: 'center' });
  
  const totalValue = items.reduce((sum, item) => sum + item.inventoryValue, 0);
  
  doc.setFontSize(12);
  doc.text(`Total Items: ${items.length}`, 14, 40);
  doc.text(`Total Inventory Value: ${formatCurrency(totalValue)}`, 14, 47);
  
  autoTable(doc, {
    startY: 55,
    head: [['Item Name', 'Primary Qty', 'Secondary Qty', 'Purchase Rate', 'Selling Price', 'Stock Value']],
    body: items.map(item => [
      item.name,
      item.primaryQuantity.toString(),
      item.secondaryQuantity.toString(),
      formatCurrency(item.purchaseRate),
      formatCurrency(item.sellingPrice),
      formatCurrency(item.inventoryValue),
    ]),
    theme: 'striped',
  });
  
  return doc;
}

export function generateCustomerReport(customers: Customer[], transactions: Transaction[]) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  
  doc.setFontSize(20);
  doc.text('Customer Ledger', pageWidth / 2, 20, { align: 'center' });
  
  const totalAdvance = customers.reduce((sum, c) => sum + c.advanceBalance, 0);
  const totalDue = customers.reduce((sum, c) => sum + c.dueBalance, 0);
  
  doc.setFontSize(12);
  doc.text(`Total Customers: ${customers.length}`, 14, 35);
  doc.text(`Total Advance: ${formatCurrency(totalAdvance)}`, 14, 42);
  doc.text(`Total Due: ${formatCurrency(totalDue)}`, 14, 49);
  
  autoTable(doc, {
    startY: 58,
    head: [['Name', 'Phone', 'Advance Balance', 'Due Balance', 'Net']],
    body: customers.map(c => [
      c.name,
      c.phone || '-',
      formatCurrency(c.advanceBalance),
      formatCurrency(c.dueBalance),
      formatCurrency(c.advanceBalance - c.dueBalance),
    ]),
    theme: 'striped',
  });
  
  return doc;
}

export function generateSupplierReport(suppliers: Supplier[]) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  
  doc.setFontSize(20);
  doc.text('Supplier Ledger', pageWidth / 2, 20, { align: 'center' });
  
  const totalBalance = suppliers.reduce((sum, s) => sum + s.balance, 0);
  
  doc.setFontSize(12);
  doc.text(`Total Suppliers: ${suppliers.length}`, 14, 35);
  doc.text(`Total Balance: ${formatCurrency(totalBalance)}`, 14, 42);
  
  autoTable(doc, {
    startY: 50,
    head: [['Name', 'Phone', 'Address', 'Balance']],
    body: suppliers.map(s => [
      s.name,
      s.phone || '-',
      s.address || '-',
      formatCurrency(s.balance),
    ]),
    theme: 'striped',
  });
  
  return doc;
}

export function generateMonthlyReport(
  month: Date,
  transactions: Transaction[]
) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  
  doc.setFontSize(20);
  doc.text('Monthly Report', pageWidth / 2, 20, { align: 'center' });
  doc.setFontSize(12);
  doc.text(format(month, 'MMMM yyyy'), pageWidth / 2, 28, { align: 'center' });
  
  // Calculate totals by section
  const sectionTotals: Record<string, number> = {};
  transactions.forEach(t => {
    sectionTotals[t.section] = (sectionTotals[t.section] || 0) + t.amount;
  });
  
  const totalIn = transactions
    .filter(t => t.section === 'sale' && t.type !== 'sales_return')
    .reduce((sum, t) => sum + t.amount, 0);
  const totalOut = transactions
    .filter(t => ['expenses', 'purchase'].includes(t.section))
    .reduce((sum, t) => sum + t.amount, 0);
  
  autoTable(doc, {
    startY: 40,
    head: [['Category', 'Total Amount', 'Count']],
    body: [
      ['Sales', formatCurrency(sectionTotals['sale'] || 0), transactions.filter(t => t.section === 'sale').length.toString()],
      ['Expenses', formatCurrency(sectionTotals['expenses'] || 0), transactions.filter(t => t.section === 'expenses').length.toString()],
      ['Purchases', formatCurrency(sectionTotals['purchase'] || 0), transactions.filter(t => t.section === 'purchase').length.toString()],
      ['Employee', formatCurrency(sectionTotals['employee'] || 0), transactions.filter(t => t.section === 'employee').length.toString()],
      ['Home', formatCurrency(sectionTotals['home'] || 0), transactions.filter(t => t.section === 'home').length.toString()],
    ],
    theme: 'striped',
  });
  
  const finalY = (doc as any).lastAutoTable.finalY + 15;
  doc.setFontSize(14);
  doc.text(`Total Income: ${formatCurrency(totalIn)}`, 14, finalY);
  doc.text(`Total Expenses: ${formatCurrency(totalOut)}`, 14, finalY + 8);
  doc.text(`Net: ${formatCurrency(totalIn - totalOut)}`, 14, finalY + 16);
  
  return doc;
}

export function generateDrawerReport(
  date: Date,
  opening: DrawerOpening | undefined,
  closing: DrawerClosing | undefined,
  transactions: Transaction[]
) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  
  doc.setFontSize(20);
  doc.text('Drawer Reconciliation', pageWidth / 2, 20, { align: 'center' });
  doc.setFontSize(12);
  doc.text(format(date, 'MMMM d, yyyy'), pageWidth / 2, 28, { align: 'center' });
  
  // Opening
  const openingTotal = opening ? opening.coin + opening.cash + opening.homeAdvance : 0;
  
  autoTable(doc, {
    startY: 40,
    head: [['Opening Drawer', 'Amount']],
    body: [
      ['Coin', formatCurrency(opening?.coin || 0)],
      ['Cash', formatCurrency(opening?.cash || 0)],
      ['Home Advance', formatCurrency(opening?.homeAdvance || 0)],
      ['Total Opening', formatCurrency(openingTotal)],
    ],
    theme: 'striped',
  });
  
  // Calculate system cash
  let cashIn = 0;
  let cashOut = 0;
  transactions.forEach(t => {
    t.payments.forEach(p => {
      if (p.mode === 'cash') {
        if (['sale', 'customer_advance'].includes(t.type)) {
          cashIn += p.amount;
        } else {
          cashOut += p.amount;
        }
      }
    });
  });
  
  const systemCash = openingTotal + cashIn - cashOut;
  const manualTotal = closing ? closing.manualCoin + closing.manualCash + closing.cashToHome : 0;
  const difference = closing ? systemCash - manualTotal : 0;
  
  const finalY = (doc as any).lastAutoTable.finalY + 15;
  
  autoTable(doc, {
    startY: finalY,
    head: [['Closing Drawer', 'Amount']],
    body: [
      ['System Calculated Cash', formatCurrency(systemCash)],
      ['Manual Coin', formatCurrency(closing?.manualCoin || 0)],
      ['Manual Cash', formatCurrency(closing?.manualCash || 0)],
      ['Cash to Home', formatCurrency(closing?.cashToHome || 0)],
      ['Manual Total', formatCurrency(manualTotal)],
      ['Difference', formatCurrency(difference)],
    ],
    theme: 'striped',
  });
  
  return doc;
}

export function downloadPDF(doc: jsPDF, filename: string) {
  doc.save(`${filename}.pdf`);
}
