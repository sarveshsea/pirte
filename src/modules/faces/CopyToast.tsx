import { KAOMOJI_FONT } from './FaceTile'

type Props = {
  face: string | null
}

export default function CopyToast({ face }: Props) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={[
        'pointer-events-none absolute bottom-12 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap',
        'rounded-full bg-black/85 px-4 py-2 text-[12px] text-white shadow-xl ring-1 ring-white/10 backdrop-blur-md',
        'transition-all duration-200',
        face ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2',
      ].join(' ')}
      style={{ fontFamily: KAOMOJI_FONT }}
    >
      {face ? (
        <>copied · <span className="font-bold">{face}</span></>
      ) : (
        // keep DOM stable so aria-live doesn't re-announce on mount
        <span aria-hidden>&nbsp;</span>
      )}
    </div>
  )
}
