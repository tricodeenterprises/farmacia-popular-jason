import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function inferImageMimeType(base64: string): string {
  if (base64.startsWith("iVBORw0KGgo")) return "image/png";
  if (base64.startsWith("UklGR")) return "image/webp";
  if (base64.startsWith("R0lGOD")) return "image/gif";
  return "image/jpeg";
}

function normalizeSchemaForGemini(schema: any): any {
  if (Array.isArray(schema)) return schema.map(normalizeSchemaForGemini);
  if (!schema || typeof schema !== "object") return schema;

  const out: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(schema)) {
    // O schema do generateContent/Gemini 2.5 não precisa de additionalProperties
    // e pode rejeitar alguns formatos mais amplos de JSON Schema.
    if (key === "additionalProperties") continue;
    out[key] = normalizeSchemaForGemini(value);
  }

  return out;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { imageBase64, tipo, contexto_ciclo } = await req.json();
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not configured");

    if (!imageBase64 || typeof imageBase64 !== "string") {
      return new Response(JSON.stringify({ error: "Imagem não informada." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!["documento", "receita", "cupom_fiscal"].includes(tipo)) {
      return new Response(JSON.stringify({ error: "Tipo de OCR inválido." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const qualityInstructions = `

AVALIAÇÃO DE QUALIDADE DA IMAGEM:
Avalie a qualidade da imagem recebida e retorne:
- score_qualidade: número de 0 a 100 representando a qualidade geral da imagem (nitidez, iluminação, ângulo, legibilidade)
  - 90-100: Excelente, todos os dados perfeitamente legíveis
  - 70-89: Boa, maioria dos dados legíveis com alguma dificuldade
  - 50-69: Regular, vários campos difíceis de ler
  - 30-49: Ruim, poucos campos identificáveis
  - 0-29: Muito ruim, praticamente ilegível
- score_confianca: número de 0 a 100 representando sua confiança nos dados extraídos (quanto você tem certeza de que os valores estão corretos)
- problemas_imagem: lista de problemas encontrados na imagem (ex: "Imagem borrada", "Reflexo na foto", "Ângulo torto", "Iluminação fraca", "Parte do documento cortada")

Se a qualidade for baixa (< 50), ainda assim TENTE extrair o máximo de dados possível. Retorne os dados que conseguir junto com os scores baixos. NÃO diga simplesmente "ilegível" — extraia o que for possível e avise sobre a baixa confiança.`;

    let systemPrompt = "";
    if (tipo === "documento") {
      systemPrompt = `Você é um sistema de OCR especializado em documentos brasileiros (RG, CPF, CNH).
Extraia os seguintes campos do documento na imagem:
- nome_completo: nome COMPLETO da pessoa, exatamente como está escrito no documento. NÃO abrevie, NÃO omita sobrenomes, NÃO altere a grafia. Transcreva o nome na íntegra.
- cpf: número do CPF (somente dígitos, 11 caracteres)
- rg: número do RG
- data_nascimento: data de nascimento (formato YYYY-MM-DD)
- endereco: endereço completo se disponível
- sexo: "M" ou "F" se identificável no documento
${qualityInstructions}
Responda APENAS com JSON válido usando a tool fornecida. Se não conseguir ler algum campo, use null. Sempre tente extrair o máximo possível.`;
    } else if (tipo === "receita") {
      systemPrompt = `Você é um sistema de OCR especializado em receitas médicas brasileiras.
Extraia os seguintes campos da receita na imagem:
- data_emissao: data de emissão da receita (formato YYYY-MM-DD)
- nome_paciente: nome do paciente na receita
- tipo_receita: "medicamento" ou "fralda" (detecte pelo conteúdo da receita)
- medicamentos: lista de medicamentos ou itens prescritos

VALIDAÇÃO ESPECIAL DA DATA DE EMISSÃO:
A data de emissão é CRÍTICA. Analise com extremo cuidado:
- data_manuscrita: boolean — se a data foi escrita à mão (true) ou digitada/impressa (false)
- data_confianca: número de 0 a 100 representando sua confiança ESPECÍFICA na data extraída:
  - 90-100: Data claramente legível, sem ambiguidade (impressa ou caligrafia muito boa)
  - 70-89: Data legível mas com alguma dificuldade (caligrafia razoável)
  - 50-69: Data parcialmente legível, possível confusão entre dígitos (ex: 1/7, 3/8, 6/0)
  - 30-49: Data difícil de ler, alta chance de erro
  - 0-29: Data praticamente ilegível, 0% de chance de estar correta
- data_observacoes: string descrevendo problemas específicos com a data (ex: "O mês pode ser 03 ou 08", "O ano está cortado", "Dígitos sobrepostos")
- data_alternativa: se houver ambiguidade, forneça a interpretação alternativa da data (formato YYYY-MM-DD)

Se a data for manuscrita e a confiança for menor que 70%, SEMPRE forneça data_alternativa com a outra interpretação possível.
Datas no formato DD/MM/YYYY (padrão brasileiro). Cuidado com dígitos ambíguos em manuscrito: 1↔7, 3↔8, 5↔6, 0↔6, 4↔9.
${qualityInstructions}
Responda APENAS com JSON válido usando a tool fornecida. Se não conseguir ler algum campo, use null. Sempre tente extrair o máximo possível.`;
    } else if (tipo === "cupom_fiscal") {
      let contextoStr = "";
      if (contexto_ciclo) {
        contextoStr = `
CONTEXTO DO CICLO ATUAL:
- Data de emissão da receita: ${contexto_ciclo.data_emissao_receita || "N/A"}
- Validade da receita: ${contexto_ciclo.validade_receita || "N/A"}
- Última retirada: ${contexto_ciclo.ultima_retirada || "Nenhuma"}
- Intervalo entre retiradas: ${contexto_ciclo.intervalo_dias || 30} dias
- Dispensações realizadas: ${contexto_ciclo.total_dispensacoes || 0} / ${contexto_ciclo.limite_maximo || "N/A"}
- Tipo: ${contexto_ciclo.tipo || "medicamento"}
`;
      }

      systemPrompt = `Você é um sistema de OCR e VALIDAÇÃO especializado em cupons fiscais do programa Farmácia Popular do Brasil.

IMPORTANTE — SELEÇÃO DO CUPOM CORRETO:
- Se a imagem contiver mais de um cupom ou documento, IGNORE qualquer cupom que contenha QR code.
- O ÚNICO cupom válido é aquele que apresenta a "RELAÇÃO DE MEDICAMENTOS" (tabela com nomes de medicamentos, quantidades e datas) e que possui uma ASSINATURA manuscrita ou digital registrada.
- Se não encontrar um cupom com relação de medicamentos e assinatura, retorne o campo "erro" com a mensagem "Cupom com QR code detectado. Envie o cupom com a relação de medicamentos e assinatura." e retorne data_compra como null.
- NUNCA extraia dados de um cupom que contenha QR code — mesmo que haja datas visíveis nele.

O cupom válido contém uma tabela de medicamentos com colunas. Na tabela de medicamentos existem duas colunas de data importantes:
- NO LADO ESQUERDO da tabela: a data da DISPENSAÇÃO/COMPRA atual (quando o medicamento foi retirado), geralmente no formato DD/MM (sem ano).
- NO LADO DIREITO da tabela: a coluna "PROX.COM" (Próxima Compra), que contém a data da PRÓXIMA retirada permitida no formato DD/MM/AA.

ATENÇÃO CRÍTICA — CUPONS TÉRMICOS COM BORDA ESQUERDA CORTADA:
Cupons fiscais térmicos frequentemente têm a MARGEM ESQUERDA CORTADA na foto. Isso faz o primeiro dígito do dia da coluna esquerda (data da compra) DESAPARECER. Exemplos:
- Você vê "5/07" mas o real pode ser "15/07" ou "25/07" (o "1" ou "2" foi cortado).
- Você vê "2/08" mas o real pode ser "12/08" ou "22/08".
- Se o dia aparecer com apenas 1 dígito e/ou o traço "/" estiver muito próximo da borda esquerda, ASSUMA que o primeiro dígito foi cortado.

REGRA DE OURO PARA DESAMBIGUAR A DATA DE COMPRA:
1. Extraia a data da coluna PROX.COM (essa raramente é cortada porque fica no lado direito).
2. Sabendo que PROX.COM = data_compra + ${contexto_ciclo?.intervalo_dias || 30} dias (aproximadamente, +1 dia), CALCULE a data_compra esperada: PROX.COM - ${(contexto_ciclo?.intervalo_dias || 30) + 1} dias.
3. Compare o dia calculado com o dia parcialmente visível na coluna esquerda. Se o dia visível tem apenas 1 dígito e o calculado tem 2 dígitos terminando no mesmo dígito visível, use o CALCULADO (ex: visível "5/07", calculado "15/07" → use 15/07).
4. Só use o dia visível literal quando ele bater exatamente com o calculado OU quando não houver PROX.COM legível.

REGRAS DE EXTRAÇÃO:
1. data_compra: Data da dispensação/retirada atual em YYYY-MM-DD. Aplique a regra de ouro acima. Se PROX.COM estiver disponível, PREFIRA o valor calculado (PROX.COM - intervalo) quando houver ambiguidade na leitura.
2. data_proxima_retirada: A data da coluna PROX.COM (lado DIREITO). Ex: "14/08/26" → "2026-08-14".
3. data_compra_observacoes: string curta explicando como você chegou à data (ex: "Lida diretamente", "Recalculada a partir de PROX.COM 14/08/26 - 30 dias porque a borda esquerda parecia cortada").

Extraia também:
- valor_total: valor total (V.MS + V.BEN somados)
- itens: lista dos medicamentos. Para CADA item, retorne um objeto com:
    * codigo: código interno do medicamento exibido no cupom (geralmente uma sequência numérica que aparece junto da linha do medicamento — pode estar rotulado como "Cód.", "Código", "Item" ou simplesmente sem rótulo). Se não houver, use null.
    * nome: nome/descrição do medicamento exatamente como impresso.
    * quantidade: quantidade dispensada (string com o número, ex: "30", "1", "60"). Se não houver, use null.
- cnpj_farmacia: CNPJ da farmácia
- numero_cupom: número do cupom fiscal se visível
- nome_paciente: nome do paciente/beneficiário (campo ASS ou similar)
- cartao_sus: número do cartão SUS se visível

VALIDAÇÃO LÓGICA:
${contextoStr}
Com base nos dados do ciclo, valide:
1. A data_compra está dentro do período de validade da receita (data_emissao_receita + 180 dias)?
2. O intervalo desde a última retirada respeita o mínimo de ${contexto_ciclo?.intervalo_dias || 30} dias?
3. A data_proxima_retirada extraída da coluna PROX.COM é a referência principal para a próxima retirada.

Preencha o campo "validacao" com:
- proxima_retirada: a data da coluna PROX.COM (formato YYYY-MM-DD). Se não encontrar, calcule data_compra + intervalo_dias.
- dentro_validade: true/false (data_compra dentro da validade da receita)
- intervalo_respeitado: true/false (respeitou intervalo mínimo desde última retirada)
- observacoes: análise detalhada das datas encontradas, incluindo se houve recálculo por borda cortada.

ATENÇÃO com formatos de data: no cupom, datas podem aparecer como DD/MM/YY (ex: 01/04/26 = 2026-04-01) ou DD/MM/YYYY. Converta SEMPRE para YYYY-MM-DD.
${qualityInstructions}
Responda APENAS com JSON válido usando a tool fornecida.`;

    }

    const qualityProps = {
      score_qualidade: { type: "number", description: "Qualidade da imagem (0-100)" },
      score_confianca: { type: "number", description: "Confiança nos dados extraídos (0-100)" },
      problemas_imagem: { type: "array", items: { type: "string" }, description: "Lista de problemas na imagem", nullable: true },
    };

    const tools = tipo === "documento" ? [
      {
        type: "function",
        function: {
          name: "extract_document",
          description: "Extrair dados do documento de identidade brasileiro",
          parameters: {
            type: "object",
            properties: {
              nome_completo: { type: "string", nullable: true },
              cpf: { type: "string", nullable: true },
              rg: { type: "string", nullable: true },
              data_nascimento: { type: "string", nullable: true },
              endereco: { type: "string", nullable: true },
              sexo: { type: "string", enum: ["M", "F"], nullable: true },
              erro: { type: "string", nullable: true },
              ...qualityProps,
            },
            required: ["nome_completo", "cpf", "rg", "score_qualidade", "score_confianca"],
            additionalProperties: false,
          },
        },
      },
    ] : tipo === "cupom_fiscal" ? [
      {
        type: "function",
        function: {
          name: "extract_cupom",
          description: "Extrair e validar dados do cupom fiscal de farmácia",
          parameters: {
            type: "object",
            properties: {
              data_compra: { type: "string", description: "Data da compra/retirada (YYYY-MM-DD)", nullable: true },
              data_proxima_retirada: { type: "string", description: "Data da coluna PROX.COM (YYYY-MM-DD)", nullable: true },
              valor_total: { type: "string", nullable: true },
              itens: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    codigo: { type: "string", description: "Código interno do medicamento no cupom", nullable: true },
                    nome: { type: "string", description: "Nome/descrição do medicamento", nullable: true },
                    quantidade: { type: "string", description: "Quantidade dispensada", nullable: true },
                  },
                  required: ["nome"],
                  additionalProperties: false,
                },
                nullable: true,
              },
              data_compra_observacoes: { type: "string", description: "Como a data_compra foi determinada (leitura direta ou recalculada por borda cortada)", nullable: true },
              cnpj_farmacia: { type: "string", nullable: true },
              numero_cupom: { type: "string", nullable: true },
              nome_paciente: { type: "string", description: "Nome do paciente/beneficiário", nullable: true },
              cartao_sus: { type: "string", description: "Número do cartão SUS", nullable: true },
              validacao: {
                type: "object",
                properties: {
                  proxima_retirada: { type: "string", description: "Data PROX.COM ou calculada (YYYY-MM-DD)", nullable: true },
                  dentro_validade: { type: "boolean", nullable: true },
                  intervalo_respeitado: { type: "boolean", nullable: true },
                  observacoes: { type: "string", nullable: true },
                },
                nullable: true,
              },
              erro: { type: "string", nullable: true },
              ...qualityProps,
            },
            required: ["data_compra", "score_qualidade", "score_confianca"],
            additionalProperties: false,
          },
        },
      },
    ] : [
      {
        type: "function",
        function: {
          name: "extract_receita",
          description: "Extrair dados da receita médica brasileira",
          parameters: {
            type: "object",
            properties: {
              data_emissao: { type: "string", nullable: true },
              nome_paciente: { type: "string", nullable: true },
              tipo_receita: { type: "string", enum: ["medicamento", "fralda"], nullable: true },
              medicamentos: { type: "array", items: { type: "string" }, nullable: true },
              data_manuscrita: { type: "boolean", description: "Se a data foi escrita à mão" },
              data_confianca: { type: "number", description: "Confiança específica na data extraída (0-100)" },
              data_observacoes: { type: "string", description: "Observações sobre a legibilidade da data", nullable: true },
              data_alternativa: { type: "string", description: "Interpretação alternativa da data se ambígua (YYYY-MM-DD)", nullable: true },
              erro: { type: "string", nullable: true },
              ...qualityProps,
            },
            required: ["data_emissao", "score_qualidade", "score_confianca", "data_manuscrita", "data_confianca"],
            additionalProperties: false,
          },
        },
      },
    ];

    const responseSchema = normalizeSchemaForGemini(tools[0].function.parameters);
    const mimeType = inferImageMimeType(imageBase64);

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent",
      {
        method: "POST",
        headers: {
          "x-goog-api-key": GEMINI_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: systemPrompt }],
          },
          contents: [
            {
              role: "user",
              parts: [
                { text: "Extraia os dados deste documento e avalie a qualidade da imagem." },
                {
                  inlineData: {
                    mimeType,
                    data: imageBase64,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema,
          },
        }),
      },
    );

    if (!response.ok) {
      const t = await response.text();
      console.error("Gemini error:", response.status, t);

      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Limite de requisições do Gemini excedido. Tente novamente em instantes." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      if (response.status === 400 || response.status === 403) {
        return new Response(
          JSON.stringify({ error: "Gemini recusou a requisição. Verifique a API key e a configuração da API." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      return new Response(JSON.stringify({ error: "Erro no processamento de IA" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await response.json();
    const text = result?.candidates?.[0]?.content?.parts
      ?.map((part: { text?: string }) => part?.text || "")
      .join("")
      .trim();

    let extracted: Record<string, unknown> = {};
    if (text) {
      try {
        extracted = JSON.parse(text);
      } catch {
        console.error("Resposta não-JSON do Gemini:", text);
        extracted = {
          erro: "Não foi possível processar a resposta da IA.",
          score_qualidade: 0,
          score_confianca: 0,
        };
      }
    } else {
      const finishReason = result?.candidates?.[0]?.finishReason;
      const blockReason = result?.promptFeedback?.blockReason;
      console.error("Gemini não retornou texto:", { finishReason, blockReason });
      extracted = {
        erro: blockReason
          ? `A análise da imagem foi bloqueada pelo Gemini (${blockReason}).`
          : "IA não retornou dados estruturados.",
        score_qualidade: 0,
        score_confianca: 0,
      };
    }

    return new Response(JSON.stringify(extracted), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("OCR error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});