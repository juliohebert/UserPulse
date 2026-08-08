interface Props {
  icon: string
  iconBg: string
  iconColor: string
  title: string
  description?: string
  number?: number
  action?: React.ReactNode
}

export function CardHeader({ icon, iconBg, iconColor, title, description, number, action }: Props) {
  return (
    <div className="flex items-start justify-between gap-3 mb-4">
      <div className="flex items-start gap-3 min-w-0">
        <span className={`p-2 rounded-xl shrink-0 ${iconBg} ${iconColor}`}>
          <span className="material-symbols-outlined text-[20px]">{icon}</span>
        </span>
        <div className="min-w-0">
          <h3 className="text-title-lg font-semibold text-ink-deep flex items-center gap-2">
            {number != null && (
              <span className="w-6 h-6 rounded-full bg-ink-deep text-white text-label-sm font-bold flex items-center justify-center shrink-0">
                {number}
              </span>
            )}
            {title}
          </h3>
          {description && <p className="text-body-sm text-charcoal mt-1">{description}</p>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}
