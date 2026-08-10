import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Search, Download, User, Calendar, Package } from "lucide-react";
import AppLayout from "@/components/AppLayout";

function formatDateBR(d: string | null) {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

export default function AdminConsulta() {
  const { isMaster } = useAuth();
  const navigate = useNavigate();
  const [busca, setBusca] = useState("");
  const [resultados, setResultados] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [ciclos, setCiclos] = useState<any[]>([]);
  const [dispensacoes, setDispensacoes] = useState<any[]>([]);
  const [backupLoading, setBackupLoading] = useState(false);

  // Consulta is accessible to all authenticated users

  const handleSearch = async () => {
    if (busca.trim().length < 2) { toast.error("Digite pelo menos 2 caracteres."); return; }
    setSearching(true);
    setSelected(null);
    const clean = busca.replace(/\D/g, "");
    let query = supabase.from("pacientes").select("*");
    if (clean.length >= 3) {
      query = query.or(`cpf.ilike.%${clean}%,nome.ilike.%${busca.trim()}%`);
    } else {
      query = query.ilike("nome", `%${busca.trim()}%`);
    }
    const { data } = await query.limit(20);
    setResultados(data || []);
    setSearching(false);
    setSearched(true);
  };

  const selectPaciente = async (p: any) => {
    navigate(`/pacientes/${p.id}`);
  };

  const handleBackup = async () => {
    setBackupLoading(true);
    try {
      const { data: pacientes } = await supabase.from("pacientes").select("*");
      const { data: allCiclos } = await supabase.from("ciclos").select("*, receitas(*)");
      const { data: allDisp } = await supabase.from("dispensacoes").select("*").eq("cancelada", false);
      const { data: allDocs } = await supabase.from("documentos").select("*");
      const { data: allLogs } = await supabase.from("logs").select("*");
      const backup = {
        exportado_em: new Date().toISOString(),
        pacientes: pacientes || [],
        ciclos: allCiclos || [],
        dispensacoes: allDisp || [],
        documentos: allDocs || [],
        logs: allLogs || [],
      };
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `backup_farmacia_${new Date().toISOString().split("T")[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Backup exportado com sucesso!");
    } catch {
      toast.error("Erro ao gerar backup.");
    } finally {
      setBackupLoading(false);
    }
  };

  return (
    <AppLayout title="Consulta Administrativa">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <h2 className="text-xl font-bold" style={{ fontFamily: "var(--font-display)" }}>Consulta Administrativa</h2>
          <Button variant="outline" size="sm" onClick={handleBackup} disabled={backupLoading} className="w-full sm:w-auto min-h-[44px]">
            <Download className="w-4 h-4 mr-1" /> {backupLoading ? "Gerando..." : "Backup"}
          </Button>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row gap-3">
              <Input
                placeholder="Buscar por nome ou CPF..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className="min-h-[44px]"
              />
              <Button onClick={handleSearch} disabled={searching} className="w-full sm:w-auto min-h-[44px]">
                <Search className="w-4 h-4 mr-1" /> {searching ? "..." : "Buscar"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {resultados.length === 0 && !searching && searched && (
          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-muted-foreground">Nenhum cliente encontrado para "{busca}".</p>
            </CardContent>
          </Card>
        )}

        {resultados.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-lg">Resultados</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {resultados.map(p => (
                <button
                  key={p.id}
                  className="w-full text-left p-3 rounded-lg bg-muted/50 hover:bg-muted flex justify-between items-center min-h-[44px]"
                  onClick={() => selectPaciente(p)}
                >
                  <div>
                    <p className="font-medium">{p.nome}</p>
                    <p className="text-xs text-muted-foreground font-mono">{p.cpf}</p>
                  </div>
                  <Badge variant={p.ativo ? "outline" : "destructive"}>
                    {p.ativo ? "Ativo" : "Inativo"}
                  </Badge>
                </button>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
