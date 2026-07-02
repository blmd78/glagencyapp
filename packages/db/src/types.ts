export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      chatter_alias: {
        Row: {
          chatter_id: string
          created_at: string
          id: string
          raw_label: string
          raw_label_norm: string
          source: string
        }
        Insert: {
          chatter_id: string
          created_at?: string
          id?: string
          raw_label: string
          raw_label_norm: string
          source: string
        }
        Update: {
          chatter_id?: string
          created_at?: string
          id?: string
          raw_label?: string
          raw_label_norm?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "chatter_alias_chatter_id_fkey"
            columns: ["chatter_id"]
            isOneToOne: false
            referencedRelation: "chatters"
            referencedColumns: ["id"]
          },
        ]
      }
      chatter_creator_daily: {
        Row: {
          ca: number
          ca_ppv: number
          ca_tips: number
          chatter_id: string
          creator_id: string
          date: string
          propose: number
          vendu: number
        }
        Insert: {
          ca?: number
          ca_ppv?: number
          ca_tips?: number
          chatter_id: string
          creator_id: string
          date: string
          propose?: number
          vendu?: number
        }
        Update: {
          ca?: number
          ca_ppv?: number
          ca_tips?: number
          chatter_id?: string
          creator_id?: string
          date?: string
          propose?: number
          vendu?: number
        }
        Relationships: [
          {
            foreignKeyName: "chatter_creator_daily_chatter_id_fkey"
            columns: ["chatter_id"]
            isOneToOne: false
            referencedRelation: "chatters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chatter_creator_daily_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
        ]
      }
      chatter_creators: {
        Row: {
          active: boolean
          chatter_id: string
          creator_id: string
          is_manual: boolean
          role: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          chatter_id: string
          creator_id: string
          is_manual?: boolean
          role?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          chatter_id?: string
          creator_id?: string
          is_manual?: boolean
          role?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chatter_creators_chatter_id_fkey"
            columns: ["chatter_id"]
            isOneToOne: false
            referencedRelation: "chatters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chatter_creators_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
        ]
      }
      chatter_daily: {
        Row: {
          ca: number
          ca_ppv: number
          ca_tips: number
          chatter_id: string
          date: string
          presence_active_h: number
          presence_idle_h: number
          propose: number
          reactivite_sec: number | null
          vendu: number
        }
        Insert: {
          ca?: number
          ca_ppv?: number
          ca_tips?: number
          chatter_id: string
          date: string
          presence_active_h?: number
          presence_idle_h?: number
          propose?: number
          reactivite_sec?: number | null
          vendu?: number
        }
        Update: {
          ca?: number
          ca_ppv?: number
          ca_tips?: number
          chatter_id?: string
          date?: string
          presence_active_h?: number
          presence_idle_h?: number
          propose?: number
          reactivite_sec?: number | null
          vendu?: number
        }
        Relationships: [
          {
            foreignKeyName: "chatter_daily_chatter_id_fkey"
            columns: ["chatter_id"]
            isOneToOne: false
            referencedRelation: "chatters"
            referencedColumns: ["id"]
          },
        ]
      }
      chatter_daily_reach: {
        Row: {
          chatter_id: string
          date: string
          fans_distincts: number
          messages: number
          mots: number
          ppv_proposes: number
        }
        Insert: {
          chatter_id: string
          date: string
          fans_distincts?: number
          messages?: number
          mots?: number
          ppv_proposes?: number
        }
        Update: {
          chatter_id?: string
          date?: string
          fans_distincts?: number
          messages?: number
          mots?: number
          ppv_proposes?: number
        }
        Relationships: [
          {
            foreignKeyName: "chatter_daily_reach_chatter_id_fkey"
            columns: ["chatter_id"]
            isOneToOne: false
            referencedRelation: "chatters"
            referencedColumns: ["id"]
          },
        ]
      }
      chatters: {
        Row: {
          access_revoked: boolean
          active: boolean
          config_updated_at: string | null
          created_at: string
          display_name: string
          email: string | null
          id: string
          mypuls_user_id: string | null
          role: string | null
          team_id: string | null
        }
        Insert: {
          access_revoked?: boolean
          active?: boolean
          config_updated_at?: string | null
          created_at?: string
          display_name: string
          email?: string | null
          id?: string
          mypuls_user_id?: string | null
          role?: string | null
          team_id?: string | null
        }
        Update: {
          access_revoked?: boolean
          active?: boolean
          config_updated_at?: string | null
          created_at?: string
          display_name?: string
          email?: string | null
          id?: string
          mypuls_user_id?: string | null
          role?: string | null
          team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chatters_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_daily: {
        Row: {
          ca: number
          ca_ppv: number
          ca_renew: number
          ca_tips: number
          creator_id: string
          date: string
          new_subs: number
          subs_active: number
        }
        Insert: {
          ca?: number
          ca_ppv?: number
          ca_renew?: number
          ca_tips?: number
          creator_id: string
          date: string
          new_subs?: number
          subs_active?: number
        }
        Update: {
          ca?: number
          ca_ppv?: number
          ca_renew?: number
          ca_tips?: number
          creator_id?: string
          date?: string
          new_subs?: number
          subs_active?: number
        }
        Relationships: [
          {
            foreignKeyName: "creator_daily_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
        ]
      }
      creators: {
        Row: {
          active: boolean
          created_at: string
          excluded: boolean
          excluded_reason: string | null
          id: string
          is_private: boolean
          is_secondary: boolean
          mypuls_creator_id: string | null
          name: string
          primary_creator_id: string | null
          team_id: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          excluded?: boolean
          excluded_reason?: string | null
          id?: string
          is_private?: boolean
          is_secondary?: boolean
          mypuls_creator_id?: string | null
          name: string
          primary_creator_id?: string | null
          team_id?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          excluded?: boolean
          excluded_reason?: string | null
          id?: string
          is_private?: boolean
          is_secondary?: boolean
          mypuls_creator_id?: string | null
          name?: string
          primary_creator_id?: string | null
          team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "creators_primary_creator_id_fkey"
            columns: ["primary_creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creators_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      period_snapshot_kpi: {
        Row: {
          current_week_days: number
          current_week_end: string
          current_week_start: string
          last_update: string
          max_missed_shifts: number
          n_active: number
          n_inactive: number
          period_days: number
          period_end: string
          period_prev_end: string
          period_prev_start: string
          period_start: string
          sheet_used: string
          source: string
          total_ca: number
          total_ca_prev: number
          week_end: string
          week_start: string
        }
        Insert: {
          current_week_days: number
          current_week_end: string
          current_week_start: string
          last_update: string
          max_missed_shifts?: number
          n_active: number
          n_inactive: number
          period_days: number
          period_end: string
          period_prev_end: string
          period_prev_start: string
          period_start: string
          sheet_used: string
          source: string
          total_ca: number
          total_ca_prev: number
          week_end: string
          week_start: string
        }
        Update: {
          current_week_days?: number
          current_week_end?: string
          current_week_start?: string
          last_update?: string
          max_missed_shifts?: number
          n_active?: number
          n_inactive?: number
          period_days?: number
          period_end?: string
          period_prev_end?: string
          period_prev_start?: string
          period_start?: string
          sheet_used?: string
          source?: string
          total_ca?: number
          total_ca_prev?: number
          week_end?: string
          week_start?: string
        }
        Relationships: []
      }
      profile_creators: {
        Row: {
          creator_id: string
          profile_id: string
        }
        Insert: {
          creator_id: string
          profile_id: string
        }
        Update: {
          creator_id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_creators_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_creators_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: []
      }
      teams: {
        Row: {
          active: boolean
          created_at: string
          id: string
          lead_name: string | null
          name: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          lead_name?: string | null
          name: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          lead_name?: string | null
          name?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      app_role: "admin" | "manager" | "member"
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
      app_role: ["admin", "manager", "member"],
    },
  },
} as const

