import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Save } from "lucide-react";
import AppLayout from "@/components/AppLayout";

interface ConfigValues {
  timeout_sessao: string;
  score_minimo_ocr: string;
  validar_qualidade_imagem: string;
  senha_master_exclusao: string;
  dias_antecedencia_alerta: string;
  alerta_retirada_hoje: string;
  alerta_retirada_amanha: string;
  alerta_retirada_atrasada: string;
  dias_atraso_alerta: string;
}

const defaultConfig: ConfigValues = {
  timeout_sessao: "30",
  score_minimo_ocr: "70",
  validar_qualidade_imagem: "true",
  senha_master_exclusao: "",
  dias_antecedencia_alerta: "7",
  alerta_retirada_hoje: "true",
  alerta_retirada_amanha: "true",
  alerta_retirada_atrasada: "true",
  dias_atraso_alerta: "3",
};

export default function Configuracoes() {
  const { isMaster, user } = useAuth();
  const [config, setConfig] = useState<ConfigValues>(defaultConfig);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchConfig = async () => {
      const { data } = await supabase.from("configuracoes").select("chave, valor");
      if (data) {
        const map = { ...defaultConfig };
        data.forEach((c) => { if (c.chave in map) (map as any)[c.chave] = c.valor; });
        setConfig(map);
      }
      setLoading(false);
    };
    fetchConfig();
  }, []);

  if (!isMaster) {
    return (
      <AppLayout title="Configurações">
        <div className="flex items-center justify-center py-20">
          <p className="text-muted-foreground">Acesso restrito ao administrador.</p>
        </div>
      </AppLayout>
    );
  }

  const handleSave = async () => {
    setSaving(true);
    try {
      for (const [chave, valor] of Object.entries(config)) {
        await supabase.from("configuracoes").upsert({ chave, valor, updated_by: user?.id }, { onConflict: "chave" });
      }
      await supabase.from("logs").insert([{ user_id: user?.id, acao: "alterar_configuracao", detalhes: config as any }]);
      toast.success("Configurações salvas!");
    } catch {
      toast.error("Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppLayout title="Configurações">
      <div className="space-y-6">
        {loading ? (
          <p className="text-center text-muted-foreground py-8">Carregando...</p>
        ) : (
          <>
            <Card>
              <CardHeader><CardTitle className="text-lg">⏱️ Sessão</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Timeout de inatividade (minutos)</Label>
                  <div className="flex items-center gap-3">
                    <Input type="number" min={5} max={120} value={config.timeout_sessao}
                      onChange={(e) => setConfig({ ...config, timeout_sessao: e.target.value })} className="w-24 min-h-[44px]" />
                    <span className="text-sm text-muted-foreground">Padrão: 30 min</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    O usuário será desconectado automaticamente após esse período sem atividade.
                  </p>
                </div>
              </CardContent>
            </Card>


            <Card>
              <CardHeader><CardTitle className="text-lg">🧠 IA / OCR</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Score mínimo OCR (%)</Label>
                  <div className="flex items-center gap-3">
                    <Input type="number" min={0} max={100} value={config.score_minimo_ocr}
                      onChange={(e) => setConfig({ ...config, score_minimo_ocr: e.target.value })} className="w-24 min-h-[44px]" />
                  </div>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <div>
                    <Label>Validação de qualidade</Label>
                    <p className="text-xs text-muted-foreground mt-1">Verificar blur e resolução</p>
                  </div>
                  <Switch checked={config.validar_qualidade_imagem === "true"}
                    onCheckedChange={(c) => setConfig({ ...config, validar_qualidade_imagem: c ? "true" : "false" })} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-lg">📲 WhatsApp / Alertas</CardTitle></CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-2">
                  <Label>🔴 Alerta de receita vencendo</Label>
                  <div className="flex items-center gap-3">
                    <Input type="number" min={1} max={60} value={config.dias_antecedencia_alerta}
                      onChange={(e) => setConfig({ ...config, dias_antecedencia_alerta: e.target.value })} className="w-24 min-h-[44px]" />
                    <span className="text-sm text-muted-foreground">dias antes do vencimento</span>
                  </div>
                </div>

                <div className="border-t border-border" />

                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <div>
                    <Label>🟢 Retirada liberada hoje</Label>
                    <p className="text-xs text-muted-foreground mt-1">Avisar quando a retirada está liberada no dia</p>
                  </div>
                  <Switch checked={config.alerta_retirada_hoje === "true"}
                    onCheckedChange={(c) => setConfig({ ...config, alerta_retirada_hoje: c ? "true" : "false" })} />
                </div>

                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <div>
                    <Label>🔵 Retirada liberada amanhã</Label>
                    <p className="text-xs text-muted-foreground mt-1">Lembrete na véspera da data de retirada</p>
                  </div>
                  <Switch checked={config.alerta_retirada_amanha === "true"}
                    onCheckedChange={(c) => setConfig({ ...config, alerta_retirada_amanha: c ? "true" : "false" })} />
                </div>

                <div className="border-t border-border" />

                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div>
                      <Label>🟡 Retirada atrasada</Label>
                      <p className="text-xs text-muted-foreground mt-1">Avisar quando o paciente não compareceu na data</p>
                    </div>
                    <Switch checked={config.alerta_retirada_atrasada === "true"}
                      onCheckedChange={(c) => setConfig({ ...config, alerta_retirada_atrasada: c ? "true" : "false" })} />
                  </div>
                  {config.alerta_retirada_atrasada === "true" && (
                    <div className="flex items-center gap-3 pl-3">
                      <Input type="number" min={1} max={30} value={config.dias_atraso_alerta}
                        onChange={(e) => setConfig({ ...config, dias_atraso_alerta: e.target.value })} className="w-24 min-h-[44px]" />
                      <span className="text-sm text-muted-foreground">dias de atraso para alertar</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-lg">🔐 Segurança</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Senha master para exclusão permanente</Label>
                  <Input
                    type="password"
                    autoComplete="off"
                    placeholder="Definir senha de exclusão permanente"
                    value={config.senha_master_exclusao}
                    onChange={(e) => setConfig({ ...config, senha_master_exclusao: e.target.value })}
                    className="min-h-[44px]"
                  />
                  <p className="text-xs text-muted-foreground">
                    Essa senha será exigida ao excluir permanentemente um cliente inativo.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Button onClick={handleSave} disabled={saving} className="w-full min-h-[44px]" size="lg">
              <Save className="w-5 h-5 mr-2" />
              {saving ? "Salvando..." : "Salvar Configurações"}
            </Button>
          </>
        )}
      </div>
    </AppLayout>
  );
}
