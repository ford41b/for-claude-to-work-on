export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading" className="flex flex-col gap-4">
      <div className="skeleton h-4 w-24" />
      <div className="skeleton h-7 w-11/12" />
      <div className="skeleton h-7 w-3/4" />
      <div className="mt-6 skeleton h-4 w-28" />
      <div className="skeleton h-16 w-full" />
      <div className="skeleton h-16 w-full" />
    </div>
  );
}
