import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Search } from "lucide-react";
import AppLayout from "@/components/AppLayout";

function formatDateTimeBR(d: string) {
  return new Date(d).toLocaleString("pt-BR");
}

const acaoLabels: Record<string, string> = {
  nova_receita: "📝 Nova Receita",
  nova_dispensacao: "💊 Dispensação",
  upload_documento: "📄 Upload Doc",
  criar_usuario: "👤 Novo Usuário",
  login: "🔑 Login",
  cancelar_dispensacao: "❌ Cancelar Disp.",
  editar_paciente: "✏️ Editar Paciente",
  editar_cliente: "✏️ Editar Cliente",
  excluir_cliente: "🗑️ Excluir Cliente",
  reativar_cliente: "♻️ Reativar Cliente",
  editar_usuario: "✏️ Editar Usuário",
  backup: "💾 Backup",
  backup_completo: "💾 Backup Completo",
  backup_incremental: "💾 Backup Incremental",
  backup_automatico: "💾 Backup Automático",
  alterar_configuracao: "⚙️ Config",
  ui_click: "🖱️ Clique",
};

export default function AuditLogs() {
  const { isMaster } = useAuth();
  const [logs, setLogs] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  const fetchLogs = async () => {
    setLoading(true);
    let query = supabase
      .from("logs").select("*")
      .order("created_at", { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    if (busca.trim()) query = query.ilike("acao", `%${busca.trim()}%`);
    const { data } = await query;
    setLogs(data || []);
    const userIds = [...new Set((data || []).map(l => l.user_id).filter(Boolean))];
    if (userIds.length > 0) {
      const { data: profs } = await supabase.from("profiles").select("id, nome").in("id", userIds);
      const map: Record<string, string> = {};
      profs?.forEach(p => { map[p.id] = p.nome; });
      setProfiles(map);
    }
    setLoading(false);
  };

  useEffect(() => { fetchLogs(); }, [page]);

  if (!isMaster) {
    return (
      <AppLayout title="Logs">
        <div className="flex items-center justify-center py-20">
          <p className="text-muted-foreground">Acesso restrito ao administrador.</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Logs de Auditoria">
      <div className="space-y-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row gap-3">
              <Input
                placeholder="Filtrar por ação..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && fetchLogs()}
                className="min-h-[44px]"
              />
              <Button onClick={fetchLogs} disabled={loading} className="w-full sm:w-auto min-h-[44px]">
                <Search className="w-4 h-4 mr-1" /> Filtrar
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-lg">Registros</CardTitle></CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-muted-foreground text-center py-4">Carregando...</p>
            ) : logs.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">Nenhum log encontrado.</p>
            ) : (
              <div className="space-y-2">
                {logs.map((log) => {
                  const detalhes = log.detalhes as any;
                  return (
                    <div key={log.id} className="p-3 rounded-lg bg-muted/50 space-y-1">
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline">{acaoLabels[log.acao] || log.acao}</Badge>
                          <span className="text-sm font-medium">{profiles[log.user_id] || "Sistema"}</span>
                        </div>
                        <span className="text-xs text-muted-foreground">{formatDateTimeBR(log.created_at)}</span>
                      </div>
                      {detalhes && (
                        <div className="rounded-md border border-border/60 bg-background p-2 text-xs text-muted-foreground">
                          {log.acao === "ui_click" ? (
                            <div className="space-y-1">
                              <p><strong>Botão:</strong> {detalhes.label || "—"}</p>
                              <p><strong>Rota:</strong> {detalhes.rota || "—"}</p>
                              <p><strong>Elemento:</strong> {detalhes.elemento || "—"}</p>
                            </div>
                          ) : (
                            <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono">{JSON.stringify(detalhes, null, 2)}</pre>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            <div className="flex justify-between items-center mt-4 pt-3 border-t border-border">
              <Button variant="ghost" size="sm" onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0} className="min-h-[44px]">
                ← Anterior
              </Button>
              <span className="text-xs text-muted-foreground">Página {page + 1}</span>
              <Button variant="ghost" size="sm" onClick={() => setPage(page + 1)} disabled={logs.length < PAGE_SIZE} className="min-h-[44px]">
                Próxima →
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
