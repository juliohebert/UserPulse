interface Props {
  value: number | null
  onChange: (n: number) => void
  // Cor principal do sistema (aparência do widget). Quando informada, o
  // botão selecionado usa exatamente esse tom — mesmo comportamento do
  // .up-score-active (var(--up-primary)) no widget real. Sem ela, mantém a
  // cor primária do admin (fallback histórico da simulação).
  cor?: string
}

export function NpsScale({ value, onChange, cor }: Props) {
  return (
    <div>
      <div className="flex justify-between gap-1">
        {Array.from({ length: 11 }, (_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onChange(i)}
            style={value === i && cor ? { backgroundColor: cor, borderColor: cor, color: '#fff' } : undefined}
            className={`flex-1 h-8 min-w-0 rounded-lg border text-[11px] font-bold transition-all hover:-translate-y-0.5 ${
              value === i
                ? 'bg-primary text-on-primary border-primary'
                : 'border-outline-variant text-on-surface-variant hover:bg-primary-fixed hover:border-primary hover:text-primary'
            }`}
          >
            {i}
          </button>
        ))}
      </div>
      <div className="flex justify-between mt-1.5 px-0.5">
        <span className="text-[10px] text-outline uppercase font-bold">Ruim</span>
        <span className="text-[10px] text-outline uppercase font-bold">Excelente</span>
      </div>
    </div>
  )
}
