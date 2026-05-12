export default function Spinner({ size = 24 }) {
  return (
    <div className="flex justify-center items-center py-16">
      <div
        style={{ width: size, height: size }}
        className="rounded-full border-[3px] border-slate-200 border-t-amber-500 animate-spin"
      />
    </div>
  )
}
