export function CategoryBadge({ categoria }: { categoria: string }) {
  return (
    <span className="inline-flex w-[112px] items-center justify-center rounded-full border border-outline-variant bg-surface-container-low px-2.5 py-1 text-label-md font-bold text-on-surface-variant">
      {categoria}
    </span>
  )
}
