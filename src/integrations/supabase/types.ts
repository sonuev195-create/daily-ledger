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
      advance_purposes: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      batches: {
        Row: {
          batch_number: string | null
          created_at: string
          expiry_date: string | null
          id: string
          item_id: string
          primary_quantity: number
          purchase_date: string
          purchase_rate: number
          secondary_quantity: number
        }
        Insert: {
          batch_number?: string | null
          created_at?: string
          expiry_date?: string | null
          id?: string
          item_id: string
          primary_quantity?: number
          purchase_date?: string
          purchase_rate?: number
          secondary_quantity?: number
        }
        Update: {
          batch_number?: string | null
          created_at?: string
          expiry_date?: string | null
          id?: string
          item_id?: string
          primary_quantity?: number
          purchase_date?: string
          purchase_rate?: number
          secondary_quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "batches_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      bill_format_config: {
        Row: {
          amount_column: number
          bill_type: string
          config_name: string
          created_at: string
          has_amount: boolean
          has_rate: boolean
          id: string
          item_name_column: number
          quantity_column: number
          quantity_type: string
          rate_column: number | null
          total_columns: number
          updated_at: string
        }
        Insert: {
          amount_column?: number
          bill_type?: string
          config_name?: string
          created_at?: string
          has_amount?: boolean
          has_rate?: boolean
          id?: string
          item_name_column?: number
          quantity_column?: number
          quantity_type?: string
          rate_column?: number | null
          total_columns?: number
          updated_at?: string
        }
        Update: {
          amount_column?: number
          bill_type?: string
          config_name?: string
          created_at?: string
          has_amount?: boolean
          has_rate?: boolean
          id?: string
          item_name_column?: number
          quantity_column?: number
          quantity_type?: string
          rate_column?: number | null
          total_columns?: number
          updated_at?: string
        }
        Relationships: []
      }
      bill_items: {
        Row: {
          batch_id: string | null
          bill_id: string | null
          id: string
          item_id: string | null
          item_name: string
          primary_quantity: number
          rate: number
          secondary_quantity: number
          total_amount: number
        }
        Insert: {
          batch_id?: string | null
          bill_id?: string | null
          id?: string
          item_id?: string | null
          item_name: string
          primary_quantity?: number
          rate?: number
          secondary_quantity?: number
          total_amount?: number
        }
        Update: {
          batch_id?: string | null
          bill_id?: string | null
          id?: string
          item_id?: string | null
          item_name?: string
          primary_quantity?: number
          rate?: number
          secondary_quantity?: number
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "bill_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bill_items_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bill_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      bills: {
        Row: {
          bill_number: string | null
          bill_type: string | null
          created_at: string
          customer_name: string | null
          delivered_date: string | null
          id: string
          image_url: string | null
          supplier_name: string | null
          total_amount: number
          transaction_id: string | null
        }
        Insert: {
          bill_number?: string | null
          bill_type?: string | null
          created_at?: string
          customer_name?: string | null
          delivered_date?: string | null
          id?: string
          image_url?: string | null
          supplier_name?: string | null
          total_amount?: number
          transaction_id?: string | null
        }
        Update: {
          bill_number?: string | null
          bill_type?: string | null
          created_at?: string
          customer_name?: string | null
          delivered_date?: string | null
          id?: string
          image_url?: string | null
          supplier_name?: string | null
          total_amount?: number
          transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bills_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          batch_preference: string
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          batch_preference?: string
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          batch_preference?: string
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      customers: {
        Row: {
          address: string | null
          advance_balance: number
          created_at: string
          due_balance: number
          id: string
          name: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          advance_balance?: number
          created_at?: string
          due_balance?: number
          id?: string
          name: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          advance_balance?: number
          created_at?: string
          due_balance?: number
          id?: string
          name?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      drawer_closings: {
        Row: {
          actual_cash: number
          cash_to_home: number
          created_at: string
          date: string
          difference: number
          expected_cash: number
          id: string
          manual_cash: number
          manual_coin: number
          notes: string | null
          system_bank: number
          system_cash: number
          system_upi: number
        }
        Insert: {
          actual_cash?: number
          cash_to_home?: number
          created_at?: string
          date: string
          difference?: number
          expected_cash?: number
          id?: string
          manual_cash?: number
          manual_coin?: number
          notes?: string | null
          system_bank?: number
          system_cash?: number
          system_upi?: number
        }
        Update: {
          actual_cash?: number
          cash_to_home?: number
          created_at?: string
          date?: string
          difference?: number
          expected_cash?: number
          id?: string
          manual_cash?: number
          manual_coin?: number
          notes?: string | null
          system_bank?: number
          system_cash?: number
          system_upi?: number
        }
        Relationships: []
      }
      drawer_openings: {
        Row: {
          bank: number
          cash: number
          created_at: string
          date: string
          home_advance: number
          id: string
          shop_cash: number
          shop_coin: number
          upi: number
        }
        Insert: {
          bank?: number
          cash?: number
          created_at?: string
          date: string
          home_advance?: number
          id?: string
          shop_cash?: number
          shop_coin?: number
          upi?: number
        }
        Update: {
          bank?: number
          cash?: number
          created_at?: string
          date?: string
          home_advance?: number
          id?: string
          shop_cash?: number
          shop_coin?: number
          upi?: number
        }
        Relationships: []
      }
      employees: {
        Row: {
          advance_balance: number
          created_at: string
          id: string
          name: string
          phone: string | null
          role: string | null
          salary: number
          updated_at: string
        }
        Insert: {
          advance_balance?: number
          created_at?: string
          id?: string
          name: string
          phone?: string | null
          role?: string | null
          salary?: number
          updated_at?: string
        }
        Update: {
          advance_balance?: number
          created_at?: string
          id?: string
          name?: string
          phone?: string | null
          role?: string | null
          salary?: number
          updated_at?: string
        }
        Relationships: []
      }
      exchanges: {
        Row: {
          amount: number
          created_at: string
          date: string
          from_mode: string
          id: string
          reference: string | null
          to_mode: string
        }
        Insert: {
          amount: number
          created_at?: string
          date?: string
          from_mode: string
          id?: string
          reference?: string | null
          to_mode: string
        }
        Update: {
          amount?: number
          created_at?: string
          date?: string
          from_mode?: string
          id?: string
          reference?: string | null
          to_mode?: string
        }
        Relationships: []
      }
      expense_categories: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      home_categories: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      items: {
        Row: {
          batch_preference: string
          category_id: string | null
          conversion_rate: number | null
          conversion_type: string
          created_at: string
          id: string
          name: string
          paper_bill_name: string | null
          secondary_unit: string | null
          selling_price: number
          updated_at: string
        }
        Insert: {
          batch_preference?: string
          category_id?: string | null
          conversion_rate?: number | null
          conversion_type?: string
          created_at?: string
          id?: string
          name: string
          paper_bill_name?: string | null
          secondary_unit?: string | null
          selling_price?: number
          updated_at?: string
        }
        Update: {
          batch_preference?: string
          category_id?: string | null
          conversion_rate?: number | null
          conversion_type?: string
          created_at?: string
          id?: string
          name?: string
          paper_bill_name?: string | null
          secondary_unit?: string | null
          selling_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      salary_categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      suppliers: {
        Row: {
          address: string | null
          balance: number
          created_at: string
          id: string
          name: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          balance?: number
          created_at?: string
          id?: string
          name: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          balance?: number
          created_at?: string
          id?: string
          name?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      transactions: {
        Row: {
          adjusted_from_sales: number | null
          advance_purpose_id: string | null
          advance_rate: number | null
          amount: number
          bill_number: string | null
          bill_type: string | null
          created_at: string
          customer_id: string | null
          customer_name: string | null
          date: string
          due: number | null
          employee_id: string | null
          expense_category_id: string | null
          give_back: Json | null
          home_category_id: string | null
          id: string
          overpayment: number | null
          payments: Json
          reference: string | null
          salary_category_id: string | null
          section: string
          supplier_id: string | null
          supplier_name: string | null
          type: string
          updated_at: string
          welder_id: string | null
        }
        Insert: {
          adjusted_from_sales?: number | null
          advance_purpose_id?: string | null
          advance_rate?: number | null
          amount?: number
          bill_number?: string | null
          bill_type?: string | null
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          date?: string
          due?: number | null
          employee_id?: string | null
          expense_category_id?: string | null
          give_back?: Json | null
          home_category_id?: string | null
          id?: string
          overpayment?: number | null
          payments?: Json
          reference?: string | null
          salary_category_id?: string | null
          section: string
          supplier_id?: string | null
          supplier_name?: string | null
          type: string
          updated_at?: string
          welder_id?: string | null
        }
        Update: {
          adjusted_from_sales?: number | null
          advance_purpose_id?: string | null
          advance_rate?: number | null
          amount?: number
          bill_number?: string | null
          bill_type?: string | null
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          date?: string
          due?: number | null
          employee_id?: string | null
          expense_category_id?: string | null
          give_back?: Json | null
          home_category_id?: string | null
          id?: string
          overpayment?: number | null
          payments?: Json
          reference?: string | null
          salary_category_id?: string | null
          section?: string
          supplier_id?: string | null
          supplier_name?: string | null
          type?: string
          updated_at?: string
          welder_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_advance_purpose_id_fkey"
            columns: ["advance_purpose_id"]
            isOneToOne: false
            referencedRelation: "advance_purposes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_expense_category_id_fkey"
            columns: ["expense_category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_home_category_id_fkey"
            columns: ["home_category_id"]
            isOneToOne: false
            referencedRelation: "home_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_salary_category_id_fkey"
            columns: ["salary_category_id"]
            isOneToOne: false
            referencedRelation: "salary_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_welder_id_fkey"
            columns: ["welder_id"]
            isOneToOne: false
            referencedRelation: "welders"
            referencedColumns: ["id"]
          },
        ]
      }
      welders: {
        Row: {
          created_at: string
          id: string
          name: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          phone?: string | null
          updated_at?: string
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
