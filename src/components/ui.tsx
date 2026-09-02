import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

/**
 * The Day Book's control vocabulary.
 *
 * Every control in the product is built from these, so a button in the seller's
 * book and a button in the buyer's search are the same object. Rules do the
 * structural work that borders and shadows would do elsewhere.
 */

type Variant = "ink" | "quiet" | "margin";

const variants: Record<Variant, string> = {
  ink: "bg-[var(--chrome)] text-[var(--chrome-ink)] hover:brightness-125 active:brightness-95",
  quiet:
    "bg-transparent text-[var(--text)] ring-1 ring-[var(--rule-strong)] hover:bg-[var(--surface-sunk)]",
  margin:
    "bg-transparent text-[var(--margin-rule)] ring-1 ring-[var(--margin-rule)] hover:bg-[var(--margin-rule)]/8",
};

export function Button({
  variant = "ink",
  loading = false,
  className = "",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  loading?: boolean;
}) {
  return (
    <button
      {...props}
      disabled={props.disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex items-center justify-center gap-2 rounded-[2px] px-3.5 py-2 text-[0.8125rem] font-600 font-semibold transition-[filter,background-color] duration-150 disabled:cursor-not-allowed disabled:opacity-45 ${variants[variant]} ${className}`}
    >
      {loading && (
        <span
          aria-hidden
          className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-current border-t-transparent"
        />
      )}
      {children}
    </button>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="colhead mb-1 block">{label}</span>
      {children}
      {error ? (
        <span className="mt-1 block text-[0.75rem]" style={{ color: "var(--margin-rule)" }}>
          {error}
        </span>
      ) : hint ? (
        <span className="mt-1 block text-[0.75rem]" style={{ color: "var(--text-faint)" }}>
          {hint}
        </span>
      ) : null}
    </label>
  );
}

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-[2px] border-0 border-b bg-transparent px-1 py-1.5 text-[0.875rem] text-[var(--text)] outline-none transition-colors duration-150 placeholder:text-[var(--text-faint)] focus:border-[var(--stamp)] ${className}`}
      style={{ borderBottomWidth: 1, borderColor: "var(--rule-strong)", ...props.style }}
    />
  );
}

/** A ledger block: ruled paper with the red margin down its left edge. */
export function Ledger({
  title,
  action,
  children,
  className = "",
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={className}>
      {(title || action) && (
        <header
          className="mb-3 flex items-baseline justify-between gap-4 border-b pb-2"
          style={{ borderColor: "var(--rule-strong)" }}
        >
          {title && <h2 className="colhead">{title}</h2>}
          {action}
        </header>
      )}
      <div className="ledger-margin">{children}</div>
    </section>
  );
}

/**
 * An empty state that teaches the interface rather than announcing absence.
 * "No listings" tells a seller nothing they did not already know.
 */
export function Empty({ headline, body, action }: { headline: string; body: string; action?: ReactNode }) {
  return (
    <div className="py-10 text-center">
      <p className="text-[0.9375rem] font-semibold">{headline}</p>
      <p
        className="mx-auto mt-1.5 max-w-[46ch] text-[0.8125rem]"
        style={{ color: "var(--text-soft)" }}
      >
        {body}
      </p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function Stamp({ children }: { children: ReactNode }) {
  return <span className="stamp">{children}</span>;
}
