import type { ElementType, ReactNode } from "react";
import { useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useLocation, useNavigate } from "react-router-dom";
import logoFarmacia from "@/assets/logo-farmacia.jpg";
import {
  BarChart3,
  ClipboardList,
  DatabaseBackup,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Search,
  Settings,
  ShieldCheck,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import FeedbackButton from "./FeedbackButton";
import { toast } from "sonner";

interface NavItem {
  label: string;
  shortLabel?: string;
  icon: ElementType;
  path: string;
  aliases?: string[];
  allowedRoles: string[];
  group: "operacao" | "gestao" | "admin";
  description: string;
}

const navItems: NavItem[] = [
  {
    label: "Atendimento",
    shortLabel: "Atender",
    icon: LayoutDashboard,
    path: "/atendimento",
    aliases: ["/", "/inicio", "/consulta"],
    allowedRoles: ["master", "operador", "chefe", "inspetor"],
    group: "operacao",
    description: "Busca, cadastro e abertura do paciente",
  },
  {
    label: "Pacientes",
    shortLabel: "Pacientes",
    icon: UserCheck,
    path: "/pacientes",
    aliases: ["/clientes", "/cliente"],
    allowedRoles: ["master"],
    group: "gestao",
    description: "Base completa, filtros e manutenção cadastral",
  },
  {
    label: "Dispensações",
    shortLabel: "Retiradas",
    icon: ClipboardList,
    path: "/dispensacoes",
    aliases: ["/comprovantes"],
    allowedRoles: ["master", "operador", "chefe", "inspetor"],
    group: "operacao",
    description: "Histórico, impressão e envio de comprovantes",
  },
  {
    label: "Relatórios",
    shortLabel: "Relatórios",
    icon: BarChart3,
    path: "/relatorios",
    allowedRoles: ["master", "operador", "chefe", "inspetor"],
    group: "operacao",
    description: "Ciclos encerrados, conferência e exportação",
  },
  {
    label: "Auditoria",
    shortLabel: "Auditoria",
    icon: ShieldCheck,
    path: "/admin/auditoria",
    aliases: ["/inspetor"],
    allowedRoles: ["master", "chefe", "inspetor"],
    group: "gestao",
    description: "Conferência operacional restrita",
  },
  {
    label: "Backup",
    shortLabel: "Backup",
    icon: DatabaseBackup,
    path: "/backup",
    allowedRoles: ["master"],
    group: "gestao",
    description: "Cópias manuais e arquivos de contingência",
  },
  {
    label: "Usuários",
    icon: Users,
    path: "/admin/usuarios",
    aliases: ["/usuarios"],
    allowedRoles: ["master"],
    group: "admin",
    description: "Permissões e contas de acesso",
  },
  {
    label: "Histórico",
    icon: History,
    path: "/admin/logs",
    aliases: ["/logs"],
    allowedRoles: ["master"],
    group: "admin",
    description: "Eventos sensíveis e trilha de auditoria",
  },
  {
    label: "Ajustes",
    icon: Settings,
    path: "/admin/configuracoes",
    aliases: ["/configuracoes", "/system-map"],
    allowedRoles: ["master"],
    group: "admin",
    description: "Parâmetros, mapa e governança do sistema",
  },
];

const groupLabels: Record<NavItem["group"], string> = {
  operacao: "Operação",
  gestao: "Gestão",
  admin: "Administração",
};

interface Props {
  children: ReactNode;
  title?: string;
}

function roleLabel(role: string) {
  if (role === "master") return "Administrador";
  if (role === "chefe") return "Chefe";
  if (role === "inspetor") return "Inspetor";
  return "Operador";
}

function isActive(item: NavItem, pathname: string) {
  if (pathname === item.path) return true;
  if (item.aliases?.some((alias) => pathname === alias || pathname.startsWith(`${alias}/`))) return true;
  return pathname.startsWith(`${item.path}/`);
}

function NavButton({ item, active, compact, onClick }: { item: NavItem; active: boolean; compact?: boolean; onClick: () => void }) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "group w-full rounded-2xl border text-left transition-all",
        compact ? "px-3 py-2.5" : "px-3.5 py-3",
        active
          ? "border-primary/35 bg-primary text-primary-foreground shadow-lg shadow-primary/15"
          : "border-transparent bg-transparent text-muted-foreground hover:border-border hover:bg-secondary/80 hover:text-foreground",
      ].join(" ")}
    >
      <div className="flex items-center gap-3">
        <span className={["flex shrink-0 items-center justify-center rounded-xl", compact ? "h-9 w-9" : "h-10 w-10", active ? "bg-white/18" : "bg-background border border-border/80 group-hover:bg-white"].join(" ")}>
          <Icon className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold">{item.label}</span>
          {!compact && <span className={active ? "block truncate text-[11px] text-white/75" : "block truncate text-[11px] text-muted-foreground"}>{item.description}</span>}
        </span>
      </div>
    </button>
  );
}

export default function AppLayout({ children, title }: Props) {
  const { profile, effectiveRole, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const userRole = effectiveRole as string;

  const visibleGroups = useMemo<NavItem["group"][]>(() => {
    const groups: NavItem["group"][] = ["operacao", "gestao"];
    if (userRole === "master") groups.push("admin");
    return groups;
  }, [userRole]);

  const mobilePrimary = navItems.filter((item) => ["/atendimento", "/dispensacoes", "/relatorios"].includes(item.path));

  const handleLogout = async () => {
    await signOut();
    navigate("/login", { replace: true });
  };

  const handleNavClick = (item: NavItem) => {
    if (!item.allowedRoles.includes(userRole)) {
      toast.error("Acesso restrito para este perfil.");
      return;
    }
    setMenuOpen(false);
    navigate(item.path);
  };

  return (
    <div className="min-h-screen app-shell text-foreground">
      <div className="flex min-h-screen w-full">
        <aside className="hidden lg:flex lg:w-[292px] xl:w-[320px] shrink-0 border-r border-border/80 bg-white/82 backdrop-blur-xl">
          <div className="sticky top-0 flex h-screen w-full flex-col gap-5 p-5">
            <button type="button" onClick={() => navigate("/atendimento")} className="flex items-center gap-3 rounded-3xl border border-border/80 bg-white p-3 text-left shadow-sm">
              <span className="h-12 w-12 shrink-0 overflow-hidden rounded-2xl border border-border bg-secondary">
                <img src={logoFarmacia} alt="Logo" className="h-full w-full object-cover" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-black">Farmácia Popular</span>
                <span className="block truncate text-xs text-muted-foreground">Sistema de atendimento</span>
              </span>
            </button>

            <nav className="flex-1 space-y-5 overflow-y-auto pr-1">
              {visibleGroups.map((group) => {
                const items = navItems.filter((item) => item.group === group && item.allowedRoles.includes(userRole));
                if (items.length === 0) return null;
                return (
                  <section key={group} className="space-y-2">
                    <p className="px-2 text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">{groupLabels[group]}</p>
                    <div className="space-y-1.5">
                      {items.map((item) => (
                        <NavButton key={item.path} item={item} active={isActive(item, location.pathname)} onClick={() => handleNavClick(item)} />
                      ))}
                    </div>
                  </section>
                );
              })}
            </nav>

            <div className="space-y-3 rounded-3xl border border-border/80 bg-secondary/50 p-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary text-primary-foreground text-sm font-black">
                  {(profile?.nome || "U").slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{profile?.nome || "Usuário"}</p>
                  <p className="truncate text-xs text-muted-foreground">{roleLabel(userRole)}</p>
                </div>
              </div>
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <FeedbackButton />
                <button type="button" onClick={handleLogout} className="flex h-10 w-10 items-center justify-center rounded-2xl border border-destructive/20 bg-destructive/10 text-destructive" aria-label="Sair">
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col pb-24 lg:pb-0">
          <header className="sticky top-0 z-40 border-b border-border/75 bg-background/88 px-3 py-3 backdrop-blur-xl sm:px-5 lg:px-8">
            <div className="mx-auto flex w-full max-w-[1680px] items-center gap-3">
              <button type="button" onClick={() => setMenuOpen(true)} className="flex h-11 w-11 items-center justify-center rounded-2xl border border-border bg-white shadow-sm lg:hidden" aria-label="Abrir menu">
                <Menu className="h-5 w-5" />
              </button>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                  <Search className="h-3.5 w-3.5" /> Operação de balcão
                </div>
                <h1 className="truncate text-lg font-black leading-tight sm:text-2xl" style={{ fontFamily: "var(--font-body)" }}>
                  {title || "Painel operacional"}
                </h1>
              </div>
              <div className="hidden items-center gap-3 rounded-2xl border border-border bg-white px-3 py-2 shadow-sm sm:flex">
                <div className="text-right">
                  <p className="max-w-[180px] truncate text-sm font-bold">{profile?.nome || "Usuário"}</p>
                  <p className="text-xs text-muted-foreground">{roleLabel(userRole)}</p>
                </div>
                <button type="button" onClick={handleLogout} className="flex h-9 w-9 items-center justify-center rounded-xl bg-destructive/10 text-destructive" aria-label="Sair">
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            </div>
          </header>

          <main className="flex-1 w-full px-3 py-4 sm:px-5 sm:py-6 lg:px-8">
            <div className="mx-auto w-full max-w-[1680px]">{children}</div>
          </main>
        </div>
      </div>

      <div className="fixed bottom-0 inset-x-0 z-40 border-t border-border/80 bg-white/94 p-2 backdrop-blur-xl lg:hidden safe-area-bottom">
        <div className="grid grid-cols-4 gap-1.5">
          {mobilePrimary.map((item) => {
            const Icon = item.icon;
            const active = isActive(item, location.pathname);
            return (
              <button key={item.path} type="button" onClick={() => handleNavClick(item)} className={active ? "rounded-2xl bg-primary px-2 py-2.5 text-primary-foreground" : "rounded-2xl px-2 py-2.5 text-muted-foreground"}>
                <Icon className="mx-auto h-4 w-4" />
                <span className="mt-1 block truncate text-[11px] font-bold">{item.shortLabel || item.label}</span>
              </button>
            );
          })}
          <button type="button" onClick={() => setMenuOpen(true)} className="rounded-2xl px-2 py-2.5 text-muted-foreground">
            <Menu className="mx-auto h-4 w-4" />
            <span className="mt-1 block truncate text-[11px] font-bold">Menu</span>
          </button>
        </div>
      </div>

      {menuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button type="button" aria-label="Fechar menu" className="absolute inset-0 bg-foreground/35" onClick={() => setMenuOpen(false)} />
          <div className="absolute inset-0 flex h-full w-full flex-col gap-5 overflow-y-auto bg-background p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">Navegação</p>
                <p className="text-lg font-black">Rotas do sistema</p>
              </div>
              <button type="button" onClick={() => setMenuOpen(false)} className="flex h-10 w-10 items-center justify-center rounded-2xl border border-border bg-white">
                <X className="h-4 w-4" />
              </button>
            </div>
            {visibleGroups.map((group) => {
              const items = navItems.filter((item) => item.group === group && item.allowedRoles.includes(userRole));
              if (items.length === 0) return null;
              return (
                <section key={group} className="space-y-2">
                  <p className="px-1 text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">{groupLabels[group]}</p>
                  <div className="space-y-1.5">
                    {items.map((item) => (
                      <NavButton key={item.path} item={item} active={isActive(item, location.pathname)} compact onClick={() => handleNavClick(item)} />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
