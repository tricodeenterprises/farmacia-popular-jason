import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { PWAInstallPrompt } from "@/components/PWAInstallPrompt";
import BackupLockOverlay from "@/components/BackupLockOverlay";
import InactivityWarning from "@/components/InactivityWarning";
import { useAutoBackup } from "@/hooks/useAutoBackup";
import { supabase } from "@/integrations/supabase/client";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import AdminConsulta from "./pages/AdminConsulta";
import GerenciarUsuarios from "./pages/GerenciarUsuarios";
import GerenciarClientes from "./pages/GerenciarClientes";
import ClienteProfile from "./pages/ClienteProfile";
import AuditLogs from "./pages/AuditLogs";
import SystemMap from "./pages/SystemMap";
import Configuracoes from "./pages/Configuracoes";
import Dispensacoes from "./pages/Dispensacoes";
import Relatorios from "./pages/Relatorios";
import Backup from "./pages/Backup";
import InspectorDashboard from "./pages/InspectorDashboard";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

type Role = "master" | "operador" | "chefe" | "inspetor";

function LoadingScreen() {
  return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Carregando...</div>;
}

function ProtectedRoute({ children, allowedRoles }: { children: ReactNode; allowedRoles?: Role[] }) {
  const { user, loading, effectiveRole, profileReady } = useAuth();

  if (loading || (user && !profileReady)) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;

  const role = effectiveRole as Role;
  if (allowedRoles && !allowedRoles.includes(role)) {
    const fallback = role === "chefe" || role === "inspetor" ? "/admin/auditoria" : "/atendimento";
    return <Navigate to={fallback} replace />;
  }

  return <>{children}</>;
}

function PublicRoute({ children }: { children: ReactNode }) {
  const { user, loading, effectiveRole, profileReady } = useAuth();

  if (loading || (user && !profileReady)) return <LoadingScreen />;
  if (user && ((effectiveRole as string) === "chefe" || (effectiveRole as string) === "inspetor")) return <Navigate to="/admin/auditoria" replace />;
  if (user) return <Navigate to="/atendimento" replace />;

  return <>{children}</>;
}


function toLocalDateKey(value: string | null) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-CA");
}

function BackupRequiredGate() {
  const { user, loading, profileReady } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (loading || (user && !profileReady)) return;
    if (!user || location.pathname === "/login") return;

    let alive = true;
    const checkDailyBackup = async () => {
      const { data } = await supabase
        .from("configuracoes")
        .select("valor")
        .eq("chave", "ultimo_backup_completo")
        .maybeSingle();

      if (!alive) return;
      const today = new Date().toLocaleDateString("en-CA");
      const lastBackupDay = toLocalDateKey(data?.valor || null);
      const backupOk = lastBackupDay === today;
      setChecked(true);

      if (!backupOk && location.pathname !== "/backup") {
        navigate("/backup", { replace: true, state: { motivo: "backup_diario_obrigatorio" } });
      }
    };

    checkDailyBackup();
    const interval = window.setInterval(checkDailyBackup, 30000);
    return () => {
      alive = false;
      window.clearInterval(interval);
    };
  }, [user, loading, profileReady, location.pathname, navigate]);

  if (!checked) return null;
  return null;
}

function UIAuditTracker() {
  const { user } = useAuth();
  const location = useLocation();
  const lastLogRef = useRef("");

  useEffect(() => {
    if (!user) return;
    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const actionable = target?.closest?.("button,a,[role='button']") as HTMLElement | null;
      if (!actionable) return;
      const rawLabel = actionable.getAttribute("aria-label") || actionable.textContent || actionable.getAttribute("title") || "ação sem rótulo";
      const label = rawLabel.replace(/\s+/g, " ").trim().slice(0, 160) || "ação sem rótulo";
      const key = `${location.pathname}|${label}|${Math.floor(Date.now() / 750)}`;
      if (lastLogRef.current === key) return;
      lastLogRef.current = key;

      void supabase.from("logs").insert({
        user_id: user.id,
        acao: "ui_click",
        detalhes: {
          label,
          rota: location.pathname,
          elemento: actionable.tagName.toLowerCase(),
          id: actionable.id || null,
          titulo: actionable.getAttribute("title"),
          aria_label: actionable.getAttribute("aria-label"),
        },
      });
    };

    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [user, location.pathname]);

  return null;
}

function AutoBackupRunner() {
  useAutoBackup();
  return null;
}

function LegacyClienteRedirect() {
  const { id } = useParams();
  return <Navigate to={id ? `/pacientes/${id}` : "/pacientes"} replace />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <PWAInstallPrompt />
          {/* <BackupLockOverlay /> removido a pedido do usuário */}
          <InactivityWarning />
          <BackupRequiredGate />
          <UIAuditTracker />
          <AutoBackupRunner />
          <Routes>
            <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />

            <Route path="/" element={<Navigate to="/atendimento" replace />} />
            <Route path="/inicio" element={<Navigate to="/atendimento" replace />} />
            <Route path="/atendimento" element={<ProtectedRoute allowedRoles={["master", "operador", "chefe", "inspetor"]}><Dashboard /></ProtectedRoute>} />
            <Route path="/consulta" element={<Navigate to="/atendimento" replace />} />
            <Route path="/busca" element={<ProtectedRoute allowedRoles={["master", "operador", "chefe", "inspetor"]}><AdminConsulta /></ProtectedRoute>} />

            <Route path="/pacientes" element={<ProtectedRoute allowedRoles={["master"]}><GerenciarClientes /></ProtectedRoute>} />
            <Route path="/clientes" element={<Navigate to="/pacientes" replace />} />
            <Route path="/pacientes/:id" element={<ProtectedRoute allowedRoles={["master", "operador", "chefe", "inspetor"]}><ClienteProfile /></ProtectedRoute>} />
            <Route path="/cliente/:id" element={<LegacyClienteRedirect />} />
            <Route path="/pacientes/:id/ciclos" element={<ProtectedRoute allowedRoles={["master", "operador", "chefe", "inspetor"]}><ClienteProfile /></ProtectedRoute>} />
            <Route path="/pacientes/:id/dispensar" element={<ProtectedRoute allowedRoles={["master", "operador", "chefe", "inspetor"]}><ClienteProfile /></ProtectedRoute>} />
            <Route path="/pacientes/:id/documentos" element={<ProtectedRoute allowedRoles={["master", "operador", "chefe", "inspetor"]}><ClienteProfile /></ProtectedRoute>} />

            <Route path="/dispensacoes" element={<ProtectedRoute allowedRoles={["master", "operador", "chefe", "inspetor"]}><Dispensacoes /></ProtectedRoute>} />
            <Route path="/comprovantes" element={<ProtectedRoute allowedRoles={["master", "operador", "chefe", "inspetor"]}><Dispensacoes /></ProtectedRoute>} />
            <Route path="/relatorios" element={<ProtectedRoute allowedRoles={["master", "operador", "chefe", "inspetor"]}><Relatorios /></ProtectedRoute>} />
            <Route path="/backup" element={<ProtectedRoute allowedRoles={["master", "operador", "chefe", "inspetor"]}><Backup /></ProtectedRoute>} />

            <Route path="/admin/usuarios" element={<ProtectedRoute allowedRoles={["master"]}><GerenciarUsuarios /></ProtectedRoute>} />
            <Route path="/usuarios" element={<Navigate to="/admin/usuarios" replace />} />
            <Route path="/admin/auditoria" element={<ProtectedRoute allowedRoles={["chefe", "inspetor", "master"]}><InspectorDashboard /></ProtectedRoute>} />
            <Route path="/inspetor" element={<Navigate to="/admin/auditoria" replace />} />
            <Route path="/admin/logs" element={<ProtectedRoute allowedRoles={["master"]}><AuditLogs /></ProtectedRoute>} />
            <Route path="/logs" element={<Navigate to="/admin/logs" replace />} />
            <Route path="/admin/configuracoes" element={<ProtectedRoute allowedRoles={["master"]}><Configuracoes /></ProtectedRoute>} />
            <Route path="/configuracoes" element={<Navigate to="/admin/configuracoes" replace />} />
            <Route path="/admin/mapa-sistema" element={<ProtectedRoute allowedRoles={["master"]}><SystemMap /></ProtectedRoute>} />
            <Route path="/system-map" element={<Navigate to="/admin/mapa-sistema" replace />} />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
