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
        Relationships: [

        ]
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
            isOneToOne: false
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
            isOneToOne: false
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
          payment_method?: string
          pct?: number
          rate_ig?: number
          rate_tw?: number
          role?: string
        }
        Relationships: []
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
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          pages: string[]
          role: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          pages?: string[]
          role?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          pages?: string[]
          role?: string
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
    },
  },
} as const

