export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading" className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 pt-8">
      <div className="skeleton h-9 w-2/3" />
      <div className="skeleton h-5 w-1/2" />
      <div className="mt-6 skeleton h-20 w-full" />
      <div className="skeleton h-20 w-full" />
    </div>
  );
}
