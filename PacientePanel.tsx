import { useAuth } from "@/hooks/useAuth";
import { useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import logoFarmacia from "@/assets/logo-farmacia.jpg";
import {
  ArrowLeft,
  BarChart3,
  ClipboardList,
  Download,
  Grid2X2,
  Home,
  LayoutDashboard,
  Lock,
  LogOut,
  Menu,
  Settings,
  Shield,
  UserCheck,
  UserSearch,
  Users,
} from "lucide-react";
import FeedbackButton from "./FeedbackButton";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useState } from "react";

interface NavItem {
  label: string;
  shortLabel?: string;
  icon: React.ElementType;
  path: string;
  allowedRoles: string[];
  group: "principal" | "gestao" | "admin";
  description: string;
}

const navItems: NavItem[] = [
  { label: "Atendimento", shortLabel: "Atender", icon: LayoutDashboard, path: "/consulta", allowedRoles: ["master", "operador", "chefe", "inspetor"], group: "principal", description: "Buscar cliente e registrar retirada" },
  { label: "Comprovantes", shortLabel: "Comprov.", icon: ClipboardList, path: "/dispensacoes", allowedRoles: ["master", "operador", "chefe", "inspetor"], group: "principal", description: "Impressão e WhatsApp" },
  { label: "Relatórios", shortLabel: "Relatórios", icon: BarChart3, path: "/relatorios", allowedRoles: ["master", "operador", "chefe", "inspetor"], group: "principal", description: "Ciclos encerrados e pacotes" },
  { label: "Início", icon: Home, path: "/", allowedRoles: ["master", "operador", "chefe", "inspetor"], group: "gestao", description: "Painel inicial" },
  { label: "Clientes", icon: UserCheck, path: "/clientes", allowedRoles: ["master"], group: "gestao", description: "Cadastro completo" },
  { label: "Auditoria", icon: UserSearch, path: "/inspetor", allowedRoles: ["master", "operador", "chefe", "inspetor"], group: "gestao", description: "Conferência operacional" },
  { label: "Salvar Cópia", icon: Download, path: "/backup", allowedRoles: ["master", "operador", "chefe", "inspetor"], group: "gestao", description: "Exportar backup" },
  { label: "Usuários", icon: Users, path: "/usuarios", allowedRoles: ["master"], group: "admin", description: "Acessos do sistema" },
  { label: "Histórico", icon: Shield, path: "/logs", allowedRoles: ["master"], group: "admin", description: "Logs e auditoria" },
  { label: "Ajustes", icon: Settings, path: "/configuracoes", allowedRoles: ["master"], group: "admin", description: "Configurações" },
];

const groupLabels: Record<NavItem["group"], string> = {
  principal: "Uso diário",
  gestao: "Gestão",
  admin: "Administração",
};

interface Props {
  children: React.ReactNode;
  title?: string;
}

export default function AppLayout({ children, title }: Props) {
  const { profile, effectiveRole, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const userRole = effectiveRole as string;
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = async () => {
    await signOut();
    navigate("/login");
  };

  const go = (item: NavItem) => {
    const allowed = item.allowedRoles.includes(userRole);
    if (!allowed) {
      toast.error("Acesso bloqueado para este perfil.");
      return;
    }
    if (item.path === "/backup") toast.warning("Confira se não há atendimento aberto antes do backup.");
    setMenuOpen(false);
    navigate(item.path);
  };

  const bottomNav = navItems.filter((item) => ["/consulta", "/dispensacoes", "/relatorios"].includes(item.path));
  const groups: NavItem["group"][] = ["principal", "gestao", "admin"];

  return (
    <div className="app-shell flex min-h-screen w-full flex-col overflow-x-hidden pb-24 md:pb-6">
      <header className="relative z-20 px-3 pt-3 sm:px-6 sm:pt-4">
        <div className="compact-header rounded-2xl px-3 py-2">
          <div className="flex items-center gap-2">
            <motion.button
              onClick={() => navigate(-1)}
              className="h-10 w-10 shrink-0 rounded-xl bg-muted flex items-center justify-center text-foreground pressable"
              whileTap={{ scale: 0.94 }}
              aria-label="Voltar"
            >
              <ArrowLeft className="h-5 w-5" />
            </motion.button>

            <img src={logoFarmacia} alt="Logo" className="h-10 w-10 shrink-0 rounded-xl object-cover ring-1 ring-border" />

            <div className="min-w-0 flex-1">
              <h1 className="truncate text-base font-black leading-tight text-foreground">{title || "Farmácia Popular"}</h1>
              <p className="truncate text-xs text-muted-foreground">{profile?.nome || "Usuário"} • {userRole}</p>
            </div>

            <FeedbackButton />

            <motion.button
              onClick={() => setMenuOpen(true)}
              className="h-10 w-10 shrink-0 rounded-xl bg-primary text-primary-foreground flex items-center justify-center pressable"
              whileTap={{ scale: 0.94 }}
              aria-label="Menu"
            >
              <Menu className="h-5 w-5" />
            </motion.button>

            <motion.button
              onClick={handleLogout}
              className="hidden sm:flex h-10 w-10 shrink-0 rounded-xl bg-destructive/10 text-destructive border border-destructive/20 items-center justify-center pressable"
              whileTap={{ scale: 0.94 }}
              aria-label="Sair"
            >
              <LogOut className="h-4 w-4" />
            </motion.button>
          </div>
        </div>
      </header>

      <main className="relative z-10 flex-1">{children}</main>

      <nav className="fixed bottom-0 inset-x-0 z-40 px-2 pb-2 safe-area-bottom md:hidden">
        <div className="mobile-bar grid grid-cols-5 gap-1 rounded-2xl p-1.5">
          <button onClick={() => navigate(-1)} className="rounded-xl px-1 py-2 text-muted-foreground flex flex-col items-center gap-1 pressable">
            <ArrowLeft className="h-4 w-4" />
            <span className="text-[10px] font-bold">Voltar</span>
          </button>
          {bottomNav.map((item) => {
            const Icon = item.icon;
            const active = location.pathname === item.path;
            return (
              <button
                key={item.path}
                onClick={() => go(item)}
                className={`rounded-xl px-1 py-2 flex flex-col items-center gap-1 pressable ${active ? "bg-primary text-primary-foreground shadow-lg" : "text-muted-foreground"}`}
              >
                <Icon className="h-4 w-4" />
                <span className="text-[10px] font-bold leading-none">{item.shortLabel}</span>
              </button>
            );
          })}
          <button onClick={() => setMenuOpen(true)} className="rounded-xl px-1 py-2 text-muted-foreground flex flex-col items-center gap-1 pressable">
            <Grid2X2 className="h-4 w-4" />
            <span className="text-[10px] font-bold">Menu</span>
          </button>
        </div>
      </nav>

      <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
        <DialogContent className="max-w-md rounded-2xl p-4">
          <DialogHeader>
            <DialogTitle className="text-xl font-black">Acesso rápido</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {groups.map((group) => (
              <div key={group}>
                <p className="mb-2 px-1 text-[11px] font-black uppercase tracking-[0.16em] text-muted-foreground">{groupLabels[group]}</p>
                <div className="grid grid-cols-2 gap-2">
                  {navItems.filter((item) => item.group === group).map((item) => {
                    const Icon = item.icon;
                    const active = location.pathname === item.path;
                    const allowed = item.allowedRoles.includes(userRole);
                    return (
                      <button
                        key={item.path}
                        onClick={() => go(item)}
                        className={`relative rounded-2xl border p-3 text-left pressable ${
                          !allowed
                            ? "bg-muted/60 text-muted-foreground opacity-60"
                            : active
                              ? "bg-primary text-primary-foreground border-primary shadow-lg"
                              : "bg-white hover:bg-muted"
                        }`}
                      >
                        {!allowed && <Lock className="absolute right-3 top-3 h-3.5 w-3.5" />}
                        <div className={`mb-2 flex h-9 w-9 items-center justify-center rounded-xl ${active ? "bg-white/20" : "bg-muted"}`}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <p className="text-sm font-black">{item.label}</p>
                        <p className={`mt-0.5 text-[11px] leading-snug ${active ? "text-white/75" : "text-muted-foreground"}`}>{item.description}</p>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            <button onClick={handleLogout} className="w-full rounded-2xl border border-destructive/25 bg-destructive/10 p-3 text-sm font-black text-destructive pressable">
              Sair do sistema
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
