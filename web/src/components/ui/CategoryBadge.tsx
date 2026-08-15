export function CategoryBadge({ categoria }: { categoria: string }) {
  return (
    <span className="inline-flex w-[112px] items-center justify-center rounded-full border border-[#ced0d4] bg-white px-2.5 py-1 text-label-md font-bold text-on-surface">
      {categoria}
    </span>
  )
}
