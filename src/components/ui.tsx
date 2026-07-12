import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react'
import { ChevronDown, Info } from 'lucide-react'

export function Button({
  variant = 'primary',
  size = 'md',
  icon,
  children,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'quiet' | 'danger'
  size?: 'sm' | 'md'
  icon?: ReactNode
}) {
  return (
    <button className={`button button--${variant} button--${size} ${className}`} {...props}>
      {icon}
      <span>{children}</span>
    </button>
  )
}

export function Card({ className = '', children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <section className={`card ${className}`} {...props}>
      {children}
    </section>
  )
}

export function CardHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <header className="card-header">
      <div className="card-header__copy">
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {action && <div className="card-header__action">{action}</div>}
    </header>
  )
}

export function Badge({
  tone = 'neutral',
  children,
  dot = false,
}: {
  tone?: 'neutral' | 'positive' | 'warning' | 'critical' | 'accent' | 'blue'
  children: ReactNode
  dot?: boolean
}) {
  return (
    <span className={`badge badge--${tone}`}>
      {dot && <span className="badge__dot" aria-hidden="true" />}
      {children}
    </span>
  )
}

export function Metric({
  label,
  value,
  unit,
  detail,
  tone,
}: {
  label: string
  value: ReactNode
  unit?: string
  detail?: ReactNode
  tone?: 'positive' | 'warning' | 'critical' | 'accent'
}) {
  return (
    <div className={`metric ${tone ? `metric--${tone}` : ''}`}>
      <div className="metric__label">{label}</div>
      <div className="metric__value">
        {value}
        {unit && <span>{unit}</span>}
      </div>
      {detail && <div className="metric__detail">{detail}</div>}
    </div>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (value: T) => void
  ariaLabel: string
}) {
  return (
    <div className="segmented" role="group" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={value === option.value ? 'is-active' : ''}
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function Select({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: string
  onChange: (value: string) => void
  options: Array<{ value: string; label: string }>
  ariaLabel: string
}) {
  return (
    <label className="select-control">
      <span className="sr-only">{ariaLabel}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown size={14} aria-hidden="true" />
    </label>
  )
}

export function Progress({
  value,
  tone = 'accent',
  label,
}: {
  value: number
  tone?: 'accent' | 'positive' | 'warning' | 'critical' | 'blue'
  label?: string
}) {
  const normalized = Math.max(0, Math.min(100, value))
  return (
    <div
      className={`progress progress--${tone}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(normalized)}
      aria-label={label}
    >
      <span style={{ transform: `scaleX(${normalized / 100})` }} />
    </div>
  )
}

export function TooltipHint({ children }: { children: ReactNode }) {
  return (
    <span className="tooltip-hint" tabIndex={0} aria-label={String(children)}>
      <Info size={13} aria-hidden="true" />
      <span role="tooltip">{children}</span>
    </span>
  )
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="empty-state">
      <div className="empty-state__icon">{icon}</div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  )
}
