import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import AllDatesPage from "./pages/AllDatesPage";
import ItemsPage from "./pages/ItemsPage";
import ReportsPage from "./pages/ReportsPage";
import BillsPage from "./pages/BillsPage";
import CustomerAdvancePage from "./pages/CustomerAdvancePage";
import BalancePaidPage from "./pages/BalancePaidPage";
import PurchasePage from "./pages/PurchasePage";
import SuppliersPage from "./pages/SuppliersPage";
import EmployeesPage from "./pages/EmployeesPage";
import CommissionPage from "./pages/CommissionPage";
import ExchangePage from "./pages/ExchangePage";
import ExpensesPage from "./pages/ExpensesPage";
import HomePage from "./pages/HomePage";
import SettingsPage from "./pages/SettingsPage";
import CustomersPage from "./pages/CustomersPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/all-dates" element={<AllDatesPage />} />
          <Route path="/bills" element={<BillsPage />} />
          <Route path="/customer-advance" element={<CustomerAdvancePage />} />
          <Route path="/balance-paid" element={<BalancePaidPage />} />
          <Route path="/purchase" element={<PurchasePage />} />
          <Route path="/items" element={<ItemsPage />} />
          <Route path="/suppliers" element={<SuppliersPage />} />
          <Route path="/employees" element={<EmployeesPage />} />
          <Route path="/commission" element={<CommissionPage />} />
          <Route path="/exchange" element={<ExchangePage />} />
          <Route path="/expenses" element={<ExpensesPage />} />
          <Route path="/home" element={<HomePage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/customers" element={<CustomersPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
