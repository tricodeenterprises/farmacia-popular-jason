import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertTriangle, CheckCircle, XCircle, Route, Component, MousePointer,
  Server, FileText, GitBranch,
} from "lucide-react";

/* ════════════════════════════════════════════
   STATIC SYSTEM MAP — hardcoded from codebase
   ════════════════════════════════════════════ */

interface RouteInfo {
  path: string;
  page: string;
  inSidebar: boolean;
  roles: string[];
  protected: boolean;
}

const allRoutes: RouteInfo[] = [
  { path: "/login", page: "Login", inSidebar: false, roles: ["public"], protected: false },
  { path: "/", page: "Dashboard", inSidebar: true, roles: ["master", "operador", "chefe", "inspetor"], protected: true },
  { path: "/atendimento", page: "Dashboard", inSidebar: true, roles: ["master", "operador", "chefe", "inspetor"], protected: true },
  { path: "/pacientes", page: "GerenciarClientes", inSidebar: true, roles: ["master"], protected: true },
  { path: "/dispensacoes", page: "Dispensacoes", inSidebar: true, roles: ["master", "operador"], protected: true },
  { path: "/backup", page: "Backup", inSidebar: true, roles: ["master"], protected: true },
  { path: "/admin/usuarios", page: "GerenciarUsuarios", inSidebar: true, roles: ["master"], protected: true },
  { path: "/admin/logs", page: "AuditLogs", inSidebar: true, roles: ["master"], protected: true },
  { path: "/admin/configuracoes", page: "Configuracoes", inSidebar: true, roles: ["master"], protected: true },
  { path: "/pacientes/:id", page: "ClienteProfile", inSidebar: false, roles: ["master", "operador", "chefe", "inspetor"], protected: true },
  { path: "/admin/mapa-sistema", page: "SystemMap", inSidebar: false, roles: ["master"], protected: true },
  { path: "*", page: "NotFound", inSidebar: false, roles: ["public"], protected: false },
];

interface ComponentInfo {
  name: string;
  usedIn: string[];
  orphan: boolean;
}

const allComponents: ComponentInfo[] = [
  { name: "AppLayout (OperationalShell)", usedIn: ["Dashboard", "AdminConsulta", "GerenciarClientes", "GerenciarUsuarios", "Dispensacoes", "Backup", "AuditLogs", "Configuracoes", "ClienteProfile", "SystemMap"], orphan: false },
  { name: "PacientePanel", usedIn: ["Dashboard"], orphan: false },
  { name: "CadastroPaciente", usedIn: ["Dashboard"], orphan: false },
  { name: "CameraCapture", usedIn: ["Dashboard"], orphan: false },
  { name: "NovaReceita", usedIn: ["PacientePanel"], orphan: false },
  { name: "NovaDispensacao", usedIn: ["PacientePanel"], orphan: false },
  { name: "SetupCiclo", usedIn: ["PacientePanel"], orphan: false },
  { name: "UploadDocumento", usedIn: ["PacientePanel"], orphan: false },
  { name: "PWAInstallPrompt", usedIn: ["App.tsx"], orphan: false },
  { name: "HeroSection", usedIn: [], orphan: true },
  { name: "HistorySection", usedIn: [], orphan: true },
  { name: "GallerySection", usedIn: [], orphan: true },
  { name: "Footer", usedIn: [], orphan: true },
  { name: "NavLink", usedIn: [], orphan: true },
  { name: "Index (landing page)", usedIn: [], orphan: true },
];

interface ButtonInfo {
  page: string;
  label: string;
  hasHandler: boolean;
  handler: string;
}

const allButtons: ButtonInfo[] = [
  // Dashboard
  { page: "Dashboard", label: "Consultar (CPF)", hasHandler: true, handler: "handleSearch()" },
  { page: "Dashboard", label: "Tirar Foto", hasHandler: true, handler: "setShowCamera(true)" },
  { page: "Dashboard", label: "Anexar Foto", hasHandler: true, handler: "fileInputRef.click()" },
  { page: "Dashboard", label: "Cadastrar Novo Paciente", hasHandler: true, handler: "setShowCadastro(true)" },
  { page: "Dashboard", label: "Nova Consulta", hasHandler: true, handler: "handleNewSearch()" },
  // GerenciarClientes
  { page: "GerenciarClientes", label: "Filtrar", hasHandler: true, handler: "fetchClientes()" },
  { page: "GerenciarClientes", label: "Visualizar", hasHandler: true, handler: "navigate(/pacientes/:id)" },
  { page: "GerenciarClientes", label: "Excluir (master)", hasHandler: true, handler: "handleDelete()" },
  { page: "GerenciarClientes", label: "Reativar (master)", hasHandler: true, handler: "handleReactivate()" },
  // GerenciarUsuarios
  { page: "GerenciarUsuarios", label: "Criar Usuário", hasHandler: true, handler: "handleCreate()" },
  { page: "GerenciarUsuarios", label: "Editar Usuário", hasHandler: true, handler: "handleEdit()" },
  // AdminConsulta
  { page: "AdminConsulta", label: "Buscar", hasHandler: true, handler: "handleSearch()" },
  // Dispensacoes
  { page: "Dispensacoes", label: "Filtrar por período", hasHandler: true, handler: "fetchDispensacoes()" },
  // Backup
  { page: "Backup", label: "Baixar Backup Completo", hasHandler: true, handler: "handleBackup()" },
  // AuditLogs
  { page: "AuditLogs", label: "Filtrar", hasHandler: true, handler: "fetchLogs()" },
  { page: "AuditLogs", label: "Anterior / Próxima", hasHandler: true, handler: "setPage()" },
  // Configuracoes
  { page: "Configuracoes", label: "Salvar", hasHandler: true, handler: "handleSave()" },
  // Sidebar
  { page: "Sidebar", label: "Logout", hasHandler: true, handler: "signOut()" },
  { page: "Sidebar", label: "Navegação (8 itens)", hasHandler: true, handler: "navigate(path)" },
];

interface BackendFn {
  name: string;
  type: "edge-function" | "db-function" | "rpc";
  calledBy: string[];
  unused: boolean;
}

const backendFunctions: BackendFn[] = [
  { name: "ocr-document", type: "edge-function", calledBy: ["Dashboard (processOcrImage)", "UploadDocumento"], unused: false },
  { name: "create-user", type: "edge-function", calledBy: ["GerenciarUsuarios"], unused: false },
  { name: "has_role(_user_id, _role)", type: "db-function", calledBy: ["RLS Policies (ciclos, configuracoes, dispensacoes, documentos, logs, profiles, receitas, user_roles)"], unused: false },
  { name: "handle_new_user()", type: "db-function", calledBy: ["Trigger: on auth.users INSERT"], unused: false },
];

interface LogCoverage {
  operation: string;
  generatesLog: boolean;
  logAction: string;
}

const logCoverage: LogCoverage[] = [
  { operation: "Login", generatesLog: true, logAction: "login" },
  { operation: "Nova Receita", generatesLog: true, logAction: "nova_receita" },
  { operation: "Nova Dispensação", generatesLog: true, logAction: "nova_dispensacao" },
  { operation: "Upload Documento", generatesLog: true, logAction: "upload_documento" },
  { operation: "Criar Usuário", generatesLog: true, logAction: "criar_usuario" },
  { operation: "Cancelar Dispensação", generatesLog: true, logAction: "cancelar_dispensacao" },
  { operation: "Editar Paciente", generatesLog: true, logAction: "editar_paciente" },
  { operation: "Editar Cliente", generatesLog: true, logAction: "editar_cliente" },
  { operation: "Excluir Cliente", generatesLog: true, logAction: "excluir_cliente" },
  { operation: "Reativar Cliente", generatesLog: true, logAction: "reativar_cliente" },
  { operation: "Editar Usuário", generatesLog: true, logAction: "editar_usuario" },
  { operation: "Backup", generatesLog: true, logAction: "backup" },
  { operation: "Alterar Configuração", generatesLog: true, logAction: "alterar_configuracao" },
  { operation: "Cadastrar Paciente", generatesLog: false, logAction: "—" },
  { operation: "Setup Ciclo", generatesLog: false, logAction: "—" },
  { operation: "Buscar Paciente (CPF)", generatesLog: false, logAction: "—" },
];

/* ═══ Metrics ═══ */
const orphanRoutes = allRoutes.filter(r => !r.inSidebar && r.path !== "/login" && r.path !== "*");
const orphanComponents = allComponents.filter(c => c.orphan);
const deadButtons = allButtons.filter(b => !b.hasHandler);
const unusedBackend = backendFunctions.filter(f => f.unused);
const unloggedOps = logCoverage.filter(l => !l.generatesLog);

function StatusBadge({ ok }: { ok: boolean }) {
  return ok ? (
    <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 gap-1">
      <CheckCircle className="w-3 h-3" /> OK
    </Badge>
  ) : (
    <Badge className="bg-red-500/20 text-red-400 border-red-500/30 gap-1">
      <XCircle className="w-3 h-3" /> Alerta
    </Badge>
  );
}

/* ═══════════ PAGE ═══════════ */
export default function SystemMap() {
  const { isMaster } = useAuth();

  if (!isMaster) {
    return (
      <AppLayout title="System Map">
        <div className="flex items-center justify-center py-20">
          <p className="text-muted-foreground">Acesso restrito ao administrador.</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="🗺️ System Map — Diagnóstico Estrutural">
      <div className="space-y-6">

        {/* ─── Summary Cards ─── */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <MetricCard label="Rotas" value={allRoutes.length} icon={Route} />
          <MetricCard label="Componentes" value={allComponents.length} icon={Component} />
          <MetricCard label="Botões" value={allButtons.length} icon={MousePointer} />
          <MetricCard label="Backend Fns" value={backendFunctions.length} icon={Server} />
          <MetricCard label="Ops c/ Log" value={logCoverage.filter(l => l.generatesLog).length} icon={FileText} />
          <MetricCard label="Alertas" value={orphanComponents.length + unloggedOps.length} icon={AlertTriangle} alert />
        </div>

        {/* ─── Alerts ─── */}
        {(orphanComponents.length > 0 || unloggedOps.length > 0 || deadButtons.length > 0 || unusedBackend.length > 0) && (
          <Alert variant="destructive" className="border-red-500/40 bg-red-500/10">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Alertas Estruturais</AlertTitle>
            <AlertDescription className="space-y-1 text-sm">
              {orphanComponents.length > 0 && (
                <p>🔴 <strong>{orphanComponents.length} componente(s) órfão(s)</strong>: {orphanComponents.map(c => c.name).join(", ")}</p>
              )}
              {unloggedOps.length > 0 && (
                <p>🔴 <strong>{unloggedOps.length} operação(ões) sem log</strong>: {unloggedOps.map(l => l.operation).join(", ")}</p>
              )}
              {deadButtons.length > 0 && (
                <p>🔴 <strong>{deadButtons.length} botão(ões) sem handler</strong></p>
              )}
              {unusedBackend.length > 0 && (
                <p>🔴 <strong>{unusedBackend.length} função(ões) backend não utilizada(s)</strong>: {unusedBackend.map(f => f.name).join(", ")}</p>
              )}
            </AlertDescription>
          </Alert>
        )}

        {/* ─── Tabs ─── */}
        <Tabs defaultValue="routes" className="w-full">
          <TabsList className="w-full flex flex-wrap h-auto gap-1 p-1">
            <TabsTrigger value="routes" className="text-xs">1. Rotas</TabsTrigger>
            <TabsTrigger value="components" className="text-xs">2. Componentes</TabsTrigger>
            <TabsTrigger value="buttons" className="text-xs">3. Botões</TabsTrigger>
            <TabsTrigger value="backend" className="text-xs">4. Backend</TabsTrigger>
            <TabsTrigger value="logs" className="text-xs">5. Logs</TabsTrigger>
            <TabsTrigger value="flow" className="text-xs">6. Fluxo</TabsTrigger>
          </TabsList>

          {/* ─── 1. Routes ─── */}
          <TabsContent value="routes">
            <Card>
              <CardHeader><CardTitle className="text-base">Mapeamento de Rotas</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Rota</TableHead>
                      <TableHead>Página</TableHead>
                      <TableHead>Menu Lateral</TableHead>
                      <TableHead>Roles</TableHead>
                      <TableHead>Protegida</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allRoutes.map((r) => (
                      <TableRow key={r.path}>
                        <TableCell className="font-mono text-xs">{r.path}</TableCell>
                        <TableCell className="text-sm">{r.page}</TableCell>
                        <TableCell>
                          {r.inSidebar ? (
                            <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-xs">Sim</Badge>
                          ) : (
                            <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-xs">Não</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">{r.roles.join(", ")}</TableCell>
                        <TableCell>
                          {r.protected ? <CheckCircle className="w-4 h-4 text-emerald-400" /> : <XCircle className="w-4 h-4 text-muted-foreground" />}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ─── 2. Components ─── */}
          <TabsContent value="components">
            <Card>
              <CardHeader><CardTitle className="text-base">Mapeamento de Componentes</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Componente</TableHead>
                      <TableHead>Usado Em</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allComponents.map((c) => (
                      <TableRow key={c.name} className={c.orphan ? "bg-red-500/5" : ""}>
                        <TableCell className="text-sm font-medium">{c.name}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {c.usedIn.length > 0 ? c.usedIn.join(", ") : "—"}
                        </TableCell>
                        <TableCell><StatusBadge ok={!c.orphan} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ─── 3. Buttons ─── */}
          <TabsContent value="buttons">
            <Card>
              <CardHeader><CardTitle className="text-base">Auditoria de Botões e Ações</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Página</TableHead>
                      <TableHead>Botão</TableHead>
                      <TableHead>Handler</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allButtons.map((b, i) => (
                      <TableRow key={i} className={!b.hasHandler ? "bg-red-500/5" : ""}>
                        <TableCell className="text-xs">{b.page}</TableCell>
                        <TableCell className="text-sm">{b.label}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{b.handler || "—"}</TableCell>
                        <TableCell><StatusBadge ok={b.hasHandler} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ─── 4. Backend ─── */}
          <TabsContent value="backend">
            <Card>
              <CardHeader><CardTitle className="text-base">Integrações Backend</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Função</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Chamada Por</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {backendFunctions.map((f) => (
                      <TableRow key={f.name} className={f.unused ? "bg-red-500/5" : ""}>
                        <TableCell className="font-mono text-xs">{f.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">{f.type}</Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{f.calledBy.join(", ")}</TableCell>
                        <TableCell><StatusBadge ok={!f.unused} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ─── 5. Logs ─── */}
          <TabsContent value="logs">
            <Card>
              <CardHeader><CardTitle className="text-base">Cobertura de Auditoria (Logs)</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Operação</TableHead>
                      <TableHead>Gera Log</TableHead>
                      <TableHead>Ação (logs.acao)</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logCoverage.map((l) => (
                      <TableRow key={l.operation} className={!l.generatesLog ? "bg-red-500/5" : ""}>
                        <TableCell className="text-sm">{l.operation}</TableCell>
                        <TableCell>
                          {l.generatesLog ? (
                            <CheckCircle className="w-4 h-4 text-emerald-400" />
                          ) : (
                            <XCircle className="w-4 h-4 text-red-400" />
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{l.logAction}</TableCell>
                        <TableCell><StatusBadge ok={l.generatesLog} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ─── 6. Flow ─── */}
          <TabsContent value="flow">
            <Card>
              <CardHeader><CardTitle className="text-base">Fluxo do Sistema</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {/* Visual flow diagram using styled divs */}
                  <div className="flex flex-col items-center gap-3">
                    <FlowNode label="Login" color="hsl(260, 80%, 65%)" />
                    <FlowArrow />
                    <FlowNode label="Dashboard (Buscar Paciente)" color="hsl(200, 80%, 55%)" />
                    <FlowArrow />
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 w-full max-w-2xl">
                      <FlowNode label="Consultar" color="hsl(25, 80%, 55%)" sub="master" />
                      <FlowNode label="Clientes" color="hsl(160, 70%, 45%)" sub="todos" />
                      <FlowNode label="Dispensações" color="hsl(190, 70%, 50%)" sub="todos" />
                      <FlowNode label="Backup" color="hsl(340, 70%, 55%)" sub="master" />
                    </div>
                    <FlowArrow />
                    <div className="grid grid-cols-3 gap-3 w-full max-w-lg">
                      <FlowNode label="Usuários" color="hsl(45, 80%, 50%)" sub="master" />
                      <FlowNode label="Logs" color="hsl(170, 70%, 45%)" sub="master" />
                      <FlowNode label="Config" color="hsl(230, 60%, 55%)" sub="master" />
                    </div>
                  </div>

                  {/* Tables summary */}
                  <div className="mt-8">
                    <h4 className="text-sm font-semibold mb-3 text-muted-foreground">Tabelas do Banco de Dados</h4>
                    <div className="flex flex-wrap gap-2">
                      {["pacientes", "ciclos", "receitas", "dispensacoes", "documentos", "profiles", "user_roles", "logs", "configuracoes"].map((t) => (
                        <Badge key={t} variant="outline" className="font-mono text-xs">
                          {t}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}

/* ─── Helper Components ─── */
function MetricCard({ label, value, icon: Icon, alert }: { label: string; value: number; icon: React.ElementType; alert?: boolean }) {
  return (
    <Card className={alert && value > 0 ? "border-red-500/40" : ""}>
      <CardContent className="p-4 flex flex-col items-center gap-1">
        <Icon className={`w-5 h-5 ${alert && value > 0 ? "text-red-400" : "text-primary"}`} />
        <span className={`text-2xl font-bold ${alert && value > 0 ? "text-red-400" : "text-foreground"}`}>{value}</span>
        <span className="text-xs text-muted-foreground">{label}</span>
      </CardContent>
    </Card>
  );
}

function FlowNode({ label, color, sub }: { label: string; color: string; sub?: string }) {
  return (
    <div
      className="rounded-xl px-4 py-3 text-center text-sm font-medium border w-full"
      style={{
        background: `${color}15`,
        borderColor: `${color}40`,
        color: color,
        boxShadow: `0 0 20px ${color}15`,
      }}
    >
      {label}
      {sub && <span className="block text-[10px] opacity-60 mt-0.5">{sub}</span>}
    </div>
  );
}

function FlowArrow() {
  return (
    <div className="flex flex-col items-center">
      <div className="w-px h-6 bg-primary/30" />
      <GitBranch className="w-4 h-4 text-primary/40 rotate-180" />
    </div>
  );
}
