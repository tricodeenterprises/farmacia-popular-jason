import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Search, RotateCcw, Trash2, Eye, AlertTriangle, User, Baby, UserRound } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import AppLayout from "@/components/AppLayout";

// Infer gender from Brazilian first name
const FEMALE_NAMES = new Set(["maria","ana","julia","juliana","fernanda","patricia","adriana","lucia","luciana","sandra","simone","marcia","claudia","rosana","rosa","vera","angela","beatriz","carla","carolina","cristina","daniela","denise","elaine","fabiana","gabriela","helena","irene","janaina","josefa","katia","larissa","leticia","lilian","marta","nadia","natalia","paula","raquel","renata","rita","roberta","silvia","sonia","suzana","tatiana","tereza","valeria","vanessa","viviane","antonia","francisca","aparecida","conceicao","fatima","lourdes","socorro","izabel","isabel","alice","laura","valentina","manuela","sofia","helena","luiza","cecilia","lorena","luana","milena","bianca","bruna","camila","diana","elisa","flavia","giovana","ingrid","joana","karen","livia","mariana","nicole","priscila","rafaela","sabrina","tais","yasmin"]);
const MALE_NAMES = new Set(["jose","joao","pedro","paulo","carlos","francisco","antonio","lucas","marcos","rafael","andre","bruno","daniel","eduardo","fernando","gabriel","guilherme","henrique","igor","jorge","leandro","leonardo","marcelo","mateus","matheus","nelson","otavio","ricardo","roberto","rodrigo","sergio","thiago","tiago","vinicius","wagner","alan","alex","anderson","caio","claudio","diego","emerson","fabio","felipe","gustavo","hugo","ivan","julio","luiz","luis","marcio","mario","mauricio","nilson","oscar","reginaldo","renato","ronaldo","samuel","silvio","valdir","vanderlei","washington","ademir","adilson","adriano","alberto","alexandre","alvaro","amilton","arthur","augusto","benedito","bernardo","cezar","cicero","claudio","cristiano","davi","david","eder","edson","elias","erick","ernesto","eugenio","evanildo","everton","flavio","geraldo","gilberto","gilson","helio","hermes","humberto","isac","isaque","israel","jefferson","jonas","jonathan","josue","kleber","laercio","luan","manoel","michel","miguel","moises","murilo","natan","newton","noel","osvaldo","otacilio","patrick","raimundo","ramon","renan","rene","ruan","rubens","sidnei","sidney","silas","silvano","tomas","ubiratan","vagner","valdemir","vanderson","vicente","victor","vitor","wanderson","welton","wesley","william","wilson"]);

function inferGender(nome: string): "M" | "F" | null {
  const first = (nome || "").trim().split(/\s+/)[0]?.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") || "";
  if (FEMALE_NAMES.has(first)) return "F";
  if (MALE_NAMES.has(first)) return "M";
  // Heuristic: names ending in 'a' are often female in Portuguese
  if (first.endsWith("a") && first.length > 2) return "F";
  if (first.endsWith("o") && first.length > 2) return "M";
  return null;
}

function calcAge(dataNascimento: string | null): number | null {
  if (!dataNascimento) return null;
  const birth = new Date(dataNascimento);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

function GenderIcon({ sexo, nome, age }: { sexo: string | null; nome: string; age: number | null }) {
  const gender = sexo || inferGender(nome);
  const isChild = age !== null && age < 12;
  
  if (isChild) {
    return (
      <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-gradient-to-br from-amber-400 to-orange-400 shadow-md">
        <Baby className="w-5 h-5 text-white" />
      </div>
    );
  }
  
  if (gender === "F") {
    return (
      <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-gradient-to-br from-pink-400 to-rose-500 shadow-md">
        <UserRound className="w-5 h-5 text-white" />
      </div>
    );
  }
  
  if (gender === "M") {
    return (
      <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-gradient-to-br from-blue-400 to-indigo-500 shadow-md">
        <User className="w-5 h-5 text-white" />
      </div>
    );
  }
  
  return (
    <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-gradient-to-br from-gray-400 to-slate-500 shadow-md">
      <User className="w-5 h-5 text-white" />
    </div>
  );
}

function formatCpfMask(cpf: string): string {
  const digits = (cpf || "").replace(/\D/g, "");
  return digits
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

export default function GerenciarClientes() {
  const { isMaster, user } = useAuth();
  const navigate = useNavigate();
  const [clientes, setClientes] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [busca, setBusca] = useState("");
  const [showInativos, setShowInativos] = useState(false);
  const [deleteClient, setDeleteClient] = useState<any>(null);
  const [deleting, setDeleting] = useState(false);
  const [hardDeleteClient, setHardDeleteClient] = useState<any>(null);
  const [senhaMaster, setSenhaMaster] = useState("");
  const [hardDeleting, setHardDeleting] = useState(false);

  const fetchClientes = async (search?: string) => {
    setLoading(true);
    let query = supabase
      .from("pacientes")
      .select("*, ciclos(status)")
      .order("nome", { ascending: true })
      .limit(100);

    if (!showInativos) {
      query = query.eq("ativo", true);
    }

    if (search && search.trim()) {
      const clean = search.replace(/\D/g, "");
      if (clean.length >= 3) {
        query = query.ilike("cpf", `%${clean}%`);
      } else {
        query = query.ilike("nome", `%${search.trim()}%`);
      }
    }

    const { data } = await query;
    setClientes(data || []);
    setLoading(false);
  };

  useEffect(() => { if (isMaster) fetchClientes(); }, [showInativos, isMaster]);

  if (!isMaster) {
    return (
      <AppLayout title="Clientes">
        <div className="flex items-center justify-center py-20">
          <p className="text-muted-foreground">Acesso restrito ao administrador.</p>
        </div>
      </AppLayout>
    );
  }

  const handleDelete = async () => {
    if (!deleteClient) return;
    setDeleting(true);
    const { error } = await supabase.from("pacientes").update({ ativo: false, updated_at: new Date().toISOString() }).eq("id", deleteClient.id);
    if (error) { toast.error("Erro ao excluir."); setDeleting(false); return; }
    await supabase.from("logs").insert({
      user_id: user?.id, acao: "excluir_cliente",
      detalhes: { paciente_id: deleteClient.id, nome: deleteClient.nome },
    });
    toast.success("Cliente excluído!");
    setDeleteClient(null); setDeleting(false);
    fetchClientes(busca);
  };

  const handleReactivate = async (c: any) => {
    const { error } = await supabase.from("pacientes").update({ ativo: true, updated_at: new Date().toISOString() }).eq("id", c.id);
    if (error) { toast.error("Erro ao reativar."); return; }
    await supabase.from("logs").insert({
      user_id: user?.id, acao: "reativar_cliente",
      detalhes: { paciente_id: c.id, nome: c.nome },
    });
    toast.success("Cliente reativado!");
    fetchClientes(busca);
  };

  const handleHardDelete = async () => {
    if (!hardDeleteClient || !senhaMaster.trim()) return;
    setHardDeleting(true);

    const { data: configData } = await supabase
      .from("configuracoes")
      .select("valor")
      .eq("chave", "senha_master_exclusao")
      .single();

    if (!configData || configData.valor !== senhaMaster) {
      toast.error("Senha master incorreta!");
      setHardDeleting(false);
      return;
    }

    await supabase.from("dispensacoes").delete().eq("paciente_id", hardDeleteClient.id);
    await supabase.from("documentos").delete().eq("paciente_id", hardDeleteClient.id);
    await supabase.from("receitas").delete().eq("paciente_id", hardDeleteClient.id);
    await supabase.from("ciclos").delete().eq("paciente_id", hardDeleteClient.id);

    const { error } = await supabase.from("pacientes").delete().eq("id", hardDeleteClient.id);
    if (error) {
      toast.error("Erro ao excluir permanentemente.");
      setHardDeleting(false);
      return;
    }

    await supabase.from("logs").insert({
      user_id: user?.id, acao: "excluir_cliente_permanente",
      detalhes: { paciente_id: hardDeleteClient.id, nome: hardDeleteClient.nome, cpf: hardDeleteClient.cpf },
    });

    toast.success("Cliente excluído permanentemente!");
    setHardDeleteClient(null);
    setSenhaMaster("");
    setHardDeleting(false);
    fetchClientes(busca);
  };

  return (
    <AppLayout title="Gerenciar Clientes">
      <div className="space-y-6">
        <Card>
          <CardContent className="pt-6 space-y-3">
            <div className="flex flex-col sm:flex-row gap-3">
              <Input
                placeholder="Buscar por nome ou CPF..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && fetchClientes(busca)}
                className="min-h-[44px] rounded-xl"
              />
              <Button onClick={() => fetchClientes(busca)} disabled={loading} className="w-full sm:w-auto min-h-[44px] rounded-xl">
                <Search className="w-4 h-4 mr-1" /> Buscar
              </Button>
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={showInativos} onChange={(e) => setShowInativos(e.target.checked)} />
              Mostrar inativos
            </label>
          </CardContent>
        </Card>

        {/* Client Cards Grid */}
        {loading ? (
          <p className="text-muted-foreground text-center py-8">Carregando...</p>
        ) : clientes.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">Nenhum cliente encontrado.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {clientes.map((c) => {
              const age = calcAge(c.data_nascimento);
              const hasCicloAtivo = (c.ciclos || []).some((ci: any) => ci.status === "ativo");
              return (
                <Card
                  key={c.id}
                  className={`relative overflow-hidden transition-all hover:shadow-xl hover:-translate-y-0.5 cursor-pointer group ${!c.ativo ? "opacity-60" : ""}`}
                  onClick={() => navigate(`/pacientes/${c.id}`)}
                >
                  {/* Active cycle indicator */}
                  {hasCicloAtivo && (
                    <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-emerald-500 to-green-400" />
                  )}
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <GenderIcon sexo={c.sexo} nome={c.nome} age={age} />
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm truncate">{c.nome}</p>
                        <p className="text-xs text-muted-foreground font-mono mt-0.5">{formatCpfMask(c.cpf)}</p>
                        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                          {age !== null && (
                            <Badge variant="secondary" className="text-[10px] rounded-lg px-1.5 py-0">
                              {age} anos
                            </Badge>
                          )}
                          <Badge variant={c.ativo ? "outline" : "destructive"} className="text-[10px] rounded-lg px-1.5 py-0">
                            {c.ativo ? "Ativo" : "Inativo"}
                          </Badge>
                          {hasCicloAtivo && (
                            <Badge className="text-[10px] rounded-lg px-1.5 py-0 bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
                              Ciclo ativo
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    {/* Actions */}
                    <div className="flex items-center gap-1 mt-3 pt-2 border-t border-border/30" onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="sm" onClick={() => navigate(`/pacientes/${c.id}`)} className="h-8 px-2 rounded-lg text-xs flex-1">
                        <Eye className="w-3.5 h-3.5 mr-1" /> Ver
                      </Button>
                      {isMaster && (
                        <>
                          {c.ativo ? (
                            <Button variant="ghost" size="sm" onClick={() => setDeleteClient(c)} className="h-8 w-8 p-0 rounded-lg text-destructive">
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          ) : (
                            <>
                              <Button variant="ghost" size="sm" onClick={() => handleReactivate(c)} className="h-8 w-8 p-0 rounded-lg text-green-500">
                                <RotateCcw className="w-3.5 h-3.5" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => { setSenhaMaster(""); setHardDeleteClient(c); }} className="h-8 w-8 p-0 rounded-lg text-destructive" title="Excluir permanentemente">
                                <AlertTriangle className="w-3.5 h-3.5" />
                              </Button>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Soft Delete Dialog */}
      {deleteClient && (
        <Dialog open onOpenChange={() => setDeleteClient(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle className="text-destructive">Excluir Cliente</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 space-y-2">
                <p className="text-sm font-semibold">{deleteClient.nome}</p>
                <p className="text-sm font-mono">{deleteClient.cpf}</p>
                <p className="text-sm text-muted-foreground mt-2">
                  ⚠️ O cliente será desativado. Dados históricos serão mantidos.
                </p>
              </div>
              <div className="flex gap-3 justify-end">
                <Button variant="outline" onClick={() => setDeleteClient(null)} className="min-h-[44px] rounded-xl">Cancelar</Button>
                <Button variant="destructive" onClick={handleDelete} disabled={deleting} className="min-h-[44px] rounded-xl">
                  {deleting ? "Excluindo..." : "Confirmar"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Hard Delete Dialog */}
      {hardDeleteClient && (
        <Dialog open onOpenChange={() => setHardDeleteClient(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-destructive flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" /> Exclusão Permanente
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 space-y-2">
                <p className="text-sm font-semibold">{hardDeleteClient.nome}</p>
                <p className="text-sm font-mono">{hardDeleteClient.cpf}</p>
                <p className="text-sm text-destructive font-semibold mt-2">
                  🚨 ATENÇÃO: Esta ação é IRREVERSÍVEL! Todos os dados serão apagados permanentemente.
                </p>
              </div>
              <div className="space-y-2">
                <Label>Senha Master de Exclusão</Label>
                <Input
                  type="password"
                  autoComplete="off"
                  placeholder="Digite a senha master"
                  value={senhaMaster}
                  onChange={(e) => setSenhaMaster(e.target.value)}
                  className="min-h-[44px] rounded-xl"
                />
              </div>
              <div className="flex gap-3 justify-end">
                <Button variant="outline" onClick={() => setHardDeleteClient(null)} className="min-h-[44px] rounded-xl">Cancelar</Button>
                <Button
                  variant="destructive"
                  onClick={handleHardDelete}
                  disabled={hardDeleting || !senhaMaster.trim()}
                  className="min-h-[44px] rounded-xl"
                >
                  {hardDeleting ? "Excluindo..." : "Excluir Permanentemente"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </AppLayout>
  );
}
