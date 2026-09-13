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
      admin_accounts: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          level: string
          name: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id: string
          is_active?: boolean
          level?: string
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          level?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_accounts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "admin_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_events: {
        Row: {
          book_id: string | null
          created_at: string
          event: string
          id: number
          post_id: string | null
          props: Json
          session_id: string | null
          user_id: string | null
        }
        Insert: {
          book_id?: string | null
          created_at?: string
          event: string
          id?: never
          post_id?: string | null
          props?: Json
          session_id?: string | null
          user_id?: string | null
        }
        Update: {
          book_id?: string | null
          created_at?: string
          event?: string
          id?: never
          post_id?: string | null
          props?: Json
          session_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "analytics_events_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analytics_events_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analytics_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      banned_words: {
        Row: {
          id: string
          word: string
        }
        Insert: {
          id?: string
          word: string
        }
        Update: {
          id?: string
          word?: string
        }
        Relationships: []
      }
      book_trailers: {
        Row: {
          asset_group_id: string | null
          book_id: string
          created_at: string
          duration_sec: number | null
          hls_path: string | null
          poster_path: string | null
          renditions: Json | null
          source_type: string
          video_path: string | null
          youtube_id: string | null
        }
        Insert: {
          asset_group_id?: string | null
          book_id: string
          created_at?: string
          duration_sec?: number | null
          hls_path?: string | null
          poster_path?: string | null
          renditions?: Json | null
          source_type: string
          video_path?: string | null
          youtube_id?: string | null
        }
        Update: {
          asset_group_id?: string | null
          book_id?: string
          created_at?: string
          duration_sec?: number | null
          hls_path?: string | null
          poster_path?: string | null
          renditions?: Json | null
          source_type?: string
          video_path?: string | null
          youtube_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "book_trailers_asset_group_id_fkey"
            columns: ["asset_group_id"]
            isOneToOne: false
            referencedRelation: "video_uploads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "book_trailers_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: true
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
        ]
      }
      bookmarks: {
        Row: {
          book_id: string
          created_at: string
          user_id: string
        }
        Insert: {
          book_id: string
          created_at?: string
          user_id?: string
        }
        Update: {
          book_id?: string
          created_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookmarks_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookmarks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      books: {
        Row: {
          author: string
          category: string
          cover_design: Json | null
          cover_url: string | null
          created_at: string
          epub_path: string | null
          file_size_mb: number | null
          id: string
          intro: string | null
          isbn: string | null
          page_count: number | null
          pub_date_ebook: string | null
          pub_date_paper: string | null
          publisher: string | null
          purchase_links: Json | null
          quote: string | null
          quote_source: string | null
          rights_note: string | null
          source: string | null
          source_ref: string | null
          title: string
          toc: Json
          translator: string | null
        }
        Insert: {
          author: string
          category: string
          cover_design?: Json | null
          cover_url?: string | null
          created_at?: string
          epub_path?: string | null
          file_size_mb?: number | null
          id?: string
          intro?: string | null
          isbn?: string | null
          page_count?: number | null
          pub_date_ebook?: string | null
          pub_date_paper?: string | null
          publisher?: string | null
          purchase_links?: Json | null
          quote?: string | null
          quote_source?: string | null
          rights_note?: string | null
          source?: string | null
          source_ref?: string | null
          title: string
          toc?: Json
          translator?: string | null
        }
        Update: {
          author?: string
          category?: string
          cover_design?: Json | null
          cover_url?: string | null
          created_at?: string
          epub_path?: string | null
          file_size_mb?: number | null
          id?: string
          intro?: string | null
          isbn?: string | null
          page_count?: number | null
          pub_date_ebook?: string | null
          pub_date_paper?: string | null
          publisher?: string | null
          purchase_links?: Json | null
          quote?: string | null
          quote_source?: string | null
          rights_note?: string | null
          source?: string | null
          source_ref?: string | null
          title?: string
          toc?: Json
          translator?: string | null
        }
        Relationships: []
      }
      channels: {
        Row: {
          avatar_url: string | null
          cover_url: string | null
          created_at: string
          description: string | null
          genre: string
          id: string
          name: string
          slug: string
        }
        Insert: {
          avatar_url?: string | null
          cover_url?: string | null
          created_at?: string
          description?: string | null
          genre: string
          id?: string
          name: string
          slug: string
        }
        Update: {
          avatar_url?: string | null
          cover_url?: string | null
          created_at?: string
          description?: string | null
          genre?: string
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      comment_likes: {
        Row: {
          comment_id: string
          created_at: string
          user_id: string
        }
        Insert: {
          comment_id: string
          created_at?: string
          user_id?: string
        }
        Update: {
          comment_id?: string
          created_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comment_likes_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          content: string
          created_at: string
          deleted_at: string | null
          id: string
          like_count: number
          parent_id: string | null
          post_id: string
          reply_target_id: string | null
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          like_count?: number
          parent_id?: string | null
          post_id: string
          reply_target_id?: string | null
          user_id?: string
        }
        Update: {
          content?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          like_count?: number
          parent_id?: string | null
          post_id?: string
          reply_target_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_reply_target_id_fkey"
            columns: ["reply_target_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      featured_books: {
        Row: {
          active: boolean
          book_id: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          book_id: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          book_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "featured_books_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: true
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
        ]
      }
      likes: {
        Row: {
          created_at: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          post_id: string
          user_id?: string
        }
        Update: {
          created_at?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          actor_id: string
          comment_id: string
          created_at: string
          id: string
          post_id: string
          read_at: string | null
          recipient_id: string
          type: string
        }
        Insert: {
          actor_id: string
          comment_id: string
          created_at?: string
          id?: string
          post_id: string
          read_at?: string | null
          recipient_id: string
          type: string
        }
        Update: {
          actor_id?: string
          comment_id?: string
          created_at?: string
          id?: string
          post_id?: string
          read_at?: string | null
          recipient_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      post_cards: {
        Row: {
          background: Json | null
          post_id: string
          regions: Json
          template: string
        }
        Insert: {
          background?: Json | null
          post_id: string
          regions?: Json
          template: string
        }
        Update: {
          background?: Json | null
          post_id?: string
          regions?: Json
          template?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_cards_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: true
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_videos: {
        Row: {
          asset_group_id: string | null
          duration_sec: number | null
          hls_path: string | null
          post_id: string
          poster_path: string | null
          renditions: Json | null
          source_type: string
          video_path: string | null
          youtube_id: string | null
        }
        Insert: {
          asset_group_id?: string | null
          duration_sec?: number | null
          hls_path?: string | null
          post_id: string
          poster_path?: string | null
          renditions?: Json | null
          source_type: string
          video_path?: string | null
          youtube_id?: string | null
        }
        Update: {
          asset_group_id?: string | null
          duration_sec?: number | null
          hls_path?: string | null
          post_id?: string
          poster_path?: string | null
          renditions?: Json | null
          source_type?: string
          video_path?: string | null
          youtube_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "post_videos_asset_group_id_fkey"
            columns: ["asset_group_id"]
            isOneToOne: false
            referencedRelation: "video_uploads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_videos_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: true
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          book_id: string
          channel_id: string
          comment_count: number
          created_at: string
          id: string
          like_count: number
          published_at: string | null
          share_count: number
          status: string
          type: string
          view_count: number
        }
        Insert: {
          book_id: string
          channel_id: string
          comment_count?: number
          created_at?: string
          id?: string
          like_count?: number
          published_at?: string | null
          share_count?: number
          status?: string
          type: string
          view_count?: number
        }
        Update: {
          book_id?: string
          channel_id?: string
          comment_count?: number
          created_at?: string
          id?: string
          like_count?: number
          published_at?: string | null
          share_count?: number
          status?: string
          type?: string
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "posts_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          id: string
          nickname: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          id: string
          nickname: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          id?: string
          nickname?: string
        }
        Relationships: []
      }
      reading_progress: {
        Row: {
          book_id: string
          completed_at: string | null
          epub_cfi: string | null
          percent: number
          updated_at: string
          user_id: string
        }
        Insert: {
          book_id: string
          completed_at?: string | null
          epub_cfi?: string | null
          percent?: number
          updated_at?: string
          user_id?: string
        }
        Update: {
          book_id?: string
          completed_at?: string | null
          epub_cfi?: string | null
          percent?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reading_progress_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reading_progress_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          comment_id: string
          created_at: string
          id: string
          reason: string
          reporter_id: string
          status: string
        }
        Insert: {
          comment_id: string
          created_at?: string
          id?: string
          reason: string
          reporter_id?: string
          status?: string
        }
        Update: {
          comment_id?: string
          created_at?: string
          id?: string
          reason?: string
          reporter_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      video_uploads: {
        Row: {
          created_at: string
          created_by: string
          id: string
          manifest: Json
          public_base: string
          status: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          manifest: Json
          public_base: string
          status?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          manifest?: Json
          public_base?: string
          status?: string
        }
        Relationships: []
      }
      view_logs: {
        Row: {
          created_at: string
          id: number
          post_id: string
          session_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: never
          post_id: string
          session_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: never
          post_id?: string
          session_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "view_logs_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "view_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      wikisource_works: {
        Row: {
          author: string | null
          author_born: number | null
          author_died: number | null
          author_is_korean: boolean | null
          author_is_north_korean: boolean | null
          genre: string
          page_title: string
          pd_tag: string
          pub_year: number | null
          synced_at: string
          title: string
          translator: string | null
        }
        Insert: {
          author?: string | null
          author_born?: number | null
          author_died?: number | null
          author_is_korean?: boolean | null
          author_is_north_korean?: boolean | null
          genre: string
          page_title: string
          pd_tag: string
          pub_year?: number | null
          synced_at?: string
          title: string
          translator?: string | null
        }
        Update: {
          author?: string | null
          author_born?: number | null
          author_died?: number | null
          author_is_korean?: boolean | null
          author_is_north_korean?: boolean | null
          genre?: string
          page_title?: string
          pd_tag?: string
          pub_year?: number | null
          synced_at?: string
          title?: string
          translator?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_write_video_bundle: {
        Args: { object_name: string }
        Returns: boolean
      }
      claim_video_cleanup: { Args: { p_id: string }; Returns: boolean }
      get_feed_v4: {
        Args: {
          p_cursor?: string
          p_cursor_id?: string
          p_limit?: number
          p_seed: string
          p_session_id?: string
          p_type?: string
        }
        Returns: {
          cursor_token: string
          id: string
        }[]
      }
      get_trending_posts: {
        Args: { p_days?: number; p_limit?: number }
        Returns: {
          post_id: string
          recent_views: number
        }[]
      }
      is_admin: { Args: never; Returns: boolean }
      is_admin_owner: { Args: never; Returns: boolean }
      record_share: { Args: { p_post_id: string }; Returns: undefined }
      record_view: {
        Args: { p_post_id: string; p_session_id: string }
        Returns: undefined
      }
      save_book_trailer: {
        Args: {
          p_book_id: string
          p_source: string
          p_upload_id?: string
          p_youtube_id?: string
        }
        Returns: undefined
      }
      save_video_post: {
        Args: {
          p_book_id: string
          p_channel_id: string
          p_id: string
          p_publish: boolean
          p_source: string
          p_upload_id?: string
          p_youtube_id?: string
        }
        Returns: string
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      track_event: {
        Args: {
          p_book_id?: string
          p_event: string
          p_post_id?: string
          p_props?: Json
          p_session_id?: string
        }
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

