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
    PostgrestVersion: "14.5"
  }
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
          shift: string | null
          team: string | null
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
          shift?: string | null
          team?: string | null
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
          shift?: string | null
          team?: string | null
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
      compta_day_entries: {
        Row: {
          bonus: number
          chatter_id: string
          date: string
          handoffs: number
          malus: number
          note: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          bonus?: number
          chatter_id: string
          date: string
          handoffs?: number
          malus?: number
          note?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          bonus?: number
          chatter_id?: string
          date?: string
          handoffs?: number
          malus?: number
          note?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "compta_day_entries_chatter_id_fkey"
            columns: ["chatter_id"]
            isOneToOne: false
            referencedRelation: "chatters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compta_day_entries_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      compta_debts: {
        Row: {
          amount: string
          created_at: string
          id: string
          model: string | null
          name: string
          note: string | null
          settled: boolean
          settled_at: string | null
        }
        Insert: {
          amount: string
          created_at?: string
          id?: string
          model?: string | null
          name: string
          note?: string | null
          settled?: boolean
          settled_at?: string | null
        }
        Update: {
          amount?: string
          created_at?: string
          id?: string
          model?: string | null
          name?: string
          note?: string | null
          settled?: boolean
          settled_at?: string | null
        }
        Relationships: []
      }
      compta_payments: {
        Row: {
          amount: number
          chatter_id: string
          covered_days: string[] | null
          created_at: string
          id: string
          month: string
          note: string | null
          paid_at: string
          paid_by: string | null
        }
        Insert: {
          amount: number
          chatter_id: string
          covered_days?: string[] | null
          created_at?: string
          id?: string
          month: string
          note?: string | null
          paid_at?: string
          paid_by?: string | null
        }
        Update: {
          amount?: number
          chatter_id?: string
          covered_days?: string[] | null
          created_at?: string
          id?: string
          month?: string
          note?: string | null
          paid_at?: string
          paid_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "compta_payments_chatter_id_fkey"
            columns: ["chatter_id"]
            isOneToOne: false
            referencedRelation: "chatters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compta_payments_paid_by_fkey"
            columns: ["paid_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      compta_primes: {
        Row: {
          amount: string
          chatter_id: string
          note: string | null
          paid_at: string | null
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          amount?: string
          chatter_id: string
          note?: string | null
          paid_at?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          amount?: string
          chatter_id?: string
          note?: string | null
          paid_at?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "compta_primes_chatter_id_fkey"
            columns: ["chatter_id"]
            isOneToOne: true
            referencedRelation: "chatters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compta_primes_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      compta_settings: {
        Row: {
          chatter_id: string
          fixed_amount: number
          is_setter: boolean
          mode: string
          rate: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          chatter_id: string
          fixed_amount?: number
          is_setter?: boolean
          mode?: string
          rate?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          chatter_id?: string
          fixed_amount?: number
          is_setter?: boolean
          mode?: string
          rate?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "compta_settings_chatter_id_fkey"
            columns: ["chatter_id"]
            isOneToOne: true
            referencedRelation: "chatters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compta_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      compta_week_entries: {
        Row: {
          bonus: number
          chatter_id: string
          fixe_setter: number
          handoffs: number
          malus: number
          note: string | null
          updated_at: string
          updated_by: string | null
          week_start: string
        }
        Insert: {
          bonus?: number
          chatter_id: string
          fixe_setter?: number
          handoffs?: number
          malus?: number
          note?: string | null
          updated_at?: string
          updated_by?: string | null
          week_start: string
        }
        Update: {
          bonus?: number
          chatter_id?: string
          fixe_setter?: number
          handoffs?: number
          malus?: number
          note?: string | null
          updated_at?: string
          updated_by?: string | null
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "compta_week_entries_chatter_id_fkey"
            columns: ["chatter_id"]
            isOneToOne: false
            referencedRelation: "chatters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compta_week_entries_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          renew_subs: number
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
          renew_subs?: number
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
          renew_subs?: number
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
      fan_transactions: {
        Row: {
          amount: number
          attributed_mypuls_user_id: string | null
          created_at: string
          creator_id: string | null
          date: string
          fan_id: number
          fan_username: string
          kind: string | null
          mypuls_creator_id: string
          net: number
          occurred_at: string
          payment_id: number
          type: string | null
        }
        Insert: {
          amount: number
          attributed_mypuls_user_id?: string | null
          created_at?: string
          creator_id?: string | null
          date: string
          fan_id: number
          fan_username: string
          kind?: string | null
          mypuls_creator_id: string
          net: number
          occurred_at: string
          payment_id: number
          type?: string | null
        }
        Update: {
          amount?: number
          attributed_mypuls_user_id?: string | null
          created_at?: string
          creator_id?: string | null
          date?: string
          fan_id?: number
          fan_username?: string
          kind?: string | null
          mypuls_creator_id?: string
          net?: number
          occurred_at?: string
          payment_id?: number
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fan_transactions_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
        ]
      }
      ingest_runs: {
        Row: {
          error: string | null
          finished_at: string
          id: string
          started_at: string
          status: string
          summary: Json
          triggered_by: string
        }
        Insert: {
          error?: string | null
          finished_at?: string
          id?: string
          started_at: string
          status: string
          summary?: Json
          triggered_by: string
        }
        Update: {
          error?: string | null
          finished_at?: string
          id?: string
          started_at?: string
          status?: string
          summary?: Json
          triggered_by?: string
        }
        Relationships: []
      }
      insight_states: {
        Row: {
          bilan: Json | null
          insight_key: string
          note: string | null
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          bilan?: Json | null
          insight_key: string
          note?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          bilan?: Json | null
          insight_key?: string
          note?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "insight_states_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      insights: {
        Row: {
          action_plan: string
          body: string
          chatter_id: string
          creator_ids: string[]
          generated_at: string
          insight_key: string
          kpis: Json
          models: Json
          severity: string
          title: string
          week: Json | null
          week_start: string
        }
        Insert: {
          action_plan: string
          body: string
          chatter_id: string
          creator_ids?: string[]
          generated_at?: string
          insight_key: string
          kpis?: Json
          models?: Json
          severity: string
          title: string
          week?: Json | null
          week_start: string
        }
        Update: {
          action_plan?: string
          body?: string
          chatter_id?: string
          creator_ids?: string[]
          generated_at?: string
          insight_key?: string
          kpis?: Json
          models?: Json
          severity?: string
          title?: string
          week?: Json | null
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "insights_chatter_id_fkey"
            columns: ["chatter_id"]
            isOneToOne: false
            referencedRelation: "chatters"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_link_daily: {
        Row: {
          clicks: number
          conversions: number
          date: string
          link_id: string
          revenue_eur: number
        }
        Insert: {
          clicks?: number
          conversions?: number
          date: string
          link_id: string
          revenue_eur?: number
        }
        Update: {
          clicks?: number
          conversions?: number
          date?: string
          link_id?: string
          revenue_eur?: number
        }
        Relationships: [
          {
            foreignKeyName: "mkt_link_daily_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: false
            referencedRelation: "mkt_links"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_links: {
        Row: {
          active: boolean
          created_at: string
          created_src: string
          creator_id: string | null
          cum_clicks: number
          cum_conversions: number
          cum_revenue_eur: number
          id: string
          last_seen: string | null
          mypuls_creator_id: string | null
          name: string
          type: string
          url: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_src?: string
          creator_id?: string | null
          cum_clicks?: number
          cum_conversions?: number
          cum_revenue_eur?: number
          id?: string
          last_seen?: string | null
          mypuls_creator_id?: string | null
          name: string
          type?: string
          url?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_src?: string
          creator_id?: string | null
          cum_clicks?: number
          cum_conversions?: number
          cum_revenue_eur?: number
          id?: string
          last_seen?: string | null
          mypuls_creator_id?: string | null
          name?: string
          type?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "mkt_links_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_social_accounts: {
        Row: {
          active: boolean
          created_at: string
          creator_id: string | null
          handle: string
          id: string
          platform: string
          staff_id: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          creator_id?: string | null
          handle: string
          id?: string
          platform: string
          staff_id?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          creator_id?: string | null
          handle?: string
          id?: string
          platform?: string
          staff_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mkt_social_accounts_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_social_accounts_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "mkt_staff"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_social_daily: {
        Row: {
          account_id: string
          date: string
          delta_followers: number | null
          engagement_24h: number | null
          followers: number | null
          posts_24h: number | null
          status: string | null
          views_24h: number | null
          views_total: number | null
        }
        Insert: {
          account_id: string
          date: string
          delta_followers?: number | null
          engagement_24h?: number | null
          followers?: number | null
          posts_24h?: number | null
          status?: string | null
          views_24h?: number | null
          views_total?: number | null
        }
        Update: {
          account_id?: string
          date?: string
          delta_followers?: number | null
          engagement_24h?: number | null
          followers?: number | null
          posts_24h?: number | null
          status?: string | null
          views_24h?: number | null
          views_total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "mkt_social_daily_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "mkt_social_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_staff: {
        Row: {
          active: boolean
          bonus_eur: number
          color: string
          created_at: string
          fixed_eur: number
          id: string
          name: string
          owner_id: string | null
          payment_method: string
          pct: number
          rate_ig: number
          rate_tw: number
          role: string
        }
        Insert: {
          active?: boolean
          bonus_eur?: number
          color?: string
          created_at?: string
          fixed_eur?: number
          id?: string
          name: string
          owner_id?: string | null
          payment_method?: string
          pct?: number
          rate_ig?: number
          rate_tw?: number
          role?: string
        }
        Update: {
          active?: boolean
          bonus_eur?: number
          color?: string
          created_at?: string
          fixed_eur?: number
          id?: string
          name?: string
          owner_id?: string | null
          payment_method?: string
          pct?: number
          rate_ig?: number
          rate_tw?: number
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "mkt_staff_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_staff_links: {
        Row: {
          link_id: string
          staff_id: string
        }
        Insert: {
          link_id: string
          staff_id: string
        }
        Update: {
          link_id?: string
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mkt_staff_links_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: false
            referencedRelation: "mkt_links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_staff_links_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "mkt_staff"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_staff_payments: {
        Row: {
          amount_eur: number
          created_by: string | null
          id: string
          method: string
          month: string
          note: string
          paid_at: string
          staff_id: string
        }
        Insert: {
          amount_eur: number
          created_by?: string | null
          id?: string
          method?: string
          month: string
          note?: string
          paid_at?: string
          staff_id: string
        }
        Update: {
          amount_eur?: number
          created_by?: string | null
          id?: string
          method?: string
          month?: string
          note?: string
          paid_at?: string
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mkt_staff_payments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_staff_payments_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "mkt_staff"
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
      police_entries: {
        Row: {
          amount_eur: number
          chatter_id: string
          controller_id: string | null
          created_at: string
          error_key: string | null
          id: string
          kind: string
          note: string | null
          occurred_on: string
          shift: string | null
        }
        Insert: {
          amount_eur?: number
          chatter_id: string
          controller_id?: string | null
          created_at?: string
          error_key?: string | null
          id?: string
          kind: string
          note?: string | null
          occurred_on?: string
          shift?: string | null
        }
        Update: {
          amount_eur?: number
          chatter_id?: string
          controller_id?: string | null
          created_at?: string
          error_key?: string | null
          id?: string
          kind?: string
          note?: string | null
          occurred_on?: string
          shift?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "police_entries_chatter_id_fkey"
            columns: ["chatter_id"]
            isOneToOne: false
            referencedRelation: "chatters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "police_entries_controller_id_fkey"
            columns: ["controller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
      planning_blocks: {
        Row: {
          badge: string
          bullets: Json
          color: string
          created_at: string
          id: string
          planning_id: string
          position: number
          section: string
          time_end: string
          time_start: string
          title: string
        }
        Insert: {
          badge?: string
          bullets?: Json
          color?: string
          created_at?: string
          id?: string
          planning_id: string
          position?: number
          section: string
          time_end: string
          time_start: string
          title: string
        }
        Update: {
          badge?: string
          bullets?: Json
          color?: string
          created_at?: string
          id?: string
          planning_id?: string
          position?: number
          section?: string
          time_end?: string
          time_start?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "planning_blocks_planning_id_fkey"
            columns: ["planning_id"]
            isOneToOne: false
            referencedRelation: "plannings"
            referencedColumns: ["id"]
          },
        ]
      }
      plannings: {
        Row: {
          annex_note: string
          annexes: Json
          id: string
          pause_note: string
          priority_allowed: string
          priority_body: string
          priority_forbidden: string
          priority_title: string
          profile_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          annex_note?: string
          annexes?: Json
          id?: string
          pause_note?: string
          priority_allowed?: string
          priority_body?: string
          priority_forbidden?: string
          priority_title?: string
          profile_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          annex_note?: string
          annexes?: Json
          id?: string
          pause_note?: string
          priority_allowed?: string
          priority_body?: string
          priority_forbidden?: string
          priority_title?: string
          profile_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          pages: string[]
          role: string
          work_link: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          pages?: string[]
          role?: string
          work_link?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          pages?: string[]
          role?: string
          work_link?: string
        }
        Relationships: []
      }
      quotas: {
        Row: {
          ca_eur: number
          conv_pct: number
          medias_proposes: number
          presence_h: number
          reactivite_s: number
          team_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          ca_eur: number
          conv_pct: number
          medias_proposes: number
          presence_h: number
          reactivite_s: number
          team_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          ca_eur?: number
          conv_pct?: number
          medias_proposes?: number
          presence_h?: number
          reactivite_s?: number
          team_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotas_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: true
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotas_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      relances: {
        Row: {
          chatter_id: string | null
          created_at: string
          created_by: string | null
          creator_id: string
          fan_id: number
          id: string
          jour_paris: string
          note: string | null
          numero_r: number
        }
        Insert: {
          chatter_id?: string | null
          created_at?: string
          created_by?: string | null
          creator_id: string
          fan_id: number
          id?: string
          jour_paris?: string
          note?: string | null
          numero_r: number
        }
        Update: {
          chatter_id?: string | null
          created_at?: string
          created_by?: string | null
          creator_id?: string
          fan_id?: number
          id?: string
          jour_paris?: string
          note?: string | null
          numero_r?: number
        }
        Relationships: [
          {
            foreignKeyName: "relances_chatter_id_fkey"
            columns: ["chatter_id"]
            isOneToOne: false
            referencedRelation: "chatters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "relances_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "relances_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
        ]
      }
      rest_planning_cells: {
        Row: {
          chatter_ids: string[]
          col: string
          day: number
          names: string
          updated_at: string
          updated_by: string | null
          week_start: string
        }
        Insert: {
          chatter_ids?: string[]
          col: string
          day: number
          names?: string
          updated_at?: string
          updated_by?: string | null
          week_start: string
        }
        Update: {
          chatter_ids?: string[]
          col?: string
          day?: number
          names?: string
          updated_at?: string
          updated_by?: string | null
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "rest_planning_cells_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rest_planning_column_members: {
        Row: {
          col: string
          creator_ids: string[]
          effective_from: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          col: string
          creator_ids?: string[]
          effective_from: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          col?: string
          creator_ids?: string[]
          effective_from?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rest_planning_column_members_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rest_planning_weeks: {
        Row: {
          sent_telegram: boolean
          updated_at: string
          updated_by: string | null
          week_start: string
        }
        Insert: {
          sent_telegram?: boolean
          updated_at?: string
          updated_by?: string | null
          week_start: string
        }
        Update: {
          sent_telegram?: boolean
          updated_at?: string
          updated_by?: string | null
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "rest_planning_weeks_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      spender_assignment_events: {
        Row: {
          changed_at: string
          creator_id: string
          fan_id: number
          from_chatter_id: string | null
          id: string
          to_chatter_id: string | null
        }
        Insert: {
          changed_at?: string
          creator_id: string
          fan_id: number
          from_chatter_id?: string | null
          id?: string
          to_chatter_id?: string | null
        }
        Update: {
          changed_at?: string
          creator_id?: string
          fan_id?: number
          from_chatter_id?: string | null
          id?: string
          to_chatter_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "spender_assignment_events_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spender_assignment_events_from_chatter_id_fkey"
            columns: ["from_chatter_id"]
            isOneToOne: false
            referencedRelation: "chatters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spender_assignment_events_to_chatter_id_fkey"
            columns: ["to_chatter_id"]
            isOneToOne: false
            referencedRelation: "chatters"
            referencedColumns: ["id"]
          },
        ]
      }
      spender_conversations: {
        Row: {
          assigned_chatter_id: string | null
          assigned_label: string | null
          assigned_mypuls_user_id: string | null
          ca_total: number
          captured_at: string
          creator_id: string
          fan_id: number
          has_unread: boolean
          last_message_at: string | null
          last_message_is_mine: boolean | null
          status: string | null
          username: string
        }
        Insert: {
          assigned_chatter_id?: string | null
          assigned_label?: string | null
          assigned_mypuls_user_id?: string | null
          ca_total?: number
          captured_at: string
          creator_id: string
          fan_id: number
          has_unread?: boolean
          last_message_at?: string | null
          last_message_is_mine?: boolean | null
          status?: string | null
          username: string
        }
        Update: {
          assigned_chatter_id?: string | null
          assigned_label?: string | null
          assigned_mypuls_user_id?: string | null
          ca_total?: number
          captured_at?: string
          creator_id?: string
          fan_id?: number
          has_unread?: boolean
          last_message_at?: string | null
          last_message_is_mine?: boolean | null
          status?: string | null
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "spender_conversations_assigned_chatter_id_fkey"
            columns: ["assigned_chatter_id"]
            isOneToOne: false
            referencedRelation: "chatters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spender_conversations_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
        ]
      }
      spender_crm: {
        Row: {
          archived: boolean
          archived_at: string | null
          compteur_reset_at: string | null
          creator_id: string
          fan_id: number
          updated_at: string
        }
        Insert: {
          archived?: boolean
          archived_at?: string | null
          compteur_reset_at?: string | null
          creator_id: string
          fan_id: number
          updated_at?: string
        }
        Update: {
          archived?: boolean
          archived_at?: string | null
          compteur_reset_at?: string | null
          creator_id?: string
          fan_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "spender_crm_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
        ]
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
      chatter_first_seen: {
        Args: never
        Returns: {
          chatter_id: string
          first_seen: string
        }[]
      }
      chatters_report: { Args: { p_from: string; p_to: string }; Returns: Json }
      crm_spenders_daily: {
        Args: never
        Returns: {
          date: string
          ca: number
        }[]
      }
      crm_spenders_tracker: {
        Args: { p_seuil?: number }
        Returns: {
          creator_id: string
          fan_id: number
          username: string
          model: string
          ca_total: number
          status: string | null
          last_message_at: string | null
          last_message_is_mine: boolean | null
          has_unread: boolean
          assigned_chatter_id: string | null
          chatter_name: string | null
          chatter_team: string | null
          assigned_label: string | null
          compteur_r: number
          derniere_relance_at: string | null
          relance_today: boolean
          conversion_pending: boolean
          archived: boolean
        }[]
      }
      has_page: { Args: { slug: string }; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
      mkt_save_staff_assignments: {
        Args: { p_accounts: string[]; p_links: string[]; p_staff: string }
        Returns: undefined
      }
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
