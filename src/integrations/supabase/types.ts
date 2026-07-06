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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      deleted_leads: {
        Row: {
          cnpj: string | null
          created_at: string
          id: string
          nome_empresa: string | null
          telefone: string | null
        }
        Insert: {
          cnpj?: string | null
          created_at?: string
          id?: string
          nome_empresa?: string | null
          telefone?: string | null
        }
        Update: {
          cnpj?: string | null
          created_at?: string
          id?: string
          nome_empresa?: string | null
          telefone?: string | null
        }
        Relationships: []
      }
      leads: {
        Row: {
          cidade: string | null
          cnpj: string | null
          commercial_score: number | null
          created_at: string
          debug_raw_data: Json | null
          endereco: string | null
          fonte: string | null
          google_owner_replied_recently: boolean | null
          google_profile_complete: boolean | null
          google_rating: number | null
          google_review_count: number | null
          google_scrape_status: string | null
          id: string
          instagram: string | null
          instagram_last_post_days: number | null
          instagram_profile_is_person: boolean | null
          instagram_scrape_status: string | null
          justificativa: string | null
          lead_quality: string | null
          linkedin: string | null
          mensagem_gerada_em: string | null
          mensagem_personalizada: string | null
          mensagem_pontos_usados: Json | null
          mensagem_status: string | null
          nome_decisor: string | null
          nome_empresa: string
          phone_type: string | null
          query_origem: string | null
          score: number | null
          score_breakdown: Json | null
          sinais_negativos: Json | null
          sinais_positivos: Json | null
          site: string | null
          tags: string[] | null
          telefone: string | null
          termo_pesquisa: string | null
          tier: string | null
        }
        Insert: {
          cidade?: string | null
          cnpj?: string | null
          commercial_score?: number | null
          created_at?: string
          debug_raw_data?: Json | null
          endereco?: string | null
          fonte?: string | null
          google_owner_replied_recently?: boolean | null
          google_profile_complete?: boolean | null
          google_rating?: number | null
          google_review_count?: number | null
          google_scrape_status?: string | null
          id?: string
          instagram?: string | null
          instagram_last_post_days?: number | null
          instagram_profile_is_person?: boolean | null
          instagram_scrape_status?: string | null
          justificativa?: string | null
          lead_quality?: string | null
          linkedin?: string | null
          mensagem_gerada_em?: string | null
          mensagem_personalizada?: string | null
          mensagem_pontos_usados?: Json | null
          mensagem_status?: string | null
          nome_decisor?: string | null
          nome_empresa: string
          phone_type?: string | null
          query_origem?: string | null
          score?: number | null
          score_breakdown?: Json | null
          sinais_negativos?: Json | null
          sinais_positivos?: Json | null
          site?: string | null
          tags?: string[] | null
          telefone?: string | null
          termo_pesquisa?: string | null
          tier?: string | null
        }
        Update: {
          cidade?: string | null
          cnpj?: string | null
          commercial_score?: number | null
          created_at?: string
          debug_raw_data?: Json | null
          endereco?: string | null
          fonte?: string | null
          google_owner_replied_recently?: boolean | null
          google_profile_complete?: boolean | null
          google_rating?: number | null
          google_review_count?: number | null
          google_scrape_status?: string | null
          id?: string
          instagram?: string | null
          instagram_last_post_days?: number | null
          instagram_profile_is_person?: boolean | null
          instagram_scrape_status?: string | null
          justificativa?: string | null
          lead_quality?: string | null
          linkedin?: string | null
          mensagem_gerada_em?: string | null
          mensagem_personalizada?: string | null
          mensagem_pontos_usados?: Json | null
          mensagem_status?: string | null
          nome_decisor?: string | null
          nome_empresa?: string
          phone_type?: string | null
          query_origem?: string | null
          score?: number | null
          score_breakdown?: Json | null
          sinais_negativos?: Json | null
          sinais_positivos?: Json | null
          site?: string | null
          tags?: string[] | null
          telefone?: string | null
          termo_pesquisa?: string | null
          tier?: string | null
        }
        Relationships: []
      }
      settings: {
        Row: {
          created_at: string
          id: string
          key: string
          updated_at: string
          value: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          key: string
          updated_at?: string
          value?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          key?: string
          updated_at?: string
          value?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      normalize_lead_phone: { Args: { _phone: string }; Returns: string }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
