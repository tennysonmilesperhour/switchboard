export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      announcements: {
        Row: {
          author_id: string
          body: string
          created_at: string
          event_id: string
          id: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          event_id: string
          id?: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          event_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcements_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      availability_signals: {
        Row: {
          board_ids: string[]
          circle_ids: string[]
          created_at: string
          emoji: string
          expires_at: string
          id: string
          label: string
          person_ids: string[]
          user_id: string
        }
        Insert: {
          board_ids?: string[]
          circle_ids?: string[]
          created_at?: string
          emoji: string
          expires_at: string
          id?: string
          label: string
          person_ids?: string[]
          user_id: string
        }
        Update: {
          board_ids?: string[]
          circle_ids?: string[]
          created_at?: string
          emoji?: string
          expires_at?: string
          id?: string
          label?: string
          person_ids?: string[]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "availability_signals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      board_members: {
        Row: {
          board_id: string
          joined_at: string
          member_id: string
          role: string
        }
        Insert: {
          board_id: string
          joined_at?: string
          member_id: string
          role?: string
        }
        Update: {
          board_id?: string
          joined_at?: string
          member_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "board_members_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "boards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "board_members_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      board_post_responses: {
        Row: {
          created_at: string
          post_id: string
          responder_id: string
        }
        Insert: {
          created_at?: string
          post_id: string
          responder_id: string
        }
        Update: {
          created_at?: string
          post_id?: string
          responder_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "board_post_responses_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "board_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "board_post_responses_responder_id_fkey"
            columns: ["responder_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      board_posts: {
        Row: {
          author_id: string
          board_id: string
          body: string | null
          cadence: string | null
          created_at: string
          event_id: string | null
          expires_at: string | null
          fulfilled_at: string | null
          fulfilled_by: string | null
          id: string
          kind: string
          location: string | null
          removed_at: string | null
          starts_at: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          author_id: string
          board_id: string
          body?: string | null
          cadence?: string | null
          created_at?: string
          event_id?: string | null
          expires_at?: string | null
          fulfilled_at?: string | null
          fulfilled_by?: string | null
          id?: string
          kind?: string
          location?: string | null
          removed_at?: string | null
          starts_at?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          author_id?: string
          board_id?: string
          body?: string | null
          cadence?: string | null
          created_at?: string
          event_id?: string | null
          expires_at?: string | null
          fulfilled_at?: string | null
          fulfilled_by?: string | null
          id?: string
          kind?: string
          location?: string | null
          removed_at?: string | null
          starts_at?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "board_posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "board_posts_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "boards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "board_posts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "board_posts_fulfilled_by_fkey"
            columns: ["fulfilled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      boards: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          id: string
          invite_code: string | null
          name: string
          slug: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          invite_code?: string | null
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          invite_code?: string | null
          name?: string
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "boards_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_busy: {
        Row: {
          slot: string
          user_id: string
        }
        Insert: {
          slot: string
          user_id: string
        }
        Update: {
          slot?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_busy_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_subscriptions: {
        Row: {
          covered_through: string | null
          created_at: string
          ics_url: string
          last_status: string
          last_synced_at: string | null
          source_host: string | null
          user_id: string
        }
        Insert: {
          covered_through?: string | null
          created_at?: string
          ics_url: string
          last_status?: string
          last_synced_at?: string | null
          source_host?: string | null
          user_id: string
        }
        Update: {
          covered_through?: string | null
          created_at?: string
          ics_url?: string
          last_status?: string
          last_synced_at?: string | null
          source_host?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      capsule_entries: {
        Row: {
          created_at: string
          event_id: string
          id: string
          line: string
          photo_url: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          line: string
          photo_url?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          line?: string
          photo_url?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "capsule_entries_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capsule_entries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      circle_members: {
        Row: {
          circle_id: string
          member_id: string
        }
        Insert: {
          circle_id: string
          member_id: string
        }
        Update: {
          circle_id?: string
          member_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "circle_members_circle_id_fkey"
            columns: ["circle_id"]
            isOneToOne: false
            referencedRelation: "circles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "circle_members_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      circles: {
        Row: {
          created_at: string
          emoji: string
          id: string
          name: string
          owner_id: string
        }
        Insert: {
          created_at?: string
          emoji?: string
          id?: string
          name: string
          owner_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          name?: string
          owner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "circles_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      client_feedback: {
        Row: {
          body: string
          created_at: string
          id: string
          item_id: string | null
          item_label: string | null
          reporter: string | null
          resolution: string | null
          resolved_at: string | null
          resolved_ref: string | null
          screenshots: string[]
          status: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          item_id?: string | null
          item_label?: string | null
          reporter?: string | null
          resolution?: string | null
          resolved_at?: string | null
          resolved_ref?: string | null
          screenshots?: string[]
          status?: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          item_id?: string | null
          item_label?: string | null
          reporter?: string | null
          resolution?: string | null
          resolved_at?: string | null
          resolved_ref?: string | null
          screenshots?: string[]
          status?: string
        }
        Relationships: []
      }
      connection_request_ignores: {
        Row: {
          ignored_at: string
          ignored_id: string
          ignorer_id: string
        }
        Insert: {
          ignored_at?: string
          ignored_id: string
          ignorer_id: string
        }
        Update: {
          ignored_at?: string
          ignored_id?: string
          ignorer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "connection_request_ignores_ignored_id_fkey"
            columns: ["ignored_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connection_request_ignores_ignorer_id_fkey"
            columns: ["ignorer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      connections: {
        Row: {
          addressee_id: string
          created_at: string
          id: string
          requester_id: string
          status: string
        }
        Insert: {
          addressee_id: string
          created_at?: string
          id?: string
          requester_id: string
          status?: string
        }
        Update: {
          addressee_id?: string
          created_at?: string
          id?: string
          requester_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "connections_addressee_id_fkey"
            columns: ["addressee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connections_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_verification_requests: {
        Row: {
          attempts: number
          code_hash: string | null
          created_at: string
          expires_at: string
          kind: string
          normalized_value: string
          token_hash: string | null
          user_id: string
        }
        Insert: {
          attempts?: number
          code_hash?: string | null
          created_at?: string
          expires_at: string
          kind: string
          normalized_value: string
          token_hash?: string | null
          user_id: string
        }
        Update: {
          attempts?: number
          code_hash?: string | null
          created_at?: string
          expires_at?: string
          kind?: string
          normalized_value?: string
          token_hash?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_verification_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      discovery_mood: {
        Row: {
          bar_shift: number
          expires_at: string
          include_items: string[]
          only_selves: string[]
          preset: string
          updated_at: string
          user_id: string
        }
        Insert: {
          bar_shift?: number
          expires_at: string
          include_items?: string[]
          only_selves?: string[]
          preset?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          bar_shift?: number
          expires_at?: string
          include_items?: string[]
          only_selves?: string[]
          preset?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "discovery_mood_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      discovery_selves: {
        Row: {
          bar: number
          blurb: string
          enabled: boolean
          identifies_as: string | null
          interested_in: string[]
          seeking: string
          self: string
          updated_at: string
          user_id: string
          visible_to: string
        }
        Insert: {
          bar?: number
          blurb?: string
          enabled?: boolean
          identifies_as?: string | null
          interested_in?: string[]
          seeking?: string
          self: string
          updated_at?: string
          user_id: string
          visible_to?: string
        }
        Update: {
          bar?: number
          blurb?: string
          enabled?: boolean
          identifies_as?: string | null
          interested_in?: string[]
          seeking?: string
          self?: string
          updated_at?: string
          user_id?: string
          visible_to?: string
        }
        Relationships: [
          {
            foreignKeyName: "discovery_selves_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      discovery_signals: {
        Row: {
          created_at: string
          id: string
          items: string[]
          kind: string
          self: string
          target_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          items?: string[]
          kind: string
          self: string
          target_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          items?: string[]
          kind?: string
          self?: string
          target_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "discovery_signals_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discovery_signals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      discovery_weights: {
        Row: {
          item: string
          self: string
          user_id: string
          weight: number
        }
        Insert: {
          item: string
          self: string
          user_id: string
          weight: number
        }
        Update: {
          item?: string
          self?: string
          user_id?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "discovery_weights_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      energy_logs: {
        Row: {
          created_at: string
          event_id: string
          feeling: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          feeling: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          feeling?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "energy_logs_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "energy_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      event_availability: {
        Row: {
          created_at: string
          event_id: string
          slot: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          slot: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          slot?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_availability_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_availability_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      event_availability_responses: {
        Row: {
          event_id: string
          submitted_at: string
          user_id: string
        }
        Insert: {
          event_id: string
          submitted_at?: string
          user_id: string
        }
        Update: {
          event_id?: string
          submitted_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_availability_responses_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_availability_responses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      event_cohosts: {
        Row: {
          added_by: string | null
          cohost_id: string
          created_at: string
          event_id: string
        }
        Insert: {
          added_by?: string | null
          cohost_id: string
          created_at?: string
          event_id: string
        }
        Update: {
          added_by?: string | null
          cohost_id?: string
          created_at?: string
          event_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_cohosts_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_cohosts_cohost_id_fkey"
            columns: ["cohost_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_cohosts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_comments: {
        Row: {
          author_id: string
          body: string | null
          created_at: string
          event_id: string
          id: string
          reply_to_id: string | null
          voice_duration_seconds: number | null
          voice_url: string | null
        }
        Insert: {
          author_id: string
          body?: string | null
          created_at?: string
          event_id: string
          id?: string
          reply_to_id?: string | null
          voice_duration_seconds?: number | null
          voice_url?: string | null
        }
        Update: {
          author_id?: string
          body?: string | null
          created_at?: string
          event_id?: string
          id?: string
          reply_to_id?: string | null
          voice_duration_seconds?: number | null
          voice_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_comments_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_comments_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "event_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      event_questions: {
        Row: {
          created_at: string
          event_id: string
          id: string
          kind: string
          options: string[]
          position: number
          prompt: string
          required: boolean
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          kind?: string
          options?: string[]
          position?: number
          prompt: string
          required?: boolean
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          kind?: string
          options?: string[]
          position?: number
          prompt?: string
          required?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "event_questions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          broadcast_nearby: boolean
          cancel_reason: string | null
          cancel_voice_url: string | null
          capacity: number | null
          cover_url: string | null
          created_at: string
          description: string | null
          ends_at: string | null
          happened_at: string | null
          host_id: string
          id: string
          invite_mode: string
          latitude: number | null
          location_address: string | null
          location_name: string | null
          longitude: number | null
          open_table: boolean
          parental_approval: boolean
          recurrence: string
          recurrence_interval_days: number | null
          reminded_day_before_at: string | null
          reminded_soon_at: string | null
          reminders_enabled: boolean
          room_id: string | null
          share_link_active: boolean
          share_token: string
          show_accepted: boolean
          show_expired: boolean
          show_invite_list: boolean
          starts_at: string | null
          status: string
          theme: string
          time_zone: string | null
          title: string
          wishlist_url: string | null
        }
        Insert: {
          broadcast_nearby?: boolean
          cancel_reason?: string | null
          cancel_voice_url?: string | null
          capacity?: number | null
          cover_url?: string | null
          created_at?: string
          description?: string | null
          ends_at?: string | null
          happened_at?: string | null
          host_id: string
          id?: string
          invite_mode?: string
          latitude?: number | null
          location_address?: string | null
          location_name?: string | null
          longitude?: number | null
          open_table?: boolean
          parental_approval?: boolean
          recurrence?: string
          recurrence_interval_days?: number | null
          reminded_day_before_at?: string | null
          reminded_soon_at?: string | null
          reminders_enabled?: boolean
          room_id?: string | null
          share_link_active?: boolean
          share_token?: string
          show_accepted?: boolean
          show_expired?: boolean
          show_invite_list?: boolean
          starts_at?: string | null
          status?: string
          theme?: string
          time_zone?: string | null
          title: string
          wishlist_url?: string | null
        }
        Update: {
          broadcast_nearby?: boolean
          cancel_reason?: string | null
          cancel_voice_url?: string | null
          capacity?: number | null
          cover_url?: string | null
          created_at?: string
          description?: string | null
          ends_at?: string | null
          happened_at?: string | null
          host_id?: string
          id?: string
          invite_mode?: string
          latitude?: number | null
          location_address?: string | null
          location_name?: string | null
          longitude?: number | null
          open_table?: boolean
          parental_approval?: boolean
          recurrence?: string
          recurrence_interval_days?: number | null
          reminded_day_before_at?: string | null
          reminded_soon_at?: string | null
          reminders_enabled?: boolean
          room_id?: string | null
          share_link_active?: boolean
          share_token?: string
          show_accepted?: boolean
          show_expired?: boolean
          show_invite_list?: boolean
          starts_at?: string | null
          status?: string
          theme?: string
          time_zone?: string | null
          title?: string
          wishlist_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_shares: {
        Row: {
          expense_id: string
          member_id: string
          room_id: string
          settled_at: string | null
          settled_by: string | null
          share_cents: number
        }
        Insert: {
          expense_id: string
          member_id: string
          room_id: string
          settled_at?: string | null
          settled_by?: string | null
          share_cents: number
        }
        Update: {
          expense_id?: string
          member_id?: string
          room_id?: string
          settled_at?: string | null
          settled_by?: string | null
          share_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "expense_shares_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_shares_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_shares_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_shares_settled_by_fkey"
            columns: ["settled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount_cents: number
          created_at: string
          created_by: string
          description: string
          id: string
          payer_id: string
          room_id: string
          settle_url: string | null
        }
        Insert: {
          amount_cents: number
          created_at?: string
          created_by: string
          description: string
          id?: string
          payer_id: string
          room_id: string
          settle_url?: string | null
        }
        Update: {
          amount_cents?: number
          created_at?: string
          created_by?: string
          description?: string
          id?: string
          payer_id?: string
          room_id?: string
          settle_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_payer_id_fkey"
            columns: ["payer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      facet_prefs: {
        Row: {
          facet_key: string
          hidden: boolean
          shared_with_connections: boolean
          updated_at: string
          user_id: string
          verdict: string | null
        }
        Insert: {
          facet_key: string
          hidden?: boolean
          shared_with_connections?: boolean
          updated_at?: string
          user_id: string
          verdict?: string | null
        }
        Update: {
          facet_key?: string
          hidden?: boolean
          shared_with_connections?: boolean
          updated_at?: string
          user_id?: string
          verdict?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "facet_prefs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      fact_verification_requests: {
        Row: {
          created_at: string
          domain: string
          expires_at: string
          fact_id: string
          token_hash: string
          user_id: string
        }
        Insert: {
          created_at?: string
          domain: string
          expires_at: string
          fact_id: string
          token_hash: string
          user_id: string
        }
        Update: {
          created_at?: string
          domain?: string
          expires_at?: string
          fact_id?: string
          token_hash?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fact_verification_requests_fact_id_fkey"
            columns: ["fact_id"]
            isOneToOne: false
            referencedRelation: "profile_facts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fact_verification_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      fact_vouches: {
        Row: {
          created_at: string
          fact_id: string
          voucher_id: string
        }
        Insert: {
          created_at?: string
          fact_id: string
          voucher_id: string
        }
        Update: {
          created_at?: string
          fact_id?: string
          voucher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fact_vouches_fact_id_fkey"
            columns: ["fact_id"]
            isOneToOne: false
            referencedRelation: "profile_facts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fact_vouches_voucher_id_fkey"
            columns: ["voucher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      give_space_notices: {
        Row: {
          created_at: string
          event_id: string
          user_id: string
          warned: boolean
        }
        Insert: {
          created_at?: string
          event_id: string
          user_id: string
          warned?: boolean
        }
        Update: {
          created_at?: string
          event_id?: string
          user_id?: string
          warned?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "give_space_notices_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "give_space_notices_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_sms_consents: {
        Row: {
          consent_at: string
          expires_at: string
          invite_id: string
          phone: string
          policy_version: string
          source: string
        }
        Insert: {
          consent_at?: string
          expires_at: string
          invite_id: string
          phone: string
          policy_version?: string
          source?: string
        }
        Update: {
          consent_at?: string
          expires_at?: string
          invite_id?: string
          phone?: string
          policy_version?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "guest_sms_consents_invite_id_fkey"
            columns: ["invite_id"]
            isOneToOne: true
            referencedRelation: "invites"
            referencedColumns: ["id"]
          },
        ]
      }
      household_members: {
        Row: {
          household_id: string
          member_id: string
        }
        Insert: {
          household_id: string
          member_id: string
        }
        Update: {
          household_id?: string
          member_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "household_members_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "household_members_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      households: {
        Row: {
          created_at: string
          emoji: string
          id: string
          name: string
          owner_id: string
        }
        Insert: {
          created_at?: string
          emoji?: string
          id?: string
          name: string
          owner_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          name?: string
          owner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "households_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      identity_facets: {
        Row: {
          computed_at: string
          confidence: string
          detail: Json
          facet_key: string
          sample_size: number
          summary: string
          title: string
          user_id: string
        }
        Insert: {
          computed_at?: string
          confidence?: string
          detail?: Json
          facet_key: string
          sample_size?: number
          summary: string
          title: string
          user_id: string
        }
        Update: {
          computed_at?: string
          confidence?: string
          detail?: Json
          facet_key?: string
          sample_size?: number
          summary?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "identity_facets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      identity_reflections: {
        Row: {
          body: string
          created_at: string
          id: string
          kind: string
          source: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          kind?: string
          source?: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          kind?: string
          source?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "identity_reflections_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      invite_answers: {
        Row: {
          answer: string
          created_at: string
          id: string
          invite_id: string
          question_id: string
        }
        Insert: {
          answer: string
          created_at?: string
          id?: string
          invite_id: string
          question_id: string
        }
        Update: {
          answer?: string
          created_at?: string
          id?: string
          invite_id?: string
          question_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invite_answers_invite_id_fkey"
            columns: ["invite_id"]
            isOneToOne: false
            referencedRelation: "invites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invite_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "event_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      invite_delivery_attempts: {
        Row: {
          attempted_at: string
          channel: string
          error_code: string | null
          id: string
          invite_id: string
          provider: string
          provider_message_id: string | null
          status: string
        }
        Insert: {
          attempted_at?: string
          channel: string
          error_code?: string | null
          id?: string
          invite_id: string
          provider: string
          provider_message_id?: string | null
          status: string
        }
        Update: {
          attempted_at?: string
          channel?: string
          error_code?: string | null
          id?: string
          invite_id?: string
          provider?: string
          provider_message_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "invite_delivery_attempts_invite_id_fkey"
            columns: ["invite_id"]
            isOneToOne: false
            referencedRelation: "invites"
            referencedColumns: ["id"]
          },
        ]
      }
      invites: {
        Row: {
          created_at: string
          decline_message: string | null
          decline_note: string | null
          event_id: string
          group_stage: number
          guest_contact: string | null
          guest_name: string | null
          guest_token: string
          id: string
          invitee_id: string | null
          position: number
          responded_at: string | null
          sent_at: string | null
          status: string
          window_minutes: number
        }
        Insert: {
          created_at?: string
          decline_message?: string | null
          decline_note?: string | null
          event_id: string
          group_stage?: number
          guest_contact?: string | null
          guest_name?: string | null
          guest_token?: string
          id?: string
          invitee_id?: string | null
          position: number
          responded_at?: string | null
          sent_at?: string | null
          status?: string
          window_minutes?: number
        }
        Update: {
          created_at?: string
          decline_message?: string | null
          decline_note?: string | null
          event_id?: string
          group_stage?: number
          guest_contact?: string | null
          guest_name?: string | null
          guest_token?: string
          id?: string
          invitee_id?: string | null
          position?: number
          responded_at?: string | null
          sent_at?: string | null
          status?: string
          window_minutes?: number
        }
        Relationships: [
          {
            foreignKeyName: "invites_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invites_invitee_id_fkey"
            columns: ["invitee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      live_locations: {
        Row: {
          accuracy_m: number | null
          emoji: string | null
          expires_at: string
          headline: string | null
          latitude: number
          longitude: number
          updated_at: string
          user_id: string
          visibility: string
        }
        Insert: {
          accuracy_m?: number | null
          emoji?: string | null
          expires_at: string
          headline?: string | null
          latitude: number
          longitude: number
          updated_at?: string
          user_id: string
          visibility?: string
        }
        Update: {
          accuracy_m?: number | null
          emoji?: string | null
          expires_at?: string
          headline?: string | null
          latitude?: number
          longitude?: number
          updated_at?: string
          user_id?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_locations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      match_dismissals: {
        Row: {
          dismissed_at: string
          match_id: string
          user_id: string
        }
        Insert: {
          dismissed_at?: string
          match_id: string
          user_id: string
        }
        Update: {
          dismissed_at?: string
          match_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_dismissals_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_dismissals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          activity: string
          created_at: string
          event_id: string | null
          id: string
          kind: string
          room_id: string | null
          user_a: string
          user_b: string
        }
        Insert: {
          activity: string
          created_at?: string
          event_id?: string | null
          id?: string
          kind?: string
          room_id?: string | null
          user_a: string
          user_b: string
        }
        Update: {
          activity?: string
          created_at?: string
          event_id?: string | null
          id?: string
          kind?: string
          room_id?: string | null
          user_a?: string
          user_b?: string
        }
        Relationships: [
          {
            foreignKeyName: "matches_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_user_a_fkey"
            columns: ["user_a"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_user_b_fkey"
            columns: ["user_b"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      matchmaker_proposals: {
        Row: {
          a_response: string
          activity: string
          b_response: string
          created_at: string
          id: string
          note: string | null
          person_a: string
          person_b: string
          proposer_id: string
          room_id: string | null
          status: string
        }
        Insert: {
          a_response?: string
          activity: string
          b_response?: string
          created_at?: string
          id?: string
          note?: string | null
          person_a: string
          person_b: string
          proposer_id: string
          room_id?: string | null
          status?: string
        }
        Update: {
          a_response?: string
          activity?: string
          b_response?: string
          created_at?: string
          id?: string
          note?: string | null
          person_a?: string
          person_b?: string
          proposer_id?: string
          room_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "matchmaker_proposals_person_a_fkey"
            columns: ["person_a"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matchmaker_proposals_person_b_fkey"
            columns: ["person_b"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matchmaker_proposals_proposer_id_fkey"
            columns: ["proposer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matchmaker_proposals_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          created_at: string
          id: string
          image_url: string | null
          removed_at: string | null
          room_id: string
          sender_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          image_url?: string | null
          removed_at?: string | null
          room_id: string
          sender_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          image_url?: string | null
          removed_at?: string | null
          room_id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      moderation_actions: {
        Row: {
          action: string
          created_at: string
          id: string
          message_id: string | null
          moderator_id: string | null
          note: string | null
          post_id: string | null
          report_id: string | null
          subject_id: string | null
          suspended_until: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          message_id?: string | null
          moderator_id?: string | null
          note?: string | null
          post_id?: string | null
          report_id?: string | null
          subject_id?: string | null
          suspended_until?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          message_id?: string | null
          moderator_id?: string | null
          note?: string | null
          post_id?: string | null
          report_id?: string | null
          subject_id?: string | null
          suspended_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "moderation_actions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moderation_actions_moderator_id_fkey"
            columns: ["moderator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moderation_actions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "board_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moderation_actions_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "user_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moderation_actions_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      moment_interests: {
        Row: {
          created_at: string
          id: string
          moment_id: string
          other_moment_id: string
          stage: string
        }
        Insert: {
          created_at?: string
          id?: string
          moment_id: string
          other_moment_id: string
          stage?: string
        }
        Update: {
          created_at?: string
          id?: string
          moment_id?: string
          other_moment_id?: string
          stage?: string
        }
        Relationships: [
          {
            foreignKeyName: "moment_interests_moment_id_fkey"
            columns: ["moment_id"]
            isOneToOne: false
            referencedRelation: "moments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moment_interests_other_moment_id_fkey"
            columns: ["other_moment_id"]
            isOneToOne: false
            referencedRelation: "moments"
            referencedColumns: ["id"]
          },
        ]
      }
      moments: {
        Row: {
          available_until: string
          created_at: string
          experiences: string[]
          headline: string | null
          id: string
          latitude: number | null
          longitude: number | null
          place_name: string
          status: string
          user_id: string
          zone_id: string | null
        }
        Insert: {
          available_until: string
          created_at?: string
          experiences?: string[]
          headline?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          place_name: string
          status?: string
          user_id: string
          zone_id?: string | null
        }
        Update: {
          available_until?: string
          created_at?: string
          experiences?: string[]
          headline?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          place_name?: string
          status?: string
          user_id?: string
          zone_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "moments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moments_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "zones"
            referencedColumns: ["id"]
          },
        ]
      }
      mutual_intents: {
        Row: {
          activity: string
          author_id: string
          created_at: string
          event_id: string | null
          id: string
          kind: string
          status: string
          target_id: string
        }
        Insert: {
          activity: string
          author_id: string
          created_at?: string
          event_id?: string | null
          id?: string
          kind?: string
          status?: string
          target_id: string
        }
        Update: {
          activity?: string
          author_id?: string
          created_at?: string
          event_id?: string | null
          id?: string
          kind?: string
          status?: string
          target_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mutual_intents_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mutual_intents_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mutual_intents_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_email_jobs: {
        Row: {
          category: string
          created_at: string
          email: string
          expires_at: string
          id: string
          notification_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category: string
          created_at?: string
          email: string
          expires_at: string
          id?: string
          notification_id: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          notification_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_email_jobs_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: true
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_email_jobs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_routes: {
        Row: {
          plans: string
          reminders: string
          sms_fallback_at: string | null
          sms_fallback_reason: string | null
          user_id: string
        }
        Insert: {
          plans?: string
          reminders?: string
          sms_fallback_at?: string | null
          sms_fallback_reason?: string | null
          user_id: string
        }
        Update: {
          plans?: string
          reminders?: string
          sms_fallback_at?: string | null
          sms_fallback_reason?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_routes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          kind: string
          read_at: string | null
          title: string
          urgent_until: string | null
          url: string | null
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          kind: string
          read_at?: string | null
          title: string
          urgent_until?: string | null
          url?: string | null
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          kind?: string
          read_at?: string | null
          title?: string
          urgent_until?: string | null
          url?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      operator_settings: {
        Row: {
          enabled: boolean
          setting_key: string
          updated_at: string
          user_id: string
        }
        Insert: {
          enabled?: boolean
          setting_key: string
          updated_at?: string
          user_id: string
        }
        Update: {
          enabled?: boolean
          setting_key?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "operator_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      parental_approvals: {
        Row: {
          created_at: string
          email_status: string | null
          event_id: string
          guardian_email: string
          guardian_name: string | null
          id: string
          invite_id: string
          responded_at: string | null
          status: string
          token: string
        }
        Insert: {
          created_at?: string
          email_status?: string | null
          event_id: string
          guardian_email: string
          guardian_name?: string | null
          id?: string
          invite_id: string
          responded_at?: string | null
          status?: string
          token?: string
        }
        Update: {
          created_at?: string
          email_status?: string | null
          event_id?: string
          guardian_email?: string
          guardian_name?: string | null
          id?: string
          invite_id?: string
          responded_at?: string | null
          status?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "parental_approvals_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parental_approvals_invite_id_fkey"
            columns: ["invite_id"]
            isOneToOne: false
            referencedRelation: "invites"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_moderators: {
        Row: {
          granted_at: string
          member_id: string
        }
        Insert: {
          granted_at?: string
          member_id: string
        }
        Update: {
          granted_at?: string
          member_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_moderators_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      poll_options: {
        Row: {
          author_id: string | null
          created_at: string
          detail: string | null
          id: string
          image_url: string | null
          label: string
          link_url: string | null
          poll_id: string
          source: string
          updated_at: string | null
        }
        Insert: {
          author_id?: string | null
          created_at?: string
          detail?: string | null
          id?: string
          image_url?: string | null
          label: string
          link_url?: string | null
          poll_id: string
          source?: string
          updated_at?: string | null
        }
        Update: {
          author_id?: string | null
          created_at?: string
          detail?: string | null
          id?: string
          image_url?: string | null
          label?: string
          link_url?: string | null
          poll_id?: string
          source?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "poll_options_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poll_options_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "polls"
            referencedColumns: ["id"]
          },
        ]
      }
      poll_votes: {
        Row: {
          option_id: string
          poll_id: string
          updated_at: string
          voter_id: string
          weight: number
        }
        Insert: {
          option_id: string
          poll_id: string
          updated_at?: string
          voter_id: string
          weight: number
        }
        Update: {
          option_id?: string
          poll_id?: string
          updated_at?: string
          voter_id?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "poll_votes_option_id_fkey"
            columns: ["option_id"]
            isOneToOne: false
            referencedRelation: "poll_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poll_votes_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "polls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poll_votes_voter_id_fkey"
            columns: ["voter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      polls: {
        Row: {
          allow_suggestions: boolean
          created_at: string
          event_id: string
          id: string
          parent_poll_id: string | null
          phase: string
          resolution: string
          suggest_deadline: string | null
          tally_version: number
          title: string | null
          topic: string
          vote_deadline: string | null
          winning_option_id: string | null
        }
        Insert: {
          allow_suggestions?: boolean
          created_at?: string
          event_id: string
          id?: string
          parent_poll_id?: string | null
          phase?: string
          resolution?: string
          suggest_deadline?: string | null
          tally_version?: number
          title?: string | null
          topic?: string
          vote_deadline?: string | null
          winning_option_id?: string | null
        }
        Update: {
          allow_suggestions?: boolean
          created_at?: string
          event_id?: string
          id?: string
          parent_poll_id?: string | null
          phase?: string
          resolution?: string
          suggest_deadline?: string | null
          tally_version?: number
          title?: string | null
          topic?: string
          vote_deadline?: string | null
          winning_option_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "polls_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "polls_parent_poll_id_fkey"
            columns: ["parent_poll_id"]
            isOneToOne: false
            referencedRelation: "polls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "polls_winning_option_fk"
            columns: ["winning_option_id"]
            isOneToOne: false
            referencedRelation: "poll_options"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_avoids: {
        Row: {
          avoided_id: string
          avoider_id: string
          created_at: string
        }
        Insert: {
          avoided_id: string
          avoider_id: string
          created_at?: string
        }
        Update: {
          avoided_id?: string
          avoider_id?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_avoids_avoided_id_fkey"
            columns: ["avoided_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_avoids_avoider_id_fkey"
            columns: ["avoider_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_blocks_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_blocks_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_contacts: {
        Row: {
          created_at: string
          kind: string
          normalized_value: string
          updated_at: string
          user_id: string
          value: string
          verified_at: string | null
        }
        Insert: {
          created_at?: string
          kind: string
          normalized_value: string
          updated_at?: string
          user_id: string
          value: string
          verified_at?: string | null
        }
        Update: {
          created_at?: string
          kind?: string
          normalized_value?: string
          updated_at?: string
          user_id?: string
          value?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profile_contacts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_facts: {
        Row: {
          created_at: string
          id: string
          kind: string
          label: string
          org_key: string
          shown: boolean
          tier: string
          user_id: string
          verified_at: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          label: string
          org_key: string
          shown?: boolean
          tier?: string
          user_id: string
          verified_at?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          label?: string
          org_key?: string
          shown?: boolean
          tier?: string
          user_id?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profile_facts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          appearance_custom: Json
          appearance_theme: string
          avatar_url: string | null
          bio: string | null
          calendar_token: string
          community_covenant_accepted_at: string | null
          contact_email: string | null
          contact_phone: string | null
          contact_phone_normalized: string | null
          contact_public: boolean
          cover_url: string | null
          created_at: string
          digest_enabled: boolean
          digest_hour: number
          digest_sent_at: string | null
          discoverable: boolean
          discovery_contexts: string[]
          discovery_demographics: boolean
          discovery_geography: boolean
          discovery_interests: boolean
          discovery_involvements: boolean
          discovery_mutuals: boolean
          display_name: string
          down_to: string[]
          handle: string | null
          home_latitude: number | null
          home_longitude: number | null
          id: string
          interests: string[]
          last_signal_circle_id: string | null
          legal_terms_accepted_at: string | null
          legal_terms_version: string | null
          links: Json
          location: string | null
          notify_messages: boolean
          notify_plans: boolean
          notify_reminders: boolean
          notify_social: boolean
          notify_suggestions: boolean
          onboarded: boolean
          pronouns: string | null
          quiet_hours_end: number | null
          quiet_hours_start: number | null
          sabbatical: boolean
          sabbatical_message: string | null
          socials: Json
          tagline: string | null
          timezone: string
        }
        Insert: {
          appearance_custom?: Json
          appearance_theme?: string
          avatar_url?: string | null
          bio?: string | null
          calendar_token?: string
          community_covenant_accepted_at?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          contact_phone_normalized?: string | null
          contact_public?: boolean
          cover_url?: string | null
          created_at?: string
          digest_enabled?: boolean
          digest_hour?: number
          digest_sent_at?: string | null
          discoverable?: boolean
          discovery_contexts?: string[]
          discovery_demographics?: boolean
          discovery_geography?: boolean
          discovery_interests?: boolean
          discovery_involvements?: boolean
          discovery_mutuals?: boolean
          display_name?: string
          down_to?: string[]
          handle?: string | null
          home_latitude?: number | null
          home_longitude?: number | null
          id: string
          interests?: string[]
          last_signal_circle_id?: string | null
          legal_terms_accepted_at?: string | null
          legal_terms_version?: string | null
          links?: Json
          location?: string | null
          notify_messages?: boolean
          notify_plans?: boolean
          notify_reminders?: boolean
          notify_social?: boolean
          notify_suggestions?: boolean
          onboarded?: boolean
          pronouns?: string | null
          quiet_hours_end?: number | null
          quiet_hours_start?: number | null
          sabbatical?: boolean
          sabbatical_message?: string | null
          socials?: Json
          tagline?: string | null
          timezone?: string
        }
        Update: {
          appearance_custom?: Json
          appearance_theme?: string
          avatar_url?: string | null
          bio?: string | null
          calendar_token?: string
          community_covenant_accepted_at?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          contact_phone_normalized?: string | null
          contact_public?: boolean
          cover_url?: string | null
          created_at?: string
          digest_enabled?: boolean
          digest_hour?: number
          digest_sent_at?: string | null
          discoverable?: boolean
          discovery_contexts?: string[]
          discovery_demographics?: boolean
          discovery_geography?: boolean
          discovery_interests?: boolean
          discovery_involvements?: boolean
          discovery_mutuals?: boolean
          display_name?: string
          down_to?: string[]
          handle?: string | null
          home_latitude?: number | null
          home_longitude?: number | null
          id?: string
          interests?: string[]
          last_signal_circle_id?: string | null
          legal_terms_accepted_at?: string | null
          legal_terms_version?: string | null
          links?: Json
          location?: string | null
          notify_messages?: boolean
          notify_plans?: boolean
          notify_reminders?: boolean
          notify_social?: boolean
          notify_suggestions?: boolean
          onboarded?: boolean
          pronouns?: string | null
          quiet_hours_end?: number | null
          quiet_hours_start?: number | null
          sabbatical?: boolean
          sabbatical_message?: string | null
          socials?: Json
          tagline?: string | null
          timezone?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_last_signal_circle_id_fkey"
            columns: ["last_signal_circle_id"]
            isOneToOne: false
            referencedRelation: "circles"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limits: {
        Row: {
          attempts: number
          key_hash: string
          window_started_at: string
        }
        Insert: {
          attempts?: number
          key_hash: string
          window_started_at?: string
        }
        Update: {
          attempts?: number
          key_hash?: string
          window_started_at?: string
        }
        Relationships: []
      }
      ritual_reminders: {
        Row: {
          due_on: string
          ritual_id: string
          sent_at: string
          user_id: string
        }
        Insert: {
          due_on: string
          ritual_id: string
          sent_at?: string
          user_id: string
        }
        Update: {
          due_on?: string
          ritual_id?: string
          sent_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ritual_reminders_ritual_id_fkey"
            columns: ["ritual_id"]
            isOneToOne: false
            referencedRelation: "rituals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ritual_reminders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rituals: {
        Row: {
          activity: string
          cadence_days: number
          created_at: string
          creator_id: string
          due_on: string | null
          id: string
          last_planned_at: string | null
          partner_id: string
          status: string
        }
        Insert: {
          activity: string
          cadence_days: number
          created_at?: string
          creator_id: string
          due_on?: string | null
          id?: string
          last_planned_at?: string | null
          partner_id: string
          status?: string
        }
        Update: {
          activity?: string
          cadence_days?: number
          created_at?: string
          creator_id?: string
          due_on?: string | null
          id?: string
          last_planned_at?: string | null
          partner_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "rituals_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rituals_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      room_exact_locations: {
        Row: {
          accuracy_m: number | null
          expires_at: string
          latitude: number
          longitude: number
          room_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          accuracy_m?: number | null
          expires_at: string
          latitude: number
          longitude: number
          room_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          accuracy_m?: number | null
          expires_at?: string
          latitude?: number
          longitude?: number
          room_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_exact_locations_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_exact_locations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      room_items: {
        Row: {
          created_at: string
          created_by: string | null
          detail: string | null
          done: boolean
          id: string
          kind: string
          message_id: string | null
          room_id: string
          title: string
          url: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          detail?: string | null
          done?: boolean
          id?: string
          kind: string
          message_id?: string | null
          room_id: string
          title: string
          url?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          detail?: string | null
          done?: boolean
          id?: string
          kind?: string
          message_id?: string | null
          room_id?: string
          title?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "room_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_items_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_items_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      room_members: {
        Row: {
          joined_at: string
          last_read_at: string | null
          member_id: string
          muted: boolean
          room_id: string
        }
        Insert: {
          joined_at?: string
          last_read_at?: string | null
          member_id: string
          muted?: boolean
          room_id: string
        }
        Update: {
          joined_at?: string
          last_read_at?: string | null
          member_id?: string
          muted?: boolean
          room_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_members_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_members_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      rooms: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          kind: string
          title: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          title: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "rooms_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      scope_progress: {
        Row: {
          checked: boolean
          item_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          checked?: boolean
          item_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          checked?: boolean
          item_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      signal_nearby_notices: {
        Row: {
          notified_at: string
          owner_id: string
          recipient_id: string
        }
        Insert: {
          notified_at?: string
          owner_id: string
          recipient_id: string
        }
        Update: {
          notified_at?: string
          owner_id?: string
          recipient_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "signal_nearby_notices_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signal_nearby_notices_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_consent_events: {
        Row: {
          enabled: boolean
          id: string
          phone: string
          plans: boolean
          policy_version: string
          recorded_at: string
          reminders: boolean
          source: string
          urgent_changes: boolean
          user_id: string | null
        }
        Insert: {
          enabled: boolean
          id?: string
          phone: string
          plans: boolean
          policy_version?: string
          recorded_at?: string
          reminders: boolean
          source?: string
          urgent_changes?: boolean
          user_id?: string | null
        }
        Update: {
          enabled?: boolean
          id?: string
          phone?: string
          plans?: boolean
          policy_version?: string
          recorded_at?: string
          reminders?: boolean
          source?: string
          urgent_changes?: boolean
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sms_consent_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_inbound_receipts: {
        Row: {
          created_at: string
          sid: string
        }
        Insert: {
          created_at?: string
          sid: string
        }
        Update: {
          created_at?: string
          sid?: string
        }
        Relationships: []
      }
      sms_jobs: {
        Row: {
          attempts: number
          available_at: string
          body: string | null
          category: string
          created_at: string
          error_code: string | null
          expires_at: string
          id: string
          invite_id: string | null
          notification_id: string | null
          phone: string
          provider_message_id: string | null
          reply_code: string
          status: string
          updated_at: string
          urgent_until: string | null
          user_id: string | null
        }
        Insert: {
          attempts?: number
          available_at?: string
          body?: string | null
          category: string
          created_at?: string
          error_code?: string | null
          expires_at?: string
          id?: string
          invite_id?: string | null
          notification_id?: string | null
          phone: string
          provider_message_id?: string | null
          reply_code?: string
          status?: string
          updated_at?: string
          urgent_until?: string | null
          user_id?: string | null
        }
        Update: {
          attempts?: number
          available_at?: string
          body?: string | null
          category?: string
          created_at?: string
          error_code?: string | null
          expires_at?: string
          id?: string
          invite_id?: string | null
          notification_id?: string | null
          phone?: string
          provider_message_id?: string | null
          reply_code?: string
          status?: string
          updated_at?: string
          urgent_until?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sms_jobs_invite_id_fkey"
            columns: ["invite_id"]
            isOneToOne: false
            referencedRelation: "invites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sms_jobs_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: true
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sms_jobs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_opt_outs: {
        Row: {
          normalized_number: string
          opted_out_at: string
        }
        Insert: {
          normalized_number: string
          opted_out_at?: string
        }
        Update: {
          normalized_number?: string
          opted_out_at?: string
        }
        Relationships: []
      }
      sms_preferences: {
        Row: {
          consent_at: string
          consent_source: string
          enabled: boolean
          phone: string
          plans: boolean
          policy_version: string
          reminders: boolean
          updated_at: string
          urgent_changes: boolean
          user_id: string
        }
        Insert: {
          consent_at?: string
          consent_source?: string
          enabled?: boolean
          phone: string
          plans?: boolean
          policy_version?: string
          reminders?: boolean
          updated_at?: string
          urgent_changes?: boolean
          user_id: string
        }
        Update: {
          consent_at?: string
          consent_source?: string
          enabled?: boolean
          phone?: string
          plans?: boolean
          policy_version?: string
          reminders?: boolean
          updated_at?: string
          urgent_changes?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sms_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_events: {
        Row: {
          area: string
          cost_micros: number
          created_at: string
          entity_id: string | null
          entity_type: string | null
          error_code: string | null
          feature: string
          id: string
          input_tokens: number
          metadata: Json
          model: string | null
          output_tokens: number
          provider: string | null
          provider_message_id: string | null
          quantity: number
          route: string | null
          source: string
          status: string
          user_id: string | null
        }
        Insert: {
          area: string
          cost_micros?: number
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          error_code?: string | null
          feature: string
          id?: string
          input_tokens?: number
          metadata?: Json
          model?: string | null
          output_tokens?: number
          provider?: string | null
          provider_message_id?: string | null
          quantity?: number
          route?: string | null
          source: string
          status: string
          user_id?: string | null
        }
        Update: {
          area?: string
          cost_micros?: number
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          error_code?: string | null
          feature?: string
          id?: string
          input_tokens?: number
          metadata?: Json
          model?: string | null
          output_tokens?: number
          provider?: string | null
          provider_message_id?: string | null
          quantity?: number
          route?: string | null
          source?: string
          status?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "usage_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_reports: {
        Row: {
          created_at: string
          id: string
          message_id: string | null
          reason: string
          reported_id: string
          reporter_id: string
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          snapshot_body: string | null
          snapshot_image: string | null
          snapshot_title: string | null
          status: string
          target_id: string | null
          target_kind: string
        }
        Insert: {
          created_at?: string
          id?: string
          message_id?: string | null
          reason: string
          reported_id: string
          reporter_id: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          snapshot_body?: string | null
          snapshot_image?: string | null
          snapshot_title?: string | null
          status?: string
          target_id?: string | null
          target_kind?: string
        }
        Update: {
          created_at?: string
          id?: string
          message_id?: string | null
          reason?: string
          reported_id?: string
          reporter_id?: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          snapshot_body?: string | null
          snapshot_image?: string | null
          snapshot_title?: string | null
          status?: string
          target_id?: string | null
          target_kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_reports_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_reports_reported_id_fkey"
            columns: ["reported_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_reports_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_reports_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "board_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      venues: {
        Row: {
          area: string | null
          claimed_by: string | null
          created_at: string
          id: string
          name: string
          perk: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          url: string | null
        }
        Insert: {
          area?: string | null
          claimed_by?: string | null
          created_at?: string
          id?: string
          name: string
          perk: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          url?: string | null
        }
        Update: {
          area?: string | null
          claimed_by?: string | null
          created_at?: string
          id?: string
          name?: string
          perk?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "venues_claimed_by_fkey"
            columns: ["claimed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venues_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      zone_join_requests: {
        Row: {
          asks: number
          created_at: string
          decided_at: string | null
          id: string
          note: string | null
          requester_id: string
          status: string
          zone_id: string
        }
        Insert: {
          asks?: number
          created_at?: string
          decided_at?: string | null
          id?: string
          note?: string | null
          requester_id: string
          status?: string
          zone_id: string
        }
        Update: {
          asks?: number
          created_at?: string
          decided_at?: string | null
          id?: string
          note?: string | null
          requester_id?: string
          status?: string
          zone_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "zone_join_requests_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zone_join_requests_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "zones"
            referencedColumns: ["id"]
          },
        ]
      }
      zone_members: {
        Row: {
          joined_at: string
          member_id: string
          role: string
          zone_id: string
        }
        Insert: {
          joined_at?: string
          member_id: string
          role?: string
          zone_id: string
        }
        Update: {
          joined_at?: string
          member_id?: string
          role?: string
          zone_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "zone_members_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zone_members_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "zones"
            referencedColumns: ["id"]
          },
        ]
      }
      zones: {
        Row: {
          created_at: string
          description: string | null
          ends_at: string
          experiences: string[]
          id: string
          invite_code: string | null
          latitude: number | null
          longitude: number | null
          name: string
          organizer_id: string
          slug: string
          starts_at: string | null
          visibility: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          ends_at?: string
          experiences?: string[]
          id?: string
          invite_code?: string | null
          latitude?: number | null
          longitude?: number | null
          name: string
          organizer_id: string
          slug: string
          starts_at?: string | null
          visibility?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          ends_at?: string
          experiences?: string[]
          id?: string
          invite_code?: string | null
          latitude?: number | null
          longitude?: number | null
          name?: string
          organizer_id?: string
          slug?: string
          starts_at?: string | null
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "zones_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_cohost_invite: {
        Args: { p_cohost: string; p_event: string }
        Returns: string
      }
      app_schema_status: { Args: never; Returns: Json }
      app_schema_version: { Args: never; Returns: string }
      apply_cascade_updates: {
        Args: { p_event: string; p_updates: Json }
        Returns: {
          sent_id: string
        }[]
      }
      approve_join_request: { Args: { p_invite: string }; Returns: string }
      are_blocked: {
        Args: { p_user_a: string; p_user_b: string }
        Returns: boolean
      }
      are_connected: { Args: { a: string; b: string }; Returns: boolean }
      auth_user_id_by_email: { Args: { p_email: string }; Returns: string }
      calendar_subscription_status: {
        Args: never
        Returns: {
          connected: boolean
          covered_through: string
          last_status: string
          last_synced_at: string
          source_host: string
        }[]
      }
      can_access_event_thread: {
        Args: { p_event: string; p_user: string }
        Returns: boolean
      }
      can_current_user_add_to_capsule: {
        Args: { p_event: string }
        Returns: boolean
      }
      can_current_user_view_event: {
        Args: { p_event: string }
        Returns: boolean
      }
      can_current_user_view_zone: { Args: { p_zone: string }; Returns: boolean }
      can_view_event: {
        Args: { p_event: string; p_user: string }
        Returns: boolean
      }
      can_view_zone: {
        Args: { p_user: string; p_zone: string }
        Returns: boolean
      }
      claim_guest_invite: { Args: { p_token: string }; Returns: string }
      claim_guest_invites_by_contact: { Args: never; Returns: number }
      claim_notification_emails: {
        Args: never
        Returns: {
          category: string
          created_at: string
          email: string
          expires_at: string
          id: string
          notification_id: string
          status: string
          updated_at: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "notification_email_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_ritual_reminders: {
        Args: { p_limit?: number }
        Returns: {
          activity: string
          due_on: string
          other_id: string
          other_name: string
          ritual_id: string
          user_id: string
        }[]
      }
      claim_signal_nearby_recipients: {
        Args: {
          p_cooldown?: string
          p_limit?: number
          p_owner: string
          p_radius_m?: number
          p_signal_ids: string[]
        }
        Returns: string[]
      }
      claim_sms_jobs: {
        Args: never
        Returns: {
          attempts: number
          available_at: string
          body: string | null
          category: string
          created_at: string
          error_code: string | null
          expires_at: string
          id: string
          invite_id: string | null
          notification_id: string | null
          phone: string
          provider_message_id: string | null
          reply_code: string
          status: string
          updated_at: string
          urgent_until: string | null
          user_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "sms_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      compatibility_between: {
        Args: { p_other: string }
        Returns: {
          basis: string[]
          summary: string
        }[]
      }
      consume_rate_limit: {
        Args: { p_key_hash: string; p_limit: number; p_window_seconds: number }
        Returns: boolean
      }
      create_board: {
        Args: { p_description: string; p_name: string; p_slug: string }
        Returns: string
      }
      create_event_atomic: { Args: { p_input: Json }; Returns: string }
      decline_join_request: { Args: { p_invite: string }; Returns: string }
      delete_hosted_event_permanently: {
        Args: { p_event: string }
        Returns: string
      }
      digest_items: {
        Args: { p_user: string }
        Returns: {
          items: number
          kind: string
          latest_title: string
        }[]
      }
      dismiss_sms_route_note: { Args: never; Returns: undefined }
      ensure_board_invite_code: { Args: { p_board: string }; Returns: string }
      ensure_zone_invite_code: { Args: { p_zone: string }; Returns: string }
      event_availability_counts: {
        Args: { p_event: string }
        Returns: {
          mine: boolean
          people: number
          slot: string
        }[]
      }
      event_availability_summary: {
        Args: { p_event: string }
        Returns: {
          eligible_people: number
          responders: number
        }[]
      }
      event_invite_list: {
        Args: { p_event: string }
        Returns: {
          avatar_url: string
          display_name: string
          handle: string
          invite_id: string
          invitee_id: string
          status: string
        }[]
      }
      exact_locations_in_room: {
        Args: { p_room: string }
        Returns: {
          accuracy_m: number
          expires_at: string
          is_me: boolean
          latitude: number
          longitude: number
          updated_at: string
          user_id: string
        }[]
      }
      facet_live: { Args: { p_key: string; p_user: string }; Returns: boolean }
      find_nearby_people: {
        Args: { p_radius_m?: number }
        Returns: {
          avatar_url: string
          display_name: string
          distance_m: number
          emoji: string
          handle: string
          headline: string
          interests: string[]
          latitude: number
          longitude: number
          user_id: string
        }[]
      }
      find_private_zone_by_slug: {
        Args: { p_slug: string }
        Returns: {
          id: string
          name: string
          request_pending: boolean
        }[]
      }
      find_shared_moments: {
        Args: { p_place: string }
        Returns: {
          experiences: string[]
          headline: string
          id: string
        }[]
      }
      finish_operator_sweep: {
        Args: { p_counts: Json; p_sweep: string }
        Returns: undefined
      }
      guest_sms_allowed: {
        Args: { p_invite: string; p_phone: string }
        Returns: boolean
      }
      handle_sms_command: {
        Args: {
          p_code: string
          p_command: string
          p_phone: string
          p_sid: string
        }
        Returns: string
      }
      home_around_available: { Args: never; Returns: boolean }
      is_blocked_with: { Args: { p_other: string }; Returns: boolean }
      is_board_member: {
        Args: { p_board: string; p_user: string }
        Returns: boolean
      }
      is_board_moderator: {
        Args: { p_board: string; p_user: string }
        Returns: boolean
      }
      is_connected_with: { Args: { p_other: string }; Returns: boolean }
      is_current_user_board_member: {
        Args: { p_board: string }
        Returns: boolean
      }
      is_current_user_board_moderator: {
        Args: { p_board: string }
        Returns: boolean
      }
      is_current_user_event_host: {
        Args: { p_event: string }
        Returns: boolean
      }
      is_current_user_platform_moderator: { Args: never; Returns: boolean }
      is_current_user_room_member: {
        Args: { p_room: string }
        Returns: boolean
      }
      is_current_user_zone_member: {
        Args: { p_zone: string }
        Returns: boolean
      }
      is_current_user_zone_moderator: {
        Args: { p_zone: string }
        Returns: boolean
      }
      is_event_host: {
        Args: { p_event: string; p_user: string }
        Returns: boolean
      }
      is_platform_moderator: { Args: { p_user: string }; Returns: boolean }
      is_room_member: {
        Args: { p_room: string; p_user: string }
        Returns: boolean
      }
      is_zone_member: {
        Args: { p_user: string; p_zone: string }
        Returns: boolean
      }
      is_zone_moderator: {
        Args: { p_user: string; p_zone: string }
        Returns: boolean
      }
      join_board_via_code: { Args: { p_code: string }; Returns: string }
      join_zone_via_code: { Args: { p_code: string }; Returns: string }
      leave_room: { Args: { p_room: string }; Returns: string }
      list_discoverable_people: {
        Args: { p_category?: string }
        Returns: {
          avatar_url: string
          categories: string[]
          contexts: string[]
          display_name: string
          handle: string
          id: string
          location: string
          mutual_friend_count: number
          pronouns: string
          shared_down_to: string[]
          shared_interests: string[]
          tagline: string
        }[]
      }
      list_discovery_candidates: {
        Args: { p_self?: string }
        Returns: {
          avatar_url: string
          blurb: string
          categories: string[]
          contexts: string[]
          display_name: string
          fit: string
          handle: string
          id: string
          location: string
          mutual_friend_count: number
          pronouns: string
          shared_down_to: string[]
          shared_facts: Json
          shared_interests: string[]
          tagline: string
        }[]
      }
      list_nearby_plans: {
        Args: { p_max_km?: number }
        Returns: {
          distance_band: string
          event_id: string
          host_name: string
          known_via: string
          spots_left: number
          starts_at: string
          time_zone: string
          title: string
        }[]
      }
      list_open_reports: {
        Args: never
        Returns: {
          created_at: string
          id: string
          reason: string
          reported_handle: string
          reported_id: string
          reported_name: string
          reported_suspended_until: string
          reporter_id: string
          reporter_name: string
          room_title: string
          target_body: string
          target_exists: boolean
          target_id: string
          target_image: string
          target_kind: string
          target_removed_at: string
          target_title: string
        }[]
      }
      list_open_tables: {
        Args: never
        Returns: {
          event_id: string
          host_name: string
          known_via: string
          location_name: string
          spots_left: number
          starts_at: string
          time_zone: string
          title: string
        }[]
      }
      list_pending_venues: {
        Args: never
        Returns: {
          area: string
          claimant_name: string
          claimed_by: string
          created_at: string
          id: string
          name: string
          perk: string
          url: string
        }[]
      }
      list_people_distance_bands: {
        Args: never
        Returns: {
          distance_band: string
          person_id: string
        }[]
      }
      list_suspended_accounts: {
        Args: never
        Returns: {
          display_name: string
          handle: string
          member_id: string
          note: string
          suspended_at: string
          suspended_until: string
        }[]
      }
      moderate_lift_suspension: {
        Args: { p_member: string; p_note?: string }
        Returns: string
      }
      moderate_remove_board_post: {
        Args: { p_note?: string; p_post: string; p_report: string }
        Returns: string
      }
      moderate_remove_room_message: {
        Args: { p_message: string; p_note?: string; p_report: string }
        Returns: string
      }
      moderate_suspend_account: {
        Args: {
          p_days?: number
          p_member: string
          p_note?: string
          p_report: string
        }
        Returns: string
      }
      move_queued_invite: {
        Args: { p_invite: string; p_up: boolean }
        Returns: undefined
      }
      my_home_point: {
        Args: never
        Returns: {
          latitude: number
          longitude: number
        }[]
      }
      my_matchmaker_proposals: {
        Args: never
        Returns: {
          activity: string
          created_at: string
          id: string
          my_response: string
          note: string
          other_name: string
          proposer_name: string
          room_id: string
          status: string
        }[]
      }
      my_private_profile: {
        Args: never
        Returns: {
          calendar_token: string
          contact_email: string
          contact_phone: string
        }[]
      }
      my_recent_matches: {
        Args: { p_limit?: number }
        Returns: {
          activity: string
          created_at: string
          id: string
          room_id: string
        }[]
      }
      my_room_inbox: {
        Args: never
        Returns: {
          kind: string
          last_message_at: string
          last_message_body: string
          last_read_at: string
          last_sender_id: string
          muted: boolean
          room_created_at: string
          room_id: string
          title: string
        }[]
      }
      my_signal_default_circle: { Args: never; Returns: string }
      normalize_phone_number: { Args: { p_value: string }; Returns: string }
      note_give_space_overlap: { Args: { p_event: string }; Returns: boolean }
      note_give_space_overlap_for: {
        Args: { p_event: string; p_user: string }
        Returns: boolean
      }
      note_ritual_planned: {
        Args: { p_event: string; p_ritual: string }
        Returns: string
      }
      open_signal_chat: { Args: { p_other: string }; Returns: string }
      operator_sweep_status: {
        Args: { p_sweep: string }
        Returns: {
          last_counts: Json
          last_run_at: string
          last_started_at: string
          running_until: string
        }[]
      }
      poll_results: {
        Args: { p_poll: string }
        Returns: {
          loves: number
          objections: number
          option_id: string
          score: number
          voters: number
        }[]
      }
      record_sms_status: {
        Args: {
          p_error: string
          p_id: string
          p_phone: string
          p_sid: string
          p_status: string
        }
        Returns: boolean
      }
      replace_event_availability: {
        Args: { p_event: string; p_slots: string[] }
        Returns: undefined
      }
      request_to_join: { Args: { p_event: string }; Returns: string }
      request_zone_join: {
        Args: { p_note?: string; p_zone: string }
        Returns: {
          outcome: string
          retry_after: string
        }[]
      }
      reschedule_cancel_event: { Args: { p_event: string }; Returns: boolean }
      resolve_parental_approval: {
        Args: { p_approve: boolean; p_token: string }
        Returns: Json
      }
      resolve_poll_children: { Args: { p_poll: string }; Returns: string[] }
      resolve_profile_contact: {
        Args: { p_identifier: string }
        Returns: {
          display_name: string
          handle: string
          id: string
          match_kind: string
        }[]
      }
      resolve_report: {
        Args: { p_note?: string; p_report: string; p_status: string }
        Returns: undefined
      }
      resolve_zone_join_request: {
        Args: { p_approve: boolean; p_request: string }
        Returns: boolean
      }
      respond_to_guest_invite: {
        Args: { p_accept: boolean; p_token: string }
        Returns: string
      }
      respond_to_invite: {
        Args: { p_accept: boolean; p_invite: string; p_note?: string }
        Returns: string
      }
      respond_to_matchmaker: {
        Args: { p_accept: boolean; p_proposal: string }
        Returns: string
      }
      review_venue: {
        Args: { p_decision: string; p_note?: string; p_venue: string }
        Returns: undefined
      }
      room_is_read_only: { Args: { p_room: string }; Returns: boolean }
      rotate_board_invite_code: { Args: { p_board: string }; Returns: string }
      rotate_event_share_token: {
        Args: { p_event: string; p_user: string }
        Returns: string
      }
      rotate_zone_invite_code: { Args: { p_zone: string }; Returns: string }
      rsvp_via_share_token: {
        Args: {
          p_accept: boolean
          p_contact: string
          p_name: string
          p_token: string
          p_user: string
        }
        Returns: {
          outcome: string
          token: string
        }[]
      }
      save_expense: {
        Args: {
          p_amount_cents: number
          p_description: string
          p_expense?: string
          p_participants: string[]
          p_payer: string
          p_room: string
          p_settle_url?: string
        }
        Returns: string
      }
      set_board_member_role: {
        Args: { p_board: string; p_member: string; p_role: string }
        Returns: string
      }
      set_invite_stage: {
        Args: { p_invite: string; p_stage: number }
        Returns: undefined
      }
      set_invite_window: {
        Args: { p_invite: string; p_minutes: number }
        Returns: undefined
      }
      set_my_signal_default_circle: {
        Args: { p_circle: string }
        Returns: undefined
      }
      set_notification_routes: {
        Args: { p_plans: string; p_reminders: string; p_urgent: boolean }
        Returns: undefined
      }
      set_sms_preferences: {
        Args: { p_enabled: boolean; p_plans: boolean; p_reminders: boolean }
        Returns: undefined
      }
      settle_up: { Args: { p_other: string; p_room: string }; Returns: number }
      share_exact_location: {
        Args: {
          p_accuracy_m?: number
          p_latitude: number
          p_longitude: number
          p_restart?: boolean
          p_room: string
        }
        Returns: string
      }
      shared_facets_of: {
        Args: { p_target: string }
        Returns: {
          computed_at: string
          confidence: string
          facet_key: string
          summary: string
          title: string
        }[]
      }
      skip_ritual: {
        Args: { p_due_on: string; p_ritual: string }
        Returns: string
      }
      stop_exact_location: { Args: { p_room: string }; Returns: undefined }
      sweep_retention: {
        Args: { p_now?: string }
        Returns: {
          contact_verification_requests_deleted: number
          moments_deleted: number
          notifications_deleted: number
          rate_limits_deleted: number
        }[]
      }
      try_claim_operator_sweep: {
        Args: { p_lease_seconds?: number; p_sweep: string }
        Returns: boolean
      }
      unmatch: { Args: { p_match: string }; Returns: string }
      viewer_in_signal_audience: {
        Args: { p_circle_ids: string[]; p_owner: string; p_viewer: string }
        Returns: boolean
      }
      vouch_for_fact: { Args: { p_fact: string }; Returns: string }
      withdraw_vouch: { Args: { p_fact: string }; Returns: string }
      zone_presence: { Args: { p_zone: string }; Returns: number }
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

