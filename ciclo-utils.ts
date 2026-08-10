import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Download, Search, UserRound } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { formatCpfMask } from "@/lib/format-utils";

export default function AdminConsulta() {
  const navigate = useNavigate();
  const [busca, setBusca] = useState("");
  const [resultados, setResultados] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [backupLoading, setBackupLoading] = useState(false);

  const handleSearch = async () => {
    if (busca.trim().length < 2) { toast.error("Digite pelo menos 2 caracteres."); return; }
    setSearching(true);
    const clean = busca.replace(/\D/g, "");
    let query = supabase.from("pacientes").select("*");
    if (clean.length >= 3) query = query.or(`cpf.ilike.%${clean}%,nome.ilike.%${busca.trim()}%`);
    else query = query.ilike("nome", `%${busca.trim()}%`);
    const { data, error } = await query.limit(20);
    if (error) toast.error("Erro ao buscar cliente.");
    setResultados(data || []);
    setSearching(false);
    setSearched(true);
  };

  const handleBackup = async () => {
    setBackupLoading(true);
    try {
      const { data: pacientes } = await supabase.from("pacientes").select("*");
      const { data: allCiclos } = await supabase.from("ciclos").select("*, receitas(*)");
      const { data: allDisp } = await supabase.from("dispensacoes").select("*").eq("cancelada", false);
      const { data: allDocs } = await supabase.from("documentos").select("*");
      const { data: allLogs } = await supabase.from("logs").select("*");
      const backup = { exportado_em: new Date().toISOString(), pacientes: pacientes || [], ciclos: allCiclos || [], dispensacoes: allDisp || [], documentos: allDocs || [], logs: allLogs || [] };
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `backup_farmacia_${new Date().toISOString().split("T")[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Backup exportado.");
    } catch {
      toast.error("Erro ao gerar backup.");
    } finally { setBackupLoading(false); }
  };

  return (
    <AppLayout title="Atendimento">
      <div className="page-wrap">
        <section className="hero-compact rounded-2xl p-4 sm:p-6">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-primary">Busca rápida</p>
          <h2 className="mt-1 text-2xl font-black leading-tight">Encontrar cliente</h2>
          <p className="mt-1 text-sm text-muted-foreground">Digite nome ou CPF para abrir o atendimento.</p>

          <div className="mt-4 space-y-2 sm:grid sm:grid-cols-[1fr_160px] sm:gap-2 sm:space-y-0">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Nome ou CPF"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className="h-14 rounded-2xl bg-white pl-12 text-base"
              />
            </div>
            <Button onClick={handleSearch} disabled={searching} className="h-14 w-full rounded-2xl action-primary text-base font-black">
              <Search className="mr-2 h-5 w-5" /> {searching ? "Buscando..." : "Buscar"}
            </Button>
          </div>
        </section>

        <section className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={() => navigate("/clientes")} className="h-12 rounded-2xl bg-white">Clientes</Button>
          <Button variant="outline" onClick={handleBackup} disabled={backupLoading} className="h-12 rounded-2xl bg-white">
            <Download className="mr-2 h-4 w-4" /> {backupLoading ? "Gerando..." : "Backup"}
          </Button>
        </section>

        <section className="surface-panel rounded-2xl p-3">
          <div className="mb-3 flex items-center justify-between">
            <div><h3 className="font-black">Resultados</h3><p className="text-xs text-muted-foreground">Toque no cliente para abrir</p></div>
            <Badge variant="outline" className="rounded-full">{resultados.length}</Badge>
          </div>

          {resultados.length === 0 && searched && !searching ? (
            <div className="py-14 text-center text-muted-foreground">Nenhum cliente encontrado.</div>
          ) : resultados.length === 0 ? (
            <div className="py-14 text-center text-muted-foreground">A busca aparecerá aqui.</div>
          ) : (
            <div className="space-y-2">
              {resultados.map((p) => (
                <button key={p.id} className="list-card w-full text-left pressable" onClick={() => navigate(`/cliente/${p.id}`)}>
                  <div className="flex items-center gap-3">
                    <div className="h-11 w-11 rounded-xl bg-muted flex items-center justify-center shrink-0"><UserRound className="h-5 w-5 text-primary" /></div>
                    <div className="min-w-0 flex-1"><p className="truncate font-black">{p.nome}</p><p className="text-xs text-muted-foreground">CPF: {formatCpfMask(p.cpf || "")}</p></div>
                    <Badge variant={p.ativo ? "outline" : "destructive"} className="rounded-full">{p.ativo ? "Ativo" : "Inativo"}</Badge>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </AppLayout>
  );
}
