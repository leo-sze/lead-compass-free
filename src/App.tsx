import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/Layout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Index from "./pages/Index";
import GoogleSearch from "./pages/GoogleSearch";
import LinkedInSearch from "./pages/LinkedInSearch";
import Leads from "./pages/Leads";
import SettingsPage from "./pages/SettingsPage";
import FindContacts from "./pages/FindContacts";
import PhoneLookup from "./pages/PhoneLookup";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/auth" element={<Auth />} />
          <Route
            path="*"
            element={
              <ProtectedRoute>
                <Layout>
                  <Routes>
                    <Route path="/" element={<Index />} />
                    <Route path="/google-search" element={<GoogleSearch />} />
                    <Route path="/linkedin-search" element={<LinkedInSearch />} />
                    <Route path="/leads" element={<Leads />} />
                    <Route path="/find-contacts" element={<FindContacts />} />
                    <Route path="/phone-lookup" element={<PhoneLookup />} />
                    <Route path="/settings" element={<SettingsPage />} />
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </Layout>
              </ProtectedRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
