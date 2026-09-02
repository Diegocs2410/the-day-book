/**
 * Database row types.
 *
 * These are `type` aliases rather than `interface`s, and that is load-bearing.
 * supabase-js constrains a schema's rows to `Record<string, unknown>`; a type
 * alias gets an implicit index signature and satisfies it, an interface does
 * not. When the constraint fails, the client does not error at the definition
 * — every query silently resolves to `never`, and the errors land in a dozen
 * unrelated files instead.
 *
 * Hand-written rather than generated, and kept deliberately small: only the
 * tables and columns this app actually touches. `supabase gen types` would
 * produce a much larger file, but it needs a running database, and a type
 * definition that can only be regenerated with Docker running is a poor thing
 * to put between a reviewer and `npm run typecheck`.
 *
 * If this drifts from the schema, the integration tests and pgTAP catch it —
 * they run against real Postgres.
 */

export type UserRole = "seller" | "buyer";
export type ShowingStatus = "pending" | "confirmed" | "canceled";

export type ProfileRow = {
  id: string;
  role: UserRole;
  full_name: string;
  timezone: string;
  created_at: string;
};

export type ListingRow = {
  id: string;
  seller_id: string;
  address: string;
  city: string;
  state: string;
  timezone: string;
  price_cents: number;
  bedrooms: number;
  bathrooms: number;
  square_feet: number;
  description: string;
  photo_url: string | null;
  is_published: boolean;
  slot_minutes: number;
  buffer_minutes: number;
  booking_window_days: number;
  min_notice_minutes: number;
  created_at: string;
};

export type ShowingWindowRow = {
  id: string;
  listing_id: string;
  day_of_week: number;
  start_minute: number;
  end_minute: number;
};

export type BlackoutDateRow = {
  id: string;
  listing_id: string;
  blackout_date: string;
  reason: string;
};

export type ShowingRow = {
  id: string;
  listing_id: string;
  buyer_id: string;
  starts_at: string;
  ends_at: string;
  status: ShowingStatus;
  buyer_note: string;
  created_at: string;
};

type Table<Row, Insert = Partial<Row>, Update = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export interface Database {
  public: {
    Tables: {
      profiles: Table<ProfileRow>;
      listings: Table<ListingRow>;
      showing_windows: Table<ShowingWindowRow>;
      blackout_dates: Table<BlackoutDateRow>;
      showings: Table<ShowingRow>;
    };
    Views: {
      /**
       * Booked intervals with no buyer identity attached. Readable by anyone,
       * which is what lets a signed-out visitor search.
       */
      listing_busy_times: {
        Row: {
          listing_id: string;
          starts_at: string;
          ends_at: string;
        };
        Relationships: [];
      };
    };
    // `{ [_ in never]: never }` rather than `Record<string, never>`: the
    // latter does not satisfy supabase-js's `Record<string, GenericView>`
    // constraint, and when the schema fails that constraint every query
    // silently degrades to `never` instead of erroring where the mistake is.
    Functions: { [_ in never]: never };
    Enums: {
      user_role: UserRole;
      showing_status: ShowingStatus;
    };
    CompositeTypes: { [_ in never]: never };
  };
}

/** A listing with everything the scheduling engine needs, in one object. */
export interface ListingWithSchedule extends ListingRow {
  showing_windows: ShowingWindowRow[];
  blackout_dates: BlackoutDateRow[];
}
