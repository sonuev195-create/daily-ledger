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
import PlaceholderPage from "./pages/PlaceholderPage";
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
          <Route path="/customer-advance" element={<PlaceholderPage title="Customer Advance" />} />
          <Route path="/balance-paid" element={<PlaceholderPage title="Balance Paid" />} />
          <Route path="/purchase" element={<PlaceholderPage title="Purchase" />} />
          <Route path="/items" element={<ItemsPage />} />
          <Route path="/suppliers" element={<PlaceholderPage title="Suppliers" />} />
          <Route path="/employees" element={<PlaceholderPage title="Employees" />} />
          <Route path="/commission" element={<PlaceholderPage title="Commission" />} />
          <Route path="/exchange" element={<PlaceholderPage title="Exchange" />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
