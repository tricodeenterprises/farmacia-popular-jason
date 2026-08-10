export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      ciclos: {
        Row: {
          created_at: string
          data_fim: string
          data_inicio: string
          encerrado_em: string | null
          encerrado_por: string | null
          id: string
          intervalo_dias: number
          limite_maximo: number
          motivo_encerramento: string | null
          paciente_id: string
          receita_id: string
          status: string
          total_dispensacoes: number
          ultima_retirada: string | null
        }
        Insert: {
          created_at?: string
          data_fim: string
          data_inicio: string
          encerrado_em?: string | null
          encerrado_por?: string | null
          id?: string
          intervalo_dias?: number
          limite_maximo: number
          motivo_encerramento?: string | null
          paciente_id: string
          receita_id: string
          status?: string
          total_dispensacoes?: number
          ultima_retirada?: string | null
        }
        Update: {
          created_at?: string
          data_fim?: string
          data_inicio?: string
          encerrado_em?: string | null
          encerrado_por?: string | null
          id?: string
          intervalo_dias?: number
          limite_maximo?: number
          motivo_encerramento?: string | null
          paciente_id?: string
          receita_id?: string
          status?: string
          total_dispensacoes?: number
          ultima_retirada?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ciclos_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ciclos_receita_id_fkey"
            columns: ["receita_id"]
            isOneToOne: false
            referencedRelation: "receitas"
            referencedColumns: ["id"]
          },
        ]
      }
      configuracoes: {
        Row: {
          chave: string
          id: string
          updated_at: string
          updated_by: string | null
          valor: string
        }
        Insert: {
          chave: string
          id?: string
          updated_at?: string
          updated_by?: string | null
          valor: string
        }
        Update: {
          chave?: string
          id?: string
          updated_at?: string
          updated_by?: string | null
          valor?: string
        }
        Relationships: []
      }
      dispensacoes: {
        Row: {
          cancelada: boolean
          cancelada_por: string | null
          ciclo_id: string
          created_at: string
          data_dispensacao_real: string | null
          documento_representante_id: string | null
          id: string
          justificativa_cancelamento: string | null
          operador_id: string | null
          paciente_id: string
          procuracao_id: string | null
          registrada_por: string
          snapshot_ciclo: Json
          tipo_retirada: string
        }
        Insert: {
          cancelada?: boolean
          cancelada_por?: string | null
          ciclo_id: string
          created_at?: string
          data_dispensacao_real?: string | null
          documento_representante_id?: string | null
          id?: string
          justificativa_cancelamento?: string | null
          operador_id?: string | null
          paciente_id: string
          procuracao_id?: string | null
          registrada_por: string
          snapshot_ciclo: Json
          tipo_retirada: string
        }
        Update: {
          cancelada?: boolean
          cancelada_por?: string | null
          ciclo_id?: string
          created_at?: string
          data_dispensacao_real?: string | null
          documento_representante_id?: string | null
          id?: string
          justificativa_cancelamento?: string | null
          operador_id?: string | null
          paciente_id?: string
          procuracao_id?: string | null
          registrada_por?: string
          snapshot_ciclo?: Json
          tipo_retirada?: string
        }
        Relationships: [
          {
            foreignKeyName: "dispensacoes_ciclo_id_fkey"
            columns: ["ciclo_id"]
            isOneToOne: false
            referencedRelation: "ciclos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispensacoes_documento_representante_id_fkey"
            columns: ["documento_representante_id"]
            isOneToOne: false
            referencedRelation: "documentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispensacoes_operador_id_fkey"
            columns: ["operador_id"]
            isOneToOne: false
            referencedRelation: "operadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispensacoes_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispensacoes_procuracao_id_fkey"
            columns: ["procuracao_id"]
            isOneToOne: false
            referencedRelation: "documentos"
            referencedColumns: ["id"]
          },
        ]
      }
      documentos: {
        Row: {
          arquivo_url: string
          ciclo_id: string | null
          created_at: string
          dados_extraidos: Json | null
          id: string
          paciente_id: string
          score_confianca: number | null
          score_qualidade: number | null
          status: string
          tipo: string
          uploaded_by: string | null
          validade_ate: string
          versao: number
        }
        Insert: {
          arquivo_url: string
          ciclo_id?: string | null
          created_at?: string
          dados_extraidos?: Json | null
          id?: string
          paciente_id: string
          score_confianca?: number | null
          score_qualidade?: number | null
          status?: string
          tipo: string
          uploaded_by?: string | null
          validade_ate: string
          versao?: number
        }
        Update: {
          arquivo_url?: string
          ciclo_id?: string | null
          created_at?: string
          dados_extraidos?: Json | null
          id?: string
          paciente_id?: string
          score_confianca?: number | null
          score_qualidade?: number | null
          status?: string
          tipo?: string
          uploaded_by?: string | null
          validade_ate?: string
          versao?: number
        }
        Relationships: [
          {
            foreignKeyName: "documentos_ciclo_id_fkey"
            columns: ["ciclo_id"]
            isOneToOne: false
            referencedRelation: "ciclos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
        ]
      }
      galeria_temp: {
        Row: {
          arquivo_url: string
          created_at: string
          id: string
          paciente_id: string
          uploaded_by: string | null
        }
        Insert: {
          arquivo_url: string
          created_at?: string
          id?: string
          paciente_id: string
          uploaded_by?: string | null
        }
        Update: {
          arquivo_url?: string
          created_at?: string
          id?: string
          paciente_id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "galeria_temp_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
        ]
      }
      logs: {
        Row: {
          acao: string
          created_at: string
          detalhes: Json | null
          id: string
          user_id: string | null
        }
        Insert: {
          acao: string
          created_at?: string
          detalhes?: Json | null
          id?: string
          user_id?: string | null
        }
        Update: {
          acao?: string
          created_at?: string
          detalhes?: Json | null
          id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      medicos: {
        Row: {
          created_at: string
          crm: string
          especialidade: string | null
          id: string
          nome: string
        }
        Insert: {
          created_at?: string
          crm: string
          especialidade?: string | null
          id?: string
          nome: string
        }
        Update: {
          created_at?: string
          crm?: string
          especialidade?: string | null
          id?: string
          nome?: string
        }
        Relationships: []
      }
      operadores: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          nome: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome?: string
        }
        Relationships: []
      }
      pacientes: {
        Row: {
          ativo: boolean
          cpf: string
          created_at: string
          data_nascimento: string | null
          endereco: string | null
          id: string
          nome: string
          sexo: string | null
          telefone: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          cpf: string
          created_at?: string
          data_nascimento?: string | null
          endereco?: string | null
          id?: string
          nome: string
          sexo?: string | null
          telefone?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          cpf?: string
          created_at?: string
          data_nascimento?: string | null
          endereco?: string | null
          id?: string
          nome?: string
          sexo?: string | null
          telefone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          nome: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
          username: string | null
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id: string
          nome: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          username?: string | null
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      receitas: {
        Row: {
          arquivo_url: string
          created_at: string
          crm: string | null
          dados_extraidos: Json | null
          data_emissao: string
          id: string
          nome_medico: string | null
          nome_paciente_ocr: string | null
          operador_id: string | null
          paciente_id: string
          score_confianca: number | null
          score_qualidade: number | null
          tipo: string
          uploaded_by: string | null
          validade_ate: string
        }
        Insert: {
          arquivo_url: string
          created_at?: string
          crm?: string | null
          dados_extraidos?: Json | null
          data_emissao: string
          id?: string
          nome_medico?: string | null
          nome_paciente_ocr?: string | null
          operador_id?: string | null
          paciente_id: string
          score_confianca?: number | null
          score_qualidade?: number | null
          tipo?: string
          uploaded_by?: string | null
          validade_ate: string
        }
        Update: {
          arquivo_url?: string
          created_at?: string
          crm?: string | null
          dados_extraidos?: Json | null
          data_emissao?: string
          id?: string
          nome_medico?: string | null
          nome_paciente_ocr?: string | null
          operador_id?: string | null
          paciente_id?: string
          score_confianca?: number | null
          score_qualidade?: number | null
          tipo?: string
          uploaded_by?: string | null
          validade_ate?: string
        }
        Relationships: [
          {
            foreignKeyName: "receitas_operador_id_fkey"
            columns: ["operador_id"]
            isOneToOne: false
            referencedRelation: "operadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receitas_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
        ]
      }
      sugestoes: {
        Row: {
          created_at: string
          id: string
          mensagem: string
          tela: string | null
          tipo: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          mensagem: string
          tela?: string | null
          tipo?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          mensagem?: string
          tela?: string | null
          tipo?: string
          user_id?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "master" | "operador" | "inspetor" | "chefe"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["master", "operador", "inspetor", "chefe"],
    },
  },
} as const
