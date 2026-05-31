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
      admin_audit_log: {
        Row: {
          action: string
          actor_user_id: string | null
          after_data: Json | null
          before_data: Json | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_audit_log_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      album_samples: {
        Row: {
          album_id: string
          created_at: string
          sample_id: string
          sort_order: number
        }
        Insert: {
          album_id: string
          created_at?: string
          sample_id: string
          sort_order?: number
        }
        Update: {
          album_id?: string
          created_at?: string
          sample_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "album_samples_album_id_fkey"
            columns: ["album_id"]
            isOneToOne: false
            referencedRelation: "albums"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "album_samples_sample_id_fkey"
            columns: ["sample_id"]
            isOneToOne: false
            referencedRelation: "samples"
            referencedColumns: ["id"]
          },
        ]
      }
      albums: {
        Row: {
          archived_at: string | null
          cover_image_path: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          published_at: string | null
          slug: string
          status: Database["public"]["Enums"]["album_status"]
          title: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          cover_image_path?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          published_at?: string | null
          slug: string
          status?: Database["public"]["Enums"]["album_status"]
          title: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          cover_image_path?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          published_at?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["album_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "albums_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          description: string | null
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          description?: string | null
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          description?: string | null
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "app_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          description: string | null
          is_active: boolean
          label: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          is_active?: boolean
          label: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          is_active?: boolean
          label?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      collection_items: {
        Row: {
          added_at: string
          collection_id: string
          sample_id: string
          sort_order: number
        }
        Insert: {
          added_at?: string
          collection_id: string
          sample_id: string
          sort_order?: number
        }
        Update: {
          added_at?: string
          collection_id?: string
          sample_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "collection_items_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_items_sample_id_fkey"
            columns: ["sample_id"]
            isOneToOne: false
            referencedRelation: "samples"
            referencedColumns: ["id"]
          },
        ]
      }
      collections: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          updated_at: string
          user_id: string
          visibility: Database["public"]["Enums"]["collection_visibility"]
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
          user_id: string
          visibility?: Database["public"]["Enums"]["collection_visibility"]
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
          visibility?: Database["public"]["Enums"]["collection_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "collections_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      downloads: {
        Row: {
          created_at: string
          file_version: string | null
          id: string
          ip: unknown
          sample_id: string
          source: Database["public"]["Enums"]["download_source"]
          subscription_state_at_download:
            | Database["public"]["Enums"]["subscription_status"]
            | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          file_version?: string | null
          id?: string
          ip?: unknown
          sample_id: string
          source: Database["public"]["Enums"]["download_source"]
          subscription_state_at_download?:
            | Database["public"]["Enums"]["subscription_status"]
            | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          file_version?: string | null
          id?: string
          ip?: unknown
          sample_id?: string
          source?: Database["public"]["Enums"]["download_source"]
          subscription_state_at_download?:
            | Database["public"]["Enums"]["subscription_status"]
            | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "downloads_sample_id_fkey"
            columns: ["sample_id"]
            isOneToOne: false
            referencedRelation: "samples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "downloads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      entitlement_events: {
        Row: {
          created_at: string
          id: string
          new_status: Database["public"]["Enums"]["subscription_status"] | null
          payload: Json | null
          previous_status:
            | Database["public"]["Enums"]["subscription_status"]
            | null
          stripe_event_id: string | null
          stripe_event_type: string | null
          subscription_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          new_status?: Database["public"]["Enums"]["subscription_status"] | null
          payload?: Json | null
          previous_status?:
            | Database["public"]["Enums"]["subscription_status"]
            | null
          stripe_event_id?: string | null
          stripe_event_type?: string | null
          subscription_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          new_status?: Database["public"]["Enums"]["subscription_status"] | null
          payload?: Json | null
          previous_status?:
            | Database["public"]["Enums"]["subscription_status"]
            | null
          stripe_event_id?: string | null
          stripe_event_type?: string | null
          subscription_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "entitlement_events_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entitlement_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      favorites: {
        Row: {
          created_at: string
          sample_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          sample_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          sample_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorites_sample_id_fkey"
            columns: ["sample_id"]
            isOneToOne: false
            referencedRelation: "samples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorites_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      hidden_tags: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          is_active: boolean
          label: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          is_active?: boolean
          label: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          is_active?: boolean
          label?: string
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hidden_tags_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mood_category_suggestions: {
        Row: {
          category_slug: string
          created_at: string
          mood_slug: string
          weight: number
        }
        Insert: {
          category_slug: string
          created_at?: string
          mood_slug: string
          weight?: number
        }
        Update: {
          category_slug?: string
          created_at?: string
          mood_slug?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "mood_category_suggestions_category_slug_fkey"
            columns: ["category_slug"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["slug"]
          },
          {
            foreignKeyName: "mood_category_suggestions_mood_slug_fkey"
            columns: ["mood_slug"]
            isOneToOne: false
            referencedRelation: "moods"
            referencedColumns: ["slug"]
          },
        ]
      }
      moods: {
        Row: {
          created_at: string
          description: string | null
          is_active: boolean
          label: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          is_active?: boolean
          label: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          is_active?: boolean
          label?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      processing_jobs: {
        Row: {
          attempts: number
          created_at: string
          finished_at: string | null
          id: string
          input_bucket: string | null
          input_path: string | null
          job_type: Database["public"]["Enums"]["processing_job_type"]
          last_error_code: string | null
          last_error_message: string | null
          max_attempts: number
          metadata: Json
          output_preview_path: string | null
          output_waveform_path: string | null
          sample_id: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["processing_job_status"]
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          finished_at?: string | null
          id?: string
          input_bucket?: string | null
          input_path?: string | null
          job_type: Database["public"]["Enums"]["processing_job_type"]
          last_error_code?: string | null
          last_error_message?: string | null
          max_attempts?: number
          metadata?: Json
          output_preview_path?: string | null
          output_waveform_path?: string | null
          sample_id?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["processing_job_status"]
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          finished_at?: string | null
          id?: string
          input_bucket?: string | null
          input_path?: string | null
          job_type?: Database["public"]["Enums"]["processing_job_type"]
          last_error_code?: string | null
          last_error_message?: string | null
          max_attempts?: number
          metadata?: Json
          output_preview_path?: string | null
          output_waveform_path?: string | null
          sample_id?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["processing_job_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "processing_jobs_sample_id_fkey"
            columns: ["sample_id"]
            isOneToOne: false
            referencedRelation: "samples"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          last_seen_at: string | null
          role: Database["public"]["Enums"]["profile_role"]
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          last_seen_at?: string | null
          role?: Database["public"]["Enums"]["profile_role"]
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          last_seen_at?: string | null
          role?: Database["public"]["Enums"]["profile_role"]
          updated_at?: string
        }
        Relationships: []
      }
      recently_played: {
        Row: {
          played_at: string
          sample_id: string
          source: Database["public"]["Enums"]["play_source"]
          user_id: string
        }
        Insert: {
          played_at?: string
          sample_id: string
          source: Database["public"]["Enums"]["play_source"]
          user_id: string
        }
        Update: {
          played_at?: string
          sample_id?: string
          source?: Database["public"]["Enums"]["play_source"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recently_played_sample_id_fkey"
            columns: ["sample_id"]
            isOneToOne: false
            referencedRelation: "samples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recently_played_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sample_assets: {
        Row: {
          access_level: Database["public"]["Enums"]["asset_access_level"]
          bucket: string
          checksum_sha256: string | null
          created_at: string
          file_size_bytes: number | null
          id: string
          kind: Database["public"]["Enums"]["asset_kind"]
          mime_type: string | null
          object_path: string
          sample_id: string
          updated_at: string
        }
        Insert: {
          access_level: Database["public"]["Enums"]["asset_access_level"]
          bucket: string
          checksum_sha256?: string | null
          created_at?: string
          file_size_bytes?: number | null
          id?: string
          kind: Database["public"]["Enums"]["asset_kind"]
          mime_type?: string | null
          object_path: string
          sample_id: string
          updated_at?: string
        }
        Update: {
          access_level?: Database["public"]["Enums"]["asset_access_level"]
          bucket?: string
          checksum_sha256?: string | null
          created_at?: string
          file_size_bytes?: number | null
          id?: string
          kind?: Database["public"]["Enums"]["asset_kind"]
          mime_type?: string | null
          object_path?: string
          sample_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sample_assets_sample_id_fkey"
            columns: ["sample_id"]
            isOneToOne: false
            referencedRelation: "samples"
            referencedColumns: ["id"]
          },
        ]
      }
      sample_hidden_tags: {
        Row: {
          created_at: string
          sample_id: string
          tag_slug: string
        }
        Insert: {
          created_at?: string
          sample_id: string
          tag_slug: string
        }
        Update: {
          created_at?: string
          sample_id?: string
          tag_slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "sample_hidden_tags_sample_id_fkey"
            columns: ["sample_id"]
            isOneToOne: false
            referencedRelation: "samples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sample_hidden_tags_tag_slug_fkey"
            columns: ["tag_slug"]
            isOneToOne: false
            referencedRelation: "hidden_tags"
            referencedColumns: ["slug"]
          },
        ]
      }
      sample_moods: {
        Row: {
          created_at: string
          mood_slug: string
          sample_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          mood_slug: string
          sample_id: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          mood_slug?: string
          sample_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "sample_moods_mood_slug_fkey"
            columns: ["mood_slug"]
            isOneToOne: false
            referencedRelation: "moods"
            referencedColumns: ["slug"]
          },
          {
            foreignKeyName: "sample_moods_sample_id_fkey"
            columns: ["sample_id"]
            isOneToOne: false
            referencedRelation: "samples"
            referencedColumns: ["id"]
          },
        ]
      }
      sample_play_events: {
        Row: {
          completed: boolean | null
          created_at: string
          id: string
          sample_id: string
          seconds_played: number | null
          source: Database["public"]["Enums"]["play_source"]
          user_id: string | null
        }
        Insert: {
          completed?: boolean | null
          created_at?: string
          id?: string
          sample_id: string
          seconds_played?: number | null
          source: Database["public"]["Enums"]["play_source"]
          user_id?: string | null
        }
        Update: {
          completed?: boolean | null
          created_at?: string
          id?: string
          sample_id?: string
          seconds_played?: number | null
          source?: Database["public"]["Enums"]["play_source"]
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sample_play_events_sample_id_fkey"
            columns: ["sample_id"]
            isOneToOne: false
            referencedRelation: "samples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sample_play_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sample_search_documents: {
        Row: {
          album_text: string
          category_text: string
          combined_fts: unknown
          description_text: string
          display_title_text: string
          hidden_tag_text: string
          mood_text: string
          poetic_name_text: string
          sample_id: string
          sample_type_text: string
          search_vector: string | null
          updated_at: string
        }
        Insert: {
          album_text?: string
          category_text?: string
          combined_fts?: unknown
          description_text?: string
          display_title_text?: string
          hidden_tag_text?: string
          mood_text?: string
          poetic_name_text?: string
          sample_id: string
          sample_type_text?: string
          search_vector?: string | null
          updated_at?: string
        }
        Update: {
          album_text?: string
          category_text?: string
          combined_fts?: unknown
          description_text?: string
          display_title_text?: string
          hidden_tag_text?: string
          mood_text?: string
          poetic_name_text?: string
          sample_id?: string
          sample_type_text?: string
          search_vector?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sample_search_documents_sample_id_fkey"
            columns: ["sample_id"]
            isOneToOne: true
            referencedRelation: "samples"
            referencedColumns: ["id"]
          },
        ]
      }
      sample_stats: {
        Row: {
          download_count: number
          favorite_count: number
          last_downloaded_at: string | null
          last_played_at: string | null
          play_count: number
          sample_id: string
          similar_click_count: number
          updated_at: string
          wander_skip_count: number
        }
        Insert: {
          download_count?: number
          favorite_count?: number
          last_downloaded_at?: string | null
          last_played_at?: string | null
          play_count?: number
          sample_id: string
          similar_click_count?: number
          updated_at?: string
          wander_skip_count?: number
        }
        Update: {
          download_count?: number
          favorite_count?: number
          last_downloaded_at?: string | null
          last_played_at?: string | null
          play_count?: number
          sample_id?: string
          similar_click_count?: number
          updated_at?: string
          wander_skip_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "sample_stats_sample_id_fkey"
            columns: ["sample_id"]
            isOneToOne: true
            referencedRelation: "samples"
            referencedColumns: ["id"]
          },
        ]
      }
      sample_types: {
        Row: {
          can_be_loopable: boolean
          created_at: string
          description: string | null
          is_active: boolean
          label: string
          requires_bpm: boolean
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          can_be_loopable?: boolean
          created_at?: string
          description?: string | null
          is_active?: boolean
          label: string
          requires_bpm?: boolean
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          can_be_loopable?: boolean
          created_at?: string
          description?: string | null
          is_active?: boolean
          label?: string
          requires_bpm?: boolean
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      samples: {
        Row: {
          archived_at: string | null
          attribution_required: boolean
          bit_depth: number | null
          bpm: number | null
          category_slug: string
          channels: number | null
          commercial_use_allowed: boolean
          created_at: string
          display_title: string
          display_title_is_custom: boolean
          duration_seconds: number | null
          failed_at: string | null
          featured: boolean
          file_hash_sha256: string | null
          file_size_bytes: number | null
          id: string
          is_melodic: boolean
          license_confirmed_at: string | null
          license_confirmed_by: string | null
          license_notes: string | null
          license_status: Database["public"]["Enums"]["license_status"]
          loopable: boolean
          musical_key: string | null
          poetic_name: string
          published_at: string | null
          redistribution_allowed: boolean
          rights_owner: string | null
          sample_rate: number | null
          sample_type_slug: string
          short_description: string | null
          source_type: Database["public"]["Enums"]["source_type"]
          status: Database["public"]["Enums"]["sample_status"]
          unknown_key_confirmed: boolean
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          archived_at?: string | null
          attribution_required?: boolean
          bit_depth?: number | null
          bpm?: number | null
          category_slug: string
          channels?: number | null
          commercial_use_allowed?: boolean
          created_at?: string
          display_title: string
          display_title_is_custom?: boolean
          duration_seconds?: number | null
          failed_at?: string | null
          featured?: boolean
          file_hash_sha256?: string | null
          file_size_bytes?: number | null
          id?: string
          is_melodic?: boolean
          license_confirmed_at?: string | null
          license_confirmed_by?: string | null
          license_notes?: string | null
          license_status?: Database["public"]["Enums"]["license_status"]
          loopable?: boolean
          musical_key?: string | null
          poetic_name: string
          published_at?: string | null
          redistribution_allowed?: boolean
          rights_owner?: string | null
          sample_rate?: number | null
          sample_type_slug: string
          short_description?: string | null
          source_type?: Database["public"]["Enums"]["source_type"]
          status?: Database["public"]["Enums"]["sample_status"]
          unknown_key_confirmed?: boolean
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          archived_at?: string | null
          attribution_required?: boolean
          bit_depth?: number | null
          bpm?: number | null
          category_slug?: string
          channels?: number | null
          commercial_use_allowed?: boolean
          created_at?: string
          display_title?: string
          display_title_is_custom?: boolean
          duration_seconds?: number | null
          failed_at?: string | null
          featured?: boolean
          file_hash_sha256?: string | null
          file_size_bytes?: number | null
          id?: string
          is_melodic?: boolean
          license_confirmed_at?: string | null
          license_confirmed_by?: string | null
          license_notes?: string | null
          license_status?: Database["public"]["Enums"]["license_status"]
          loopable?: boolean
          musical_key?: string | null
          poetic_name?: string
          published_at?: string | null
          redistribution_allowed?: boolean
          rights_owner?: string | null
          sample_rate?: number | null
          sample_type_slug?: string
          short_description?: string | null
          source_type?: Database["public"]["Enums"]["source_type"]
          status?: Database["public"]["Enums"]["sample_status"]
          unknown_key_confirmed?: boolean
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "samples_category_slug_fkey"
            columns: ["category_slug"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["slug"]
          },
          {
            foreignKeyName: "samples_license_confirmed_by_fkey"
            columns: ["license_confirmed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "samples_sample_type_slug_fkey"
            columns: ["sample_type_slug"]
            isOneToOne: false
            referencedRelation: "sample_types"
            referencedColumns: ["slug"]
          },
          {
            foreignKeyName: "samples_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      search_logs: {
        Row: {
          clicked_sample_id: string | null
          created_at: string
          filters: Json
          id: string
          query: string | null
          result_count: number
          source: Database["public"]["Enums"]["search_source"]
          user_id: string | null
        }
        Insert: {
          clicked_sample_id?: string | null
          created_at?: string
          filters?: Json
          id?: string
          query?: string | null
          result_count?: number
          source?: Database["public"]["Enums"]["search_source"]
          user_id?: string | null
        }
        Update: {
          clicked_sample_id?: string | null
          created_at?: string
          filters?: Json
          id?: string
          query?: string | null
          result_count?: number
          source?: Database["public"]["Enums"]["search_source"]
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "search_logs_clicked_sample_id_fkey"
            columns: ["clicked_sample_id"]
            isOneToOne: false
            referencedRelation: "samples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "search_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      similar_sample_events: {
        Row: {
          clicked_sample_id: string
          created_at: string
          id: string
          source_sample_id: string
          user_id: string | null
        }
        Insert: {
          clicked_sample_id: string
          created_at?: string
          id?: string
          source_sample_id: string
          user_id?: string | null
        }
        Update: {
          clicked_sample_id?: string
          created_at?: string
          id?: string
          source_sample_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "similar_sample_events_clicked_sample_id_fkey"
            columns: ["clicked_sample_id"]
            isOneToOne: false
            referencedRelation: "samples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "similar_sample_events_source_sample_id_fkey"
            columns: ["source_sample_id"]
            isOneToOne: false
            referencedRelation: "samples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "similar_sample_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_webhook_events: {
        Row: {
          error_message: string | null
          event_type: string
          payload: Json
          processed_at: string | null
          processing_status: Database["public"]["Enums"]["webhook_processing_status"]
          received_at: string
          stripe_event_id: string
        }
        Insert: {
          error_message?: string | null
          event_type: string
          payload: Json
          processed_at?: string | null
          processing_status?: Database["public"]["Enums"]["webhook_processing_status"]
          received_at?: string
          stripe_event_id: string
        }
        Update: {
          error_message?: string | null
          event_type?: string
          payload?: Json
          processed_at?: string | null
          processing_status?: Database["public"]["Enums"]["webhook_processing_status"]
          received_at?: string
          stripe_event_id?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          status: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id: string | null
          stripe_price_id: string | null
          stripe_subscription_id: string | null
          trial_end: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          status?: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          trial_end?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          status?: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          trial_end?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      wander_events: {
        Row: {
          action: string
          created_at: string
          id: string
          mood_slug: string | null
          sample_id: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          mood_slug?: string | null
          sample_id?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          mood_slug?: string | null
          sample_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wander_events_mood_slug_fkey"
            columns: ["mood_slug"]
            isOneToOne: false
            referencedRelation: "moods"
            referencedColumns: ["slug"]
          },
          {
            foreignKeyName: "wander_events_sample_id_fkey"
            columns: ["sample_id"]
            isOneToOne: false
            referencedRelation: "samples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wander_events_user_id_fkey"
            columns: ["user_id"]
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
      current_profile_role: {
        Args: never
        Returns: Database["public"]["Enums"]["profile_role"]
      }
      free_launch_downloads_enabled: { Args: never; Returns: boolean }
      has_download_entitlement: { Args: never; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
      refresh_sample_search_document: {
        Args: { target_sample_id: string }
        Returns: undefined
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      album_status: "draft" | "published" | "archived"
      asset_access_level: "public" | "private" | "entitlement_required"
      asset_kind:
        | "original_wav"
        | "preview_audio"
        | "waveform_peaks"
        | "album_artwork"
      collection_visibility: "private"
      download_source: "web" | "plugin"
      license_status:
        | "unverified"
        | "verified"
        | "restricted"
        | "blocked"
        | "archived"
      play_source: "web" | "plugin"
      processing_job_status:
        | "queued"
        | "running"
        | "succeeded"
        | "failed"
        | "canceled"
        | "timed_out"
      processing_job_type:
        | "initial_upload"
        | "reprocess_preview"
        | "reprocess_waveform"
        | "reprocess_metadata"
      profile_role: "user" | "admin"
      sample_status:
        | "draft"
        | "processing"
        | "needs_review"
        | "published"
        | "archived"
        | "failed"
      search_source: "web" | "plugin"
      source_type:
        | "original_recording"
        | "synthesized"
        | "field_recording"
        | "processed_original"
        | "licensed_source"
      subscription_status:
        | "free_launch_access"
        | "trialing"
        | "active"
        | "past_due"
        | "canceled"
        | "unpaid"
        | "lifetime_granted"
      webhook_processing_status: "received" | "processed" | "failed" | "ignored"
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
    Enums: {
      album_status: ["draft", "published", "archived"],
      asset_access_level: ["public", "private", "entitlement_required"],
      asset_kind: [
        "original_wav",
        "preview_audio",
        "waveform_peaks",
        "album_artwork",
      ],
      collection_visibility: ["private"],
      download_source: ["web", "plugin"],
      license_status: [
        "unverified",
        "verified",
        "restricted",
        "blocked",
        "archived",
      ],
      play_source: ["web", "plugin"],
      processing_job_status: [
        "queued",
        "running",
        "succeeded",
        "failed",
        "canceled",
        "timed_out",
      ],
      processing_job_type: [
        "initial_upload",
        "reprocess_preview",
        "reprocess_waveform",
        "reprocess_metadata",
      ],
      profile_role: ["user", "admin"],
      sample_status: [
        "draft",
        "processing",
        "needs_review",
        "published",
        "archived",
        "failed",
      ],
      search_source: ["web", "plugin"],
      source_type: [
        "original_recording",
        "synthesized",
        "field_recording",
        "processed_original",
        "licensed_source",
      ],
      subscription_status: [
        "free_launch_access",
        "trialing",
        "active",
        "past_due",
        "canceled",
        "unpaid",
        "lifetime_granted",
      ],
      webhook_processing_status: ["received", "processed", "failed", "ignored"],
    },
  },
} as const
